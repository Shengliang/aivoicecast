import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Channel, TranscriptItem, CommunityDiscussion } from '../types';
import { GeminiLiveService } from '../services/geminiLive';
import { Mic, AlertCircle, MessageSquare, Loader2, CloudUpload, X, ShieldCheck, Key } from 'lucide-react';
import { auth } from '../services/firebaseConfig';
import { uploadFileToStorage, saveDiscussion, linkDiscussionToLectureSegment, addChannelAttachment } from '../services/firestoreService';
import { FunctionDeclaration, Type } from '@google/genai';

interface LiveSessionProps {
  channel: Channel;
  initialContext?: string;
  lectureId?: string; 
  onEndSession: () => void;
  language: 'en' | 'zh';
  recordingEnabled?: boolean;
  videoEnabled?: boolean; 
  cameraEnabled?: boolean; 
  activeSegment?: { index: number, lectureId: string }; 
}

const UI_TEXT = {
  en: {
    you: "You",
    start: "Start Session",
    keyNeeded: "API Key Required",
    keyDesc: "Real-time voice requires a validated AI Studio API key.",
    selectKey: "Select API Key",
    billingLink: "Learn about billing and quotas",
    connecting: "Connecting...",
    retry: "Retry Connection",
    uploading: "Saving Session..."
  },
  zh: {
    you: "你",
    start: "开始会话",
    keyNeeded: "需要 API 密钥",
    keyDesc: "实时语音需要经过验证的 AI Studio API 密钥。",
    selectKey: "选择 API 密钥",
    billingLink: "了解计费和配额",
    connecting: "正在连接...",
    retry: "重试连接",
    uploading: "正在上传..."
  }
};

const saveContentTool: FunctionDeclaration = {
  name: "save_content",
  description: "Save a generated code file or document to the project storage.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: { type: Type.STRING },
      content: { type: Type.STRING },
      mimeType: { type: Type.STRING }
    },
    required: ["filename", "content"]
  }
};

