
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Channel, UserProfile, GeneratedLecture } from '../types';
import { Play, MessageSquare, Heart, Share2, Bookmark, Music, Plus, Pause, Loader2, Volume2, VolumeX, GraduationCap, ChevronRight, Mic } from 'lucide-react';
import { ChannelCard } from './ChannelCard';
import { CreatorProfileModal } from './CreatorProfileModal';
import { followUser, unfollowUser } from '../services/firestoreService';
import { generateLectureScript } from '../services/lectureGenerator';
import { synthesizeSpeech } from '../services/tts';
import { getCachedLectureScript, cacheLectureScript } from '../utils/db';

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
    // Playback State
    const [isPlaying, setIsPlaying] = useState(false);
    const [status, setStatus] = useState<'idle' | 'intro' | 'buffering_lecture' | 'playing_lecture' | 'finished'>('idle');
    const [loadingText, setLoadingText] = useState('');
    const [needsInteraction, setNeedsInteraction] = useState(false); // For browser autoplay policy
    
    // Content Cursor
    const [chapterIndex, setChapterIndex] = useState(0);
    const [lessonIndex, setLessonIndex] = useState(0);
    const [sectionIndex, setSectionIndex] = useState(0);
    
    // Current Data
    const [currentLecture, setCurrentLecture] = useState<GeneratedLecture | null>(null);
    const [currentTranscript, setCurrentTranscript] = useState<{speaker: string, text: string} | null>(null);

    // Refs for Audio Control
    const audioContextRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const mountedRef = useRef(true);
    const nextLecturePromiseRef = useRef<Promise<GeneratedLecture | null> | null>(null);
    
    // Flatten Curriculum helper
    const getFlattenedCurriculum = () => {
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
    };

    const flatCurriculum = useMemo(() => getFlattenedCurriculum(), [channel]);

    const totalLessons = flatCurriculum.length;
    const currentFlatIndex = useMemo(() => {
        const idx = flatCurriculum.findIndex(item => item.chapterIndex === chapterIndex && item.lessonIndex === lessonIndex);
        return idx !== -1 ? idx + 1 : 1;
    }, [flatCurriculum, chapterIndex, lessonIndex]);

    useEffect(() => {
        mountedRef.current = true;
        return () => { 
            mountedRef.current = false; 
            stopAudio(); 
        };
    }, []);

    // Master Auto-Play Watcher
    useEffect(() => {
        if (isActive) {
            // Give a small delay for scroll to settle, then start
            const timer = setTimeout(() => {
                if (mountedRef.current) startChannelSequence();
            }, 800);
            return () => clearTimeout(timer);
        } else {
            stopAudio();
            setStatus('idle');
            setChapterIndex(0);
            setLessonIndex(0);
            setSectionIndex(0);
            setCurrentLecture(null);
            setCurrentTranscript(null);
        }
    }, [isActive]);

    const stopAudio = () => {
        if (sourceRef.current) {
            try { sourceRef.current.stop(); } catch(e) {}
            sourceRef.current = null;
        }
        setIsPlaying(false);
    };

    const initAudioContext = async () => {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioContextRef.current.state === 'suspended') {
            try {
                await audioContextRef.current.resume();
            } catch(e) {
                setNeedsInteraction(true);
                throw new Error("Autoplay blocked");
            }
        }
    };

    const playAudioBuffer = (buffer: AudioBuffer): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!audioContextRef.current) return reject("No Audio Context");
            
            const source = audioContextRef.current.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContextRef.current.destination);
            source.onended = () => resolve();
            sourceRef.current = source;
            source.start(0);
            setIsPlaying(true);
        });
    };

    // --- Core Logic: The Sequence ---

    const startChannelSequence = async () => {
        try {
            await initAudioContext();
            setNeedsInteraction(false);

            // Phase 1: Intro (Summary)
            setStatus('intro');
            setLoadingText('Introduction...');
            
            const introText = `Welcome to ${channel.title}. ${channel.description || ''}`;
            const voice = channel.voiceName || 'Puck';
            
            // Start prefetching the first lecture while we prepare/play intro
            if (flatCurriculum.length > 0) {
                const firstMeta = flatCurriculum[0];
                console.log("Prefetching first lecture:", firstMeta.title);
                nextLecturePromiseRef.current = fetchOrGenerateLecture(firstMeta);
            }

            // Synthesize Intro
            const introResult = await synthesizeSpeech(introText, voice, audioContextRef.current!);
            
            if (introResult.buffer && mountedRef.current && isActive) {
                setCurrentTranscript({ speaker: 'Host', text: channel.description });
                await playAudioBuffer(introResult.buffer);
            }

            // Intro finished? Move to Lecture Loop
            if (mountedRef.current && isActive) {
                processNextLesson();
            }

        } catch (e) {
            console.warn("Auto-play sequence failed (likely interaction needed):", e);
            setNeedsInteraction(true);
        }
    };

    const processNextLesson = async () => {
        if (!mountedRef.current || !isActive) return;

        // Find current meta based on state indices
        // Note: we use state refs or functional updates usually, but here we rely on the closure
        // because we are in a recursive-like async loop. To be safe, we re-calculate from flat list.
        
        // Actually, better to use a ref for the index cursor to avoid closure staleness, 
        // but for simplicity, let's look at the flatCurriculum array.
        
        // For the very first call after intro, we are at 0,0.
        // We need to loop.
        
        let currentMeta = flatCurriculum.find(item => item.chapterIndex === chapterIndex && item.lessonIndex === lessonIndex);
        
        if (!currentMeta) {
            console.log("Channel finished.");
            setStatus('finished');
            if (onChannelFinish) onChannelFinish();
            return;
        }

        setStatus('buffering_lecture');
        setLoadingText(`Loading: ${currentMeta.title}`);
        setCurrentTranscript(null);

        // Get the lecture (either from prefetch ref or new fetch)
        let lecture: GeneratedLecture | null = null;
        if (nextLecturePromiseRef.current) {
            lecture = await nextLecturePromiseRef.current;
            nextLecturePromiseRef.current = null; // Clear used promise
        } else {
            lecture = await fetchOrGenerateLecture(currentMeta);
        }

        if (lecture && lecture.sections.length > 0) {
            setCurrentLecture(lecture);
            setStatus('playing_lecture');
            
            // Prefetch NEXT lesson now
            const nextMetaIdx = flatCurriculum.indexOf(currentMeta) + 1;
            if (nextMetaIdx < flatCurriculum.length) {
                console.log("Prefetching NEXT lecture:", flatCurriculum[nextMetaIdx].title);
                nextLecturePromiseRef.current = fetchOrGenerateLecture(flatCurriculum[nextMetaIdx]);
            }

            // Play all sections
            for (let i = 0; i < lecture.sections.length; i++) {
                if (!mountedRef.current || !isActive) return;
                setSectionIndex(i);
                
                const section = lecture.sections[i];
                setCurrentTranscript({
                    speaker: section.speaker === 'Teacher' ? lecture.professorName : lecture.studentName,
                    text: section.text
                });

                const voice = section.speaker === 'Teacher' ? (channel.voiceName || 'Fenrir') : 'Puck';
                const result = await synthesizeSpeech(section.text, voice, audioContextRef.current!);
                
                if (result.buffer && mountedRef.current && isActive) {
                    await playAudioBuffer(result.buffer);
                }
                
                // Small pause between sections
                await new Promise(r => setTimeout(r, 500));
            }
            
            // Lecture Finished -> Move Cursor
            if (mountedRef.current && isActive) {
                advanceToNextMeta(currentMeta);
            }
        } else {
            // Lecture generation failed? Skip.
            advanceToNextMeta(currentMeta);
        }
    };

    const advanceToNextMeta = (currentMeta: any) => {
        const flatIdx = flatCurriculum.indexOf(currentMeta);
        if (flatIdx !== -1 && flatIdx < flatCurriculum.length - 1) {
            const next = flatCurriculum[flatIdx + 1];
            
            // Update State
            setChapterIndex(next.chapterIndex);
            setLessonIndex(next.lessonIndex);
            setSectionIndex(0);
            
            // Recursion (via useEffect or direct call? Direct call safer for loop continuity)
            // But we need state to update for UI.
            // We can rely on a small timeout to let React render the new Indices, then continue.
            // However, closure 'currentMeta' is stale in the next call if we don't pass args.
            // Let's rely on the fact that we updated state, but we call with the 'next' object implicitly by finding it again.
            // Actually, best to just trigger the effect? No, infinite loops risk.
            
            // HACK: We will just call processNextLesson BUT we need to ensure the vars `chapterIndex` etc are updated.
            // Since `processNextLesson` reads from state `chapterIndex`, we have a race condition if we call it immediately.
            // SOLUTION: Use functional state updates to verify, OR pass the target indices to `processNextLesson`.
            
            // Let's refactor processNextLesson to take arguments.
            // For now, let's just trigger a re-run via a ref-based cursor or just wait.
            // Simplest: We just modify the state, and have a `useEffect` on `[chapterIndex, lessonIndex]` trigger `processNextLesson`?
            // No, that triggers on initial render too.
            
            // Let's just use a timeout to restart the loop after state settles.
            setTimeout(() => processLoopRef.current(), 100);
        } else {
            setStatus('finished');
            if (onChannelFinish) onChannelFinish();
        }
    };
    
    // We need a ref to hold the function to call it from inside itself safely
    const processLoopRef = useRef<() => void>(() => {});
    processLoopRef.current = processNextLesson;


    const fetchOrGenerateLecture = async (meta: any) => {
        const cacheKey = `lecture_${channel.id}_${meta.id}_en`;
        let data = await getCachedLectureScript(cacheKey);
        if (!data) {
            data = await generateLectureScript(meta.title, `Podcast: ${channel.title}. ${channel.description}`, 'en');
            if (data) await cacheLectureScript(cacheKey, data);
        }
        return data;
    };

    const handleManualPlay = () => {
        startChannelSequence();
    };

    return (
        <div className="h-full w-full snap-start relative flex flex-col justify-center bg-slate-900 border-b border-slate-800">
            {/* Background / Video Area */}
            <div 
                className="absolute inset-0 cursor-pointer"
                onClick={handleManualPlay}
            >
                <img 
                    src={channel.imageUrl} 
                    alt={channel.title} 
                    className="w-full h-full object-cover opacity-50"
                    loading={isActive ? "eager" : "lazy"}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/95"></div>
                
                {/* Center States */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 p-6 text-center">
                    
                    {needsInteraction && (
                        <div className="bg-black/60 backdrop-blur-md p-6 rounded-full border border-white/20 animate-pulse pointer-events-auto cursor-pointer">
                            <Play size={48} fill="white" className="text-white" />
                            <p className="text-xs font-bold text-white mt-2 uppercase tracking-widest">Tap to Start</p>
                        </div>
                    )}

                    {!needsInteraction && status === 'intro' && (
                        <div className="flex flex-col items-center gap-2">
                            <div className="bg-indigo-600/80 backdrop-blur px-4 py-1 rounded-full border border-indigo-400/50">
                                <span className="text-xs font-bold text-white uppercase tracking-wider animate-pulse">Introduction</span>
                            </div>
                            <h2 className="text-2xl font-bold text-white drop-shadow-xl">{channel.title}</h2>
                        </div>
                    )}

                    {!needsInteraction && (status === 'buffering_lecture') && (
                        <div className="flex flex-col items-center gap-2 bg-black/60 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                            <Loader2 size={32} className="text-indigo-400 animate-spin" />
                            <span className="text-xs font-bold text-white">{loadingText}</span>
                        </div>
                    )}

                    {!needsInteraction && status === 'playing_lecture' && currentTranscript && (
                        <div className="bg-black/60 backdrop-blur-sm p-4 rounded-xl border-l-4 border-indigo-500 shadow-xl animate-fade-in-up max-w-sm">
                            <p className="text-xs font-bold text-indigo-300 uppercase mb-2 flex items-center gap-2">
                                <Mic size={12}/> {currentTranscript.speaker}
                            </p>
                            <p className="text-lg md:text-xl text-white font-medium leading-relaxed drop-shadow-md text-left">
                                "{currentTranscript.text}"
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Sidebar Actions */}
            <div className="absolute right-2 bottom-32 flex flex-col items-center gap-6 z-20">
                <div className="relative mb-2 cursor-pointer" onClick={(e) => onProfileClick(e, channel)}>
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

            {/* Bottom Info Overlay */}
            <div className="absolute left-0 bottom-0 w-full p-4 pb-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent pointer-events-none pr-20">
                <div className="pointer-events-auto" onClick={(e) => { e.stopPropagation(); onChannelClick(channel.id); }}>
                    {/* Chapter / Lesson Indicator */}
                    <div className="flex items-center gap-2 mb-2">
                        <div className="bg-indigo-600/80 backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold text-white flex items-center gap-1 border border-indigo-500/30">
                            <GraduationCap size={12} />
                            <span>Lesson {Math.max(1, currentFlatIndex || 1)}/{Math.max(1, totalLessons || 1)}</span>
                        </div>
                        {currentLecture && (
                            <span className="text-indigo-200 text-xs font-bold truncate max-w-[200px]">
                                {currentLecture.topic}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-white font-bold text-lg drop-shadow-md cursor-pointer hover:underline">
                            @{channel.author}
                        </h3>
                    </div>
                    
                    <p className="text-white/90 text-sm mb-3 line-clamp-2 leading-relaxed drop-shadow-sm">
                        {channel.description} <span className="font-bold text-white cursor-pointer opacity-70">...more</span>
                    </p>

                    {/* Scrolling Music/Tags Marquee */}
                    <div className="flex items-center gap-2 text-white/80 text-xs font-medium overflow-hidden whitespace-nowrap">
                        <Music size={12} className={isPlaying ? "animate-pulse" : ""} />
                        <div className="flex gap-4 animate-marquee">
                            <span>Chapter: {channel.chapters?.[chapterIndex]?.title || "Intro"}</span>
                            <span>•</span>
                            <span>Voice: {channel.voiceName}</span>
                            {channel.tags.map(t => <span key={t}>#{t}</span>)}
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
