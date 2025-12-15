
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Channel, UserProfile, GeneratedLecture } from '../types';
import { Play, MessageSquare, Heart, Share2, Bookmark, Music, Plus, Pause, Loader2, Volume2, VolumeX, GraduationCap, ChevronRight, Mic, AlignLeft, BarChart3, User, AlertCircle, Zap, Radio, Square, Sparkles } from 'lucide-react';
import { ChannelCard } from './ChannelCard';
import { CreatorProfileModal } from './CreatorProfileModal';
import { followUser, unfollowUser } from '../services/firestoreService';
import { generateLectureScript } from '../services/lectureGenerator';
import { synthesizeSpeech } from '../services/tts';
import { getCachedLectureScript, cacheLectureScript } from '../utils/db';
import { GEMINI_API_KEY, OPENAI_API_KEY } from '../services/private_keys';
import { SPOTLIGHT_DATA } from '../utils/spotlightContent';
import { OFFLINE_CHANNEL_ID, OFFLINE_CURRICULUM, OFFLINE_LECTURES } from '../utils/offlineContent';

interface PodcastFeedProps {
  channels: Channel[];
  onChannelClick: (id: string) => void;
  onStartLiveSession: (channel: Channel) => void; 
  userProfile: UserProfile | null;
  globalVoice: string;
  onRefresh?: () => void;
  onMessageCreator?: (creatorId: string, creatorName: string) => void;
  
  // Props for ChannelCard (Desktop View)
  t?: any;
  currentUser?: any;
  setChannelToEdit?: (channel: Channel) => void;
  setIsSettingsModalOpen?: (open: boolean) => void;
  onCommentClick?: (channel: Channel) => void;
  handleVote?: (id: string, type: 'like' | 'dislike', e: React.MouseEvent) => void;
  
  // New Prop for filtering logic ('mine' added for my-podcast support)
  filterMode?: 'foryou' | 'following' | 'mine';
}

// --- Singleton Audio Context & Global Controls ---
let sharedAudioContext: AudioContext | null = null;
let globalStopPlayback: (() => void) | null = null;

const getSharedAudioContext = () => {
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
        sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return sharedAudioContext;
};

