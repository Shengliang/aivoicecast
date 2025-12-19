
import { GoogleGenAI, Modality } from '@google/genai';
import { base64ToBytes, decodeRawPcm, getGlobalAudioContext } from '../utils/audioUtils';
import { getCachedAudioBuffer, cacheAudioBuffer } from '../utils/db';
import { GEMINI_API_KEY, OPENAI_API_KEY } from './private_keys';

export type TtsErrorType = 'none' | 'quota' | 'network' | 'unknown' | 'auth';

export interface TtsResult {
  buffer: AudioBuffer | null;
  errorType: TtsErrorType;
  errorMessage?: string;
  provider?: 'gemini' | 'openai';
}

const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'Software Interview Voice', 'Linux Kernel Voice', 'Default Gem'];
const memoryCache = new Map<string, AudioBuffer>();
const pendingRequests = new Map<string, Promise<TtsResult>>();

/**
 * Maps complex UI/Client IDs to valid provider voice names
 */
function getValidVoiceName(voiceName: string, provider: 'gemini' | 'openai'): string {
    // Handling specific IDs provided by user
    const isInterview = voiceName.includes('0648937375') || voiceName.includes('Software Interview');
    const isLinux = voiceName.includes('0375218270') || voiceName.includes('Linux Kernel');
    const isGem = voiceName === 'Default Gem';

    if (provider === 'openai') {
        if (isInterview) return 'Onyx';
        if (isLinux) return 'Alloy';
        if (isGem) return 'Nova';
        // Fallback for standard OpenAI names
        return ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].includes(voiceName.toLowerCase()) ? voiceName : 'Alloy';
    } else {
        // Gemini Mapping
        if (isInterview) return 'Fenrir';
        if (isLinux) return 'Puck';
        if (isGem) return 'Zephyr';
        // Default Gemini voices
        return ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].includes(voiceName) ? voiceName : 'Puck';
    }
}

export function cleanTextForTTS(text: string): string {
  return text.replace(/`/g, '');
}

export function clearMemoryCache() {
  memoryCache.clear();
  pendingRequests.clear();
}
export const clearAudioCache = clearMemoryCache;

async function synthesizeOpenAI(text: string, voice: string, apiKey: string): Promise<ArrayBuffer> {
  const targetVoice = getValidVoiceName(voice, 'openai');
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "tts-1", input: text, voice: targetVoice.toLowerCase() }),
  });
  if (!response.ok) throw new Error("OpenAI Error");
  return await response.arrayBuffer();
}

async function synthesizeGemini(text: string, voice: string): Promise<ArrayBuffer> {
    const targetVoice = getValidVoiceName(voice, 'gemini');
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO], 
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: targetVoice } } },
        },
    });
    const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64) throw new Error("Empty Gemini Audio");
    return base64ToBytes(base64).buffer;
}

export async function synthesizeSpeech(
  text: string, 
  voiceName: string, 
  audioContext: AudioContext
): Promise<TtsResult> {
  const cleanText = cleanTextForTTS(text);
  const cacheKey = `${voiceName}:${cleanText}`;
  
  if (memoryCache.has(cacheKey)) return { buffer: memoryCache.get(cacheKey)!, errorType: 'none' };
  if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey)!;

  const requestPromise = (async (): Promise<TtsResult> => {
    try {
      const cached = await getCachedAudioBuffer(cacheKey);
      if (cached) {
        // Detect if cached buffer is compressed (OpenAI) or raw PCM (Gemini)
        // Simple heuristic: if voiceName matches known OpenAI names or was stored as such
        const isOp = OPENAI_VOICES.some(v => voiceName.includes(v));
        const audioBuffer = isOp 
            ? await audioContext.decodeAudioData(cached.slice(0)) 
            : await decodeRawPcm(new Uint8Array(cached), audioContext, 24000);
        memoryCache.set(cacheKey, audioBuffer);
        return { buffer: audioBuffer, errorType: 'none' };
      }

      let rawBuffer: ArrayBuffer;
      let usedProvider: 'gemini' | 'openai' = 'gemini';

      const openAiKey = localStorage.getItem('openai_api_key') || OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
      const isForcedOpenAi = OPENAI_VOICES.some(v => voiceName.includes(v));

      if (isForcedOpenAi && openAiKey) {
          usedProvider = 'openai';
          rawBuffer = await synthesizeOpenAI(cleanText, voiceName, openAiKey);
      } else {
          usedProvider = 'gemini';
          rawBuffer = await synthesizeGemini(cleanText, voiceName);
      }

      await cacheAudioBuffer(cacheKey, rawBuffer);
      
      const audioBuffer = usedProvider === 'openai' 
          ? await audioContext.decodeAudioData(rawBuffer.slice(0)) 
          : await decodeRawPcm(new Uint8Array(rawBuffer), audioContext, 24000);
      
      memoryCache.set(cacheKey, audioBuffer);
      return { buffer: audioBuffer, errorType: 'none', provider: usedProvider };
    } catch (error: any) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
      }
      return { buffer: null, errorType: 'unknown', errorMessage: error.message };
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, requestPromise);
  return requestPromise;
}
