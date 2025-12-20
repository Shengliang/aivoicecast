
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Channel, GeneratedLecture, Chapter, SubTopic, TranscriptItem, Attachment, UserProfile } from '../types';
import { ArrowLeft, Play, Pause, BookOpen, MessageCircle, Sparkles, User, GraduationCap, Loader2, ChevronDown, ChevronRight, SkipForward, SkipBack, Settings, X, Mic, Music, Download, RefreshCw, Square, MoreVertical, Edit, Lock, Zap, ToggleLeft, ToggleRight, Users, Check, AlertTriangle, Activity, MessageSquare, FileText, Code, Video, Monitor, PlusCircle, Bot, ExternalLink, ChevronLeft, Menu, List, PanelLeftClose, PanelLeftOpen, CornerDownRight, Trash2, FileDown, Printer, FileJson, HelpCircle, ListMusic, Copy, Paperclip, UploadCloud, Crown, Radio, Info, AlertCircle, Bug, Terminal } from 'lucide-react';
import { generateLectureScript } from '../services/lectureGenerator';
import { synthesizeSpeech, clearAudioCache, cleanTextForTTS, TtsErrorType } from '../services/tts';
import { OFFLINE_CHANNEL_ID, OFFLINE_CURRICULUM, OFFLINE_LECTURES } from '../utils/offlineContent';
import { SPOTLIGHT_DATA } from '../utils/spotlightContent';
import { cacheLectureScript, getCachedLectureScript } from '../utils/db';
import { stopAllPlatformAudio, claimAudioLock, isVersionValid, getGlobalAudioContext, warmUpAudioContext, connectOutput } from '../utils/audioUtils';

interface PodcastDetailProps {
  channel: Channel;
  onBack: () => void;
  onStartLiveSession: (context?: string, lectureId?: string, recordingEnabled?: boolean, videoEnabled?: boolean, activeSegment?: { index: number, lectureId: string }, cameraEnabled?: boolean) => void;
  language: 'en' | 'zh';
  onEditChannel?: () => void; 
  onViewComments?: () => void;
  currentUser: any; 
}

const UI_TEXT = {
  en: {
    back: "Back", selectTopic: "Select a lesson to begin", generating: "Preparing Content...", genDesc: "Our AI professor is preparing the material.", loadingAudio: "Preparing...", loading: "Loading...", prev: "Prev", next: "Next"
  },
  zh: {
    back: "返回", selectTopic: "请选择一个主题开始", generating: "正在准备内容...", genDesc: "AI 教授正在准备教学材料。", loadingAudio: "准备中...", loading: "加载中...", prev: "上一节", next: "下一节"
  }
};

