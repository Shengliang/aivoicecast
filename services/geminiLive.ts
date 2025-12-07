import { GoogleGenAI, LiveServerMessage } from '@google/genai';
import { base64ToBytes, decodeAudioData, createPcmBlob } from '../utils/audioUtils';
import { GEMINI_API_KEY } from './private_keys';

export interface LiveConnectionCallbacks {
  onOpen: () => void;
  onClose: () => void;
  onError: (error: Error) => void;
  onVolumeUpdate: (volume: number) => void;
  onTranscript: (text: string, isUser: boolean) => void;
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
  
  // Audio Output Capture
  private outputDestination: MediaStreamAudioDestinationNode | null = null;
  
  // Audio Gating Flags
  private isPlayingResponse: boolean = false; // Gate mic while AI is talking to prevent echo-interruption
  private speakingTimer: any = null;

  constructor() {
    // Constructor no longer initializes AI client to allow for dynamic key injection
  }

  // PUBLIC SYNC METHOD FOR IOS SUPPORT
  public initializeAudio() {
    if (this.inputAudioContext) return; // Already init
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    // Create destination for recording output
    if (this.outputAudioContext) {
        this.outputDestination = this.outputAudioContext.createMediaStreamDestination();
    }

    // Resume immediately to capture user gesture
    this.inputAudioContext.resume().catch(e => console.log("Input ctx resume", e));
    this.outputAudioContext.resume().catch(e => console.log("Output ctx resume", e));
  }

  // New method to get the AI output stream for recording
  public getOutputMediaStream(): MediaStream | null {
      return this.outputDestination ? this.outputDestination.stream : null;
  }

