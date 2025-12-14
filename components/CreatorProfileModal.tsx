
import React, { useState, useEffect } from 'react';
import { X, User, MessageSquare, Heart, Users, Check, Bell, Play } from 'lucide-react';
import { Channel, UserProfile } from '../types';
import { getUserProfile, followUser, unfollowUser } from '../services/firestoreService';

interface CreatorProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: Channel;
  onMessage: () => void;
  currentUser?: any;
}

export const CreatorProfileModal: React.FC<CreatorProfileModalProps> = ({ isOpen, onClose, channel, onMessage, currentUser }) => {
  const [creatorProfile, setCreatorProfile] = useState<UserProfile | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'posts' | 'community'>('posts');
  const [isLoading, setIsLoading] = useState(false);

  // Load creator profile data
  useEffect(() => {
    if (isOpen && channel.ownerId) {
        setIsLoading(true);
        getUserProfile(channel.ownerId).then(profile => {
            if (profile) {
                setCreatorProfile(profile);
                setFollowerCount(profile.followers?.length || 0);
                if (currentUser && profile.followers?.includes(currentUser.uid)) {
                    setIsFollowing(true);
                }
            }
            setIsLoading(false);
        }).catch(err => {
            console.error("Failed to load creator profile", err);
            setIsLoading(false);
        });
    } else {
        // Fallback for static/system channels
        setFollowerCount(1205); // Mock for offline
    }
  }, [isOpen, channel.ownerId, currentUser]);

  if (!isOpen) return null;

  const handleFollow = async () => {
    if (!currentUser) {
        alert("Please sign in to follow creators.");
        return;
    }
    if (!channel.ownerId) {
        alert("This is a system channel and cannot be followed.");
        return;
    }

    if (isFollowing) {
        setIsFollowing(false);
        setFollowerCount(prev => Math.max(0, prev - 1));
        try {
            await unfollowUser(currentUser.uid, channel.ownerId);
        } catch (e) {
            console.error("Unfollow failed", e);
            // Revert on failure
            setIsFollowing(true);
            setFollowerCount(prev => prev + 1);
        }
    } else {
        setIsFollowing(true);
        setFollowerCount(prev => prev + 1);
        try {
            await followUser(currentUser.uid, channel.ownerId);
        } catch (e) {
            console.error("Follow failed", e);
            // Revert on failure
            setIsFollowing(false);
            setFollowerCount(prev => Math.max(0, prev - 1));
        }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full sm:w-[400px] bg-slate-900 border-t sm:border border-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        
        {/* Header / Cover */}
        <div className="h-24 bg-gradient-to-r from-indigo-900 to-purple-900 relative">
            <button 
                onClick={onClose}
                className="absolute top-4 right-4 bg-black/20 hover:bg-black/40 text-white p-2 rounded-full backdrop-blur-md transition-colors z-10"
            >
                <X size={20} />
            </button>
        </div>

        <div className="px-6 pb-6 -mt-12 flex flex-col items-center text-center">
            {/* Avatar */}
            <div className="relative">
                <img 
                    src={channel.imageUrl} 
                    alt={channel.title} 
                    className="w-24 h-24 rounded-full border-4 border-slate-900 object-cover bg-slate-800"
                />
                {isFollowing && (
                    <div className="absolute bottom-1 right-1 bg-emerald-500 text-white p-1 rounded-full border-2 border-slate-900">
                        <Check size={12} strokeWidth={4} />
                    </div>
                )}
            </div>

            <h2 className="text-xl font-bold text-white mt-3">{creatorProfile?.displayName || channel.author}</h2>
            <p className="text-sm text-slate-400">@{channel.voiceName.toLowerCase()}_official</p>

            {/* Stats Row */}
            <div className="flex items-center gap-6 mt-4 text-sm">
                <div className="flex flex-col items-center">
                    <span className="font-bold text-white">{creatorProfile?.following?.length || 142}</span>
                    <span className="text-slate-500 text-xs">Following</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="font-bold text-white">{followerCount.toLocaleString()}</span>
                    <span className="text-slate-500 text-xs">Followers</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="font-bold text-white">{(channel.likes * 12).toLocaleString()}</span>
                    <span className="text-slate-500 text-xs">Likes</span>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 w-full mt-6">
                <button 
                    onClick={handleFollow}
                    className={`flex-1 py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${
                        isFollowing 
                        ? 'bg-slate-800 text-slate-200 border border-slate-700' 
                        : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20'
                    }`}
                >
                    {isFollowing ? (
                        <>Following</>
                    ) : (
                        <>Follow</>
                    )}
                </button>
                <button 
                    onClick={onMessage}
                    className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold border border-slate-700 transition-colors flex items-center justify-center gap-2"
                >
                    <MessageSquare size={18} />
                    Message
                </button>
            </div>
            
            {/* Bio */}
            <p className="text-sm text-slate-300 mt-6 leading-relaxed line-clamp-3">
                {channel.description}
            </p>
        </div>

        {/* Content Tabs */}
        <div className="flex border-t border-slate-800 mt-2 bg-slate-900">
            <button 
                onClick={() => setActiveTab('posts')}
                className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'posts' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
            >
                <Users size={20} />
            </button>
            <button 
                onClick={() => setActiveTab('community')}
                className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'community' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
            >
                <Heart size={20} />
            </button>
        </div>
        
        {/* Content Grid */}
        <div className="flex-1 overflow-y-auto bg-slate-900">
            {activeTab === 'posts' ? (
                <>
                    <div className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 bg-slate-900 z-10 border-b border-slate-800">
                        Recent Episodes
                    </div>
                    <div className="grid grid-cols-3 gap-0.5">
                        {[1,2,3,4,5,6].map(i => (
                            <div key={i} className="aspect-[3/4] bg-slate-800 relative group cursor-pointer">
                                <img src={`https://picsum.photos/200/300?random=${i}`} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"/>
                                <div className="absolute bottom-1 right-1 flex items-center gap-1 text-[10px] text-white font-bold drop-shadow-md">
                                    <Play size={8} fill="white" /> {(Math.random() * 10).toFixed(1)}k
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div className="p-8 text-center text-slate-500 flex flex-col items-center">
                    <Heart size={32} className="mb-2 opacity-20"/>
                    <p className="text-sm">Liked content hidden.</p>
                </div>
            )}
        </div>

      </div>
    </div>
  );
};
