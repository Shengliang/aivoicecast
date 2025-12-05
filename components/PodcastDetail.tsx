
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Channel, GeneratedLecture, Chapter, SubTopic, TranscriptItem } from '../types';
import { ArrowLeft, Play, Pause, BookOpen, MessageCircle, Sparkles, User, GraduationCap, Loader2, ChevronDown, ChevronRight, SkipForward, SkipBack, Settings, X, Mic, Download, RefreshCw, Square, MoreVertical, Edit, Lock, Zap, ToggleLeft, ToggleRight, Users, Check, AlertTriangle, Activity, MessageSquare, FileText, Code, Video, Monitor, PlusCircle, Bot, ExternalLink, ChevronLeft, Menu, List, PanelLeftClose, PanelLeftOpen, CornerDownRight, Trash2, FileDown, Printer, FileJson, HelpCircle } from 'lucide-react';
import { generateLectureScript } from '../services/lectureGenerator';
import { generateCurriculum } from '../services/curriculumGenerator';
import { synthesizeSpeech, cleanTextForTTS, checkAudioCache, clearAudioCache } from '../services/tts';
import { OFFLINE_CHANNEL_ID, OFFLINE_CURRICULUM, OFFLINE_LECTURES } from '../utils/offlineContent';
import { SPOTLIGHT_DATA } from '../utils/spotlightContent';
import { STATIC_READING_MATERIALS } from '../utils/staticResources';
import { cacheLectureScript, getCachedLectureScript, deleteCachedLectureScript } from '../utils/db';
import { saveLectureToFirestore, getLectureFromFirestore, saveCurriculumToFirestore, getCurriculumFromFirestore, deleteLectureFromFirestore } from '../services/firestoreService';
import { LiveSession } from './LiveSession';
import { DiscussionModal } from './DiscussionModal';

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
const BLOCKLIST = ['Fred', 'Trinoids', 'Albert', 'Bad News', 'Bells', 'Cellos', 'Good News', 'Organ', 'Zarvox', 'Deranged', 'Hysterical', 'Boing', 'Bubbles', 'Bahh', 'Whisper', 'Wobble'];
const QUALITY_KEYWORDS = ['Google', 'Premium', 'Enhanced', 'Natural', 'Siri', 'Neural', 'Daniel', 'Samantha', 'Ting-Ting', 'Meijia'];

