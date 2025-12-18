
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Channel, GeneratedLecture, Chapter, SubTopic, TranscriptItem, Attachment, UserProfile } from '../types';
import { ArrowLeft, Play, Pause, BookOpen, MessageCircle, Sparkles, User, GraduationCap, Loader2, ChevronDown, ChevronRight, SkipForward, SkipBack, Settings, X, Mic, Download, RefreshCw, Square, MoreVertical, Edit, Lock, Zap, ToggleLeft, ToggleRight, Users, Check, AlertTriangle, Activity, MessageSquare, FileText, Code, Video, Monitor, PlusCircle, Bot, ExternalLink, ChevronLeft, Menu, List, PanelLeftClose, PanelLeftOpen, CornerDownRight, Trash2, FileDown, Printer, FileJson, HelpCircle, ListMusic, Copy, Paperclip, UploadCloud, Crown, Radio, Info, AlertCircle } from 'lucide-react';
import { generateLectureScript } from '../services/lectureGenerator';
import { generateCurriculum } from '../services/curriculumGenerator';
import { synthesizeSpeech, clearAudioCache, checkAudioCache, cleanTextForTTS, TtsErrorType } from '../services/tts';
import { OFFLINE_CHANNEL_ID, OFFLINE_CURRICULUM, OFFLINE_LECTURES } from '../utils/offlineContent';
import { SPOTLIGHT_DATA } from '../utils/spotlightContent';
import { STATIC_READING_MATERIALS } from '../utils/staticResources';
import { cacheLectureScript, getCachedLectureScript, deleteCachedLectureScript } from '../utils/db';
import { saveLectureToFirestore, getLectureFromFirestore, saveCurriculumToFirestore, getCurriculumFromFirestore, deleteLectureFromFirestore, uploadFileToStorage, addChannelAttachment, getUserProfile } from '../services/firestoreService';
import { LiveSession } from './LiveSession';
import { DiscussionModal } from './DiscussionModal';
import { GEMINI_API_KEY, OPENAI_API_KEY } from '../services/private_keys';

interface PodcastDetailProps {
  channel: Channel;
  onBack: () => void;
  onStartLiveSession: (context?: string, lectureId?: string, recordingEnabled?: boolean, videoEnabled?: boolean, activeSegment?: { index: number, lectureId: string }, cameraEnabled?: boolean) => void;
  language: 'en' | 'zh';
  onEditChannel?: () => void; 
  onViewComments?: () => void;
  currentUser: any; 
}

const GEMINI_VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
const OPENAI_VOICES = ['Alloy', 'Echo', 'Fable', 'Onyx', 'Nova', 'Shimmer'];
const BLOCKLIST = ['Fred', 'Trinoids', 'Albert', 'Bad News', 'Bells', 'Cellos', 'Good News', 'Organ', 'Zarvox', 'Deranged', 'Hysterical', 'Boing', 'Bubbles', 'Bahh', 'Whisper', 'Wobble'];
const QUALITY_KEYWORDS = [
    'Google', 'Premium', 'Enhanced', 'Natural', 'Siri', 'Neural', 
    'Daniel', 'Samantha', 'Karen', 'Rishi', 'Moira', 'Tessa', 'Arthur', 'Martha', 
    'Ting-Ting', 'Meijia', 'Sin-ji', 'Alex'
];