export const LiveSession: React.FC<LiveSessionProps> = ({ 
  channel, initialContext, lectureId, onEndSession, language, 
  recordingEnabled, activeSegment 
}) => {
  const t = UI_TEXT[language];
  const [hasStarted, setHasStarted] = useState(false); 
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(true); 
  
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [currentLine, setCurrentLine] = useState<TranscriptItem | null>(null);
  const transcriptRef = useRef<TranscriptItem[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<GeminiLiveService | null>(null);

  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  const checkApiKeyStatus = async () => {
    if (window.aistudio?.hasSelectedApiKey) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
        return hasKey;
    }
    return true; 
  };

  /**
   * INTERCEPTOR: Maps technical server IDs to friendly persona names
   */
  const getDisplayName = (role: string) => {
    if (role === 'user') return t.you;
    const r = role.toLowerCase();
    
    // Explicit mapping for technical IDs from user requirement
    if (r.includes('0648937375') || r === 'software_interview') return 'Software Interview Voice';
    if (r.includes('0375218270') || r === 'linux_kernel') return 'Linux Kernel Voice';
    if (r.includes('default gem') || r === 'zephyr' || r === 'default_gem' || r === 'default-gem') return 'Default Gem';
    
    return channel.title || 'AI Host';
  };

  const connect = useCallback(async () => {
    setError(null);
    setIsConnected(false);
    
    if (!(await checkApiKeyStatus())) {
        setHasStarted(true); 
        return;
    }

    if (!serviceRef.current) {
         serviceRef.current = new GeminiLiveService();
         serviceRef.current.initializeAudio();
    }
    
    try {
      let instruction = channel.systemInstruction;
      if (initialContext) instruction += `\n\n[USER CONTEXT]: "${initialContext}"`;

      await serviceRef.current.connect(channel.voiceName, instruction, {
          onOpen: () => { setIsConnected(true); },
          onClose: () => { setIsConnected(false); setHasStarted(false); },
          onError: (err) => {
              // HANDLE EXPIRATION: Instruction says to reset if entity not found
              if (err.message?.includes("Requested entity was not found.")) {
                  setHasApiKey(false);
                  return;
              }
              setError(err.message);
          },
          onVolumeUpdate: () => {}, 
          onTranscript: (text, isUser, rawRole) => {
              const roleKey = isUser ? 'user' : (rawRole || 'ai');
              setCurrentLine(prev => {
                  if (prev && prev.role !== roleKey) {
                      setTranscript(history => [...history, prev]);
                      return { role: roleKey, text, timestamp: Date.now() };
                  }
                  return { role: roleKey, text: (prev ? prev.text : '') + text, timestamp: prev ? prev.timestamp : Date.now() };
              });
          }
      }, [{ functionDeclarations: [saveContentTool] }]);
    } catch (e: any) { 
        setError("Failed to initialize session"); 
    }
  }, [channel, initialContext]);

  const handleSelectKey = async () => {
      if (window.aistudio?.openSelectKey) {
          await window.aistudio.openSelectKey();
          setHasApiKey(true); // Assume success to mitigate race condition
          connect();
      }
  };

  const handleDisconnect = async () => {
      serviceRef.current?.disconnect();
      const fullTranscript = currentLine ? [...transcript, currentLine] : transcript;
      if (auth.currentUser && fullTranscript.length > 0) {
          setIsUploading(true);
          try {
              const disc: CommunityDiscussion = {
                 id: '', lectureId: activeSegment?.lectureId || lectureId || channel.id, channelId: channel.id,
                 userId: auth.currentUser.uid, userName: auth.currentUser.displayName || 'Anonymous',
                 transcript: fullTranscript, createdAt: Date.now(), title: `${channel.title} Session`
              };
              const dId = await saveDiscussion(disc);
              if (activeSegment) linkDiscussionToLectureSegment(channel.id, activeSegment.lectureId, activeSegment.index, dId);
          } catch(e) {} finally { setIsUploading(false); }
      }
      onEndSession(); 
  };

  useEffect(() => { 
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; 
  }, [transcript, currentLine]);

  if (isUploading) return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-4">
          <CloudUpload size={48} className="text-indigo-400 animate-bounce mb-4" />
          <h2 className="text-2xl font-bold text-white">{t.uploading}</h2>
      </div>
  );

  return (
    <div className="w-full h-full flex flex-col bg-slate-950">
      <div className="p-4 flex items-center justify-between bg-slate-900 border-b border-slate-800">
         <div className="flex items-center space-x-3">
            <img src={channel.imageUrl} className="w-10 h-10 rounded-full object-cover border border-slate-700" alt="" />
            <div>
               <h2 className="text-sm font-bold text-white">{channel.title}</h2>
               <span className="text-[10px] text-indigo-400 font-medium uppercase">{getDisplayName(currentLine?.role || 'ai')}</span>
            </div>
         </div>
         <button onClick={handleDisconnect} className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-colors">End Session</button>
      </div>

      {!hasStarted ? (
         <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6 text-center">
             <div className="w-20 h-20 bg-indigo-600/10 rounded-full flex items-center justify-center animate-pulse"><Mic size={40} className="text-indigo-500" /></div>
             <button onClick={() => { setHasStarted(true); connect(); }} className="px-10 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-full shadow-lg transition-transform hover:scale-105">{t.start}</button>
         </div>
      ) : !hasApiKey ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
              <ShieldCheck size={64} className="text-indigo-400 mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">{t.keyNeeded}</h2>
              <p className="text-slate-400 mb-6 max-w-xs">{t.keyDesc}</p>
              <button 
                  onClick={handleSelectKey} 
                  className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-xl shadow-indigo-500/20 flex items-center gap-3 active:scale-95 transition-all"
              >
                  <Key size={20}/>
                  <span>{t.selectKey}</span>
              </button>
          </div>
      ) : (
         <div className="flex-1 flex flex-col min-h-0 relative">
            {!isConnected && !error && <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 z-20 backdrop-blur-sm"><Loader2 size={32} className="text-indigo-500 animate-spin" /></div>}
            
            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 z-30 p-6">
                    <div className="bg-slate-900 border border-red-900/50 p-6 rounded-2xl max-w-sm text-center space-y-4 shadow-2xl">
                        <AlertCircle size={40} className="text-red-500 mx-auto" />
                        <h3 className="text-white font-bold">Unexpected Error</h3>
                        <p className="text-xs text-slate-400 leading-relaxed">{error}</p>
                        <button onClick={() => connect()} className="w-full py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-500 transition-colors">
                            {t.retry}
                        </button>
                    </div>
                </div>
            )}

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-800">
               {transcript.map((item, idx) => (
                   <div key={idx} className={`flex flex-col ${item.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in-up`}>
                       <span className="text-[10px] uppercase font-bold text-slate-500 mb-1 px-1">{getDisplayName(item.role)}</span>
                       <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${item.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-200 rounded-tl-sm border border-slate-700'}`}>{item.text}</div>
                   </div>
               ))}
               {currentLine && (
                   <div className={`flex flex-col ${currentLine.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in`}>
                       <span className="text-[10px] uppercase font-bold text-slate-500 mb-1 px-1">{getDisplayName(currentLine.role)}</span>
                       <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${currentLine.role === 'user' ? 'bg-indigo-600/80 text-white' : 'bg-slate-800/80 text-slate-200 border border-slate-700'}`}>{currentLine.text}<span className="inline-block w-1.5 h-4 ml-1 bg-current opacity-50 animate-blink"></span></div>
                   </div>
               )}
            </div>
         </div>
      )}
    </div>
  );
};