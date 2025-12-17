
import React, { useState, useRef, useEffect } from 'react';
import { AgentMemory, TranscriptItem, Group, ChatChannel } from '../types';
import { ArrowLeft, Sparkles, Wand2, Image as ImageIcon, Type, Download, Share2, Printer, RefreshCw, Send, Mic, MicOff, Gift, Heart, Loader2, ChevronRight, ChevronLeft, Upload, QrCode, X, Music, Play, Pause, Volume2, Camera, CloudUpload, Lock, Globe, Check, Edit, Package } from 'lucide-react';
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

// Helper to check if string is a blob URL
const isBlobUrl = (url?: string) => url?.startsWith('blob:');
const isDataUrl = (url?: string) => url?.startsWith('data:');

// Tool Definition for Elf
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
  const [activeTab, setActiveTab] = useState<'settings' | 'chat'>('settings');
  const [activePage, setActivePage] = useState<number>(0); // 0: Front, 1: Letter, 2: Photos, 3: Back, 4: Voice, 5: Song
  
  // State to track if we are in viewer mode (can be toggled if owner)
  const [isViewer, setIsViewer] = useState(initialIsViewer);
  
  const [isGeneratingText, setIsGeneratingText] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingBackImage, setIsGeneratingBackImage] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  
  // Audio Gen State
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [isGeneratingSong, setIsGeneratingSong] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  
  // Playback State
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Image Generation Refinements
  const [frontRefImage, setFrontRefImage] = useState<string | null>(null);
  const [frontRefinement, setFrontRefinement] = useState('');
  
  // Live Chat State
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [currentLine, setCurrentLine] = useState<TranscriptItem | null>(null); // For accumulating stream
  const liveServiceRef = useRef<GeminiLiveService | null>(null);
  
  // Ref for card preview to capture
  const cardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refImageInputRef = useRef<HTMLInputElement>(null);
  const chatImageInputRef = useRef<HTMLInputElement>(null);

  // PDF Export State
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPackage, setIsExportingPackage] = useState(false);
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);

  // Sharing State
  const [isPublishing, setIsPublishing] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isSendingToChat, setIsSendingToChat] = useState(false);
  const [chatTargets, setChatTargets] = useState<{id: string, name: string, type: 'dm'|'group'}[]>([]);
  const [selectedChatTarget, setSelectedChatTarget] = useState('');

  // Check ownership
  const isOwner = auth.currentUser && memory.ownerId === auth.currentUser.uid;

  // Load Card if ID provided
  useEffect(() => {
      if (cardId) {
          getCard(cardId).then(data => {
              if (data) setMemory(data);
          }).catch(e => console.error("Failed to load card", e));
      }
  }, [cardId]);

  // Fetch QR Code as Base64 to ensure it renders in PDF (CORS fix)
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
            .catch((e) => {
                console.warn("QR Fetch failed, falling back to URL", e);
                setQrCodeBase64(url);
            });
    } else {
        setQrCodeBase64(null);
    }
  }, [memory.googlePhotosUrl]);

  // Reset audio player when navigating away or changing context significantly
  useEffect(() => {
     return () => {
         if (audioRef.current) {
             audioRef.current.pause();
             audioRef.current = null;
         }
     };
  }, []);

  // Initialize Live Service
  useEffect(() => {
      liveServiceRef.current = new GeminiLiveService();
      liveServiceRef.current.initializeAudio();
      return () => {
          liveServiceRef.current?.disconnect();
      };
  }, []);

  // Update transcript ref when current line changes to handle stream merging
  useEffect(() => {
      if (currentLine) {
         // Auto-scroll chat?
      }
  }, [currentLine]);

  // Load chat targets for sharing
  useEffect(() => {
      if (showShareModal && auth.currentUser) {
          Promise.all([
              getUserGroups(auth.currentUser.uid),
              getUserDMChannels()
          ]).then(([groups, dms]) => {
              const targets = [
                  ...groups.map(g => ({ id: g.id, name: g.name, type: 'group' as const })),
                  ...dms.map(d => ({ id: d.id, name: d.name, type: 'dm' as const }))
              ];
              setChatTargets(targets);
              if (targets.length > 0) setSelectedChatTarget(targets[0].id);
          });
      }
  }, [showShareModal]);

  const handleLiveToggle = async () => {
      if (isLiveActive) {
          liveServiceRef.current?.disconnect();
          setIsLiveActive(false);
          // Save session snippet?
      } else {
          try {
              // Construct instructions based on memory
              const sysPrompt = `
                You are Elf, a helpful holiday card assistant.
                Current Card Context:
                Recipient: ${memory.recipientName || "Unknown"}
                Occasion: ${memory.occasion}
                Theme: ${memory.theme}
                
                Your goal is to help the user design the perfect card. You can update the card details using tools.
                Be cheerful, festive, and creative. Ask about their recipient to tailor the message.
              `;
              
              await liveServiceRef.current?.connect("Puck", sysPrompt, {
                  onOpen: () => setIsLiveActive(true),
                  onClose: () => setIsLiveActive(false),
                  onError: (e) => { alert("Connection Error"); setIsLiveActive(false); },
                  onVolumeUpdate: () => {},
                  onTranscript: (text, isUser) => {
                      const role = isUser ? 'user' : 'ai';
                      setCurrentLine({ role, text, timestamp: Date.now() });
                      if (isUser && transcript.length > 0 && transcript[transcript.length-1].role === 'user') {
                          // merge? logic usually handled in parent or here
                      } else {
                          setTranscript(prev => [...prev, { role, text, timestamp: Date.now() }]);
                          setCurrentLine(null);
                      }
                  },
                  onToolCall: async (toolCall) => {
                      for (const fc of toolCall.functionCalls) {
                          if (fc.name === 'update_card') {
                              const args = fc.args;
                              setMemory(prev => ({ ...prev, ...args }));
                              liveServiceRef.current?.sendToolResponse({
                                  functionResponses: [{
                                      id: fc.id,
                                      name: fc.name,
                                      response: { result: "Card updated successfully!" }
                                  }]
                              });
                          }
                      }
                  }
              }, [{ functionDeclarations: [updateCardTool] }]);
          } catch(e) {
              alert("Failed to connect live service.");
          }
      }
  };

  const handleChatImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const file = e.target.files[0];
          try {
              const base64 = await resizeImage(file, 512, 0.7);
              // Send to live service
              liveServiceRef.current?.sendVideo(base64.split(',')[1], file.type);
              setTranscript(prev => [...prev, { role: 'user', text: '[Sent Image]', timestamp: Date.now() }]);
          } catch(e) {
              console.error("Image send failed", e);
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

  const handleGenAudio = async (type: 'message' | 'song') => {
      const isSong = type === 'song';
      const setter = isSong ? setIsGeneratingSong : setIsGeneratingVoice;
      setter(true);
      try {
          let text = isSong ? await generateSongLyrics(memory) : memory.cardMessage;
          if (isSong) setMemory(prev => ({ ...prev, songLyrics: text }));
          const voice = isSong ? 'Fenrir' : 'Kore';
          const audioUrl = await generateCardAudio(text, voice);
          setMemory(prev => isSong ? { ...prev, songUrl: audioUrl } : { ...prev, voiceMessageUrl: audioUrl });
      } catch(e) {
          alert("Audio generation failed. Ensure API Key is set.");
      } finally {
          setter(false);
      }
  };
  
  // Audio Playback
  const playAudio = (url: string) => {
      if (playingUrl === url) {
          audioRef.current?.pause();
          setPlayingUrl(null);
          return;
      }
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audio.crossOrigin = "anonymous"; 
      audioRef.current = audio;
      audio.onended = () => setPlayingUrl(null);
      audio.onerror = () => { alert("Failed to play audio."); setPlayingUrl(null); };
      audio.play().then(() => setPlayingUrl(url)).catch(() => { alert("Playback failed."); setPlayingUrl(null); });
  };

  const urlToFile = async (url: string, filename: string): Promise<File> => {
        const res = await fetch(url);
        const blob = await res.blob();
        return new File([blob], filename, { type: blob.type });
  };

  const handleDownloadLocal = (url: string, filename: string) => {
      const a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleSaveAudio = async (type: 'message' | 'song') => {
      if (!auth.currentUser) return alert("Please sign in.");
      const url = type === 'message' ? memory.voiceMessageUrl : memory.songUrl;
      if (!url || !isBlobUrl(url)) return; 
      setIsUploadingAudio(true);
      try {
          const file = await urlToFile(url, `${type}_${Date.now()}.wav`);
          const path = `cards/${auth.currentUser.uid}/audio/${file.name}`;
          const downloadUrl = await uploadFileToStorage(path, file);
          setMemory(prev => type === 'message' ? { ...prev, voiceMessageUrl: downloadUrl } : { ...prev, songUrl: downloadUrl });
          alert("Audio saved!");
      } catch(e) { alert("Upload failed."); } finally { setIsUploadingAudio(false); }
  };

  const handleGenImage = async (isBack = false) => {
      const setter = isBack ? setIsGeneratingBackImage : setIsGeneratingImage;
      setter(true);
      try {
          let style = '';
          if (memory.theme === 'chinese-poem') style = 'Ink wash painting (Shui-mo), minimalistic, Zen, traditional Chinese art style';
          else style = memory.theme === 'festive' ? 'Classic Christmas, red and gold' : memory.theme === 'minimal' ? 'Modern abstract, winter palette' : memory.theme === 'cozy' ? 'Warm watercolor, hot cocoa' : 'Elegant typography, gratitude';
          const prompt = isBack ? style + ", background pattern or texture, minimalist" : style + ", highly detailed cover art, cinematic";
          const refImg = (!isBack && activePage === 0) ? (frontRefImage || undefined) : undefined;
          const refinement = (!isBack && activePage === 0) ? frontRefinement : undefined;
          const imgUrl = await generateCardImage(memory, prompt, refImg, refinement);
          setMemory(prev => isBack ? ({ ...prev, backImageUrl: imgUrl }) : ({ ...prev, coverImageUrl: imgUrl }));
      } catch(e) { alert("Failed to generate image."); } finally { setter(false); }
  };
  
  const handleRefImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          try { const resized = await resizeImage(e.target.files[0], 512, 0.8); setFrontRefImage(resized); } catch(err) {}
      }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          setIsUploadingPhoto(true);
          const newPhotos: string[] = [];
          try {
              for (const file of Array.from(e.target.files) as File[]) {
                  const base64Url = await resizeImage(file, 1024, 0.8);
                  newPhotos.push(base64Url);
              }
              setMemory(prev => ({ ...prev, userImages: [...prev.userImages, ...newPhotos] }));
          } catch(err) { alert("Failed to process photos."); } finally { setIsUploadingPhoto(false); }
      }
  };

  const handleDeletePhoto = (index: number) => {
      setMemory(prev => ({ ...prev, userImages: prev.userImages.filter((_, i) => i !== index) }));
  };

  // Helper function to capture the PDF (reused by both download buttons)
  const generatePDFBlob = async (): Promise<Blob | null> => {
      try {
          const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [400, 600] });
          // Export all pages (0-5)
          for (let i = 0; i <= 5; i++) {
              const el = document.getElementById(`export-card-page-${i}`);
              if (el) {
                  const canvas = await html2canvas(el, { scale: 2, useCORS: true, allowTaint: true, logging: false, width: 400, height: 600, windowWidth: 400, windowHeight: 600, backgroundColor: memory.theme === 'chinese-poem' ? '#f5f0e1' : '#ffffff' });
                  const imgData = canvas.toDataURL('image/jpeg', 0.95);
                  if (i > 0) pdf.addPage();
                  pdf.addImage(imgData, 'JPEG', 0, 0, 400, 600);
              }
          }
          return pdf.output('blob');
      } catch(e) {
          console.error("PDF Gen failed", e);
          return null;
      }
  };

  const handleExportPDF = async () => {
      setIsExporting(true);
      setTimeout(async () => {
          const blob = await generatePDFBlob();
          if (blob) {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = `${memory.recipientName || 'Card'}_HolidayCard.pdf`; 
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              URL.revokeObjectURL(url);
          } else {
              alert("Failed to generate PDF");
          }
          setIsExporting(false);
      }, 800);
  };
  
  const handleDownloadPackage = async () => {
      setIsExportingPackage(true);
      // Wait for hidden render to be ready
      setTimeout(async () => {
        try {
            const zip = new JSZip();
            const folder = zip.folder("HolidayCard");
            
            // 1. PDF
            const pdfBlob = await generatePDFBlob();
            if (pdfBlob) folder?.file(`${memory.recipientName || 'Card'}.pdf`, pdfBlob);
            
            // 2. Audio Files
            if (memory.voiceMessageUrl) {
                const blob = await (await fetch(memory.voiceMessageUrl)).blob();
                folder?.file("voice_message.wav", blob);
            }
            if (memory.songUrl) {
                const blob = await (await fetch(memory.songUrl)).blob();
                folder?.file("holiday_song.wav", blob);
            }
            
            // 3. Generate Zip
            const content = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a'); a.href = url; a.download = `${memory.recipientName || 'Holiday'}_Card_Package.zip`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
        } catch (e) {
            console.error("Package export failed", e);
            alert("Failed to create package.");
        } finally {
            setIsExportingPackage(false);
        }
      }, 800);
  };

  // Helper to ensure an asset is uploaded and return perm URL
  const ensurePermanentUrl = async (url: string | undefined, path: string): Promise<string | undefined> => {
      if (!url) return undefined;
      // If it's already a http url (not blob/data), assume it's persistent or external
      if (!url.startsWith('blob:') && !url.startsWith('data:')) return url;
      
      try {
          const response = await fetch(url);
          const blob = await response.blob();
          // Detect mime extension
          let ext = 'bin';
          if (blob.type.includes('image')) ext = 'jpg'; // Default to jpg for simplicity or detect
          else if (blob.type.includes('audio')) ext = 'wav';
          else if (blob.type.includes('pdf')) ext = 'pdf';
          
          return await uploadFileToStorage(`${path}.${ext}`, blob);
      } catch (e) {
          console.warn("Failed to upload asset:", path, e);
          return undefined;
      }
  };

  const handlePublishAndShare = async () => {
      if (!auth.currentUser) { alert("Please sign in to share."); return; }
      setIsPublishing(true);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      setPlayingUrl(null);
      
      try {
          const uid = auth.currentUser.uid;
          const timestamp = Date.now();
          
          // 1. Upload Assets (Images, Audio) if they are temporary blobs
          const coverUrl = await ensurePermanentUrl(memory.coverImageUrl, `cards/${uid}/${timestamp}_cover`);
          const backUrl = await ensurePermanentUrl(memory.backImageUrl, `cards/${uid}/${timestamp}_back`);
          const voiceUrl = await ensurePermanentUrl(memory.voiceMessageUrl, `cards/${uid}/${timestamp}_voice`);
          const songUrl = await ensurePermanentUrl(memory.songUrl, `cards/${uid}/${timestamp}_song`);
          
          // User Photos
          const permanentUserImages = await Promise.all(memory.userImages.map(async (img, idx) => {
              return await ensurePermanentUrl(img, `cards/${uid}/${timestamp}_photo_${idx}`) || img;
          }));

          const finalMemory = { 
              ...memory,
              coverImageUrl: coverUrl,
              backImageUrl: backUrl,
              voiceMessageUrl: voiceUrl,
              songUrl: songUrl,
              userImages: permanentUserImages,
              ownerId: uid,
              updatedAt: new Date().toISOString()
          };
          
          setMemory(finalMemory); // Update local state
          
          // 2. Save Card Metadata to Firestore
          const newCardId = await saveCard(finalMemory, cardId); 
          
          // 3. Update URL
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.set('view', 'card_workshop');
          newUrl.searchParams.set('id', newCardId);
          window.history.pushState({}, '', newUrl);
          
          // 4. Generate Link
          const link = `${window.location.origin}?view=card&id=${newCardId}`;
          setShareLink(link);
          setShowShareModal(true);
      } catch(e: any) { 
          console.error(e);
          alert("Failed to publish card: " + e.message); 
      } finally { 
          setIsPublishing(false); 
      }
  };
  
  const handleSendToChat = async () => {
      if (!selectedChatTarget || !shareLink) return;
      
      const target = chatTargets.find(t => t.id === selectedChatTarget);
      if (!target) return;

      setIsSendingToChat(true);
      try {
          const text = `Check out this ${memory.occasion} card I made for ${memory.recipientName || 'someone'}!\n\n${shareLink}`;
          
          let collectionPath;
          if (target.type === 'group') {
              collectionPath = `groups/${target.id}/messages`;
          } else {
              collectionPath = `chat_channels/${target.id}/messages`;
          }

          const attachments = [];
          // Only attach cover if it is a remote URL (not blob) to ensure visibility
          if (memory.coverImageUrl && !memory.coverImageUrl.startsWith('blob:')) {
               attachments.push({
                   type: 'image',
                   url: memory.coverImageUrl,
                   name: 'Card Cover'
               });
          }

          await sendMessage(target.id, text, collectionPath, undefined, attachments);
          alert(`Sent to ${target.name}!`);
          setShowShareModal(false);
      } catch (e: any) {
          console.error("Send to chat failed", e);
          alert("Failed to send message: " + e.message);
      } finally {
          setIsSendingToChat(false);
      }
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

  const getSealChar = (name: string) => { return name ? name.trim().charAt(0).toUpperCase() : 'AI'; };
  const isVertical = memory.theme === 'chinese-poem' && isChinese(memory.cardMessage);

  const getDynamicFontSize = (text: string) => {
      const len = text ? text.length : 0;
      if (memory.theme === 'chinese-poem') {
          if (len > 300) return 'text-xs leading-relaxed';
          if (len > 150) return 'text-sm leading-relaxed';
          if (len > 80) return 'text-base leading-loose';
          return 'text-2xl leading-loose';
      } else {
          if (len > 800) return 'text-[10px] leading-tight';
          if (len > 500) return 'text-xs leading-normal';
          if (len > 300) return 'text-sm leading-relaxed';
          if (len > 150) return 'text-lg leading-relaxed';
          return 'text-3xl leading-loose';
      }
  };

  // Render logic for a single page
  const renderCardContent = (page: number) => {
      return (
          <>
             {/* --- PAGE 0: FRONT COVER --- */}
             {page === 0 && (
                <div className="w-full h-full flex flex-col relative overflow-hidden">
                    {memory.coverImageUrl ? (
                        <div className={`absolute inset-0 z-0 ${memory.theme === 'chinese-poem' ? 'opacity-90 mix-blend-multiply' : ''}`} style={{ backgroundImage: `url(${memory.coverImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', width: '100%', height: '100%' }} />
                    ) : (
                        <div className={`w-full h-full flex items-center justify-center ${memory.theme === 'festive' ? 'bg-red-800' : 'bg-slate-300'} z-0`}>
                            <Sparkles className="text-white/20 w-32 h-32" />
                        </div>
                    )}
                    <div className={`z-10 mt-auto p-8 ${memory.theme === 'chinese-poem' ? '' : 'bg-gradient-to-t from-black/80 to-transparent'}`}>
                        <h2 className={`text-5xl text-center drop-shadow-lg ${isVertical ? 'font-chinese-brush text-black vertical-rl ml-auto h-64' : 'font-holiday text-white'}`}>{memory.occasion}</h2>
                    </div>
                    {memory.theme === 'chinese-poem' && (
                        <div className="absolute bottom-8 left-8 w-12 h-12 border-2 border-red-800 rounded-sm flex items-center justify-center p-1 bg-red-100/50 backdrop-blur-sm z-20">
                            <div className="w-full h-full bg-red-800 flex items-center justify-center text-white font-chinese-brush text-2xl">{getSealChar(memory.senderName)}</div>
                        </div>
                    )}
                </div>
            )}

            {/* --- PAGE 1: MESSAGE (INNER LEFT) --- */}
            {page === 1 && (
                <div className={`w-full h-full flex flex-col p-10 justify-center text-center relative ${isVertical ? 'items-end' : 'items-center'}`}>
                    {memory.theme !== 'chinese-poem' && <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-500 via-green-500 to-red-500"></div>}
                    {memory.theme === 'chinese-poem' ? (
                        <h3 className={`font-chinese-brush text-3xl text-red-900 mb-0 opacity-80 ${isVertical ? 'vertical-rl absolute top-10 right-10' : 'mb-8'}`}>{memory.occasion}</h3>
                    ) : (
                        <h3 className="font-holiday text-3xl text-red-600 mb-8 opacity-80">Season's Greetings</h3>
                    )}
                    {/* SCROLLABLE MESSAGE CONTAINER TO FIX OVERFLOW */}
                    <div className={`${isVertical ? 'vertical-rl h-full max-h-[400px] flex flex-wrap-reverse gap-4 items-start text-right pr-16 overflow-x-auto' : 'w-full max-h-[440px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-300'}`}>
                       <p className={`${memory.theme === 'chinese-poem' ? 'font-chinese-brush text-slate-800' : 'font-script text-slate-800'} ${getDynamicFontSize(memory.cardMessage)}`}>
                           {memory.cardMessage || "Your message will appear here..."}
                       </p>
                    </div>
                    {memory.theme !== 'chinese-poem' && <div className="mt-auto w-16 h-1 bg-slate-200"></div>}
                </div>
            )}

            {/* --- PAGE 2: PHOTOS (INNER RIGHT) --- */}
            {page === 2 && (
                <div className={`w-full h-full flex flex-col p-6 ${memory.theme === 'chinese-poem' ? 'bg-[#f5f0e1]' : 'bg-slate-100'}`}>
                    <h3 className="font-bold text-center text-slate-400 text-xs uppercase tracking-widest mb-4">Memories</h3>
                    {memory.userImages.length > 0 ? (
                        <div className={`grid gap-4 w-full h-full ${memory.userImages.length === 1 ? 'grid-cols-1' : memory.userImages.length === 2 ? 'grid-rows-2' : 'grid-cols-2 grid-rows-2'}`}>
                            {memory.userImages.slice(0, 4).map((img, i) => (
                                <div key={i} className={`rounded-xl overflow-hidden shadow-sm border ${memory.theme === 'chinese-poem' ? 'border-red-900/20 bg-[#fdfbf7]' : 'border-white bg-white'} p-1 relative`}>
                                    <div className="absolute inset-0 m-1 rounded-lg" style={{ backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center', width: 'calc(100% - 8px)', height: 'calc(100% - 8px)' }} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex-1 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center text-slate-400"><p className="text-sm">No photos uploaded yet</p></div>
                    )}
                    <div className="mt-4 text-center">
                        <p className={`${memory.theme === 'chinese-poem' ? 'font-chinese-brush text-2xl text-slate-800' : 'font-script text-xl text-slate-600'}`}>
                            {memory.theme === 'chinese-poem' ? memory.senderName : `With love, ${memory.senderName}`}
                        </p>
                    </div>
                </div>
            )}

            {/* --- PAGE 3: BACK COVER --- */}
            {page === 3 && (
                <div className={`w-full h-full flex flex-col items-center justify-between p-12 relative ${memory.theme === 'chinese-poem' ? 'bg-[#f5f0e1]' : 'bg-white'}`}>
                    {memory.backImageUrl ? (
                        <div className="w-full h-48 overflow-hidden rounded-xl opacity-80 relative">
                             <div className={`absolute inset-0 ${memory.theme === 'chinese-poem' ? 'mix-blend-multiply grayscale sepia-[.3]' : ''}`} style={{ backgroundImage: `url(${memory.backImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                        </div>
                    ) : (
                        <div className="w-full h-48 bg-slate-100 rounded-xl flex items-center justify-center"><ImageIcon className="text-slate-300" /></div>
                    )}
                    <div className="text-center space-y-4">
                        {memory.googlePhotosUrl ? (
                            <>
                                <div className={`p-2 rounded-lg shadow-lg inline-block border ${memory.theme === 'chinese-poem' ? 'bg-[#fdfbf7] border-red-900/10' : 'bg-white border-slate-200'}`}>
                                    {qrCodeBase64 && <img src={qrCodeBase64} alt="Album QR" className="w-32 h-32 mix-blend-multiply" crossOrigin="anonymous" />}
                                </div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Scan for Photo Album</p>
                            </>
                        ) : (
                            <div className="w-32 h-32 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs text-center p-2">Add Album Link to see QR Code</div>
                        )}
                    </div>
                    <div className="text-center">
                        <div className="flex items-center justify-center gap-2 text-slate-400 mb-1"><Gift size={16} /><span className="font-holiday font-bold text-lg">AIVoiceCast</span></div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest">Designed with AI</p>
                    </div>
                </div>
            )}
            
            {/* --- PAGE 4: VOICE MESSAGE --- */}
            {page === 4 && (
                <div className={`w-full h-full flex flex-col p-8 relative ${memory.theme === 'chinese-poem' ? 'bg-[#f5f0e1]' : 'bg-slate-50'}`}>
                     <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none"><Mic size={128} className="text-indigo-900" /></div>
                     <div className="z-10 flex flex-col h-full gap-6">
                        <div className="text-center shrink-0">
                           <h3 className="text-2xl font-holiday font-bold text-indigo-700">Voice Greeting</h3>
                           <p className="text-sm text-slate-500">A personal message from the heart</p>
                        </div>
                        
                        {/* Voice Message Player */}
                        <div className={`p-4 rounded-xl border shrink-0 ${playingUrl === memory.voiceMessageUrl ? 'border-indigo-400 bg-indigo-50 shadow-md' : 'border-slate-200 bg-white'}`}>
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Voice Message</span>
                                {memory.voiceMessageUrl && (
                                    <div className="flex gap-2 items-center">
                                        {!isViewer && !isBlobUrl(memory.voiceMessageUrl) && <span className="text-[10px] text-emerald-400 font-bold">Saved</span>}
                                        {!isViewer && isBlobUrl(memory.voiceMessageUrl) && (
                                            <button onClick={() => handleSaveAudio('message')} disabled={isUploadingAudio} className="text-slate-400 hover:text-indigo-600 transition-colors" title="Save to Cloud">
                                                {isUploadingAudio ? <Loader2 size={14} className="animate-spin"/> : <CloudUpload size={14}/>}
                                            </button>
                                        )}
                                        <button onClick={() => handleDownloadLocal(memory.voiceMessageUrl!, `voice_${memory.recipientName || 'message'}.wav`)} className="text-slate-400 hover:text-indigo-600 transition-colors" title="Download">
                                            <Download size={14}/>
                                        </button>
                                        {!isBlobUrl(memory.voiceMessageUrl) && (
                                            <button onClick={() => { navigator.clipboard.writeText(memory.voiceMessageUrl!); alert("Link copied!"); }} className="text-slate-400 hover:text-indigo-600 transition-colors" title="Copy Link">
                                                <Share2 size={14}/>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            
                            {memory.voiceMessageUrl ? (
                                <button onClick={() => playAudio(memory.voiceMessageUrl!)} className={`w-full py-3 rounded-lg flex items-center justify-center gap-2 font-bold text-sm transition-colors ${playingUrl === memory.voiceMessageUrl ? 'bg-red-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}>
                                    {playingUrl === memory.voiceMessageUrl ? <Pause size={16}/> : <Play size={16}/>} {playingUrl === memory.voiceMessageUrl ? 'Playing...' : 'Play Message'}
                                </button>
                            ) : <div className="text-center text-xs text-slate-400 py-3 border border-dashed border-slate-300 rounded">Not Generated</div>}
                        </div>

                        {/* Full Text Area */}
                        <div className="flex-1 overflow-y-auto bg-white/50 rounded-xl p-4 border border-slate-200 shadow-inner scrollbar-thin scrollbar-thumb-slate-300">
                             <p className="text-lg text-slate-700 italic leading-relaxed whitespace-pre-wrap font-script">
                                 "{memory.cardMessage || 'Message text will appear here...'}"
                             </p>
                        </div>
                     </div>
                </div>
            )}

            {/* --- PAGE 5: HOLIDAY SONG --- */}
            {page === 5 && (
                <div className={`w-full h-full flex flex-col p-8 relative ${memory.theme === 'chinese-poem' ? 'bg-[#f5f0e1]' : 'bg-slate-50'}`}>
                     <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none"><Music size={128} className="text-pink-900" /></div>
                     <div className="z-10 flex flex-col h-full gap-6">
                        <div className="text-center shrink-0">
                           <h3 className="text-2xl font-holiday font-bold text-pink-700">Festive Song</h3>
                           <p className="text-sm text-slate-500">A custom melody just for you</p>
                        </div>

                        {/* Song Player */}
                        <div className={`p-4 rounded-xl border shrink-0 ${playingUrl === memory.songUrl ? 'border-pink-400 bg-pink-50 shadow-md' : 'border-slate-200 bg-white'}`}>
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold text-pink-400 uppercase tracking-wider">Holiday Song</span>
                                {memory.songUrl && (
                                    <div className="flex gap-2 items-center">
                                        {!isViewer && !isBlobUrl(memory.songUrl) && <span className="text-[10px] text-emerald-400 font-bold">Saved</span>}
                                        {!isViewer && isBlobUrl(memory.songUrl) && (
                                            <button onClick={() => handleSaveAudio('song')} disabled={isUploadingAudio} className="text-slate-400 hover:text-pink-600 transition-colors" title="Save to Cloud">
                                                {isUploadingAudio ? <Loader2 size={14} className="animate-spin"/> : <CloudUpload size={14}/>}
                                            </button>
                                        )}
                                        <button onClick={() => handleDownloadLocal(memory.songUrl!, `song_${memory.recipientName || 'holiday'}.wav`)} className="text-slate-400 hover:text-pink-600 transition-colors" title="Download">
                                            <Download size={14}/>
                                        </button>
                                        {!isBlobUrl(memory.songUrl) && (
                                            <button onClick={() => { navigator.clipboard.writeText(memory.songUrl!); alert("Link copied!"); }} className="text-slate-400 hover:text-pink-600 transition-colors" title="Copy Link">
                                                <Share2 size={14}/>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            {memory.songUrl ? (
                                <button onClick={() => playAudio(memory.songUrl!)} className={`w-full py-3 rounded-lg flex items-center justify-center gap-2 font-bold text-sm transition-colors ${playingUrl === memory.songUrl ? 'bg-red-500 text-white' : 'bg-pink-600 text-white hover:bg-pink-500'}`}>
                                    {playingUrl === memory.songUrl ? <Pause size={16}/> : <Play size={16}/>} {playingUrl === memory.songUrl ? 'Playing...' : 'Play Song'}
                                </button>
                            ) : <div className="text-center text-xs text-slate-400 py-3 border border-dashed border-slate-300 rounded">Not Generated</div>}
                        </div>

                        {/* Lyrics Area */}
                        <div className="flex-1 overflow-y-auto bg-white/50 rounded-xl p-4 border border-slate-200 shadow-inner scrollbar-thin scrollbar-thumb-slate-300">
                             <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed font-mono">
                                 {memory.songLyrics || "Lyrics will appear here..."}
                             </p>
                        </div>
                     </div>
                </div>
            )}
          </>
      );
  };
  
  const displayTranscript = currentLine ? [...transcript, currentLine] : transcript;

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
                  {isViewer && <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400 font-sans border border-slate-700">Viewer Mode</span>}
              </h1>
          </div>
          <div className="flex gap-2">
              {/* EDIT BUTTON: Only show if in Viewer Mode AND current user is Owner */}
              {isViewer && isOwner && (
                  <button 
                      onClick={() => setIsViewer(false)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold transition-colors"
                  >
                      <Edit size={14} /> <span>Edit Card</span>
                  </button>
              )}

              <button onClick={handleExportPDF} disabled={isExporting} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold transition-colors">
                  {isExporting ? <Loader2 size={14} className="animate-spin"/> : <Download size={14} />} 
                  <span className="hidden sm:inline">{isExporting ? 'Creating PDF...' : 'Download PDF'}</span>
              </button>
              
              <button onClick={handleDownloadPackage} disabled={isExportingPackage} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold transition-colors border border-slate-600">
                  {isExportingPackage ? <Loader2 size={14} className="animate-spin"/> : <Package size={14} />} 
                  <span className="hidden sm:inline">{isExportingPackage ? 'Zipping...' : 'Download Package'}</span>
              </button>

              {!isViewer && (
                <button onClick={handlePublishAndShare} disabled={isPublishing} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold transition-colors shadow-lg">
                    {isPublishing ? <Loader2 size={14} className="animate-spin"/> : <Share2 size={14} />} 
                    <span className="hidden sm:inline">Publish & Share</span>
                </button>
              )}
          </div>
      </div>

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
          
          {/* LEFT PANEL: CONTROLS (Hidden in Viewer Mode) */}
          {!isViewer && (
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
                                      <div className="space-y-2 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                                          <label className="text-xs font-bold text-indigo-400 uppercase">Adjust Generation</label>
                                          <input 
                                              type="text" 
                                              placeholder="Specifics: e.g. 'A little girl', 'Golden Retriever'" 
                                              value={frontRefinement}
                                              onChange={(e) => setFrontRefinement(e.target.value)}
                                              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-indigo-500 outline-none"
                                          />
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
                                              <input type="file" ref={refImageInputRef} className="hidden" accept="image/*" onChange={handleRefImageUpload}/>
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
                              
                              {/* AUDIO SETTINGS (PAGE 4 - Voice) */}
                              {activePage === 4 && (
                                  <div className="space-y-4">
                                      <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                                          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                              <Mic className="text-indigo-400" size={16}/> Voice Message
                                          </h3>
                                          
                                          {/* Voice Message Generator */}
                                          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 mb-3">
                                              <div className="flex justify-between items-center mb-2">
                                                  <span className="text-xs font-bold text-indigo-300">Generate</span>
                                                  {memory.voiceMessageUrl && (
                                                      <div className="flex gap-2 items-center">
                                                          <span className="text-[10px] text-emerald-400">Ready</span>
                                                          <button onClick={() => handleSaveAudio('message')} disabled={isUploadingAudio} className="text-xs text-indigo-400 hover:text-white" title="Save to Cloud">
                                                              {isUploadingAudio ? <Loader2 size={12} className="animate-spin"/> : <CloudUpload size={14}/>}
                                                          </button>
                                                      </div>
                                                  )}
                                              </div>
                                              <button 
                                                  onClick={() => handleGenAudio('message')}
                                                  disabled={isGeneratingVoice}
                                                  className="w-full py-2 bg-slate-700 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                                              >
                                                  {isGeneratingVoice ? <Loader2 size={12} className="animate-spin"/> : <Mic size={12}/>}
                                                  {memory.voiceMessageUrl ? 'Regenerate Voice' : 'Generate Voice'}
                                              </button>
                                          </div>
                                      </div>
                                  </div>
                              )}
                              
                              {/* AUDIO SETTINGS (PAGE 5 - Song) */}
                              {activePage === 5 && (
                                  <div className="space-y-4">
                                      <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                                          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                              <Music className="text-pink-400" size={16}/> Song Generator
                                          </h3>
                                          
                                          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                                              <div className="flex justify-between items-center mb-2">
                                                  <span className="text-xs font-bold text-pink-300">Custom Song</span>
                                                  {memory.songUrl && (
                                                      <div className="flex gap-2 items-center">
                                                          <span className="text-[10px] text-emerald-400">Ready</span>
                                                          <button onClick={() => handleSaveAudio('song')} disabled={isUploadingAudio} className="text-xs text-pink-400 hover:text-white" title="Save to Cloud">
                                                              {isUploadingAudio ? <Loader2 size={12} className="animate-spin"/> : <CloudUpload size={14}/>}
                                                          </button>
                                                      </div>
                                                  )}
                                              </div>
                                              <button 
                                                  onClick={() => handleGenAudio('song')}
                                                  disabled={isGeneratingSong}
                                                  className="w-full py-2 bg-slate-700 hover:bg-pink-600 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                                              >
                                                  {isGeneratingSong ? <Loader2 size={12} className="animate-spin"/> : <Music size={12}/>}
                                                  {memory.songUrl ? 'Regenerate Song' : 'Generate Song'}
                                              </button>
                                          </div>
                                      </div>
                                  </div>
                              )}
                          </div>
                      </>
                  ) : (
                      <div className="flex flex-col h-full relative">
                          <div className="flex-1 overflow-y-auto space-y-4 pb-4 px-2">
                              {displayTranscript.length === 0 && (
                                  <div className="text-center text-slate-500 text-sm py-8 px-4">
                                      <p>Tap the mic to talk to Elf, your holiday assistant.</p>
                                      <p className="text-xs mt-2 text-indigo-400">Pro tip: Upload a photo to let Elf see your inspiration!</p>
                                  </div>
                              )}
                              {displayTranscript.map((t, i) => (
                                  <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                      <div className={`max-w-[85%] p-3 rounded-xl text-xs whitespace-pre-wrap ${t.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                                          {t.text}
                                      </div>
                                  </div>
                              ))}
                          </div>
                          
                          <div className="mt-auto space-y-2">
                              <div className="flex gap-2">
                                <button 
                                    onClick={handleLiveToggle}
                                    className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${isLiveActive ? 'bg-red-500 text-white animate-pulse' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg'}`}
                                >
                                    {isLiveActive ? <MicOff size={18}/> : <Mic size={18}/>}
                                    {isLiveActive ? 'Stop' : 'Talk'}
                                </button>
                                {isLiveActive && (
                                    <button 
                                        onClick={() => chatImageInputRef.current?.click()}
                                        className="p-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-slate-700 transition-colors"
                                        title="Show photo to Elf"
                                    >
                                        <Camera size={18}/>
                                    </button>
                                )}
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
          </div>
          )}

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
                      {getPageLabel(activePage)} ({activePage + 1}/6)
                  </span>
                  <button 
                      onClick={() => setActivePage(p => Math.min(5, p + 1))} 
                      disabled={activePage === 5}
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
                      backgroundImage: (memory.theme === 'festive' && activePage !== 2 && activePage !== 4 && activePage !== 5) ? 'url("https://www.transparenttextures.com/patterns/snow.png")' : 'none',
                      backgroundColor: memory.theme === 'chinese-poem' ? '#f5f0e1' : memory.theme === 'minimal' ? '#f8fafc' : memory.theme === 'cozy' ? '#fff7ed' : '#ffffff',
                      // Chinese Rice Paper Texture effect
                      boxShadow: memory.theme === 'chinese-poem' ? 'inset 0 0 40px rgba(0,0,0,0.1)' : ''
                  }}
              >
                  {renderCardContent(activePage)}
              </div>

              {/* HIDDEN EXPORT AREA */}
              {isExporting || isExportingPackage ? (
                  <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', opacity: 0 }}>
                      {[0, 1, 2, 3, 4, 5].map(pageNum => (
                          <div 
                              key={pageNum} 
                              id={`export-card-page-${pageNum}`}
                              className="w-[400px] h-[600px] overflow-hidden flex flex-col relative"
                              style={{ 
                                  backgroundImage: (memory.theme === 'festive' && pageNum !== 2 && pageNum !== 4 && pageNum !== 5) ? 'url("https://www.transparenttextures.com/patterns/snow.png")' : 'none',
                                  backgroundColor: memory.theme === 'chinese-poem' ? '#f5f0e1' : memory.theme === 'minimal' ? '#f8fafc' : memory.theme === 'cozy' ? '#fff7ed' : '#ffffff',
                              }}
                          >
                              {renderCardContent(pageNum)}
                          </div>
                      ))}
                  </div>
              ) : null}

          </div>
      </div>
      
      {/* Share Modal */}
      {showShareModal && shareLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
           <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
               <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2"><Sparkles className="text-emerald-400"/> Card Published!</h3>
                  <button onClick={() => setShowShareModal(false)}><X className="text-slate-400 hover:text-white"/></button>
               </div>
               
               <p className="text-sm text-slate-300 mb-4">Your interactive holiday card is live. Share this link for friends to view and listen.</p>
               
               <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex items-center gap-2 mb-4">
                  <span className="flex-1 text-xs text-slate-300 truncate font-mono">{shareLink}</span>
                  <button onClick={() => navigator.clipboard.writeText(shareLink)} className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white"><Share2 size={14}/></button>
               </div>
               
               <div className="bg-indigo-900/20 p-4 rounded-xl border border-indigo-500/30">
                  <label className="text-xs font-bold text-indigo-300 uppercase mb-2 block">Send to Chat</label>
                  <div className="flex gap-2">
                     <select 
                        value={selectedChatTarget} 
                        onChange={(e) => setSelectedChatTarget(e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white p-2 outline-none"
                     >
                        {chatTargets.map(t => <option key={t.id} value={t.id}>{t.type === 'dm' ? '@' : '#'}{t.name}</option>)}
                     </select>
                     <button 
                        onClick={handleSendToChat}
                        disabled={isSendingToChat || chatTargets.length === 0}
                        className="px-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg flex items-center gap-1"
                     >
                        {isSendingToChat ? <Loader2 size={12} className="animate-spin"/> : <Send size={12}/>}
                        Send
                     </button>
                  </div>
               </div>
           </div>
        </div>
      )}

    </div>
  );
};

const Edit3Icon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
);
