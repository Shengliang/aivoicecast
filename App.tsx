import React, { useState, useEffect } from 'react';
import { Channel, UserProfile } from './types';
import { voteChannel, getUserProfile, getPublicChannels } from './services/firestoreService';
import { auth } from './services/firebaseConfig';
import { PodcastFeed } from './components/PodcastFeed';
import { StudioMenu } from './components/StudioMenu';
import { ChannelSettingsModal } from './components/ChannelSettingsModal';
import { CommentsModal } from './components/CommentsModal';
import { HANDCRAFTED_CHANNELS } from './utils/initialData';

const App: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>(HANDCRAFTED_CHANNELS);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [globalVoice, setGlobalVoice] = useState('Auto');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [channelToEdit, setChannelToEdit] = useState<Channel | null>(null);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentChannel, setCommentChannel] = useState<Channel | null>(null);

  // Load public channels from Firestore on mount
  useEffect(() => {
    getPublicChannels().then(publicChannels => {
      // Merge with handcrafted, avoiding duplicates by ID
      const ids = new Set(publicChannels.map(c => c.id));
      const filteredHandcrafted = HANDCRAFTED_CHANNELS.filter(c => !ids.has(c.id));
      setChannels([...filteredHandcrafted, ...publicChannels]);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      if (user) {
        const profile = await getUserProfile(user.uid);
        setUserProfile(profile);
      } else {
        setUserProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleVote = async (id: string, type: 'like' | 'dislike', e: React.MouseEvent) => {
    e.stopPropagation();
    
    // 1. Optimistic UI Update (Toggle Logic)
    setChannels(prev => prev.map(c => {
      if (c.id === id) {
        // If type is 'like', increment. If 'dislike' (unlike), decrement.
        // Ensure we don't show negative likes visually
        const newLikes = type === 'like' ? c.likes + 1 : Math.max(0, c.likes - 1);
        return { ...c, likes: newLikes };
      }
      return c;
    }));

    // 2. Persist to Firestore (Handling promotion of static channels & User History)
    const channel = channels.find(c => c.id === id);
    if (channel) {
        await voteChannel(channel, type);
        
        // 3. Update User Profile Locally (Optimistic)
        if (currentUser && userProfile) {
            const currentLikes = userProfile.likedChannelIds || [];
            let newLikesList = [...currentLikes];
            
            if (type === 'like') {
                if (!newLikesList.includes(id)) newLikesList.push(id);
            } else {
                newLikesList = newLikesList.filter(lid => lid !== id);
            }
            
            setUserProfile({ ...userProfile, likedChannelIds: newLikesList });
        }
    }
  };

  const onChannelClick = (id: string) => {
    console.log("Channel clicked:", id);
    // Navigation logic would go here
  };

  const onStartLiveSession = (channel: Channel) => {
    console.log("Start live session:", channel.title);
    // Live session logic would go here
  };

  const onCommentClick = (channel: Channel) => {
    setCommentChannel(channel);
    setIsCommentsOpen(true);
  };

  return (
    <div className="h-screen bg-slate-950 text-white flex flex-col">
      {/* Mock Header for Context */}
      <div className="p-4 border-b border-slate-800 flex justify-between items-center">
        <h1 className="text-xl font-bold">AIVoiceCast</h1>
        <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="p-2 bg-slate-800 rounded-full">
           User
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        <PodcastFeed 
          channels={channels}
          onChannelClick={onChannelClick}
          onStartLiveSession={onStartLiveSession}
          userProfile={userProfile}
          globalVoice={globalVoice}
          currentUser={currentUser}
          handleVote={handleVote}
          setChannelToEdit={setChannelToEdit}
          setIsSettingsModalOpen={setIsSettingsModalOpen}
          onCommentClick={onCommentClick}
        />
      </div>

      <StudioMenu 
        isUserMenuOpen={isUserMenuOpen}
        setIsUserMenuOpen={setIsUserMenuOpen}
        userProfile={userProfile}
        setUserProfile={setUserProfile}
        currentUser={currentUser}
        globalVoice={globalVoice}
        setGlobalVoice={setGlobalVoice}
        hasApiKey={!!localStorage.getItem('gemini_api_key')}
        setIsCreateModalOpen={() => {}}
        setIsVoiceCreateOpen={() => {}}
        setIsApiKeyModalOpen={() => {}}
        setIsSyncModalOpen={() => {}}
        setIsSettingsModalOpen={() => {}}
        onOpenUserGuide={() => {}}
        t={{}}
      />

      {isSettingsModalOpen && channelToEdit && (
        <ChannelSettingsModal 
          isOpen={true}
          onClose={() => setIsSettingsModalOpen(false)}
          channel={channelToEdit}
          onUpdate={(updated) => {
             setChannels(prev => prev.map(c => c.id === updated.id ? updated : c));
          }}
        />
      )}

      {isCommentsOpen && commentChannel && (
        <CommentsModal 
          isOpen={true}
          onClose={() => setIsCommentsOpen(false)}
          channel={commentChannel}
          onAddComment={() => {}}
          currentUser={currentUser}
        />
      )}
    </div>
  );
};

export default App;