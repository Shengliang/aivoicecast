
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Channel, UserProfile, GeneratedLecture } from '../types';
import { Play, MessageSquare, Heart, Share2, Bookmark, Music, Plus, Pause, Loader2, Volume2, VolumeX, GraduationCap, ChevronRight, Mic, AlignLeft, BarChart3 } from 'lucide-react';
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
    const [isPlaying, setIsPlaying] = useState(false);
    const [isAudioReady, setIsAudioReady] = useState(false); // False = Click to Play, True = Context Running
    const [loadingMessage, setLoadingMessage] = useState('');
    const [transcript, setTranscript] = useState<{speaker: string, text: string} | null>(null);
    
    // Logic State
    const [trackIndex, setTrackIndex] = useState(-1); // -1 = Intro, 0+ = Lessons
    
    // Refs
    const audioCtxRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const mountedRef = useRef(true);
    const playbackSessionRef = useRef(0); // Incremented to invalidate old loops

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

    // --- Main Control Loop ---
    useEffect(() => {
        if (isActive) {
            // 1. IMMEDIATE DISPLAY: Show summary/intro text immediately
            const introText = channel.welcomeMessage || channel.description || `Welcome to ${channel.title}.`;
            setTranscript({ speaker: 'Host', text: introText });
            
            // Reset for new card
            setTrackIndex(-1);
            
            // 2. Start Audio Sequence
            attemptAutoPlay();
        } else {
            // Stop everything when swiping away
            stopAudio();
            setIsPlaying(false);
            setIsAudioReady(false);
            // Invalidate session
            playbackSessionRef.current++;
        }
    }, [isActive, channel.id]);

    const stopAudio = () => {
        if (sourceRef.current) {
            try { sourceRef.current.stop(); } catch(e) {}
            sourceRef.current = null;
        }
    };

    const getAudioContext = () => {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
            audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        return audioCtxRef.current;
    };

    const attemptAutoPlay = async () => {
        const ctx = getAudioContext();
        
        // If already running (from previous card), we are good
        if (ctx.state === 'running') {
            setIsAudioReady(true);
            const sessionId = ++playbackSessionRef.current;
            runTrackSequence(-1, sessionId); 
            return;
        }

        // Try to resume if suspended (browsers block this without gesture)
        try {
            await ctx.resume();
        } catch (e) {
            // Likely blocked
        }

        if (ctx.state === 'running') {
            setIsAudioReady(true);
            const sessionId = ++playbackSessionRef.current;
            runTrackSequence(-1, sessionId); 
        } else {
            // BLOCKED: Show Play Button
            setIsAudioReady(false);
        }
    };

    const handleManualPlay = async (e: React.MouseEvent) => {
        e.stopPropagation();
        
        // 1. Setup new session
        const sessionId = ++playbackSessionRef.current;
        stopAudio();
        setIsPlaying(true);
        setLoadingMessage("Starting Audio...");
        
        // 2. Force unlock with a new context if needed or resume existing
        let ctx = audioCtxRef.current;
        if (!ctx || ctx.state === 'closed') {
            ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioCtxRef.current = ctx;
        }
        
        try {
            await ctx.resume();
            
            // Play silent sound to force-unlock iOS/Android audio stack
            const buffer = ctx.createBuffer(1, 1, 22050);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start(0);
        } catch (err) {
            console.error("Audio resume failed", err);
        }
        
        if (ctx.state === 'running') {
            setIsAudioReady(true);
            // Restart from current track or intro
            const start = trackIndex === -1 ? -1 : trackIndex;
            runTrackSequence(start, sessionId);
        } else {
            setIsPlaying(false);
            setLoadingMessage("");
            setIsAudioReady(false); // Should show play button again
        }
    };

    const runTrackSequence = async (startIndex: number, sessionId: number) => {
        setIsPlaying(true);

        // Check API Key
        const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY;
        if (!apiKey) {
            setTranscript({ speaker: 'System', text: "API Key Missing. Please set it in Settings to hear audio." });
            setIsPlaying(false);
            setLoadingMessage("");
            return;
        }

        let currentIndex = startIndex;

        while (mountedRef.current && isActive && sessionId === playbackSessionRef.current) {
            setTrackIndex(currentIndex); // Update UI
            
            // 1. Determine Content
            let textParts: {speaker: string, text: string, voice: string}[] = [];
            
            if (currentIndex === -1) {
                // INTRO
                const introText = channel.welcomeMessage || channel.description || `Welcome to ${channel.title}.`;
                if (transcript?.text !== introText) {
                    setTranscript({ speaker: 'Host', text: introText });
                }
                
                // Show loading for intro too so user knows it's working
                setLoadingMessage("Generating Intro...");
                
                textParts = [{
                    speaker: 'Host',
                    text: introText,
                    voice: channel.voiceName || 'Puck'
                }];
            } else {
                // LESSON
                if (currentIndex >= flatCurriculum.length) {
                    console.log("Channel Finished");
                    if (onChannelFinish) onChannelFinish();
                    break;
                }

                const lessonMeta = flatCurriculum[currentIndex];
                setLoadingMessage(`Loading: ${lessonMeta.title}`);
                
                // Fetch/Generate Script
                const lecture = await fetchLectureData(lessonMeta);
                if (!lecture || !lecture.sections) {
                    // Skip if failed
                    currentIndex++;
                    continue;
                }

                textParts = lecture.sections.map((s: any) => ({
                    speaker: s.speaker === 'Teacher' ? lecture.professorName : lecture.studentName,
                    text: s.text,
                    voice: s.speaker === 'Teacher' ? (channel.voiceName || 'Fenrir') : 'Puck'
                }));
            }

            // 2. Play Parts
            setLoadingMessage(''); // Clear loading text
            for (let i = 0; i < textParts.length; i++) {
                if (!mountedRef.current || !isActive || sessionId !== playbackSessionRef.current) {
                    return;
                }

                const part = textParts[i];
                // Update transcript for every new part
                setTranscript({ speaker: part.speaker, text: part.text });
                
                // Speak and Wait
                await playText(part.text, part.voice, sessionId);
                
                // Small gap between speakers
                await new Promise(r => setTimeout(r, 300));
            }

            // 3. Increment
            currentIndex++;
        }

        // Only turn off playing if we finished naturally and haven't started a new session
        if (sessionId === playbackSessionRef.current) {
            setIsPlaying(false);
        }
    };

    const playText = async (text: string, voice: string, sessionId: number): Promise<void> => {
        return new Promise(async (resolve) => {
            if (!mountedRef.current || !isActive || sessionId !== playbackSessionRef.current) { resolve(); return; }

            try {
                const ctx = getAudioContext();
                
                // Try resume one more time just in case
                if (ctx.state === 'suspended') {
                    try { await ctx.resume(); } catch(e) {}
                }

                if (ctx.state === 'suspended') {
                    setIsAudioReady(false); // Show Play Button again
                    resolve(); 
                    return;
                }

                const result = await synthesizeSpeech(text, voice, ctx);
                
                // Re-check session after async call
                if (sessionId !== playbackSessionRef.current) { resolve(); return; }

                if (result.buffer && mountedRef.current && isActive) {
                    const source = ctx.createBufferSource();
                    source.buffer = result.buffer;
                    source.connect(ctx.destination);
                    
                    source.onended = () => {
                        resolve();
                    };
                    
                    sourceRef.current = source;
                    source.start(0);
                } else {
                    console.warn("TTS Gen failed or no buffer", result.errorMessage);
                    // Visual feedback for error
                    setLoadingMessage("Audio Error - Skipping...");
                    setTimeout(() => {
                        setLoadingMessage("");
                        resolve();
                    }, 1000); 
                }
            } catch (e) {
                console.error("Playback error", e);
                setTimeout(resolve, 1000);
            }
        });
    };

    const fetchLectureData = async (meta: any) => {
        const cacheKey = `lecture_${channel.id}_${meta.id}_en`;
        let data = await getCachedLectureScript(cacheKey);
        
        if (!data) {
            setLoadingMessage(`Generating: ${meta.title}...`);
            data = await generateLectureScript(meta.title, `Podcast: ${channel.title}. ${channel.description}`, 'en');
            if (data) await cacheLectureScript(cacheKey, data);
        }
        return data;
    };

    return (
        <div className="h-full w-full snap-start relative flex flex-col justify-center bg-slate-900 border-b border-slate-800">
            
            {/* Visual Background (Interactive for Play/Pause) */}
            <div 
                className="absolute inset-0"
                onClick={handleManualPlay}
            >
                <img 
                    src={channel.imageUrl} 
                    alt={channel.title} 
                    className="w-full h-full object-cover opacity-60"
                    loading={isActive ? "eager" : "lazy"}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/95"></div>
                
                {/* Big Play Button Overlay (If Context Suspended OR Not Playing) */}
                {!isPlaying && !loadingMessage && (
                    <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/20 backdrop-blur-[2px]">
                        <button 
                            className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border-2 border-white/50 shadow-2xl animate-pulse hover:scale-105 transition-transform"
                        >
                            <Play size={40} fill="white" className="text-white ml-1" />
                        </button>
                    </div>
                )}

                {/* Loading State */}
                {loadingMessage && (
                    <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                        <div className="bg-black/60 backdrop-blur-md px-6 py-3 rounded-2xl flex flex-col items-center gap-2 border border-white/10 shadow-xl">
                            <Loader2 size={24} className="text-indigo-400 animate-spin" />
                            <span className="text-xs font-bold text-white uppercase tracking-wider">{loadingMessage}</span>
                        </div>
                    </div>
                )}

                {/* Live Transcript Overlay */}
                {transcript && !loadingMessage && (
                    <div className="absolute top-1/2 left-4 right-20 -translate-y-1/2 pointer-events-none z-10">
                        <div className="bg-black/60 backdrop-blur-md p-6 rounded-3xl border-l-4 border-indigo-500 shadow-2xl animate-fade-in-up">
                            <div className="flex items-center gap-2 mb-3">
                                <div className={`p-1.5 rounded-full ${transcript.speaker === 'Host' || transcript.speaker === 'System' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                                    <Mic size={14} />
                                </div>
                                <span className={`text-xs font-bold uppercase tracking-wider ${transcript.speaker === 'Host' || transcript.speaker === 'System' ? 'text-emerald-400' : 'text-indigo-400'}`}>
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

            {/* Playing Indicator (Top Right) */}
            {isPlaying && !loadingMessage && (
                <div className="absolute top-4 right-4 z-20 flex gap-1 items-end h-6 pointer-events-none">
                    <span className="w-1 bg-emerald-400 animate-[bounce_1s_infinite] h-3"></span>
                    <span className="w-1 bg-emerald-400 animate-[bounce_1.2s_infinite] h-5"></span>
                    <span className="w-1 bg-emerald-400 animate-[bounce_0.8s_infinite] h-4"></span>
                    <span className="w-1 bg-emerald-400 animate-[bounce_1.1s_infinite] h-6"></span>
                </div>
            )}

            {/* Sidebar Actions */}
            <div className="absolute right-2 bottom-32 flex flex-col items-center gap-6 z-30">
                <div className="relative mb-2 cursor-pointer" onClick={(e) => { e.stopPropagation(); onProfileClick(e, channel); }}>
                    <img 
                        src={channel.imageUrl} 
                        className={`w-12 h-12 rounded-full border-2 object-cover ${isActive && isPlaying ? 'animate-spin-slow' : ''}`}
                        alt="Creator"
                        style={{animationPlayState: isPlaying ? 'running' : 'paused'}}
                    />
                    {!isFollowed && channel.ownerId && (
                        <div 
                            className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-red-500 rounded-full p-0.5 border border-white" 
                            onClick={(e) => onToggleFollow(e, channel.id, channel.ownerId)}
                        >
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

                <button onClick={(e) => onToggleBookmark(e, channel.id)} className="flex flex-col items-center gap-1">
                    <div className="p-2 rounded-full bg-black/20 backdrop-blur-sm transition-transform active:scale-75">
                        <Bookmark size={32} fill={isBookmarked ? "#f59e0b" : "rgba(255,255,255,0.9)"} className={isBookmarked ? "text-amber-500" : "text-white"} />
                    </div>
                    <span className="text-white text-xs font-bold shadow-black drop-shadow-md">Save</span>
                </button>

                <button onClick={(e) => onShare(e, channel)} className="flex flex-col items-center gap-1">
                    <div className="p-2 rounded-full bg-black/20 backdrop-blur-sm transition-transform active:scale-75">
                        <Share2 size={32} fill="rgba(255,255,255,0.9)" className="text-white" />
                    </div>
                    <span className="text-white text-xs font-bold shadow-black drop-shadow-md">Share</span>
                </button>
            </div>

            {/* Bottom Info - Click here navigates to details */}
            <div className="absolute left-0 bottom-0 w-full p-4 pb-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent pointer-events-none pr-20 z-30">
                <div className="pointer-events-auto" onClick={(e) => { e.stopPropagation(); onChannelClick(channel.id); }}>
                    
                    {/* Status Badge */}
                    <div className="flex items-center gap-2 mb-2">
                        {trackIndex === -1 ? (
                            <div className="bg-emerald-600/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-white flex items-center gap-2 border border-emerald-500/50 shadow-lg">
                                <AlignLeft size={12} />
                                <span>Introduction</span>
                            </div>
                        ) : (
                            <div className="bg-indigo-600/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-white flex items-center gap-2 border border-indigo-500/50 shadow-lg animate-pulse">
                                <GraduationCap size={12} />
                                <span>Lesson {trackIndex + 1}/{totalLessons}</span>
                                <span className="opacity-50">|</span>
                                <span className="truncate max-w-[150px]">{flatCurriculum[trackIndex]?.title}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-white font-bold text-lg drop-shadow-md cursor-pointer hover:underline">
                            @{channel.author}
                        </h3>
                    </div>
                    
                    <p className="text-white/90 text-sm mb-3 line-clamp-1 leading-relaxed drop-shadow-sm">
                        {channel.description}
                    </p>

                    <div className="flex items-center gap-2 text-white/80 text-xs font-medium overflow-hidden whitespace-nowrap">
                        <Music size={12} className={isPlaying ? "animate-pulse" : ""} />
                        <div className="flex gap-4 animate-marquee">
                            <span>Chapter: {channel.chapters?.[0]?.title || "Intro"}</span>
                            <span>•</span>
                            <span>Voice: {channel.voiceName}</span>
                            {channel.tags.map((t: string) => <span key={t}>#{t}</span>)}
                        </div>
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
