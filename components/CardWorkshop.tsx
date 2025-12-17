
import React, { useState, useRef, useEffect } from 'react';
import { AgentMemory, TranscriptItem, Group, ChatChannel } from '../types';
import { ArrowLeft, Sparkles, Wand2, Image as ImageIcon, Type, Download, Share2, Printer, RefreshCw, Send, Mic, MicOff, Gift, Heart, Loader2, ChevronRight, ChevronLeft, Upload, QrCode, X, Music, Play, Pause, Volume2, Camera, CloudUpload, Lock, Globe, Check, Edit, Package, ArrowDown, Type as TypeIcon, Minus, Plus, Menu, Settings as SettingsIcon, FileText } from 'lucide-react';
import { generateCardMessage, generateCardImage, generateCardAudio, generateSongLyrics } from '../services/cardGen';
import { GeminiLiveService } from '../services/geminiLive';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { uploadFileToStorage, saveCard, getCard, getUserGroups, getUserDMChannels } from '../services/firestoreService';
import { auth } from '../services/firebaseConfig';
import { FunctionDeclaration, Type as GenType } from '@google/genai';

interface CardWorkshopProps {
  onBack: () => void;
  cardId?: string; 
  isViewer?: boolean; 
}

const DEFAULT_MEMORY: AgentMemory = {
  recipientName: '',
  senderName: '',
  occasion: 'Holiday',
  cardMessage: 'Wishing you a season filled with warmth, comfort, and good cheer.',
  theme: 'festive',
  customThemePrompt: '',
  userImages: [],
  googlePhotosUrl: '',
  generatedAt: new Date().toISOString(),
  fontFamily: 'font-script',
  fontSizeScale: 1.0
};

const TEMPLATES = [
    { label: '🎄 Holiday', occasion: 'Holiday', theme: 'festive', prompt: 'Classic Christmas aesthetic, snowy village' },
    { label: '🙏 Thanks', occasion: 'Thank You', theme: 'minimal', prompt: 'Warm watercolor textures, elegant stationery' },
    { label: '🎂 Birthday', occasion: 'Birthday', theme: 'cozy', prompt: 'Festive balloons, vibrant warm colors' },
    { label: '🎓 Graduation', occasion: 'Graduation', theme: 'minimal', prompt: 'Academic achievement symbols, clean modern art' },
];

const updateCardTool: FunctionDeclaration = {
    name: 'update_card',
    description: 'Update the holiday card details. Use this when the user asks to change the message, theme, recipient, or occasion.',
    parameters: {
        type: GenType.OBJECT,
        properties: {
            recipientName: { type: GenType.STRING, description: "Name of person receiving the card" },
            senderName: { type: GenType.STRING, description: "Name of person sending the card" },
            occasion: { type: GenType.STRING, description: "The event (Christmas, Birthday, Thanks, etc)" },
            cardMessage: { type: GenType.STRING, description: "The message text to be written on the card." },
            theme: { type: GenType.STRING, enum: ['festive', 'cozy', 'minimal', 'chinese-poem'], description: "Visual theme style" },
            customThemePrompt: { type: GenType.STRING, description: "Specific visual details for image generation" }
        }
    }
};

