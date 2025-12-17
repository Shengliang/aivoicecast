
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Mic, MicOff, Camera, Sparkles, Save, Download, Share2, Music, Gift, Loader2, Play, Pause } from 'lucide-react';
import { AgentMemory } from '../types';
import { GeminiLiveService } from '../services/geminiLive';
import { saveCard, getCard } from '../services/firestoreService';
import { generateCardImage, generateCardMessage, generateSongLyrics, generateCardAudio } from '../services/cardGen';
import { resizeImage } from '../utils/imageUtils';
import { auth } from '../services/firebaseConfig';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { GEMINI_API_KEY } from '../services/private_keys';

interface CardWorkshopProps {
  onBack: () => void;
  cardId?: string;
  isViewer?: boolean;
}

const DEFAULT_MEMORY: AgentMemory = {
  recipientName: "Loved One",
  senderName: "Me",
  occasion: "Happy Holidays",
  cardMessage: "Wishing you a season filled with warmth, comfort, and good cheer.",
  theme: "festive",
  userImages: [],
  generatedAt: new Date().toISOString()
};

export const CardWorkshop: React.FC<CardWorkshopProps> = ({ onBack, cardId, isViewer = false }) => {
  const [memory, setMemory] = useState<AgentMemory>(DEFAULT_MEMORY);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [transcript, setTranscript] = useState<{role: 'user'|'ai', text: string}[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPlayingSong, setIsPlayingSong] = useState(false);
  
  const liveService = useRef<GeminiLiveService | null>(null);
  const chatImageInputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (cardId) {
      setIsLoading(true);
      getCard(cardId).then(data => {
        if (data) setMemory(data);
        setIsLoading(false);
      });
    }
  }, [cardId]);

  // Clean up live service on unmount
  useEffect(() => {
    return () => {
      liveService.current?.disconnect();
    };
  }, []);

  const handleLiveToggle = async () => {
    if (isLiveActive) {
      liveService.current?.disconnect();
      setIsLiveActive(false);
      return;
    }

    if (!liveService.current) {
      liveService.current = new GeminiLiveService();
      liveService.current.initializeAudio();
    }

    setIsLiveActive(true);
    
    // Define tools for the AI to manipulate the card state
    const tools = [
      {
        name: "update_card",
        description: "Update the holiday card details based on user input.",
        parameters: {
          type: "OBJECT",
          properties: {
            recipientName: { type: "STRING", description: "Name of the person receiving the card." },
            senderName: { type: "STRING", description: "Name of the person sending the card." },
            occasion: { type: "STRING", description: "The event or holiday (e.g. Christmas, New Year, Birthday)." },
            cardMessage: { type: "STRING", description: "The text message body of the card." },
            theme: { type: "STRING", description: "Visual theme: 'festive', 'cozy', 'minimal', 'thanks', or 'chinese-poem'." },
            customThemePrompt: { type: "STRING", description: "Specific visual details for image generation (e.g. 'snowy cabin with a red door')." }
          }
        }
      },
      {
        name: "generate_assets",
        description: "Generate AI assets like images, poems, or songs for the card.",
        parameters: {
          type: "OBJECT",
          properties: {
            assetType: { type: "STRING", description: "One of: 'image', 'message', 'song', 'audio_message'" },
            prompt: { type: "STRING", description: "Optional specific instruction for the generation." }
          },
          required: ["assetType"]
        }
      }
    ];

    const sysPrompt = `
      You are 'Elf', a creative holiday card design assistant. 
      Your goal is to help the user design a beautiful digital greeting card.
      
      Current Card State: ${JSON.stringify(memory)}
      
      Capabilities:
      1. Update text fields (recipient, message, theme) using 'update_card'.
      2. Generate AI art, poems, or songs using 'generate_assets'.
      
      Personality: Cheerful, helpful, festive. Keep responses concise.
      If the user says "Change theme to X", call update_card.
      If the user says "Make a picture of...", call update_card with customThemePrompt, then maybe suggest generating it.
    `;

    await liveService.current.connect(
      "Puck", // Friendly voice
      sysPrompt,
      {
        onOpen: () => setTranscript(prev => [...prev, { role: 'ai', text: "Connected! How can I help design your card?" }]),
        onClose: () => setIsLiveActive(false),
        onError: (e) => { console.error(e); setIsLiveActive(false); },
        onVolumeUpdate: () => {},
        onTranscript: (text, isUser) => {
           setTranscript(prev => {
               const last = prev[prev.length - 1];
               if (last && last.role === (isUser ? 'user' : 'ai')) {
                   return [...prev.slice(0, -1), { role: last.role, text: last.text + " " + text }];
               }
               return [...prev, { role: isUser ? 'user' : 'ai', text }];
           });
        },
        onToolCall: async (toolCall) => {
            const fc = toolCall.functionCalls[0];
            if (fc.name === 'update_card') {
                const updates = fc.args;
                setMemory(prev => ({ ...prev, ...updates }));
                return { result: "Card updated successfully." };
            }
            if (fc.name === 'generate_assets') {
                const { assetType, prompt } = fc.args;
                try {
                    if (assetType === 'image') {
                        const imgUrl = await generateCardImage(memory, prompt || memory.customThemePrompt || memory.theme);
                        setMemory(prev => ({ ...prev, coverImageUrl: imgUrl }));
                        return { result: "Image generated and applied." };
                    } else if (assetType === 'message') {
                        const msg = await generateCardMessage(memory);
                        setMemory(prev => ({ ...prev, cardMessage: msg }));
                        return { result: "Message generated: " + msg };
                    } else if (assetType === 'song') {
                        const lyrics = await generateSongLyrics(memory);
                        // Also generate audio for the song lyrics
                        const audioUrl = await generateCardAudio(lyrics, 'Kore');
                        setMemory(prev => ({ ...prev, songLyrics: lyrics, songUrl: audioUrl }));
                        return { result: "Song generated with audio." };
                    }
                } catch(e: any) {
                    return { error: e.message };
                }
            }
            return { error: "Unknown tool" };
        }
      },
      // @ts-ignore - Tools type mismatch in library sometimes, casting usually helps or passing raw
      tools.map(t => ({ functionDeclarations: [t] }))
    );
  };

  const handleChatImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      try {
          const base64 = await resizeImage(file, 800);
          // Send to Gemini Live session
          liveService.current?.sendVideo(base64.split(',')[1], file.type);
          setTranscript(prev => [...prev, { role: 'user', text: "[Uploaded an image]" }]);
      } catch(e) {
          console.error("Image upload failed", e);
      }
  };

  const handleSave = async () => {
      if (!auth.currentUser) return alert("Please sign in to save.");
      setIsSaving(true);
      try {
          const id = await saveCard(memory, cardId);
          alert("Card saved!");
      } catch(e) {
          alert("Save failed.");
      } finally {
          setIsSaving(false);
      }
  };

  const handleDownloadPDF = async () => {
      if (!cardRef.current) return;
      try {
          const canvas = await html2canvas(cardRef.current, { scale: 2 });
          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF({
              orientation: 'portrait',
              unit: 'px',
              format: [canvas.width, canvas.height]
          });
          pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
          pdf.save('holiday-card.pdf');
      } catch(e) {
          console.error(e);
          alert("PDF generation failed.");
      }
  };

  const playSong = () => {
      if (memory.songUrl) {
          if (!audioRef.current) {
              audioRef.current = new Audio(memory.songUrl);
              audioRef.current.onended = () => setIsPlayingSong(false);
          }
          if (isPlayingSong) {
              audioRef.current.pause();
              setIsPlayingSong(false);
          } else {
              audioRef.current.play();
              setIsPlayingSong(true);
          }
      }
  };

  // Helper to get theme styles
  const getThemeStyles = () => {
      switch(memory.theme) {
          case 'chinese-poem': return 'bg-[#f4ebd9] text-stone-800 font-serif border-8 border-double border-red-900';
          case 'minimal': return 'bg-white text-slate-900 border border-slate-200';
          case 'cozy': return 'bg-amber-50 text-amber-900 border-4 border-amber-200';
          case 'thanks': return 'bg-orange-50 text-orange-900 border-4 border-orange-200';
          default: return 'bg-gradient-to-br from-red-50 to-green-50 text-slate-800 border-4 border-red-100'; // festive
      }
  };

  const displayTranscript = transcript;

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
        {/* Left: Card Preview */}
        <div className="flex-1 flex flex-col relative overflow-y-auto p-4 md:p-8 items-center justify-center bg-slate-900">
            <div className="absolute top-4 left-4 z-10 flex gap-2">
                <button onClick={onBack} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white"><ArrowLeft size={20}/></button>
            </div>

            <div ref={cardRef} className={`w-full max-w-md aspect-[3/4] shadow-2xl rounded-sm p-8 flex flex-col relative overflow-hidden ${getThemeStyles()}`}>
                {/* Cover Image */}
                {memory.coverImageUrl ? (
                    <div className="w-full aspect-square mb-6 overflow-hidden rounded-sm">
                        <img src={memory.coverImageUrl} className="w-full h-full object-cover" alt="Card Cover" />
                    </div>
                ) : (
                    <div className="w-full aspect-square mb-6 bg-black/5 flex items-center justify-center rounded-sm border-2 border-dashed border-current opacity-30">
                        <Sparkles size={48} />
                    </div>
                )}

                {/* Text Content */}
                <div className="flex-1 flex flex-col text-center justify-between z-10">
                    <div>
                        <h2 className="text-3xl font-bold font-serif mb-2 tracking-wide">{memory.occasion}</h2>
                        <p className="text-sm uppercase tracking-widest opacity-70 mb-6">For {memory.recipientName}</p>
                        <p className="whitespace-pre-wrap leading-relaxed font-serif text-lg italic">
                            {memory.cardMessage}
                        </p>
                    </div>
                    
                    <div className="mt-8 pt-4 border-t border-current opacity-80">
                        <p className="text-sm font-bold">With love,</p>
                        <p className="text-xl font-serif">{memory.senderName}</p>
                    </div>
                </div>
                
                {/* Texture Overlay */}
                <div className="absolute inset-0 pointer-events-none opacity-10 mix-blend-multiply bg-[url('https://www.transparenttextures.com/patterns/paper.png')]"></div>
            </div>

            {/* Media Controls */}
            {memory.songUrl && (
                <div className="mt-6 flex items-center gap-4 bg-slate-800 p-3 rounded-full shadow-lg border border-slate-700">
                    <button onClick={playSong} className="p-2 bg-indigo-600 rounded-full text-white hover:bg-indigo-500">
                        {isPlayingSong ? <Pause size={20}/> : <Play size={20}/>}
                    </button>
                    <div className="text-xs text-slate-300 pr-4">
                        <p className="font-bold">AI Song Generated</p>
                        <p className="opacity-70 line-clamp-1 max-w-[200px]">{memory.songLyrics?.substring(0, 30)}...</p>
                    </div>
                </div>
            )}
        </div>

        {/* Right: Controls & Chat */}
        {!isViewer && (
            <div className="w-96 bg-slate-950 border-l border-slate-800 flex flex-col">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <Gift className="text-red-500" size={20}/> Workshop
                    </h3>
                    <div className="flex gap-2">
                        <button onClick={handleDownloadPDF} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded hover:bg-slate-700" title="Download PDF"><Download size={18}/></button>
                        <button onClick={handleSave} className="p-2 text-emerald-400 hover:text-emerald-300 bg-emerald-900/20 rounded hover:bg-emerald-900/40" title="Save Card"><Save size={18}/></button>
                    </div>
                </div>

                <div className="flex-1 relative bg-slate-900">
                    {/* Chat History Area - Anchored top to bottom-bar */}
                    <div className="absolute inset-0 bottom-20 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-800">
                        {displayTranscript.length === 0 && (
                            <div className="text-center text-slate-500 text-sm py-8 px-4 mt-10">
                                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-700">
                                    <Mic size={32} className="text-emerald-500" />
                                </div>
                                <h3 className="font-bold text-white text-lg mb-2">Elf is ready to help!</h3>
                                <p className="text-slate-400 mb-4">Tap the <strong className="text-emerald-400">Talk</strong> button below to start designing.</p>
                                
                                <div className="text-xs text-left bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                                    <p className="font-bold text-indigo-400 mb-1 flex items-center gap-1"><Sparkles size={12}/> Pro Tip:</p>
                                    <p>Upload a photo while talking to let Elf see your inspiration!</p>
                                </div>
                            </div>
                        )}
                        {displayTranscript.map((t, i) => (
                            <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-3 rounded-xl text-xs whitespace-pre-wrap shadow-sm ${t.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-300 rounded-tl-sm border border-slate-700'}`}>
                                    {t.text}
                                </div>
                            </div>
                        ))}
                        <div className="h-4"></div>
                    </div>
                    
                    {/* Controls Footer - Anchored Bottom */}
                    <div className="absolute bottom-0 left-0 w-full h-20 p-4 border-t border-slate-800 bg-slate-900 z-10 flex items-center gap-3 shadow-2xl">
                        <button 
                            onClick={handleLiveToggle}
                            className={`flex-1 h-12 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${isLiveActive ? 'bg-red-600 text-white animate-pulse' : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-[1.02]'}`}
                        >
                            {isLiveActive ? <MicOff size={20}/> : <Mic size={20}/>}
                            <span className="text-sm">{isLiveActive ? 'End Session' : 'Talk to Elf'}</span>
                        </button>
                        
                        <button 
                            onClick={() => {
                                if (!isLiveActive) {
                                    alert("Please tap 'Talk' to start a session with Elf first! Then you can show him a photo.");
                                    return;
                                }
                                chatImageInputRef.current?.click();
                            }}
                            className={`h-12 w-12 flex items-center justify-center rounded-xl border transition-colors ${isLiveActive ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-600' : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'}`}
                            title={isLiveActive ? "Show photo to Elf" : "Start talking to enable camera"}
                        >
                            <Camera size={20}/>
                        </button>
                    </div>
                    
                    <input 
                        type="file" 
                        ref={chatImageInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        onChange={handleChatImageUpload}
                    />
                </div>
            </div>
        )}
    </div>
  );
};
