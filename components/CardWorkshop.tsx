
import React, { useState, useRef, useEffect } from 'react';
import { AgentMemory, TranscriptItem } from '../types';
import { ArrowLeft, Sparkles, Wand2, Image as ImageIcon, Type, Download, Share2, Printer, RefreshCw, Send, Mic, MicOff, Gift, Heart, Loader2 } from 'lucide-react';
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
  userImages: [],
  generatedAt: new Date().toISOString()
};

export const CardWorkshop: React.FC<CardWorkshopProps> = ({ onBack }) => {
  const [memory, setMemory] = useState<AgentMemory>(DEFAULT_MEMORY);
  const [activeTab, setActiveTab] = useState<'settings' | 'chat'>('settings');
  const [isGeneratingText, setIsGeneratingText] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  
  // Live Chat State
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const liveServiceRef = useRef<GeminiLiveService | null>(null);
  
  // Ref for card preview to capture
  const cardRef = useRef<HTMLDivElement>(null);

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
              const sysPrompt = `You are "Elf", a cheerful and helpful holiday card assistant. 
              Help the user write a card for ${memory.recipientName || 'a friend'}.
              Current Context: Occasion=${memory.occasion}, Theme=${memory.theme}.
              Be brief, festive, and creative. Ask clarifying questions to make the message personal.`;
              
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

  const handleGenImage = async () => {
      setIsGeneratingImage(true);
      try {
          const style = memory.theme === 'festive' ? 'Classic Christmas, red and gold, cozy fireplace' :
                        memory.theme === 'minimal' ? 'Modern abstract, winter palette, clean lines' :
                        memory.theme === 'cozy' ? 'Warm watercolor, hot cocoa, knitted textures' :
                        'Elegant typography, gratitude, floral border';
          
          const imgUrl = await generateCardImage(memory, style);
          setMemory(prev => ({ ...prev, coverImageUrl: imgUrl }));
      } catch(e) {
          alert("Failed to generate image. Ensure you have a valid API Key.");
      } finally {
          setIsGeneratingImage(false);
      }
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
          pdf.save(`HolidayCard_${memory.recipientName || 'Friend'}.pdf`);
      } catch(e) {
          console.error(e);
          alert("Export failed");
      }
  };

  const handleShareLink = async () => {
      if (!cardRef.current || !auth.currentUser) {
          if (!auth.currentUser) alert("Please sign in to save and share cards.");
          return;
      }
      
      const confirmShare = confirm("This will upload the card image to the cloud to create a link. Continue?");
      if(!confirmShare) return;

      try {
          const canvas = await html2canvas(cardRef.current, { scale: 1 });
          // Convert canvas to blob
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
          if (!blob) throw new Error("Canvas blob failed");
          
          const path = `cards/${auth.currentUser.uid}/${Date.now()}.jpg`;
          const url = await uploadFileToStorage(path, blob);
          
          await navigator.clipboard.writeText(url);
          alert("Link copied to clipboard! You can send this URL to anyone.");
      } catch(e) {
          console.error(e);
          alert("Share failed");
      }
  };

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
                  <Download size={14} /> PDF
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
                  <button onClick={() => setActiveTab('settings')} className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab==='settings' ? 'bg-slate-800 text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`}>Settings</button>
                  <button onClick={() => setActiveTab('chat')} className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab==='chat' ? 'bg-slate-800 text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`}>Elf Assistant</button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {activeTab === 'settings' ? (
                      <>
                          <div className="space-y-3">
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
                          </div>

                          <div className="space-y-3">
                              <label className="text-xs font-bold text-slate-500 uppercase">Theme</label>
                              <div className="grid grid-cols-2 gap-2">
                                  {['festive', 'cozy', 'minimal', 'thanks'].map(t => (
                                      <button 
                                          key={t}
                                          onClick={() => setMemory({...memory, theme: t as any})}
                                          className={`py-2 text-xs font-bold rounded-lg border capitalize ${memory.theme === t ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                                      >
                                          {t}
                                      </button>
                                  ))}
                              </div>
                          </div>

                          <div className="space-y-3">
                              <div className="flex justify-between items-center">
                                  <label className="text-xs font-bold text-slate-500 uppercase">Message</label>
                                  <button onClick={handleGenText} disabled={isGeneratingText} className="text-indigo-400 hover:text-white text-xs flex items-center gap-1">
                                      {isGeneratingText ? <Loader2 size={12} className="animate-spin"/> : <Wand2 size={12}/>} AI Write
                                  </button>
                              </div>
                              <textarea 
                                  rows={4} 
                                  value={memory.cardMessage} 
                                  onChange={e => setMemory({...memory, cardMessage: e.target.value})}
                                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-white focus:border-indigo-500 outline-none resize-none font-script text-lg leading-relaxed"
                              />
                          </div>

                          <div className="space-y-3">
                              <div className="flex justify-between items-center">
                                  <label className="text-xs font-bold text-slate-500 uppercase">Cover Image</label>
                                  <button onClick={handleGenImage} disabled={isGeneratingImage} className="text-pink-400 hover:text-white text-xs flex items-center gap-1">
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
                                      Click Generate to create AI Art
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
          <div className="flex-1 bg-slate-950 p-8 flex items-center justify-center overflow-auto relative">
              
              {/* Card Canvas */}
              <div 
                  ref={cardRef}
                  className="w-[400px] min-h-[600px] bg-white text-slate-900 shadow-2xl relative overflow-hidden flex flex-col"
                  style={{ 
                      backgroundImage: memory.theme === 'festive' ? 'url("https://www.transparenttextures.com/patterns/snow.png")' : 'none',
                      backgroundColor: memory.theme === 'minimal' ? '#f8fafc' : memory.theme === 'cozy' ? '#fff7ed' : '#ffffff' 
                  }}
              >
                  {/* Decorative Header Image */}
                  <div className="h-48 w-full bg-slate-200 relative overflow-hidden shrink-0">
                      {memory.coverImageUrl ? (
                          <img src={memory.coverImageUrl} className="w-full h-full object-cover" />
                      ) : (
                          <div className={`w-full h-full flex items-center justify-center ${memory.theme === 'festive' ? 'bg-red-700' : 'bg-slate-300'}`}>
                              <Sparkles className="text-white/20 w-16 h-16" />
                          </div>
                      )}
                      <div className="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t from-white to-transparent"></div>
                  </div>

                  {/* Body */}
                  <div className="p-8 flex-1 flex flex-col text-center">
                      <h2 className="font-holiday text-4xl text-red-600 mb-6 drop-shadow-sm">
                          {memory.occasion}
                      </h2>
                      
                      <div className="flex-1 flex flex-col justify-center">
                          <p className="font-script text-2xl text-slate-700 leading-relaxed mb-6 px-4">
                              {memory.cardMessage}
                          </p>
                      </div>

                      <div className="mt-8 space-y-1">
                          <p className="text-sm font-bold uppercase tracking-widest text-slate-400">To: {memory.recipientName || '_______'}</p>
                          <p className="text-sm font-bold uppercase tracking-widest text-slate-400">From: {memory.senderName || '_______'}</p>
                      </div>
                  </div>

                  {/* Footer Decoration */}
                  <div className="h-2 bg-gradient-to-r from-red-500 via-green-500 to-red-500"></div>
                  <div className="p-2 text-[8px] text-center text-slate-300 bg-white">
                      Created with AIVoiceCast
                  </div>
              </div>

          </div>
      </div>
    </div>
  );
};