const UI_TEXT = {
  en: {
    back: "Back",
    series: "Series",
    startLive: "Start Live Chat",
    curriculum: "Curriculum",
    reading: "Reading",
    appendix: "Appendix",
    lessons: "Lessons",
    chapters: "Chapters",
    selectTopic: "Select a lesson to begin",
    generating: "Preparing Content...",
    genDesc: "Our AI professor is preparing the material.",
    transcript: "Interactive Transcript",
    segments: "Segments",
    discuss: "Discuss",
    continue: "Continue",
    viewDiscussion: "View History",
    askAbout: "Ask about this",
    noLesson: "No Lesson Selected",
    chooseChapter: "Choose a chapter and lesson from the curriculum menu.",
    player: "Lecture Player",
    prev: "Prev Lesson",
    next: "Next Lesson",
    startFree: "Start Free Talk",
    voiceSettings: "Voice Settings",
    teacherVoice: "Teacher Voice",
    studentVoice: "Student Voice",
    preview: "Test",
    close: "Close",
    download: "Export",
    regenerate: "Regenerate",
    cached: "Loaded from cache",
    genCurriculum: "Designing Course Syllabus...",
    loadingAudio: "Buffering...",
    downloadCourse: "Download Course",
    cancelDownload: "Stop Download",
    downloading: "Downloading Chapter...",
    edit: "Edit Podcast",
    loginReq: "Login Required",
    guestRestrict: "Guests can only view pre-generated content. Please login to generate new AI lectures.",
    systemVoice: "System Voice (Offline/Free)",
    quotaError: "Neural Audio Quota Exceeded. Switching to System Voice.",
    networkError: "Network timeout generating audio. Using System Voice.",
    upgradeReq: "Daily Neural Limit Reached. Upgrade to Pro for unlimited high-quality audio.",
    enableNeural: "Enable Neural Audio (Gemini API)",
    jump: "Double-click to play",
    preGenAudio: "Stream Audio",
    preGenDesc: "Generate high-quality Neural Audio for this lecture (Pro Member Only).",
    communityInsights: "Community Discussions",
    genAudio: "Stream Audio",
    genComplete: "Audio Ready!",
    errorPlayback: "Playback Error",
    resumeGen: "Resume Generation",
    genPaused: "Generation Paused",
    dailyUsage: "Daily Usage",
    comments: "Comments",
    sessionSetup: "Session Setup",
    recordSession: "Record Session",
    recordDesc: "Save audio and transcript to cloud",
    start: "Start",
    generateCourse: "Generate Course Curriculum"
  },
  zh: {
    back: "返回",
    series: "系列",
    startLive: "开始实时对话",
    curriculum: "课程大纲",
    reading: "阅读材料",
    appendix: "附录",
    lessons: "节课程",
    chapters: "章",
    selectTopic: "请选择一个主题开始",
    generating: "正在准备内容...",
    genDesc: "AI 教授正在准备教学材料。",
    transcript: "互动字幕",
    segments: "段对话",
    discuss: "讨论",
    continue: "继续",
    viewDiscussion: "查看历史",
    askAbout: "询问详情",
    noLesson: "未选择课程",
    chooseChapter: "请从课程大纲菜单中选择章节和课程。",
    player: "播放器",
    prev: "上一节",
    next: "下一节",
    startFree: "开始自由对话",
    voiceSettings: "语音设置",
    teacherVoice: "老师声音",
    studentVoice: "学生声音",
    preview: "试听",
    close: "关闭",
    download: "导出",
    regenerate: "重新生成",
    cached: "已加载缓存",
    genCurriculum: "正在设计课程大纲...",
    loadingAudio: "缓冲中...",
    downloadCourse: "下载全套课程",
    cancelDownload: "停止下载",
    downloading: "正在下载章节...",
    edit: "编辑播客",
    loginReq: "需要登录",
    guestRestrict: "访客只能查看预生成的内容。请登录以使用 AI 生成新课程。",
    systemVoice: "系统语音 (离线/免费)",
    quotaError: "神经语音配额已满。切换到系统语音。",
    networkError: "网络超时。切换到系统语音。",
    upgradeReq: "今日神经语音额度已用完。升级 Pro 以解锁无限量高质量语音。",
    enableNeural: "启用神经语音 (Gemini API)",
    jump: "双击播放",
    preGenAudio: "流式播放",
    preGenDesc: "生成高质量神经语音（仅限Pro会员）。",
    communityInsights: "社区讨论",
    genAudio: "流式播放",
    genComplete: "音频就绪！",
    errorPlayback: "播放错误",
    resumeGen: "恢复生成",
    genPaused: "生成已暂停",
    dailyUsage: "今日用量",
    comments: "评论",
    sessionSetup: "会话设置",
    recordSession: "录制会话",
    recordDesc: "保存音频和字幕到云端",
    start: "开始",
    generateCourse: "生成课程大纲"
  }
};

interface GenProgress {
  current: number;
  total: number;
}

