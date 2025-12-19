
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Channel, GeneratedLecture, Chapter, SubTopic, TranscriptItem, Attachment, UserProfile } from '../types';
import { ArrowLeft, Play, Pause, BookOpen, MessageCircle, Sparkles, User, GraduationCap, Loader2, ChevronDown, ChevronRight, SkipForward, SkipBack, Settings, X, Mic, Download, RefreshCw, Square, MoreVertical, Edit, Lock, Zap, ToggleLeft, ToggleRight, Users, Check, AlertTriangle, Activity, MessageSquare, FileText, Code, Video, Monitor, PlusCircle, Bot, ExternalLink, ChevronLeft, Menu, List, PanelLeftClose, PanelLeftOpen, CornerDownRight, Trash2, FileDown, Printer, FileJson, HelpCircle, ListMusic, Copy, Paperclip, UploadCloud, Crown, Radio, Info, AlertCircle, Bug, Terminal } from 'lucide-react';
import { generateLectureScript } from '../services/lectureGenerator';
import { generateCurriculum } from '../services/curriculumGenerator';
import { synthesizeSpeech, clearAudioCache, cleanTextForTTS, TtsErrorType } from '../services/tts';
import { OFFLINE_CHANNEL_ID, OFFLINE_CURRICULUM, OFFLINE_LECTURES } from '../utils/offlineContent';
import { SPOTLIGHT_DATA } from '../utils/spotlightContent';
import { STATIC_READING_MATERIALS } from '../utils/staticResources';
import { cacheLectureScript, getCachedLectureScript, deleteCachedLectureScript } from '../utils/db';
import { saveLectureToFirestore, getLectureFromFirestore, saveCurriculumToFirestore, getCurriculumFromFirestore, deleteLectureFromFirestore, uploadFileToStorage, addChannelAttachment, getUserProfile, voteChannel } from '../services/firestoreService';
import { LiveSession } from './LiveSession';
import { DiscussionModal } from './DiscussionModal';
import { GEMINI_API_KEY, OPENAI_API_KEY } from '../services/private_keys';
import { getGlobalAudioContext, warmUpAudioContext, coolDownAudioContext, connectOutput, registerAudioOwner, stopAllPlatformAudio, isAudioOwner, logAudioEvent, getAudioAuditLogs, getCurrentAudioOwner } from '../utils/audioUtils';

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
    back: "Back", series: "Series", startLive: "Start Live Chat", curriculum: "Curriculum", reading: "Reading", appendix: "Appendix", lessons: "Lessons", chapters: "Chapters", selectTopic: "Select a lesson to begin", generating: "Preparing Content...", genDesc: "Our AI professor is preparing the material.", transcript: "Interactive Transcript", segments: "Segments", discuss: "Discuss", continue: "Continue", viewDiscussion: "View History", askAbout: "Ask about this", noLesson: "No Lesson Selected", chooseChapter: "Choose a chapter and lesson from the curriculum menu.", player: "Lecture Player", prev: "Prev Lesson", next: "Next Lesson", startFree: "Start Free Talk", voiceSettings: "Voice Settings", teacherVoice: "Teacher Voice", studentVoice: "Student Voice", preview: "Test", close: "Close", download: "Export", regenerate: "Regenerate", cached: "Loaded from cache", genCurriculum: "Designing Course Syllabus...", loadingAudio: "Preparing...", downloadCourse: "Download Course", cancelDownload: "Stop Download", downloading: "Downloading Chapter...", edit: "Edit Podcast", loginReq: "Login Required", guestRestrict: "Guests can only view pre-generated content. Please login to generate new AI lectures.", systemVoice: "System Voice (Offline/Free)", quotaError: "Neural Audio Quota Exceeded. Switching to System Voice.", networkError: "Network timeout generating audio. Using System Voice.", upgradeReq: "Daily Neural Limit Reached. Upgrade to Pro for unlimited high-quality audio.", enableNeural: "Enable Neural Audio (Gemini API)", jump: "Double-click to play", preGenAudio: "Stream Audio", preGenDesc: "Generate high-quality Neural Audio for this lecture (Pro Member Only).", communityInsights: "Community Discussions", genAudio: "Stream Audio", genComplete: "Audio Ready!", errorPlayback: "Playback Error", resumeGen: "Resume Generation", genAbsorbed: "Processing...", dailyUsage: "Daily Usage", comments: "Comments", sessionSetup: "Session Setup", recordSession: "Record Session", recordDesc: "Save audio and transcript to cloud", start: "Start", generateCourse: "Generate Course Curriculum", debugTitle: "Audio Mutex Debugger", activeOwner: "Current Lock Owner"
  },
  zh: {
    back: "返回", series: "系列", startLive: "开始实时对话", curriculum: "课程大纲", reading: "阅读材料", appendix: "附录", lessons: "节课程", chapters: "章", selectTopic: "请选择一个主题开始", generating: "正在准备内容...", genDesc: "AI 教授正在准备教学材料。", transcript: "互动字幕", segments: "段对话", discuss: "讨论", continue: "继续", viewDiscussion: "查看历史", askAbout: "询问详情", noLesson: "未选择课程", chooseChapter: "请从课程大纲菜单中选择章节和课程。", player: "播放器", prev: "上一节", next: "下一节", startFree: "开始自由对话", voiceSettings: "语音设置", teacherVoice: "老师声音", studentVoice: "学生声音", preview: "试听", close: "关闭", download: "导出", regenerate: "重新生成", cached: "已加载缓存", genCurriculum: "正在设计课程大纲...", loadingAudio: "准备中...", downloadCourse: "下载全套课程", cancelDownload: "停止下载", downloading: "正在下载章节...", edit: "编辑播客", loginReq: "需要登录", guestRestrict: "访客只能查看预生成的内容。请登录以使用 AI 生成新课程。", systemVoice: "系统语音 (离线/免费)", quotaError: "神经语音配额已满。切换到系统语音。", networkError: "网络超时。切换到系统语音。", upgradeReq: "今日神经语音额度已用完。升级 Pro 以解锁无限量高质量语音。", enableNeural: "启用神经语音 (Gemini API)", jump: "双击播放", preGenAudio: "流式播放", preGenDesc: "生成高质量神经语音（仅限Pro会员）。", communityInsights: "社区讨论", genAudio: "流式播放", genComplete: "音频就绪！", errorPlayback: "播放错误", resumeGen: "恢复生成", genAbsorbed: "处理中...", dailyUsage: "今日用量", comments: "评论", sessionSetup: "会话设置", recordSession: "录制会话", recordDesc: "保存音频 and 幕到云端", start: "开始", generateCourse: "生成课程大纲", debugTitle: "音频互斥调试器", activeOwner: "当前锁持有者"
  }
};

