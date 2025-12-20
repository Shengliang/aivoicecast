
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Channel, UserProfile, GeneratedLecture } from '../types';
import { Play, MessageSquare, Heart, Share2, Bookmark, Music, Plus, Pause, Loader2, Volume2, VolumeX, GraduationCap, ChevronRight, Mic, AlignLeft, BarChart3, User, AlertCircle, Zap, Radio, Square, Sparkles } from 'lucide-react';
import { generateLectureScript } from '../services/lectureGenerator';
import { synthesizeSpeech } from '../services/tts';
import { getCachedLectureScript, cacheLectureScript } from '../utils/db';
import { stopAllPlatformAudio, claimAudioLock, isVersionValid, getGlobalAudioContext, warmUpAudioContext } from '../utils/audioUtils';
import { ChannelCard } from './ChannelCard';

// Fixed missing interface definition
interface PodcastFeedProps {
  channels: Channel[];
  onChannelClick: (id: string) => void;
  onStartLiveSession?: (channel: Channel) => void;
  userProfile: UserProfile | null;
  globalVoice: string;
  onRefresh?: () => void;
  t: any;
  currentUser: any;
  setChannelToEdit?: (channel: Channel) => void;
  setIsSettingsModalOpen?: (open: boolean) => void;
  onCommentClick?: (channel: Channel) => void;
  handleVote?: (id: string, type: 'like' | 'dislike', e: React.MouseEvent) => void;
  onMessageCreator?: (id: string, name: string) => void;
  filterMode?: 'foryou' | 'following' | 'mine';
  isFeedActive?: boolean;
}

const MobileFeedCard = ({ 
    channel, 
    isActive, 
    onToggleLike, 
    isLiked, 
    isFollowed, 
    onToggleFollow, 
    onShare, 
    onComment, 
    onProfileClick, 
    onChannelClick 
}: any) => {
    const MY_TOKEN = useMemo(() => `FeedCard:${channel.id}`, [channel.id]);
    const [playbackState, setPlaybackState] = useState<'idle' | 'buffering' | 'playing'>('idle');
    const [transcript, setTranscript] = useState<{speaker: string, text: string} | null>(null);
    const [activeVersion, setActiveVersion] = useState<number>(-1);
    
    const isActiveRef = useRef(isActive);
    useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

    const stopLocal = useCallback(() => {
        setPlaybackState('idle');
    }, []);

    useEffect(() => {
        if (isActive) {
            // Autoplay logic
            const timer = setTimeout(() => {
                if (isActiveRef.current) startPlayback();
            }, 800);
            return () => {
                clearTimeout(timer);
                stopAllPlatformAudio(`FeedSwipe:${MY_TOKEN}`);
            };
        } else {
            setPlaybackState('idle');
        }
    }, [isActive, channel.id]);

    const startPlayback = async () => {
        if (playbackState === 'playing') return;
        
        const version = claimAudioLock(MY_TOKEN, stopLocal);
        setActiveVersion(version);
        setPlaybackState('buffering');

        try {
            // 1. Get Intro Content
            const introText = channel.welcomeMessage || channel.description || "Welcome to my podcast.";
            setTranscript({ speaker: 'Host', text: introText });

            const ctx = getGlobalAudioContext();
            await warmUpAudioContext(ctx);

            if (!isVersionValid(version)) return;

            // 2. Synthesize
            const result = await synthesizeSpeech(introText, channel.voiceName || 'Puck', ctx);
            
            if (!isVersionValid(version)) return;

            if (result.buffer) {
                setPlaybackState('playing');
                const source = ctx.createBufferSource();
                source.buffer = result.buffer;
                source.connect(ctx.destination);
                source.onended = () => {
                    if (isVersionValid(version)) setPlaybackState('idle');
                };
                source.start(0);
            } else {
                setPlaybackState('idle');
            }
        } catch (e) {
            setPlaybackState('idle');
        }
    };

    const handleTogglePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (playbackState === 'playing') stopAllPlatformAudio(`UserStop:${MY_TOKEN}`);
        else startPlayback();
    };

    return (
        <div className="h-full w-full snap-start relative flex flex-col justify-center bg-slate-900 border-b border-slate-800">
            <img src={channel.imageUrl} alt={channel.title} className="absolute inset-0 w-full h-full object-cover opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/90"></div>
            
            {transcript && isActive && (
                <div className="absolute inset-x-4 top-1/3 z-10 animate-fade-in">
                    <div className="bg-black/60 backdrop-blur-md p-6 rounded-3xl border border-white/10 shadow-2xl">
                        <p className="text-indigo-400 text-[10px] font-bold uppercase tracking-widest mb-2">{transcript.speaker}</p>
                        <p className="text-xl text-white font-medium leading-relaxed italic">"{transcript.text}"</p>
                    </div>
                </div>
            )}

            <div className="absolute right-4 bottom-32 flex flex-col items-center gap-6 z-20">
                <div className="relative" onClick={(e) => { e.stopPropagation(); onProfileClick(e, channel); }}>
                    <img src={channel.imageUrl} className="w-12 h-12 rounded-full border-2 border-white object-cover" alt="" />
                    {!isFollowed && (
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-red-500 rounded-full p-0.5 border border-white"><Plus size={12} color="white" strokeWidth={4} /></div>
                    )}
                </div>
                <button onClick={(e) => onToggleLike(e, channel.id)} className="flex flex-col items-center gap-1">
                    <Heart size={32} fill={isLiked ? "#ef4444" : "white"} className={isLiked ? "text-red-500" : "text-white"} />
                    <span className="text-white text-xs font-bold">{channel.likes}</span>
                </button>
                <button onClick={(e) => onComment(e, channel)} className="flex flex-col items-center gap-1">
                    <MessageSquare size={32} fill="white" />
                    <span className="text-white text-xs font-bold">{channel.comments?.length || 0}</span>
                </button>
                <button onClick={(e) => onShare(e, channel)} className="flex flex-col items-center gap-1">
                    <Share2 size={32} fill="white" />
                </button>
            </div>

            <div className="absolute left-0 bottom-0 w-full p-6 pb-10 z-20 bg-gradient-to-t from-black via-black/60 to-transparent pr-20">
                <div className="flex items-center gap-3 mb-4">
                    <button onClick={handleTogglePlay} className="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center shadow-xl active:scale-90 transition-transform">
                        {playbackState === 'buffering' ? <Loader2 className="animate-spin" size={24}/> : playbackState === 'playing' ? <Pause size={24} fill="currentColor"/> : <Play size={24} fill="currentColor" className="ml-1"/>}
                    </button>
                    <div onClick={() => onChannelClick(channel.id)}>
                        <p className="text-white font-bold text-lg hover:underline cursor-pointer">@{channel.author}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Creator</p>
                    </div>
                </div>
                <h3 className="text-white font-bold text-xl mb-2">{channel.title}</h3>
                <p className="text-slate-300 text-sm line-clamp-2">{channel.description}</p>
            </div>
        </div>
    );
};

