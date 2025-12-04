
import React from 'react';
import { Channel } from '../types';
import { Play, ThumbsUp, ThumbsDown, MessageSquare, Lock, Globe, Users, Edit } from 'lucide-react';
import { OFFLINE_CHANNEL_ID } from '../utils/offlineContent';

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
}

export const ChannelCard: React.FC<ChannelCardProps> = ({ 
  channel, handleChannelClick, handleVote, currentUser, 
  setChannelToEdit, setIsSettingsModalOpen, globalVoice, t,
  onCommentClick
}) => {
  const isOwner = currentUser && (channel.ownerId === currentUser.uid || currentUser.email === 'shengliang.song@gmail.com');

  return (
    <div 
      onClick={() => handleChannelClick(channel.id)}
      className={`group relative bg-slate-900 border ${channel.id === OFFLINE_CHANNEL_ID ? 'border-indigo-500/50 shadow-indigo-500/20 shadow-lg' : 'border-slate-800'} rounded-xl overflow-hidden hover:border-indigo-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-500/10 cursor-pointer flex flex-col`}
    >
      <div className="absolute top-2 right-2 z-10 flex gap-1">
          {channel.visibility === 'private' && <div className="bg-slate-900/80 p-1 rounded-full text-slate-400"><Lock size={12}/></div>}
          {channel.visibility === 'public' && <div className="bg-emerald-900/80 p-1 rounded-full text-emerald-400"><Globe size={12}/></div>}
          {channel.visibility === 'group' && <div className="bg-purple-900/80 p-1 rounded-full text-purple-400"><Users size={12}/></div>}
      </div>
      
      {/* Quick Edit Button for Owners */}
      {isOwner && (
         <div className="absolute top-2 left-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
               onClick={(e) => {
                  e.stopPropagation();
                  setChannelToEdit(channel);
                  setIsSettingsModalOpen(true);
               }}
               className="p-1.5 bg-slate-900/80 rounded-full text-slate-300 hover:text-white hover:bg-indigo-600 transition-colors"
               title="Edit Channel"
            >
               <Edit size={14} />
            </button>
         </div>
      )}

      <div className="aspect-video relative overflow-hidden bg-slate-800">
        <img 
          src={channel.imageUrl} 
          alt={channel.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (target.src.includes('placehold.co')) return;
            target.src = `https://placehold.co/600x400/1e293b/white?text=${encodeURIComponent(channel.title)}`;
          }}
        />
        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <div className="w-12 h-12 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/20 group-hover:scale-110 transition-transform">
            <Play className="text-white ml-1" fill="currentColor" />
          </div>
        </div>
      </div>
      
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="text-lg font-bold text-white group-hover:text-indigo-400 transition-colors line-clamp-1">{channel.title}</h3>
            <p className="text-xs text-slate-500">{t.host}: <span className={globalVoice !== 'Auto' ? 'text-indigo-300 font-semibold' : ''}>{channel.voiceName}</span></p>
          </div>
        </div>
        
        <p className="text-slate-400 text-sm mb-4 line-clamp-2 flex-1">
          {channel.description}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {channel.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-xs px-2 py-1 rounded-md bg-slate-800 text-slate-400 border border-slate-700">
              #{tag}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <div className="flex space-x-4">
            <button 
              onClick={(e) => handleVote(channel.id, 'like', e)}
              className="flex items-center space-x-1 text-slate-500 hover:text-emerald-400 transition-colors"
            >
              <ThumbsUp size={16} />
              <span className="text-xs">{channel.likes}</span>
            </button>
            <button 
              onClick={(e) => handleVote(channel.id, 'dislike', e)}
              className="flex items-center space-x-1 text-slate-500 hover:text-red-400 transition-colors"
            >
              <ThumbsDown size={16} />
              <span className="text-xs">{channel.dislikes}</span>
            </button>
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onCommentClick(channel);
            }}
            className="flex items-center space-x-1 text-slate-500 hover:text-indigo-400 transition-colors"
          >
            <MessageSquare size={16} />
            <span className="text-xs">{channel.comments.length}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
