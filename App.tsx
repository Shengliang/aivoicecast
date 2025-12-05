import React, { useState, useEffect, useMemo } from 'react';
import { Channel, ViewState, UserProfile, TranscriptItem } from './types';
import { 
  Podcast, Mic, Layout, Search, Sparkles, LogOut, 
  Settings, Menu, X, Plus, Github, Database, Cloud, Globe, 
  Calendar, Briefcase, Users, Disc, FileText, AlertTriangle 
} from 'lucide-react';
import { LiveSession } from './components/LiveSession';
import { PodcastDetail } from './components/PodcastDetail';
import { ChannelCard } from './components/ChannelCard';
import { UserAuth } from './components/UserAuth';
import { CreateChannelModal } from './components/CreateChannelModal';
import { VoiceCreateModal } from './components/VoiceCreateModal';
import { ApiKeyModal } from './components/ApiKeyModal';
import { DataSyncModal } from './components/DataSyncModal';
import { FirebaseConfigModal } from './components/FirebaseConfigModal';
import { DebugView } from './components/DebugView';
import { CloudDebugView } from './components/CloudDebugView';
import { PublicChannelInspector } from './components/PublicChannelInspector';
import { StudioMenu } from './components/StudioMenu';
import { ChannelSettingsModal } from './components/ChannelSettingsModal';
import { CommentsModal } from './components/CommentsModal';
import { Notifications } from './components/Notifications';
import { GroupManager } from './components/GroupManager';
import { MentorBooking } from './components/MentorBooking';
import { RecordingList } from './components/RecordingList';
import { DocumentList } from './components/DocumentList';
import { CalendarView } from './components/CalendarView';

import { auth, isFirebaseConfigured } from './services/firebaseConfig';
import { 
  voteChannel, publishChannelToFirestore, updateCommentInChannel, 
  deleteCommentFromChannel, addCommentToChannel, getPublicChannels, 
  subscribeToPublicChannels, getGroupChannels, getUserProfile
} from './services/firestoreService';
import { getUserChannels, saveUserChannel, deleteUserChannel } from './utils/db';
import { HANDCRAFTED_CHANNELS, CATEGORY_STYLES, TOPIC_CATEGORIES } from './utils/initialData';
import { OFFLINE_CHANNEL_ID } from './utils/offlineContent';
import { GEMINI_API_KEY } from './services/private_keys';

const UI_TEXT = {
  en: {
    appTitle: "AIVoiceCast",
    directory: "Discover",
    myFeed: "My Feed",
    live: "Live Studio",
    search: "Search topics...",
    create: "New Podcast",
    host: "Host",
    listeners: "Listeners",
    featured: "Featured",
    categories: "Categories",
    all: "All Podcasts",
    calendar: "Calendar",
    mentorship: "Mentorship",
    groups: "Groups",
    recordings: "Recordings",
    docs: "Documents"
  },
  zh: {
    appTitle: "AI 播客",
    directory: "发现",
    myFeed: "我的订阅",
    live: "直播间",
    search: "搜索主题...",
    create: "创建播客",
    host: "主播",
    listeners: "听众",
    featured: "精选",
    categories: "分类",
    all: "全部播客",
    calendar: "日历",
    mentorship: "导师",
    groups: "群组",
    recordings: "录音",
    docs: "文档"
  }
};

