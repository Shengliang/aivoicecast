// [FORCE-SYNC-v3.11.0] Timestamp: ${new Date().toISOString()}
import { GoogleGenAI } from '@google/genai';
import { base64ToBytes, decodeAudioData } from '../utils/audioUtils';
import { getCachedAudioBuffer, cacheAudioBuffer } from '../utils/db';

export type TtsErrorType = 'none' | 'quota' | 'network' | 'unknown';

export interface TtsResult {
  buffer: AudioBuffer | null;
  errorType: TtsErrorType;
  errorMessage?: string;
}

const USAGE_KEY = 'tts_daily_usage';

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

  // 3. Start Process (Check DB -> Call API)
  const requestPromise = (async (): Promise<TtsResult> => {
    try {
      // 3a. Check Persistent Cache (IndexedDB)
      const cachedArrayBuffer = await getCachedAudioBuffer(cacheKey);
      if (cachedArrayBuffer) {
        // Decode logic requires a copy in some browsers if buffer is detached, 
        // but IDB returns a fresh buffer so we are good.
        const audioBuffer = await decodeAudioData(new Uint8Array(cachedArrayBuffer), audioContext);
        memoryCache.set(cacheKey, audioBuffer);
        return { buffer: audioBuffer, errorType: 'none' };
      }

      // Initialize client inside function to pick up latest API Key
      const apiKey = localStorage.getItem('gemini_api_key') || process.env.API_KEY || '';
      if (!apiKey) {
        console.warn("API Key missing, cannot synthesize speech");
        return { buffer: null, errorType: 'unknown', errorMessage: 'API Key missing' };
      }
      const ai = new GoogleGenAI({ apiKey });

      // 3b. Call Gemini API with Timeout
      // Create a timeout promise that rejects after 30 seconds (increased from 10s)
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("TTS Timeout (30s) - Network slow or API busy")), 30000)
      );

      const apiCallPromise = ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: cleanText }] }],
        config: {
          responseModalities: ['AUDIO'] as any, 
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName },
            },
          },
        },
      });

      // Race the API call against the timeout
      const response = await Promise.race([apiCallPromise, timeoutPromise]);

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      
      if (!base64Audio) {
        console.warn("No audio data received from Gemini TTS");
        return { buffer: null, errorType: 'unknown', errorMessage: 'Empty response from API' };
      }

      const audioBytes = base64ToBytes(base64Audio);
      
      // 3c. Save to Persistent Cache (IndexedDB)
      await cacheAudioBuffer(cacheKey, audioBytes.buffer);

      // Track usage on success
      incrementDailyTtsUsage();

      // 3d. Decode for playback
      const audioBuffer = await decodeAudioData(audioBytes, audioContext);
      
      // Save to Memory Cache
      memoryCache.set(cacheKey, audioBuffer);
      
      return { buffer: audioBuffer, errorType: 'none' };
    } catch (error: any) {
      console.error("TTS Generation Error:", error);
      
      let errorType: TtsErrorType = 'unknown';
      const msg = error.message || error.toString();
      
      if (msg.includes('429') || msg.includes('quota') || msg.includes('exhausted') || msg.includes('limit')) {
          errorType = 'quota';
      } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch') || msg.includes('offline')) {
          errorType = 'network';
      }

      return { buffer: null, errorType, errorMessage: msg };
    } finally {
      // CRITICAL: Always clean up the pending request map, 
      // even if the API timed out or failed. 
      // This prevents subsequent retries from getting stuck on a dead promise.
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, requestPromise);
  return requestPromise;
}