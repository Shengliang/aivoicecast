
import React, { useState, useRef, useEffect } from 'react';
import { AgentMemory, TranscriptItem, Group, ChatChannel } from '../types';
import { ArrowLeft, Sparkles, Wand2, Image as ImageIcon, Type, Download, Share2, Printer, RefreshCw, Send, Mic, MicOff, Gift, Heart, Loader2, ChevronRight, ChevronLeft, Upload, QrCode, X, Music, Play, Pause, Volume2, Camera, CloudUpload, Lock, Globe, Check, Edit, Package, ArrowDown, Type as TypeIcon, Minus, Plus, Menu, Edit3 } from 'lucide-react';
import { generateCardMessage, generateCardImage, generateCardAudio, generateSongLyrics } from '../services/cardGen';
import { GeminiLiveService } from '../services/geminiLive';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { uploadFileToStorage, saveCard, getCard, sendMessage, getUserGroups, getUserDMChannels } from '../services/firestoreService';
import { auth } from '../services/firebaseConfig';
import { FunctionDeclaration, Type as GenType } from '@google/genai';
import { resizeImage } from '../utils/imageUtils';

interface CardWorkshopProps {
  onBack: () => void;
  cardId?: string; // Optional: Load existing card
  isViewer?: boolean; // Read-only mode
}

const DEFAULT_MEMORY: AgentMemory = {
  recipientName: '',
  senderName: '',
  occasion: 'Holiday',
  cardMessage: 'Dear Friend,\n\nWishing you a season filled with warmth, comfort, and good cheer.\n\nWarmly,\nMe',
  theme: 'festive',
  customThemePrompt: '',
  userImages: [],
  googlePhotosUrl: '',
  generatedAt: new Date().toISOString(),
  fontFamily: 'font-script',
  fontSizeScale: 1.0
};

const isChinese = (text: string) => /[\u4e00-\u9fa5]/.test(text);
const isBlobUrl = (url?: string) => url?.startsWith('blob:');

const updateCardTool: FunctionDeclaration = {
    name: 'update_card',
    description: 'Update the holiday card details. Use this when the user asks to change the message, theme, recipient, or occasion.',
    parameters: {
        type: GenType.OBJECT,
        properties: {
            recipientName: { type: GenType.STRING, description: "Name of person receiving the card" },
            senderName: { type: GenType.STRING, description: "Name of person sending the card" },
            occasion: { type: GenType.STRING, description: "The event (Christmas, Birthday, etc)" },
            cardMessage: { type: GenType.STRING, description: "The final message text to be written on the card." },
            theme: { type: GenType.STRING, enum: ['festive', 'cozy', 'minimal', 'chinese-poem'], description: "Visual theme style" },
            customThemePrompt: { type: GenType.STRING, description: "Specific visual details for image generation (e.g. 'a dog in snow')" }
        }
    }
};

