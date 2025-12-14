
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Channel, UserProfile } from '../types';
import { Play, MessageSquare, ThumbsUp, Star, Info, RefreshCw, Loader2, Heart, Share2, Bookmark, Music, Plus } from 'lucide-react';
import { ChannelCard } from './ChannelCard';
import { CreatorProfileModal } from './CreatorProfileModal';

interface PodcastFeedProps {
  channels: Channel[];
  onChannelClick: (id: string) => void;
  onStartLiveSession: (channel: Channel) => void; 
  userProfile: UserProfile | null;
  globalVoice: string;
  onRefresh?: () => void;
  
  // Props for ChannelCard (Desktop View)
  t?: any;
  currentUser?: any;
  setChannelToEdit?: (channel: Channel) => void;
  setIsSettingsModalOpen?: (open: boolean) => void;
  onCommentClick?: (channel: Channel) => void;
  handleVote?: (id: string, type: 'like' | 'dislike', e: React.MouseEvent) => void;
}

export const PodcastFeed: React.FC<PodcastFeedProps> = ({ 
  channels, onChannelClick, onStartLiveSession, userProfile, globalVoice, onRefresh,
  t, currentUser, setChannelToEdit, setIsSettingsModalOpen, onCommentClick, handleVote
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  
  // Interaction States for Mobile View
  const [likedChannels, setLikedChannels] = useState<Set<string>>(new Set());
  const [bookmarkedChannels, setBookmarkedChannels] = useState<Set<string>>(new Set());
  const [followedChannels, setFollowedChannels] = useState<Set<string>>(new Set());
  
  // Creator Profile Modal State
  const [viewingCreator, setViewingCreator] = useState<Channel | null>(null);

  // Logic to rank/filter channels based on interests
  const recommendedChannels = useMemo(() => {
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
  }, [channels, userProfile]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      if (e.currentTarget.scrollTop < -50 && !isRefreshing && onRefresh) {
          setIsRefreshing(true);
          setTimeout(() => {
              onRefresh();
              setIsRefreshing(false);
          }, 1500);
      }
  };

  // --- Mobile Interactions ---

  const toggleLike = (e: React.MouseEvent, channelId: string) => {
      e.stopPropagation();
      const newSet = new Set(likedChannels);
      if (newSet.has(channelId)) {
          newSet.delete(channelId);
          // Call parent handler for dislike
          if (handleVote) handleVote(channelId, 'dislike', e);
      } else {
          newSet.add(channelId);
          // Call parent handler for like
          if (handleVote) handleVote(channelId, 'like', e);
      }
      setLikedChannels(newSet);
  };

  const toggleBookmark = (e: React.MouseEvent, channelId: string) => {
      e.stopPropagation();
      const newSet = new Set(bookmarkedChannels);
      if (newSet.has(channelId)) newSet.delete(channelId);
      else newSet.add(channelId);
      setBookmarkedChannels(newSet);
  };

  const toggleFollow = (e: React.MouseEvent, channelId: string) => {
      e.stopPropagation();
      const newSet = new Set(followedChannels);
      if (newSet.has(channelId)) newSet.delete(channelId);
      else newSet.add(channelId);
      setFollowedChannels(newSet);
  };

  const handleShare = async (e: React.MouseEvent, channel: Channel) => {
      e.stopPropagation();
      if (navigator.share) {
          try {
              await navigator.share({
                  title: channel.title,
                  text: `Check out this podcast: ${channel.title}`,
                  url: window.location.href
              });
          } catch (err) {
              console.log("Share cancelled");
          }
      } else {
          alert("Link copied to clipboard!");
      }
  };

  const handleCreatorClick = (e: React.MouseEvent, channel: Channel) => {
      e.stopPropagation();
      setViewingCreator(channel);
  };

  return (
    <>
    {/* DESKTOP VIEW: STANDARD GRID (EXPLORE) */}
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
                    />
                ))}
            </div>
            {recommendedChannels.length === 0 && (
                <div className="py-20 text-center text-slate-500">
                    No podcasts found.
                </div>
            )}
        </div>
    </div>

    {/* MOBILE VIEW: TIKTOK STYLE FEED */}
    <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="md:hidden h-[calc(100vh-64px)] w-full bg-black overflow-y-scroll snap-y snap-mandatory scroll-smooth no-scrollbar relative"
    >
        {/* Mobile Pull Indicator */}
        <div className="w-full absolute top-16 left-0 flex justify-center pointer-events-none z-20">
             {isRefreshing && (
                 <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-full text-white text-xs font-bold flex items-center gap-2 animate-fade-in-down border border-white/10">
                     <Loader2 size={14} className="animate-spin" /> Refreshing Feed...
                 </div>
             )}
        </div>

        {recommendedChannels.length === 0 && (
            <div className="h-full w-full flex items-center justify-center text-slate-500 snap-start">
                <p>No podcasts found.</p>
            </div>
        )}
        
        {recommendedChannels.map((channel, index) => {
            const isLiked = likedChannels.has(channel.id);
            const isBookmarked = bookmarkedChannels.has(channel.id);
            const isFollowed = followedChannels.has(channel.id);
            
            return (
            <div key={channel.id} className="h-full w-full snap-start relative flex flex-col justify-center bg-slate-900 border-b border-slate-800">
                {/* Background / Video Area */}
                <div 
                    className="absolute inset-0 cursor-pointer"
                    onClick={() => onChannelClick(channel.id)}
                >
                    <img 
                        src={channel.imageUrl} 
                        alt={channel.title} 
                        className="w-full h-full object-cover opacity-80"
                        loading={index < 2 ? "eager" : "lazy"}
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/90"></div>
                    
                    {/* Play Icon Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                        <Play size={64} fill="white" className="text-white" />
                    </div>
                </div>

                {/* Right Sidebar Actions (The TikTok Bar) */}
                <div className="absolute right-2 bottom-24 flex flex-col items-center gap-6 z-20">
                    
                    {/* Creator Profile */}
                    <div className="relative mb-2 cursor-pointer" onClick={(e) => handleCreatorClick(e, channel)}>
                        <img 
                            src={channel.imageUrl} // Ideally author avatar, fallback to channel image
                            className="w-12 h-12 rounded-full border-2 border-white object-cover" 
                            alt="Creator"
                        />
                        {!isFollowed && (
                            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-red-500 rounded-full p-0.5 border border-white" onClick={(e) => toggleFollow(e, channel.id)}>
                                <Plus size={12} color="white" strokeWidth={4} />
                            </div>
                        )}
                    </div>

                    {/* Like */}
                    <button onClick={(e) => toggleLike(e, channel.id)} className="flex flex-col items-center gap-1 group">
                        <div className={`p-2 rounded-full transition-transform active:scale-75 ${isLiked ? '' : 'bg-black/20 backdrop-blur-sm'}`}>
                            <Heart size={32} fill={isLiked ? "#ef4444" : "rgba(255,255,255,0.9)"} className={isLiked ? "text-red-500" : "text-white"} />
                        </div>
                        <span className="text-white text-xs font-bold shadow-black drop-shadow-md">{channel.likes + (isLiked ? 1 : 0)}</span>
                    </button>

                    {/* Comments */}
                    <button onClick={(e) => { e.stopPropagation(); if(onCommentClick) onCommentClick(channel); }} className="flex flex-col items-center gap-1">
                        <div className="p-2 rounded-full bg-black/20 backdrop-blur-sm transition-transform active:scale-75">
                            <MessageSquare size={32} fill="white" className="text-white" />
                        </div>
                        <span className="text-white text-xs font-bold shadow-black drop-shadow-md">{channel.comments?.length || 0}</span>
                    </button>

                    {/* Bookmark */}
                    <button onClick={(e) => toggleBookmark(e, channel.id)} className="flex flex-col items-center gap-1">
                        <div className="p-2 rounded-full bg-black/20 backdrop-blur-sm transition-transform active:scale-75">
                            <Bookmark size={32} fill={isBookmarked ? "#f59e0b" : "rgba(255,255,255,0.9)"} className={isBookmarked ? "text-amber-500" : "text-white"} />
                        </div>
                        <span className="text-white text-xs font-bold shadow-black drop-shadow-md">Save</span>
                    </button>

                    {/* Share */}
                    <button onClick={(e) => handleShare(e, channel)} className="flex flex-col items-center gap-1">
                        <div className="p-2 rounded-full bg-black/20 backdrop-blur-sm transition-transform active:scale-75">
                            <Share2 size={32} fill="rgba(255,255,255,0.9)" className="text-white" />
                        </div>
                        <span className="text-white text-xs font-bold shadow-black drop-shadow-md">Share</span>
                    </button>

                    {/* Spinning Disc (Audio Indicator) */}
                    <div className="mt-4 relative animate-spin-slow">
                        <div className="w-10 h-10 rounded-full bg-slate-800 border-4 border-slate-700 overflow-hidden flex items-center justify-center">
                            <img src={channel.imageUrl} className="w-full h-full object-cover opacity-80" />
                        </div>
                        <div className="absolute -right-2 -bottom-2">
                            <Music size={12} className="text-white animate-bounce" />
                        </div>
                    </div>
                </div>

                {/* Bottom Info Overlay */}
                <div className="absolute left-0 bottom-0 w-full p-4 pb-6 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none pr-20">
                    <div className="pointer-events-auto">
                        <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-white font-bold text-lg drop-shadow-md cursor-pointer hover:underline" onClick={(e) => handleCreatorClick(e, channel)}>
                                @{channel.author}
                            </h3>
                            {index < 2 && (
                                <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                                    TOP PICK
                                </span>
                            )}
                        </div>
                        
                        <p className="text-white/90 text-sm mb-3 line-clamp-2 leading-relaxed drop-shadow-sm">
                            {channel.description} <span className="font-bold text-white cursor-pointer">...more</span>
                        </p>

                        {/* Scrolling Music/Tags Marquee */}
                        <div className="flex items-center gap-2 text-white/80 text-xs font-medium overflow-hidden whitespace-nowrap">
                            <Music size={12} />
                            <div className="flex gap-4 animate-marquee">
                                <span>Original Audio - {channel.voiceName}</span>
                                {channel.tags.map(t => <span key={t}>#{t}</span>)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            );
        })}
    </div>

    {viewingCreator && (
        <CreatorProfileModal 
            isOpen={true}
            onClose={() => setViewingCreator(null)}
            channel={viewingCreator}
            onMessage={() => {
                alert("Redirecting to messages...");
                setViewingCreator(null);
            }}
        />
    )}
    </>
  );
};
