
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Channel, UserProfile, GeneratedLecture } from '../types';
import { Play, MessageSquare, Heart, Share2, Bookmark, Music, Plus, Pause, Loader2, Volume2, VolumeX } from 'lucide-react';
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
    onChannelClick
}: any) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const audioContextRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; stopAudio(); };
    }, []);

    // Auto-Play Logic when Active
    useEffect(() => {
        if (isActive) {
            // Slight delay to allow smooth scroll snap before heavy processing
            const timer = setTimeout(() => {
                if (mountedRef.current) startAutoPlay();
            }, 500);
            return () => clearTimeout(timer);
        } else {
            stopAudio();
        }
    }, [isActive]);

    const stopAudio = () => {
        if (sourceRef.current) {
            try { sourceRef.current.stop(); } catch(e) {}
            sourceRef.current = null;
        }
        if (audioContextRef.current) {
            try { audioContextRef.current.close(); } catch(e) {}
            audioContextRef.current = null;
        }
        setIsPlaying(false);
        setIsBuffering(false);
    };

    const startAutoPlay = async () => {
        if (isPlaying) return;
        
        try {
            // 1. Initialize Audio Context
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioContextRef.current = ctx;
            if (ctx.state === 'suspended') await ctx.resume();

            // 2. Identify Content (First Lesson)
            let scriptText = "";
            let voice = channel.voiceName || 'Puck';

            // Check if curriculum exists
            if (channel.chapters && channel.chapters.length > 0 && channel.chapters[0].subTopics.length > 0) {
                const firstLesson = channel.chapters[0].subTopics[0];
                const cacheKey = `lecture_${channel.id}_${firstLesson.id}_en`; // Default to EN for feed preview
                
                // A. Check Cache
                setIsBuffering(true);
                setLoadingText('Loading Lecture...');
                let lecture = await getCachedLectureScript(cacheKey);

                // B. If not in cache, Generate Teaser
                if (!lecture) {
                    setLoadingText('AI Generating...');
                    // Generate a "Teaser" script - simpler/faster than full lecture
                    lecture = await generateLectureScript(firstLesson.title, `Introduction to ${channel.title}. ${channel.description}`, 'en');
                    if (lecture) {
                        // Cache it for next time
                        await cacheLectureScript(cacheKey, lecture);
                    }
                }

                if (lecture && lecture.sections.length > 0) {
                    // Combine first few sections for the "Teaser"
                    scriptText = lecture.sections.slice(0, 3).map((s: any) => s.text).join(' ');
                    // Use correct voice if teacher speaks first
                    if (lecture.sections[0].speaker === 'Teacher') {
                        // Keep channel voice
                    }
                }
            }

            // Fallback if no script could be generated
            if (!scriptText) {
                scriptText = `Welcome to ${channel.title}. ${channel.description}`;
            }

            // 3. Synthesize
            setLoadingText('Synthesizing...');
            const result = await synthesizeSpeech(scriptText, voice, ctx);

            if (!mountedRef.current) return;

            if (result.buffer) {
                const source = ctx.createBufferSource();
                source.buffer = result.buffer;
                source.connect(ctx.destination);
                source.onended = () => { if(mountedRef.current) setIsPlaying(false); };
                source.start(0);
                sourceRef.current = source;
                setIsPlaying(true);
                setIsBuffering(false);
            } else {
                // System Voice Fallback
                console.warn("Falling back to system voice");
                const u = new SpeechSynthesisUtterance(scriptText);
                u.onend = () => setIsPlaying(false);
                window.speechSynthesis.speak(u);
                setIsPlaying(true);
                setIsBuffering(false);
            }

        } catch (e) {
            console.error("Auto-play failed", e);
            setIsBuffering(false);
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
            } else if (audioContextRef.current) {
                // If context exists but stopped, restart
                startAutoPlay();
            } else {
                // Cold start
                startAutoPlay();
            }
        }
    };

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
                    className="w-full h-full object-cover opacity-60"
                    loading={isActive ? "eager" : "lazy"}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/95"></div>
                
                {/* Center Feedback */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {isBuffering ? (
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 size={48} className="text-indigo-400 animate-spin" />
                            <span className="text-xs font-bold text-indigo-200 bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">{loadingText}</span>
                        </div>
                    ) : !isPlaying ? (
                        <Play size={64} fill="white" className="text-white/80 opacity-50 scale-125" />
                    ) : (
                        // Subtle equalizer or nothing when playing
                        <div className="flex gap-1 h-8 items-end opacity-50">
                            <div className="w-1 bg-white animate-pulse" style={{height: '40%'}}></div>
                            <div className="w-1 bg-white animate-pulse" style={{height: '100%'}}></div>
                            <div className="w-1 bg-white animate-pulse" style={{height: '60%'}}></div>
                            <div className="w-1 bg-white animate-pulse" style={{height: '80%'}}></div>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Sidebar Actions */}
            <div className="absolute right-2 bottom-24 flex flex-col items-center gap-6 z-20">
                
                {/* Creator Profile */}
                <div className="relative mb-2 cursor-pointer" onClick={(e) => onProfileClick(e, channel)}>
                    <img 
                        src={channel.imageUrl} 
                        className={`w-12 h-12 rounded-full border-2 object-cover ${isActive ? 'animate-spin-slow' : ''}`}
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

                {/* Like */}
                <button onClick={(e) => onToggleLike(e, channel.id)} className="flex flex-col items-center gap-1 group">
                    <div className={`p-2 rounded-full transition-transform active:scale-75 ${isLiked ? '' : 'bg-black/20 backdrop-blur-sm'}`}>
                        <Heart size={32} fill={isLiked ? "#ef4444" : "rgba(255,255,255,0.9)"} className={isLiked ? "text-red-500" : "text-white"} />
                    </div>
                    <span className="text-white text-xs font-bold shadow-black drop-shadow-md">{channel.likes}</span>
                </button>

                {/* Comments */}
                <button onClick={(e) => onComment(e, channel)} className="flex flex-col items-center gap-1">
                    <div className="p-2 rounded-full bg-black/20 backdrop-blur-sm transition-transform active:scale-75">
                        <MessageSquare size={32} fill="white" className="text-white" />
                    </div>
                    <span className="text-white text-xs font-bold shadow-black drop-shadow-md">{channel.comments?.length || 0}</span>
                </button>

                {/* Bookmark */}
                <button onClick={(e) => onToggleBookmark(e, channel.id)} className="flex flex-col items-center gap-1">
                    <div className="p-2 rounded-full bg-black/20 backdrop-blur-sm transition-transform active:scale-75">
                        <Bookmark size={32} fill={isBookmarked ? "#f59e0b" : "rgba(255,255,255,0.9)"} className={isBookmarked ? "text-amber-500" : "text-white"} />
                    </div>
                    <span className="text-white text-xs font-bold shadow-black drop-shadow-md">Save</span>
                </button>

                {/* Share */}
                <button onClick={(e) => onShare(e, channel)} className="flex flex-col items-center gap-1">
                    <div className="p-2 rounded-full bg-black/20 backdrop-blur-sm transition-transform active:scale-75">
                        <Share2 size={32} fill="rgba(255,255,255,0.9)" className="text-white" />
                    </div>
                    <span className="text-white text-xs font-bold shadow-black drop-shadow-md">Share</span>
                </button>
            </div>

            {/* Bottom Info Overlay */}
            <div className="absolute left-0 bottom-0 w-full p-4 pb-6 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none pr-20">
                <div className="pointer-events-auto" onClick={(e) => { e.stopPropagation(); onChannelClick(channel.id); }}>
                    <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-white font-bold text-lg drop-shadow-md cursor-pointer hover:underline">
                            @{channel.author}
                        </h3>
                        {channel.likes > 500 && (
                            <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                                TRENDING
                            </span>
                        )}
                    </div>
                    
                    <p className="text-white/90 text-sm mb-3 line-clamp-2 leading-relaxed drop-shadow-sm">
                        {channel.description} <span className="font-bold text-white cursor-pointer opacity-70">...more</span>
                    </p>

                    {/* Scrolling Music/Tags Marquee */}
                    <div className="flex items-center gap-2 text-white/80 text-xs font-medium overflow-hidden whitespace-nowrap">
                        <Music size={12} className={isPlaying ? "animate-pulse" : ""} />
                        <div className="flex gap-4 animate-marquee">
                            <span>Lecture: {channel.chapters?.[0]?.subTopics?.[0]?.title || "Intro"}</span>
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
