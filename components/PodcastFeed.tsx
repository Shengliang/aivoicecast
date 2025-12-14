
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Channel, UserProfile } from '../types';
import { Play, MessageSquare, ThumbsUp, Star, Info, RefreshCw, Loader2 } from 'lucide-react';

interface PodcastFeedProps {
  channels: Channel[];
  onChannelClick: (id: string) => void;
  onStartLiveSession: (channel: Channel) => void; 
  userProfile: UserProfile | null;
  globalVoice: string;
  onRefresh?: () => void; // New prop for pull-to-refresh
}

export const PodcastFeed: React.FC<PodcastFeedProps> = ({ 
  channels, onChannelClick, onStartLiveSession, userProfile, globalVoice, onRefresh 
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Logic to rank/filter channels based on interests
  const recommendedChannels = useMemo(() => {
      // If user has no interests, fallback to trending (most likes)
      if (!userProfile?.interests || userProfile.interests.length === 0) {
          const sorted = [...channels].sort((a, b) => b.likes - a.likes);
          return sorted;
      }

      // Score channels based on tag overlaps
      const scored = channels.map(ch => {
          let score = 0;
          // Exact Match
          if (userProfile.interests?.some(i => ch.tags.includes(i))) score += 10;
          // Partial text match in title/desc
          if (userProfile.interests?.some(i => ch.title.toLowerCase().includes(i.toLowerCase()))) score += 5;
          // Popularity bonus
          score += (ch.likes / 100); 
          
          return { channel: ch, score };
      });

      // Sort by score desc
      scored.sort((a, b) => b.score - a.score);
      return scored.map(s => s.channel);
  }, [channels, userProfile]);

  // Handle Scroll for Refresh
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      if (e.currentTarget.scrollTop < -50 && !isRefreshing && onRefresh) {
          setIsRefreshing(true);
          setTimeout(() => {
              onRefresh();
              setIsRefreshing(false);
          }, 1500);
      }
  };

  return (
    <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-[calc(100vh-64px)] md:h-[calc(100vh-64px)] h-[100dvh] w-full bg-slate-950 overflow-y-scroll snap-y snap-mandatory scroll-smooth no-scrollbar relative"
    >
        {/* Mobile Pull Indicator */}
        <div className="w-full absolute top-16 left-0 flex justify-center pointer-events-none md:hidden z-20">
             {isRefreshing && (
                 <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-full text-white text-xs font-bold flex items-center gap-2 animate-fade-in-down">
                     <Loader2 size={14} className="animate-spin" /> Refreshing Feed...
                 </div>
             )}
        </div>

        {recommendedChannels.length === 0 && (
            <div className="h-full w-full flex items-center justify-center text-slate-500 snap-start">
                <p>No podcasts found. Try adjusting your interests.</p>
            </div>
        )}
        
        {recommendedChannels.map((channel, index) => (
            <div key={channel.id} className="h-full w-full snap-start relative flex flex-col items-center justify-center p-0 md:p-4">
                
                {/* Main Card Container - Full Screen on Mobile, Card on Desktop */}
                <div 
                    className="w-full h-full md:max-w-2xl bg-slate-900 md:rounded-3xl overflow-hidden shadow-2xl relative group cursor-pointer border-b border-slate-800 md:border-0"
                    onClick={() => onChannelClick(channel.id)}
                >
                    {/* Background Image */}
                    <div className="absolute inset-0">
                        <img 
                            src={channel.imageUrl} 
                            alt={channel.title} 
                            className="w-full h-full object-cover opacity-60 transition-transform duration-700 group-hover:scale-105"
                            loading={index < 2 ? "eager" : "lazy"}
                        />
                        {/* Gradient Overlay for Readability */}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-slate-950/30"></div>
                    </div>

                    {/* Content Overlay */}
                    <div className="absolute inset-0 flex flex-col justify-end p-6 pb-24 md:pb-8 md:p-8 z-10">
                        
                        {/* Top Metadata (floating) */}
                        <div className="absolute top-24 md:top-6 left-6 flex gap-2">
                            <span className="bg-black/40 backdrop-blur-md text-white text-xs font-bold px-3 py-1 rounded-full border border-white/10 flex items-center gap-1">
                                {channel.voiceName}
                            </span>
                            {index === 0 && userProfile?.interests?.length && userProfile.interests.length > 0 && (
                                <span className="bg-indigo-600/90 backdrop-blur-md text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-lg shadow-indigo-500/20">
                                    <Star size={12} fill="currentColor" /> Top Pick
                                </span>
                            )}
                        </div>

                        {/* Text Content */}
                        <div className="mb-6 space-y-3">
                            <h2 className="text-3xl md:text-4xl font-extrabold text-white leading-tight drop-shadow-lg line-clamp-2">
                                {channel.title}
                            </h2>
                            <p className="text-slate-200 text-sm md:text-base line-clamp-3 max-w-xl leading-relaxed drop-shadow-md font-medium">
                                {channel.description}
                            </p>
                            
                            {/* Tags */}
                            <div className="flex flex-wrap gap-2 pt-2">
                                {channel.tags.slice(0, 3).map(tag => (
                                    <span key={tag} className="text-xs text-indigo-100 bg-indigo-500/30 border border-indigo-400/30 px-2 py-1 rounded-md backdrop-blur-sm">
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Action Buttons Row */}
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={(e) => { e.stopPropagation(); onStartLiveSession(channel); }}
                                className="flex-1 bg-white text-slate-900 hover:bg-slate-200 font-bold py-3 md:py-4 rounded-xl md:rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-white/10 transition-transform hover:scale-[1.02]"
                            >
                                <Play size={20} fill="currentColor" />
                                <span>Play Now</span>
                            </button>
                            
                            <button 
                                onClick={(e) => { e.stopPropagation(); onChannelClick(channel.id); }}
                                className="px-4 md:px-6 py-3 md:py-4 bg-slate-800/60 hover:bg-slate-700/80 backdrop-blur-md text-white font-bold rounded-xl md:rounded-2xl border border-white/10 transition-colors flex items-center gap-2"
                            >
                                <Info size={20} />
                                <span className="hidden sm:inline">Details</span>
                            </button>

                            {/* Engagement Stats - Visual Only for feed */}
                            <div className="flex flex-col gap-4 ml-auto mb-2">
                                <div className="flex flex-col items-center gap-1">
                                    <div className="p-3 bg-slate-800/40 backdrop-blur-md rounded-full text-white hover:bg-slate-700/60 transition-colors cursor-pointer border border-white/5">
                                        <ThumbsUp size={24} />
                                    </div>
                                    <span className="text-[10px] font-bold text-white drop-shadow-md">{channel.likes}</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <div className="p-3 bg-slate-800/40 backdrop-blur-md rounded-full text-white hover:bg-slate-700/60 transition-colors cursor-pointer border border-white/5">
                                        <MessageSquare size={24} />
                                    </div>
                                    <span className="text-[10px] font-bold text-white drop-shadow-md">{channel.comments?.length || 0}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        ))}
    </div>
  );
};
