
import { Blob as GeminiBlob } from '@google/genai';

let mainAudioContext: AudioContext | null = null;
let mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
let audioBridgeElement: HTMLAudioElement | null = null;
let silentLoopElement: HTMLAudioElement | null = null;

/**
 * GLOBAL AUDIO AUDIT & MUTEX
 */
export interface AudioEvent {
    timestamp: number;
    source: string;
    action: 'REGISTER' | 'STOP' | 'PLAY_BUFFER' | 'PLAY_SYSTEM' | 'ERROR' | 'ABORT_STALE';
    details?: string;
}

let audioAuditLogs: AudioEvent[] = [];
let currentOwnerToken: string | null = null;
let currentStopFn: (() => void) | null = null;

export function getAudioAuditLogs() {
    return audioAuditLogs;
}

export function logAudioEvent(source: string, action: AudioEvent['action'], details?: string) {
    const event = { timestamp: Date.now(), source, action, details };
    audioAuditLogs = [event, ...audioAuditLogs].slice(0, 50);
    console.log(`[AUDIO_DEBUG] ${source}: ${action} ${details || ''}`);
    window.dispatchEvent(new CustomEvent('audio-audit-updated', { detail: event }));
}

export function getCurrentAudioOwner() {
    return currentOwnerToken;
}

/**
 * Hard kill for all platform audio.
 * Resets the global lock.
 */
export function stopAllPlatformAudio(sourceCaller: string = "Global") {
    logAudioEvent(sourceCaller, 'STOP', `Clearing lock. Current owner: ${currentOwnerToken}`);
    
    // 1. Purge System Voice
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        try {
            const dummy = new SpeechSynthesisUtterance("");
            dummy.volume = 0;
            window.speechSynthesis.speak(dummy);
            window.speechSynthesis.cancel();
        } catch (e) {}
    }

    // 2. Kill the Media Bridge physically
    if (audioBridgeElement) {
        audioBridgeElement.pause();
        audioBridgeElement.srcObject = null;
    }

    // 3. Trigger the specific stop logic of the registered owner
    if (currentStopFn) {
        const fn = currentStopFn;
        currentStopFn = null; 
        try { fn(); } catch (e) {}
    }
    
    currentOwnerToken = null;
}

/**
 * Register a unique ownership token.
 * If someone else has the lock, it triggers their stop function first.
 */
export function registerAudioOwner(uniqueToken: string, stopFn: () => void) {
    // If someone else has the lock, kill them first
    if (currentOwnerToken && currentOwnerToken !== uniqueToken) {
        stopAllPlatformAudio(`Auto-reset for ${uniqueToken}`);
    }
    
    currentOwnerToken = uniqueToken;
    currentStopFn = stopFn;
    logAudioEvent(uniqueToken, 'REGISTER', "Acquired Exclusive Lock");
}

export function isAudioOwner(token: string): boolean {
    return currentOwnerToken === token;
}

export function getGlobalAudioContext(sampleRate: number = 24000): AudioContext {
  if (!mainAudioContext || mainAudioContext.state === 'closed') {
    mainAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ 
        sampleRate,
        latencyHint: 'playback' 
    });
    
    mediaStreamDest = mainAudioContext.createMediaStreamDestination();
  }
  
  // Always ensure bridge is attached when context is requested
  if (!audioBridgeElement) {
      audioBridgeElement = new Audio();
      audioBridgeElement.id = 'web-audio-bg-bridge';
      audioBridgeElement.muted = false;
      audioBridgeElement.volume = 1.0;
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
    // 1. Connect to standard destination
    source.connect(ctx.destination);
    
    // 2. Connect to the media bridge for background play
    if (mediaStreamDest) {
        source.connect(mediaStreamDest);
    }
    
    // 3. Ensure bridge is actually playing
    if (audioBridgeElement && audioBridgeElement.paused) {
        audioBridgeElement.play().catch(() => {});
    }
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

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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

export async function warmUpAudioContext(ctx: AudioContext) {
    if (ctx.state === 'suspended' || (ctx.state as any) === 'interrupted') {
        await ctx.resume();
    }
    
    if (!silentLoopElement) {
        silentLoopElement = new Audio();
        silentLoopElement.src = 'data:audio/wav;base64,UklGRigAAABXQVZFRm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAA';
        silentLoopElement.loop = true;
        silentLoopElement.setAttribute('playsinline', 'true');
    }
    
    try {
        await silentLoopElement.play();
        if (audioBridgeElement) {
            if (mediaStreamDest && audioBridgeElement.srcObject !== mediaStreamDest.stream) {
                audioBridgeElement.srcObject = mediaStreamDest.stream;
            }
            await audioBridgeElement.play();
        }
    } catch(e) {
        console.warn("Background Audio failed to prime.", e);
    }
}

export function coolDownAudioContext() {
    if (silentLoopElement) silentLoopElement.pause();
    if (audioBridgeElement) {
        audioBridgeElement.pause();
        audioBridgeElement.srcObject = null;
    }
}

export function createPcmBlob(data: Float32Array): GeminiBlob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return {
    data: bytesToBase64(new Uint8Array(int16.buffer)),
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
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
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
