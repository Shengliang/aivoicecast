
import { Blob as GeminiBlob } from '@google/genai';

let mainAudioContext: AudioContext | null = null;
let mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
let audioBridgeElement: HTMLAudioElement | null = null;
let silentLoopElement: HTMLAudioElement | null = null;

/**
 * GLOBAL AUDIO ATOMIC STATE
 */
let globalAudioVersion: number = 0;
let currentOwner: string | null = null;
let currentStopFn: (() => void) | null = null;

export function getGlobalAudioVersion() {
    return globalAudioVersion;
}

export function getCurrentAudioOwner() {
    return currentOwner;
}

/**
 * Aggressively stops all audio and increments the version counter.
 * This effectively "kills" any pending async callbacks because their 
 * version check will fail.
 */
export function stopAllPlatformAudio(callerName: string = "Global") {
    globalAudioVersion++;
    console.log(`[AUDIO_MUTEX] Stop by ${callerName}. New Version: ${globalAudioVersion}`);

    // 1. Kill System TTS
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }

    // 2. Clear Registered Owner's local cleanup
    if (currentStopFn) {
        try { currentStopFn(); } catch (e) {}
        currentStopFn = null;
    }
    currentOwner = null;

    // 3. Suspend Audio Context if exists to stop immediate buffer processing
    if (mainAudioContext && mainAudioContext.state !== 'suspended') {
        // We don't close it to avoid re-init overhead, just pause it
        // mainAudioContext.suspend(); 
    }
}

/**
 * Claims the lock. Returns a unique version ID for the requester.
 */
export function claimAudioLock(ownerName: string, onStop: () => void): number {
    // Increment version to kill any existing async tasks
    stopAllPlatformAudio(`LockRequest:${ownerName}`);
    
    currentOwner = ownerName;
    currentStopFn = onStop;
    
    return globalAudioVersion;
}

// Added registerAudioOwner as an alias for claimAudioLock to fix import error in geminiLive.ts
export function registerAudioOwner(ownerName: string, onStop: () => void): number {
    return claimAudioLock(ownerName, onStop);
}

// Added coolDownAudioContext to fix import error in geminiLive.ts
export function coolDownAudioContext() {
    if (silentLoopElement) {
        silentLoopElement.pause();
    }
}

export function isVersionValid(version: number): boolean {
    return version === globalAudioVersion;
}

export function getGlobalAudioContext(sampleRate: number = 24000): AudioContext {
  if (!mainAudioContext || mainAudioContext.state === 'closed') {
    mainAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ 
        sampleRate,
        latencyHint: 'playback' 
    });
    mediaStreamDest = mainAudioContext.createMediaStreamDestination();
  }
  
  if (!audioBridgeElement) {
      audioBridgeElement = new Audio();
      audioBridgeElement.id = 'platform-audio-bridge';
      audioBridgeElement.setAttribute('playsinline', 'true');
      audioBridgeElement.setAttribute('autoplay', 'true');
      document.body.appendChild(audioBridgeElement);
  }

  if (mediaStreamDest && audioBridgeElement.srcObject !== mediaStreamDest.stream) {
      audioBridgeElement.srcObject = mediaStreamDest.stream;
  }

  return mainAudioContext;
}

export function connectOutput(source: AudioNode, ctx: AudioContext) {
    source.connect(ctx.destination);
    if (mediaStreamDest) {
        source.connect(mediaStreamDest);
    }
    if (audioBridgeElement && audioBridgeElement.paused) {
        audioBridgeElement.play().catch(() => {});
    }
}

export async function warmUpAudioContext(ctx: AudioContext) {
    if (ctx.state === 'suspended' || (ctx.state as any) === 'interrupted') {
        await ctx.resume();
    }
    
    if (!silentLoopElement) {
        silentLoopElement = new Audio();
        // Silent 1s wav
        silentLoopElement.src = 'data:audio/wav;base64,UklGRigAAABXQVZFRm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAA';
        silentLoopElement.loop = true;
    }
    
    try {
        await silentLoopElement.play();
    } catch(e) {}
}

export function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeRawPcm(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export function createPcmBlob(data: Float32Array): GeminiBlob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return {
    data: btoa(String.fromCharCode(...new Uint8Array(int16.buffer))),
    mimeType: 'audio/pcm;rate=16000',
  };
}

export async function hashString(str: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function pcmToWavBlobUrl(pcmData: Uint8Array, sampleRate: number = 24000): string {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = pcmData.length;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeString = (offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) { view.setUint8(offset + i, string.charCodeAt(i)); }
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint32(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    const pcmDest = new Uint8Array(buffer, 44);
    pcmDest.set(pcmData);
    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
}