// --- Sub-Component for Mobile Feed Card ---
const MobileFeedCard = ({ 
    channel, 
    isActive, 
    onToggleLike, 
    isLiked, 
    isBookmarked, 
    isFollowed, 
    onToggleBookmark, 
    onToggleFollow, 
    onShare, 
    onComment, 
    onProfileClick, 
    onChannelClick, 
    onChannelFinish 
}: any) => {
    // UI State
    const [playbackState, setPlaybackState] = useState<'idle' | 'buffering' | 'playing' | 'error'>('idle');
    const [statusMessage, setStatusMessage] = useState('');
    const [transcript, setTranscript] = useState<{speaker: string, text: string} | null>(null);
    
    // Provider State: 'system', 'gemini', 'openai'
    // Default to OpenAI if key exists, then Gemini, else System.
    const [provider, setProvider] = useState<'system' | 'gemini' | 'openai'>(() => {
        const hasOpenAI = !!(localStorage.getItem('openai_api_key') || OPENAI_API_KEY || process.env.OPENAI_API_KEY);
        if (hasOpenAI) return 'openai';

        const hasGemini = !!(localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY);
        return hasGemini ? 'gemini' : 'system';
    });
    const providerRef = useRef<'system' | 'gemini' | 'openai'>(provider); // Ref for access in loop
    
    // Logic State
    const [trackIndex, setTrackIndex] = useState(-1); // -1 = Intro, 0+ = Lessons
    
    // Refs
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const mountedRef = useRef(true);
    const playbackSessionRef = useRef(0); // Incremented to invalidate old loops
    const isActiveRef = useRef(isActive); // Fresh ref for async loops
    
    // Buffering Refs
    const preloadedScriptRef = useRef<Promise<GeneratedLecture | null> | null>(null);
    const preloadedAudioRef = useRef<Promise<any> | null>(null);

    // Sync Ref
    useEffect(() => { providerRef.current = provider; }, [provider]);
    useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

    // Data Helpers - Merge Static Data to ensure we have a curriculum
    const flatCurriculum = useMemo(() => {
        let chapters = channel.chapters;
        
        // Fallback to Spotlight/Offline data if chapters missing on channel object
        if (!chapters || chapters.length === 0) {
            if (channel.id === OFFLINE_CHANNEL_ID) {
                chapters = OFFLINE_CURRICULUM;
            } else if (SPOTLIGHT_DATA[channel.id]) {
                chapters = SPOTLIGHT_DATA[channel.id].curriculum;
            }
        }

        if (!chapters) return [];
        return chapters.flatMap((ch: any, cIdx: number) => 
            (ch.subTopics || []).map((sub: any, lIdx: number) => ({
                chapterIndex: cIdx,
                lessonIndex: lIdx,
                title: sub.title,
                id: sub.id,
                chapterTitle: ch.title
            }))
        );
    }, [channel]);

    const totalLessons = flatCurriculum.length;

    useEffect(() => {
        mountedRef.current = true;
        return () => { 
            mountedRef.current = false;
            stopAudio();
        };
    }, []);

    // --- Lifecycle Management ---
    useEffect(() => {
        if (isActive) {
            // Reset state when card becomes active
            const introText = channel.welcomeMessage || channel.description || `Welcome to ${channel.title}.`;
            setTranscript({ speaker: 'Host', text: introText });
            setTrackIndex(-1);
            setStatusMessage("");
            
            // Try Auto-Play
            const timer = setTimeout(() => {
                attemptAutoPlay();
            }, 600); 
            return () => clearTimeout(timer);
        } else {
            stopAudio();
            setPlaybackState('idle');
            playbackSessionRef.current++;
            preloadedScriptRef.current = null;
            preloadedAudioRef.current = null;
        }
    }, [isActive, channel.id]);

    const stopAudio = useCallback(() => {
        if (sourceRef.current) {
            try { sourceRef.current.stop(); } catch(e) {}
            sourceRef.current = null;
        }
        window.speechSynthesis.cancel();
    }, []);

    const attemptAutoPlay = async () => {
        if (playbackState === 'playing' || playbackState === 'buffering') return;

        // Force Stop other global audio (e.g. if previous card is still fading out)
        if (globalStopPlayback && globalStopPlayback !== stopAudio) {
            globalStopPlayback();
        }
        globalStopPlayback = stopAudio;

        const ctx = getSharedAudioContext();
        if (ctx.state === 'suspended') {
            try { await ctx.resume(); } catch(e) {}
        }

        if (ctx.state === 'running' || providerRef.current === 'system') {
            const sessionId = ++playbackSessionRef.current;
            runTrackSequence(-1, sessionId);
        }
    };

    const handleStop = (e: React.MouseEvent) => {
        e.stopPropagation();
        stopAudio();
        playbackSessionRef.current++; // Invalidate loop
        setPlaybackState('idle');
        setStatusMessage("Stopped");
        setTrackIndex(-1); // Reset
    };

    const handleTogglePlay = async (e: React.MouseEvent) => {
        e.stopPropagation();
        
        // 1. If not active card, make it active (this will trigger auto-play via effect)
        if (!isActive) {
            onChannelClick(channel.id);
            if (globalStopPlayback) globalStopPlayback();
            return;
        }

        // 2. Toggle Logic
        if (playbackState === 'playing' || playbackState === 'buffering') {
            stopAudio();
            playbackSessionRef.current++; // Invalidate loop
            setPlaybackState('idle');
            setStatusMessage("Paused");
            return;
        }

        // 3. Start Playback
        if (globalStopPlayback && globalStopPlayback !== stopAudio) {
            globalStopPlayback();
        }
        globalStopPlayback = stopAudio;

        const ctx = getSharedAudioContext();
        if (ctx.state === 'suspended') {
            try { 
                await ctx.resume(); 
                // Play dummy silent buffer to unlock on iOS
                const buffer = ctx.createBuffer(1, 1, 22050);
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(ctx.destination);
                source.start(0);
            } catch(e) {
                console.error("Audio unlock failed", e);
            }
        }
        
        const sessionId = ++playbackSessionRef.current;
        const start = (trackIndex >= totalLessons) ? -1 : trackIndex;
        runTrackSequence(start, sessionId);
    };

    const toggleTtsMode = (e: React.MouseEvent) => {
        e.stopPropagation();
        // Cycle: Gemini -> OpenAI -> System
        let newMode: 'system' | 'gemini' | 'openai' = 'system';
        
        if (provider === 'gemini') newMode = 'openai';
        else if (provider === 'openai') newMode = 'system';
        else newMode = 'gemini';

        // Notify user if keys missing but still switch (let loop handle error for consistency or handle here)
        const hasGemini = !!(localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY);
        const hasOpenAI = !!(localStorage.getItem('openai_api_key') || OPENAI_API_KEY || process.env.OPENAI_API_KEY);

        if (newMode === 'gemini' && !hasGemini) {
            alert("Gemini API Key is missing. Please add it in Settings.");
        }
        if (newMode === 'openai' && !hasOpenAI) {
            alert("OpenAI API Key is missing. Please add it in Settings.");
        }

        setProvider(newMode);
        
        // Force restart if currently playing to apply new voice
        if (playbackState === 'playing' || playbackState === 'buffering') {
            stopAudio();
            playbackSessionRef.current++;
            setTimeout(() => {
                const sessionId = ++playbackSessionRef.current;
                runTrackSequence(trackIndex === -1 ? -1 : trackIndex, sessionId);
            }, 100);
        }
    };

    const preloadScript = (lessonMeta: any) => {
        if (!lessonMeta) return null;
        return fetchLectureData(lessonMeta);
    };

    const preloadAudio = (text: string, voice: string) => {
        const ctx = getSharedAudioContext();
        return synthesizeSpeech(text, voice, ctx);
    };

    const playAudioBuffer = (buffer: AudioBuffer, sessionId: number): Promise<void> => {
        return new Promise(async (resolve) => {
            if (!mountedRef.current || !isActiveRef.current || sessionId !== playbackSessionRef.current) {
                resolve();
                return;
            }

            const ctx = getSharedAudioContext();
            
            // CRITICAL FIX: Ensure Context is running. Mobile browsers suspend it aggressively.
            if (ctx.state === 'suspended') {
                try { await ctx.resume(); } catch(e) { console.warn("Resume failed", e); }
            }

            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            sourceRef.current = source;

            source.onended = () => {
                sourceRef.current = null;
                resolve();
            };

            source.start(0);
        });
    };

    const playSystemAudio = (text: string, voiceName: string): Promise<void> => {
        return new Promise((resolve) => {
            if (!mountedRef.current || !isActiveRef.current) { resolve(); return; }
            
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            const voices = window.speechSynthesis.getVoices();
            const v = voices.find(v => v.name.includes(voiceName)) || 
                      voices.find(v => v.lang.startsWith('en'));
            
            if (v) utterance.voice = v;
            utterance.rate = 1.1; 
            
            utterance.onend = () => {
                resolve();
            };
            
            utterance.onerror = (e) => {
                resolve();
            };

            window.speechSynthesis.speak(utterance);
        });
    };

    const runTrackSequence = async (startIndex: number, sessionId: number) => {
        setPlaybackState('playing');

        // Check keys validity at start of playback
        const hasGemini = !!(localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY);
        const hasOpenAI = !!(localStorage.getItem('openai_api_key') || OPENAI_API_KEY || process.env.OPENAI_API_KEY);
        
        if (providerRef.current === 'gemini' && !hasGemini) {
             setProvider('system'); providerRef.current = 'system';
        }
        if (providerRef.current === 'openai' && !hasOpenAI) {
             setProvider('system'); providerRef.current = 'system';
        }

        let currentIndex = startIndex;

        while (mountedRef.current && isActiveRef.current && sessionId === playbackSessionRef.current) {
            try {
                setTrackIndex(currentIndex); 
                
                let textParts: {speaker: string, text: string, voice: string}[] = [];
                
                // Determine Voice Names based on Provider
                let hostVoice = channel.voiceName || 'Puck';
                let studentVoice = 'Zephyr';

                if (providerRef.current === 'openai') {
                    hostVoice = 'Alloy';
                    studentVoice = 'Echo';
                }

                if (currentIndex === -1) {
                    // INTRO
                    const introText = channel.welcomeMessage || channel.description || `Welcome to ${channel.title}.`;
                    if (transcript?.text !== introText) setTranscript({ speaker: 'Host', text: introText });
                    
                    setStatusMessage("Intro...");
                    textParts = [{
                        speaker: 'Host',
                        text: introText,
                        voice: hostVoice
                    }];

                    if (flatCurriculum.length > 0) {
                        preloadedScriptRef.current = preloadScript(flatCurriculum[0]);
                    }

                } else {
                    // LESSON
                    if (currentIndex >= flatCurriculum.length) {
                        setStatusMessage("Finished");
                        setPlaybackState('idle');
                        if (onChannelFinish) onChannelFinish();
                        break;
                    }

                    const lessonMeta = flatCurriculum[currentIndex];
                    let lecture = null;
                    
                    if (preloadedScriptRef.current) {
                        setStatusMessage(`Loading ${lessonMeta.title.substring(0,15)}...`);
                        lecture = await preloadedScriptRef.current;
                        preloadedScriptRef.current = null;
                    } else {
                        setStatusMessage(`Generating: ${lessonMeta.title.substring(0, 20)}...`);
                        setPlaybackState('buffering');
                        lecture = await fetchLectureData(lessonMeta);
                    }

                    if (!lecture || !lecture.sections || lecture.sections.length === 0) {
                        setStatusMessage("Skipping...");
                        await new Promise(r => setTimeout(r, 2000));
                        currentIndex++;
                        continue;
                    }
                    
                    setPlaybackState('playing');
                    setStatusMessage("Playing");

                    textParts = lecture.sections.map((s: any) => ({
                        speaker: s.speaker === 'Teacher' ? lecture.professorName : lecture.studentName,
                        text: s.text,
                        voice: s.speaker === 'Teacher' ? hostVoice : studentVoice
                    }));

                    if (currentIndex + 1 < flatCurriculum.length) {
                        preloadedScriptRef.current = preloadScript(flatCurriculum[currentIndex + 1]);
                    }
                }

                // PLAY PARTS
                for (let i = 0; i < textParts.length; i++) {
                    if (!mountedRef.current || !isActiveRef.current || sessionId !== playbackSessionRef.current) return;

                    const part = textParts[i];
                    setTranscript({ speaker: part.speaker, text: part.text });
                    
                    const currentMode = providerRef.current;

                    if (currentMode === 'system') {
                        await playSystemAudio(part.text, part.voice);
                    } else {
                        let audioResult = null;
                        
                        if (i === 0 && preloadedAudioRef.current) {
                            audioResult = await preloadedAudioRef.current;
                            preloadedAudioRef.current = null;
                        } else {
                            const bufferTimer = setTimeout(() => setPlaybackState('buffering'), 100);
                            audioResult = await preloadAudio(part.text, part.voice);
                            clearTimeout(bufferTimer);
                            setPlaybackState('playing');
                        }

                        if (i + 1 < textParts.length) {
                            const nextPart = textParts[i+1];
                            preloadedAudioRef.current = preloadAudio(nextPart.text, nextPart.voice);
                        } else {
                            preloadedAudioRef.current = null;
                        }

                        if (audioResult && audioResult.buffer) {
                            await playAudioBuffer(audioResult.buffer, sessionId);
                        } else {
                            // Check for Quota Error or Network
                            if (audioResult && (audioResult.errorType === 'quota' || audioResult.errorType === 'auth')) {
                                setStatusMessage(audioResult.errorType === 'quota' ? "Limit Reached" : "Auth Error");
                                setProvider('system'); 
                                providerRef.current = 'system';
                                await new Promise(r => setTimeout(r, 1000));
                            } else {
                                console.warn("Audio failed, switching to System Voice fallback");
                            }
                            await playSystemAudio(part.text, part.voice);
                        }
                    }
                    
                    await new Promise(r => setTimeout(r, 200));
                }

                currentIndex++;
            } catch (e: any) {
                console.error("Playback Loop Error", e);
                setStatusMessage("Error");
                setPlaybackState('error');
                break; // Break loop to prevent infinite crash loops
            }
        }
    };

    const fetchLectureData = async (meta: any) => {
        if (OFFLINE_LECTURES[meta.title]) return OFFLINE_LECTURES[meta.title];
        if (SPOTLIGHT_DATA[channel.id]?.lectures?.[meta.title]) return SPOTLIGHT_DATA[channel.id].lectures[meta.title];

        const cacheKey = `lecture_${channel.id}_${meta.id}_en`;
        let data = await getCachedLectureScript(cacheKey);
        
        if (!data) {
            // Need Gemini Key for text generation regardless of audio provider
            const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY;
            if (apiKey) {
                data = await generateLectureScript(meta.title, `Podcast: ${channel.title}. ${channel.description}`, 'en');
                if (data) await cacheLectureScript(cacheKey, data);
            }
        }
        return data;
    };

    return (
        <div className="h-full w-full snap-start relative flex flex-col justify-center bg-slate-900 border-b border-slate-800">
            <div className="absolute inset-0">
                <img 
                    src={channel.imageUrl} 
                    alt={channel.title} 
                    className="w-full h-full object-cover opacity-60"
                    loading={isActive ? "eager" : "lazy"}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/90"></div>
                
                {/* Mode Toggle & Status */}
                <div className="absolute top-20 right-4 z-30 flex flex-col items-end gap-2">
                    <button 
                        onClick={toggleTtsMode}
                        className={`backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 border text-xs font-bold shadow-lg transition-all ${provider === 'openai' ? 'bg-emerald-900/60 border-emerald-500/50 text-emerald-300' : provider === 'gemini' ? 'bg-indigo-900/60 border-indigo-500/50 text-indigo-300' : 'bg-slate-800/60 border-slate-600 text-slate-300'}`}
                    >
                        {provider === 'openai' ? <Sparkles size={12} fill="currentColor"/> : provider === 'gemini' ? <Zap size={12} fill="currentColor"/> : <Radio size={12} />}
                        <span>{provider === 'openai' ? 'OpenAI' : provider === 'gemini' ? 'Gemini' : 'System'}</span>
                    </button>

                    {(playbackState === 'buffering' || statusMessage) && (
                        <div className={`backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 border shadow-lg bg-black/60 border-white/10`}>
                            {playbackState === 'buffering' ? <Loader2 size={12} className="animate-spin text-indigo-400" /> : <Music size={12} className="text-slate-400" />}
                            <span className="text-[10px] font-bold text-white uppercase tracking-wider">{statusMessage || "Active"}</span>
                        </div>
                    )}
                </div>

                {transcript && (
                    <div className="absolute top-1/2 left-4 right-16 -translate-y-1/2 pointer-events-none z-10">
                        <div className="bg-black/40 backdrop-blur-sm p-6 rounded-3xl border-l-4 border-indigo-500/50 shadow-2xl animate-fade-in-up">
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${transcript.speaker === 'Host' ? 'text-emerald-400' : 'text-indigo-400'}`}>
                                    {transcript.speaker}
                                </span>
                            </div>
                            <p className="text-xl md:text-2xl text-white font-medium leading-relaxed drop-shadow-md font-sans">
                                "{transcript.text}"
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <div className="absolute right-2 bottom-40 flex flex-col items-center gap-6 z-30">
                <div className="relative mb-2 cursor-pointer" onClick={(e) => { e.stopPropagation(); onProfileClick(e, channel); }}>
                    <img 
                        src={channel.imageUrl} 
                        className={`w-12 h-12 rounded-full border-2 object-cover ${isActive && playbackState === 'playing' ? 'animate-spin-slow' : ''}`}
                        alt="Creator"
                        style={{animationPlayState: playbackState === 'playing' ? 'running' : 'paused'}}
                    />
                    {!isFollowed && channel.ownerId && (
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-red-500 rounded-full p-0.5 border border-white" onClick={(e) => onToggleFollow(e, channel.id, channel.ownerId)}>
                            <Plus size={12} color="white" strokeWidth={4} />
                        </div>
                    )}
                </div>

                <button onClick={(e) => onToggleLike(e, channel.id)} className="flex flex-col items-center gap-1 group">
                    <div className={`p-2 rounded-full transition-transform active:scale-75 ${isLiked ? '' : 'bg-black/20 backdrop-blur-sm'}`}>
                        <Heart size={32} fill={isLiked ? "#ef4444" : "rgba(255,255,255,0.9)"} className={isLiked ? "text-red-500" : "text-white"} />
                    </div>
                    <span className="text-white text-xs font-bold shadow-black drop-shadow-md">{channel.likes}</span>
                </button>

                <button onClick={(e) => onComment(e, channel)} className="flex flex-col items-center gap-1">
                    <div className="p-2 rounded-full bg-black/20 backdrop-blur-sm transition-transform active:scale-75">
                        <MessageSquare size={32} fill="white" className="text-white" />
                    </div>
                    <span className="text-white text-xs font-bold shadow-black drop-shadow-md">{channel.comments?.length || 0}</span>
                </button>

                <button onClick={(e) => onShare(e, channel)} className="flex flex-col items-center gap-1">
                    <div className="p-2 rounded-full bg-black/20 backdrop-blur-sm transition-transform active:scale-75">
                        <Share2 size={32} fill="rgba(255,255,255,0.9)" className="text-white" />
                    </div>
                    <span className="text-white text-xs font-bold shadow-black drop-shadow-md">Share</span>
                </button>
            </div>

            <div className="absolute left-0 bottom-0 w-full p-4 pb-6 bg-gradient-to-t from-black via-black/80 to-transparent z-30 pr-20">
                <div 
                    onClick={(e) => { e.stopPropagation(); onChannelClick(channel.id); }}
                    className="inline-flex items-center gap-2 mb-3 bg-slate-800/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700 cursor-pointer active:scale-95 transition-transform"
                >
                    {trackIndex === -1 ? (
                        <span className="text-[10px] font-bold text-emerald-400 uppercase flex items-center gap-1">
                            <AlignLeft size={10} /> Introduction
                        </span>
                    ) : (
                        <span className="text-[10px] font-bold text-indigo-400 uppercase flex items-center gap-1">
                            <GraduationCap size={10} /> Lesson {trackIndex + 1}/{totalLessons}
                        </span>
                    )}
                    <ChevronRight size={12} className="text-slate-500" />
                </div>

                <div className="flex items-center gap-3 mb-2">
                    <button 
                        onClick={handleTogglePlay}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg ${playbackState === 'playing' ? 'bg-slate-800 text-indigo-400 border border-slate-600' : 'bg-white text-black hover:scale-105'}`}
                    >
                        {playbackState === 'buffering' ? (
                            <Loader2 size={20} className="animate-spin" />
                        ) : playbackState === 'playing' ? (
                            <Pause size={20} fill="currentColor" />
                        ) : (
                            <Play size={20} fill="currentColor" className="ml-0.5" />
                        )}
                    </button>

                    {(playbackState === 'playing' || playbackState === 'buffering') && (
                        <button 
                            onClick={handleStop}
                            className="w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg bg-slate-800 text-red-400 border border-slate-600 hover:scale-105 animate-fade-in"
                        >
                            <Square size={16} fill="currentColor" />
                        </button>
                    )}
                    
                    <div onClick={(e) => { e.stopPropagation(); onChannelClick(channel.id); }}>
                        <div className="flex items-center gap-1.5 text-white font-bold text-lg drop-shadow-md cursor-pointer hover:underline">
                            <User size={14} className="text-indigo-400" />
                            <span>@{channel.author}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Host</p>
                    </div>
                </div>
                
                <p className="text-white/80 text-sm mb-3 line-clamp-2 leading-relaxed drop-shadow-sm font-light">
                    {channel.description}
                </p>

                <div className="flex items-center gap-2 text-white/60 text-xs font-medium overflow-hidden whitespace-nowrap">
                    <Music size={12} className={playbackState === 'playing' ? "animate-pulse text-emerald-400" : ""} />
                    <div className="flex gap-4 animate-marquee">
                        <span>Voice: {channel.voiceName} ({provider === 'openai' ? 'OpenAI' : provider === 'gemini' ? 'Gemini' : 'System'})</span>
                        <span>•</span>
                        {channel.tags.map((t: string) => <span key={t}>#{t}</span>)}
                    </div>
                </div>
            </div>
        </div>
    );
};

export const PodcastFeed: React.FC<PodcastFeedProps> = ({ 
  channels, onChannelClick, onStartLiveSession, userProfile, globalVoice, onRefresh, onMessageCreator,
  t, currentUser, setChannelToEdit, setIsSettingsModalOpen, onCommentClick, handleVote, filterMode = 'foryou'
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  
  // NEW: Detect Desktop vs Mobile to prevent background playback from hidden mobile components
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : true);

  useEffect(() => {
      const handleResize = () => setIsDesktop(window.innerWidth >= 768);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Interaction States
  const [likedChannels, setLikedChannels] = useState<Set<string>>(new Set());
  const [bookmarkedChannels, setBookmarkedChannels] = useState<Set<string>>(new Set());
  const [followedChannels, setFollowedChannels] = useState<Set<string>>(new Set());
  
  // Creator Profile Modal
  const [viewingCreator, setViewingCreator] = useState<Channel | null>(null);

  useEffect(() => {
      if (userProfile?.likedChannelIds) setLikedChannels(new Set(userProfile.likedChannelIds));
      if (userProfile?.following) {
          const followedOwners = new Set(userProfile.following);
          const channelIds = channels.filter(c => c.ownerId && followedOwners.has(c.ownerId)).map(c => c.id);
          setFollowedChannels(new Set(channelIds));
      }
  }, [userProfile, channels]);

  // Ranking Logic
  const recommendedChannels = useMemo(() => {
      if (filterMode === 'mine') {
          return channels.filter(c => currentUser && c.ownerId === currentUser.uid).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      }

      if (filterMode === 'following') {
          return [...channels].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      }

      // Universal Scoring
      const scored = channels.map(ch => {
          let score = 0;
          
          // 1. Ownership Boost (Highest Priority)
          // Ensure newly created channels by the user are ALWAYS top
          if (currentUser && ch.ownerId === currentUser.uid) {
              score += 100000;
              // Secondary sort for user's own channels: newest first
              if (ch.createdAt) score += ch.createdAt / 1000000000000; 
          }

          // 2. Interest Matching
          if (userProfile?.interests && userProfile.interests.length > 0) {
              if (userProfile.interests.some(i => ch.tags.includes(i))) score += 20;
              if (userProfile.interests.some(i => ch.title.toLowerCase().includes(i.toLowerCase()))) score += 10;
          }

          // 3. Recency Boost (For everyone)
          // Helps finding new content generally
          if (ch.createdAt) {
              const ageHours = (Date.now() - ch.createdAt) / (1000 * 60 * 60);
              if (ageHours < 1) score += 50; // Brand new (last hour)
              else if (ageHours < 24) score += 10; // Last day
          }
          
          // 4. Popularity Baseline
          score += (ch.likes / 100); 
          
          return { channel: ch, score };
      });
      
      // Sort desc by score
      scored.sort((a, b) => b.score - a.score);
      
      return scored.map(s => s.channel);
  }, [channels, userProfile, filterMode, currentUser]);

  // Initial Auto-Play (First item) - ONLY ON MOBILE
  useEffect(() => {
      if (!isDesktop && recommendedChannels.length > 0 && !activeChannelId) {
          setActiveChannelId(recommendedChannels[0].id);
      }
  }, [recommendedChannels, isDesktop]);

  // Intersection Observer for Scroll Snap (Mobile Only)
  useEffect(() => {
      const container = containerRef.current;
      if (!container || isDesktop) return;

      const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
              if (entry.isIntersecting) {
                  const id = entry.target.getAttribute('data-id');
                  if (id) setActiveChannelId(id);
              }
          });
      }, {
          root: container,
          // CRITICAL: Lower threshold to ensure playback triggers even if browser bars cover part of the screen
          threshold: 0.5
      });

      const cards = container.querySelectorAll('.feed-card');
      cards.forEach(c => observer.observe(c));

      return () => observer.disconnect();
  }, [recommendedChannels, isDesktop]);

  // Interaction Handlers
  const toggleLike = (e: React.MouseEvent, channelId: string) => {
      e.stopPropagation();
      if (!currentUser) return alert("Please sign in.");
      const newSet = new Set(likedChannels);
      if (newSet.has(channelId)) { newSet.delete(channelId); handleVote?.(channelId, 'dislike', e); } 
      else { newSet.add(channelId); handleVote?.(channelId, 'like', e); }
      setLikedChannels(newSet);
  };

  const toggleBookmark = (e: React.MouseEvent, channelId: string) => {
      e.stopPropagation();
      const newSet = new Set(bookmarkedChannels);
      if (newSet.has(channelId)) newSet.delete(channelId); else newSet.add(channelId);
      setBookmarkedChannels(newSet);
  };

  const toggleFollow = async (e: React.MouseEvent, channelId: string, ownerId?: string) => {
      e.stopPropagation();
      if (!currentUser) return alert("Sign in to follow.");
      if (!ownerId) return alert("No owner profile.");
      const newSet = new Set(followedChannels);
      const isFollowing = newSet.has(channelId);
      if (isFollowing) {
          newSet.delete(channelId); setFollowedChannels(newSet);
          try { await unfollowUser(currentUser.uid, ownerId); } catch(err) { setFollowedChannels(new Set(newSet.add(channelId))); }
      } else {
          newSet.add(channelId); setFollowedChannels(newSet);
          try { await followUser(currentUser.uid, ownerId); } catch(err) { setFollowedChannels(prev => { prev.delete(channelId); return new Set(prev); }); }
      }
  };

  const handleShare = async (e: React.MouseEvent, channel: Channel) => {
      e.stopPropagation();
      if (navigator.share) {
          try { await navigator.share({ title: channel.title, text: channel.description, url: window.location.href }); } catch (err) {}
      } else {
          alert("Link copied!");
      }
  };

  const handleComment = (e: React.MouseEvent, channel: Channel) => {
      e.stopPropagation();
      if(onCommentClick) onCommentClick(channel);
  };

  // Programmatic Scroll for Auto-Play Chain
  const handleScrollToNext = (currentChannelId: string) => {
      const idx = recommendedChannels.findIndex(c => c.id === currentChannelId);
      if (idx !== -1 && idx < recommendedChannels.length - 1) {
          const nextId = recommendedChannels[idx + 1].id;
          const nextEl = document.querySelector(`[data-id="${nextId}"]`);
          if (nextEl) {
              nextEl.scrollIntoView({ behavior: 'smooth' });
          }
      }
  };

  // Conditional Rendering logic to avoid invisible auto-play
  if (isDesktop) {
      return (
        <>
        <div className="h-full overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-800">
            <div className="max-w-7xl mx-auto">
                <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                    <span className="bg-indigo-600 w-2 h-8 rounded-full"></span> Explore Podcasts
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {recommendedChannels.map(channel => (
                        <ChannelCard
                            key={channel.id}
                            channel={channel}
                            handleChannelClick={onChannelClick}
                            handleVote={handleVote || (() => {})}
                            currentUser={currentUser}
                            setChannelToEdit={setChannelToEdit || (() => {})}
                            setIsSettingsModalOpen={setIsSettingsModalOpen || (() => {})}
                            globalVoice={globalVoice}
                            t={t || { host: 'Host' }}
                            onCommentClick={onCommentClick || (() => {})}
                            isLiked={userProfile?.likedChannelIds?.includes(channel.id)}
                            onCreatorClick={(e) => { e.stopPropagation(); setViewingCreator(channel); }}
                        />
                    ))}
                </div>
            </div>
        </div>
        {viewingCreator && (
            <CreatorProfileModal 
                isOpen={true}
                onClose={() => setViewingCreator(null)}
                channel={viewingCreator}
                onMessage={() => {
                    if (onMessageCreator && viewingCreator.ownerId) onMessageCreator(viewingCreator.ownerId, viewingCreator.author);
                    setViewingCreator(null);
                }}
                onChannelClick={(id) => { setViewingCreator(null); onChannelClick(id); }}
                currentUser={currentUser}
            />
        )}
        </>
      );
  }

  return (
    <>
    <div 
        ref={containerRef}
        className="h-[calc(100vh-64px)] w-full bg-black overflow-y-scroll snap-y snap-mandatory scroll-smooth no-scrollbar relative"
    >
        {isRefreshing && (
             <div className="w-full absolute top-16 left-0 flex justify-center pointer-events-none z-20">
                 <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-full text-white text-xs font-bold flex items-center gap-2 border border-white/10">
                     <Loader2 size={14} className="animate-spin" /> Refreshing...
                 </div>
             </div>
        )}

        {recommendedChannels.length === 0 ? (
             <div className="h-full w-full flex flex-col items-center justify-center p-8 text-center space-y-6">
                 <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center">
                     <Heart size={32} className="text-slate-600" />
                 </div>
                 <div>
                     <h3 className="text-xl font-bold text-white mb-2">No Podcasts Here Yet</h3>
                     <p className="text-slate-400 text-sm max-w-xs mx-auto">
                         {filterMode === 'following' 
                            ? "Follow creators or like channels to build your personal feed."
                            : filterMode === 'mine'
                            ? "You haven't created any podcasts yet."
                            : "We couldn't find any podcasts matching your criteria."}
                     </p>
                 </div>
                 {filterMode === 'following' && (
                     <button 
                        onClick={onRefresh} 
                        className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-full transition-colors border border-slate-700"
                     >
                        Discover Content
                     </button>
                 )}
             </div>
        ) : (
            recommendedChannels.map((channel) => (
                <div key={channel.id} data-id={channel.id} className="feed-card h-full w-full snap-start">
                    <MobileFeedCard 
                        channel={channel}
                        isActive={activeChannelId === channel.id}
                        isLiked={likedChannels.has(channel.id)}
                        isBookmarked={bookmarkedChannels.has(channel.id)}
                        isFollowed={followedChannels.has(channel.id) || (userProfile?.following?.includes(channel.ownerId || ''))}
                        onToggleLike={toggleLike}
                        onToggleBookmark={toggleBookmark}
                        onToggleFollow={toggleFollow}
                        onShare={handleShare}
                        onComment={handleComment}
                        onProfileClick={(e: any, ch: any) => { e.stopPropagation(); setViewingCreator(ch); }}
                        onChannelClick={onChannelClick}
                        onChannelFinish={() => handleScrollToNext(channel.id)}
                    />
                </div>
            ))
        )}
    </div>

    {viewingCreator && (
        <CreatorProfileModal 
            isOpen={true}
            onClose={() => setViewingCreator(null)}
            channel={viewingCreator}
            onMessage={() => {
                if (onMessageCreator && viewingCreator.ownerId) onMessageCreator(viewingCreator.ownerId, viewingCreator.author);
                setViewingCreator(null);
            }}
            onChannelClick={(id) => { setViewingCreator(null); onChannelClick(id); }}
            currentUser={currentUser}
        />
    )}
    </>
  );
};
