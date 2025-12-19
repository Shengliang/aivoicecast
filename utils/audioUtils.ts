
import { Blob as GeminiBlob } from '@google/genai';

let mainAudioContext: AudioContext | null = null;
let silentLoopElement: HTMLAudioElement | null = null;
let audioBridgeElement: HTMLAudioElement | null = null;
let mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
let keepAliveOscillator: OscillatorNode | null = null;

/**
 * GLOBAL AUDIO REGISTRY
 * Used to ensure only one component (Feed or Detail) is playing at a time.
 */
export let globalStopPlayback: (() => void) | null = null;

export function setGlobalStopPlayback(stopFn: (() => void) | null) {
    // If there is already something playing, stop it first
    if (globalStopPlayback) {
        try {
            globalStopPlayback();
        } catch (e) {
            console.warn("Error stopping previous playback", e);
        }
    }
    globalStopPlayback = stopFn;
}

export function getGlobalAudioContext(sampleRate: number = 24000): AudioContext {
  if (!mainAudioContext || mainAudioContext.state === 'closed') {
    mainAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ 
        sampleRate,
        latencyHint: 'playback' 
    });
    
    mediaStreamDest = mainAudioContext.createMediaStreamDestination();
    
    if (!audioBridgeElement) {
        audioBridgeElement = new Audio();
        audioBridgeElement.id = 'web-audio-bg-bridge';
        audioBridgeElement.muted = false;
        audioBridgeElement.volume = 1.0;
        audioBridgeElement.srcObject = mediaStreamDest.stream;
        audioBridgeElement.setAttribute('playsinline', 'true');
        audioBridgeElement.setAttribute('autoplay', 'true');
        document.body.appendChild(audioBridgeElement);
    }
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
    
    if (!keepAliveOscillator) {
        const gain = ctx.createGain();
        gain.gain.value = 0.001; 
        
        keepAliveOscillator = ctx.createOscillator();
        keepAliveOscillator.type = 'sine';
        keepAliveOscillator.frequency.value = 20; 
        keepAliveOscillator.connect(gain);
        connectOutput(gain, ctx);
        keepAliveOscillator.start(0);
    }

    if (!silentLoopElement) {
        silentLoopElement = new Audio();
        silentLoopElement.src = 'data:audio/wav;base64,UklGRigAAABXQVZFRm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAA';
        silentLoopElement.loop = true;
        silentLoopElement.setAttribute('playsinline', 'true');
        (window as any)._persistentSilence = silentLoopElement;
    }
    
    try {
        await silentLoopElement.play();
        if (audioBridgeElement) await audioBridgeElement.play();
    } catch(e) {
        console.warn("Background Audio failed to prime. User interaction may be required.", e);
    }
}

export function coolDownAudioContext() {
    if (silentLoopElement) silentLoopElement.pause();
    if (audioBridgeElement) audioBridgeElement.pause();
    if (keepAliveOscillator) {
        try { keepAliveOscillator.stop(); } catch(e) {}
        keepAliveOscillator = null;
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
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    const pcmBytes = new Uint8Array(buffer, 44);
    pcmBytes.set(pcmData);
    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
}