export const PodcastDetail: React.FC<PodcastDetailProps> = ({ channel, onBack, onStartLiveSession, language, onEditChannel, onViewComments, currentUser }) => {
  const t = UI_TEXT[language];
  const [activeLecture, setActiveLecture] = useState<GeneratedLecture | null>(null);
  const [isLoadingLecture, setIsLoadingLecture] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number>(0);
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);
  const [activeSubTopicId, setActiveSubTopicId] = useState<string | null>(null);
  
  const MY_TOKEN = useMemo(() => `Detail:${channel.id}`, [channel.id]);

  const [chapters] = useState<Chapter[]>(() => {
    if (channel.chapters && channel.chapters.length > 0) return channel.chapters;
    if (channel.id === OFFLINE_CHANNEL_ID) return OFFLINE_CURRICULUM;
    if (SPOTLIGHT_DATA[channel.id]) return SPOTLIGHT_DATA[channel.id].curriculum;
    return [];
  });
  
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const schedulerTimerRef = useRef<any>(null);
  const nextScheduleTimeRef = useRef<number>(0);
  const schedulingCursorRef = useRef<number>(0);
  const activeVersionRef = useRef<number>(-1);

  /**
   * ATOMIC LOCAL STOP
   */
  const stopLocalAudio = useCallback(() => {
    // 1. Incrementing global version is done by the caller (stopAllPlatformAudio)
    // Here we just cleanup local hardware
    setIsPlaying(false);
    setIsBuffering(false);
    
    if (schedulerTimerRef.current) {
        clearTimeout(schedulerTimerRef.current);
        schedulerTimerRef.current = null;
    }

    activeSourcesRef.current.forEach(source => {
        try { source.stop(); source.disconnect(); } catch(e) {}
    });
    activeSourcesRef.current.clear();
    
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
  }, []);

  useEffect(() => {
    return () => {
        stopAllPlatformAudio(`Unmount:${MY_TOKEN}`);
    };
  }, [MY_TOKEN]);

  /**
   * TOGGLE PLAYBACK (RESUMABLE)
   */
  const togglePlayback = async () => {
    if (isPlaying) {
      // PAUSE: Stop audio, but don't reset currentSectionIndex
      stopAllPlatformAudio(`UserPause:${MY_TOKEN}`);
      return;
    }

    // 1. Claim Lock and get fresh version
    const version = claimAudioLock(MY_TOKEN, stopLocalAudio);
    activeVersionRef.current = version;

    const ctx = getGlobalAudioContext();
    await warmUpAudioContext(ctx);

    // Zombie check after async warmup
    if (!isVersionValid(version)) return;

    // 2. Initialize Scheduler
    // Resume from currentSectionIndex
    schedulingCursorRef.current = currentSectionIndex;
    nextScheduleTimeRef.current = ctx.currentTime + 0.1;
    setIsPlaying(true);

    runScheduler(version);
  };

  const runScheduler = async (version: number) => {
    if (!activeLecture || !isVersionValid(version) || !isPlaying) return;

    const ctx = getGlobalAudioContext();
    const lookahead = 1.5; // Look ahead 1.5 seconds

    while (nextScheduleTimeRef.current < ctx.currentTime + lookahead) {
        // Inner loop zombie check
        if (!isVersionValid(version)) return;

        const idx = schedulingCursorRef.current;
        if (idx >= activeLecture.sections.length) {
            // End of lecture
            const delay = (nextScheduleTimeRef.current - ctx.currentTime) * 1000;
            setTimeout(() => {
                if (isVersionValid(version)) {
                    setIsPlaying(false);
                    setCurrentSectionIndex(0);
                }
            }, Math.max(0, delay));
            return;
        }

        const section = activeLecture.sections[idx];
        const voice = section.speaker === 'Teacher' ? (channel.voiceName || 'Puck') : 'Zephyr';

        try {
            setIsBuffering(true);
            const result = await synthesizeSpeech(section.text, voice, ctx);
            setIsBuffering(false);

            // Zombie check after network delay
            if (!isVersionValid(version)) return;

            if (result.buffer) {
                const source = ctx.createBufferSource();
                source.buffer = result.buffer;
                
                const startTime = Math.max(nextScheduleTimeRef.current, ctx.currentTime);
                connectOutput(source, ctx);
                source.start(startTime);
                activeSourcesRef.current.add(source);
                source.onended = () => { activeSourcesRef.current.delete(source); };

                // Track UI progress
                const uiDelay = (startTime - ctx.currentTime) * 1000;
                setTimeout(() => {
                    if (isVersionValid(version)) {
                        setCurrentSectionIndex(idx);
                        sectionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, Math.max(0, uiDelay));

                nextScheduleTimeRef.current = startTime + result.buffer.duration;
                schedulingCursorRef.current++;
            } else {
                // Fallback to system voice if buffer failed
                await playSystemLine(section.text, voice, version);
                schedulingCursorRef.current++;
            }
        } catch (e) {
            console.error("Schedule error", e);
            break;
        }
    }

    // Schedule next check
    if (isVersionValid(version)) {
        schedulerTimerRef.current = setTimeout(() => runScheduler(version), 300);
    }
  };

  const playSystemLine = (text: string, voiceName: string, version: number): Promise<void> => {
      return new Promise((resolve) => {
          if (!isVersionValid(version)) { resolve(); return; }
          const utter = new SpeechSynthesisUtterance(cleanTextForTTS(text));
          utter.onend = () => resolve();
          utter.onerror = () => resolve();
          window.speechSynthesis.speak(utter);
      });
  };

  const handleTopicClick = async (topicTitle: string, subTopicId: string) => {
    // Clear everything for new topic
    stopAllPlatformAudio(`TopicSwitch:${MY_TOKEN}`);
    setActiveSubTopicId(subTopicId);
    setCurrentSectionIndex(0);
    setActiveLecture(null);
    setIsLoadingLecture(true);
    
    try {
        const cacheKey = `lecture_${channel.id}_${subTopicId}_${language}`;
        const cached = await getCachedLectureScript(cacheKey);
        if (cached) { setActiveLecture(cached); return; }
        
        const script = await generateLectureScript(topicTitle, channel.description, language);
        if (script) {
          setActiveLecture(script);
          await cacheLectureScript(cacheKey, script);
        }
    } catch (e) { 
        console.error(e); 
    } finally { 
        setIsLoadingLecture(false); 
    }
  };

  return (
    <div className="h-full bg-slate-950 text-slate-100 flex flex-col overflow-y-auto pb-24">
      <div className="relative h-64 md:h-80 w-full shrink-0">
        <div className="absolute inset-0">
          <img src={channel.imageUrl} alt={channel.title} className="w-full h-full object-cover opacity-60"/>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />
        </div>
        <div className="absolute top-4 left-4 z-20">
          <button onClick={onBack} className="flex items-center space-x-2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full hover:bg-white/10 transition-colors border border-white/10 text-sm font-medium">
            <ArrowLeft size={16} /><span>{t.back}</span>
          </button>
        </div>
        <div className="absolute bottom-0 left-0 w-full p-6 md:p-8 max-w-7xl mx-auto">
           <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">{channel.title}</h1>
           <p className="text-lg text-slate-300 max-w-2xl line-clamp-2">{channel.description}</p>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden">
                <div className="bg-slate-800 p-4 font-bold text-sm">Curriculum</div>
                <div className="max-h-[500px] overflow-y-auto">
                    {chapters.map((ch) => (
                        <div key={ch.id}>
                            <button onClick={() => setExpandedChapterId(expandedChapterId === ch.id ? null : ch.id)} className="w-full flex items-center justify-between p-4 hover:bg-slate-800 text-left border-b border-slate-800/50">
                                <span className="font-semibold text-sm text-slate-200">{ch.title}</span>
                                {expandedChapterId === ch.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                            {expandedChapterId === ch.id && (
                                <div className="bg-slate-950/50 py-2">
                                    {ch.subTopics.map((sub) => (
                                        <button key={sub.id} onClick={() => handleTopicClick(sub.title, sub.id)} className={`w-full text-left px-6 py-3 text-sm ${activeSubTopicId === sub.id ? 'text-indigo-400 bg-indigo-900/10 border-l-2 border-indigo-500' : 'text-slate-400 hover:bg-slate-800'}`}>
                                            {sub.title}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>

        <div className="col-span-12 lg:col-span-8">
          {isLoadingLecture ? (
             <div className="h-full flex flex-col items-center justify-center p-12 text-center animate-pulse">
                <Loader2 size={48} className="text-indigo-500 animate-spin mb-4" />
                <h3 className="text-xl font-bold text-white">{t.generating}</h3>
                <p className="text-slate-400 mt-2">{t.genDesc}</p>
             </div>
          ) : activeLecture ? (
            <div className="space-y-6">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl sticky top-4 z-20 backdrop-blur-md bg-slate-900/90 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white truncate mr-4">{activeLecture.topic}</h2>
                    <div className="flex items-center gap-6">
                        <button onClick={togglePlayback} className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 ${isPlaying ? 'bg-slate-800 text-red-400' : 'bg-emerald-600 text-white'}`}>
                            {isBuffering ? <Loader2 className="animate-spin" /> : isPlaying ? <Pause fill="currentColor" size={24} /> : <Play fill="currentColor" size={24} className="ml-1" />}
                        </button>
                    </div>
                </div>
                
                <div className="space-y-6 max-w-4xl mx-auto">
                    {activeLecture.sections.map((section, idx) => (
                        <div key={idx} ref={(el) => { sectionRefs.current[idx] = el; }} className={`p-5 rounded-2xl transition-all border ${currentSectionIndex === idx ? 'bg-indigo-900/40 border-indigo-500/50 shadow-lg' : 'bg-slate-900/40 border-transparent hover:bg-slate-900/60'}`}>
                            <p className="text-[10px] font-bold text-indigo-400 uppercase mb-2 tracking-widest">{section.speaker === 'Teacher' ? activeLecture.professorName : activeLecture.studentName}</p>
                            <p className={`text-base leading-relaxed ${currentSectionIndex === idx ? 'text-white' : 'text-slate-400'}`}>{section.text}</p>
                        </div>
                    ))}
                </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8">
                <h3 className="text-xl font-bold text-slate-300 mb-2">{t.selectTopic}</h3>
            </div>
          )}
        </div>
      </main>
      
      {/* Mobile Playback Floating Bar */}
      {activeLecture && isPlaying && (
        <div className="md:hidden fixed bottom-20 left-4 right-4 bg-indigo-600 rounded-2xl p-4 shadow-2xl flex items-center justify-between z-50 animate-fade-in-up">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-white"><Music size={20}/></div>
                <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{activeLecture.topic}</p>
                    <p className="text-[10px] text-white/70">Playing Lesson...</p>
                </div>
            </div>
            <button onClick={togglePlayback} className="w-10 h-10 bg-white text-indigo-600 rounded-full flex items-center justify-center shadow-md"><Pause size={20} fill="currentColor"/></button>
        </div>
      )}
    </div>
  );
};