export const CardWorkshop: React.FC<CardWorkshopProps> = ({ onBack, cardId, isViewer: initialIsViewer = false }) => {
  const [memory, setMemory] = useState<AgentMemory>(DEFAULT_MEMORY);
  const [activeTab, setActiveTab] = useState<'chat' | 'configure'>(initialIsViewer ? 'configure' : 'chat');
  const [activePage, setActivePage] = useState<number>(0); 
  
  const [isViewer, setIsViewer] = useState(initialIsViewer);
  const [isGeneratingText, setIsGeneratingText] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [isGeneratingSong, setIsGeneratingSong] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isLiveActive, setIsLiveActive] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const liveServiceRef = useRef<GeminiLiveService | null>(null);
  
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);

  useEffect(() => {
      if (cardId) {
          getCard(cardId).then(data => {
              if (data) setMemory(data);
          }).catch(console.error);
      }
  }, [cardId]);

  useEffect(() => {
    if (memory.googlePhotosUrl) {
        const url = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(memory.googlePhotosUrl)}`;
        setQrCodeBase64(url);
    } else {
        setQrCodeBase64(null);
    }
  }, [memory.googlePhotosUrl]);

  useEffect(() => {
      liveServiceRef.current = new GeminiLiveService();
      liveServiceRef.current.initializeAudio();
      return () => {
          liveServiceRef.current?.disconnect();
          if (audioRef.current) audioRef.current.pause();
      };
  }, []);

  useEffect(() => {
      if (transcriptEndRef.current) {
          transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
  }, [transcript]);

  const handleLiveToggle = async () => {
      if (isLiveActive) {
          liveServiceRef.current?.disconnect();
          setIsLiveActive(false);
      } else {
          try {
              const sysPrompt = `You are Elf, a helpful assistant. Help design a card for ${memory.occasion}. Current memory: ${JSON.stringify(memory)}. Use update_card tool for changes.`;
              await liveServiceRef.current?.connect("Puck", sysPrompt, {
                  onOpen: () => setIsLiveActive(true),
                  onClose: () => setIsLiveActive(false),
                  onError: () => setIsLiveActive(false),
                  onVolumeUpdate: () => {},
                  onTranscript: (text, isUser) => {
                      const role = isUser ? 'user' : 'ai';
                      setTranscript(prev => [...prev, { role, text, timestamp: Date.now() }]);
                  },
                  onToolCall: async (toolCall) => {
                      for (const fc of toolCall.functionCalls) {
                          if (fc.name === 'update_card') {
                              setMemory(prev => ({ ...prev, ...fc.args }));
                              liveServiceRef.current?.sendToolResponse({
                                  functionResponses: [{ id: fc.id, name: fc.name, response: { result: "Card updated!" } }]
                              });
                              setTranscript(prev => [...prev, { role: 'ai', text: `✨ I've updated your card configuration!`, timestamp: Date.now() }]);
                          }
                      }
                  }
              }, [{ functionDeclarations: [updateCardTool] }]);
          } catch(e) {
              alert("Live connection failed.");
          }
      }
  };

  const handleGenText = async () => {
      setIsGeneratingText(true);
      try {
          const msg = await generateCardMessage(memory);
          setMemory(prev => ({ ...prev, cardMessage: msg }));
      } catch(e) { alert("Failed to generate text"); } finally { setIsGeneratingText(false); }
  };

  const handleGenAudio = async (type: 'message' | 'song') => {
      const isSong = type === 'song';
      const setter = isSong ? setIsGeneratingSong : setIsGeneratingVoice;
      setter(true);
      try {
          let text = isSong ? await generateSongLyrics(memory) : memory.cardMessage;
          if (isSong) setMemory(prev => ({ ...prev, songLyrics: text }));
          const audioUrl = await generateCardAudio(text, isSong ? 'Fenrir' : 'Kore');
          setMemory(prev => isSong ? { ...prev, songUrl: audioUrl } : { ...prev, voiceMessageUrl: audioUrl });
      } catch(e) { alert("Audio generation failed."); } finally { setter(false); }
  };
  
  const handleGenImage = async (isBack = false) => {
      setIsGeneratingImage(true);
      try {
          let style = memory.theme === 'chinese-poem' ? 'Ink wash painting' : 'Cozy digital art';
          const prompt = isBack ? style + ", minimalist pattern" : style + ", cover art";
          const imgUrl = await generateCardImage(memory, prompt, undefined, undefined, isBack ? '16:9' : '3:4');
          setMemory(prev => isBack ? ({ ...prev, backImageUrl: imgUrl }) : ({ ...prev, coverImageUrl: imgUrl }));
      } catch(e) { alert("Image failed."); } finally { setIsGeneratingImage(false); }
  };

  const generatePDFBlob = async (): Promise<Blob | null> => {
      try {
          const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [400, 600] });
          for (let i = 0; i <= 5; i++) {
              const el = document.getElementById(`export-card-page-${i}`);
              if (el) {
                  const canvas = await html2canvas(el, { scale: 2, useCORS: true, allowTaint: true, width: 400, height: 600 });
                  const imgData = canvas.toDataURL('image/jpeg', 0.95);
                  if (i > 0) pdf.addPage();
                  pdf.addImage(imgData, 'JPEG', 0, 0, 400, 600);
              }
          }
          return pdf.output('blob');
      } catch(e) { return null; }
  };

  const handleExportPDF = async () => {
      setIsExporting(true);
      setTimeout(async () => {
          const blob = await generatePDFBlob();
          if (blob) {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = `${memory.recipientName || 'Holiday_Card'}.pdf`; 
              a.click(); URL.revokeObjectURL(url);
          }
          setIsExporting(false);
      }, 500);
  };

  const handlePublishAndShare = async () => {
      if (!auth.currentUser) return alert("Sign in to share.");
      setIsPublishing(true);
      try {
          const finalMemory = { ...memory, updatedAt: new Date().toISOString(), ownerId: auth.currentUser.uid };
          const newCardId = await saveCard(finalMemory, cardId); 
          const link = `${window.location.origin}?view=card&id=${newCardId}`;
          setShareLink(link); setShowShareModal(true);
      } catch(e) { alert("Publish failed."); } finally { setIsPublishing(false); }
  };

  const renderCardContent = (page: number) => {
      const fontClass = memory.fontFamily === 'font-holiday' ? 'font-holiday' : memory.fontFamily === 'font-script' ? 'font-script' : 'font-sans';
      return (
          <div className="w-full h-full flex flex-col relative overflow-hidden">
             {page === 0 && (
                <div className="w-full h-full flex flex-col relative overflow-hidden">
                    {memory.coverImageUrl ? (
                        <div className="absolute inset-0 z-0" style={{ backgroundImage: `url(${memory.coverImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                    ) : <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-300"><Gift size={64}/></div>}
                    <div className="z-10 mt-auto p-8 bg-gradient-to-t from-black/80 to-transparent">
                        <h2 className="text-4xl text-center font-holiday text-white drop-shadow-lg">{memory.occasion}</h2>
                    </div>
                </div>
            )}
            {page === 1 && (
                <div className="w-full h-full flex flex-col p-10 justify-center text-center relative items-center bg-white">
                    <h3 className="font-holiday text-2xl text-red-600 mb-6 opacity-80">{memory.occasion}</h3>
                    <div className="w-full max-h-[440px] overflow-y-auto scrollbar-thin">
                       <p className={`whitespace-pre-wrap ${fontClass} text-slate-800 text-xl leading-relaxed`}>
                           {memory.cardMessage}
                       </p>
                    </div>
                    <div className="mt-8 text-center"><p className="font-script text-2xl text-slate-600">{memory.senderName ? `With love, ${memory.senderName}` : ''}</p></div>
                </div>
            )}
            {page === 2 && (
                <div className="w-full h-full flex flex-col p-6 bg-slate-50">
                    <h3 className="font-bold text-center text-slate-400 text-[10px] uppercase tracking-widest mb-4">Photos</h3>
                    <div className="flex-1 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-300 text-xs italic">
                        {memory.userImages.length > 0 ? "Photos Loaded" : "Drop photos in 'Manual' tab"}
                    </div>
                </div>
            )}
            {page === 3 && (
                <div className="w-full h-full flex flex-col items-center justify-between p-12 bg-white">
                    <div className="w-full h-32 overflow-hidden rounded-xl opacity-20 relative bg-slate-100">
                        {memory.backImageUrl && <div className="absolute inset-0" style={{ backgroundImage: `url(${memory.backImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />}
                    </div>
                    {qrCodeBase64 ? (
                        <div className="text-center space-y-2">
                            <img src={qrCodeBase64} alt="QR" className="w-24 h-24 mx-auto" />
                            <p className="text-[8px] font-bold text-slate-400 uppercase">Interactive Guest Experience</p>
                        </div>
                    ) : <div className="w-24 h-24 bg-slate-50 border border-dashed border-slate-200 rounded-lg flex items-center justify-center text-[10px] text-slate-300 italic">QR Zone</div>}
                    <div className="text-center opacity-30"><Gift size={16} className="mx-auto text-slate-400 mb-1" /><p className="text-[8px] text-slate-400 uppercase tracking-widest">AIVoiceCast AI</p></div>
                </div>
            )}
            {page === 4 && <div className="w-full h-full p-8 flex flex-col justify-center text-center bg-slate-50"><Mic size={48} className="mx-auto text-indigo-400 mb-4"/><h3 className="text-xl font-holiday text-indigo-700">Voice Greeting</h3></div>}
            {page === 5 && <div className="w-full h-full p-8 flex flex-col justify-center text-center bg-slate-50"><Music size={48} className="mx-auto text-pink-400 mb-4"/><h3 className="text-xl font-holiday text-pink-700">Musical Tribute</h3></div>}
          </div>
      );
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      
      {/* SIDEBAR */}
      <div className="w-full md:w-96 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 z-30 h-full shadow-2xl">
          
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950 shrink-0">
               <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"><ArrowLeft size={18}/></button>
               <div className="flex gap-2">
                    <button onClick={handleExportPDF} disabled={isExporting} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400" title="Download PDF">
                        {isExporting ? <Loader2 size={16} className="animate-spin"/> : <Download size={16}/>}
                    </button>
                    {!isViewer && (
                        <button onClick={handlePublishAndShare} disabled={isPublishing} className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white" title="Publish & Share">
                            {isPublishing ? <Loader2 size={16} className="animate-spin"/> : <Share2 size={16}/>}
                        </button>
                    )}
               </div>
          </div>

          <div className="flex border-b border-slate-800 bg-slate-900 shrink-0">
              <button onClick={() => setActiveTab('chat')} className={`flex-1 py-3 text-xs font-bold transition-colors flex items-center justify-center gap-2 ${activeTab==='chat' ? 'bg-slate-800 text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`}>
                  <Sparkles size={14} className="text-indigo-400" /> Elf Assistant
              </button>
              <button onClick={() => setActiveTab('configure')} className={`flex-1 py-3 text-xs font-bold transition-colors flex items-center justify-center gap-2 ${activeTab==='configure' ? 'bg-slate-800 text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`}>
                  <SettingsIcon size={14} /> Configure
              </button>
          </div>

          <div className="flex-1 overflow-hidden relative flex flex-col">
              {activeTab === 'chat' ? (
                  <>
                      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24 scrollbar-thin scrollbar-thumb-slate-800">
                          {transcript.length === 0 && (
                              <div className="text-center py-10 px-4">
                                  <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-700">
                                      <Gift size={32} className="text-emerald-500" />
                                  </div>
                                  <h3 className="font-bold text-white mb-2">I am Elf! 🎄</h3>
                                  <p className="text-slate-400 text-xs leading-relaxed">
                                      "Tell me who the card is for and what's the occasion. I'll help you design everything!"
                                  </p>
                              </div>
                          )}
                          {transcript.map((t, i) => (
                              <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[85%] p-3 rounded-xl text-xs shadow-sm ${t.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-300 rounded-tl-sm border border-slate-700'}`}>
                                      {t.text}
                                  </div>
                              </div>
                          ))}
                          <div ref={transcriptEndRef} />
                      </div>
                      <div className="absolute bottom-0 left-0 w-full p-4 border-t border-slate-800 bg-slate-900 z-10">
                          <button 
                              onClick={handleLiveToggle}
                              className={`w-full h-12 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${isLiveActive ? 'bg-red-600 text-white animate-pulse' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
                          >
                              {isLiveActive ? <MicOff size={18}/> : <Mic size={18}/>}
                              <span className="text-sm">{isLiveActive ? 'End Session' : 'Talk to Elf'}</span>
                          </button>
                      </div>
                  </>
              ) : (
                  <div className="overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-800 pb-10">
                       <div className="space-y-4">
                           <div className="grid grid-cols-2 gap-3">
                               {TEMPLATES.map(tmp => (
                                   <button 
                                       key={tmp.label} 
                                       onClick={() => setMemory({ ...memory, occasion: tmp.occasion, theme: tmp.theme as any, customThemePrompt: tmp.prompt })}
                                       className={`p-2 rounded-lg border text-[10px] font-bold text-left transition-all ${memory.occasion === tmp.occasion ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                                   >
                                       {tmp.label}
                                   </button>
                               ))}
                           </div>

                           <div><label className="text-[10px] font-bold text-slate-500 uppercase">To</label><input type="text" value={memory.recipientName} onChange={e => setMemory({...memory, recipientName: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-white mt-1"/></div>
                           <div><label className="text-[10px] font-bold text-slate-500 uppercase">From</label><input type="text" value={memory.senderName} onChange={e => setMemory({...memory, senderName: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-white mt-1"/></div>
                           <div><label className="text-[10px] font-bold text-slate-500 uppercase">Theme</label><select value={memory.theme} onChange={e => setMemory({...memory, theme: e.target.value as any})} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-white mt-1"><option value="festive">Festive</option><option value="cozy">Cozy</option><option value="minimal">Minimal</option><option value="chinese-poem">Chinese Poem</option></select></div>
                           
                           <div>
                               <div className="flex justify-between items-center mb-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Letter Message</label><button onClick={handleGenText} className="text-[10px] text-indigo-400 font-bold hover:text-white flex items-center gap-1"><Wand2 size={10}/> AI Write</button></div>
                               <textarea rows={4} value={memory.cardMessage} onChange={e => setMemory({...memory, cardMessage: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs text-white resize-none"/>
                           </div>

                           <div className="pt-4 border-t border-slate-800">
                               <label className="text-[10px] font-bold text-slate-500 uppercase mb-2 block">Card Assets</label>
                               <div className="grid grid-cols-2 gap-2">
                                   <button onClick={() => handleGenImage(false)} disabled={isGeneratingImage} className="py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-slate-700 flex items-center justify-center gap-1">{isGeneratingImage ? <Loader2 size={12} className="animate-spin"/> : <ImageIcon size={12}/>} Front Art</button>
                                   <button onClick={() => handleGenAudio('message')} disabled={isGeneratingVoice} className="py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-slate-700 flex items-center justify-center gap-1">{isGeneratingVoice ? <Loader2 size={12} className="animate-spin"/> : <Mic size={12}/>} Voice</button>
                               </div>
                               <button onClick={() => handleGenAudio('song')} disabled={isGeneratingSong} className="w-full mt-2 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-slate-700 flex items-center justify-center gap-1">{isGeneratingSong ? <Loader2 size={12} className="animate-spin"/> : <Music size={12}/>} Personalized Song</button>
                           </div>
                       </div>
                  </div>
              )}
          </div>
      </div>

      {/* PREVIEW */}
      <div className="flex-1 bg-slate-950 flex flex-col items-center overflow-hidden relative">
          <div className="flex items-center gap-4 my-6 bg-slate-900/50 p-2 rounded-full border border-slate-800 shadow-xl z-10 backdrop-blur-md">
              <button onClick={() => setActivePage(p => Math.max(0, p - 1))} disabled={activePage === 0} className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full disabled:opacity-30 transition-colors"><ChevronLeft size={20} /></button>
              <span className="text-xs font-bold text-slate-300 min-w-[120px] text-center">{getPageLabel(activePage)}</span>
              <button onClick={() => setActivePage(p => Math.min(5, p + 1))} disabled={activePage === 5} className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full disabled:opacity-30 transition-colors"><ChevronRight size={20} /></button>
          </div>

          <div className={`flex-1 w-full flex items-center justify-center overflow-hidden ${isExporting ? 'opacity-0' : 'opacity-100'}`}>
              <div className="w-[400px] h-[600px] shadow-2xl relative overflow-hidden flex flex-col rounded-xl bg-white scale-90 md:scale-100 origin-center">
                  {renderCardContent(activePage)}
              </div>
          </div>

          {/* Hidden Export Pages */}
          <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', opacity: 0 }}>
              {[0, 1, 2, 3, 4, 5].map(pageNum => (
                  <div key={pageNum} id={`export-card-page-${pageNum}`} className="w-[400px] h-[600px] overflow-hidden flex flex-col relative bg-white">{renderCardContent(pageNum)}</div>
              ))}
          </div>
      </div>

      {showShareModal && shareLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
           <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
               <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold text-white flex items-center gap-2"><Sparkles className="text-emerald-400"/> Shared!</h3><button onClick={() => setShowShareModal(false)}><X className="text-slate-400"/></button></div>
               <p className="text-xs text-slate-300 mb-4">Your interactive card is live. Send this link to your recipient!</p>
               <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex items-center gap-2 mb-6"><span className="flex-1 text-xs text-slate-400 truncate font-mono">{shareLink}</span><button onClick={() => { navigator.clipboard.writeText(shareLink); alert("Link copied!"); }} className="p-1.5 hover:bg-slate-800 rounded text-slate-400"><Share2 size={14}/></button></div>
               <button onClick={() => setShowShareModal(false)} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl">Awesome</button>
           </div>
        </div>
      )}
    </div>
  );
};

const getPageLabel = (page: number) => {
    switch(page) {
        case 0: return 'Front Cover';
        case 1: return 'Message';
        case 2: return 'Photos';
        case 3: return 'Back Cover';
        case 4: return 'Voice Message';
        case 5: return 'Holiday Song';
        default: return `Page ${page + 1}`;
    }
};
