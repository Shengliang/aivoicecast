
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { base64ToBytes, decodeRawPcm, createPcmBlob, getGlobalAudioContext, warmUpAudioContext } from '../utils/audioUtils';

export interface LiveConnectionCallbacks {
  onOpen: () => void;
  onClose: () => void;
  onError: (error: Error) => void;
  onVolumeUpdate: (volume: number) => void;
  onTranscript: (text: string, isUser: boolean) => void;
  onToolCall?: (toolCall: any) => void;
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

  constructor() {}

  public initializeAudio() {
    // Use standard 16k for input and 24k for output as per singleton pattern
    this.inputAudioContext = getGlobalAudioContext(16000);
    this.outputAudioContext = getGlobalAudioContext(24000);
    
    if (this.outputAudioContext) {
        this.outputDestination = this.outputAudioContext.createMediaStreamDestination();
    }

    warmUpAudioContext(this.inputAudioContext).catch(e => console.warn("Warmup input failed", e));
    warmUpAudioContext(this.outputAudioContext).catch(e => console.warn("Warmup output failed", e));
  }

  public getOutputMediaStream(): MediaStream | null {
      return this.outputDestination ? this.outputDestination.stream : null;
  }

  public sendVideo(base64Data: string, mimeType: string = 'image/jpeg') {
      this.sessionPromise?.then((session) => {
          if (session) {
              try {
                  session.sendRealtimeInput({
                      media: { mimeType, data: base64Data }
                  });
              } catch(e) {
                  console.error("Failed to send video/image data", e);
              }
          }
      });
  }

  async connect(
    voiceName: string, 
    systemInstruction: string, 
    callbacks: LiveConnectionCallbacks,
    tools?: any[]
  ) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      if (!this.inputAudioContext) this.initializeAudio();

      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const validVoice = voiceName || 'Puck';

      const connectionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO], 
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: validVoice } },
          },
          systemInstruction: systemInstruction,
          inputAudioTranscription: {}, 
          outputAudioTranscription: {},
          tools: tools,
        },
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Connection Opened");
            this.startAudioInput(callbacks.onVolumeUpdate);
            this.outputAudioContext?.resume();
            callbacks.onOpen();
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) {
                if (callbacks.onToolCall) {
                    callbacks.onToolCall(message.toolCall);
                }
            }

            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && this.outputAudioContext) {
              try {
                this.isPlayingResponse = true;
                if (this.speakingTimer) clearTimeout(this.speakingTimer);
                
                const bytes = base64ToBytes(base64Audio);
                let sum = 0;
                for (let i=0; i<bytes.length; i++) sum += Math.abs(bytes[i] - 128);
                const avg = sum / bytes.length;
                callbacks.onVolumeUpdate(avg * 0.5);

                this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
                
                const audioBuffer = await decodeRawPcm(
                  bytes,
                  this.outputAudioContext,
                  24000,
                  1
                );
                
                const source = this.outputAudioContext.createBufferSource();
                source.buffer = audioBuffer;
                
                source.connect(this.outputAudioContext.destination);
                if (this.outputDestination) {
                    source.connect(this.outputDestination);
                }

                source.addEventListener('ended', () => {
                  this.sources.delete(source);
                  if (this.sources.size === 0) {
                     this.speakingTimer = setTimeout(() => {
                        this.isPlayingResponse = false;
                     }, 500);
                  }
                });
                source.start(this.nextStartTime);
                this.sources.add(source);
                
                this.nextStartTime += audioBuffer.duration;
              } catch (e) {
                console.error("Error decoding audio:", e);
              }
            }

            const outputText = message.serverContent?.outputTranscription?.text;
            if (outputText) callbacks.onTranscript(outputText, false);

            const inputText = message.serverContent?.inputTranscription?.text;
            if (inputText) callbacks.onTranscript(inputText, true);

            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              this.stopAllSources();
              this.nextStartTime = 0;
              this.isPlayingResponse = false;
            }
          },
          onclose: () => {
            console.log("Gemini Live Connection Closed");
            this.cleanup();
            callbacks.onClose();
          },
          onerror: (e: any) => {
            console.error("Gemini Live Error", e);
            let errorMessage = "Connection interrupted";
            if (e instanceof Error) errorMessage = e.message;
            callbacks.onError(new Error(errorMessage));
          }
        }
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Connection timeout")), 15000)
      );

      this.sessionPromise = Promise.race([connectionPromise, timeoutPromise]);
      this.session = await this.sessionPromise;

    } catch (error) {
      console.error("Failed to connect:", error);
      callbacks.onError(error instanceof Error ? error : new Error("Failed to connect"));
      this.cleanup();
    }
  }

  public sendText(text: string) {
    this.sessionPromise?.then((session) => {
        if (session) {
            try {
                session.send({
                  clientContent: {
                    turns: [{ role: 'user', parts: [{ text }] }],
                    turnComplete: true
                  }
                });
            } catch (e) {
                console.error("Failed to send text context:", e);
            }
        }
    });
  }

  public sendToolResponse(functionResponses: any) {
      this.sessionPromise?.then((session) => {
          if (session) {
              try {
                  session.sendToolResponse({ functionResponses });
              } catch(e) {
                  console.error("Failed to send tool response", e);
              }
          }
      });
  }

  private startAudioInput(onVolume: (v: number) => void) {
    if (!this.inputAudioContext || !this.stream || !this.sessionPromise) return;

    this.source = this.inputAudioContext.createMediaStreamSource(this.stream);
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      if (!this.inputAudioContext || !this.processor) return;
      const inputData = e.inputBuffer.getChannelData(0);

      if (this.isPlayingResponse) {
          onVolume(0); 
          return; 
      }
      
      let sum = 0;
      for(let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
      const rms = Math.sqrt(sum / inputData.length);
      onVolume(rms * 5);

      const pcmBlob = createPcmBlob(inputData);
      this.sessionPromise?.then(session => {
          if (session) {
             try { session.sendRealtimeInput({ media: pcmBlob }); } catch(sendError) {}
          }
      }).catch(() => {});
    };

    this.source.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private stopAllSources() {
    for (const source of this.sources) {
      try { source.stop(); } catch (e) {}
    }
    this.sources.clear();
  }

  async disconnect() {
    if (this.session) {
        try { (this.session as any).close?.(); } catch(e) {}
    }
    this.cleanup();
  }

  private cleanup() {
    this.stopAllSources();
    this.isPlayingResponse = false;
    if (this.speakingTimer) clearTimeout(this.speakingTimer);
    
    if (this.processor) {
      try { this.processor.disconnect(); this.processor.onaudioprocess = null; } catch(e) {}
    }
    if (this.source) {
      try { this.source.disconnect(); } catch(e) {}
    }
    this.stream?.getTracks().forEach(track => track.stop());
    
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