export const PodcastFeed: React.FC<PodcastFeedProps> = ({ 
  channels, onChannelClick, userProfile, globalVoice, onRefresh,
  t, currentUser, handleVote, filterMode = 'foryou',
  isFeedActive = true 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : true);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const recommendedChannels = useMemo(() => {
    if (!isFeedActive) return [];
    if (filterMode === 'mine') return channels.filter(c => currentUser && c.ownerId === currentUser.uid);
    return channels;
  }, [channels, filterMode, currentUser, isFeedActive]);

  useEffect(() => {
    if (!isDesktop && recommendedChannels.length > 0 && !activeChannelId) {
        setActiveChannelId(recommendedChannels[0].id);
    }
  }, [recommendedChannels, isDesktop, activeChannelId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || isDesktop || !isFeedActive) return;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute('data-id');
                if (id) setActiveChannelId(id);
            }
        });
    }, { root: container, threshold: 0.6 });
    container.querySelectorAll('.feed-card').forEach(c => observer.observe(c));
    return () => observer.disconnect();
  }, [recommendedChannels, isDesktop, isFeedActive]);

  if (!isFeedActive) return null;

  if (isDesktop) {
    return (
        <div className="h-full overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-800">
            <div className="max-w-7xl mx-auto">
                <h2 className="text-2xl font-bold text-white mb-6">Explore Podcasts</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {recommendedChannels.map(channel => (
                        <ChannelCard key={channel.id} channel={channel} handleChannelClick={onChannelClick} handleVote={handleVote || (() => {})} currentUser={currentUser} setChannelToEdit={()=>{}} setIsSettingsModalOpen={()=>{}} globalVoice={globalVoice} t={t} onCommentClick={()=>{}} />
                    ))}
                </div>
            </div>
        </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full w-full bg-black overflow-y-scroll snap-y snap-mandatory no-scrollbar">
        {recommendedChannels.map((channel) => (
            <div key={channel.id} data-id={channel.id} className="feed-card h-full w-full snap-start">
                <MobileFeedCard 
                    channel={channel} 
                    isActive={activeChannelId === channel.id}
                    isLiked={userProfile?.likedChannelIds?.includes(channel.id)}
                    isFollowed={userProfile?.following?.includes(channel.ownerId || '')}
                    onToggleLike={(e: any) => handleVote?.(channel.id, 'like', e)}
                    onToggleFollow={()=>{}}
                    onShare={()=>{}}
                    onComment={()=>{}}
                    onProfileClick={()=>{}}
                    onChannelClick={onChannelClick}
                />
            </div>
        ))}
    </div>
  );
};