const COMPONENT_ID = "LecturePlayer";

export const PodcastDetail: React.FC<PodcastDetailProps> = ({ channel, onBack, onStartLiveSession, language, onEditChannel, onViewComments, currentUser }) => {
  const t = UI_TEXT[language];
  const [activeTab, setActiveTab] = useState<'curriculum' | 'reading' | 'appendix'>('curriculum');
  const [activeLecture, setActiveLecture] = useState<GeneratedLecture | null>(null);
  const [isLoadingLecture, setIsLoadingLecture] = useState(false);
  
  // Fixed: Enhanced initial chapters state with fallback logic for offline and spotlight content
  const [chapters, setChapters] = useState<Chapter[]>(() => {
    if (channel.chapters && channel.chapters.length > 0) return channel.chapters;
    if (channel.id === OFFLINE_CHANNEL_ID) return OFFLINE_CURRICULUM;
    if (SPOTLIGHT_DATA[channel.id]) return SPOTLIGHT_DATA[channel.id].curriculum;
    return [];
  });
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number | null>(null);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [showDebugger, setShowDebugger] = useState(false);
  
  const [teacherVoice, setTeacherVoice] = useState(channel.voiceName || 'Puck');
  const [studentVoice, setStudentVoice] = useState('Puck');
  
  const hasGeminiKey = !!(localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY);
  const hasOpenAiKey = !!(localStorage.getItem('openai_api_key') || OPENAI_API_KEY || process.env.OPENAI_API_KEY);
  
  const [voiceProvider, setVoiceProvider] = useState<'system' | 'gemini' | 'openai'>(
      hasOpenAiKey ? 'openai' : (hasGeminiKey ? 'gemini' : 'system')
  );
  
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [sysTeacherVoiceURI, setSysTeacherVoiceURI] = useState('');
  const [sysStudentVoiceURI, setSysStudentVoiceURI] = useState('');
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);
  const [activeSubTopicId, setActiveSubTopicId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState(getAudioAuditLogs());
  
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const nextScheduleTimeRef = useRef(0);
  const schedulerTimerRef = useRef<any>(null);
  const isPlayingRef = useRef(false);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const schedulingCursorRef = useRef(0); 
  const playSessionIdRef = useRef(0);

  // Fixed: Added flatCurriculum memo for easy indexing of lessons across chapters
  const flatCurriculum = useMemo(() => {
    return chapters.flatMap((ch) => 
        (ch.subTopics || []).map((sub) => ({
            id: sub.id,
            title: sub.title
        }))
    );
  }, [chapters]);

  // Fixed: Added currentLectureIndex memo to resolve "Cannot find name" errors in navigation handlers
  const currentLectureIndex = useMemo(() => {
    return flatCurriculum.findIndex(t => t.id === activeSubTopicId);
  }, [flatCurriculum, activeSubTopicId]);

  // Sync debugger logs
  useEffect(() => {
      const handleAudit = () => setAuditLogs(getAudioAuditLogs());
      window.addEventListener('audio-audit-updated', handleAudit);
      return () => window.removeEventListener('audio-audit-updated', handleAudit);
  }, []);

  /**
   * ATOMIC STOP
   */
  const stopAudio = useCallback(() => {
    logAudioEvent(COMPONENT_ID, 'STOP', `Session ${playSessionIdRef.current} ending`);
    playSessionIdRef.current++; 
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    activeSourcesRef.current.forEach(source => { try { source.stop(); source.disconnect(); } catch(e) {} });
    activeSourcesRef.current = [];
    nextScheduleTimeRef.current = 0;
    if (schedulerTimerRef.current) { clearTimeout(schedulerTimerRef.current); schedulerTimerRef.current = null; }
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsBuffering(false);
    coolDownAudioContext();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }, []);

  useEffect(() => {
      stopAllPlatformAudio(COMPONENT_ID); // Hard kill on mount
      return () => stopAudio();
  }, [stopAudio]);

  const togglePlayback = async () => {
    if (isPlaying) { 
      stopAudio(); 
    } else {
      // 1. Acuire Platform-wide lock
      registerAudioOwner(COMPONENT_ID, stopAudio);

      const ctx = getGlobalAudioContext();
      await warmUpAudioContext(ctx);
      
      const sessionId = ++playSessionIdRef.current;
      const startIdx = currentSectionIndex && currentSectionIndex < (activeLecture?.sections.length || 0) ? currentSectionIndex : 0;
      schedulingCursorRef.current = startIdx;
      
      setIsPlaying(true);
      isPlayingRef.current = true;
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
      
      if (voiceProvider === 'system') {
          runSystemTts(sessionId);
      } else {
          runWebAudioScheduler(sessionId);
      }
    }
  };

  const runWebAudioScheduler = async (sessionId: number) => {
      if (!isPlayingRef.current || sessionId !== playSessionIdRef.current || !activeLecture) return;
      
      // Mutex Check: Did someone else take over while we were sleeping?
      if (!isAudioOwner(COMPONENT_ID)) {
          logAudioEvent(COMPONENT_ID, 'ABORT_STALE', "Lost Mutex lock during scheduler loop");
          stopAudio();
          return;
      }

      const ctx = getGlobalAudioContext();
      const lookahead = 3.0; 
      
      if (nextScheduleTimeRef.current < ctx.currentTime) {
          nextScheduleTimeRef.current = ctx.currentTime + 0.1;
      }

      while (nextScheduleTimeRef.current < ctx.currentTime + lookahead) {
          if (sessionId !== playSessionIdRef.current) return;

          const idx = schedulingCursorRef.current;
          if (idx >= activeLecture.sections.length) {
              const remaining = (nextScheduleTimeRef.current - ctx.currentTime) * 1000;
              setTimeout(() => { if (sessionId === playSessionIdRef.current) { stopAudio(); setCurrentSectionIndex(0); } }, Math.max(0, remaining));
              return;
          }

          const section = activeLecture.sections[idx];
          const voice = section.speaker === 'Teacher' ? teacherVoice : studentVoice;
          
          try {
              setIsBuffering(true);
              const result = await synthesizeSpeech(section.text, voice, ctx);
              setIsBuffering(false);
              
              // CRITICAL: Re-verify ownership after async TTS call
              if (sessionId !== playSessionIdRef.current || !isAudioOwner(COMPONENT_ID)) {
                  logAudioEvent(COMPONENT_ID, 'ABORT_STALE', `Ownership lost during TTS synthesis for index ${idx}`);
                  return;
              }
              
              if (result.buffer) {
                  const source = ctx.createBufferSource();
                  source.buffer = result.buffer;
                  connectOutput(source, ctx);
                  
                  const startAt = Math.max(nextScheduleTimeRef.current, ctx.currentTime);
                  logAudioEvent(COMPONENT_ID, 'PLAY_BUFFER', `Section ${idx} starting at ${startAt.toFixed(2)}s`);
                  
                  source.start(startAt);
                  activeSourcesRef.current.push(source);
                  
                  const delay = (startAt - ctx.currentTime) * 1000;
                  setTimeout(() => {
                      if (sessionId === playSessionIdRef.current) {
                          setCurrentSectionIndex(idx);
                          sectionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                  }, Math.max(0, delay));

                  nextScheduleTimeRef.current = startAt + result.buffer.duration;
                  schedulingCursorRef.current++;
              } else {
                  if (sessionId === playSessionIdRef.current) {
                    setVoiceProvider('system');
                    runSystemTts(sessionId);
                  }
                  return;
              }
          } catch(e) {
              if (sessionId === playSessionIdRef.current) {
                setVoiceProvider('system');
                runSystemTts(sessionId);
              }
              return;
          }
      }

      if (sessionId === playSessionIdRef.current) {
        schedulerTimerRef.current = setTimeout(() => runWebAudioScheduler(sessionId), 500);
      }
  };

  const runSystemTts = (sessionId: number) => {
      const idx = schedulingCursorRef.current;
      if (!activeLecture || idx >= activeLecture.sections.length || sessionId !== playSessionIdRef.current || !isAudioOwner(COMPONENT_ID)) {
          if (sessionId === playSessionIdRef.current) stopAudio();
          return;
      }
      
      setCurrentSectionIndex(idx);
      sectionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      const utter = new SpeechSynthesisUtterance(cleanTextForTTS(activeLecture.sections[idx].text));
      const targetURI = activeLecture.sections[idx].speaker === 'Teacher' ? sysTeacherVoiceURI : sysStudentVoiceURI;
      const v = systemVoices.find(v => v.voiceURI === targetURI);
      if (v) utter.voice = v;
      
      logAudioEvent(COMPONENT_ID, 'PLAY_SYSTEM', `Speaking section ${idx} via OS`);
      
      utter.onend = () => { 
          if (sessionId === playSessionIdRef.current && isAudioOwner(COMPONENT_ID)) { 
              schedulingCursorRef.current++; 
              runSystemTts(sessionId); 
          } 
      };
      
      window.speechSynthesis.speak(utter);
  };

  const handleTopicClick = async (topicTitle: string, subTopicId?: string) => {
    stopAllPlatformAudio(COMPONENT_ID);
    stopAudio();

    setActiveSubTopicId(subTopicId || null);
    setCurrentSectionIndex(0);
    schedulingCursorRef.current = 0;
    setActiveLecture(null);
    setIsLoadingLecture(true);
    
    try {
        if (OFFLINE_LECTURES[topicTitle]) { setActiveLecture(OFFLINE_LECTURES[topicTitle]); return; }
        const cacheKey = `lecture_${channel.id}_${subTopicId}_${language}`;
        const cached = await getCachedLectureScript(cacheKey);
        if (cached) { setActiveLecture(cached); return; }
        
        const script = await generateLectureScript(topicTitle, channel.description, language);
        if (script) {
          setActiveLecture(script);
          await cacheLectureScript(cacheKey, script);
        }
    } catch (e: any) { 
        console.error(e); 
    } finally { 
        setIsLoadingLecture(false); 
    }
  };

  const handlePrevLesson = () => { if (currentLectureIndex > 0) { const prev = flatCurriculum[currentLectureIndex - 1]; handleTopicClick(prev.title, prev.id); } };
  const handleNextLesson = () => { if (currentLectureIndex !== -1 && currentLectureIndex < flatCurriculum.length - 1) { const next = flatCurriculum[currentLectureIndex + 1]; handleTopicClick(next.title, next.id); } };

  return (
    <div className="h-full bg-slate-950 text-slate-100 flex flex-col relative overflow-y-auto pb-24">
      <div className="relative h-64 md:h-80 w-full shrink-0">
        <div className="absolute inset-0"><img src={channel.imageUrl} alt={channel.title} className="w-full h-full object-cover opacity-60"/><div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" /></div>
        <div className="absolute top-4 left-4 z-20 flex items-center gap-3"><button onClick={() => { stopAudio(); onBack(); }} className="flex items-center space-x-2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full hover:bg-white/10 transition-colors border border-white/10 text-sm font-medium"><ArrowLeft size={16} /><span>{t.back}</span></button></div>
        <div className="absolute bottom-0 left-0 w-full p-6 md:p-8 max-w-7xl mx-auto">
           <div className="flex items-end justify-between">
             <div><h1 className="text-4xl md:text-5xl font-bold text-white mb-2">{channel.title}</h1><p className="text-lg text-slate-300 max-w-2xl line-clamp-2">{channel.description}</p></div>
             <div className="hidden md:flex items-center space-x-3"><button onClick={() => onStartLiveSession()} className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-full font-bold shadow-lg"><Play size={20} fill="currentColor" /><span>{t.startLive}</span></button></div>
           </div>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 grid grid-cols-12 gap-8 relative">
        <div className="col-span-12 lg:col-span-4 h-full">
            <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden h-full flex flex-col">
                <div className="flex border-b border-slate-800"><button className="flex-1 py-3 text-sm font-bold bg-slate-800 text-white">{t.curriculum}</button></div>
                <div className="flex-1 overflow-y-auto">
                    {chapters.map((ch) => (
                        <div key={ch.id}>
                            <button onClick={() => setExpandedChapterId(expandedChapterId === ch.id ? null : ch.id)} className="w-full flex items-center justify-between p-4 hover:bg-slate-800 transition-colors text-left">
                                <span className="font-semibold text-sm text-slate-200">{ch.title}</span>
                                {expandedChapterId === ch.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                            {expandedChapterId === ch.id && (
                                <div className="bg-slate-950/50 py-2">
                                    {ch.subTopics.map((sub) => (
                                        <button key={sub.id} onClick={() => handleTopicClick(sub.title, sub.id)} className={`w-full flex items-start space-x-3 px-6 py-3 ${activeSubTopicId === sub.id ? 'bg-indigo-900/20 border-l-2 border-indigo-500' : 'hover:bg-slate-800'}`}>
                                            <span className={`text-sm ${activeSubTopicId === sub.id ? 'text-indigo-200' : 'text-slate-400'}`}>{sub.title}</span>
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
            <div className="space-y-8">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl sticky top-8 z-20 backdrop-blur-md bg-slate-900/90">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-white">{activeLecture.topic}</h2>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setShowDebugger(!showDebugger)} className={`p-2 rounded-full ${showDebugger ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`} title="Audio Debugger"><Bug size={18} /></button>
                            <button onClick={() => setShowVoiceSettings(!showVoiceSettings)} className={`p-2 rounded-full ${showVoiceSettings ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}><Settings size={18} /></button>
                        </div>
                    </div>

                    {showDebugger && (
                        <div className="mb-4 bg-black/80 rounded-xl border border-amber-500/30 p-4 font-mono text-[10px] animate-fade-in-up">
                            <div className="flex justify-between items-center mb-2 border-b border-slate-800 pb-1">
                                <span className="text-amber-400 font-bold flex items-center gap-1"><Terminal size={12}/> {t.debugTitle}</span>
                                <span className="text-slate-500">{t.activeOwner}: <span className="text-indigo-300 font-bold">{getCurrentAudioOwner() || 'NONE'}</span></span>
                            </div>
                            <div className="max-h-32 overflow-y-auto space-y-1">
                                {auditLogs.map((log, i) => (
                                    <div key={i} className="flex gap-2">
                                        <span className="text-slate-600">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                                        <span className={`font-bold ${log.source === COMPONENT_ID ? 'text-indigo-400' : 'text-pink-400'}`}>{log.source}</span>
                                        <span className="text-slate-300 font-bold">{log.action}</span>
                                        <span className="text-slate-500 italic">{log.details}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {showVoiceSettings && (
                        <div className="mb-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700 animate-fade-in">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="text-xs font-bold text-slate-400 uppercase">{t.voiceSettings}</h4>
                                <div className="flex items-center bg-slate-900 rounded-lg p-1">
                                    <button onClick={() => { setVoiceProvider('system'); stopAudio(); }} className={`px-3 py-1.5 text-xs font-bold rounded-md ${voiceProvider === 'system' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>System</button>
                                    <button onClick={() => { setVoiceProvider('gemini'); stopAudio(); }} className={`px-3 py-1.5 text-xs font-bold rounded-md ${voiceProvider === 'gemini' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>Gemini</button>
                                    <button onClick={() => { setVoiceProvider('openai'); stopAudio(); }} className={`px-3 py-1.5 text-xs font-bold rounded-md ${voiceProvider === 'openai' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>OpenAI</button>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="flex justify-between items-center mt-6 pt-6 border-t border-slate-800">
                        <button onClick={handlePrevLesson} disabled={currentLectureIndex <= 0} className="text-slate-400 disabled:opacity-30 flex items-center space-x-2 text-sm font-bold"><SkipBack size={20} /></button>
                        <div className="flex flex-col items-center gap-2">
                            <button onClick={togglePlayback} className={`w-16 h-16 rounded-full flex items-center justify-center ${isPlaying ? 'bg-slate-800 text-red-400' : 'bg-emerald-600 text-white'}`}>
                                {isBuffering ? <Loader2 className="animate-spin" /> : isPlaying ? <Pause fill="currentColor" size={28} /> : <Play fill="currentColor" size={28} />}
                            </button>
                            {isBuffering && <span className="text-xs text-slate-500">{t.loadingAudio}</span>}
                        </div>
                        <button onClick={handleNextLesson} disabled={currentLectureIndex === -1 || currentLectureIndex >= flatCurriculum.length - 1} className="text-slate-400 disabled:opacity-30 flex items-center space-x-2 text-sm font-bold"><SkipForward size={20} /></button>
                    </div>
                </div>
                <div className="space-y-6 max-w-4xl mx-auto">
                    {activeLecture.sections.map((section, idx) => (
                        <div key={idx} ref={(el) => { sectionRefs.current[idx] = el; }} className={`p-4 rounded-xl transition-all ${currentSectionIndex === idx ? 'bg-indigo-900/40 border border-indigo-500/50 shadow-lg' : 'hover:bg-slate-800/30 border border-transparent'}`}>
                            <div className="flex items-start space-x-4">
                                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold border ${section.speaker === 'Teacher' ? 'bg-slate-800 border-indigo-500 text-indigo-400' : 'bg-slate-800 border-purple-500 text-purple-400'}`}>{section.speaker === 'Teacher' ? 'Pro' : 'Stu'}</div>
                                <div className="flex-1">
                                    <p className="text-xs font-bold text-slate-500 uppercase mb-1">{section.speaker === 'Teacher' ? activeLecture.professorName : activeLecture.studentName}</p>
                                    <p className={`text-base leading-relaxed ${currentSectionIndex === idx ? 'text-white font-medium' : 'text-slate-400'}`}>{section.text}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8"><h3 className="text-xl font-bold text-slate-300 mb-2">{t.selectTopic}</h3></div>
          )}
        </div>
      </main>
    </div>
  );
};
