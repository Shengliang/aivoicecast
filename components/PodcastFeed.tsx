
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Channel, UserProfile, GeneratedLecture } from '../types';
import { Play, MessageSquare, Heart, Share2, Bookmark, Music, Plus, Pause, Loader2, Volume2, VolumeX, GraduationCap, ChevronRight, Mic, AlignLeft, BarChart3, User, AlertCircle } from 'lucide-react';
import { ChannelCard } from './ChannelCard';
import { CreatorProfileModal } from './CreatorProfileModal';
import { followUser, unfollowUser } from '../services/firestoreService';
import { generateLectureScript } from '../services/lectureGenerator';
import { synthesizeSpeech } from '../services/tts';
import { getCachedLectureScript, cacheLectureScript } from '../utils/db';
import { GEMINI_API_KEY } from '../services/private_keys';

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
  
  // New Prop for filtering logic
  filterMode?: 'foryou' | 'following';
}

// --- Singleton Audio Context ---
// Using a global context ensures that once the user interacts with the page once,
// all subsequent cards can auto-play without needing new gestures.
let sharedAudioContext: AudioContext | null = null;

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
    onChannelFinish // Callback to trigger scroll to next
}: any) => {
    // UI State
    const [playbackState, setPlaybackState] = useState<'idle' | 'buffering' | 'playing' | 'error'>('idle');
    const [statusMessage, setStatusMessage] = useState('');
    const [transcript, setTranscript] = useState<{speaker: string, text: string} | null>(null);
    
    // Logic State
    const [trackIndex, setTrackIndex] = useState(-1); // -1 = Intro, 0+ = Lessons
    
    // Refs
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const mountedRef = useRef(true);
    const playbackSessionRef = useRef(0); // Incremented to invalidate old loops
    
    // Buffering Refs
    const preloadedScriptRef = useRef<Promise<GeneratedLecture | null> | null>(null);
    const preloadedAudioRef = useRef<Promise<any> | null>(null);

    // Data Helpers
    const flatCurriculum = useMemo(() => {
        if (!channel.chapters) return [];
        return channel.chapters.flatMap((ch: any, cIdx: number) => 
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
            }, 600); // Slight delay for smooth scrolling
            return () => clearTimeout(timer);
        } else {
            // Stop everything when swiping away
            stopAudio();
            setPlaybackState('idle');
            playbackSessionRef.current++; // Invalidate any running loops
            preloadedScriptRef.current = null;
            preloadedAudioRef.current = null;
        }
    }, [isActive, channel.id]);

    const stopAudio = () => {
        if (sourceRef.current) {
            try { sourceRef.current.stop(); } catch(e) {}
            sourceRef.current = null;
        }
        window.speechSynthesis.cancel();
    };

    const attemptAutoPlay = async () => {
        // If we are already playing (e.g. fast swipe back and forth), don't restart
        if (playbackState === 'playing' || playbackState === 'buffering') return;

        const ctx = getSharedAudioContext();
        
        // Attempt to resume context if suspended (works if user interacted with document before)
        if (ctx.state === 'suspended') {
            try { await ctx.resume(); } catch(e) {}
        }

        // Only auto-play if context is running. If locked, wait for user click.
        if (ctx.state === 'running') {
            const sessionId = ++playbackSessionRef.current;
            runTrackSequence(-1, sessionId);
        }
    };

    const handleTogglePlay = async (e: React.MouseEvent) => {
        e.stopPropagation();
        
        if (playbackState === 'playing' || playbackState === 'buffering') {
            stopAudio();
            setPlaybackState('idle');
            setStatusMessage("Paused");
            return;
        }

        // Manual Play = Force Unlock
        const ctx = getSharedAudioContext();
        if (ctx.state === 'suspended') {
            try { 
                await ctx.resume(); 
                // Play silent buffer to force unlock logic on iOS
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
        // Resume from current track index. If finished, restart.
        // Important: trackIndex might be > totalLessons if it finished. Reset to -1.
        const start = (trackIndex >= totalLessons) ? -1 : trackIndex;
        runTrackSequence(start, sessionId);
    };

    // Helper: Trigger fetching of a lecture script without waiting
    const preloadScript = (lessonMeta: any) => {
        if (!lessonMeta) return null;
        return fetchLectureData(lessonMeta);
    };

    // Helper: Trigger fetching of audio for a text segment without waiting
    const preloadAudio = (text: string, voice: string) => {
        const ctx = getSharedAudioContext();
        // synthesizeSpeech handles caching internally
        return synthesizeSpeech(text, voice, ctx);
    };

    const runTrackSequence = async (startIndex: number, sessionId: number) => {
        setPlaybackState('playing');

        // Check API Key
        const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY;
        if (!apiKey) {
            setTranscript({ speaker: 'System', text: "API Key Missing. Please set it in Settings to hear audio." });
            setPlaybackState('error');
            setStatusMessage("No API Key");
            return;
        }

        let currentIndex = startIndex;

        while (mountedRef.current && isActive && sessionId === playbackSessionRef.current) {
            setTrackIndex(currentIndex); 
            
            let textParts: {speaker: string, text: string, voice: string}[] = [];
            
            // --- STEP 1: PREPARATION ---
            if (currentIndex === -1) {
                // INTRO
                const introText = channel.welcomeMessage || channel.description || `Welcome to ${channel.title}.`;
                if (transcript?.text !== introText) setTranscript({ speaker: 'Host', text: introText });
                
                setStatusMessage("Intro...");
                textParts = [{
                    speaker: 'Host',
                    text: introText,
                    voice: channel.voiceName || 'Puck'
                }];

                // PRE-FETCH STRATEGY: 
                // While Intro plays, start fetching the Script for Lesson 1 (Index 0)
                if (flatCurriculum.length > 0) {
                    console.log("Pre-fetching script for Lesson 1...");
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
                
                // --- STEP 2: GET SCRIPT (Robustly) ---
                let lecture = null;
                
                // Check if we pre-fetched it
                if (preloadedScriptRef.current) {
                    setStatusMessage(`Loading ${lessonMeta.title.substring(0,15)}...`);
                    lecture = await preloadedScriptRef.current;
                    preloadedScriptRef.current = null; // Clear usage
                } else {
                    setStatusMessage(`Generating: ${lessonMeta.title.substring(0, 20)}...`);
                    setPlaybackState('buffering');
                    lecture = await fetchLectureData(lessonMeta);
                }

                // Retry Logic for Script Generation
                if (!lecture || !lecture.sections || lecture.sections.length === 0) {
                    console.warn("Script generation failed, retrying once...");
                    setStatusMessage("Retrying generation...");
                    await new Promise(r => setTimeout(r, 1000));
                    lecture = await fetchLectureData(lessonMeta); // Retry hard
                    
                    if (!lecture) {
                        console.error("Lecture Gen Failed completely.");
                        setStatusMessage("Error (Skipping)");
                        await new Promise(r => setTimeout(r, 2000));
                        currentIndex++;
                        continue;
                    }
                }
                
                setPlaybackState('playing');
                setStatusMessage("Playing");

                // Prepare Segments
                const hostVoice = channel.voiceName || 'Puck';
                textParts = lecture.sections.map((s: any) => ({
                    speaker: s.speaker === 'Teacher' ? lecture.professorName : lecture.studentName,
                    text: s.text,
                    voice: s.speaker === 'Teacher' ? hostVoice : 'Puck'
                }));

                // Pre-fetch Script for NEXT Lesson (Index + 1)
                if (currentIndex + 1 < flatCurriculum.length) {
                    preloadedScriptRef.current = preloadScript(flatCurriculum[currentIndex + 1]);
                }
            }

            // --- STEP 3: PLAY PARTS (With Audio Buffering) ---
            for (let i = 0; i < textParts.length; i++) {
                if (!mountedRef.current || !isActive || sessionId !== playbackSessionRef.current) return;

                const part = textParts[i];
                setTranscript({ speaker: part.speaker, text: part.text });
                
                // 1. Get Audio for Current Part
                let audioResult = null;
                
                // Did we prefetch this specific segment? (Only applicable if we implement granular prefetch)
                // For simplified robustness: If it's the first segment of a lecture, check if we started it
                // For now, we will do Just-In-Time buffering loop:
                
                if (i === 0 && preloadedAudioRef.current) {
                    // Use preloaded audio for first segment
                    audioResult = await preloadedAudioRef.current;
                    preloadedAudioRef.current = null;
                } else {
                    // Fetch now
                    if (playbackState !== 'playing') setPlaybackState('buffering');
                    audioResult = await preloadAudio(part.text, part.voice);
                }

                // 2. TRIGGER PRE-FETCH FOR NEXT PART (Pipeline)
                if (i + 1 < textParts.length) {
                    const nextPart = textParts[i+1];
                    preloadedAudioRef.current = preloadAudio(nextPart.text, nextPart.voice);
                } else {
                    // End of this lesson. Could pre-fetch first audio of NEXT lesson here if we had the script.
                    // But we likely don't have the next script parsed yet. 
                    // The 'preloadedScriptRef' handles the text generation latency.
                    preloadedAudioRef.current = null;
                }

                // 3. Play Current Audio
                if (audioResult && audioResult.buffer) {
                    setPlaybackState('playing'); // Ensure status is playing
                    await playAudioBuffer(audioResult.buffer, sessionId);
                } else {
                    console.warn("TTS Gen failed for part", i);
                    setStatusMessage("Audio Error (Retrying...)");
                    await new Promise(r => setTimeout(r, 1000));
                    // Simple retry for audio
                    const retryResult = await preloadAudio(part.text, part.voice);
                    if (retryResult && retryResult.buffer) {
                        await playAudioBuffer(retryResult.buffer, sessionId);
                    } else {
                        // Skip segment only if double fail
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
                
                // Small gap between speakers
                await new Promise(r => setTimeout(r, 200));
            }

            // 3. Increment to next lesson
            currentIndex++;
        }
    };

    const playAudioBuffer = (buffer: AudioBuffer, sessionId: number): Promise<void> => {
        return new Promise((resolve) => {
            if (!mountedRef.current || !isActive || sessionId !== playbackSessionRef.current) { resolve(); return; }
            
            const ctx = getSharedAudioContext();
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            
            source.onended = () => {
                sourceRef.current = null;
                resolve();
            };
            
            sourceRef.current = source;
            source.start(0);
        });
    };

    const fetchLectureData = async (meta: any) => {
        const cacheKey = `lecture_${channel.id}_${meta.id}_en`;
        let data = await getCachedLectureScript(cacheKey);
        if (!data) {
            data = await generateLectureScript(meta.title, `Podcast: ${channel.title}. ${channel.description}`, 'en');
            if (data) await cacheLectureScript(cacheKey, data);
        }
        return data;
    };

    return (
        <div className="h-full w-full snap-start relative flex flex-col justify-center bg-slate-900 border-b border-slate-800">
            
            {/* 1. Visual Background */}
            <div className="absolute inset-0">
                <img 
                    src={channel.imageUrl} 
                    alt={channel.title} 
                    className="w-full h-full object-cover opacity-60"
                    loading={isActive ? "eager" : "lazy"}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/90"></div>
                
                {/* Status Overlay (Loading / Error) */}
                {(playbackState === 'buffering' || statusMessage) && (
                    <div className="absolute top-20 left-0 w-full flex justify-center pointer-events-none z-20">
                        <div className={`backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2 border shadow-lg ${playbackState === 'error' ? 'bg-red-900/60 border-red-500/50' : 'bg-black/60 border-white/10'}`}>
                            {playbackState === 'buffering' ? <Loader2 size={14} className="animate-spin text-indigo-400" /> : 
                             playbackState === 'error' ? <AlertCircle size={14} className="text-red-400"/> :
                             <Music size={14} className="text-emerald-400" />}
                            <span className="text-xs font-bold text-white uppercase tracking-wider">{statusMessage || "Active"}</span>
                        </div>
                    </div>
                )}

                {/* Transcript */}
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

            {/* 2. Sidebar Actions (Right) */}
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

            {/* 3. Bottom Info & Play Controls */}
            <div className="absolute left-0 bottom-0 w-full p-4 pb-6 bg-gradient-to-t from-black via-black/80 to-transparent z-30 pr-20">
                
                {/* Introduction Badge (Clickable) */}
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

                {/* Host Line with Play Button */}
                <div className="flex items-center gap-3 mb-2">
                    <button 
                        onClick={handleTogglePlay}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg ${playbackState === 'playing' ? 'bg-slate-800 text-red-400 border border-slate-600' : 'bg-white text-black hover:scale-105'}`}
                    >
                        {playbackState === 'buffering' ? (
                            <Loader2 size={20} className="animate-spin" />
                        ) : playbackState === 'playing' ? (
                            <Pause size={20} fill="currentColor" />
                        ) : (
                            <Play size={20} fill="currentColor" className="ml-0.5" />
                        )}
                    </button>
                    
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
                        <span>Voice: {channel.voiceName}</span>
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
      if (filterMode === 'following') {
          return [...channels].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      }
      if (!userProfile?.interests || userProfile.interests.length === 0) {
          const sorted = [...channels].sort((a, b) => b.likes - a.likes);
          return sorted;
      }
      const scored = channels.map(ch => {
          let score = 0;
          if (userProfile.interests?.some(i => ch.tags.includes(i))) score += 10;
          if (userProfile.interests?.some(i => ch.title.toLowerCase().includes(i.toLowerCase()))) score += 5;
          score += (ch.likes / 100); 
          return { channel: ch, score };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored.map(s => s.channel);
  }, [channels, userProfile, filterMode]);

  // Initial Auto-Play (First item)
  useEffect(() => {
      if (recommendedChannels.length > 0 && !activeChannelId) {
          setActiveChannelId(recommendedChannels[0].id);
      }
  }, [recommendedChannels]);

  // Intersection Observer for Scroll Snap
  useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
              // Increased threshold to 0.8 (80% visible) to prevent quick swipes triggering change
              if (entry.isIntersecting) {
                  const id = entry.target.getAttribute('data-id');
                  if (id) setActiveChannelId(id);
              }
          });
      }, {
          root: container,
          threshold: 0.8 
      });

      const cards = container.querySelectorAll('.feed-card');
      cards.forEach(c => observer.observe(c));

      return () => observer.disconnect();
  }, [recommendedChannels]);

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

  return (
    <>
    {/* DESKTOP VIEW */}
    <div className="hidden md:block h-full overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-800">
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

    {/* MOBILE VIEW */}
    <div 
        ref={containerRef}
        className="md:hidden h-[calc(100vh-64px)] w-full bg-black overflow-y-scroll snap-y snap-mandatory scroll-smooth no-scrollbar relative"
    >
        {isRefreshing && (
             <div className="w-full absolute top-16 left-0 flex justify-center pointer-events-none z-20">
                 <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-full text-white text-xs font-bold flex items-center gap-2 border border-white/10">
                     <Loader2 size={14} className="animate-spin" /> Refreshing...
                 </div>
             </div>
        )}

        {recommendedChannels.map((channel) => (
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
        ))}
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
