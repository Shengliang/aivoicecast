import { GoogleGenAI, Modality } from '@google/genai';
import { base64ToBytes, decodeAudioData } from '../utils/audioUtils';
import { getCachedAudioBuffer, cacheAudioBuffer } from '../utils/db';

export type TtsErrorType = 'none' | 'quota' | 'network' | 'unknown' | 'auth';

export interface TtsResult {
  buffer: AudioBuffer | null;
  errorType: TtsErrorType;
  errorMessage?: string;
}

const memoryCache = new Map<string, AudioBuffer>();
const pendingRequests = new Map<string, Promise<TtsResult>>();

export function cleanTextForTTS(text: string): string {
  return text.replace(/`/g, '');
}

export async function checkAudioCache(text: string, voiceName: string): Promise<boolean> {
  const cacheKey = `${voiceName}:${cleanTextForTTS(text)}`;
  if (memoryCache.has(cacheKey)) return true;
  const inDb = await getCachedAudioBuffer(cacheKey);
  return !!inDb;
}

export function clearAudioCache() {
  memoryCache.clear();
  pendingRequests.clear();
}

async function synthesizeGemini(text: string, voice: string): Promise<ArrayBuffer> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text }] }],
        config: {
          // Fix: use Modality enum from SDK
          responseModalities: [Modality.AUDIO], 
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Empty response");
    return base64ToBytes(base64Audio).buffer;
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
      const cachedArrayBuffer = await getCachedAudioBuffer(cacheKey);
      if (cachedArrayBuffer) {
        const audioBuffer = await decodeAudioData(new Uint8Array(cachedArrayBuffer), audioContext);
        memoryCache.set(cacheKey, audioBuffer);
        return { buffer: audioBuffer, errorType: 'none' };
      }

      const rawBuffer = await synthesizeGemini(cleanText, voiceName);
      await cacheAudioBuffer(cacheKey, rawBuffer);
      const audioBuffer = await decodeAudioData(new Uint8Array(rawBuffer), audioContext);
      memoryCache.set(cacheKey, audioBuffer);
      return { buffer: audioBuffer, errorType: 'none' };
    } catch (error: any) {
      return { buffer: null, errorType: 'unknown', errorMessage: error.message };
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, requestPromise);
  return requestPromise;
}