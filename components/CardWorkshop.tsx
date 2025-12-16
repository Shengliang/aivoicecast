import React, { useState, useRef, useEffect } from 'react';
import { AgentMemory, TranscriptItem } from '../types';
import { ArrowLeft, Sparkles, Wand2, Image as ImageIcon, Type, Download, Share2, Printer, RefreshCw, Send, Mic, MicOff, Gift, Heart, Loader2, ChevronRight, ChevronLeft, Upload, QrCode, X } from 'lucide-react';
import { generateCardMessage, generateCardImage } from '../services/cardGen';
import { GeminiLiveService } from '../services/geminiLive';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { uploadFileToStorage } from '../services/firestoreService';
import { auth } from '../services/firebaseConfig';

interface CardWorkshopProps {
  onBack: () => void;
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
  generatedAt: new Date().toISOString()
};

// Helper to detect if text contains Chinese characters
const isChinese = (text: string) => {
    return /[\u4e00-\u9fa5]/.test(text);
};

export const CardWorkshop: React.FC<CardWorkshopProps> = ({ onBack }) => {
  const [memory, setMemory] = useState<AgentMemory>(DEFAULT_MEMORY);
  const [activeTab, setActiveTab] = useState<'settings' | 'chat'>('settings');
  const [activePage, setActivePage] = useState<number>(0); // 0: Front, 1: Letter, 2: Photos, 3: Back
  
  const [isGeneratingText, setIsGeneratingText] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingBackImage, setIsGeneratingBackImage] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  
  // Image Generation Refinements
  const [frontRefImage, setFrontRefImage] = useState<string | null>(null);
  const [frontRefinement, setFrontRefinement] = useState('');
  
  // Live Chat State
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const liveServiceRef = useRef<GeminiLiveService | null>(null);
  
  // Ref for card preview to capture
  const cardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refImageInputRef = useRef<HTMLInputElement>(null);

  // Initialize Live Service
  useEffect(() => {
      liveServiceRef.current = new GeminiLiveService();
      liveServiceRef.current.initializeAudio();
      return () => {
          liveServiceRef.current?.disconnect();
      };
  }, []);

  const handleLiveToggle = async () => {
      if (isLiveActive) {
          liveServiceRef.current?.disconnect();
          setIsLiveActive(false);
      } else {
          try {
              let sysPrompt = `You are "Elf", a cheerful holiday card assistant. Help the user write a card for ${memory.recipientName || 'a friend'}.`;
              
              if (memory.theme === 'chinese-poem') {
                  sysPrompt = `You are a Chinese Poetry Master (Shifu). 
                  Help the user compose a classical Chinese poem (Jueju or Lushi) for a greeting card.
                  Current Occasion: ${memory.occasion}. Recipient: ${memory.recipientName}.
                  When the user gives a topic, generate a 4-line poem in Chinese.
                  Explain the meaning briefly in English afterwards.`;
              }

              await liveServiceRef.current?.connect('Puck', sysPrompt, {
                  onOpen: () => setIsLiveActive(true),
                  onClose: () => setIsLiveActive(false),
                  onError: (e) => { console.error(e); alert("Connection error"); setIsLiveActive(false); },
                  onVolumeUpdate: () => {},
                  onTranscript: (text, isUser) => {
                      setTranscript(prev => [...prev, { role: isUser ? 'user' : 'ai', text, timestamp: Date.now() }]);
                  }
              });
          } catch(e) {
              console.error(e);
          }
      }
  };

  const handleGenText = async () => {
      setIsGeneratingText(true);
      try {
          const msg = await generateCardMessage(memory);
          setMemory(prev => ({ ...prev, cardMessage: msg }));
      } catch(e) {
          alert("Failed to generate text");
      } finally {
          setIsGeneratingText(false);
      }
  };

  const handleGenImage = async (isBack = false) => {
      const setter = isBack ? setIsGeneratingBackImage : setIsGeneratingImage;
      setter(true);
      try {
          let style = '';
          if (memory.theme === 'chinese-poem') {
               style = 'Ink wash painting (Shui-mo), minimalistic, Zen, traditional Chinese art style';
          } else {
               style = memory.theme === 'festive' ? 'Classic Christmas, red and gold, cozy fireplace' :
                        memory.theme === 'minimal' ? 'Modern abstract, winter palette, clean lines' :
                        memory.theme === 'cozy' ? 'Warm watercolor, hot cocoa, knitted textures' :
                        'Elegant typography, gratitude, floral border';
          }
          
          // Modify prompt for page context
          const prompt = isBack 
              ? style + ", background pattern or texture, minimalist, suitable for back cover" 
              : style + ", highly detailed cover art, main subject centered, cinematic";
          
          // Use reference inputs ONLY for front image (activePage === 0)
          const refImg = (!isBack && activePage === 0) ? (frontRefImage || undefined) : undefined;
          const refinement = (!isBack && activePage === 0) ? frontRefinement : undefined;
          
          const imgUrl = await generateCardImage(memory, prompt, refImg, refinement);
          setMemory(prev => isBack ? ({ ...prev, backImageUrl: imgUrl }) : ({ ...prev, coverImageUrl: imgUrl }));
      } catch(e) {
          alert("Failed to generate image. Ensure you have a valid API Key.");
      } finally {
          setter(false);
      }
  };
  
  const handleRefImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onloadend = () => {
              setFrontRefImage(reader.result as string);
          };
          reader.readAsDataURL(file);
      }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!auth.currentUser) {
          alert("Please sign in to upload photos.");
          return;
      }
      if (e.target.files && e.target.files.length > 0) {
          setIsUploadingPhoto(true);
          const newPhotos: string[] = [];
          
          try {
              for (const file of Array.from(e.target.files) as File[]) {
                  const path = `cards/${auth.currentUser.uid}/photos/${Date.now()}_${file.name}`;
                  const url = await uploadFileToStorage(path, file);
                  newPhotos.push(url);
              }
              setMemory(prev => ({
                  ...prev,
                  userImages: [...prev.userImages, ...newPhotos]
              }));
          } catch(err) {
              console.error(err);
              alert("Upload failed.");
          } finally {
              setIsUploadingPhoto(false);
          }
      }
  };

  const handleDeletePhoto = (index: number) => {
      setMemory(prev => ({
          ...prev,
          userImages: prev.userImages.filter((_, i) => i !== index)
      }));
  };

  const handleExportPDF = async () => {
      if (!cardRef.current) return;
      try {
          const canvas = await html2canvas(cardRef.current, { scale: 2, useCORS: true });
          const imgData = canvas.toDataURL('image/png');
          
          const pdf = new jsPDF({
              orientation: 'portrait',
              unit: 'px',
              format: [canvas.width, canvas.height]
          });
          
          pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
          pdf.save(`Card_Page${activePage + 1}.pdf`);
      } catch(e) {
          console.error(e);
          alert("Export failed");
      }
  };

  const handleShareLink = async () => {
      if (!auth.currentUser) {
          alert("Please sign in to share.");
          return;
      }
      const confirmShare = confirm("This creates a public link to the current card page image. Continue?");
      if(!confirmShare) return;

      if (!cardRef.current) return;

      try {
          const canvas = await html2canvas(cardRef.current, { scale: 1 });
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
          if (!blob) throw new Error("Canvas blob failed");
          
          const path = `cards/${auth.currentUser.uid}/shared/${Date.now()}.jpg`;
          const url = await uploadFileToStorage(path, blob);
          
          await navigator.clipboard.writeText(url);
          alert("Link copied to clipboard!");
      } catch(e) {
          console.error(e);
          alert("Share failed");
      }
  };

  const getPageLabel = (page: number) => {
      switch(page) {
          case 0: return 'Front Cover';
          case 1: return 'Message (Inner Left)';
          case 2: return 'Photos (Inner Right)';
          case 3: return 'Back Cover';
          default: return `Page ${page + 1}`;
      }
  };

  // Helper to extract first char for the seal
  const getSealChar = (name: string) => {
      return name ? name.trim().charAt(0).toUpperCase() : 'AI';
  };
  
  // Determine text direction style - Only vertical if actually Chinese characters
  const isVertical = memory.theme === 'chinese-poem' && isChinese(memory.cardMessage);

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-900 flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                  <ArrowLeft size={20} />
              </button>
              <h1 className="text-xl font-holiday font-bold text-white flex items-center gap-2">
                  <Gift className="text-red-500" /> Holiday Card Workshop
              </h1>
          </div>
          <div className="flex gap-2">
              <button onClick={handleExportPDF} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold transition-colors">
                  <Download size={14} /> PDF Page
              </button>
              <button onClick={handleShareLink} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold transition-colors shadow-lg">
                  <Share2 size={14} /> Share
              </button>
          </div>
      </div>

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
          
          {/* LEFT PANEL: CONTROLS */}
          <div className="w-full md:w-96 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
              <div className="flex border-b border-slate-800">
                  <button onClick={() => setActiveTab('settings')} className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab==='settings' ? 'bg-slate-800 text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`}>Edit</button>
                  <button onClick={() => setActiveTab('chat')} className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab==='chat' ? 'bg-slate-800 text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`}>Elf Assistant</button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {activeTab === 'settings' ? (
                      <>
                          {/* Common Settings */}
                          <div className="space-y-3 pb-4 border-b border-slate-800">
                              <label className="text-xs font-bold text-slate-500 uppercase">Basics</label>
                              <input type="text" placeholder="To: Recipient Name" value={memory.recipientName} onChange={e => setMemory({...memory, recipientName: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-white focus:border-indigo-500 outline-none"/>
                              <input type="text" placeholder="From: Sender Name" value={memory.senderName} onChange={e => setMemory({...memory, senderName: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-white focus:border-indigo-500 outline-none"/>
                              <select value={memory.occasion} onChange={e => setMemory({...memory, occasion: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-white outline-none">
                                  <option value="Holiday">Happy Holidays</option>
                                  <option value="Christmas">Merry Christmas</option>
                                  <option value="New Year">Happy New Year</option>
                                  <option value="Thanks">Thank You</option>
                                  <option value="Birthday">Happy Birthday</option>
                              </select>
                              
                              <label className="text-xs font-bold text-slate-500 uppercase mt-4 block">Visual Theme & Style</label>
                              <div className="grid grid-cols-2 gap-2 mb-2">
                                  {['festive', 'cozy', 'minimal', 'chinese-poem'].map(t => (
                                      <button 
                                          key={t}
                                          onClick={() => setMemory({...memory, theme: t as any})}
                                          className={`py-2 text-xs font-bold rounded-lg border capitalize ${memory.theme === t ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                                      >
                                          {t.replace('-', ' ')}
                                      </button>
                                  ))}
                              </div>
                              <textarea
                                  rows={2}
                                  placeholder={memory.theme === 'chinese-poem' ? "E.g. Plum blossoms in winter, solitude, tea" : "Describe the main visual theme..."}
                                  value={memory.customThemePrompt || ''}
                                  onChange={e => setMemory({...memory, customThemePrompt: e.target.value})}
                                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-white focus:border-indigo-500 outline-none resize-none"
                              />
                          </div>

                          {/* Contextual Settings based on Page */}
                          <div className="space-y-4">
                              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                  <Edit3Icon /> 
                                  <span>Editing: {getPageLabel(activePage)}</span>
                              </h3>

                              {activePage === 0 && (
                                  <div className="space-y-4">
                                      {/* Specific Controls for Front Image Adjustment */}
                                      <div className="space-y-2 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                                          <label className="text-xs font-bold text-indigo-400 uppercase">Adjust Generation</label>
                                          
                                          {/* Text Refinement */}
                                          <input 
                                              type="text" 
                                              placeholder="Specifics: e.g. 'A little girl', 'Golden Retriever'" 
                                              value={frontRefinement}
                                              onChange={(e) => setFrontRefinement(e.target.value)}
                                              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-indigo-500 outline-none"
                                          />

                                          {/* Reference Image Upload */}
                                          <div className="flex items-center gap-2">
                                              {frontRefImage ? (
                                                  <div className="relative w-12 h-12 bg-slate-800 rounded border border-slate-700 overflow-hidden shrink-0">
                                                      <img src={frontRefImage} className="w-full h-full object-cover" />
                                                      <button 
                                                          onClick={() => setFrontRefImage(null)}
                                                          className="absolute top-0 right-0 bg-red-500 text-white rounded-bl p-0.5"
                                                      >
                                                          <X size={8} />
                                                      </button>
                                                  </div>
                                              ) : (
                                                  <button 
                                                      onClick={() => refImageInputRef.current?.click()}
                                                      className="w-12 h-12 flex flex-col items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-700 border-dashed rounded text-[9px] text-slate-400 gap-1 transition-colors shrink-0"
                                                  >
                                                      <Upload size={12}/> Ref Photo
                                                  </button>
                                              )}
                                              <div className="text-[10px] text-slate-500 leading-tight">
                                                  Upload a photo to guide the AI style or subject (e.g. your daughter).
                                              </div>
                                              <input 
                                                  type="file" 
                                                  ref={refImageInputRef} 
                                                  className="hidden" 
                                                  accept="image/*" 
                                                  onChange={handleRefImageUpload}
                                              />
                                          </div>
                                      </div>

                                      <div className="flex justify-between items-center">
                                          <label className="text-xs font-bold text-slate-500 uppercase">Front Image</label>
                                          <button onClick={() => handleGenImage(false)} disabled={isGeneratingImage} className="text-pink-400 hover:text-white text-xs flex items-center gap-1">
                                              {isGeneratingImage ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>} Generate
                                          </button>
                                      </div>
                                      {memory.coverImageUrl ? (
                                          <div className="relative group rounded-lg overflow-hidden border border-slate-700">
                                              <img src={memory.coverImageUrl} className="w-full h-32 object-cover" />
                                              <button onClick={() => setMemory({...memory, coverImageUrl: undefined})} className="absolute top-1 right-1 bg-red-500/80 p-1 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                                  <RefreshCw size={12} />
                                              </button>
                                          </div>
                                      ) : (
                                          <div className="h-32 bg-slate-800/50 border border-slate-700 border-dashed rounded-lg flex flex-col items-center justify-center text-slate-500 text-xs">
                                              <ImageIcon size={24} className="mb-2 opacity-50"/>
                                              Click Generate for Front Art
                                          </div>
                                      )}
                                  </div>
                              )}

                              {activePage === 1 && (
                                  <div className="space-y-3">
                                      <div className="flex justify-between items-center">
                                          <label className="text-xs font-bold text-slate-500 uppercase">Message Body</label>
                                          <button onClick={handleGenText} disabled={isGeneratingText} className="text-indigo-400 hover:text-white text-xs flex items-center gap-1">
                                              {isGeneratingText ? <Loader2 size={12} className="animate-spin"/> : <Wand2 size={12}/>} AI Write
                                          </button>
                                      </div>
                                      <textarea 
                                          rows={6} 
                                          value={memory.cardMessage} 
                                          onChange={e => setMemory({...memory, cardMessage: e.target.value})}
                                          className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-white focus:border-indigo-500 outline-none resize-none font-script text-lg leading-relaxed"
                                          placeholder="Type your message here..."
                                      />
                                  </div>
                              )}

                              {activePage === 2 && (
                                  <div className="space-y-3">
                                      <label className="text-xs font-bold text-slate-500 uppercase">Photo Collage</label>
                                      <div onClick={() => fileInputRef.current?.click()} className="p-4 border-2 border-dashed border-slate-700 rounded-xl hover:border-indigo-500 hover:bg-slate-800/50 cursor-pointer text-center transition-all">
                                          {isUploadingPhoto ? <Loader2 className="animate-spin mx-auto text-indigo-400"/> : <Upload className="mx-auto text-slate-500 mb-2"/>}
                                          <p className="text-xs text-slate-400">Click to upload photos</p>
                                          <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*" onChange={handlePhotoUpload}/>
                                      </div>
                                      
                                      <div className="grid grid-cols-2 gap-2">
                                          {memory.userImages.map((img, i) => (
                                              <div key={i} className="relative group aspect-square bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
                                                  <img src={img} className="w-full h-full object-cover" />
                                                  <button onClick={() => handleDeletePhoto(i)} className="absolute top-1 right-1 bg-red-500/80 p-1 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                                      <RefreshCw size={10} />
                                                  </button>
                                              </div>
                                          ))}
                                      </div>
                                  </div>
                              )}

                              {activePage === 3 && (
                                  <div className="space-y-4">
                                      <div className="space-y-2">
                                          <div className="flex justify-between items-center">
                                              <label className="text-xs font-bold text-slate-500 uppercase">Back Art</label>
                                              <button onClick={() => handleGenImage(true)} disabled={isGeneratingBackImage} className="text-pink-400 hover:text-white text-xs flex items-center gap-1">
                                                  {isGeneratingBackImage ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>} Generate
                                              </button>
                                          </div>
                                          {memory.backImageUrl && (
                                              <img src={memory.backImageUrl} className="w-full h-24 object-cover rounded-lg border border-slate-700" />
                                          )}
                                      </div>
                                      
                                      <div className="space-y-2">
                                          <label className="text-xs font-bold text-slate-500 uppercase">Google Photos Link</label>
                                          <input 
                                              type="text" 
                                              value={memory.googlePhotosUrl || ''} 
                                              onChange={e => setMemory({...memory, googlePhotosUrl: e.target.value})}
                                              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white"
                                              placeholder="https://photos.app.goo.gl/..."
                                          />
                                          {memory.googlePhotosUrl && (
                                              <div className="flex items-center gap-2 p-2 bg-emerald-900/20 border border-emerald-900/50 rounded-lg">
                                                  <QrCode size={14} className="text-emerald-400"/>
                                                  <span className="text-[10px] text-emerald-200">QR Code will appear on card.</span>
                                              </div>
                                          )}
                                      </div>
                                  </div>
                              )}
                          </div>
                      </>
                  ) : (
                      <div className="flex flex-col h-full">
                          <div className="flex-1 overflow-y-auto space-y-4 pb-4">
                              {transcript.length === 0 && (
                                  <div className="text-center text-slate-500 text-sm py-8">
                                      Tap the mic to talk to Elf, your holiday assistant.
                                  </div>
                              )}
                              {transcript.map((t, i) => (
                                  <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                      <div className={`max-w-[85%] p-3 rounded-xl text-xs ${t.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                                          {t.text}
                                      </div>
                                  </div>
                              ))}
                          </div>
                          
                          <button 
                              onClick={handleLiveToggle}
                              className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${isLiveActive ? 'bg-red-500 text-white animate-pulse' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg'}`}
                          >
                              {isLiveActive ? <MicOff size={20}/> : <Mic size={20}/>}
                              {isLiveActive ? 'Stop Talking' : 'Talk to Elf'}
                          </button>
                      </div>
                  )}
              </div>
          </div>

          {/* RIGHT PANEL: PREVIEW */}
          <div className="flex-1 bg-slate-950 p-4 md:p-8 flex flex-col items-center overflow-auto relative">
              
              {/* Pagination Controls */}
              <div className="flex items-center gap-4 mb-6 bg-slate-900 p-2 rounded-full border border-slate-800 shadow-xl z-10">
                  <button 
                      onClick={() => setActivePage(p => Math.max(0, p - 1))} 
                      disabled={activePage === 0}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                      <ChevronLeft size={20} />
                  </button>
                  <span className="text-sm font-bold text-slate-300 min-w-[140px] text-center select-none">
                      {getPageLabel(activePage)} ({activePage + 1}/4)
                  </span>
                  <button 
                      onClick={() => setActivePage(p => Math.min(3, p + 1))} 
                      disabled={activePage === 3}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                      <ChevronRight size={20} />
                  </button>
              </div>

              {/* Card Canvas */}
              <div 
                  ref={cardRef}
                  className="w-[400px] h-[600px] bg-white text-slate-900 shadow-2xl relative overflow-hidden flex flex-col transition-all duration-300"
                  style={{ 
                      backgroundImage: (memory.theme === 'festive' && activePage !== 2) ? 'url("https://www.transparenttextures.com/patterns/snow.png")' : 'none',
                      backgroundColor: memory.theme === 'chinese-poem' ? '#f5f0e1' : memory.theme === 'minimal' ? '#f8fafc' : memory.theme === 'cozy' ? '#fff7ed' : '#ffffff',
                      // Chinese Rice Paper Texture effect
                      boxShadow: memory.theme === 'chinese-poem' ? 'inset 0 0 40px rgba(0,0,0,0.1)' : ''
                  }}
              >
                  {/* --- PAGE 0: FRONT COVER --- */}
                  {activePage === 0 && (
                      <div className="w-full h-full flex flex-col relative">
                          {memory.coverImageUrl ? (
                              <img src={memory.coverImageUrl} className={`w-full h-full object-cover absolute inset-0 z-0 ${memory.theme === 'chinese-poem' ? 'opacity-90 mix-blend-multiply' : ''}`} style={{ objectFit: 'cover' }} />
                          ) : (
                              <div className={`w-full h-full flex items-center justify-center ${memory.theme === 'festive' ? 'bg-red-800' : 'bg-slate-300'} z-0`}>
                                  <Sparkles className="text-white/20 w-32 h-32" />
                              </div>
                          )}
                          <div className={`z-10 mt-auto p-8 ${memory.theme === 'chinese-poem' ? '' : 'bg-gradient-to-t from-black/80 to-transparent'}`}>
                              <h2 className={`text-5xl text-center drop-shadow-lg ${isVertical ? 'font-chinese-brush text-black vertical-rl ml-auto h-64' : 'font-holiday text-white'}`}>
                                  {memory.occasion}
                              </h2>
                          </div>
                          
                          {/* Chinese Seal Effect */}
                          {memory.theme === 'chinese-poem' && (
                              <div className="absolute bottom-8 left-8 w-12 h-12 border-2 border-red-800 rounded-sm flex items-center justify-center p-1 bg-red-100/50 backdrop-blur-sm">
                                  <div className="w-full h-full bg-red-800 flex items-center justify-center text-white font-chinese-brush text-2xl">
                                      {getSealChar(memory.senderName)}
                                  </div>
                              </div>
                          )}
                      </div>
                  )}

                  {/* --- PAGE 1: MESSAGE (INNER LEFT) --- */}
                  {activePage === 1 && (
                      <div className={`w-full h-full flex flex-col p-10 justify-center text-center relative ${isVertical ? 'items-end' : 'items-center'}`}>
                          {memory.theme !== 'chinese-poem' && (
                             <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-500 via-green-500 to-red-500"></div>
                          )}
                          
                          {/* Heading */}
                          {memory.theme === 'chinese-poem' ? (
                              <h3 className={`font-chinese-brush text-3xl text-red-900 mb-0 opacity-80 ${isVertical ? 'vertical-rl absolute top-10 right-10' : 'mb-8'}`}>
                                  {memory.occasion}
                              </h3>
                          ) : (
                              <h3 className="font-holiday text-3xl text-red-600 mb-8 opacity-80">Season's Greetings</h3>
                          )}

                          {/* Body Text */}
                          <div className={`${isVertical ? 'vertical-rl h-full max-h-[400px] flex flex-wrap-reverse gap-4 items-start text-right pr-16' : ''}`}>
                             <p className={`${memory.theme === 'chinese-poem' ? 'font-chinese-brush text-2xl text-slate-800 leading-loose' : 'font-script text-3xl text-slate-800 leading-loose'}`}>
                                 {memory.cardMessage || "Your message will appear here..."}
                             </p>
                          </div>

                          {/* Decorative Separator */}
                          {memory.theme !== 'chinese-poem' && <div className="mt-12 w-16 h-1 bg-slate-200"></div>}
                      </div>
                  )}

                  {/* --- PAGE 2: PHOTOS (INNER RIGHT) --- */}
                  {activePage === 2 && (
                      <div className={`w-full h-full flex flex-col p-6 ${memory.theme === 'chinese-poem' ? 'bg-[#f5f0e1]' : 'bg-slate-100'}`}>
                          <h3 className="font-bold text-center text-slate-400 text-xs uppercase tracking-widest mb-4">Memories</h3>
                          {memory.userImages.length > 0 ? (
                              <div className={`grid gap-4 w-full h-full ${memory.userImages.length === 1 ? 'grid-cols-1' : memory.userImages.length === 2 ? 'grid-rows-2' : 'grid-cols-2 grid-rows-2'}`}>
                                  {memory.userImages.slice(0, 4).map((img, i) => (
                                      <div key={i} className={`rounded-xl overflow-hidden shadow-sm border ${memory.theme === 'chinese-poem' ? 'border-red-900/20 bg-[#fdfbf7]' : 'border-white bg-white'} p-1 relative`}>
                                          {/* Use absolute positioning to enforce crop within grid cell */}
                                          <img src={img} className="w-full h-full object-cover rounded-lg absolute inset-0 m-1" style={{width: 'calc(100% - 8px)', height: 'calc(100% - 8px)', objectFit: 'cover'}} />
                                      </div>
                                  ))}
                              </div>
                          ) : (
                              <div className="flex-1 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center text-slate-400">
                                  <p className="text-sm">No photos uploaded yet</p>
                              </div>
                          )}
                          <div className="mt-4 text-center">
                              <p className={`${memory.theme === 'chinese-poem' ? 'font-chinese-brush text-2xl text-slate-800' : 'font-script text-xl text-slate-600'}`}>
                                  {memory.theme === 'chinese-poem' ? memory.senderName : `With love, ${memory.senderName}`}
                              </p>
                          </div>
                      </div>
                  )}

                  {/* --- PAGE 3: BACK COVER --- */}
                  {activePage === 3 && (
                      <div className={`w-full h-full flex flex-col items-center justify-between p-12 relative ${memory.theme === 'chinese-poem' ? 'bg-[#f5f0e1]' : 'bg-white'}`}>
                          {memory.backImageUrl ? (
                              <div className="w-full h-48 overflow-hidden rounded-xl opacity-80">
                                  <img src={memory.backImageUrl} className={`w-full h-full object-cover ${memory.theme === 'chinese-poem' ? 'mix-blend-multiply grayscale sepia-[.3]' : ''}`} style={{ objectFit: 'cover' }} />
                              </div>
                          ) : (
                              <div className="w-full h-48 bg-slate-100 rounded-xl flex items-center justify-center">
                                  <ImageIcon className="text-slate-300" />
                              </div>
                          )}

                          <div className="text-center space-y-4">
                              {memory.googlePhotosUrl ? (
                                  <>
                                      <div className={`p-2 rounded-lg shadow-lg inline-block border ${memory.theme === 'chinese-poem' ? 'bg-[#fdfbf7] border-red-900/10' : 'bg-white border-slate-200'}`}>
                                          <img 
                                              src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(memory.googlePhotosUrl)}`} 
                                              alt="Album QR"
                                              crossOrigin="anonymous"
                                              className="w-32 h-32 mix-blend-multiply"
                                          />
                                      </div>
                                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Scan for Photo Album</p>
                                  </>
                              ) : (
                                  <div className="w-32 h-32 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs text-center p-2">
                                      Add Album Link to see QR Code
                                  </div>
                              )}
                          </div>

                          <div className="text-center">
                              <div className="flex items-center justify-center gap-2 text-slate-400 mb-1">
                                  <Gift size={16} />
                                  <span className="font-holiday font-bold text-lg">AIVoiceCast</span>
                              </div>
                              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Designed with AI</p>
                          </div>
                      </div>
                  )}
              </div>

          </div>
      </div>
    </div>
  );
};

const Edit3Icon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
);