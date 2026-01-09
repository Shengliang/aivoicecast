import { GoogleGenAI, Modality } from '@google/genai';
import { base64ToBytes, decodeRawPcm, getGlobalAudioContext, hashString } from '../utils/audioUtils';
import { getCachedAudioBuffer, cacheAudioBuffer } from '../utils/db';
import { GEMINI_API_KEY, OPENAI_API_KEY } from './private_keys';
import { auth, storage } from './firebaseConfig';

export type TtsErrorType = 'none' | 'quota' | 'network' | 'unknown' | 'auth';

export interface TtsResult {
  buffer: AudioBuffer | null;
  errorType: TtsErrorType;
  errorMessage?: string;
  provider?: 'gemini' | 'openai' | 'system';
}

const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
const memoryCache = new Map<string, AudioBuffer>();
const pendingRequests = new Map<string, Promise<TtsResult>>();

function getValidVoiceName(voiceName: string, provider: 'gemini' | 'openai'): string {
    const name = voiceName.toLowerCase();
    
    const isInterview = name.includes('software interview') || name.includes('0648937375');
    const isKernel = name.includes('linux kernel') || name.includes('0375218270');
    const isDefaultGem = name === 'default gem' || name === 'default-gem' || name === 'zephyr';

    if (provider === 'openai') {
        if (isInterview || isKernel) return 'onyx'; 
        if (isDefaultGem) return 'nova';
        return OPENAI_VOICES.includes(name) ? name : 'alloy';
    } else {
        if (isInterview || isKernel) return 'Fenrir';
        if (isDefaultGem) return 'Zephyr';
        const validGemini = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
        const match = validGemini.find(v => v.toLowerCase() === name);
        return match || 'Zephyr';
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
          responseModalalities: [Modality.AUDIO], 
          speechConfig: { 
            voiceConfig: { 
              prebuiltVoiceConfig: { voiceName: targetVoice } 
            } 
          },
        },
    });
    const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64) throw new Error("Empty Gemini Audio");
    return base64ToBytes(base64).buffer;
}

async function checkCloudCache(cacheKey: string): Promise<ArrayBuffer | null> {
    if (!auth.currentUser) return null;
    try {
        const hash = await hashString(cacheKey);
        const uid = auth.currentUser.uid;
        const cloudPath = `backups/${uid}/audio/${hash}`;
        const url = await storage.ref(cloudPath).getDownloadURL();
        const response = await fetch(url);
        if (response.ok) {
            return await response.arrayBuffer();
        }
    } catch (e) {}
    return null;
}

export async function synthesizeSpeech(
  text: string, 
  voiceName: string, 
  audioContext: AudioContext,
  preferredProvider?: 'gemini' | 'openai' | 'system'
): Promise<TtsResult> {
  const cleanText = cleanTextForTTS(text);
  
  const openAiKey = localStorage.getItem('openai_api_key') || OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
  const usedProvider: 'gemini' | 'openai' | 'system' = (preferredProvider === 'openai' && openAiKey) ? 'openai' : (preferredProvider === 'system' ? 'system' : 'gemini');
  
  const cacheKey = `${usedProvider}:${voiceName}:${cleanText}`;
  
  if (memoryCache.has(cacheKey)) return { buffer: memoryCache.get(cacheKey)!, errorType: 'none' };
  if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey)!;

  const requestPromise = (async (): Promise<TtsResult> => {
    try {
      const cached = await getCachedAudioBuffer(cacheKey);
      if (cached) {
        const audioBuffer = (usedProvider === 'openai') 
            ? await audioContext.decodeAudioData(cached.slice(0)) 
            : await decodeRawPcm(new Uint8Array(cached), audioContext, 24000);
        memoryCache.set(cacheKey, audioBuffer);
        return { buffer: audioBuffer, errorType: 'none', provider: usedProvider };
      }

      if (usedProvider === 'system') {
          return { buffer: null, errorType: 'none', provider: 'system' };
      }

      const cloudBuffer = await checkCloudCache(cacheKey);
      if (cloudBuffer) {
          await cacheAudioBuffer(cacheKey, cloudBuffer);
          const audioBuffer = (usedProvider === 'openai') 
            ? await audioContext.decodeAudioData(cloudBuffer.slice(0)) 
            : await decodeRawPcm(new Uint8Array(cloudBuffer), audioContext, 24000);
          memoryCache.set(cacheKey, audioBuffer);
          return { buffer: audioBuffer, errorType: 'none', provider: usedProvider };
      }

      let rawBuffer: ArrayBuffer;

      if (usedProvider === 'openai') {
          rawBuffer = await synthesizeOpenAI(cleanText, voiceName, openAiKey);
      } else {
          rawBuffer = await synthesizeGemini(cleanText, voiceName);
      }

      await cacheAudioBuffer(cacheKey, rawBuffer);
      const audioBuffer = (usedProvider === 'openai') 
          ? await audioContext.decodeAudioData(rawBuffer.slice(0)) 
          : await decodeRawPcm(new Uint8Array(rawBuffer), audioContext, 24000);
      
      memoryCache.set(cacheKey, audioBuffer);
      return { buffer: audioBuffer, errorType: 'none', provider: usedProvider };
    } catch (error: any) {
      console.error("TTS Pipeline Error:", error);
      return { buffer: null, errorType: 'unknown', errorMessage: error.message };
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, requestPromise);
  return requestPromise;
}