export const PodcastDetail: React.FC<PodcastDetailProps> = ({ channel, onBack, onStartLiveSession, language, onEditChannel, onViewComments, currentUser }) => {
  const t = UI_TEXT[language];
  const [activeTab, setActiveTab] = useState<'curriculum' | 'reading' | 'appendix'>('curriculum');
  const [activeLecture, setActiveLecture] = useState<GeneratedLecture | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingLecture, setIsLoadingLecture] = useState(false);
  const [isLoadedFromCache, setIsLoadedFromCache] = useState(false);
  
  const [chapters, setChapters] = useState<Chapter[]>(channel.chapters || []);
  const [isGeneratingCurriculum, setIsGeneratingCurriculum] = useState(false);
  
  const staticReading = STATIC_READING_MATERIALS[channel.title];
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number | null>(null);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  
  // Voice State: Default to channel voice if available
  const [teacherVoice, setTeacherVoice] = useState(channel.voiceName || 'Puck');
  const [studentVoice, setStudentVoice] = useState('Puck');
  
  // Provider: 'system' | 'gemini' | 'openai'
  const hasGeminiKey = !!(localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY);
  const hasOpenAiKey = !!(localStorage.getItem('openai_api_key') || OPENAI_API_KEY || process.env.OPENAI_API_KEY);
  
  const [voiceProvider, setVoiceProvider] = useState<'system' | 'gemini' | 'openai'>(
      hasOpenAiKey ? 'openai' : (hasGeminiKey ? 'gemini' : 'system')
  );
  
  // Debug / Fallback State
  const [fallbackReason, setFallbackReason] = useState<TtsErrorType | 'membership' | 'none'>('none');

  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [allRawVoices, setAllRawVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [sysTeacherVoiceURI, setSysTeacherVoiceURI] = useState('');
  const [sysStudentVoiceURI, setSysStudentVoiceURI] = useState('');
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);
  const [activeSubTopicId, setActiveSubTopicId] = useState<string | null>(null);
  const [guestError, setGuestError] = useState<string | null>(null);
  
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [isSessionSetupOpen, setIsSessionSetupOpen] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [liveConfig, setLiveConfig] = useState<{
      context?: string;
      lectureId?: string;
      recording?: boolean;
      video?: boolean;
      camera?: boolean;
      segment?: { index: number, lectureId: string };
      initialTranscript?: TranscriptItem[];
      discussionId?: string;
  }>({});

  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextScheduleTimeRef = useRef(0);
  const schedulerTimerRef = useRef<any>(null);
  const isPlayingRef = useRef(false);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  
  const schedulingCursorRef = useRef(0); 
  const uiTimersRef = useRef<number[]>([]); 
  const playSessionIdRef = useRef(0);
  
  const isMember = !!currentUser;
  const isChannelOwner = currentUser && (channel.ownerId === currentUser.uid);
  const isSuperAdmin = currentUser?.email === 'shengliang.song@gmail.com';
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (currentUser) {
        getUserProfile(currentUser.uid).then(setUserProfile);
    }
  }, [currentUser]);

  const flatCurriculum = useMemo(() => {
      if(!chapters) return [];
      return chapters.flatMap(ch => (ch.subTopics || []).map(sub => ({ ...sub, chapterTitle: ch.title })));
  }, [chapters]);

  const currentLectureIndex = useMemo(() => {
      if(!activeSubTopicId) return -1;
      return flatCurriculum.findIndex(item => item.id === activeSubTopicId);
  }, [activeSubTopicId, flatCurriculum]);

  useEffect(() => {
      const handleResize = () => {
          stopAudio();
          clearAudioCache();
      };
      window.addEventListener('resize', handleResize);
      return () => {
          window.removeEventListener('resize', handleResize);
          stopAudio();
          clearAudioCache();
      };
  }, []);

  useEffect(() => { clearAudioCache(); }, [channel.id]);

  const loadVoices = useCallback(() => {
    const voices = window.speechSynthesis.getVoices();
    setAllRawVoices(voices); 
    const langCode = language === 'zh' ? 'zh' : 'en';
    
    let filtered = voices.filter(v => {
        const isLangMatch = v.lang.startsWith(langCode) || (langCode === 'en' && v.lang.startsWith('en'));
        const isSiri = v.name.toLowerCase().includes('siri');
        return (isLangMatch || isSiri) && !BLOCKLIST.some(bad => v.name.includes(bad));
    });

    const getScore = (v: SpeechSynthesisVoice) => {
        const name = v.name.toLowerCase();
        if (name.includes('alex') && name.includes('us')) return 20;
        if (name === 'alex') return 19;
        if (name.includes('daniel') && name.includes('enhanced')) return 18;
        if (name.includes('daniel')) return 17;
        if (name.includes('siri')) return 10;
        if (name.includes('enhanced') || name.includes('premium') || name.includes('neural') || name.includes('google')) return 5;
        if (QUALITY_KEYWORDS.some(k => name.includes(k.toLowerCase()))) return 4;
        return 1;
    };

    filtered.sort((a, b) => getScore(b) - getScore(a));
    if (filtered.length === 0) {
        filtered = voices.filter(v => !BLOCKLIST.some(bad => v.name.includes(bad)));
        filtered.sort((a, b) => getScore(b) - getScore(a));
    }
    setSystemVoices(filtered);
    
    if (filtered.length > 0) {
        const bestTeacher = filtered[0];
        let bestStudent = filtered.length > 1 ? filtered[1] : filtered[0];
        setSysTeacherVoiceURI(prev => prev || bestTeacher.voiceURI);
        setSysStudentVoiceURI(prev => prev || bestStudent.voiceURI);
    }
  }, [language]);

  useEffect(() => {
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    const intervalId = setInterval(loadVoices, 1000);
    return () => { clearInterval(intervalId); };
  }, [loadVoices]);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  const unlockAudioContext = () => {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') ctx.resume().catch(console.error);
  };

  const stopAudio = useCallback(() => {
    window.speechSynthesis.cancel();
    activeUtteranceRef.current = null;
    activeSourcesRef.current.forEach(source => { try { source.stop(); } catch(e) {} });
    activeSourcesRef.current = [];
    nextScheduleTimeRef.current = 0;
    if (schedulerTimerRef.current) { clearTimeout(schedulerTimerRef.current); schedulerTimerRef.current = null; }
    uiTimersRef.current.forEach(id => clearTimeout(id));
    uiTimersRef.current = [];
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsBuffering(false);
    playSessionIdRef.current++;
  }, []);

  useEffect(() => {
     if (channel.chapters && channel.chapters.length > 0) setChapters(channel.chapters);
     if (staticReading && (!channel.chapters || channel.chapters.length === 0)) {
         setActiveTab('reading');
     }
  }, [channel.chapters, staticReading]);

  useEffect(() => {
    const loadCurriculum = async () => {
      if (channel.id === OFFLINE_CHANNEL_ID) { setChapters(OFFLINE_CURRICULUM); setExpandedChapterId(OFFLINE_CURRICULUM[0].id); return; }
      const spotlight = SPOTLIGHT_DATA[channel.id];
      if (spotlight) { setChapters(spotlight.curriculum); if (spotlight.curriculum.length > 0) setExpandedChapterId(spotlight.curriculum[0].id); return; }
      if (channel.chapters && channel.chapters.length > 0) { setChapters(channel.chapters); setExpandedChapterId(channel.chapters[0].id); return; }
      const cacheKey = `curriculum_${channel.id}_${language}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) { try { const parsed = JSON.parse(cached); setChapters(parsed); if (parsed.length > 0) setExpandedChapterId(parsed[0].id); return; } catch(e) {} }
      if (isMember && !staticReading) { 
          const cloudCurriculum = await getCurriculumFromFirestore(channel.id);
          if (cloudCurriculum) { setChapters(cloudCurriculum); if (cloudCurriculum.length > 0) setExpandedChapterId(cloudCurriculum[0].id); localStorage.setItem(cacheKey, JSON.stringify(cloudCurriculum)); return; }
      }
      if (isChannelOwner && !staticReading) {
          handleRegenerateCurriculum(true); 
      }
    };
    loadCurriculum();
  }, [channel.id, language, isMember, isChannelOwner, staticReading]);

  useEffect(() => {
      if (chapters.length > 0 && !activeSubTopicId && !isLoadingLecture && !activeLecture) {
          const firstChapter = chapters[0];
          if (firstChapter && firstChapter.subTopics.length > 0) {
              const firstLesson = firstChapter.subTopics[0];
              setTimeout(() => { handleTopicClick(firstLesson.title, firstLesson.id); }, 100);
          }
      }
  }, [chapters]);

  useEffect(() => {
      if (activeLecture && !isPlaying && !isLiveActive) {
          playSessionIdRef.current++;
          setIsPlaying(true);
      }
  }, [activeLecture]);

  const handleRegenerateCurriculum = async (isAuto = false) => {
      if (!isChannelOwner) { if (!isAuto) alert(t.guestRestrict); return; }
      const isEmpty = !chapters || chapters.length === 0;
      if (!isAuto && !isEmpty && !confirm("Are you sure?")) return;
      setIsGeneratingCurriculum(true);
      try {
          const generated = await generateCurriculum(channel.title, channel.description, language);
          if (generated) {
              setChapters(generated);
              if (generated.length > 0) setExpandedChapterId(generated[0].id);
              const cacheKey = `curriculum_${channel.id}_${language}`;
              localStorage.setItem(cacheKey, JSON.stringify(generated));
              if (currentUser) await saveCurriculumToFirestore(channel.id, generated);
          }
      } catch(e) { console.error(e); } finally { setIsGeneratingCurriculum(false); }
  };

  useEffect(() => {
    const checkStatus = async () => {
        if (!activeLecture) { setIsAudioReady(false); return; }
        let allReady = true;
        for (const section of activeLecture.sections) {
            const voice = section.speaker === 'Teacher' ? teacherVoice : studentVoice;
            const hasAudio = await checkAudioCache(section.text, voice);
            if (!hasAudio) { allReady = false; break; }
        }
        setIsAudioReady(allReady);
    };
    checkStatus();
  }, [activeLecture, teacherVoice, studentVoice]);

  const handleGenerateAudio = async () => {
    if (!activeLecture) return;
    
    // Check Daily Limit for Free Users
    const isPro = userProfile?.subscriptionTier === 'pro';
    if (!isPro && !isSuperAdmin && voiceProvider !== 'system') {
        const today = new Date().toISOString().split('T')[0];
        const usageKey = `daily_gen_${currentUser?.uid || 'guest'}_${today}`;
        const usageCount = parseInt(localStorage.getItem(usageKey) || '0');
        
        if (usageCount >= 1) {
             setFallbackReason('membership');
             setVoiceProvider('system');
             return;
        }
        localStorage.setItem(usageKey, (usageCount + 1).toString());
    }

    if (voiceProvider === 'gemini' && !hasGeminiKey) { alert("Gemini API Key missing."); setVoiceProvider('system'); return; }
    if (voiceProvider === 'openai' && !hasOpenAiKey) { alert("OpenAI API Key missing."); setVoiceProvider('system'); return; }
    
    setIsGenerating(true);
    setFallbackReason('none');
    setTimeout(() => {
        setIsGenerating(false);
        setIsAudioReady(true);
        togglePlayback();
    }, 500);
  };

  const handleRegenerateLecture = async () => {
    if (!activeLecture) return;
    if (!isMember && !isChannelOwner) { alert(t.guestRestrict); return; }
    if (!confirm("Regenerate?")) return;
    stopAudio();
    setIsGenerating(true);
    setIsLoadingLecture(true);
    try {
        const script = await generateLectureScript(activeLecture.topic, channel.description, language);
        if (script) {
            setActiveLecture(script);
            setIsAudioReady(false);
            if (activeSubTopicId) {
                const cacheKey = `lecture_${channel.id}_${activeSubTopicId}_${language}`;
                await cacheLectureScript(cacheKey, script);
                if (currentUser && activeSubTopicId) await saveLectureToFirestore(channel.id, activeSubTopicId, script);
            }
            setCurrentSectionIndex(0);
        }
    } catch(e) { console.error(e); } finally { setIsGenerating(false); setIsLoadingLecture(false); }
  };

  const handleDeleteLecture = async () => {
      if(!activeSubTopicId || !activeLecture) return;
      if (!confirm("Delete this lecture content?")) return;
      try {
          const cacheKey = `lecture_${channel.id}_${activeSubTopicId}_${language}`;
          await deleteCachedLectureScript(cacheKey);
          if (currentUser) await deleteLectureFromFirestore(channel.id, activeSubTopicId);
          setActiveLecture(null);
      } catch(e) { alert("Failed to delete."); }
  };

  useEffect(() => {
    const sessionId = ++playSessionIdRef.current;
    if (isPlaying) {
      if (voiceProvider !== 'system') {
        const schedule = async () => {
          if (!isPlayingRef.current) return;
          const ctx = getAudioContext();
          if (ctx.state === 'suspended') { try { await ctx.resume(); } catch(e) {} }

          const lookahead = 0.5; 
          if (nextScheduleTimeRef.current < ctx.currentTime) { 
              nextScheduleTimeRef.current = ctx.currentTime + 0.1; 
          }
          
          while (nextScheduleTimeRef.current < ctx.currentTime + lookahead && activeLecture) {
             const scheduleIdx = schedulingCursorRef.current; 
             if (playSessionIdRef.current !== sessionId) return; 
             
             if (scheduleIdx >= activeLecture.sections.length) {
                setTimeout(() => { 
                    if (isPlayingRef.current && playSessionIdRef.current === sessionId) { 
                        stopAudio(); 
                        setCurrentSectionIndex(0); 
                    } 
                }, (nextScheduleTimeRef.current - ctx.currentTime) * 1000);
                return;
             }

             const section = activeLecture.sections[scheduleIdx];
             let targetVoice = section.speaker === 'Teacher' ? teacherVoice : studentVoice;
             if (voiceProvider === 'openai' && !OPENAI_VOICES.includes(targetVoice)) targetVoice = section.speaker === 'Teacher' ? 'Alloy' : 'Echo';
             else if (voiceProvider === 'gemini' && !GEMINI_VOICES.includes(targetVoice)) targetVoice = section.speaker === 'Teacher' ? 'Puck' : 'Zephyr';

             try {
                setIsBuffering(true);
                const result = await synthesizeSpeech(section.text, targetVoice, ctx);
                setIsBuffering(false);
                
                if (playSessionIdRef.current !== sessionId) return; 
                
                if (result.buffer) {
                   const audioBuffer = result.buffer;
                   const source = ctx.createBufferSource();
                   source.buffer = audioBuffer;
                   source.connect(ctx.destination);
                   activeSourcesRef.current.push(source);
                   source.onended = () => { activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source); };
                   
                   const actualStart = Math.max(nextScheduleTimeRef.current, ctx.currentTime);
                   source.start(actualStart);
                   
                   const timerId = window.setTimeout(() => {
                       if (isPlayingRef.current && playSessionIdRef.current === sessionId) {
                           setCurrentSectionIndex(scheduleIdx); 
                           sectionRefs.current[scheduleIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                       }
                   }, Math.max(0, (actualStart - ctx.currentTime) * 1000));
                   uiTimersRef.current.push(timerId); 
                   
                   nextScheduleTimeRef.current = actualStart + audioBuffer.duration;
                   schedulingCursorRef.current++; 
                   break; 
                } else {
                   // TRIGGER FALLBACK
                   setFallbackReason(result.errorType);
                   setVoiceProvider('system');
                   window.speechSynthesis.cancel();
                   return;
                }
             } catch(e) { 
                 setFallbackReason('unknown');
                 setVoiceProvider('system');
                 window.speechSynthesis.cancel();
                 return;
             }
          }
          if (isPlayingRef.current && playSessionIdRef.current === sessionId) { schedulerTimerRef.current = setTimeout(schedule, 200); }
        };
        isPlayingRef.current = true;
        schedule();
      } else {
        const playSystem = () => {
           const idx = schedulingCursorRef.current;
           if (!activeLecture || idx >= activeLecture.sections.length) { stopAudio(); setCurrentSectionIndex(0); return; }
           if (playSessionIdRef.current !== sessionId) return;

           setCurrentSectionIndex(idx);
           sectionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
           const section = activeLecture.sections[idx];
           const utter = new SpeechSynthesisUtterance(cleanTextForTTS(section.text));
           const targetURI = section.speaker === 'Teacher' ? sysTeacherVoiceURI : sysStudentVoiceURI;
           const v = systemVoices.find(v => v.voiceURI === targetURI);
           if (v) utter.voice = v;
           utter.onend = () => { if (isPlayingRef.current && playSessionIdRef.current === sessionId) { schedulingCursorRef.current++; playSystem(); } };
           activeUtteranceRef.current = utter;
           window.speechSynthesis.cancel(); 
           window.speechSynthesis.speak(utter);
        };
        isPlayingRef.current = true;
        playSystem();
      }
    }
    return () => { 
        if (schedulerTimerRef.current) clearTimeout(schedulerTimerRef.current);
        playSessionIdRef.current++; 
        window.speechSynthesis.cancel(); 
    };
  }, [isPlaying, activeLecture, voiceProvider, teacherVoice, studentVoice, sysTeacherVoiceURI, sysStudentVoiceURI]);

  const handleTopicClick = async (topicTitle: string, subTopicId?: string) => {
    if (isLiveActive) setIsLiveActive(false); 
    if (!topicTitle) return;
    setActiveSubTopicId(subTopicId || null);
    stopAudio(); setCurrentSectionIndex(0); schedulingCursorRef.current = 0; 
    setActiveLecture(null); setGuestError(null); setIsLoadingLecture(true);
    setFallbackReason('none');
    try {
        if (OFFLINE_LECTURES[topicTitle]) { setActiveLecture(OFFLINE_LECTURES[topicTitle]); setIsLoadedFromCache(true); return; }
        const cacheKey = `lecture_${channel.id}_${subTopicId}_${language}`;
        const cached = await getCachedLectureScript(cacheKey);
        if (cached) { setActiveLecture(cached); setIsLoadedFromCache(true); return; }
        if (isMember || isChannelOwner || hasGeminiKey) {
          setIsGenerating(true);
          const script = await generateLectureScript(topicTitle, channel.description, language);
          setIsGenerating(false);
          if (script) {
            setActiveLecture(script);
            await cacheLectureScript(cacheKey, script);
            if (currentUser && subTopicId) await saveLectureToFirestore(channel.id, subTopicId, script);
          }
        } else { setGuestError(t.guestRestrict); }
    } catch (e: any) { console.error(e); } finally { setIsLoadingLecture(false); }
  };

  const handlePrevLesson = () => { if (currentLectureIndex > 0) { const prevLesson = flatCurriculum[currentLectureIndex - 1]; handleTopicClick(prevLesson.title, prevLesson.id); } };
  const handleNextLesson = () => { if (currentLectureIndex !== -1 && currentLectureIndex < flatCurriculum.length - 1) { const nextLesson = flatCurriculum[currentLectureIndex + 1]; handleTopicClick(nextLesson.title, nextLesson.id); } };

  const togglePlayback = () => {
    if (isPlaying) { stopAudio(); } else {
      stopAudio(); unlockAudioContext(); playSessionIdRef.current++; 
      const startIdx = currentSectionIndex && currentSectionIndex < (activeLecture?.sections.length || 0) ? currentSectionIndex : 0;
      schedulingCursorRef.current = startIdx;
      setIsPlaying(true);
    }
  };

  const handleSegmentDoubleClick = (index: number) => {
      stopAudio(); setCurrentSectionIndex(index); schedulingCursorRef.current = index;
      setTimeout(() => { unlockAudioContext(); isPlayingRef.current = true; setIsPlaying(true); }, 50); 
  };

  const switchProvider = (prov: 'system' | 'gemini' | 'openai') => {
      if (prov === 'gemini' && !hasGeminiKey) return alert("Gemini Key required.");
      if (prov === 'openai' && !hasOpenAiKey) return alert("OpenAI Key required.");
      stopAudio(); 
      setVoiceProvider(prov);
      setFallbackReason('none');
      if (prov === 'openai') { setTeacherVoice('Alloy'); setStudentVoice('Echo'); }
      else if (prov === 'gemini') { setTeacherVoice('Puck'); setStudentVoice('Zephyr'); }
  };

  const liveSessionChannel = useMemo(() => {
    if (!channel) return null;
    if (language === 'zh') return { ...channel, systemInstruction: channel.systemInstruction + "\n\nIMPORTANT: Please speak and interact in Simplified Chinese (Mandarin)." };
    return channel;
  }, [channel, language]);

  return (
    <div className="h-full bg-slate-950 text-slate-100 flex flex-col relative overflow-y-auto pb-24">
      {/* Header */}
      <div className="relative h-64 md:h-80 w-full shrink-0">
        <div className="absolute inset-0"><img src={channel.imageUrl} alt={channel.title} className="w-full h-full object-cover opacity-60"/><div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" /></div>
        <div className="absolute top-4 left-4 z-20 flex items-center gap-3"><button onClick={() => { stopAudio(); onBack(); }} className="flex items-center space-x-2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full hover:bg-white/10 transition-colors border border-white/10 text-sm font-medium"><ArrowLeft size={16} /><span>{t.back}</span></button></div>
        <div className="absolute bottom-0 left-0 w-full p-6 md:p-8 max-w-7xl mx-auto">
           <div className="flex items-end justify-between">
             <div><h1 className="text-4xl md:text-5xl font-bold text-white mb-2">{channel.title}</h1><p className="text-lg text-slate-300 max-w-2xl line-clamp-2">{channel.description}</p></div>
             <div className="hidden md:flex items-center space-x-3">{!isLiveActive && <button onClick={() => setIsSessionSetupOpen(true)} className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-full font-bold shadow-lg"><Play size={20} fill="currentColor" /><span>{t.startLive}</span></button>}</div>
           </div>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 grid grid-cols-12 gap-8 relative">
        {/* Sidebar */}
        <div className="col-span-12 lg:col-span-4 h-full"><div className="bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden h-full flex flex-col"><div className="flex border-b border-slate-800"><button onClick={() => setActiveTab('curriculum')} className={`flex-1 py-3 text-sm font-bold ${activeTab === 'curriculum' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>{t.curriculum}</button></div><div className="flex-1 overflow-y-auto">{chapters.map((ch, cIdx) => (<div key={ch.id}><button onClick={() => setExpandedChapterId(expandedChapterId === ch.id ? null : ch.id)} className="w-full flex items-center justify-between p-4 hover:bg-slate-800 transition-colors text-left"><span className="font-semibold text-sm text-slate-200">{ch.title}</span>{expandedChapterId === ch.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>{expandedChapterId === ch.id && (<div className="bg-slate-950/50 py-2">{ch.subTopics.map((sub, sIdx) => (<button key={sub.id} onClick={() => handleTopicClick(sub.title, sub.id)} className={`w-full flex items-start space-x-3 px-6 py-3 ${activeSubTopicId === sub.id ? 'bg-indigo-900/20 border-l-2 border-indigo-500' : 'hover:bg-slate-800'}`}><span className={`text-sm ${activeSubTopicId === sub.id ? 'text-indigo-200' : 'text-slate-400'}`}>{sub.title}</span></button>))}</div>)}</div>))}</div></div></div>
        
        {/* Player */}
        <div className="col-span-12 lg:col-span-8">
          {isLiveActive && liveSessionChannel ? (
              <div className="h-[calc(100vh-20rem)] min-h-[500px] w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative"><LiveSession channel={liveSessionChannel} initialContext={liveConfig.context} lectureId={liveConfig.lectureId} recordingEnabled={liveConfig.recording} videoEnabled={liveConfig.video} cameraEnabled={liveConfig.camera} activeSegment={liveConfig.segment} initialTranscript={liveConfig.initialTranscript} onEndSession={() => { setIsLiveActive(false); }} language={language} /></div>
          ) : activeLecture ? (
            <div className="space-y-8"><div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl sticky top-8 z-20 backdrop-blur-md bg-slate-900/90"><div className="flex items-center justify-between mb-4"><div><h2 className="text-xl font-bold text-white">{activeLecture.topic}</h2></div><button onClick={() => setShowVoiceSettings(!showVoiceSettings)} className={`p-2 rounded-full ${showVoiceSettings ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}><Settings size={18} /></button></div>
                    {showVoiceSettings && (
                        <div className="mb-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700 animate-fade-in">
                            <div className="flex justify-between items-center mb-4"><h4 className="text-xs font-bold text-slate-400 uppercase">{t.voiceSettings}</h4><div className="flex items-center bg-slate-900 rounded-lg p-1"><button onClick={() => switchProvider('system')} className={`px-3 py-1.5 text-xs font-bold rounded-md ${voiceProvider === 'system' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>System</button><button onClick={() => switchProvider('gemini')} className={`px-3 py-1.5 text-xs font-bold rounded-md ${voiceProvider === 'gemini' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>Gemini</button><button onClick={() => switchProvider('openai')} className={`px-3 py-1.5 text-xs font-bold rounded-md ${voiceProvider === 'openai' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>OpenAI</button></div></div>
                            
                            {/* FALLBACK REASON DEBUG STATUS */}
                            {fallbackReason !== 'none' && (
                                <div className={`p-3 rounded-lg flex items-start gap-2 mb-4 border ${fallbackReason === 'membership' ? 'bg-amber-900/20 border-amber-500/30 text-amber-300' : 'bg-red-900/20 border-red-500/30 text-red-300'}`}>
                                    {fallbackReason === 'membership' ? <Crown size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
                                    <div className="text-[10px] leading-tight">
                                        <p className="font-bold uppercase mb-1">
                                            {fallbackReason === 'membership' ? 'Limit Reached' : 'API Fallback'}
                                        </p>
                                        <p>
                                            {fallbackReason === 'quota' && t.quotaError}
                                            {fallbackReason === 'network' && t.networkError}
                                            {fallbackReason === 'membership' && t.upgradeReq}
                                            {fallbackReason === 'unknown' && "Unexpected audio synthesis error."}
                                            {fallbackReason === 'auth' && "API Key Invalid or Expired."}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    <div className="flex justify-between items-center mt-6 pt-6 border-t border-slate-800"><button onClick={handlePrevLesson} disabled={currentLectureIndex <= 0} className="text-slate-400 disabled:opacity-30 flex items-center space-x-2 text-sm font-bold"><SkipBack size={20} /><span>{t.prev}</span></button><div className="flex flex-col items-center gap-2">{voiceProvider !== 'system' && !isAudioReady && !isPlaying ? (<button onClick={handleGenerateAudio} disabled={isGenerating} className="w-16 h-16 rounded-full flex items-center justify-center bg-indigo-600 text-white shadow-lg">{isGenerating ? <Loader2 className="animate-spin" /> : <Zap fill="currentColor" size={28} />}</button>) : (<button onClick={togglePlayback} className={`w-16 h-16 rounded-full flex items-center justify-center ${isPlaying ? 'bg-slate-800 text-red-400' : 'bg-emerald-600 text-white'}`}>{isPlaying ? (isBuffering ? <Loader2 className="animate-spin" /> : <Pause fill="currentColor" size={28} />) : <Play fill="currentColor" size={28} />}</button>)}{isBuffering && <span className="text-xs text-slate-500">Buffering...</span>}</div><button onClick={handleNextLesson} disabled={currentLectureIndex === -1 || currentLectureIndex >= flatCurriculum.length - 1} className="text-slate-400 disabled:opacity-30 flex items-center space-x-2 text-sm font-bold"><span>{t.next}</span><SkipForward size={20} /></button></div></div>
                <div className="space-y-6 max-w-4xl mx-auto">{activeLecture.sections.map((section, idx) => (<div key={idx} ref={(el) => { sectionRefs.current[idx] = el; }} onDoubleClick={() => handleSegmentDoubleClick(idx)} className={`p-4 rounded-xl transition-all cursor-pointer ${currentSectionIndex === idx ? 'bg-indigo-900/40 border border-indigo-500/50 shadow-lg' : 'hover:bg-slate-800/30 border border-transparent'}`}><div className="flex items-start space-x-4"><div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold border ${section.speaker === 'Teacher' ? 'bg-slate-800 border-indigo-500 text-indigo-400' : 'bg-slate-800 border-purple-500 text-purple-400'}`}>{section.speaker === 'Teacher' ? 'Pro' : 'Stu'}</div><div className="flex-1"><p className="text-xs font-bold text-slate-500 uppercase mb-1">{section.speaker === 'Teacher' ? activeLecture.professorName : activeLecture.studentName}</p><p className={`text-base leading-relaxed ${currentSectionIndex === idx ? 'text-white font-medium' : 'text-slate-400'}`}>{section.text}</p></div></div></div>))}</div></div>
          ) : (<div className="h-full flex flex-col items-center justify-center text-slate-500 p-8"><h3 className="text-xl font-bold text-slate-300 mb-2">{guestError || t.generating}</h3></div>)}
        </div>
      </main>
      {isSessionSetupOpen && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"><div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6"><div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-white flex items-center gap-2"><Mic className="text-indigo-500"/> {t.sessionSetup}</h3><button onClick={() => setIsSessionSetupOpen(false)}><X size={20}/></button></div><button onClick={() => { setIsSessionSetupOpen(false); setIsLiveActive(true); }} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl mt-4">{t.start}</button></div></div>)}
    </div>
  );
};