  async connect(
    voiceName: string, 
    systemInstruction: string, 
    callbacks: LiveConnectionCallbacks
  ) {
    try {
      // Initialize AI Client here to ensure we pick up the latest API Key
      const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        throw new Error("API Key is missing. Please set it via the Key button in the navbar.");
      }
      const ai = new GoogleGenAI({ apiKey });

      // Fallback: Ensure audio contexts exist if not initialized via sync method
      if (!this.inputAudioContext) this.initializeAudio();

      // Request mic access
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Ensure voice name is valid, default to 'Puck' if missing
      const validVoice = voiceName || 'Puck';

      // Setup session promise with a timeout race
      const connectionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          // Use explicit string 'AUDIO' to avoid any Enum resolution issues
          responseModalities: ['AUDIO'] as any, 
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: validVoice } },
          },
          // Format system instruction as a Content part for maximum compatibility
          systemInstruction: { parts: [{ text: systemInstruction }] },
          // Explicitly enable transcription with empty objects
          inputAudioTranscription: {}, 
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Connection Opened");
            this.startAudioInput(callbacks.onVolumeUpdate);
            // Resume output context to ensure audio plays
            this.outputAudioContext?.resume();
            callbacks.onOpen();
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle audio output from model
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && this.outputAudioContext) {
              try {
                // MARK AI AS SPEAKING: This helps prevent the mic from picking up the speakers (echo)
                // and interrupting the AI immediately.
                this.isPlayingResponse = true;
                if (this.speakingTimer) clearTimeout(this.speakingTimer);
                
                const bytes = base64ToBytes(base64Audio);
                
                // Calculate volume for visualization from output
                let sum = 0;
                for (let i=0; i<bytes.length; i++) sum += Math.abs(bytes[i] - 128);
                const avg = sum / bytes.length;
                callbacks.onVolumeUpdate(avg * 0.5); // Heuristic scale

                this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
                
                const audioBuffer = await decodeAudioData(
                  bytes,
                  this.outputAudioContext,
                  24000,
                  1
                );
                
                const source = this.outputAudioContext.createBufferSource();
                source.buffer = audioBuffer;
                
                // CONNECT TO BOTH SPEAKERS AND RECORDING DESTINATION
                source.connect(this.outputAudioContext.destination);
                if (this.outputDestination) {
                    source.connect(this.outputDestination);
                }

                source.addEventListener('ended', () => {
                  this.sources.delete(source);
                  // Check if this was the last source, if so, release the gate after a brief pause
                  if (this.sources.size === 0) {
                     this.speakingTimer = setTimeout(() => {
                        this.isPlayingResponse = false;
                     }, 500); // 500ms tail to be safe
                  }
                });
                source.start(this.nextStartTime);
                this.sources.add(source);
                
                this.nextStartTime += audioBuffer.duration;
              } catch (e) {
                console.error("Error decoding audio:", e);
              }
            }

            // Handle Transcription
            const outputText = message.serverContent?.outputTranscription?.text;
            if (outputText) {
               callbacks.onTranscript(outputText, false);
            }

            const inputText = message.serverContent?.inputTranscription?.text;
            if (inputText) {
               callbacks.onTranscript(inputText, true);
            }

            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              console.log("Session interrupted by user");
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
            if (e instanceof Error) {
              errorMessage = e.message;
            } else if (typeof e === 'object' && e !== null) {
              if ((e as any).message) errorMessage = (e as any).message;
              else if (e.type === 'error') errorMessage = "Connection error. Please try again.";
            }
            callbacks.onError(new Error(errorMessage));
          }
        }
      });

      // Add a timeout to reject if connection hangs
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

  // Send text as a user turn (context update) without speaking
  public sendText(text: string) {
    if (this.session) {
      try {
        this.session.send({
          clientContent: {
            turns: [{ role: 'user', parts: [{ text }] }],
            turnComplete: true
          }
        });
      } catch (e) {
        console.error("Failed to send text context:", e);
      }
    }
  }

  private startAudioInput(onVolume: (v: number) => void) {
    if (!this.inputAudioContext || !this.stream || !this.sessionPromise) return;

    this.source = this.inputAudioContext.createMediaStreamSource(this.stream);
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      // Safety check: if we are disconnected or cleaning up, stop processing
      if (!this.inputAudioContext || !this.processor) return;

      const inputData = e.inputBuffer.getChannelData(0);

      // AUDIO GATING:
      // isPlayingResponse: AI is currently speaking. Block mic to prevent echo-based interruption.
      if (this.isPlayingResponse) {
          onVolume(0); 
          return; 
      }
      
      // Calculate volume for visualizer
      let sum = 0;
      for(let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      onVolume(rms * 5); // Scale up for visibility

      const pcmBlob = createPcmBlob(inputData);
      
      // Use sessionPromise to ensure we have a valid session before sending
      this.sessionPromise?.then(session => {
        try {
          if (session) {
             // Wrap send in try-catch to ignore "Socket Closed" errors during disconnects
             try {
                session.sendRealtimeInput({ media: pcmBlob });
             } catch(sendError) {
                // Ignore network errors during streaming usually caused by race conditions on close
             }
          }
        } catch (err) {
          // This often happens if the session is closed while data is still buffering
        }
      }).catch(err => {
         // This catch handles promise rejection from sessionPromise
      });
    };

    this.source.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private stopAllSources() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch (e) {
        // ignore errors if already stopped
      }
    }
    this.sources.clear();
  }

  async disconnect() {
    if (this.session) {
        try {
           (this.session as any).close?.();
        } catch(e) {
            console.warn("Error closing session:", e);
        }
    }
    this.cleanup();
  }

  private cleanup() {
    this.stopAllSources();
    
    // Reset flags
    this.isPlayingResponse = false;
    if (this.speakingTimer) clearTimeout(this.speakingTimer);
    
    if (this.processor) {
      try {
        this.processor.disconnect();
        this.processor.onaudioprocess = null;
      } catch(e) {}
    }
    if (this.source) {
      try {
         this.source.disconnect();
      } catch(e) {}
    }
    
    this.stream?.getTracks().forEach(track => track.stop());
    
    // Close audio contexts safely
    if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') {
      try {
        this.inputAudioContext.close();
      } catch(e) {}
    }
    if (this.outputAudioContext && this.outputAudioContext.state !== 'closed') {
      try {
        this.outputAudioContext.close();
      } catch(e) {}
    }
    
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