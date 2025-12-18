import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Channel, TranscriptItem, GeneratedLecture, CommunityDiscussion, RecordingSession, Attachment } from '../types';
import { GeminiLiveService } from '../services/geminiLive';
import { Mic, MicOff, PhoneOff, Radio, AlertCircle, ScrollText, RefreshCw, Music, Download, Share2, Trash2, Quote, Copy, Check, MessageCircle, BookPlus, Loader2, Globe, FilePlus, Play, Save, CloudUpload, Link, X, Video, Monitor } from 'lucide-react';
import { auth } from '../services/firebaseConfig';
import { saveUserChannel, cacheLectureScript, getCachedLectureScript } from '../utils/db';
import { publishChannelToFirestore, saveLectureToFirestore, saveDiscussion, updateDiscussion, uploadFileToStorage, updateBookingRecording, saveRecordingReference, linkDiscussionToLectureSegment, saveDiscussionDesignDoc, addChannelAttachment } from '../services/firestoreService';
import { summarizeDiscussionAsSection, generateDesignDocFromTranscript } from '../services/lectureGenerator';
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
  initialTranscript?: TranscriptItem[]; 
  existingDiscussionId?: string; 
  customTools?: FunctionDeclaration[];
  onCustomToolCall?: (name: string, args: any) => Promise<any>;
}

const UI_TEXT = {
  en: {
    welcomePrefix: "Try asking...",
    reconnecting: "Reconnecting...",
    establishing: "Establishing secure link...",
    holdMusic: "Playing hold music...",
    preparing: "Preparing studio environment...",
    transcript: "Live Transcript",
    copied: "Copied",
    listening: "Listening...",
    connecting: "Connecting to AI Studio...",
    you: "You",
    speaking: "Speaking...",
    retry: "Retry Connection",
    live: "LIVE ON AIR",
    saveToCourse: "Save as New Lesson",
    appendToLecture: "Append to Current Lecture",
    sharePublic: "Share Discussion Publicly",
    saving: "Saving...",
    saveSuccess: "Saved!",
    sharedSuccess: "Shared to Community!",
    tapToStart: "Tap to Start Session",
    tapDesc: "Click to enable audio and microphone access.",
    recording: "REC",
    uploading: "Uploading Session...",
    uploadComplete: "Upload Complete",
    saveAndLink: "Save & Link to Segment",
    start: "Start Session",
    saveSession: "Save Session"
  },
  zh: {
    welcomePrefix: "试着问...",
    reconnecting: "正在重新连接...",
    establishing: "建立安全连接...",
    holdMusic: "播放等待音乐...",
    preparing: "准备演播室环境...",
    transcript: "实时字幕",
    copied: "已复制",
    listening: "正在聆听...",
    connecting: "连接到 AI 演播室...",
    you: "你",
    speaking: "正在说话...",
    retry: "重试连接",
    live: "直播中",
    saveToCourse: "保存为新课程",
    appendToLecture: "追加到当前课程",
    sharePublic: "分享到社区",
    saving: "保存中...",
    saveSuccess: "已保存！",
    sharedSuccess: "已分享到社区！",
    tapToStart: "点击开始会话",
    tapDesc: "点击以启用音频和麦克风权限。",
    recording: "录音中",
    uploading: "正在上传会话...",
    uploadComplete: "上传完成",
    saveAndLink: "保存并链接到段落",
    start: "开始会话",
    saveSession: "保存会话"
  }
};

const saveContentTool: FunctionDeclaration = {
  name: "save_content",
  description: "Save a generated code file, document, or text snippet to the project storage.",
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

const SuggestionsBar = React.memo(({ suggestions, welcomeMessage, showWelcome, uiText }: any) => (
  <div className="w-full px-4 animate-fade-in-up">
      {showWelcome && welcomeMessage && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mb-4 text-center shadow-lg">
          <p className="text-slate-300 italic text-sm">"{welcomeMessage}"</p>
        </div>
      )}
      <div className="text-center mb-2">
         <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">{uiText.welcomePrefix}</span>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((prompt: string, idx: number) => (
          <div key={idx} className="px-4 py-2 rounded-full text-xs bg-slate-800/50 border border-slate-700 text-slate-400 cursor-default select-none">
            <span>{prompt}</span>
          </div>
        ))}
      </div>
  </div>
));

