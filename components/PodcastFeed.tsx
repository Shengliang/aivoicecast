
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Channel, UserProfile, GeneratedLecture } from '../types';
import { Play, MessageSquare, Heart, Share2, Bookmark, Music, Plus, Pause, Loader2, Volume2, VolumeX, GraduationCap, ChevronRight } from 'lucide-react';
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
    onChannelFinish // New callback for auto-scroll
}: any) => {
    // Playback State
    const [isPlaying, setIsPlaying] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    
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
    const playbackTimeoutRef = useRef<any>(null);

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

    useEffect(() => {
        mountedRef.current = true;
        return () => { 
            mountedRef.current = false; 
            stopAudio(); 
            if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
        };
    }, []);

    // Master Auto-Play Watcher
    useEffect(() => {
        if (isActive) {
            // Reset cursor if starting fresh
            if (!isPlaying && !currentLecture) {
                // Slight delay to allow smooth scroll snap before heavy API calls
                playbackTimeoutRef.current = setTimeout(() => {
                    if (mountedRef.current) playSequence();
                }, 500);
            } else if (audioContextRef.current?.state === 'suspended') {
                audioContextRef.current.resume();
            }
        } else {
            stopAudio();
            if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
        }
    }, [isActive]);

    const stopAudio = () => {
        if (sourceRef.current) {
            try { sourceRef.current.stop(); } catch(e) {}
            sourceRef.current = null;
        }
        setIsPlaying(false);
        setIsBuffering(false);
    };

    const playSequence = async () => {
        if (!mountedRef.current) return;
        
        // 1. Get Current Lesson Metadata
        // We use a flat index concept derived from current chapter/lesson indices
        const currentMeta = flatCurriculum.find(item => item.chapterIndex === chapterIndex && item.lessonIndex === lessonIndex);
        
        if (!currentMeta) {
            // End of Channel Content reached
            console.log("Channel finished, requesting next...");
            if (onChannelFinish) onChannelFinish();
            return;
        }

        try {
            setIsPlaying(true);
            
            // 2. Init Audio Context if needed
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();

            // 3. Load Script (If not already loaded for this lesson)
            let lectureData = currentLecture;
            
            // If we changed lessons or haven't loaded yet
            if (!lectureData || lectureData.topic !== currentMeta.title) {
                const cacheKey = `lecture_${channel.id}_${currentMeta.id}_en`;
                
                setIsBuffering(true);
                setLoadingText(`Loading: ${currentMeta.title}`);
                setCurrentTranscript(null);

                // Check Cache
                lectureData = await getCachedLectureScript(cacheKey);

                if (!lectureData) {
                    setLoadingText('Generating Script...');
                    // Generate Full Script (not just teaser)
                    lectureData = await generateLectureScript(currentMeta.title, `Podcast: ${channel.title}. ${channel.description}`, 'en');
                    if (lectureData) await cacheLectureScript(cacheKey, lectureData);
                }

                if (!lectureData || !lectureData.sections || lectureData.sections.length === 0) {
                    // Fallback if generation failed - Skip to next lesson
                    advanceToNextLesson();
                    return;
                }

                setCurrentLecture(lectureData);
                setSectionIndex(0); // Reset section for new lesson
            }

            // 4. Play Current Section
            if (lectureData && lectureData.sections[sectionIndex]) {
                const section = lectureData.sections[sectionIndex];
                
                // Update UI Text
                setCurrentTranscript({
                    speaker: section.speaker === 'Teacher' ? lectureData.professorName : lectureData.studentName,
                    text: section.text
                });
                
                setIsBuffering(true);
                setLoadingText('Synthesizing...');

                // Determine Voice
                // If simple config, Teacher = channel.voiceName, Student = 'Puck' (or alternate)
                const voice = section.speaker === 'Teacher' ? (channel.voiceName || 'Fenrir') : 'Puck';

                const result = await synthesizeSpeech(section.text, voice, audioContextRef.current!);
                
                if (!mountedRef.current || !isActive) return;

                if (result.buffer) {
                    const source = audioContextRef.current!.createBufferSource();
                    source.buffer = result.buffer;
                    source.connect(audioContextRef.current!.destination);
                    
                    source.onended = () => {
                        if (mountedRef.current && isActive) {
                            advanceCursor(lectureData!);
                        }
                    };
                    
                    sourceRef.current = source;
                    source.start(0);
                    setIsBuffering(false);
                } else {
                    // Fallback TTS
                    const u = new SpeechSynthesisUtterance(section.text);
                    u.onend = () => { if (mountedRef.current && isActive) advanceCursor(lectureData!); };
                    window.speechSynthesis.speak(u);
                    setIsBuffering(false);
                }
            } else {
                // Section index out of bounds? Move next
                advanceToNextLesson();
            }

        } catch (e) {
            console.error("Playback error", e);
            setIsBuffering(false);
            // On error, try skip to next
            setTimeout(() => advanceToNextLesson(), 2000);
        }
    };

    const advanceCursor = (currentScript: GeneratedLecture) => {
        // Move to next section
        if (sectionIndex + 1 < currentScript.sections.length) {
            setSectionIndex(prev => prev + 1);
            // Effect will trigger re-run of playSequence due to state change? 
            // No, strictly we need to call it or depend on state. 
            // Better to just recursively call playSequence, but state updates are async.
            // We use a timeout to let state settle then call sequence.
            setTimeout(() => playSequence(), 0);
        } else {
            // End of this lesson
            advanceToNextLesson();
        }
    };

    const advanceToNextLesson = () => {
        const currentMeta = flatCurriculum.find(item => item.chapterIndex === chapterIndex && item.lessonIndex === lessonIndex);
        if (!currentMeta) return;

        // Find next in flat list
        const flatIdx = flatCurriculum.indexOf(currentMeta);
        if (flatIdx !== -1 && flatIdx < flatCurriculum.length - 1) {
            const next = flatCurriculum[flatIdx + 1];
            setChapterIndex(next.chapterIndex);
            setLessonIndex(next.lessonIndex);
            setSectionIndex(0);
            setCurrentLecture(null); // Force reload
            setTimeout(() => playSequence(), 0);
        } else {
            // End of Channel
            if (onChannelFinish) onChannelFinish();
        }
    };

    const togglePlayback = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isPlaying) {
            if (audioContextRef.current?.state === 'running') {
                audioContextRef.current.suspend();
                setIsPlaying(false);
            } else {
                window.speechSynthesis.pause();
                setIsPlaying(false);
            }
        } else {
            if (audioContextRef.current?.state === 'suspended') {
                audioContextRef.current.resume();
                setIsPlaying(true);
            } else {
                playSequence();
            }
        }
    };

    // Calculate progress
    const totalLessons = flatCurriculum.length;
    const currentFlatIndex = flatCurriculum.findIndex(item => item.chapterIndex === chapterIndex && item.lessonIndex === lessonIndex) + 1;

    return (
        <div className="h-full w-full snap-start relative flex flex-col justify-center bg-slate-900 border-b border-slate-800">
            {/* Background / Video Area */}
            <div 
                className="absolute inset-0 cursor-pointer"
                onClick={togglePlayback}
            >
                <img 
                    src={channel.imageUrl} 
                    alt={channel.title} 
                    className="w-full h-full object-cover opacity-50"
                    loading={isActive ? "eager" : "lazy"}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/95"></div>
                
                {/* Center Loading Indicator (Only if buffering) */}
                {isBuffering && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                        <div className="flex flex-col items-center gap-2 bg-black/60 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                            <Loader2 size={32} className="text-indigo-400 animate-spin" />
                            <span className="text-xs font-bold text-white">{loadingText}</span>
                        </div>
                    </div>
                )}

                {/* Play Icon Overlay (Only if paused and not buffering) */}
                {!isPlaying && !isBuffering && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                        <Play size={64} fill="white" className="text-white/80 opacity-70 scale-125 drop-shadow-lg" />
                    </div>
                )}

                {/* TRANSCRIPT OVERLAY */}
                {isPlaying && currentTranscript && (
                    <div className="absolute top-1/2 left-4 right-20 -translate-y-1/2 pointer-events-none">
                        <div className="bg-black/60 backdrop-blur-sm p-4 rounded-xl border-l-4 border-indigo-500 shadow-xl animate-fade-in-up">
                            <p className="text-xs font-bold text-indigo-300 uppercase mb-1">{currentTranscript.speaker}</p>
                            <p className="text-lg md:text-xl text-white font-medium leading-relaxed drop-shadow-md">
                                "{currentTranscript.text}"
                            </p>
                        </div>
                    </div>
                )}
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
                            <span>Lesson {Math.max(1, currentFlatIndex)}/{Math.max(1, totalLessons)}</span>
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
              if (entry.isIntersecting) {
                  const id = entry.target.getAttribute('data-id');
                  if (id) setActiveChannelId(id);
              }
          });
      }, {
          root: container,
          threshold: 0.6 // 60% visibility triggers switch
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
