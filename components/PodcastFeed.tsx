
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Channel, UserProfile, GeneratedLecture } from '../types';
import { Play, MessageSquare, Heart, Share2, Bookmark, Music, Plus, Pause, Loader2, Volume2, VolumeX, GraduationCap, ChevronRight, Mic, AlignLeft } from 'lucide-react';
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
    // Sequence: -1 = Intro, 0...N = Lectures
    const [currentTrackIndex, setCurrentTrackIndex] = useState(-1); 
    const [sectionIndex, setSectionIndex] = useState(0);
    
    const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
    const [loadingText, setLoadingText] = useState('');
    
    // Display Data
    const [currentLectureTitle, setCurrentLectureTitle] = useState<string>('');
    const [currentTranscript, setCurrentTranscript] = useState<{speaker: string, text: string} | null>(null);

    // Refs for Audio Control
    const audioContextRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const mountedRef = useRef(true);
    
    // Cache for pre-fetching next track
    const lectureCache = useRef<Map<string, GeneratedLecture>>(new Map());

    // Flatten Curriculum helper
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

    // --- Master Control Effect ---
    useEffect(() => {
        if (isActive) {
            // Attempt to start immediately
            initAudioAndStart();
        } else {
            // Reset when swiping away
            stopAudio();
            setStatus('idle');
            setCurrentTrackIndex(-1);
            setSectionIndex(0);
            setCurrentTranscript(null);
        }
    }, [isActive]);

    // Handle track changes
    useEffect(() => {
        if (isActive && status !== 'idle') {
            playCurrentTrack();
        }
    }, [currentTrackIndex]);

    const stopAudio = () => {
        if (sourceRef.current) {
            try { sourceRef.current.stop(); } catch(e) {}
            sourceRef.current = null;
        }
        setIsPlaying(false);
    };

    const initAudioAndStart = async () => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        
        // Aggressively try to resume. 
        // Note: If user hasn't interacted with page at all, this might fail, 
        // but typically they clicked "Feed" to get here.
        if (audioContextRef.current.state === 'suspended') {
            try {
                await audioContextRef.current.resume();
            } catch(e) {
                console.warn("Autoplay blocked, waiting for interaction");
            }
        }

        // Start sequence at Intro (-1)
        setCurrentTrackIndex(-1);
        setStatus('loading'); // Trigger the effect
    };

    const playCurrentTrack = async () => {
        if (!mountedRef.current) return;
        stopAudio(); // Ensure previous audio stops

        // --- 1. INTRO PHASE (-1) ---
        if (currentTrackIndex === -1) {
            setLoadingText('Introduction...');
            setCurrentLectureTitle('Channel Introduction');
            
            // Set Display Text for Intro
            setCurrentTranscript({ 
                speaker: 'Host', 
                text: channel.welcomeMessage || channel.description || `Welcome to ${channel.title}. Let's begin.` 
            });

            const textToSpeak = channel.welcomeMessage || `Welcome to ${channel.title}. ${channel.description}`;
            const voice = channel.voiceName || 'Puck';

            // Prefetch first lecture while playing intro
            if (flatCurriculum.length > 0) {
                fetchLectureData(flatCurriculum[0]);
            }

            await speakText(textToSpeak, voice);
            
            if (mountedRef.current && isActive) {
                // Move to first lecture
                setCurrentTrackIndex(0); 
            }
            return;
        }

        // --- 2. LECTURE PHASE (0 to N) ---
        const lessonMeta = flatCurriculum[currentTrackIndex];
        
        // If we ran out of lessons, move to next channel
        if (!lessonMeta) {
            console.log("Channel complete. Requesting next...");
            if (onChannelFinish) onChannelFinish();
            return;
        }

        setLoadingText(`Loading: ${lessonMeta.title}`);
        setCurrentLectureTitle(lessonMeta.title);
        setStatus('loading');

        // Fetch Data
        let lecture = lectureCache.current.get(lessonMeta.id);
        if (!lecture) {
            lecture = await fetchLectureData(lessonMeta);
        }

        if (lecture && lecture.sections && lecture.sections.length > 0) {
            // Prefetch NEXT lesson
            if (currentTrackIndex + 1 < flatCurriculum.length) {
                fetchLectureData(flatCurriculum[currentTrackIndex + 1]);
            }

            setStatus('playing');
            
            // Play all sections in this lecture
            for (let i = 0; i < lecture.sections.length; i++) {
                if (!mountedRef.current || !isActive) break;
                // Check if user swiped away or track changed mid-loop
                // (Though Effect cleanup should handle this, strict check helps)
                
                const section = lecture.sections[i];
                
                // UPDATE SCREEN CONTENT
                setCurrentTranscript({
                    speaker: section.speaker === 'Teacher' ? lecture.professorName : lecture.studentName,
                    text: section.text
                });

                const voice = section.speaker === 'Teacher' ? (channel.voiceName || 'Fenrir') : 'Puck';
                
                // Speak and wait for finish
                await speakText(section.text, voice);
                
                // Small natural pause between speakers
                await new Promise(r => setTimeout(r, 400));
            }

            // Lecture finished, increment track
            if (mountedRef.current && isActive) {
                setCurrentTrackIndex(prev => prev + 1);
            }
        } else {
            // Error or empty lecture, skip
            setCurrentTrackIndex(prev => prev + 1);
        }
    };

    const fetchLectureData = async (meta: any) => {
        if (lectureCache.current.has(meta.id)) return lectureCache.current.get(meta.id);

        const cacheKey = `lecture_${channel.id}_${meta.id}_en`;
        let data = await getCachedLectureScript(cacheKey);
        
        if (!data) {
            // Generate real-time
            data = await generateLectureScript(meta.title, `Podcast: ${channel.title}. ${channel.description}`, 'en');
            if (data) await cacheLectureScript(cacheKey, data);
        }
        
        if (data) lectureCache.current.set(meta.id, data);
        return data;
    };

    const speakText = async (text: string, voice: string): Promise<void> => {
        return new Promise(async (resolve) => {
            if (!audioContextRef.current) resolve();

            try {
                // Ensure context is running (fixes some mobile autoplay blocks)
                if (audioContextRef.current?.state === 'suspended') {
                    await audioContextRef.current.resume();
                }

                setIsPlaying(true);
                const result = await synthesizeSpeech(text, voice, audioContextRef.current!);
                
                if (result.buffer && mountedRef.current && isActive) {
                    const source = audioContextRef.current!.createBufferSource();
                    source.buffer = result.buffer;
                    source.connect(audioContextRef.current!.destination);
                    source.onended = () => {
                        setIsPlaying(false);
                        resolve();
                    };
                    sourceRef.current = source;
                    source.start(0);
                } else {
                    // Fallback or error
                    setIsPlaying(false);
                    // Add a small delay so it doesn't loop infinitely fast on error
                    setTimeout(resolve, 1000); 
                }
            } catch (e) {
                console.error("Speech error", e);
                setIsPlaying(false);
                setTimeout(resolve, 1000);
            }
        });
    };

    // Manual toggle mainly for pausing
    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isPlaying) {
            audioContextRef.current?.suspend();
            setIsPlaying(false);
        } else {
            audioContextRef.current?.resume();
            setIsPlaying(true);
        }
    };

    const chapterIndex = currentTrackIndex >= 0 ? flatCurriculum[currentTrackIndex]?.chapterIndex : undefined;

    return (
        <div className="h-full w-full snap-start relative flex flex-col justify-center bg-slate-900 border-b border-slate-800">
            
            {/* 1. Visual Layer */}
            <div 
                className="absolute inset-0 cursor-pointer"
                onClick={handleToggle}
            >
                <img 
                    src={channel.imageUrl} 
                    alt={channel.title} 
                    className="w-full h-full object-cover opacity-60"
                    loading={isActive ? "eager" : "lazy"}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/95"></div>
                
                {/* 2. Status / Loading Indicator */}
                {status === 'loading' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                        <div className="flex flex-col items-center gap-2 bg-black/60 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                            <Loader2 size={32} className="text-indigo-400 animate-spin" />
                            <span className="text-xs font-bold text-white">{loadingText}</span>
                        </div>
                    </div>
                )}

                {/* 3. Pause Icon Overlay */}
                {!isPlaying && status !== 'loading' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                        <div className="bg-black/40 p-4 rounded-full backdrop-blur-sm">
                            <Play size={48} fill="white" className="text-white/90" />
                        </div>
                    </div>
                )}

                {/* 4. Text Content Overlay (Always Visible when Active) */}
                {currentTranscript && (
                    <div className="absolute top-1/2 left-4 right-20 -translate-y-1/2 pointer-events-none z-20">
                        <div className={`transition-all duration-500 transform ${isPlaying ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-90'}`}>
                            <div className="bg-black/60 backdrop-blur-md p-5 rounded-2xl border-l-4 border-indigo-500 shadow-2xl">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-1 bg-indigo-500/20 rounded-full">
                                        <Mic size={12} className="text-indigo-300"/>
                                    </div>
                                    <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                                        {currentTranscript.speaker}
                                    </span>
                                </div>
                                <p className="text-lg md:text-2xl text-white font-medium leading-relaxed drop-shadow-md text-left font-sans">
                                    "{currentTranscript.text}"
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 5. Right Sidebar Actions */}
            <div className="absolute right-2 bottom-32 flex flex-col items-center gap-6 z-30">
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

            {/* 6. Bottom Info Overlay */}
            <div className="absolute left-0 bottom-0 w-full p-4 pb-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent pointer-events-none pr-20 z-30">
                <div className="pointer-events-auto" onClick={(e) => { e.stopPropagation(); onChannelClick(channel.id); }}>
                    
                    {/* Playing Indicator */}
                    <div className="flex items-center gap-2 mb-2">
                        {currentTrackIndex >= 0 ? (
                            <div className="bg-indigo-600/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-white flex items-center gap-2 border border-indigo-500/50 shadow-lg animate-pulse">
                                <GraduationCap size={12} />
                                <span>Lesson {currentTrackIndex + 1}/{totalLessons}</span>
                                <span className="opacity-50">|</span>
                                <span className="truncate max-w-[150px]">{currentLectureTitle}</span>
                            </div>
                        ) : (
                            <div className="bg-emerald-600/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-white flex items-center gap-2 border border-emerald-500/50 shadow-lg">
                                <AlignLeft size={12} />
                                <span>Introduction</span>
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
