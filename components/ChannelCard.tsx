import React, { useState, useEffect } from 'react';
import { Channel, ChannelStats } from '../types';
import { Play, Heart, MessageSquare, Lock, Globe, Users, Edit, Share2, Bookmark, User, Mic } from 'lucide-react';
import { OFFLINE_CHANNEL_ID } from '../utils/offlineContent';
import { shareChannel, subscribeToChannelStats } from '../services/firestoreService';

interface ChannelCardProps {
  channel: Channel;
  handleChannelClick: (id: string) => void;
  handleVote: (id: string, type: 'like' | 'dislike', e: React.MouseEvent) => void;
  currentUser: any;
  setChannelToEdit: (channel: Channel) => void;
  setIsSettingsModalOpen: (open: boolean) => void;
  globalVoice: string;
  t: any;
  onCommentClick: (channel: Channel) => void;
  isLiked?: boolean;
  onCreatorClick?: (e: React.MouseEvent) => void;
}

export const ChannelCard: React.FC<ChannelCardProps> = ({ 
  channel, handleChannelClick, handleVote, currentUser, 
  setChannelToEdit, setIsSettingsModalOpen, globalVoice, t,
  onCommentClick, isLiked = false, onCreatorClick
}) => {
  const isOwner = currentUser && (channel.ownerId === currentUser.uid || currentUser.email === 'shengliang.song@gmail.com');
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [hasLiked, setHasLiked] = useState(isLiked);
  
  const [stats, setStats] = useState<ChannelStats>({
      likes: channel.likes,
      dislikes: channel.dislikes,
      shares: channel.shares || 0
  });

  useEffect(() => {
      const unsubscribe = subscribeToChannelStats(channel.id, (newStats) => {
          setStats(prev => ({ ...prev, ...newStats }));
      }, { likes: channel.likes, dislikes: channel.dislikes, shares: channel.shares || 0 });
      return () => unsubscribe();
  }, [channel.id]);

  useEffect(() => {
      setHasLiked(isLiked);
  }, [isLiked]);

  const handleShareClick = async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
          await shareChannel(channel.id);
          if (navigator.share) {
              await navigator.share({
                  title: channel.title,
                  text: channel.description,
                  url: window.location.href
              });
          } else {
              await navigator.clipboard.writeText(window.location.href);
              alert("Link copied to clipboard!");
          }
      } catch(err) {
          console.error("Share failed", err);
      }
  };

  const handleBookmarkClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsBookmarked(!isBookmarked);
  };

  const handleLikeClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!currentUser) {
          alert("Please sign in to like.");
          return;
      }
      
      if (hasLiked) {
          handleVote(channel.id, 'dislike', e);
          setHasLiked(false);
      } else {
          handleVote(channel.id, 'like', e);
          setHasLiked(true);
      }
  };

  // Assign a consistent color based on the first tag or ID
  const getAccentColor = () => {
      if (channel.id === OFFLINE_CHANNEL_ID) return 'border-indigo-500 bg-indigo-500/10';
      const colors = [
          'border-blue-500 bg-blue-500/5', 
          'border-emerald-500 bg-emerald-500/5', 
          'border-pink-500 bg-pink-500/5', 
          'border-amber-500 bg-amber-500/5', 
          'border-purple-500 bg-purple-500/5'
      ];
      const index = channel.title.length % colors.length;
      return colors[index];
  };

  const accentClass = getAccentColor();

  /**
   * Fix: Ensured valid JSX for all intrinsic elements.
   */
  return (
    <div 
      onClick={() => handleChannelClick(channel.id)}
      className={`group relative bg-slate-900 border-l-4 ${accentClass} border-y border-r border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-all duration-300 hover:shadow-xl hover:shadow-black/40 cursor-pointer flex flex-col p-5`}
    >
      <div className="absolute top-3 right-3 z-10 flex gap-2">
          {channel.visibility === 'private' && <div className="text-slate-500"><Lock size={12}/></div>}
          {channel.visibility === 'public' && <div className="text-emerald-500/50"><Globe size={12}/></div>}
          {channel.visibility === 'group' && <div className="text-purple-500/50"><Users size={12}/></div>}
          <button 
            onClick={handleBookmarkClick}
            className={`transition-colors ${isBookmarked ? 'text-amber-400' : 'text-slate-600 hover:text-amber-400'}`}
          >
            <Bookmark size={14} fill={isBookmarked ? "currentColor" : "none"} />
          </button>
      </div>
      
      <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700 group-hover:bg-indigo-600 group-hover:border-indigo-500 transition-all">
              <Mic size={20} className="text-indigo-400 group-hover:text-white transition-colors" />
          </div>
          <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold text-white group-hover:text-indigo-400 transition-colors line-clamp-1 leading-tight">{channel.title}</h3>
              <div className="flex items-center gap-2 mt-1">
                  <button 
                      className="text-[10px] text-slate-500 hover:text-white hover:underline cursor-pointer transition-colors flex items-center gap-1"
                      onClick={(e) => {
                          e.stopPropagation();
                          if (onCreatorClick) onCreatorClick(e);
                      }}
                  >
                      <User size={10} />
                      <span className="truncate max-w-[120px]">@{channel.author}</span>
                  </button>
                  <span className="text-[10px] text-slate-700">•</span>
                  <span className="text-[10px] text-slate-500 font-mono">Voice: {channel.voiceName}</span>
              </div>
          </div>
      </div>
      
      <p className="text-slate-400 text-xs mb-5 line-clamp-2 flex-1 leading-relaxed">
        {channel.description}
      </p>

      <div className="flex flex-wrap gap-1.5 mb-5">
        {channel.tags.slice(0, 3).map(tag => (
          <span key={tag} className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700/50">
            {tag}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-800/50">
        <div className="flex items-center gap-4">
          <button 
            onClick={handleLikeClick}
            className={`flex items-center gap-1.5 transition-colors group/btn ${hasLiked ? 'text-red-500' : 'text-slate-500 hover:text-red-500'}`}
          >
            <Heart size={16} className={hasLiked ? "fill-red-500" : ""} />
            <span className="text-xs font-bold font-mono">{stats.likes}</span>
          </button>
          
          <button 
            onClick={(e) => {
              e.stopPropagation();
              if(onCommentClick) onCommentClick(channel);
            }}
            className="flex items-center gap-1.5 text-slate-500 hover:text-indigo-400 transition-colors"
          >
            <MessageSquare size={16} />
            <span className="text-xs font-bold font-mono">{channel.comments.length}</span>
          </button>
        </div>
        
        <div className="flex items-center gap-2">
            {isOwner && (
                <button 
                   onClick={(e) => {
                      e.stopPropagation();
                      setChannelToEdit(channel);
                      setIsSettingsModalOpen(true);
                   }}
                   className="p-1.5 bg-slate-800 rounded-lg text-slate-500 hover:text-white hover:bg-indigo-600 transition-colors"
                >
                   <Edit size={14} />
                </button>
            )}
            <button 
              onClick={handleShareClick}
              className="p-1.5 bg-slate-800 rounded-lg text-slate-500 hover:text-white transition-colors"
            >
              <Share2 size={14} />
            </button>
            <button className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-black shadow-lg transition-all group-hover:scale-105">
                <Play size={10} fill="currentColor"/> <span>OPEN</span>
            </button>
        </div>
      </div>
    </div>
  );
};