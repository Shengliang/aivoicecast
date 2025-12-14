
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Channel, GeneratedLecture, Chapter, SubTopic, TranscriptItem, Attachment, UserProfile } from '../types';
import { ArrowLeft, Play, Pause, BookOpen, MessageCircle, Sparkles, User, GraduationCap, Loader2, ChevronDown, ChevronRight, SkipForward, SkipBack, Settings, X, Mic, Download, RefreshCw, Square, MoreVertical, Edit, Lock, Zap, ToggleLeft, ToggleRight, Users, Check, AlertTriangle, Activity, MessageSquare, FileText, Code, Video, Monitor, PlusCircle, Bot, ExternalLink, ChevronLeft, Menu, List, PanelLeftClose, PanelLeftOpen, CornerDownRight, Trash2, FileDown, Printer, FileJson, HelpCircle, ListMusic, Copy, Paperclip, UploadCloud, Crown, Radio } from 'lucide-react';
import { generateLectureScript } from '../services/lectureGenerator';
import { generateCurriculum } from '../services/curriculumGenerator';
import { synthesizeSpeech, cleanTextForTTS, checkAudioCache, clearAudioCache } from '../services/tts';
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
    quotaError: "Gemini Neural Audio Quota Exceeded. Switching to System Voice recommended.",
    networkError: "Network timeout generating audio. Retry?",
    reenableNeural: "Re-enable Neural Audio (Try Gemini API Again)",
    enableNeural: "Enable Neural Audio (Gemini API)",
    jump: "Double-click to play",
    preGenAudio: "Generate Audio",
    preGenDesc: "Generate high-quality Neural Audio for this lecture (Pro Member Only).",
    communityInsights: "Community Discussions",
    genAudio: "Generate Audio",
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
    quotaError: "Gemini Neural Audio配额已用完。建议切换到系统语音。",
    networkError: "生成音频时网络超时。重试？",
    reenableNeural: "重新启用神经语音 (尝试 Gemini API)",
    enableNeural: "启用神经语音 (Gemini API)",
    jump: "双击播放",
    preGenAudio: "生成音频",
    preGenDesc: "生成高质量神经语音（仅限Pro会员）。",
    communityInsights: "社区讨论",
    genAudio: "生成音频",
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
  // Auto-detect based on API Keys available
  const hasGeminiKey = !!(localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY);
  const hasOpenAiKey = !!(localStorage.getItem('openai_api_key') || OPENAI_API_KEY || process.env.OPENAI_API_KEY);
  
  const [voiceProvider, setVoiceProvider] = useState<'system' | 'gemini' | 'openai'>(
      hasGeminiKey ? 'gemini' : (hasOpenAiKey ? 'openai' : 'system')
  );
  
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [allRawVoices, setAllRawVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [sysTeacherVoiceURI, setSysTeacherVoiceURI] = useState('');
  const [sysStudentVoiceURI, setSysStudentVoiceURI] = useState('');
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);
  const [activeSubTopicId, setActiveSubTopicId] = useState<string | null>(null);
  const [guestError, setGuestError] = useState<string | null>(null);
  
  const [generationProgress, setGenerationProgress] = useState<GenProgress | null>(null);
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

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

  useEffect(() => {
     if (channel.chapters && channel.chapters.length > 0) setChapters(channel.chapters);
     if (staticReading && (!channel.chapters || channel.chapters.length === 0)) {
         setActiveTab('reading');
     }
  }, [channel.chapters, staticReading]);

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
        if (filtered.length > 1 && bestTeacher.voiceURI === bestStudent.voiceURI) {
             const alternative = filtered.find(v => v.voiceURI !== bestTeacher.voiceURI && getScore(v) >= 4);
             if (alternative) bestStudent = alternative;
        }

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
    const timeoutId = setTimeout(() => clearInterval(intervalId), 5000);
    return () => { clearInterval(intervalId); clearTimeout(timeoutId); };
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
      try {
          const buffer = ctx.createBuffer(1, 1, 22050);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(0);
      } catch(e) {}
  };

  const stopAudio = useCallback(() => {
    window.speechSynthesis.cancel();
    activeUtteranceRef.current = null;
    activeSourcesRef.current.forEach(source => { try { source.stop(); } catch(e) {} });
    activeSourcesRef.current = [];
    if (audioContextRef.current) nextScheduleTimeRef.current = 0;
    if (schedulerTimerRef.current) { clearTimeout(schedulerTimerRef.current); schedulerTimerRef.current = null; }
    uiTimersRef.current.forEach(id => clearTimeout(id));
    uiTimersRef.current = [];
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsBuffering(false);
    playSessionIdRef.current++;
  }, []);

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
  }, [channel.id, channel.title, channel.description, channel.chapters, language, isMember, isChannelOwner, staticReading]);

  // AUTO-LOAD FIRST LECTURE IF AVAILABLE
  useEffect(() => {
      if (chapters.length > 0 && !activeSubTopicId && !isLoadingLecture && !activeLecture) {
          const firstChapter = chapters[0];
          if (firstChapter && firstChapter.subTopics.length > 0) {
              const firstLesson = firstChapter.subTopics[0];
              // Use slight timeout to let rendering settle
              setTimeout(() => {
                  handleTopicClick(firstLesson.title, firstLesson.id);
              }, 100);
          }
      }
  }, [chapters]);

  // AUTO-PLAY WHEN LECTURE LOADS
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
    
    // Safety: Check Key for current provider
    if (voiceProvider === 'gemini' && !hasGeminiKey) { alert("Gemini API Key missing."); setVoiceProvider('system'); return; }
    if (voiceProvider === 'openai' && !hasOpenAiKey) { alert("OpenAI API Key missing."); setVoiceProvider('system'); return; }

    const isPro = userProfile?.subscriptionTier === 'pro';
    
    // Check Daily Limit for Free Users
    if (!isPro && !isSuperAdmin && voiceProvider !== 'system') {
        const today = new Date().toISOString().split('T')[0];
        const usageKey = `daily_gen_${currentUser?.uid || 'guest'}_${today}`;
        const usageCount = parseInt(localStorage.getItem(usageKey) || '0');
        
        if (usageCount >= 1) {
             alert("Daily Free Limit Reached.\n\nNon-pro members can generate 1 AI podcast per day.\n\nPlease upgrade to Pro, or use System Voice.");
             setVoiceProvider('system');
             return;
        }
        
        if (!confirm(`Generate this podcast with ${voiceProvider === 'openai' ? 'OpenAI' : 'Gemini'} Voice?\n\nThis will use your 1 free daily credit.`)) {
            return;
        }
        
        // Increment immediately
        localStorage.setItem(usageKey, (usageCount + 1).toString());
    }

    setIsGenerating(true);
    const total = activeLecture.sections.length;
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch(e) {} }

    for (let i = 0; i < total; i++) {
        setGenerationProgress({ current: i + 1, total });
        const section = activeLecture.sections[i];
        const voice = section.speaker === 'Teacher' ? teacherVoice : studentVoice;
        const result = await synthesizeSpeech(section.text, voice, ctx);
        
        if (result.errorType === 'quota') {
            alert(t.quotaError);
            setVoiceProvider('system');
            setIsGenerating(false);
            setGenerationProgress(null);
            return;
        }
        if (result.errorType === 'auth') {
            alert(`Auth Error: ${result.errorMessage}. Switching to System.`);
            setVoiceProvider('system');
            setIsGenerating(false);
            return;
        }
        if (result.errorType === 'network' || result.errorType === 'unknown') {
             if (!confirm(`${t.networkError}\n\nDetails: ${result.errorMessage || 'Unknown Error'}`)) {
                 setIsGenerating(false); setGenerationProgress(null); return;
             }
             i--;
        }
    }
    
    setIsGenerating(false);
    setGenerationProgress(null);
    setIsAudioReady(true);
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
            setIsLoadedFromCache(false);
            setGenerationProgress(null);
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
      } catch(e) {
          alert("Failed to delete.");
      }
  };

  useEffect(() => {
    if (isPlaying) {
      if (voiceProvider !== 'system') {
        const schedule = async () => {
          if (!isPlayingRef.current) return;
          const sessionId = playSessionIdRef.current;
          const ctx = getAudioContext();
          
          if (ctx.state === 'suspended') { try { await ctx.resume(); } catch(e) {} }

          const lookahead = 0.5; 
          if (nextScheduleTimeRef.current < ctx.currentTime) { nextScheduleTimeRef.current = ctx.currentTime + 0.1; }
          
          while (nextScheduleTimeRef.current < ctx.currentTime + lookahead && activeLecture) {
             const scheduleIdx = schedulingCursorRef.current; 
             if (playSessionIdRef.current !== sessionId) return; 
             if (scheduleIdx >= activeLecture.sections.length) {
                setTimeout(() => { if (isPlayingRef.current && playSessionIdRef.current === sessionId) { stopAudio(); setCurrentSectionIndex(0); } }, (nextScheduleTimeRef.current - ctx.currentTime) * 1000);
                return;
             }
             const section = activeLecture.sections[scheduleIdx];
             const voice = section.speaker === 'Teacher' ? teacherVoice : studentVoice;
             try {
                setIsBuffering(true);
                const result = await synthesizeSpeech(section.text, voice, ctx);
                setIsBuffering(false);
                if (playSessionIdRef.current !== sessionId) return; 
                
                if (result.buffer) {
                   const source = ctx.createBufferSource();
                   source.buffer = result.buffer;
                   source.connect(ctx.destination);
                   activeSourcesRef.current.push(source);
                   source.onended = () => { activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source); };
                   source.start(nextScheduleTimeRef.current);
                   const timerId = window.setTimeout(() => {
                       if (isPlayingRef.current && playSessionIdRef.current === sessionId) {
                           setCurrentSectionIndex(scheduleIdx); 
                           sectionRefs.current[scheduleIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                       }
                   }, Math.max(0, (nextScheduleTimeRef.current - ctx.currentTime) * 1000));
                   uiTimersRef.current.push(timerId); 
                   nextScheduleTimeRef.current += result.buffer.duration;
                   schedulingCursorRef.current++; 
                   break; 
                } else {
                   console.warn("TTS Failed. Switching to System Voice fallback.");
                   setVoiceProvider('system');
                   return;
                }
             } catch(e) { 
                 console.error("Schedule error", e); 
                 setVoiceProvider('system');
                 return;
             }
          }
          if (isPlayingRef.current && playSessionIdRef.current === sessionId) { schedulerTimerRef.current = setTimeout(schedule, 200); }
        };
        isPlayingRef.current = true;
        schedule();
      } else {
        // SYSTEM MODE
        const playSystem = () => {
           const idx = schedulingCursorRef.current;
           if (!activeLecture || idx >= activeLecture.sections.length) { stopAudio(); setCurrentSectionIndex(0); return; }
           setCurrentSectionIndex(idx);
           sectionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
           const section = activeLecture.sections[idx];
           const utter = new SpeechSynthesisUtterance(cleanTextForTTS(section.text));
           const targetURI = section.speaker === 'Teacher' ? sysTeacherVoiceURI : sysStudentVoiceURI;
           const v = systemVoices.find(v => v.voiceURI === targetURI);
           if (v) utter.voice = v;
           utter.rate = 1.1;
           utter.onend = () => { if (isPlayingRef.current) { schedulingCursorRef.current++; playSystem(); } };
           activeUtteranceRef.current = utter;
           window.speechSynthesis.speak(utter);
        };
        isPlayingRef.current = true;
        playSystem();
      }
    }
    return () => { if (schedulerTimerRef.current) clearTimeout(schedulerTimerRef.current); };
  }, [isPlaying, activeLecture, voiceProvider, teacherVoice, studentVoice, sysTeacherVoiceURI, sysStudentVoiceURI]);

  const handleTopicClick = async (topicTitle: string, subTopicId?: string) => {
    if (isLiveActive) setIsLiveActive(false); 
    if (!topicTitle) return;
    setActiveSubTopicId(subTopicId || null);
    stopAudio(); setCurrentSectionIndex(0); schedulingCursorRef.current = 0; 
    setActiveLecture(null); setGuestError(null); setGenerationProgress(null);
    setIsLoadingLecture(true);

    try {
        if (OFFLINE_LECTURES[topicTitle]) { setActiveLecture(OFFLINE_LECTURES[topicTitle]); setIsLoadedFromCache(true); return; }
        const spotlight = SPOTLIGHT_DATA[channel.id];
        if (spotlight && spotlight.lectures[topicTitle]) { setActiveLecture(spotlight.lectures[topicTitle]); setIsLoadedFromCache(true); return; }
        const cacheKey = `lecture_${channel.id}_${subTopicId}_${language}`;
        const cached = await getCachedLectureScript(cacheKey);
        if (cached) { setActiveLecture(cached); setIsLoadedFromCache(true); return; }
        if (isMember && subTopicId) {
            const cloudLecture = await getLectureFromFirestore(channel.id, subTopicId);
            if (cloudLecture) { setActiveLecture(cloudLecture); setIsLoadedFromCache(true); await cacheLectureScript(cacheKey, cloudLecture); return; }
        }
        
        // Check either key for generation capability
        const canGenerate = isMember || isChannelOwner || hasGeminiKey;
        
        if (canGenerate) {
          setIsGenerating(true);
          const script = await generateLectureScript(topicTitle, channel.description, language);
          setIsGenerating(false);
          if (script) {
            setActiveLecture(script); setIsLoadedFromCache(false);
            await cacheLectureScript(cacheKey, script);
            if (currentUser && subTopicId) await saveLectureToFirestore(channel.id, subTopicId, script);
          } else { alert("Could not generate content. Ensure API Key is valid."); }
        } else { setGuestError(t.guestRestrict); }
    } catch (e: any) { 
        console.error(e); 
        setIsGenerating(false); 
        alert(`Error loading lesson: ${e.message}`); 
    } finally { setIsLoadingLecture(false); }
  };

  const togglePlayback = () => {
    if (isPlaying) { stopAudio(); } else {
      stopAudio(); unlockAudioContext(); playSessionIdRef.current++; 
      const startIdx = currentSectionIndex && currentSectionIndex < (activeLecture?.sections.length || 0) ? currentSectionIndex : 0;
      schedulingCursorRef.current = startIdx;
      const ctx = getAudioContext();
      nextScheduleTimeRef.current = Math.max(ctx.currentTime + 0.1, nextScheduleTimeRef.current);
      setIsPlaying(true);
    }
  };

  const handleSegmentDoubleClick = (index: number) => {
      stopAudio(); 
      setCurrentSectionIndex(index);
      schedulingCursorRef.current = index;
      setTimeout(() => {
          unlockAudioContext();
          const ctx = getAudioContext();
          nextScheduleTimeRef.current = Math.max(ctx.currentTime + 0.1, nextScheduleTimeRef.current);
          isPlayingRef.current = true;
          setIsPlaying(true);
      }, 50); 
  };

  const switchProvider = (prov: 'system' | 'gemini' | 'openai') => {
      // Validate
      if (prov === 'gemini' && !hasGeminiKey) return alert("Gemini Key required.");
      if (prov === 'openai' && !hasOpenAiKey) return alert("OpenAI Key required.");
      
      stopAudio();
      setVoiceProvider(prov);
      
      // Reset selected voices to defaults for that provider
      if (prov === 'openai') {
          setTeacherVoice('Alloy');
          setStudentVoice('Echo');
      } else if (prov === 'gemini') {
          setTeacherVoice('Puck');
          setStudentVoice('Zephyr');
      }
  };

  const liveSessionChannel = useMemo(() => {
    if (!channel) return null;
    if (language === 'zh') {
        return {
            ...channel,
            systemInstruction: channel.systemInstruction + "\n\nIMPORTANT: Please speak and interact in Simplified Chinese (Mandarin)."
        };
    }
    return channel;
  }, [channel, language]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-24 relative overflow-hidden">
      
      {/* Header */}
      <div className="relative h-64 md:h-80 w-full flex-shrink-0">
        <div className="absolute inset-0"><img src={channel.imageUrl} alt={channel.title} className="w-full h-full object-cover opacity-60"/><div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" /></div>
        <div className="absolute top-4 left-4 z-20 flex items-center gap-3">
            <button onClick={() => { stopAudio(); onBack(); }} className="flex items-center space-x-2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full hover:bg-white/10 transition-colors border border-white/10 text-sm font-medium">
                <ArrowLeft size={16} /><span>{t.back}</span>
            </button>
        </div>
        {isChannelOwner && onEditChannel && (<div className="absolute top-4 right-4 z-20"><button onClick={onEditChannel} className="flex items-center space-x-2 px-4 py-2 bg-indigo-600/80 backdrop-blur-md rounded-full hover:bg-indigo-500 transition-colors text-white text-sm font-bold shadow-lg"><Edit size={16} /><span>{t.edit}</span></button></div>)}
        <div className="absolute bottom-0 left-0 w-full p-6 md:p-8 max-w-7xl mx-auto">
           <div className="flex items-end justify-between">
             <div>
               <div className="flex items-center space-x-2 mb-2"><span className="px-2 py-1 bg-indigo-500 text-white text-[10px] uppercase font-bold tracking-widest rounded-md">{t.series}</span><div className="flex space-x-1">{channel.tags.map(tag => (<span key={tag} className="text-xs text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full bg-slate-900/50">#{tag}</span>))}</div></div>
               <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 shadow-sm">{channel.title}</h1>
               <p className="text-lg text-slate-300 max-w-2xl line-clamp-2">{channel.description}</p>
             </div>
             <div className="hidden md:flex items-center space-x-3">
                {onViewComments && <button onClick={onViewComments} className="flex items-center space-x-2 bg-slate-800/60 hover:bg-slate-700/80 backdrop-blur-md text-white px-4 py-3 rounded-full font-bold transition-all border border-white/10"><MessageSquare size={20} /><span>{t.comments} ({channel.comments.length})</span></button>}
                {!isLiveActive && <button onClick={() => setIsSessionSetupOpen(true)} className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-full font-bold shadow-lg shadow-indigo-500/30 transition-all hover:scale-105"><Play size={20} fill="currentColor" /><span>{t.startLive}</span></button>}
             </div>
           </div>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col-reverse lg:grid lg:grid-cols-12 gap-8 relative">
        
        {/* Sidebar (Curriculum) */}
        <div className="w-full lg:col-span-4 h-full lg:h-[calc(100vh-24rem)] lg:sticky lg:top-8 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden h-full flex flex-col">
             <div className="flex border-b border-slate-800 shrink-0 overflow-x-auto scrollbar-hide">
                 <button onClick={() => setActiveTab('curriculum')} className={`flex-1 py-3 text-sm font-bold flex items-center justify-center space-x-2 whitespace-nowrap px-4 ${activeTab === 'curriculum' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}><BookOpen size={16}/><span>{t.curriculum}</span></button>
                 {staticReading && <button onClick={() => setActiveTab('reading')} className={`flex-1 py-3 text-sm font-bold flex items-center justify-center space-x-2 whitespace-nowrap px-4 ${activeTab === 'reading' ? 'bg-slate-800 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}><FileText size={16}/><span>{t.reading}</span></button>}
                 <button onClick={() => setActiveTab('appendix')} className={`flex-1 py-3 text-sm font-bold flex items-center justify-center space-x-2 whitespace-nowrap px-4 ${activeTab === 'appendix' ? 'bg-slate-800 text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}><Paperclip size={16}/><span>{t.appendix}</span></button>
             </div>
             
             <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
             {activeTab === 'curriculum' && (
                 <>
                    <div className="p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10 flex items-center justify-between">
                        <div>
                            <h3 className="text-xl font-bold text-white flex items-center space-x-2"><BookOpen className="text-indigo-400" size={20} /><span>{t.curriculum}</span></h3>
                            <p className="text-xs text-slate-500 mt-1">{chapters && chapters.length > 0 ? `${chapters.length} ${t.chapters}` : t.selectTopic}</p>
                        </div>
                        {isChannelOwner && <button onClick={() => handleRegenerateCurriculum(false)} disabled={isGeneratingCurriculum} className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white rounded-lg transition-colors border border-slate-700 hover:border-indigo-500 shadow-sm" title={t.regenerate}><RefreshCw size={14} className={isGeneratingCurriculum ? 'animate-spin' : ''} /><span className="text-xs font-bold hidden xl:inline">{t.regenerate}</span></button>}
                    </div>
                    {chapters && chapters.length > 0 ? (
                        <div className="divide-y divide-slate-800">
                            {chapters.map((chapter, cIdx) => (
                                <div key={chapter.id} className="bg-slate-900">
                                    <button onClick={() => setExpandedChapterId(expandedChapterId === chapter.id ? null : chapter.id)} className="w-full flex items-center justify-between p-4 hover:bg-slate-800 transition-colors text-left">
                                        <div className="flex flex-col"><span className="text-xs text-slate-500 font-mono uppercase">{language === 'zh' ? `第 ${cIdx + 1} 章` : `Chapter ${cIdx + 1}`}</span><span className="font-semibold text-sm text-slate-200">{chapter.title}</span></div>
                                        {expandedChapterId === chapter.id ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
                                    </button>
                                    {expandedChapterId === chapter.id && (
                                        <div className="bg-slate-950/50 py-2">
                                            {chapter.subTopics && chapter.subTopics.map((sub, sIdx) => (
                                                <button key={sub.id || `sub-${cIdx}-${sIdx}`} onClick={() => handleTopicClick(sub.title, sub.id)} className={`w-full flex items-start space-x-3 px-6 py-3 transition-colors text-left ${activeSubTopicId === sub.id ? 'bg-indigo-900/20 border-l-2 border-indigo-500' : 'hover:bg-slate-800 border-l-2 border-transparent'}`}>
                                                    <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono border ${activeSubTopicId === sub.id ? 'border-indigo-500 text-indigo-400 bg-indigo-900/30' : 'border-slate-700 text-slate-600'}`}>{sIdx + 1}</div>
                                                    <span className={`text-sm ${activeSubTopicId === sub.id ? 'text-indigo-200' : 'text-slate-400 hover:text-slate-300'}`}>{sub.title}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : <div className="p-8 text-center space-y-4"><p className="text-slate-500 text-sm italic">No curriculum.</p></div>}
                 </>
             )}
             </div>
          </div>
        </div>

        {/* Main Content (Player) */}
        <div className="lg:col-span-8 transition-all duration-300">
          {isLiveActive && liveSessionChannel ? (
              <div className="h-[calc(100vh-20rem)] min-h-[500px] w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative">
                  <LiveSession channel={liveSessionChannel} initialContext={liveConfig.context} lectureId={liveConfig.lectureId} recordingEnabled={liveConfig.recording} videoEnabled={liveConfig.video} cameraEnabled={liveConfig.camera} activeSegment={liveConfig.segment} initialTranscript={liveConfig.initialTranscript} existingDiscussionId={liveConfig.discussionId} language={language} onEndSession={async () => { setIsLiveActive(false); if (liveConfig.segment && liveConfig.lectureId) { const cacheKey = `lecture_${channel.id}_${liveConfig.lectureId}_${language}`; const updated = await getCachedLectureScript(cacheKey); if (updated) setActiveLecture(updated); } }} />
              </div>
          ) : activeLecture ? (
            <div className="space-y-8 animate-fade-in">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl sticky top-8 z-20 backdrop-blur-md bg-slate-900/90">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-xl font-bold text-white flex items-center space-x-2"><span className="bg-indigo-500 w-2 h-6 rounded-full"></span><span>{activeLecture.topic}</span></h2>
                            <p className="text-xs text-slate-500 mt-1 pl-4 flex items-center space-x-2"><User size={12} /><span>{activeLecture.professorName}</span><span>&</span><GraduationCap size={12} /><span>{activeLecture.studentName}</span></p>
                        </div>
                        <div className="flex items-center space-x-2">
                            {(isMember || isChannelOwner) && (
                                <>
                                    <button onClick={handleRegenerateLecture} className="flex items-center space-x-2 px-3 py-2 bg-slate-800 rounded-full text-slate-400 hover:text-indigo-400 transition-colors border border-slate-700 hover:border-indigo-500/50" disabled={isGenerating}><Bot size={18} className={isGenerating ? 'animate-bounce' : ''} /></button>
                                    <button onClick={handleDeleteLecture} className="flex items-center space-x-2 px-3 py-2 bg-slate-800 rounded-full text-slate-400 hover:text-red-400 transition-colors border border-slate-700 hover:border-red-500/50"><Trash2 size={18} /></button>
                                </>
                            )}
                            <button onClick={() => setShowVoiceSettings(!showVoiceSettings)} className={`p-2 rounded-full transition-all ${showVoiceSettings ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}><Settings size={18} /></button>
                        </div>
                    </div>

                    {showVoiceSettings && (
                        <div className="mb-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700 animate-fade-in">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.voiceSettings}</h4>
                                {/* Provider Switcher */}
                                <div className="flex items-center bg-slate-900 rounded-lg p-1 border border-slate-700">
                                    <button 
                                        onClick={() => switchProvider('system')} 
                                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${voiceProvider === 'system' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        <Radio size={12}/> System
                                    </button>
                                    <button 
                                        onClick={() => switchProvider('gemini')} 
                                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${voiceProvider === 'gemini' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                        title={!hasGeminiKey ? "Set Gemini Key" : "Gemini Neural"}
                                    >
                                        <Zap size={12} fill="currentColor"/> Gemini
                                    </button>
                                    <button 
                                        onClick={() => switchProvider('openai')} 
                                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${voiceProvider === 'openai' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                        title={!hasOpenAiKey ? "Set OpenAI Key" : "OpenAI Neural"}
                                    >
                                        <Sparkles size={12}/> OpenAI
                                    </button>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Teacher</label>
                                    {voiceProvider === 'system' ? (
                                        <select value={sysTeacherVoiceURI} onChange={e => setSysTeacherVoiceURI(e.target.value)} className="w-full bg-slate-900 text-white text-xs p-2 rounded border border-slate-600">
                                            {systemVoices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
                                        </select>
                                    ) : (
                                        <div className="flex gap-1 flex-wrap">
                                            {(voiceProvider === 'gemini' ? GEMINI_VOICES : OPENAI_VOICES).map(v => (
                                                <button key={v} onClick={() => setTeacherVoice(v)} className={`px-2 py-1 text-xs rounded border ${teacherVoice === v ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>{v}</button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Student</label>
                                    {voiceProvider === 'system' ? (
                                        <select value={sysStudentVoiceURI} onChange={e => setSysStudentVoiceURI(e.target.value)} className="w-full bg-slate-900 text-white text-xs p-2 rounded border border-slate-600">
                                            {systemVoices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
                                        </select>
                                    ) : (
                                        <div className="flex gap-1 flex-wrap">
                                            {(voiceProvider === 'gemini' ? GEMINI_VOICES : OPENAI_VOICES).map(v => (
                                                <button key={v} onClick={() => setStudentVoice(v)} className={`px-2 py-1 text-xs rounded border ${studentVoice === v ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>{v}</button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-between items-center mt-6 pt-6 border-t border-slate-800">
                        <button onClick={() => {}} disabled={currentLectureIndex <= 0} className="text-slate-400 hover:text-white disabled:opacity-30 flex items-center space-x-2 text-sm font-bold transition-colors"><SkipBack size={20} /><span className="hidden sm:inline">{t.prev}</span></button>
                        <div className="flex flex-col items-center gap-2">
                            {voiceProvider !== 'system' && !isAudioReady && !isPlaying ? (
                                <button onClick={handleGenerateAudio} disabled={isGenerating} className="w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg bg-indigo-600 text-white hover:bg-indigo-500 hover:scale-105 disabled:opacity-50 disabled:scale-100" title={t.preGenDesc}>
                                    {isGenerating ? <div className="flex flex-col items-center"><Loader2 className="animate-spin mb-1" size={20} /><span className="text-[10px] font-bold">{generationProgress ? `${Math.round((generationProgress.current / generationProgress.total) * 100)}%` : '...'}</span></div> : <Zap fill="currentColor" size={28} />}
                                </button>
                            ) : (
                                <button onClick={togglePlayback} className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg ${isPlaying ? 'bg-slate-800 text-red-400 hover:bg-slate-700' : 'bg-emerald-600 text-white hover:bg-emerald-500 hover:scale-105'}`}>{isPlaying ? (isBuffering ? <Loader2 className="animate-spin" size={28}/> : <Pause fill="currentColor" size={28} />) : <Play fill="currentColor" size={28} />}</button>
                            )}
                            {isBuffering && <span className="text-xs text-slate-500">Processing...</span>}
                        </div>
                        <button onClick={() => {}} disabled={currentLectureIndex === -1 || currentLectureIndex >= flatCurriculum.length - 1} className="text-slate-400 hover:text-white disabled:opacity-30 flex items-center space-x-2 text-sm font-bold transition-colors"><span className="hidden sm:inline">{t.next}</span><SkipForward size={20} /></button>
                    </div>
                </div>
                
                <div className="space-y-6 max-w-4xl mx-auto px-2">
                    {activeLecture.sections.map((section, idx) => (
                        <div key={idx} ref={(el) => { sectionRefs.current[idx] = el; }} onDoubleClick={() => handleSegmentDoubleClick(idx)} title={t.jump} className={`p-4 rounded-xl transition-all duration-500 cursor-pointer scroll-mt-72 md:scroll-mt-48 ${currentSectionIndex === idx ? 'bg-indigo-900/40 border border-indigo-500/50 shadow-lg scale-[1.01] ring-1 ring-indigo-500/30' : 'hover:bg-slate-800/30 border border-transparent'}`}>
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
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4 p-8">
               <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center animate-pulse"><BookOpen size={40} className="opacity-50" /></div>
               <div className="text-center"><h3 className="text-xl font-bold text-slate-300 mb-2">{guestError || t.generating}</h3><p className="text-sm max-w-md">{guestError ? "Sign in to access AI features." : t.genDesc}</p></div>
            </div>
          )}
        </div>
      </main>
      
      {/* Session Setup Modal */}
      {isSessionSetupOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6 animate-fade-in-up">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2"><Mic className="text-indigo-500"/> {t.sessionSetup}</h3>
                      <button onClick={() => setIsSessionSetupOpen(false)}><X size={20} className="text-slate-400 hover:text-white"/></button>
                  </div>
                  <div className="space-y-4">
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase mb-1">Topic Context</label>
                          <textarea 
                              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none" 
                              rows={3} 
                              placeholder="What do you want to discuss?"
                              onChange={(e) => setLiveConfig(prev => ({ ...prev, context: e.target.value }))}
                          />
                      </div>
                      
                      <div className="space-y-2">
                          <div 
                              onClick={() => setLiveConfig(prev => ({ ...prev, recording: !prev.recording }))}
                              className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${liveConfig.recording ? 'bg-red-900/20 border-red-500/50' : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800'}`}
                          >
                              <div className="flex items-center gap-3">
                                  <div className={`p-1.5 rounded-full ${liveConfig.recording ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                                      {liveConfig.recording ? <Video size={16} /> : <Mic size={16} />}
                                  </div>
                                  <div>
                                      <p className={`font-bold text-sm ${liveConfig.recording ? 'text-red-400' : 'text-slate-300'}`}>{t.recordSession}</p>
                                      <p className="text-[10px] text-slate-500">{t.recordDesc}</p>
                                  </div>
                              </div>
                              <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${liveConfig.recording ? 'border-red-500 bg-red-500 text-white' : 'border-slate-500'}`}>
                                  {liveConfig.recording && <Check size={12} />}
                              </div>
                          </div>

                          {liveConfig.recording && (
                              <div className="flex gap-2 ml-4">
                                  <button 
                                      onClick={() => setLiveConfig(prev => ({ ...prev, video: !prev.video }))}
                                      className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${liveConfig.video ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                                  >
                                      <Monitor size={14} className="inline mr-1"/> Screen
                                  </button>
                                  <button 
                                      onClick={() => setLiveConfig(prev => ({ ...prev, camera: !prev.camera }))}
                                      className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${liveConfig.camera ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                                  >
                                      <Video size={14} className="inline mr-1"/> Camera
                                  </button>
                              </div>
                          )}
                      </div>

                      <button 
                          onClick={() => { setIsSessionSetupOpen(false); setIsLiveActive(true); }}
                          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 mt-4"
                      >
                          <Play size={18} fill="currentColor"/>
                          <span>{t.start}</span>
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
