import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { base64ToBytes, decodeRawPcm, createPcmBlob, getGlobalAudioContext, warmUpAudioContext, registerAudioOwner } from '../utils/audioUtils';

export interface LiveConnectionCallbacks {
  onOpen: () => void;
  onClose: () => void;
  onError: (error: Error) => void;
  onVolumeUpdate: (volume: number) => void;
  onTranscript: (text: string, isUser: boolean, rawRole?: string) => void;
  onToolCall?: (toolCall: any) => void;
}

/**
 * Maps technical project IDs or human strings to valid Gemini Live voice names.
 * Prebuilt voices: 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
 */
function getValidLiveVoice(voiceName: string): string {
    const name = voiceName.toLowerCase();
    
    // Technical Persona Mappings
    if (name.includes('0648937375') || name.includes('software interview')) return 'Fenrir';
    if (name.includes('0375218270') || name.includes('linux kernel')) return 'Fenrir';
    
    if (name === 'default gem' || name === 'default-gem' || name === 'zephyr') return 'Zephyr';
    
    const validVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
    const match = validVoices.find(v => v.toLowerCase() === name);
    return match || 'Zephyr';
}

export class GeminiLiveService {
  private session: any = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private nextStartTime: number = 0;
  private sources: Set<AudioBufferSourceNode> = new Set();
  private sessionPromise: Promise<any> | null = null;
  
  private outputDestination: MediaStreamAudioDestinationNode | null = null;
  private isPlayingResponse: boolean = false;
  private speakingTimer: any = null;
  private currentTurnRole: string = 'ai';

  constructor() {
      if (typeof window !== 'undefined') {
          const resume = () => { 
              this.outputAudioContext?.resume(); 
              this.inputAudioContext?.resume(); 
          };
          window.addEventListener('visibilitychange', () => { 
              if (document.visibilityState === 'visible') resume(); 
          });
      }
  }

  public initializeAudio() {
    this.inputAudioContext = getGlobalAudioContext(16000);
    this.outputAudioContext = getGlobalAudioContext(24000);
    if (this.outputAudioContext) {
        this.outputDestination = this.outputAudioContext.createMediaStreamDestination();
    }
    warmUpAudioContext(this.inputAudioContext).catch(() => {});
    warmUpAudioContext(this.outputAudioContext).catch(() => {});
  }

  public getOutputMediaStream(): MediaStream | null { 
      return this.outputDestination ? this.outputDestination.stream : null; 
  }

  public sendVideo(base64Data: string, mimeType: string = 'image/jpeg') {
      this.sessionPromise?.then((s) => s?.sendRealtimeInput({ 
          media: { mimeType, data: base64Data } 
      }));
  }

  async connect(voiceName: string, systemInstruction: string, callbacks: LiveConnectionCallbacks, tools?: any[]) {
    try {
      registerAudioOwner("GeminiLive", () => this.disconnect());
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      if (!this.inputAudioContext) this.initializeAudio();

      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const validVoice = getValidLiveVoice(voiceName);

      this.sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalalities: [Modality.AUDIO], 
          speechConfig: { 
              voiceConfig: { prebuiltVoiceConfig: { voiceName: validVoice } } 
          },
          systemInstruction, 
          inputAudioTranscription: {}, 
          outputAudioTranscription: {}, 
          tools,
        },
        callbacks: {
          onopen: () => { 
            this.startAudioInput(callbacks.onVolumeUpdate); 
            callbacks.onOpen(); 
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) callbacks.onToolCall?.(message.toolCall);

            if (message.serverContent?.modelTurn) {
                // Resolution mapping for technical roles
                this.currentTurnRole = (message.serverContent.modelTurn as any).role || 'ai';
            }

            const modelParts = message.serverContent?.modelTurn?.parts;
            if (modelParts && this.outputAudioContext) {
                for (const part of modelParts) {
                    if (part.inlineData?.data) {
                        try {
                            this.isPlayingResponse = true;
                            if (this.speakingTimer) clearTimeout(this.speakingTimer);
                            
                            const bytes = base64ToBytes(part.inlineData.data);
                            this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
                            const audioBuffer = await decodeRawPcm(bytes, this.outputAudioContext, 24000, 1);
                            const source = this.outputAudioContext.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(this.outputAudioContext.destination);
                            if (this.outputDestination) source.connect(this.outputDestination);
                            
                            source.addEventListener('ended', () => {
                              this.sources.delete(source);
                              if (this.sources.size === 0) {
                                  this.speakingTimer = setTimeout(() => { this.isPlayingResponse = false; }, 500);
                              }
                            });
                            
                            source.start(this.nextStartTime);
                            this.sources.add(source);
                            this.nextStartTime += audioBuffer.duration;
                        } catch (e) {
                            console.error("Audio playback error", e);
                        }
                    }
                }
            }

            if (message.serverContent?.outputTranscription?.text) {
                callbacks.onTranscript(message.serverContent.outputTranscription.text, false, this.currentTurnRole);
            }
            if (message.serverContent?.inputTranscription?.text) {
                callbacks.onTranscript(message.serverContent.inputTranscription.text, true, 'user');
            }

            if (message.serverContent?.interrupted || message.serverContent?.turnComplete) { 
              if (message.serverContent?.interrupted) {
                this.stopAllSources(); 
                this.nextStartTime = 0; 
              }
              this.isPlayingResponse = false; 
              if (this.speakingTimer) clearTimeout(this.speakingTimer);
            }
          },
          onclose: () => { this.cleanup(); callbacks.onClose(); },
          onerror: (e: any) => { 
              const errorText = e.message || e.reason || "Connection failed";
              callbacks.onError(new Error(errorText));
              this.cleanup(); 
          }
        }
      });
      await this.sessionPromise;
    } catch (error: any) { 
        callbacks.onError(error); 
        this.cleanup(); 
    }
  }

  public sendToolResponse(functionResponses: any) { 
      this.sessionPromise?.then((s) => s?.sendToolResponse({ functionResponses })); 
  }

  private startAudioInput(onVolume: (v: number) => void) {
    if (!this.inputAudioContext || !this.stream) return;
    this.source = this.inputAudioContext.createMediaStreamSource(this.stream);
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Stop streaming if we are currently listening to the AI
      if (this.isPlayingResponse) { 
          onVolume(0); 
          return; 
      }

      let sum = 0; 
      for(let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
      onVolume(Math.sqrt(sum / inputData.length) * 5);
      
      const pcmBlob = createPcmBlob(inputData);
      this.sessionPromise?.then(s => s?.sendRealtimeInput({ media: pcmBlob }));
    };
    this.source.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private stopAllSources() { 
      this.sources.forEach(s => { try { s.stop(); s.disconnect(); } catch(e) {} }); 
      this.sources.clear(); 
  }

  async disconnect() { 
      if (this.session) try { this.session.close(); } catch(e) {} 
      this.cleanup(); 
  }

  private cleanup() {
    this.stopAllSources();
    this.isPlayingResponse = false;
    if (this.speakingTimer) clearTimeout(this.speakingTimer);
    if (this.processor) { 
        this.processor.disconnect(); 
        this.processor.onaudioprocess = null; 
    }
    if (this.source) this.source.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());
    this.session = null;
    this.sessionPromise = null;
    this.inputAudioContext = null;
    this.outputAudioContext = null;
    this.stream = null;
    this.processor = null;
    this.source = null;
    this.outputDestination = null;
    this.nextStartTime = 0;
  }
}