export const CardWorkshop: React.FC<CardWorkshopProps> = ({ onBack, cardId, isViewer: initialIsViewer = false }) => {
  const [memory, setMemory] = useState<AgentMemory>(DEFAULT_MEMORY);
  const [activeTab, setActiveTab] = useState<'settings' | 'chat'>('chat');
  const [activePage, setActivePage] = useState<number>(0); 
  const [isViewer, setIsViewer] = useState(initialIsViewer);
  const [isGeneratingText, setIsGeneratingText] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingBackImage, setIsGeneratingBackImage] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [isGeneratingSong, setIsGeneratingSong] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [frontRefImage, setFrontRefImage] = useState<string | null>(null);
  const [frontRefinement, setFrontRefinement] = useState('');
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const liveServiceRef = useRef<GeminiLiveService | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refImageInputRef = useRef<HTMLInputElement>(null);
  const chatImageInputRef = useRef<HTMLInputElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPackage, setIsExportingPackage] = useState(false);
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isSendingToChat, setIsSendingToChat] = useState(false);
  const [chatTargets, setChatTargets] = useState<{id: string, name: string, type: 'dm'|'group'}[]>([]);
  const [selectedChatTarget, setSelectedChatTarget] = useState('');

  const isOwner = auth.currentUser && memory.ownerId === auth.currentUser.uid;

  useEffect(() => {
      if (cardId) {
          getCard(cardId).then(data => {
              if (data) setMemory(data);
          }).catch(e => console.error("Failed to load card", e));
      }
  }, [cardId]);

  useEffect(() => {
    if (memory.googlePhotosUrl) {
        const url = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(memory.googlePhotosUrl)}`;
        fetch(url, { mode: 'cors' })
            .then(res => res.blob())
            .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => setQrCodeBase64(reader.result as string);
                reader.readAsDataURL(blob);
            })
            .catch(() => setQrCodeBase64(url));
    } else {
        setQrCodeBase64(null);
    }
  }, [memory.googlePhotosUrl]);

  useEffect(() => {
      liveServiceRef.current = new GeminiLiveService();
      liveServiceRef.current.initializeAudio();
      return () => liveServiceRef.current?.disconnect();
  }, []);

  useEffect(() => {
      if (transcriptEndRef.current) {
          transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
  }, [transcript, activeTab]);

  const handleLiveToggle = async () => {
      if (isLiveActive) {
          liveServiceRef.current?.disconnect();
          setIsLiveActive(false);
      } else {
          try {
              const sysPrompt = `You are Elf, a helpful holiday card assistant... Recipient: ${memory.recipientName || "Unknown"}`;
              await liveServiceRef.current?.connect("Puck", sysPrompt, {
                  onOpen: () => setIsLiveActive(true),
                  onClose: () => setIsLiveActive(false),
                  onError: () => setIsLiveActive(false),
                  onVolumeUpdate: () => {},
                  onTranscript: (text, isUser) => {
                      const role = isUser ? 'user' : 'ai';
                      setTranscript(prev => {
                          if (prev.length > 0 && prev[prev.length - 1].role === role) {
                              return [...prev.slice(0, -1), { ...prev[prev.length - 1], text: prev[prev.length - 1].text + text }];
                          }
                          return [...prev, { role, text, timestamp: Date.now() }];
                      });
                  },
                  onToolCall: async (toolCall) => {
                      for (const fc of toolCall.functionCalls) {
                          if (fc.name === 'update_card') {
                              setMemory(prev => ({ ...prev, ...fc.args }));
                              liveServiceRef.current?.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { result: "Card updated!" } }] });
                          }
                      }
                  }
              }, [{ functionDeclarations: [updateCardTool] }]);
          } catch(e) { alert("Failed to connect live service."); }
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
      const setter = type === 'song' ? setIsGeneratingSong : setIsGeneratingVoice;
      setter(true);
      try {
          let text = type === 'song' ? await generateSongLyrics(memory) : memory.cardMessage;
          if (type === 'song') setMemory(prev => ({ ...prev, songLyrics: text }));
          const audioUrl = await generateCardAudio(text, type === 'song' ? 'Fenrir' : 'Kore');
          setMemory(prev => type === 'song' ? { ...prev, songUrl: audioUrl } : { ...prev, voiceMessageUrl: audioUrl });
      } catch(e) { alert("Audio failed."); } finally { setter(false); }
  };
  
  const playAudio = (url: string) => {
      if (playingUrl === url) { audioRef.current?.pause(); setPlayingUrl(null); return; }
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audio.crossOrigin = "anonymous"; 
      audioRef.current = audio;
      audio.onended = () => setPlayingUrl(null);
      audio.play().then(() => setPlayingUrl(url)).catch(() => setPlayingUrl(null));
  };

  const handleGenImage = async (isBack = false) => {
      const setter = isBack ? setIsGeneratingBackImage : setIsGeneratingImage;
      setter(true);
      try {
          let style = memory.theme === 'chinese-poem' ? 'Ink wash painting, traditional Chinese' : 'High quality, festive art';
          const imgUrl = await generateCardImage(memory, style, !isBack ? (frontRefImage || undefined) : undefined, !isBack ? frontRefinement : undefined, isBack ? '16:9' : '3:4');
          setMemory(prev => isBack ? ({ ...prev, backImageUrl: imgUrl }) : ({ ...prev, coverImageUrl: imgUrl }));
      } catch(e) { alert("Failed to generate image."); } finally { setter(false); }
  };

  const generatePDFBlob = async (): Promise<Blob | null> => {
      try {
          const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [360, 540] });
          for (let i = 0; i <= 5; i++) {
              const el = document.getElementById(`export-card-page-${i}`);
              if (el) {
                  const canvas = await html2canvas(el, { scale: 2, useCORS: true, width: 360, height: 540 });
                  const imgData = canvas.toDataURL('image/jpeg', 0.95);
                  if (i > 0) pdf.addPage();
                  pdf.addImage(imgData, 'JPEG', 0, 0, 360, 540);
              }
          }
          return pdf.output('blob');
      } catch(e) { return null; }
  };

  const handleExportPDF = async () => {
      setIsExporting(true);
      const blob = await generatePDFBlob();
      if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = `Card.pdf`; a.click();
      }
      setIsExporting(false);
  };

  const handlePublishAndShare = async () => {
      if (!auth.currentUser) return;
      setIsPublishing(true);
      try {
          const newCardId = await saveCard(memory, cardId); 
          setShareLink(`${window.location.origin}?view=card&id=${newCardId}`);
          setShowShareModal(true);
      } catch(e) { alert("Failed to publish."); } finally { setIsPublishing(false); }
  };

  const getPageLabel = (page: number) => {
      switch(page) {
          case 0: return 'Front'; case 1: return 'Message'; case 2: return 'Photos'; case 3: return 'Back'; case 4: return 'Voice'; case 5: return 'Song'; default: return 'Page';
      }
  };

  const getDynamicFontSize = (text: string) => {
      const len = text ? text.length : 0;
      if (len > 300) return 'text-sm leading-relaxed';
      if (len > 150) return 'text-lg leading-relaxed';
      return 'text-2xl leading-loose';
  };

  const renderCardContent = (page: number) => (
      <div className={`w-full h-full flex flex-col relative overflow-hidden ${memory.theme === 'chinese-poem' ? 'bg-[#f5f0e1]' : 'bg-white'}`}>
          {page === 0 && (memory.coverImageUrl ? <div className="absolute inset-0 z-0" style={{ backgroundImage: `url(${memory.coverImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }} /> : <div className="w-full h-full bg-slate-200 flex items-center justify-center"><Sparkles size={64} className="text-white/40"/></div>)}
          {page === 1 && (
              <div className="p-10 flex flex-col items-center justify-center h-full text-center">
                  <p className={`${memory.fontFamily || 'font-script'} text-slate-800 ${getDynamicFontSize(memory.cardMessage)}`} style={{ fontSize: memory.fontSizeScale ? `${memory.fontSizeScale * 0.9}em` : undefined }}>{memory.cardMessage}</p>
              </div>
          )}
          {page === 2 && (
              <div className="p-6 h-full flex flex-col">
                  <div className="grid grid-cols-2 gap-4 flex-1">
                      {memory.userImages.slice(0,4).map((img, i) => <div key={i} className="bg-slate-100 rounded-lg overflow-hidden border border-slate-200"><img src={img} className="w-full h-full object-cover"/></div>)}
                  </div>
              </div>
          )}
          {page === 3 && (
              <div className="p-10 h-full flex flex-col items-center justify-between text-center">
                  {memory.backImageUrl && <img src={memory.backImageUrl} className="w-full h-32 object-cover rounded-xl"/>}
                  {qrCodeBase64 && <img src={qrCodeBase64} className="w-24 h-24"/>}
                  <p className="text-[10px] font-bold text-slate-400">AIVoiceCast Studios</p>
              </div>
          )}
          {page === 4 && (
              <div className="p-10 h-full flex flex-col items-center justify-center gap-6">
                  <button onClick={() => memory.voiceMessageUrl && playAudio(memory.voiceMessageUrl)} className="w-20 h-20 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-xl"><Volume2 size={32}/></button>
                  <p className="font-bold text-slate-800">Voice Greeting</p>
              </div>
          )}
          {page === 5 && (
              <div className="p-10 h-full flex flex-col items-center justify-center gap-6">
                  <button onClick={() => memory.songUrl && playAudio(memory.songUrl)} className="w-20 h-20 bg-pink-600 text-white rounded-full flex items-center justify-center shadow-xl"><Music size={32}/></button>
                  <p className="font-bold text-slate-800">Holiday Song</p>
              </div>
          )}
      </div>
  );

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
          
          {!isViewer && (
          <div className="w-full md:w-96 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 h-full overflow-hidden z-30">
              {/* PINNED HEADER: TABS */}
              <div className="flex-shrink-0 flex border-b border-slate-800 bg-slate-900">
                  <button onClick={() => setActiveTab('chat')} className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab==='chat' ? 'bg-slate-800 text-white border-b-2 border-indigo-500' : 'text-slate-500'}`}>Elf Assistant</button>
                  <button onClick={() => setActiveTab('settings')} className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab==='settings' ? 'bg-slate-800 text-white border-b-2 border-indigo-500' : 'text-slate-500'}`}>Edit context</button>
              </div>

              {/* SCROLLABLE MIDDLE: FORMS */}
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                  {activeTab === 'settings' ? (
                      <div className="flex flex-col h-full overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-800">
                            <div className="space-y-4">
                                <label className="text-xs font-bold text-slate-500 uppercase">Card Settings</label>
                                <select value={memory.occasion} onChange={e => setMemory({...memory, occasion: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-white outline-none">
                                    <option value="Holiday">Happy Holidays</option><option value="Christmas">Merry Christmas</option><option value="Birthday">Happy Birthday</option>
                                </select>
                                <div className="grid grid-cols-2 gap-2">
                                    {['festive', 'cozy', 'minimal', 'chinese-poem'].map(t => <button key={t} onClick={() => setMemory({...memory, theme: t as any})} className={`py-2 text-xs font-bold rounded-lg border capitalize ${memory.theme === t ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>{t.replace('-', ' ')}</button>)}
                                </div>
                                <textarea rows={2} placeholder="Theme details..." value={memory.customThemePrompt || ''} onChange={e => setMemory({...memory, customThemePrompt: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-white outline-none resize-none"/>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-white flex items-center gap-2"><Edit3 size={16} /> Editing: {getPageLabel(activePage)}</h3>
                                {activePage === 0 && (
                                    <div className="space-y-4">
                                        <button onClick={() => handleGenImage(false)} disabled={isGeneratingImage} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2">
                                            {isGeneratingImage ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>} Generate Front Art
                                        </button>
                                        <input type="text" placeholder="Refine image: e.g. 'A cat in snow'" value={frontRefinement} onChange={e => setFrontRefinement(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white"/>
                                    </div>
                                )}
                                {activePage === 1 && (
                                    <div className="space-y-4">
                                        <button onClick={handleGenText} disabled={isGeneratingText} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2">
                                            {isGeneratingText ? <Loader2 size={12} className="animate-spin"/> : <Wand2 size={12}/>} AI Write Message
                                        </button>
                                        <textarea rows={6} value={memory.cardMessage} onChange={e => setMemory({...memory, cardMessage: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-white outline-none resize-none"/>
                                    </div>
                                )}
                                {activePage === 4 && <button onClick={() => handleGenAudio('message')} disabled={isGeneratingVoice} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2">{isGeneratingVoice ? <Loader2 size={12} className="animate-spin"/> : <Mic size={12}/>} Generate Voice</button>}
                                {activePage === 5 && <button onClick={() => handleGenAudio('song')} disabled={isGeneratingSong} className="w-full py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2">{isGeneratingSong ? <Loader2 size={12} className="animate-spin"/> : <Music size={12}/>} Generate Song</button>}
                            </div>
                        </div>

                        {/* PINNED FOOTER: TALK TO ELF (In Settings) */}
                        <div className="flex-shrink-0 p-4 border-t border-slate-800 bg-slate-950 flex flex-col gap-2">
                            <button onClick={() => setActiveTab('chat')} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3.5 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"><Sparkles size={18} /> Talk to Elf</button>
                        </div>
                      </div>
                  ) : (
                      <div className="relative h-full flex flex-col bg-slate-900 z-30">
                          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-800 pb-24">
                              {transcript.length === 0 && <div className="text-center text-slate-500 text-sm py-10">Elf is ready. Tap <strong>Talk to Elf</strong> below.</div>}
                              {transcript.map((t, i) => <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] p-3 rounded-xl text-xs whitespace-pre-wrap ${t.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>{t.text}</div></div>)}
                              <div ref={transcriptEndRef} className="h-4"></div>
                          </div>
                          
                          {/* PINNED FOOTER: TALK TO ELF (In Chat) */}
                          <div className="absolute bottom-0 left-0 w-full h-20 p-4 border-t border-slate-800 bg-slate-900 z-10 flex items-center gap-3">
                                <button onClick={handleLiveToggle} className={`flex-1 h-12 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${isLiveActive ? 'bg-red-600 text-white animate-pulse' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}>{isLiveActive ? <MicOff size={20}/> : <Mic size={20}/>}<span className="text-sm">{isLiveActive ? 'End Session' : 'Talk to Elf'}</span></button>
                                <button onClick={() => chatImageInputRef.current?.click()} className="h-12 w-12 flex items-center justify-center rounded-xl bg-slate-800 border border-slate-700 text-slate-400"><Camera size={20}/></button>
                          </div>
                          <input type="file" ref={chatImageInputRef} className="hidden" accept="image/*" onChange={async (e) => {
                              if (e.target.files?.[0]) {
                                  const base64 = await resizeImage(e.target.files[0], 512, 0.7);
                                  liveServiceRef.current?.sendVideo(base64.split(',')[1], e.target.files[0].type);
                                  setTranscript(prev => [...prev, { role: 'user', text: '📷 [Sent Image]', timestamp: Date.now() }]);
                              }
                          }}/>
                      </div>
                  )}
              </div>
          </div>
          )}

          {/* RIGHT PANEL: PREVIEW */}
          <div className="flex-1 bg-slate-950 p-4 md:p-8 flex flex-col items-center justify-center overflow-hidden relative">
              
              {/* TOP TOOLBAR: PAGINATION & EXPORT - ALWAYS PINNED */}
              <div className="flex-shrink-0 flex items-center gap-4 mb-6 bg-slate-900 p-2 rounded-full border border-slate-800 shadow-xl z-20">
                  <button onClick={onBack} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-full transition-colors"><ArrowLeft size={18} /></button>
                  <div className="w-px h-6 bg-slate-800"></div>
                  {!isViewer && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => setActivePage(p => Math.max(0, p - 1))} disabled={activePage === 0} className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full disabled:opacity-30 transition-colors"><ChevronLeft size={18} /></button>
                        <span className="text-xs font-bold text-slate-300 min-w-[100px] text-center uppercase tracking-wider">{getPageLabel(activePage)}</span>
                        <button onClick={() => setActivePage(p => Math.min(5, p + 1))} disabled={activePage === 5} className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full disabled:opacity-30 transition-colors"><ChevronRight size={18} /></button>
                      </div>
                  )}
                  <div className="w-px h-6 bg-slate-800"></div>
                  <div className="flex gap-1 pr-1">
                      {isViewer && isOwner && <button onClick={() => setIsViewer(false)} className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded-full text-white"><Edit size={16} /></button>}
                      <button onClick={handleExportPDF} disabled={isExporting} className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full transition-colors">{isExporting ? <Loader2 size={16} className="animate-spin"/> : <Download size={16} />}</button>
                      {!isViewer && <button onClick={handlePublishAndShare} disabled={isPublishing} className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-colors shadow-lg">{isPublishing ? <Loader2 size={16} className="animate-spin"/> : <Share2 size={16} />}</button>}
                  </div>
              </div>

              {/* CARD PREVIEW AREA - SCROLLABLE CONTENT */}
              <div className="flex-1 w-full flex flex-col items-center justify-center min-h-0 relative">
                  {isViewer ? (
                      <div className="w-full h-full overflow-y-auto px-4 pb-8 flex flex-col items-center gap-12 py-8 scrollbar-thin scrollbar-thumb-slate-800">
                          {[0, 1, 2, 3, 4, 5].map((pageNum) => (
                              <div key={pageNum} className="w-[330px] h-[495px] shadow-2xl relative overflow-hidden flex flex-col rounded-xl shrink-0">
                                  {renderCardContent(pageNum)}
                              </div>
                          ))}
                      </div>
                  ) : (
                      <div className="flex-1 w-full flex items-center justify-center p-4">
                          <div ref={cardRef} className="w-[330px] h-[495px] shadow-2xl relative overflow-hidden flex flex-col transition-all duration-300 rounded-xl shrink-0">
                              {renderCardContent(activePage)}
                          </div>
                      </div>
                  )}
              </div>

              {/* HIDDEN EXPORT AREA */}
              {isExporting || isExportingPackage ? (
                  <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', opacity: 0 }}>
                      {[0, 1, 2, 3, 4, 5].map(pageNum => <div key={pageNum} id={`export-card-page-${pageNum}`} className="w-[330px] h-[495px] overflow-hidden flex flex-col relative">{renderCardContent(pageNum)}</div>)}
                  </div>
              ) : null}

          </div>
      </div>
      
      {showShareModal && shareLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
           <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
               <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold text-white flex items-center gap-2"><Sparkles className="text-emerald-400"/> Card Published!</h3><button onClick={() => setShowShareModal(false)}><X className="text-slate-400"/></button></div>
               <p className="text-sm text-slate-300 mb-4">Your interactive holiday card is live. Share this link for friends to view and listen.</p>
               <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex items-center gap-2 mb-4">
                  <span className="flex-1 text-xs text-slate-300 truncate font-mono">{shareLink}</span>
                  <button onClick={() => navigator.clipboard.writeText(shareLink)} className="p-1.5 hover:bg-slate-800 rounded text-slate-400"><Share2 size={14}/></button>
               </div>
           </div>
        </div>
      )}

    </div>
  );
};