const App: React.FC = () => {
  const [language, setLanguage] = useState<'en' | 'zh'>('en');
  const t = UI_TEXT[language];
  const [viewState, setViewState] = useState<ViewState>('directory');
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  
  // Data State
  const [channels, setChannels] = useState<Channel[]>(HANDCRAFTED_CHANNELS);
  const [publicChannels, setPublicChannels] = useState<Channel[]>([]);
  const [userChannels, setUserChannels] = useState<Channel[]>([]);
  const [groupChannels, setGroupChannels] = useState<Channel[]>([]);
  
  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isVoiceCreateOpen, setIsVoiceCreateOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isFirebaseModalOpen, setIsFirebaseModalOpen] = useState(false);
  
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [channelToEdit, setChannelToEdit] = useState<Channel | null>(null);
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false);
  const [commentsChannel, setCommentsChannel] = useState<Channel | null>(null);

  // Live Session Config
  const [liveConfig, setLiveConfig] = useState<{
    context?: string;
    bookingId?: string;
    recording?: boolean;
    video?: boolean;
    camera?: boolean;
    segment?: { index: number, lectureId: string };
    transcript?: TranscriptItem[];
  }>({});

  // Ad-hoc Meeting Channel (Ephemeral)
  const [tempChannel, setTempChannel] = useState<Channel | null>(null);

  const [globalVoice, setGlobalVoice] = useState('Auto');

  useEffect(() => {
    // Check local storage, private key file, or process env
    const key = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY;
    setHasApiKey(!!key);

    let unsubscribeAuth = () => {};

    // Only attempt to connect auth if we have a valid config, otherwise we risk a crash
    if (isFirebaseConfigured) {
        unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
          setCurrentUser(user);
          if (user) {
            const profile = await getUserProfile(user.uid);
            setUserProfile(profile);
          } else {
            setUserProfile(null);
            setGroupChannels([]);
          }
        });
    } else {
        // Auto-open modal if configuration is missing
        setIsFirebaseModalOpen(true);
    }

    return () => unsubscribeAuth();
  }, []);

  // Load Data
  useEffect(() => {
    // 1. User Channels (IndexedDB)
    getUserChannels().then(setUserChannels);

    // 2. Public Channels (Firestore - Realtime)
    // Only subscribe if we have a valid config to avoid console spam of 404s
    if (isFirebaseConfigured) {
        const unsubPublic = subscribeToPublicChannels(
          (data) => setPublicChannels(data),
          (err) => console.error("Public channels error", err)
        );
        return () => { unsubPublic(); };
    }
  }, []);

  // Load Group Channels when profile updates
  useEffect(() => {
    if (userProfile && userProfile.groups && userProfile.groups.length > 0) {
       getGroupChannels(userProfile.groups).then(setGroupChannels);
    }
  }, [userProfile]);

  // Combine all channels
  useEffect(() => {
    // Dedup by ID
    const all = [...HANDCRAFTED_CHANNELS, ...userChannels, ...publicChannels, ...groupChannels];
    const unique = Array.from(new Map(all.map(item => [item.id, item])).values());
    
    // Sort: Handcrafted first, then by date desc
    unique.sort((a, b) => {
        const isAHand = HANDCRAFTED_CHANNELS.some(h => h.id === a.id);
        const isBHand = HANDCRAFTED_CHANNELS.some(h => h.id === b.id);
        if (isAHand && !isBHand) return -1;
        if (!isAHand && isBHand) return 1;
        return (b.createdAt || 0) - (a.createdAt || 0);
    });
    
    setChannels(unique);
  }, [userChannels, publicChannels, groupChannels]);

  // Active channel can be from the list OR the temporary one
  const activeChannel = useMemo(() => {
      return tempChannel || channels.find(c => c.id === activeChannelId);
  }, [channels, activeChannelId, tempChannel]);

  const handleVote = async (id: string, type: 'like' | 'dislike', e: React.MouseEvent) => {
    e.stopPropagation();
    // Optimistic Update
    setChannels(prev => prev.map(c => {
      if (c.id === id) {
        return type === 'like' ? { ...c, likes: c.likes + 1 } : { ...c, dislikes: c.dislikes + 1 };
      }
      return c;
    }));
    await voteChannel(id, type);
  };

  const handleCreateChannel = async (newChannel: Channel) => {
    if (newChannel.visibility === 'public') {
        await publishChannelToFirestore(newChannel);
    } else if (newChannel.visibility === 'group') {
        await publishChannelToFirestore(newChannel); // Groups also live in Firestore but filtered
    } else {
        await saveUserChannel(newChannel);
        setUserChannels(prev => [newChannel, ...prev]);
    }
    // Optimistic add to main list for immediate feedback
    setChannels(prev => [newChannel, ...prev]);
  };

  const handleUpdateChannel = async (updatedChannel: Channel) => {
      if (updatedChannel.visibility === 'public' || updatedChannel.visibility === 'group') {
          await publishChannelToFirestore(updatedChannel);
      } else {
          await saveUserChannel(updatedChannel);
          setUserChannels(prev => prev.map(c => c.id === updatedChannel.id ? updatedChannel : c));
      }
      // Force refresh logic via local state
      setChannels(prev => prev.map(c => c.id === updatedChannel.id ? updatedChannel : c));
  };

  const handleDeleteChannel = async () => {
      if (!channelToEdit) return;
      if (channelToEdit.visibility === 'public' || channelToEdit.visibility === 'group') {
          // Deleting from public inspector handles firestore
          alert("Public channels must be deleted via the Inspector for now."); 
      } else {
          await deleteUserChannel(channelToEdit.id);
          setUserChannels(prev => prev.filter(c => c.id !== channelToEdit.id));
      }
      setChannelToEdit(null);
  };

  const handleCommentClick = (channel: Channel) => {
      setCommentsChannel(channel);
      setIsCommentsModalOpen(true);
  };

  const handleAddComment = async (text: string, attachments: any[]) => {
      if (!commentsChannel || !currentUser) return;
      
      const newComment = {
          id: crypto.randomUUID(),
          userId: currentUser.uid,
          user: currentUser.displayName || 'Anonymous',
          text,
          timestamp: Date.now(),
          attachments
      };
      
      // Optimistic update
      const updatedChannel = { 
          ...commentsChannel, 
          comments: [...commentsChannel.comments, newComment] 
      };
      
      setCommentsChannel(updatedChannel);
      setChannels(prev => prev.map(c => c.id === commentsChannel.id ? updatedChannel : c));
      
      if (commentsChannel.visibility === 'public' || commentsChannel.visibility === 'group') {
          await addCommentToChannel(commentsChannel.id, newComment);
      } else {
          // Local update only
          await saveUserChannel(updatedChannel);
          setUserChannels(prev => prev.map(c => c.id === updatedChannel.id ? updatedChannel : c));
      }
  };

  const handleStartLiveSession = (channel: Channel, context?: string, recordingEnabled?: boolean, bookingId?: string, videoEnabled?: boolean, cameraEnabled?: boolean) => {
      // Check if this is an ad-hoc channel (not in list)
      const existing = channels.find(c => c.id === channel.id);
      
      if (!existing) {
          setTempChannel(channel); // Set ephemeral channel
      } else {
          setTempChannel(null);
      }
      
      setActiveChannelId(channel.id);
      setLiveConfig({
          context,
          bookingId,
          recording: recordingEnabled,
          video: videoEnabled,
          camera: cameraEnabled
      });
      setViewState('live_session');
  };

  const featuredGroups = useMemo(() => {
      const groups: Record<string, Channel[]> = {};
      
      // 1. Spotlight (Handcrafted)
      groups['Spotlight'] = HANDCRAFTED_CHANNELS;

      // 2. Categories from Utils
      Object.keys(TOPIC_CATEGORIES).forEach(category => {
          // Simple keyword matching for demo purposes
          const keywords = category.toLowerCase().split(/[ &]/).filter(w => w.length > 3);
          const matches = channels.filter(c => 
              keywords.some(k => c.tags.some(t => t.toLowerCase().includes(k)) || c.title.toLowerCase().includes(k))
          );
          if (matches.length > 0) {
              groups[category] = matches.slice(0, 4); // Limit 4 per category
          }
      });

      return groups;
  }, [channels]);

  return (
    <div className="min-h-screen supports-[min-height:100dvh]:min-h-[100dvh] bg-slate-950 text-slate-100 font-sans overflow-x-hidden">
      
      {/* Navbar */}
      <nav className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center cursor-pointer" onClick={() => setViewState('directory')}>
              <div className="bg-gradient-to-tr from-indigo-600 to-purple-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
                <Podcast className="text-white w-6 h-6" />
              </div>
              <span className="ml-3 text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 hidden sm:block">
                {t.appTitle}
              </span>
            </div>
            
            <div className="hidden md:flex flex-1 max-w-md mx-8 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-500" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-slate-700 rounded-full leading-5 bg-slate-800/50 text-slate-300 placeholder-slate-500 focus:outline-none focus:bg-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm transition-all"
                placeholder={t.search}
              />
            </div>

            <div className="flex items-center space-x-2 sm:space-x-4">
              {/* Config Warning */}
              {!isFirebaseConfigured && (
                  <button onClick={() => setIsFirebaseModalOpen(true)} className="p-2 text-amber-500 bg-amber-900/20 rounded-full hover:bg-amber-900/40 border border-amber-900/50 animate-pulse" title="Missing Firebase Config">
                      <AlertTriangle size={18} />
                  </button>
              )}

              {currentUser && (
                  <div className="hidden sm:block">
                      <Notifications />
                  </div>
              )}
              
              <UserAuth />
              
              <div className="relative">
                <button 
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                >
                  <Menu size={24} />
                </button>
                <StudioMenu 
                   isUserMenuOpen={isUserMenuOpen} 
                   setIsUserMenuOpen={setIsUserMenuOpen}
                   userProfile={userProfile}
                   setUserProfile={setUserProfile}
                   currentUser={currentUser}
                   globalVoice={globalVoice}
                   setGlobalVoice={setGlobalVoice}
                   hasApiKey={hasApiKey}
                   setIsCreateModalOpen={setIsCreateModalOpen}
                   setIsVoiceCreateOpen={setIsVoiceCreateOpen}
                   setIsApiKeyModalOpen={setIsApiKeyModalOpen}
                   setIsSyncModalOpen={setIsSyncModalOpen}
                   t={t}
                />
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Switch */}
      <div className="flex-1 overflow-y-auto">
        {viewState === 'directory' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
            
            {/* Tabs */}
            <div className="flex space-x-2 overflow-x-auto pb-4 mb-4 scrollbar-hide">
               {[
                 { id: 'all', label: t.all, icon: Layout },
                 { id: 'featured', label: t.featured, icon: Sparkles },
                 { id: 'calendar', label: t.calendar, icon: Calendar },
                 { id: 'mentorship', label: t.mentorship, icon: Briefcase },
                 { id: 'groups', label: t.groups, icon: Users },
                 { id: 'recordings', label: t.recordings, icon: Disc },
                 { id: 'docs', label: t.docs, icon: FileText },
               ].map(tab => (
                 <button
                   key={tab.id}
                   onClick={() => setActiveTab(tab.id)}
                   className={`flex items-center space-x-2 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-md' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                 >
                   <tab.icon size={16} />
                   <span>{tab.label}</span>
                 </button>
               ))}
            </div>

            {/* Content Area */}
            <div className="min-h-[60vh]">
               {activeTab === 'all' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {channels.map(channel => (
                      <ChannelCard 
                        key={channel.id} 
                        channel={channel} 
                        handleChannelClick={(id) => { setActiveChannelId(id); setViewState('podcast_detail'); }}
                        handleVote={handleVote}
                        currentUser={currentUser}
                        setChannelToEdit={setChannelToEdit}
                        setIsSettingsModalOpen={setIsSettingsModalOpen}
                        globalVoice={globalVoice}
                        t={t}
                        onCommentClick={handleCommentClick}
                      />
                    ))}
                  </div>
               )}

               {activeTab === 'featured' && featuredGroups ? (
                    <div className="space-y-12">
                      {Object.entries(featuredGroups).map(([groupName, groupChannels]) => {
                        const channels = groupChannels as Channel[];
                        if (!channels || channels.length === 0) return null;
                        
                        return (
                          <div key={groupName} className="space-y-4">
                            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                               {groupName === 'Spotlight' ? <Sparkles className="text-yellow-400" /> : <div className="w-2 h-8 bg-indigo-500 rounded-full"></div>}
                               <span>{groupName}</span>
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                              {channels.map(channel => (
                                <ChannelCard 
                                  key={channel.id} 
                                  channel={channel} 
                                  handleChannelClick={(id) => { setActiveChannelId(id); setViewState('podcast_detail'); }}
                                  handleVote={handleVote}
                                  currentUser={currentUser}
                                  setChannelToEdit={setChannelToEdit}
                                  setIsSettingsModalOpen={setIsSettingsModalOpen}
                                  globalVoice={globalVoice}
                                  t={t}
                                  onCommentClick={handleCommentClick}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

               {activeTab === 'calendar' && (
                  <CalendarView 
                     channels={channels}
                     handleChannelClick={(id) => { setActiveChannelId(id); setViewState('podcast_detail'); }}
                     handleVote={handleVote}
                     currentUser={currentUser}
                     setChannelToEdit={setChannelToEdit}
                     setIsSettingsModalOpen={setIsSettingsModalOpen}
                     globalVoice={globalVoice}
                     t={t}
                     onCommentClick={handleCommentClick}
                     onStartLiveSession={handleStartLiveSession}
                     onCreateChannel={handleCreateChannel}
                  />
               )}

               {activeTab === 'mentorship' && (
                  <MentorBooking 
                     currentUser={currentUser} 
                     channels={channels}
                     onStartLiveSession={handleStartLiveSession}
                  />
               )}

               {activeTab === 'groups' && (
                  <GroupManager />
               )}

               {activeTab === 'recordings' && (
                  <RecordingList 
                     onStartLiveSession={handleStartLiveSession}
                  />
               )}

               {activeTab === 'docs' && (
                  <DocumentList />
               )}
            </div>
          </div>
        )}

        {viewState === 'podcast_detail' && activeChannel && (
          <PodcastDetail 
            channel={activeChannel} 
            onBack={() => setViewState('directory')}
            onStartLiveSession={(context, lectureId, recordingEnabled, videoEnabled, activeSegment, cameraEnabled) => {
               setLiveConfig({
                   context,
                   bookingId: lectureId, // Reuse field for lecture ID if ad-hoc
                   recording: recordingEnabled,
                   video: videoEnabled,
                   camera: cameraEnabled,
                   segment: activeSegment
               });
               setViewState('live_session');
            }}
            language={language}
            onEditChannel={() => {
                setChannelToEdit(activeChannel);
                setIsSettingsModalOpen(true);
            }}
            onViewComments={() => handleCommentClick(activeChannel)}
            currentUser={currentUser}
          />
        )}

        {viewState === 'live_session' && activeChannel && (
          <div className="fixed inset-0 z-50 bg-slate-950">
             <LiveSession 
               channel={activeChannel}
               initialContext={liveConfig.context}
               lectureId={liveConfig.bookingId}
               recordingEnabled={liveConfig.recording}
               videoEnabled={liveConfig.video}
               cameraEnabled={liveConfig.camera}
               activeSegment={liveConfig.segment}
               initialTranscript={liveConfig.transcript}
               onEndSession={() => {
                   // If it was a temp/ad-hoc meeting, go to recordings instead of staying in "podcast" view
                   if (tempChannel) {
                       setTempChannel(null);
                       setActiveChannelId(null);
                       setViewState('directory');
                       setActiveTab('recordings');
                   } else {
                       setViewState('podcast_detail');
                   }
               }}
               language={language}
             />
          </div>
        )}

        {viewState === 'debug' && <DebugView onBack={() => setViewState('directory')} />}
        {viewState === 'cloud_debug' && <CloudDebugView onBack={() => setViewState('directory')} />}
        {viewState === 'public_debug' && <PublicChannelInspector onBack={() => setViewState('directory')} />}
      </div>

      {/* --- Footer --- */}
      {viewState === 'directory' && (
        <footer className="bg-slate-950 border-t border-slate-900 py-12 px-4">
           <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="text-center md:text-left">
                 <h3 className="font-bold text-white text-lg flex items-center justify-center md:justify-start gap-2">
                    <Podcast className="text-indigo-500"/> AIVoiceCast
                 </h3>
                 <p className="text-slate-500 text-sm mt-2 max-w-xs">
                    The world's first interactive AI podcast platform. Learn, listen, and converse with generated personas.
                 </p>
              </div>
              
              <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-400">
                 <button onClick={() => setViewState('debug')} className="hover:text-indigo-400 flex items-center gap-2"><Database size={14}/> DB Inspector</button>
                 <button onClick={() => setViewState('cloud_debug')} className="hover:text-indigo-400 flex items-center gap-2"><Cloud size={14}/> Cloud Storage</button>
                 <button onClick={() => setViewState('public_debug')} className="hover:text-indigo-400 flex items-center gap-2"><Globe size={14}/> Public Channels</button>
                 <button onClick={() => setIsFirebaseModalOpen(true)} className="hover:text-indigo-400 flex items-center gap-2"><Settings size={14}/> Config</button>
              </div>
              
              <div className="flex items-center space-x-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
                 <button onClick={() => setLanguage('en')} className={`px-3 py-1 rounded text-xs font-bold ${language === 'en' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>EN</button>
                 <button onClick={() => setLanguage('zh')} className={`px-3 py-1 rounded text-xs font-bold ${language === 'zh' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>中文</button>
              </div>
           </div>
           <div className="text-center text-slate-700 text-xs mt-8">
              v3.14.1 • Powered by Gemini 2.5 Flash & Firebase
           </div>
        </footer>
      )}

      {/* --- Modals --- */}
      <CreateChannelModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
        onCreate={handleCreateChannel} 
      />
      
      <VoiceCreateModal 
        isOpen={isVoiceCreateOpen}
        onClose={() => setIsVoiceCreateOpen(false)}
        onCreate={handleCreateChannel}
      />

      <ApiKeyModal 
        isOpen={isApiKeyModalOpen} 
        onClose={() => setIsApiKeyModalOpen(false)}
        onKeyUpdate={setHasApiKey}
      />

      <DataSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
      />

      <FirebaseConfigModal
        isOpen={isFirebaseModalOpen}
        onClose={() => setIsFirebaseModalOpen(false)}
        onConfigUpdate={(valid) => { if(valid) window.location.reload(); }}
      />

      {channelToEdit && (
        <ChannelSettingsModal 
           isOpen={isSettingsModalOpen}
           onClose={() => { setIsSettingsModalOpen(false); setChannelToEdit(null); }}
           channel={channelToEdit}
           onUpdate={handleUpdateChannel}
           onDelete={handleDeleteChannel}
        />
      )}

      {commentsChannel && (
         <CommentsModal 
            isOpen={isCommentsModalOpen}
            onClose={() => { setIsCommentsModalOpen(false); setCommentsChannel(null); }}
            channel={commentsChannel}
            onAddComment={handleAddComment}
            currentUser={currentUser}
         />
      )}

    </div>
  );
};

export default App;