const UI_TEXT = {
  en: {
    back: "Back",
    series: "Series",
    startLive: "Start Live Chat",
    curriculum: "Curriculum",
    reading: "Reading",
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
    preGenDesc: "Generate high-quality Neural Audio for this lecture (Member Only).",
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
    preGenDesc: "生成高质量神经语音（仅限会员）。",
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
  const [activeTab, setActiveTab] = useState<'curriculum' | 'reading'>('curriculum');
  const [activeLecture, setActiveLecture] = useState<GeneratedLecture | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingLecture, setIsLoadingLecture] = useState(false);
  const [isLoadedFromCache, setIsLoadedFromCache] = useState(false);
  
  const [chapters, setChapters] = useState<Chapter[]>(channel.chapters || []);
  const [isGeneratingCurriculum, setIsGeneratingCurriculum] = useState(false);
  const [isExportingCourse, setIsExportingCourse] = useState(false);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 

  const staticReading = STATIC_READING_MATERIALS[channel.title];
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number | null>(null);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [teacherVoice, setTeacherVoice] = useState('Fenrir');
  const [studentVoice, setStudentVoice] = useState('Puck');
  const [useSystemVoice, setUseSystemVoice] = useState(true);
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [sysTeacherVoiceURI, setSysTeacherVoiceURI] = useState('');
  const [sysStudentVoiceURI, setSysStudentVoiceURI] = useState('');
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);
  const [activeSubTopicId, setActiveSubTopicId] = useState<string | null>(null);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  
  const [generationProgress, setGenerationProgress] = useState<GenProgress | null>(null);
  const [isAudioReady, setIsAudioReady] = useState(false);
  
  const [isSessionSetupOpen, setIsSessionSetupOpen] = useState(false);
  const [sessionContext, setSessionContext] = useState('');
  const [isRecordingEnabled, setIsRecordingEnabled] = useState(false);
  const [isScreenRecordingEnabled, setIsScreenRecordingEnabled] = useState(false);
  const [isCameraRecordingEnabled, setIsCameraRecordingEnabled] = useState(false);
  
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

  const [viewDiscussionId, setViewDiscussionId] = useState<string | null>(null);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

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
  const prefetchedIds = useRef<Set<string>>(new Set());
  
  const isMember = !!currentUser;
  // Super admin check for shengliang.song@gmail.com
  const isOwner = currentUser && (channel.ownerId === currentUser.uid || currentUser.email === 'shengliang.song@gmail.com');

  const flatCurriculum = useMemo(() => {
      if(!chapters) return [];
      // Ensure we map correctly even if array structure has holes (unlikely but safe)
      return chapters.flatMap(ch => (ch.subTopics || []).map(sub => ({ ...sub, chapterTitle: ch.title })));
  }, [chapters]);

  const currentLectureIndex = useMemo(() => {
      if(!activeSubTopicId) return -1;
      return flatCurriculum.findIndex(item => item.id === activeSubTopicId);
  }, [activeSubTopicId, flatCurriculum]);

  useEffect(() => {
      const handleResize = () => {
          if (window.innerWidth >= 1024) {
              setIsSidebarOpen(true);
          } else {
              setIsSidebarOpen(false);
          }
      };
      handleResize(); 
      window.addEventListener('resize', handleResize);
      return () => {
          window.removeEventListener('resize', handleResize);
          stopAudio();
          clearAudioCache();
      };
  }, []);

  useEffect(() => {
      clearAudioCache();
  }, [channel.id]);

  useEffect(() => {
     if (channel.chapters && channel.chapters.length > 0) setChapters(channel.chapters);
     if (staticReading && (!channel.chapters || channel.chapters.length === 0)) {
         setActiveTab('reading');
     }
  }, [channel.chapters, staticReading]);

  useEffect(() => {
      prefetchedIds.current.clear();
  }, [channel.id]);

  const loadVoices = useCallback(() => {
    const voices = window.speechSynthesis.getVoices();
    const langCode = language === 'zh' ? 'zh' : 'en';
    
    // Filter logic: Match language OR if name contains Siri (to catch edge case locales)
    let filtered = voices.filter(v => {
        const isLangMatch = v.lang.startsWith(langCode) || (langCode === 'en' && v.lang.startsWith('en'));
        const isSiri = v.name.toLowerCase().includes('siri');
        return (isLangMatch || isSiri) && !BLOCKLIST.some(bad => v.name.includes(bad));
    });

    // Voice Scoring for Prioritization
    const getScore = (v: SpeechSynthesisVoice) => {
        const name = v.name.toLowerCase();
        // Tier 1: Siri (Top priority)
        if (name.includes('siri')) return 10;
        // Tier 2: Enhanced/Premium
        if (name.includes('enhanced') || name.includes('premium') || name.includes('neural') || name.includes('google')) return 5;
        // Tier 3: Good standard
        if (QUALITY_KEYWORDS.some(k => name.includes(k.toLowerCase()))) return 2;
        return 1;
    };

    // Sort Descending by Score
    filtered.sort((a, b) => getScore(b) - getScore(a));

    if (filtered.length === 0) {
        // Fallback: If strict filter failed, just show all non-blocked
        filtered = voices.filter(v => !BLOCKLIST.some(bad => v.name.includes(bad)));
        filtered.sort((a, b) => getScore(b) - getScore(a));
    }

    setSystemVoices(filtered);
    
    if (filtered.length > 0) {
        // Find best teacher voice (Top of list, hopefully Siri)
        const bestTeacher = filtered[0];
        
        // Find best student voice (Attempt to find a distinct high-quality voice)
        let bestStudent = filtered.length > 1 ? filtered[1] : filtered[0];
        
        // Smart student selection: If teacher is Siri, try to find another Siri for student
        if (getScore(bestTeacher) >= 10) {
             const otherSiri = filtered.find(v => v.voiceURI !== bestTeacher.voiceURI && getScore(v) >= 10);
             if (otherSiri) bestStudent = otherSiri;
        }

        setSysTeacherVoiceURI(prev => {
            if (!prev) return bestTeacher.voiceURI;
            const current = voices.find(v => v.voiceURI === prev);
            // If current selection is missing or we found a significantly better one (Auto Upgrade)
            if (!current || getScore(bestTeacher) > getScore(current)) {
                return bestTeacher.voiceURI;
            }
            return prev;
        });
        
        setSysStudentVoiceURI(prev => {
            if (!prev) return bestStudent.voiceURI;
            const current = voices.find(v => v.voiceURI === prev);
            if (!current || getScore(bestStudent) > getScore(current)) {
                return bestStudent.voiceURI;
            }
            return prev;
        });
    }
  }, [language]);

  useEffect(() => {
    // Initial Load
    loadVoices();
    
    // Web Speech API Event
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    // Polling backup for iOS which can be lazy loading voices
    const intervalId = setInterval(loadVoices, 1000);
    const timeoutId = setTimeout(() => clearInterval(intervalId), 5000); // Stop polling after 5s

    return () => {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
    };
  }, [loadVoices]);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  const unlockAudioContext = () => {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') ctx.resume().catch(e => console.error("Resume failed:", e));
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
    
    activeSourcesRef.current.forEach(source => {
        try { source.stop(); } catch(e) {}
    });
    activeSourcesRef.current = [];
    
    if (audioContextRef.current) {
        nextScheduleTimeRef.current = 0;
    }
    
    if (schedulerTimerRef.current) {
        clearTimeout(schedulerTimerRef.current);
        schedulerTimerRef.current = null;
    }
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
      if (isOwner && !staticReading) {
          handleRegenerateCurriculum(true); 
      }
    };
    loadCurriculum();
  }, [channel.id, channel.title, channel.description, channel.chapters, language, isMember, isOwner, staticReading]);

  const handleRegenerateCurriculum = async (isAuto = false) => {
      if (!isOwner) {
          if (!isAuto) alert(t.guestRestrict);
          return;
      }
      const isEmpty = !chapters || chapters.length === 0;
      if (!isAuto && !isEmpty && !confirm("Are you sure you want to regenerate the entire curriculum? This will replace existing chapters.")) return;
      
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
      } catch(e) {
          console.error("Failed to regenerate", e);
          if (!isAuto) alert("Failed to regenerate curriculum.");
      } finally {
          setIsGeneratingCurriculum(false);
      }
  };

  const handleExportFullCourse = async () => {
    if (!chapters || chapters.length === 0) return;
    setIsExportingCourse(true);
    
    try {
      let fullMd = `# ${channel.title}\n\n`;
      fullMd += `**Description:** ${channel.description}\n`;
      fullMd += `**Host:** ${channel.voiceName}\n\n---\n\n`;

      for (const chapter of chapters) {
        fullMd += `## ${chapter.title}\n\n`;
        
        for (const sub of chapter.subTopics) {
           fullMd += `### ${sub.title}\n\n`;
           
           // Try to find content from all sources
           // 1. Check Offline/Static maps
           let content: GeneratedLecture | null = null;
           if (OFFLINE_LECTURES[sub.title]) content = OFFLINE_LECTURES[sub.title];
           else if (SPOTLIGHT_DATA[channel.id]?.lectures[sub.title]) content = SPOTLIGHT_DATA[channel.id]?.lectures[sub.title];
           else {
               // 2. Check Cache
               const cacheKey = `lecture_${channel.id}_${sub.id}_${language}`;
               content = await getCachedLectureScript(cacheKey);
               
               // 3. Check Firestore (if member)
               if (!content && isMember) {
                   content = await getLectureFromFirestore(channel.id, sub.id);
               }
           }

           if (content) {
               fullMd += `*${content.professorName} & ${content.studentName}*\n\n`;
               content.sections.forEach(s => {
                   fullMd += `**${s.speaker === 'Teacher' ? content!.professorName : content!.studentName}:** ${s.text}\n\n`;
               });
           } else {
               fullMd += `*(Content not yet generated)*\n\n`;
           }
           fullMd += `---\n\n`;
        }
      }

      const blob = new Blob([fullMd], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${channel.title.replace(/[^a-z0-9]/gi, '_')}_Full_Course.md`;
      a.click();
      URL.revokeObjectURL(url);

    } catch (e) {
      console.error("Export failed", e);
      alert("Failed to export course.");
    } finally {
      setIsExportingCourse(false);
    }
  };

  useEffect(() => {
    const checkStatus = async () => {
        if (!activeLecture) {
            setIsAudioReady(false);
            return;
        }
        let allReady = true;
        for (const section of activeLecture.sections) {
            const voice = section.speaker === 'Teacher' ? teacherVoice : studentVoice;
            const hasAudio = await checkAudioCache(section.text, voice);
            if (!hasAudio) {
                allReady = false;
                break;
            }
        }
        setIsAudioReady(allReady);
    };
    checkStatus();
  }, [activeLecture, teacherVoice, studentVoice]);

  const handleGenerateAudio = async () => {
    if (!activeLecture) return;
    setIsGenerating(true);
    const total = activeLecture.sections.length;
    
    // Ensure AudioContext is ready (needed for decoding checks inside synthesizeSpeech)
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch(e) {}
    }

    for (let i = 0; i < total; i++) {
        setGenerationProgress({ current: i + 1, total });
        const section = activeLecture.sections[i];
        const voice = section.speaker === 'Teacher' ? teacherVoice : studentVoice;
        
        // synthesizeSpeech handles caching internally (memory + IDB)
        const result = await synthesizeSpeech(section.text, voice, ctx);
        
        if (result.errorType === 'quota') {
            alert(t.quotaError);
            setUseSystemVoice(true);
            setIsGenerating(false);
            setGenerationProgress(null);
            return;
        }
        
        if (result.errorType === 'network' || result.errorType === 'unknown') {
             console.error("TTS Error details:", result.errorMessage);
             if (!confirm(`${t.networkError}\n\nDetails: ${result.errorMessage || 'Unknown Error'}`)) {
                 setIsGenerating(false);
                 setGenerationProgress(null);
                 return;
             }
             // Retry index
             i--;
        }
    }
    
    setIsGenerating(false);
    setGenerationProgress(null);
    setIsAudioReady(true);
  };

  const handleRegenerateLecture = async () => {
    if (!activeLecture) return;
    if (!isMember && !isOwner) {
        alert(t.guestRestrict);
        return;
    }
    if (!confirm("Regenerate this lecture using AI? This will replace the current content with a new script.")) return;
    stopAudio();
    setIsGenerating(true);
    setIsLoadingLecture(true);
    try {
        const topic = activeLecture.topic;
        const context = channel.description;
        const script = await generateLectureScript(topic, context, language);
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
        } else {
            alert("Failed to generate script.");
        }
    } catch(e) {
        console.error("Regeneration failed", e);
        alert("Error generating script.");
    } finally {
        setIsGenerating(false);
        setIsLoadingLecture(false);
    }
  };

  const handleDeleteLecture = async () => {
      if (!activeSubTopicId || !activeLecture) return;
      if (!confirm("Are you sure you want to delete this lecture content? This will reset the lesson to an empty state.")) return;
      
      stopAudio();
      
      try {
          const cacheKey = `lecture_${channel.id}_${activeSubTopicId}_${language}`;
          
          // 1. Delete from local cache
          await deleteCachedLectureScript(cacheKey);
          
          // 2. Delete from Firestore if user is owner/creator
          if (currentUser) {
              await deleteLectureFromFirestore(channel.id, activeSubTopicId);
          }
          
          // 3. Reset UI
          setActiveLecture(null);
          setIsLoadedFromCache(false);
          setGenerationProgress(null);
          setIsAudioReady(false);
          
      } catch(e) {
          console.error("Failed to delete lecture", e);
          alert("Failed to delete lecture content.");
      }
  };

  const getNextSubTopic = useCallback(() => {
    if (currentLectureIndex === -1 || currentLectureIndex >= flatCurriculum.length - 1) return null;
    return flatCurriculum[currentLectureIndex + 1];
  }, [currentLectureIndex, flatCurriculum]);

  useEffect(() => {
    if (isPlaying && activeSubTopicId) {
        const next = getNextSubTopic();
        if (next && !prefetchedIds.current.has(next.id)) {
            prefetchedIds.current.add(next.id);
            const runPrefetch = async () => {
                if (OFFLINE_LECTURES[next.title]) return;
                const spotlight = SPOTLIGHT_DATA[channel.id];
                if (spotlight && spotlight.lectures[next.title]) return;
                const cacheKey = `lecture_${channel.id}_${next.id}_${language}`;
                const cached = await getCachedLectureScript(cacheKey);
                if (cached) return;
                if (currentUser) {
                    const cloud = await getLectureFromFirestore(channel.id, next.id);
                    if (cloud) { await cacheLectureScript(cacheKey, cloud); return; }
                }
                const hasApiKey = !!localStorage.getItem('gemini_api_key');
                if (currentUser || isOwner || hasApiKey) {
                     const script = await generateLectureScript(next.title, channel.description, language);
                     if (script) {
                         await cacheLectureScript(cacheKey, script);
                         if (currentUser) await saveLectureToFirestore(channel.id, next.id, script);
                     }
                }
            };
            runPrefetch().catch(err => console.warn("Prefetch failed", err));
        }
    }
  }, [isPlaying, activeSubTopicId, getNextSubTopic, channel, language, currentUser, isOwner]);

  useEffect(() => {
    if (isPlaying) {
      if (!useSystemVoice) {
        const schedule = async () => {
          if (!isPlayingRef.current) return;
          const sessionId = playSessionIdRef.current;
          const ctx = getAudioContext();
          const lookahead = 0.5; 
          if (nextScheduleTimeRef.current < ctx.currentTime) {
             nextScheduleTimeRef.current = ctx.currentTime + 0.1;
          }
          while (nextScheduleTimeRef.current < ctx.currentTime + lookahead && activeLecture) {
             const scheduleIdx = schedulingCursorRef.current; 
             if (playSessionIdRef.current !== sessionId) return; 
             if (scheduleIdx >= activeLecture.sections.length) {
                const timeRemaining = nextScheduleTimeRef.current - ctx.currentTime;
                setTimeout(() => {
                    if (isPlayingRef.current && playSessionIdRef.current === sessionId) {
                        stopAudio();
                        setCurrentSectionIndex(0);
                    }
                }, timeRemaining * 1000);
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
                   source.onended = () => {
                       activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
                   };

                   source.start(nextScheduleTimeRef.current);
                   const startTime = nextScheduleTimeRef.current;
                   const delayMs = (startTime - ctx.currentTime) * 1000;
                   const safeDelay = Math.max(0, delayMs);
                   const timerId = window.setTimeout(() => {
                       if (isPlayingRef.current && playSessionIdRef.current === sessionId) {
                           setCurrentSectionIndex(scheduleIdx); 
                           if (sectionRefs.current[scheduleIdx]) {
                               sectionRefs.current[scheduleIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                           }
                       }
                   }, safeDelay);
                   uiTimersRef.current.push(timerId); 
                   nextScheduleTimeRef.current += result.buffer.duration;
                   schedulingCursorRef.current++; 
                   break; 
                } else {
                   if (result.errorType === 'quota') {
                      alert(t.quotaError);
                      stopAudio();
                      setUseSystemVoice(true); 
                      break; 
                   }
                   console.error("TTS Failed");
                   stopAudio();
                   break;
                }
             } catch(e) {
                console.error("Schedule error", e);
                stopAudio();
                break;
             }
          }
          if (isPlayingRef.current && playSessionIdRef.current === sessionId) {
             schedulerTimerRef.current = setTimeout(schedule, 200);
          }
        };
        isPlayingRef.current = true;
        schedule();
      } else {
        const playSystem = () => {
           const idx = schedulingCursorRef.current;
           if (!activeLecture || idx >= activeLecture.sections.length) {
              stopAudio();
              setCurrentSectionIndex(0);
              return;
           }
           setCurrentSectionIndex(idx);
           if (sectionRefs.current[idx]) {
                sectionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
           }
           const section = activeLecture.sections[idx];
           const utter = new SpeechSynthesisUtterance(cleanTextForTTS(section.text));
           const targetURI = section.speaker === 'Teacher' ? sysTeacherVoiceURI : sysStudentVoiceURI;
           const v = systemVoices.find(v => v.voiceURI === targetURI);
           if (v) utter.voice = v;
           utter.rate = 1.1;
           utter.onend = () => {
              if (isPlayingRef.current) {
                 schedulingCursorRef.current++; 
                 playSystem(); 
              }
           };
           activeUtteranceRef.current = utter;
           window.speechSynthesis.speak(utter);
        };
        isPlayingRef.current = true;
        playSystem();
      }
    }
    return () => {
       if (schedulerTimerRef.current) clearTimeout(schedulerTimerRef.current);
    };
  }, [isPlaying, activeLecture, useSystemVoice, teacherVoice, studentVoice, sysTeacherVoiceURI, sysStudentVoiceURI]);

  const handleTopicClick = async (topicTitle: string, subTopicId?: string) => {
    if (isLiveActive) setIsLiveActive(false); 
    
    // Safety check for empty topic
    if (!topicTitle) {
        console.error("Cannot load topic: Title is missing.");
        return;
    }

    setActiveSubTopicId(subTopicId || null);
    stopAudio(); 
    setCurrentSectionIndex(0);
    schedulingCursorRef.current = 0; 
    
    setActiveLecture(null);
    setGuestError(null);
    setGenerationProgress(null);
    setIsLoadingLecture(true); // START LOADING
    
    if (window.innerWidth < 1024) setIsSidebarOpen(false);

    try {
        if (OFFLINE_LECTURES[topicTitle]) {
          setActiveLecture(OFFLINE_LECTURES[topicTitle]);
          setIsLoadedFromCache(true);
          return;
        }
        const spotlight = SPOTLIGHT_DATA[channel.id];
        if (spotlight && spotlight.lectures[topicTitle]) {
          setActiveLecture(spotlight.lectures[topicTitle]);
          setIsLoadedFromCache(true);
          return;
        }
        const cacheKey = `lecture_${channel.id}_${subTopicId}_${language}`;
        const cached = await getCachedLectureScript(cacheKey);
        if (cached) {
          setActiveLecture(cached);
          setIsLoadedFromCache(true);
          return;
        }
        if (isMember && subTopicId) {
            const cloudLecture = await getLectureFromFirestore(channel.id, subTopicId);
            if (cloudLecture) {
                setActiveLecture(cloudLecture);
                setIsLoadedFromCache(true);
                await cacheLectureScript(cacheKey, cloudLecture);
                return;
            }
        }
        const hasApiKey = !!localStorage.getItem('gemini_api_key');
        if (isMember || isOwner || hasApiKey) {
          setIsGenerating(true);
          const script = await generateLectureScript(topicTitle, channel.description, language);
          setIsGenerating(false);
          if (script) {
            setActiveLecture(script);
            setIsLoadedFromCache(false);
            await cacheLectureScript(cacheKey, script);
            if (currentUser && subTopicId) await saveLectureToFirestore(channel.id, subTopicId, script);
          } else {
             // Fallback if API returns null but no error thrown
             alert("Could not generate content for this topic. Please try again.");
          }
        } else {
          setGuestError(t.guestRestrict);
        }
    } catch (e) {
        console.error("Error loading topic:", e);
        setIsGenerating(false);
        alert("An error occurred while loading this lesson.");
    } finally {
        setIsLoadingLecture(false); // STOP LOADING
    }
  };

  const togglePlayback = () => {
    if (isPlaying) {
      stopAudio();
    } else {
      stopAudio();
      unlockAudioContext();
      playSessionIdRef.current++; 
      const startIdx = currentSectionIndex && currentSectionIndex < (activeLecture?.sections.length || 0) ? currentSectionIndex : 0;
      schedulingCursorRef.current = startIdx;
      
      const ctx = getAudioContext();
      nextScheduleTimeRef.current = Math.max(ctx.currentTime + 0.1, nextScheduleTimeRef.current);
      
      setIsPlaying(true);
    }
  };

  const generateLectureMarkdown = (lecture: GeneratedLecture) => {
    let md = `# ${lecture.topic}\n\n`;
    md += `**Date:** ${new Date().toLocaleDateString()}\n`;
    md += `**Host:** ${lecture.professorName} | **Guest:** ${lecture.studentName}\n\n`;
    md += `---\n\n`;
    
    lecture.sections.forEach(section => {
      const speakerName = section.speaker === 'Teacher' ? lecture.professorName : lecture.studentName;
      md += `### ${speakerName}\n\n`;
      md += `${section.text}\n\n`;
    });
    
    return md;
  };

  const handleDownloadMarkdown = () => {
    if (!activeLecture) return;
    const md = generateLectureMarkdown(activeLecture);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeLecture.topic.replace(/[^a-z0-9]/gi, '_')}.md`;
    a.click();
    setShowDownloadMenu(false);
  };

  const handleDownloadJSON = () => {
    if (!activeLecture) return;
    const blob = new Blob([JSON.stringify(activeLecture, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeLecture.topic.replace(/\s+/g, '_')}.json`;
    a.click();
    setShowDownloadMenu(false);
  };

  const handlePrintView = () => {
    if (!activeLecture) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert('Please allow popups to print');
    
    const formatTextForHtml = (text: string) => {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.*?)\*/g, "<em>$1</em>")
            .replace(/`([^`]+)`/g, "<code style='background:#f1f5f9;padding:2px 4px;border-radius:4px;font-family:monospace;'>$1</code>")
            .replace(/^# (.*$)/gm, "<h2>$1</h2>")
            .replace(/^## (.*$)/gm, "<h3>$1</h3>")
            .replace(/^### (.*$)/gm, "<h4>$1</h4>")
            .replace(/\n/g, "<br/>");
    };

    const html = `
      <html>
        <head>
          <title>${activeLecture.topic}</title>
          <style>
            body { font-family: 'Georgia', 'Times New Roman', serif; line-height: 1.8; max-width: 800px; margin: 0 auto; padding: 40px; color: #111; background: #fff; }
            h1 { font-family: 'Helvetica Neue', sans-serif; font-size: 28px; font-weight: 800; border-bottom: 2px solid #eee; padding-bottom: 16px; margin-bottom: 32px; color: #000; }
            .meta { color: #555; margin-bottom: 48px; font-style: italic; font-size: 15px; background: #f9f9f9; padding: 16px; border-radius: 4px; border-left: 4px solid #333; }
            .section { margin-bottom: 28px; break-inside: avoid; }
            .speaker { font-family: 'Helvetica Neue', sans-serif; font-weight: 700; margin-bottom: 6px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #444; }
            .speaker.teacher { color: #000; }
            .speaker.student { color: #000; opacity: 0.7; }
            .text { white-space: pre-wrap; color: #222; font-size: 18px; }
            @media print {
               body { padding: 0; }
               .meta { background: none; border: none; padding: 0; margin-bottom: 32px; }
            }
          </style>
        </head>
        <body>
          <h1>${activeLecture.topic}</h1>
          <div class="meta">
            <strong>Host:</strong> ${activeLecture.professorName} &bull; <strong>Guest:</strong> ${activeLecture.studentName}
            <br/>
            Generated via AIVoiceCast &bull; ${new Date().toLocaleDateString()}
          </div>
          ${activeLecture.sections.map(s => `
            <div class="section">
              <div class="speaker ${s.speaker === 'Teacher' ? 'teacher' : 'student'}">
                ${s.speaker === 'Teacher' ? activeLecture.professorName : activeLecture.studentName}
              </div>
              <div class="text">${formatTextForHtml(s.text)}</div>
            </div>
          `).join('')}
          <script>
            window.onload = () => { setTimeout(() => window.print(), 500); }
          </script>
        </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
    setShowDownloadMenu(false);
  };

  const handleVoiceSwitch = (isSystem: boolean) => {
      stopAudio();
      setUseSystemVoice(isSystem);
  };

  const handleStartSession = () => {
      setIsSessionSetupOpen(false);
      stopAudio();
      setLiveConfig({
          context: sessionContext,
          lectureId: activeSubTopicId || undefined,
          recording: isRecordingEnabled,
          video: isScreenRecordingEnabled,
          camera: isCameraRecordingEnabled
      });
      setIsLiveActive(true);
  };

  const handleDiscussSegment = async (index: number, text: string, existingDiscussionId?: string) => {
      stopAudio();
      if (!activeSubTopicId) return;
      
      setLiveConfig({
          context: text,
          lectureId: activeSubTopicId,
          recording: false,
          video: false,
          camera: false,
          segment: { index, lectureId: activeSubTopicId },
          discussionId: existingDiscussionId
      });
      setIsLiveActive(true);
  };

  const handleViewDiscussion = (discussionId: string) => {
      setViewDiscussionId(discussionId);
  };

  const openSessionSetup = () => {
      stopAudio();
      setSessionContext('');
      setIsRecordingEnabled(false);
      setIsScreenRecordingEnabled(false);
      setIsCameraRecordingEnabled(false);
      setIsSessionSetupOpen(true);
  };

  const navigateLesson = (direction: 'next' | 'prev') => {
      if (currentLectureIndex === -1) return;
      const newIndex = direction === 'next' ? currentLectureIndex + 1 : currentLectureIndex - 1;
      if (newIndex >= 0 && newIndex < flatCurriculum.length) {
          const target = flatCurriculum[newIndex];
          handleTopicClick(target.title, target.id);
      }
  };

  const liveSessionChannel = useMemo(() => {
    if (!channel) return null;
    if (language === 'zh') {
        return {
            ...channel,
            systemInstruction: channel.systemInstruction + "\n\nIMPORTANT: Please speak and interact in Simplified Chinese (Mandarin). 您必须使用中文（普通话）与用户交流。"
        };
    }
    return channel;
  }, [channel, language]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-24 relative overflow-hidden">
      
      <div className="relative h-64 md:h-80 w-full flex-shrink-0">
        <div className="absolute inset-0"><img src={channel.imageUrl} alt={channel.title} className="w-full h-full object-cover opacity-60"/><div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" /></div>
        
        <div className="absolute top-4 left-4 z-20 flex items-center gap-3">
            <button onClick={() => { stopAudio(); onBack(); }} className="flex items-center space-x-2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full hover:bg-white/10 transition-colors border border-white/10 text-sm font-medium">
                <ArrowLeft size={16} /><span>{t.back}</span>
            </button>
            
            <button 
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden flex items-center space-x-2 px-4 py-2 bg-indigo-600/80 backdrop-blur-md rounded-full hover:bg-indigo-500 transition-colors text-white text-sm font-bold shadow-lg"
            >
                <List size={16} />
                <span>{t.curriculum}</span>
            </button>
        </div>

        {isOwner && onEditChannel && (<div className="absolute top-4 right-4 z-20"><button onClick={onEditChannel} className="flex items-center space-x-2 px-4 py-2 bg-indigo-600/80 backdrop-blur-md rounded-full hover:bg-indigo-500 transition-colors text-white text-sm font-bold shadow-lg"><Edit size={16} /><span>{t.edit}</span></button></div>)}
        
        <div className="absolute bottom-0 left-0 w-full p-6 md:p-8 max-w-7xl mx-auto">
           <div className="flex items-end justify-between">
             <div>
               <div className="flex items-center space-x-2 mb-2"><span className="px-2 py-1 bg-indigo-500 text-white text-[10px] uppercase font-bold tracking-widest rounded-md">{t.series}</span><div className="flex space-x-1">{channel.tags.map(tag => (<span key={tag} className="text-xs text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full bg-slate-900/50">#{tag}</span>))}</div></div>
               <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 shadow-sm">{channel.title}</h1>
               <p className="text-lg text-slate-300 max-w-2xl line-clamp-2">{channel.description}</p>
             </div>
             <div className="hidden md:flex items-center space-x-3">
                {onViewComments && (
                    <button onClick={onViewComments} className="flex items-center space-x-2 bg-slate-800/60 hover:bg-slate-700/80 backdrop-blur-md text-white px-4 py-3 rounded-full font-bold transition-all border border-white/10">
                        <MessageSquare size={20} />
                        <span>{t.comments} ({channel.comments.length})</span>
                    </button>
                )}
                {!isLiveActive && (
                    <button onClick={openSessionSetup} className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-full font-bold shadow-lg shadow-indigo-500/30 transition-all hover:scale-105">
                        <Play size={20} fill="currentColor" /><span>{t.startLive}</span>
                    </button>
                )}
             </div>
           </div>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 relative">
        
        {isSidebarOpen && (
            <div 
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
                onClick={() => setIsSidebarOpen(false)}
            />
        )}

        <div className={`
            fixed lg:relative inset-y-0 left-0 z-40 w-80 lg:w-auto lg:z-auto
            transform transition-transform duration-300 ease-in-out
            bg-slate-900 lg:bg-transparent border-r lg:border-none border-slate-800
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            lg:col-span-4 h-full lg:h-[calc(100vh-24rem)] lg:sticky lg:top-8 overflow-y-auto
        `}>
          
          <div className="bg-slate-900 border border-slate-800 rounded-none lg:rounded-xl shadow-xl overflow-hidden h-full lg:h-auto flex flex-col">
             
             <div className="lg:hidden p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                 <h3 className="font-bold text-white flex items-center gap-2"><BookOpen size={18} className="text-indigo-400"/> {t.curriculum}</h3>
                 <button onClick={() => setIsSidebarOpen(false)}><X size={20} className="text-slate-400"/></button>
             </div>

             {staticReading && (
                 <div className="flex border-b border-slate-800 shrink-0">
                     <button onClick={() => setActiveTab('curriculum')} className={`flex-1 py-3 text-sm font-bold flex items-center justify-center space-x-2 ${activeTab === 'curriculum' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                        <BookOpen size={16}/><span>{t.curriculum}</span>
                     </button>
                     <button onClick={() => setActiveTab('reading')} className={`flex-1 py-3 text-sm font-bold flex items-center justify-center space-x-2 ${activeTab === 'reading' ? 'bg-slate-800 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>
                        <FileText size={16}/><span>{t.reading}</span>
                     </button>
                 </div>
             )}

             <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
             {activeTab === 'curriculum' && (
                 <>
                    <div className="p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10 flex items-center justify-between">
                        <div>
                            <h3 className="text-xl font-bold text-white flex items-center space-x-2"><BookOpen className="text-indigo-400" size={20} /><span>{t.curriculum}</span></h3>
                            <p className="text-xs text-slate-500 mt-1">{chapters && chapters.length > 0 ? `${chapters.length} ${t.chapters} • ${chapters.reduce((acc, c) => acc + (c.subTopics ? c.subTopics.length : 0), 0)} ${t.lessons}` : t.selectTopic}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                            <button 
                                onClick={handleExportFullCourse}
                                disabled={isExportingCourse}
                                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors border border-slate-700 shadow-sm"
                                title="Export Full Course"
                            >
                                {isExportingCourse ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                            </button>
                            {isOwner && (
                                <button 
                                    onClick={() => handleRegenerateCurriculum(false)} 
                                    disabled={isGeneratingCurriculum}
                                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white rounded-lg transition-colors border border-slate-700 hover:border-indigo-500 shadow-sm"
                                    title={t.regenerate}
                                >
                                    <RefreshCw size={14} className={isGeneratingCurriculum ? 'animate-spin' : ''} />
                                    <span className="text-xs font-bold hidden xl:inline">{t.regenerate}</span>
                                </button>
                            )}
                        </div>
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
                    ) : (
                        <div className="p-8 text-center space-y-4">
                            <p className="text-slate-500 text-sm italic">No curriculum generated yet.</p>
                            {isOwner ? (
                                <button 
                                    onClick={() => handleRegenerateCurriculum(true)}
                                    disabled={isGeneratingCurriculum}
                                    className="w-full flex items-center justify-center space-x-2 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-lg transition-all"
                                >
                                    {isGeneratingCurriculum ? <Loader2 size={16} className="animate-spin" /> : <PlusCircle size={16} />}
                                    <span>{t.generateCourse}</span>
                                </button>
                            ) : (
                                <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                                    <p className="text-xs text-slate-400 mb-2">Content pending generation.</p>
                                    <p className="text-xs text-indigo-400 font-bold">Login as owner to generate.</p>
                                </div>
                            )}
                        </div>
                    )}
                 </>
             )}

             {activeTab === 'reading' && staticReading && (
                 <div className="p-4 space-y-4">
                     {staticReading.map((section, idx) => (
                         <div key={idx} className="space-y-2">
                             <h4 className="text-sm font-bold text-white uppercase tracking-wider border-b border-slate-800 pb-1">{section.title}</h4>
                             <div className="space-y-1">
                                 {section.blocks.map((block, bIdx) => (
                                     <a key={bIdx} href={`#code-${idx}-${bIdx}`} className="block text-xs text-slate-400 hover:text-emerald-400 transition-colors truncate">
                                         {block.title}
                                     </a>
                                 ))}
                             </div>
                         </div>
                     ))}
                 </div>
             )}
             </div>
          </div>
          
          <div className="md:hidden flex space-x-3 w-full p-4 bg-slate-900 border-t border-slate-800">
             {onViewComments && (
                <button onClick={onViewComments} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-bold flex items-center justify-center border border-slate-700">
                    <MessageSquare size={20} />
                </button>
             )}
             <button onClick={openSessionSetup} className="flex-[3] flex items-center justify-center space-x-2 bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg"><Play size={20} fill="currentColor" /><span>{t.startFree}</span></button>
          </div>
        </div>

        <div className={`lg:col-span-8 transition-all duration-300 ${!isSidebarOpen && window.innerWidth >= 1024 ? 'lg:col-span-12' : ''}`}>
          
          <div className="hidden lg:block absolute top-0 -left-6 z-10">
             <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-1 bg-slate-800 rounded-l-md text-slate-400 hover:text-white border border-r-0 border-slate-700"
                title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
             >
                {isSidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
             </button>
          </div>

          {isLiveActive && liveSessionChannel ? (
              <div className="h-[calc(100vh-20rem)] min-h-[500px] w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative">
                  <LiveSession 
                      channel={liveSessionChannel}
                      initialContext={liveConfig.context}
                      lectureId={liveConfig.lectureId}
                      recordingEnabled={liveConfig.recording}
                      videoEnabled={liveConfig.video}
                      cameraEnabled={liveConfig.camera}
                      activeSegment={liveConfig.segment}
                      initialTranscript={liveConfig.initialTranscript}
                      existingDiscussionId={liveConfig.discussionId}
                      language={language}
                      onEndSession={async () => {
                          setIsLiveActive(false);
                          if (liveConfig.segment && liveConfig.lectureId) {
                              const cacheKey = `lecture_${channel.id}_${liveConfig.lectureId}_${language}`;
                              const updated = await getCachedLectureScript(cacheKey);
                              if (updated) setActiveLecture(updated);
                          }
                      }}
                  />
              </div>
          ) : activeTab === 'reading' && staticReading ? (
              <div className="space-y-12">
                  <div className="bg-emerald-900/10 border border-emerald-500/20 p-6 rounded-2xl mb-6">
                      <div className="flex items-center space-x-3 text-emerald-400 mb-2">
                          <Code size={24} />
                          <h2 className="text-xl font-bold">Developer Reading Mode</h2>
                      </div>
                      <p className="text-emerald-200/80 text-sm">
                          Review the implementation details below. These algorithms are optimized for performance and interview readability.
                      </p>
                  </div>

                  {staticReading.map((section, idx) => (
                      <div key={idx} className="space-y-8 animate-fade-in-up">
                          <h3 className="text-2xl font-bold text-white border-l-4 border-emerald-500 pl-4">{section.title}</h3>
                          {section.blocks.map((block, bIdx) => (
                              <div key={bIdx} id={`code-${idx}-${bIdx}`} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg scroll-mt-24">
                                  <div className="bg-slate-800/50 px-4 py-3 border-b border-slate-800 flex justify-between items-center">
                                      <span className="font-bold text-slate-200">{block.title}</span>
                                      <span className="text-xs font-mono text-slate-500 uppercase">{block.language}</span>
                                  </div>
                                  <div className="p-4 bg-slate-950 overflow-x-auto">
                                      <pre className="text-sm font-mono text-indigo-100 leading-relaxed">
                                          {block.code}
                                      </pre>
                                  </div>
                                  <div className="p-4 bg-slate-900/50 border-t border-slate-800">
                                      <p className="text-sm text-slate-400 italic">
                                          <span className="font-bold text-slate-500 not-italic mr-2">Analysis:</span>
                                          {block.explanation}
                                      </p>
                                  </div>
                              </div>
                          ))}
                      </div>
                  ))}
              </div>
          ) : isLoadingLecture ? (
            <div className="h-full flex flex-col items-center justify-center space-y-6 p-8 min-h-[400px]">
                <div className="relative">
                    <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Sparkles className="w-6 h-6 text-indigo-400 animate-pulse" />
                    </div>
                </div>
                <div className="text-center space-y-2">
                    <h3 className="text-xl font-bold text-white animate-pulse">{t.generating}</h3>
                    <p className="text-slate-400 text-sm">{t.genDesc}</p>
                </div>
            </div>
          ) : activeLecture ? (
            <div className="space-y-8">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl sticky top-8 z-20 backdrop-blur-md bg-slate-900/90">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                                <span className="bg-indigo-500 w-2 h-6 rounded-full"></span>
                                <span>{activeLecture.topic}</span>
                            </h2>
                            <p className="text-xs text-slate-500 mt-1 pl-4 flex items-center space-x-2">
                                <User size={12} /><span>{activeLecture.professorName}</span>
                                <span>&</span>
                                <GraduationCap size={12} /><span>{activeLecture.studentName}</span>
                            </p>
                        </div>
                        <div className="flex items-center space-x-2">
                            {(isMember || isOwner) && (
                                <>
                                    <button 
                                        onClick={handleRegenerateLecture}
                                        className="flex items-center space-x-2 px-3 py-2 bg-slate-800 rounded-full text-slate-400 hover:text-indigo-400 transition-colors border border-slate-700 hover:border-indigo-500/50"
                                        title="Regenerate Script with AI"
                                        disabled={isGenerating}
                                    >
                                        <Bot size={18} className={isGenerating ? 'animate-bounce' : ''} />
                                        <span className="text-xs font-bold hidden sm:inline">Regenerate</span>
                                    </button>
                                    <button 
                                        onClick={handleDeleteLecture}
                                        className="flex items-center space-x-2 px-3 py-2 bg-slate-800 rounded-full text-slate-400 hover:text-red-400 transition-colors border border-slate-700 hover:border-red-500/50"
                                        title="Delete Lecture Content"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </>
                            )}
                            <button onClick={() => setShowVoiceSettings(!showVoiceSettings)} className={`p-2 rounded-full transition-all ${showVoiceSettings ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}><Settings size={18} /></button>
                            
                            {/* Download Button with Dropdown - Enhanced Visibility */}
                            <div className="relative">
                                <button 
                                    onClick={() => setShowDownloadMenu(!showDownloadMenu)} 
                                    className={`flex items-center space-x-2 px-4 py-2 rounded-full transition-all border shadow-lg ${showDownloadMenu ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500 shadow-emerald-500/20'}`}
                                    title="Export Options"
                                >
                                    <Download size={18} />
                                    <span className="font-bold text-xs">{t.download}</span>
                                </button>
                                {showDownloadMenu && (
                                    <div className="absolute right-0 top-full mt-2 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in-up">
                                        <div className="p-2 border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-950/50">Export Lecture</div>
                                        <button onClick={handleDownloadMarkdown} className="w-full text-left px-4 py-3 hover:bg-slate-800 flex items-center gap-3 text-sm text-slate-300 hover:text-white transition-colors group">
                                            <div className="p-1.5 bg-indigo-900/30 text-indigo-400 rounded group-hover:bg-indigo-900/50"><FileDown size={16}/></div>
                                            <span>Markdown Document</span>
                                        </button>
                                        <button onClick={handlePrintView} className="w-full text-left px-4 py-3 hover:bg-slate-800 flex items-center gap-3 text-sm text-slate-300 hover:text-white transition-colors group">
                                            <div className="p-1.5 bg-emerald-900/30 text-emerald-400 rounded group-hover:bg-emerald-900/50"><Printer size={16}/></div>
                                            <span>Print / PDF View</span>
                                        </button>
                                        <button onClick={handleDownloadJSON} className="w-full text-left px-4 py-3 hover:bg-slate-800 flex items-center gap-3 text-sm text-slate-300 hover:text-white transition-colors border-t border-slate-800 group">
                                            <div className="p-1.5 bg-amber-900/30 text-amber-400 rounded group-hover:bg-amber-900/50"><FileJson size={16}/></div>
                                            <span>Raw JSON Data</span>
                                        </button>
                                    </div>
                                )}
                                {showDownloadMenu && (
                                    <div className="fixed inset-0 z-40" onClick={() => setShowDownloadMenu(false)}></div>
                                )}
                            </div>
                        </div>
                    </div>

                    {showVoiceSettings && (
                        <div className="mb-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700 animate-fade-in">
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.voiceSettings}</h4>
                                <div className="flex items-center space-x-2 gap-2">
                                    <button 
                                        onClick={loadVoices} 
                                        className="p-1.5 rounded-lg bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors"
                                        title="Refresh Voices"
                                    >
                                        <RefreshCw size={14} />
                                    </button>
                                    <div className="flex items-center space-x-2 bg-slate-900 rounded-lg p-1 border border-slate-700">
                                        <button onClick={() => handleVoiceSwitch(false)} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${!useSystemVoice ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>Neural (AI)</button>
                                        <button onClick={() => handleVoiceSwitch(true)} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${useSystemVoice ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>System</button>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] text-slate-500 uppercase mb-1">{t.teacherVoice}</label>
                                    <select 
                                        className="w-full bg-slate-900 text-xs text-white p-2 rounded-lg border border-slate-700 outline-none"
                                        value={useSystemVoice ? sysTeacherVoiceURI : teacherVoice}
                                        onChange={(e) => useSystemVoice ? setSysTeacherVoiceURI(e.target.value) : setTeacherVoice(e.target.value)}
                                        onPointerDown={loadVoices} // Force refresh on interact
                                    >
                                        {useSystemVoice 
                                            ? systemVoices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)
                                            : GEMINI_VOICES.map(v => <option key={v} value={v}>{v}</option>)
                                        }
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] text-slate-500 uppercase mb-1">{t.studentVoice}</label>
                                    <select 
                                        className="w-full bg-slate-900 text-xs text-white p-2 rounded-lg border border-slate-700 outline-none"
                                        value={useSystemVoice ? sysStudentVoiceURI : studentVoice}
                                        onChange={(e) => useSystemVoice ? setSysStudentVoiceURI(e.target.value) : setStudentVoice(e.target.value)}
                                        onPointerDown={loadVoices} // Force refresh on interact
                                    >
                                        {useSystemVoice 
                                            ? systemVoices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)
                                            : GEMINI_VOICES.map(v => <option key={v} value={v}>{v}</option>)
                                        }
                                    </select>
                                </div>
                            </div>

                            {/* Help Section for iOS Users */}
                            <div className="mt-4 pt-3 border-t border-slate-700/50">
                                <button 
                                    onClick={() => setShowIOSHelp(!showIOSHelp)} 
                                    className="flex items-center gap-2 text-xs text-indigo-400 hover:text-white transition-colors"
                                >
                                    <HelpCircle size={14} />
                                    <span>iPhone/iPad Users: Improve Voice Quality</span>
                                </button>
                                {showIOSHelp && (
                                    <div className="mt-2 p-3 bg-indigo-900/20 border border-indigo-500/30 rounded-lg text-xs text-indigo-200">
                                        <p className="font-bold mb-2 text-white">How to enable high-quality "Neural" system voices:</p>
                                        <ol className="list-decimal pl-4 space-y-1 text-indigo-200/80">
                                            <li>Open iPhone <strong>Settings</strong> → <strong>Accessibility</strong>.</li>
                                            <li>Tap <strong>Spoken Content</strong> → <strong>Voices</strong>.</li>
                                            <li>Select <strong>English</strong>.</li>
                                            <li>Download <strong>Siri</strong> (Voice 1-4) or <strong>Samantha (Enhanced)</strong>.</li>
                                            <li>Refresh this app. The new voices will appear in the "System Voice" list.</li>
                                        </ol>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-between items-center mt-6 pt-6 border-t border-slate-800">
                        <button onClick={() => navigateLesson('prev')} disabled={currentLectureIndex <= 0} className="text-slate-400 hover:text-white disabled:opacity-30 flex items-center space-x-2 text-sm font-bold transition-colors">
                            <SkipBack size={20} />
                            <span className="hidden sm:inline">{t.prev}</span>
                        </button>

                        <div className="flex flex-col items-center gap-2">
                            {!useSystemVoice && !isAudioReady && !isPlaying ? (
                                <button
                                    onClick={handleGenerateAudio}
                                    disabled={isGenerating}
                                    className="w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg bg-indigo-600 text-white hover:bg-indigo-500 hover:scale-105 disabled:opacity-50 disabled:scale-100"
                                    title={t.preGenDesc}
                                >
                                    {isGenerating ? (
                                        <div className="flex flex-col items-center">
                                            <Loader2 className="animate-spin mb-1" size={20} />
                                            <span className="text-[10px] font-bold">{generationProgress ? `${Math.round((generationProgress.current / generationProgress.total) * 100)}%` : '...'}</span>
                                        </div>
                                    ) : (
                                        <Zap fill="currentColor" size={28} />
                                    )}
                                </button>
                            ) : (
                                <button 
                                    onClick={togglePlayback}
                                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg ${isPlaying ? 'bg-slate-800 text-red-400 hover:bg-slate-700' : 'bg-emerald-600 text-white hover:bg-emerald-500 hover:scale-105'}`}
                                >
                                    {isPlaying ? (isBuffering ? <Loader2 className="animate-spin" size={28}/> : <Pause fill="currentColor" size={28} />) : <Play fill="currentColor" size={28} />}
                                </button>
                            )}
                            
                            {!isPlaying && !useSystemVoice && !isAudioReady && !isGenerating && (
                                <span className="text-xs text-indigo-400 font-medium animate-pulse">Generate Audio First</span>
                            )}

                            {/* iOS System Voice Help Trigger */}
                            {useSystemVoice && (
                                <button 
                                    onClick={() => { setShowVoiceSettings(true); setShowIOSHelp(true); }}
                                    className="text-[10px] text-slate-500 hover:text-indigo-400 flex items-center gap-1 mt-1"
                                >
                                    <HelpCircle size={10} /> Improve Voice
                                </button>
                            )}
                        </div>

                        <button onClick={() => navigateLesson('next')} disabled={currentLectureIndex === -1 || currentLectureIndex >= flatCurriculum.length - 1} className="text-slate-400 hover:text-white disabled:opacity-30 flex items-center space-x-2 text-sm font-bold transition-colors">
                            <span className="hidden sm:inline">{t.next}</span>
                            <SkipForward size={20} />
                        </button>
                    </div>
                </div>

                <div className="space-y-6 max-w-4xl mx-auto px-2">
                    {activeLecture.sections.map((section, idx) => (
                        <div 
                            key={idx} 
                            ref={(el) => { sectionRefs.current[idx] = el; }}
                            className={`p-4 rounded-xl transition-all duration-500 ${currentSectionIndex === idx ? 'bg-indigo-900/40 border border-indigo-500/50 shadow-lg scale-[1.01]' : 'hover:bg-slate-800/30 border border-transparent'}`}
                        >
                            <div className="flex items-start space-x-4">
                                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold border ${section.speaker === 'Teacher' ? 'bg-slate-800 border-indigo-500 text-indigo-400' : 'bg-slate-800 border-purple-500 text-purple-400'}`}>
                                    {section.speaker === 'Teacher' ? 'Pro' : 'Stu'}
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs font-bold text-slate-500 uppercase mb-1">{section.speaker === 'Teacher' ? activeLecture.professorName : activeLecture.studentName}</p>
                                    <p className={`text-base leading-relaxed ${currentSectionIndex === idx ? 'text-white font-medium' : 'text-slate-400'}`}>
                                        {section.text}
                                    </p>
                                    
                                    {/* Inline Actions */}
                                    <div className={`mt-3 flex items-center gap-2 transition-opacity duration-300 ${currentSectionIndex === idx ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
                                        <button 
                                            onClick={() => handleDiscussSegment(idx, section.text, section.discussionId)}
                                            className={`text-xs flex items-center gap-1 px-2 py-1 rounded transition-colors ${section.discussionId ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-900/50' : 'bg-slate-800 text-indigo-400 hover:text-white'}`}
                                        >
                                            <MessageCircle size={12} />
                                            <span>{section.discussionId ? t.viewDiscussion : t.discuss}</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4 p-8">
               <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center animate-pulse">
                  <BookOpen size={40} className="opacity-50" />
               </div>
               <div className="text-center">
                  <h3 className="text-xl font-bold text-slate-300 mb-2">{guestError || t.noLesson}</h3>
                  <p className="text-sm max-w-md">{guestError ? "Sign in to access AI features." : t.chooseChapter}</p>
               </div>
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
                  
                  <div className="space-y-6">
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase">Context / Initial Question</label>
                          <textarea 
                              value={sessionContext} 
                              onChange={e => setSessionContext(e.target.value)} 
                              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500 mt-1 h-24 text-sm resize-none"
                              placeholder="What specific topic do you want to discuss?"
                          />
                      </div>
                      
                      {currentUser ? (
                          <div className="space-y-3">
                              <div 
                                  onClick={() => setIsRecordingEnabled(!isRecordingEnabled)}
                                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${isRecordingEnabled ? 'bg-red-900/20 border-red-500/50' : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800'}`}
                              >
                                  <div className="flex items-center gap-3">
                                      <div className={`p-2 rounded-full ${isRecordingEnabled ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                                          <Mic size={16} />
                                      </div>
                                      <div>
                                          <p className={`font-bold text-sm ${isRecordingEnabled ? 'text-red-400' : 'text-slate-300'}`}>{t.recordSession}</p>
                                          <p className="text-[10px] text-slate-500">{t.recordDesc}</p>
                                      </div>
                                  </div>
                                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isRecordingEnabled ? 'border-red-500 bg-red-500 text-white' : 'border-slate-500'}`}>
                                      {isRecordingEnabled && <Check size={12} />}
                                  </div>
                              </div>

                              {isRecordingEnabled && (
                                  <div 
                                      onClick={() => setIsScreenRecordingEnabled(!isScreenRecordingEnabled)}
                                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ml-4 ${isScreenRecordingEnabled ? 'bg-indigo-900/20 border-indigo-500/50' : 'bg-slate-800/30 border-slate-700 hover:bg-slate-800'}`}
                                  >
                                      <div className="flex items-center gap-3">
                                          <div className={`p-1.5 rounded-full ${isScreenRecordingEnabled ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                                              <Monitor size={16} />
                                          </div>
                                          <div>
                                              <p className={`font-bold text-xs ${isScreenRecordingEnabled ? 'text-indigo-400' : 'text-slate-400'}`}>Include Screen Share</p>
                                          </div>
                                      </div>
                                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isScreenRecordingEnabled ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-500'}`}>
                                          {isScreenRecordingEnabled && <Check size={10} />}
                                      </div>
                                  </div>
                              )}

                              {isRecordingEnabled && (
                                  <div 
                                      onClick={() => setIsCameraRecordingEnabled(!isCameraRecordingEnabled)}
                                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ml-4 ${isCameraRecordingEnabled ? 'bg-indigo-900/20 border-indigo-500/50' : 'bg-slate-800/30 border-slate-700 hover:bg-slate-800'}`}
                                  >
                                      <div className="flex items-center gap-3">
                                          <div className={`p-1.5 rounded-full ${isCameraRecordingEnabled ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                                              <Video size={16} />
                                          </div>
                                          <div>
                                              <p className={`font-bold text-xs ${isCameraRecordingEnabled ? 'text-indigo-400' : 'text-slate-400'}`}>Include Camera Video</p>
                                          </div>
                                      </div>
                                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isCameraRecordingEnabled ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-500'}`}>
                                          {isCameraRecordingEnabled && <Check size={10} />}
                                      </div>
                                  </div>
                              )}
                          </div>
                      ) : (
                          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 text-xs text-slate-400 text-center">
                              Sign in to enable recording.
                          </div>
                      )}

                      <button 
                          onClick={handleStartSession}
                          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]"
                      >
                          <Play size={18} fill="currentColor"/>
                          <span>{t.start}</span>
                      </button>
                  </div>
              </div>
          </div>
      )}

      {viewDiscussionId && (
          <DiscussionModal 
              isOpen={true} 
              onClose={() => setViewDiscussionId(null)} 
              discussionId={viewDiscussionId} 
              currentUser={currentUser}
              language={language}
              activeLectureTopic={activeLecture?.topic}
          />
      )}

    </div>
  );
};
