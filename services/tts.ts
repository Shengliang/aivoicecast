
// [FORCE-SYNC-v3.63.0] Timestamp: 2025-05-18T13:00:00.000Z
import { GoogleGenAI } from '@google/genai';
import { base64ToBytes, decodeAudioData } from '../utils/audioUtils';
import { getCachedAudioBuffer, cacheAudioBuffer } from '../utils/db';
import { GEMINI_API_KEY, OPENAI_API_KEY } from './private_keys';

export type TtsErrorType = 'none' | 'quota' | 'network' | 'unknown' | 'auth';

export interface TtsResult {
  buffer: AudioBuffer | null;
  errorType: TtsErrorType;
  errorMessage?: string;
  provider?: 'gemini' | 'openai';
}

const USAGE_KEY = 'tts_daily_usage';
const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

// In-memory cache for fast access during the current session
const memoryCache = new Map<string, AudioBuffer>();

// Track in-flight requests
const pendingRequests = new Map<string, Promise<TtsResult>>();

// Helper to clean text for TTS (remove markdown artifacts like backticks)
export function cleanTextForTTS(text: string): string {
  // Remove backticks used for code formatting
  return text.replace(/`/g, '');
}

/**
 * Gets the number of TTS API calls made today (stored locally).
 */
export function getDailyTtsUsage(): number {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw);
    const today = new Date().toISOString().split('T')[0];
    // Reset if date changed
    if (data.date !== today) return 0;
    return data.count || 0;
  } catch (e) {
    return 0;
  }
}

/**
 * Increments the daily TTS usage counter.
 */
function incrementDailyTtsUsage() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const current = getDailyTtsUsage();
    localStorage.setItem(USAGE_KEY, JSON.stringify({ date: today, count: current + 1 }));
  } catch (e) {}
}

/**
 * Checks if audio exists in Memory or IndexedDB cache.
 * Returns true if audio is ready to play immediately.
 */
export async function checkAudioCache(text: string, voiceName: string): Promise<boolean> {
  const cleanText = cleanTextForTTS(text);
  const cacheKey = `${voiceName}:${cleanText}`;
  
  // 1. Check Memory
  if (memoryCache.has(cacheKey)) return true;
  
  // 2. Check DB
  const inDb = await getCachedAudioBuffer(cacheKey);
  return !!inDb;
}

export function clearMemoryCache() {
  memoryCache.clear();
  pendingRequests.clear();
}

// Keep the old name as alias for backward compatibility if needed, though clearMemoryCache is preferred.
export const clearAudioCache = clearMemoryCache;

function isOpenAIVoice(voiceName: string): boolean {
    return OPENAI_VOICES.includes(voiceName.toLowerCase());
}

async function synthesizeOpenAI(text: string, voice: string, apiKey: string): Promise<ArrayBuffer> {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1", // tts-1 is faster, tts-1-hd is higher quality. Using fast for consistency.
      input: text,
      voice: voice.toLowerCase(), // OpenAI expects lowercase
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`OpenAI Error: ${err.error?.message || response.statusText}`);
  }

  return await response.arrayBuffer();
}

async function synthesizeGemini(text: string, voice: string, apiKey: string): Promise<ArrayBuffer> {
    const ai = new GoogleGenAI({ apiKey });
    
    // Create a timeout promise that rejects after 25 seconds
    const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Gemini TTS Timeout (25s)")), 25000)
    );

    const apiCallPromise = ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: text }] }],
        config: {
          responseModalities: ['AUDIO'] as any, 
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
    });

    const response = await Promise.race([apiCallPromise, timeoutPromise]);
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!base64Audio) throw new Error("Empty audio response from Gemini");
    return base64ToBytes(base64Audio).buffer;
}

export async function synthesizeSpeech(
  text: string, 
  voiceName: string, 
  audioContext: AudioContext
): Promise<TtsResult> {
  const cleanText = cleanTextForTTS(text);
  const cacheKey = `${voiceName}:${cleanText}`;
  
  // 1. Check Memory Cache (Fastest)
  if (memoryCache.has(cacheKey)) {
    return { buffer: memoryCache.get(cacheKey)!, errorType: 'none' };
  }

  // 2. Check Pending Requests (Deduplication)
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey)!;
  }

  // 3. Start Process
  const requestPromise = (async (): Promise<TtsResult> => {
    try {
      // 3a. Check Persistent Cache (IndexedDB)
      const cachedArrayBuffer = await getCachedAudioBuffer(cacheKey);
      if (cachedArrayBuffer) {
        let audioBuffer: AudioBuffer;
        
        // Correctly handle decoding based on provider type inferred from voice name
        if (isOpenAIVoice(voiceName)) {
            // OpenAI = MP3 = Native Browser Decode
            audioBuffer = await audioContext.decodeAudioData(cachedArrayBuffer.slice(0));
        } else {
            // Gemini = PCM = Custom Manual Decode
            audioBuffer = await decodeAudioData(new Uint8Array(cachedArrayBuffer), audioContext);
        }

        memoryCache.set(cacheKey, audioBuffer);
        return { buffer: audioBuffer, errorType: 'none' };
      }

      // 3b. Determine Provider & Synthesize
      let rawBuffer: ArrayBuffer;
      let usedProvider: 'gemini' | 'openai' = 'gemini';

      // Check if requested voice is OpenAI
      if (isOpenAIVoice(voiceName)) {
          const openAiKey = localStorage.getItem('openai_api_key') || OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
          if (!openAiKey) {
              return { buffer: null, errorType: 'auth', errorMessage: 'OpenAI API Key missing' };
          }
          usedProvider = 'openai';
          rawBuffer = await synthesizeOpenAI(cleanText, voiceName, openAiKey);
      } else {
          // Default to Gemini
          const geminiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
          if (!geminiKey) {
              return { buffer: null, errorType: 'auth', errorMessage: 'Gemini API Key missing' };
          }
          usedProvider = 'gemini';
          rawBuffer = await synthesizeGemini(cleanText, voiceName, geminiKey);
      }

      // 3c. Save to Persistent Cache (IndexedDB)
      await cacheAudioBuffer(cacheKey, rawBuffer);

      // Track usage on success
      incrementDailyTtsUsage();

      // 3d. Decode for playback
      let audioBuffer: AudioBuffer;
      if (usedProvider === 'openai') {
          // OpenAI returns MP3 -> Use native decode
          audioBuffer = await audioContext.decodeAudioData(rawBuffer.slice(0));
      } else {
          // Gemini returns Raw PCM -> Use manual decode
          audioBuffer = await decodeAudioData(new Uint8Array(rawBuffer), audioContext);
      }
      
      // Save to Memory Cache
      memoryCache.set(cacheKey, audioBuffer);
      
      return { buffer: audioBuffer, errorType: 'none', provider: usedProvider };

    } catch (error: any) {
      console.error("TTS Generation Error:", error);
      
      let errorType: TtsErrorType = 'unknown';
      const msg = error.message || error.toString();
      
      if (msg.includes('429') || msg.includes('quota') || msg.includes('exhausted') || msg.includes('limit')) {
          errorType = 'quota';
      } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch') || msg.includes('offline')) {
          errorType = 'network';
      } else if (msg.includes('Key missing') || msg.includes('Unauthorized') || msg.includes('401')) {
          errorType = 'auth';
      }

      return { buffer: null, errorType, errorMessage: msg };
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, requestPromise);
  return requestPromise;
}