export const LiveSession: React.FC<LiveSessionProps> = ({ 
  channel, initialContext, lectureId, onEndSession, language, 
  recordingEnabled, videoEnabled, cameraEnabled, activeSegment, 
  initialTranscript, existingDiscussionId,
  customTools, onCustomToolCall 
}) => {
  const t = UI_TEXT[language];
  const [hasStarted, setHasStarted] = useState(false); 
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isUploadingRecording, setIsUploadingRecording] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [isSavingGeneric, setIsSavingGeneric] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const mixingAudioContextRef = useRef<AudioContext | null>(null);
  const recorderMimeTypeRef = useRef<string>(''); 
  const videoStreamRef = useRef<MediaStream | null>(null);
  const sourceStreamsRef = useRef<MediaStream[]>([]); 
  const animationFrameRef = useRef<number | null>(null);

  const retryCountRef = useRef(0);
  const [transcript, setTranscript] = useState<TranscriptItem[]>(initialTranscript || []);
  const [currentLine, setCurrentLine] = useState<TranscriptItem | null>(null);
  const [activeQuoteIndex, setActiveQuoteIndex] = useState<number | null>(null);
  const transcriptRef = useRef<TranscriptItem[]>(initialTranscript || []);
  
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<GeminiLiveService | null>(null);
  const waitingAudioCtxRef = useRef<AudioContext | null>(null);
  const waitingTimerRef = useRef<any>(null);

  const currentUser = auth.currentUser;

  useEffect(() => {
    if (channel.starterPrompts) setSuggestions(channel.starterPrompts.slice(0, 4));
    retryCountRef.current = 0;
  }, [channel.id]);

  const startWaitingMusic = () => {
    if (waitingAudioCtxRef.current) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      waitingAudioCtxRef.current = ctx;
      const notes = [261.63, 329.63, 392.00, 523.25];
      let nextNoteTime = ctx.currentTime;
      const scheduler = () => {
        if (!waitingAudioCtxRef.current) return;
        while (nextNoteTime < ctx.currentTime + 1.0) {
           const osc = ctx.createOscillator();
           const gain = ctx.createGain();
           const freq = notes[Math.floor(Math.random() * notes.length)];
           osc.frequency.value = freq; osc.type = 'sine';
           osc.connect(gain); gain.connect(ctx.destination);
           const now = nextNoteTime;
           osc.start(now);
           gain.gain.setValueAtTime(0, now);
           gain.gain.linearRampToValueAtTime(0.05, now + 0.05);
           gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05 + 0.8);
           osc.stop(now + 0.05 + 0.8);
           nextNoteTime += 0.5;
        }
        waitingTimerRef.current = setTimeout(scheduler, 250);
      };
      scheduler();
    } catch (e) {}
  };

  const stopWaitingMusic = () => {
    if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current);
    if (waitingAudioCtxRef.current) waitingAudioCtxRef.current.close().catch(() => {});
    waitingAudioCtxRef.current = null;
  };

  const setupRecording = async () => {
      if (!recordingEnabled || !serviceRef.current) return;
      try {
          const userAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          let visualStream: MediaStream | null = null;
          if (videoEnabled) { visualStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); }
          const aiStream = serviceRef.current.getOutputMediaStream();
          const ctx = new AudioContext();
          mixingAudioContextRef.current = ctx;
          const dest = ctx.createMediaStreamDestination();
          const userSource = ctx.createMediaStreamSource(userAudioStream);
          userSource.connect(dest);
          if (aiStream) { const aiSource = ctx.createMediaStreamSource(aiStream); aiSource.connect(dest); }
          const finalStream = new MediaStream();
          dest.stream.getAudioTracks().forEach(t => finalStream.addTrack(t));
          if (visualStream) visualStream.getVideoTracks().forEach(t => finalStream.addTrack(t));
          recordingStreamRef.current = finalStream;
          const recorder = new MediaRecorder(recordingStreamRef.current, { mimeType: 'video/webm' });
          audioChunksRef.current = [];
          recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
          recorder.start(1000); 
          mediaRecorderRef.current = recorder;
          recorderMimeTypeRef.current = recorder.mimeType;
      } catch(e) {}
  };

  const connect = useCallback(async (isRetryAttempt = false) => {
    setError(null); setIsConnected(false);
    let service = serviceRef.current || new GeminiLiveService();
    serviceRef.current = service; service.initializeAudio();
    try {
      const history = transcriptRef.current.map(t => `${t.role === 'user' ? 'User' : 'AI'}: ${t.text}`).join('\n');
      const instruction = `${channel.systemInstruction}\n\n[HISTORY]:\n${history}\n\n[CONTEXT]: ${initialContext || ''}`;
      const tools = [{ functionDeclarations: [saveContentTool, ...(customTools || [])] }];
      await service.connect(channel.voiceName, instruction, {
          onOpen: () => { stopWaitingMusic(); setIsRetrying(false); setIsConnected(true); if (recordingEnabled) setupRecording(); },
          onClose: () => { stopWaitingMusic(); setIsConnected(false); setHasStarted(false); },
          onError: (err) => { stopWaitingMusic(); setIsConnected(false); setError(err.message); },
          onVolumeUpdate: () => {},
          onTranscript: (text, isUser) => {
              const role = isUser ? 'user' : 'ai';
              setTranscript(history => {
                  if (history.length > 0 && history[history.length - 1].role === role) {
                      const last = history[history.length - 1];
                      return [...history.slice(0, -1), { ...last, text: last.text + text }];
                  }
                  return [...history, { role, text, timestamp: Date.now() }];
              });
          },
          onToolCall: async (tc) => {} 
        },
        tools
      );
    } catch (e) { setError("Session failed"); }
  }, [channel.id]);

  const handleStartSession = () => { setHasStarted(true); handleLiveToggle(); };
  const handleLiveToggle = () => connect();

  const handleDisconnect = async () => {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      stopWaitingMusic(); serviceRef.current?.disconnect();
      onEndSession(); 
  };

  const getFriendlyRole = (role: string) => {
      if (role === 'user') return t.you;
      // Scrub internal Gemini SDK IDs and replace with Voice persona name
      if (role === 'ai' || role.includes('gen-lang-client') || role.startsWith('model')) return channel.voiceName || 'Gemini';
      return role;
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950">
      <div className="p-4 flex items-center justify-between bg-slate-900 border-b border-slate-800">
         <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-800 border border-slate-700">
               <img src={channel.imageUrl} alt={channel.title} className="w-full h-full object-cover" />
            </div>
            <div>
               <h2 className="text-sm font-bold text-white leading-tight">{channel.title}</h2>
               <span className="text-xs text-indigo-400">{channel.voiceName}</span>
            </div>
         </div>
         <button onClick={handleDisconnect} className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg">End Session</button>
      </div>

      {!hasStarted ? (
         <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-6">
             <div className="w-20 h-20 bg-indigo-600/10 rounded-full flex items-center justify-center animate-pulse"><Mic size={40} className="text-indigo-500" /></div>
             <button onClick={handleStartSession} className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-full shadow-lg">{t.start}</button>
         </div>
      ) : error ? (
         <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
             <AlertCircle size={40} className="text-red-400" />
             <p className="text-red-300 font-medium text-sm">{error}</p>
             <button onClick={() => connect()} className="px-4 py-2 bg-slate-800 text-white text-sm rounded-lg">{t.retry}</button>
         </div>
      ) : (
         <div className="flex-1 flex flex-col min-h-0 relative">
            {!isConnected && <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 z-10"><Loader2 size={32} className="text-indigo-500 animate-spin" /></div>}
            <div className="shrink-0 py-3 bg-slate-950"><SuggestionsBar suggestions={suggestions} welcomeMessage={channel.welcomeMessage} showWelcome={transcript.length === 0} uiText={t} /></div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6">
               {transcript.map((item, index) => (
                   <div key={index} className={`flex flex-col ${item.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in-up`}>
                       <span className={`text-[10px] uppercase font-bold tracking-wider mb-1 ${item.role === 'user' ? 'text-indigo-400' : 'text-emerald-400'}`}>{getFriendlyRole(item.role)}</span>
                       <div className={`max-w-[90%] px-4 py-3 rounded-2xl text-sm ${item.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200 border border-slate-700'}`}>
                           <p className="whitespace-pre-wrap">{item.text}</p>
                       </div>
                   </div>
               ))}
            </div>
         </div>
      )}
    </div>
  );
};