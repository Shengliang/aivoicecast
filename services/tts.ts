
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

const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
const memoryCache = new Map<string, AudioBuffer>();
const pendingRequests = new Map<string, Promise<TtsResult>>();

/**
 * Maps specific gen-lang-client IDs and Names to valid high-quality provider voices.
 * This prevents "Voice Not Found" errors that trigger the system voice fallback.
 */
function getValidVoiceName(voiceName: string, provider: 'gemini' | 'openai'): string {
    // 1. Handle user-provided specific Voice IDs
    const isInterview = voiceName.includes('0648937375') || voiceName === 'Software Interview Voice';
    const isLinux = voiceName.includes('0375218270') || voiceName === 'Linux Kernel Voice';
    const isDefaultGem = voiceName === 'Default Gem' || voiceName.includes('default-gem');

    if (provider === 'openai') {
        if (isInterview) return 'onyx';
        if (isLinux) return 'alloy';
        if (isDefaultGem) return 'nova';
        return OPENAI_VOICES.includes(voiceName.toLowerCase()) ? voiceName.toLowerCase() : 'alloy';
    } else {
        // Gemini Mapping
        if (isInterview) return 'Fenrir';
        if (isLinux) return 'Puck';
        if (isDefaultGem) return 'Zephyr';
        const validGemini = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
        return validGemini.includes(voiceName) ? voiceName : 'Puck';
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
    body: JSON.stringify({ model: "tts-1", input: text, voice: targetVoice }),
  });
  if (!response.ok) throw new Error("OpenAI TTS Error");
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
        // Use provided IDs to detect if cache is OpenAI (MP3) or Gemini (Raw PCM)
        const isOp = OPENAI_VOICES.some(v => voiceName.toLowerCase().includes(v)) 
                  || voiceName.includes('06489') 
                  || voiceName.includes('03752');
                  
        const audioBuffer = isOp 
            ? await audioContext.decodeAudioData(cached.slice(0)) 
            : await decodeRawPcm(new Uint8Array(cached), audioContext, 24000);
        memoryCache.set(cacheKey, audioBuffer);
        return { buffer: audioBuffer, errorType: 'none' };
      }

      let rawBuffer: ArrayBuffer;
      let usedProvider: 'gemini' | 'openai' = 'gemini';

      const openAiKey = localStorage.getItem('openai_api_key') || OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
      const geminiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
      
      // Smart Provider Selection
      if (openAiKey && !geminiKey) {
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
      console.error("TTS Pipeline Error:", error);
      // Ensure system voice fallback doesn't loop forever
      return { buffer: null, errorType: 'unknown', errorMessage: error.message };
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, requestPromise);
  return requestPromise;
}
