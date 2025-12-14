import React, { useState, useEffect, useMemo } from 'react';
import { Channel, ViewState, UserProfile, TranscriptItem, SubscriptionTier } from './types';
import { 
  Podcast, Mic, Layout, Search, Sparkles, LogOut, 
  Settings, Menu, X, Plus, Github, Database, Cloud, Globe, 
  Calendar, Briefcase, Users, Disc, FileText, AlertTriangle, List, BookOpen, ChevronDown, Table as TableIcon, LayoutGrid, Rocket, Code, Wand2, PenTool, Rss, Loader2, MessageSquare
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
import { FirestoreInspector } from './components/FirestoreInspector';
import { StudioMenu } from './components/StudioMenu';
import { ChannelSettingsModal } from './components/ChannelSettingsModal';
import { CommentsModal } from './components/CommentsModal';
import { Notifications } from './components/Notifications';
import { GroupManager } from './components/GroupManager';
import { MentorBooking } from './components/MentorBooking';
import { RecordingList } from './components/RecordingList';
import { DocumentList } from './components/DocumentList';
import { CalendarView } from './components/CalendarView';
import { PodcastListTable, SortKey } from './components/PodcastListTable';
import { PodcastFeed } from './components/PodcastFeed'; // New Import
import { MissionManifesto } from './components/MissionManifesto';
import { CodeStudio } from './components/CodeStudio';
import { Whiteboard } from './components/Whiteboard';
import { BlogView } from './components/BlogView';
import { WorkplaceChat } from './components/WorkplaceChat';
import { LoginPage } from './components/LoginPage'; 
import { SettingsModal } from './components/SettingsModal'; 
import { PricingModal } from './components/PricingModal'; 
import { CareerCenter } from './components/CareerCenter';
import { UserManual } from './components/UserManual'; 
import { PrivacyPolicy } from './components/PrivacyPolicy';

import { auth, isFirebaseConfigured } from './services/firebaseConfig';
import { 
  voteChannel, publishChannelToFirestore, updateCommentInChannel, 
  deleteCommentFromChannel, addCommentToChannel, getPublicChannels, 
  subscribeToPublicChannels, getGroupChannels, getUserProfile,
  setupSubscriptionListener
} from './services/firestoreService';
import { getUserChannels, saveUserChannel, deleteUserChannel } from './utils/db';
import { HANDCRAFTED_CHANNELS, CATEGORY_STYLES, TOPIC_CATEGORIES } from './utils/initialData';
import { OFFLINE_CHANNEL_ID } from './utils/offlineContent';
import { GEMINI_API_KEY } from './services/private_keys';

const APP_VERSION = "v3.66.0"; // Bump version

const UI_TEXT = {
  en: {
    appTitle: "AIVoiceCast",
    directory: "Feed", // Changed from Discover
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
    docs: "Documents",
    lectures: "Lectures",
    podcasts: "Podcasts",
    mission: "Mission",
    code: "Code Studio",
    whiteboard: "Whiteboard",
    blog: "Community Blog",
    chat: "Team Chat",
    careers: "Careers"
  },
  zh: {
    appTitle: "AI 播客",
    directory: "推荐",
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
    docs: "文档",
    lectures: "课程",
    podcasts: "播客",
    mission: "使命",
    code: "代码工作室",
    whiteboard: "白板",
    blog: "社区博客",
    chat: "团队聊天",
    careers: "职业发展"
  }
};

type ExtendedViewState = ViewState | 'firestore_debug';

const App: React.FC = () => {
  const [language, setLanguage] = useState<'en' | 'zh'>('en');
  const t = UI_TEXT[language];
  const [viewState, setViewState] = useState<ExtendedViewState>('directory');
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  
  // Auth State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Privacy Policy Public View
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

  const [activeTab, setActiveTab] = useState('categories');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Layout & Sorting (Kept for fallback, but main view is now Feed)
  const [layoutMode, setLayoutMode] = useState<'grid' | 'table'>('grid');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });

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
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false); 
  const [isPricingOpen, setIsPricingOpen] = useState(false); 
  
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [channelToEdit, setChannelToEdit] = useState<Channel | null>(null);
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false);
  const [commentsChannel, setCommentsChannel] = useState<Channel | null>(null);

  // Collaboration State
  const [sharedSessionId, setSharedSessionId] = useState<string | undefined>(undefined);
  const [accessKey, setAccessKey] = useState<string | undefined>(undefined);

  // Live Session Config
  const [liveConfig, setLiveConfig] = useState<{
    context?: string;
    bookingId?: string;
    recording?: boolean;
    video?: boolean;
    camera?: boolean;
    segment?: { index: number, lectureId: string };
    initialTranscript?: TranscriptItem[];
  }>({});

  // Ad-hoc Meeting Channel (Ephemeral)
  const [tempChannel, setTempChannel] = useState<Channel | null>(null);

  const [globalVoice, setGlobalVoice] = useState('Auto');

  useEffect(() => {
    const key = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY;
    setHasApiKey(!!key);

    const params = new URLSearchParams(window.location.search);
    const session = params.get('session');
    const keyParam = params.get('key'); 
    const mode = params.get('mode');

    if (session) {
        setSharedSessionId(session);
        if (keyParam) setAccessKey(keyParam);
        
        if (viewState !== 'code_studio' && viewState !== 'whiteboard') {
            if (mode === 'whiteboard') {
                 setViewState('whiteboard');
            } else {
                 setViewState('code_studio');
            }
        }
    }

    let unsubscribeAuth = () => {};

    if (isFirebaseConfigured) {
        unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
          setCurrentUser(user);
          if (user) {
            try {
              const profile = await getUserProfile(user.uid);
              setUserProfile(profile);
            } catch (e) {
              console.error("Profile fetch error", e);
            }
          } else {
            setUserProfile(null);
            setGroupChannels([]);
          }
          setAuthLoading(false); 
        });
    } else {
        setIsFirebaseModalOpen(true);
        setAuthLoading(false);
    }

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
      if (currentUser && isFirebaseConfigured) {
          const unsub = setupSubscriptionListener(currentUser.uid, (newTier) => {
              console.log("Subscription status updated:", newTier);
              setUserProfile(prev => prev ? { ...prev, subscriptionTier: newTier } : prev);
          });
          return () => unsub();
      }
  }, [currentUser]);

  useEffect(() => {
    getUserChannels().then(setUserChannels);
  }, []);

  useEffect(() => {
    if (isFirebaseConfigured && currentUser) {
        const unsubPublic = subscribeToPublicChannels(
          (data) => setPublicChannels(data),
          (err: any) => {
              if (err.code === 'permission-denied' || err.message?.includes('permission')) {
                  console.warn("Public channels access denied. Waiting for authentication.");
              } else {
                  console.error("Public channels error", err);
              }
          }
        );
        return () => { unsubPublic(); };
    }
  }, [currentUser]);

  useEffect(() => {
    if (userProfile && userProfile.groups && userProfile.groups.length > 0) {
       getGroupChannels(userProfile.groups).then(setGroupChannels);
    }
  }, [userProfile]);

  useEffect(() => {
    const all = [...HANDCRAFTED_CHANNELS, ...userChannels, ...publicChannels, ...groupChannels];
    const unique = Array.from(new Map(all.map(item => [item.id, item])).values());
    
    unique.sort((a, b) => {
        const isAHand = HANDCRAFTED_CHANNELS.some(h => h.id === a.id);
        const isBHand = HANDCRAFTED_CHANNELS.some(h => h.id === b.id);
        if (isAHand && !isBHand) return -1;
        if (!isAHand && isBHand) return 1;
        return (b.createdAt || 0) - (a.createdAt || 0);
    });
    
    setChannels(unique);
  }, [userChannels, publicChannels, groupChannels]);

  const activeChannel = useMemo(() => {
      return tempChannel || channels.find(c => c.id === activeChannelId);
  }, [channels, activeChannelId, tempChannel]);

  const handleVote = async (id: string, type: 'like' | 'dislike', e: React.MouseEvent) => {
    e.stopPropagation();
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
        await publishChannelToFirestore(newChannel); 
    } else {
        await saveUserChannel(newChannel);
        setUserChannels(prev => [newChannel, ...prev]);
    }
    setChannels(prev => [newChannel, ...prev]);
  };

  const handleUpdateChannel = async (updatedChannel: Channel) => {
      if (updatedChannel.visibility === 'public' || updatedChannel.visibility === 'group') {
          await publishChannelToFirestore(updatedChannel);
      } else {
          await saveUserChannel(updatedChannel);
          setUserChannels(prev => prev.map(c => c.id === updatedChannel.id ? updatedChannel : c));
      }
      setChannels(prev => prev.map(c => c.id === updatedChannel.id ? updatedChannel : c));
  };

  const handleDeleteChannel = async () => {
      if (!channelToEdit) return;
      if (channelToEdit.visibility === 'public' || channelToEdit.visibility === 'group') {
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
      
      const updatedChannel = { 
          ...commentsChannel, 
          comments: [...commentsChannel.comments, newComment] 
      };
      
      setCommentsChannel(updatedChannel);
      setChannels(prev => prev.map(c => c.id === commentsChannel.id ? updatedChannel : c));
      
      if (commentsChannel.visibility === 'public' || commentsChannel.visibility === 'group') {
          await addCommentToChannel(commentsChannel.id, newComment);
      } else {
          await saveUserChannel(updatedChannel);
          setUserChannels(prev => prev.map(c => c.id === updatedChannel.id ? updatedChannel : c));
      }
  };

  const handleStartLiveSession = (channel: Channel, context?: string, recordingEnabled?: boolean, bookingId?: string, videoEnabled?: boolean, cameraEnabled?: boolean) => {
      const existing = channels.find(c => c.id === channel.id);
      
      if (!existing) {
          setTempChannel(channel); 
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

  const handleSessionStart = (id: string) => {
      setSharedSessionId(id);
      setAccessKey(undefined);
      
      const url = new URL(window.location.href);
      url.searchParams.delete('session');
      url.searchParams.delete('code_session');
      url.searchParams.delete('whiteboard_session');
      url.searchParams.delete('view');
      url.searchParams.delete('key');
      url.searchParams.delete('mode');

      url.searchParams.set('session', id);
      window.history.pushState({}, '', url.toString());
  };

  const handleSessionStop = () => {
      setSharedSessionId(undefined);
      setAccessKey(undefined);
      const url = new URL(window.location.href);
      url.searchParams.delete('session');
      url.searchParams.delete('key');
      window.history.pushState({}, '', url.toString());
  };

  // --- Sorting Logic ---
  const handleSort = (key: SortKey) => {
      setSortConfig(current => ({
          key,
          direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
      }));
  };

  const allCategoryGroups = useMemo(() => {
      const groups: Record<string, Channel[]> = {};
      groups['Spotlight'] = HANDCRAFTED_CHANNELS;

      Object.keys(TOPIC_CATEGORIES).forEach(category => {
          const keywords = category.toLowerCase().split(/[ &]/).filter(w => w.length > 3);
          const matches = channels.filter(c => 
              keywords.some(k => c.tags.some(t => t.toLowerCase().includes(k)) || c.title.toLowerCase().includes(k))
          );
          if (matches.length > 0) {
              groups[category] = matches;
          }
      });

      return groups;
  }, [channels]);

  // Combined Channel List for Feed
  const feedChannels = useMemo(() => {
      let data = [...channels];
      if (searchQuery) {
          const lowerQ = searchQuery.toLowerCase();
          data = data.filter(c => 
              c.title.toLowerCase().includes(lowerQ) || 
              c.description.toLowerCase().includes(lowerQ) ||
              c.tags.some(t => t.toLowerCase().includes(lowerQ))
          );
      }
      return data;
  }, [channels, searchQuery]);

  const handleUpgradeSuccess = async (newTier: SubscriptionTier) => {
      if (userProfile) {
          setUserProfile({ ...userProfile, subscriptionTier: newTier });
      }
      if (currentUser) {
        try {
            const fresh = await getUserProfile(currentUser.uid);
            if (fresh) setUserProfile(fresh);
        } catch(e) {}
      }
  };

  if (authLoading) {
      return (
          <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-indigo-400">
              <Loader2 size={48} className="animate-spin mb-4" />
              <p className="text-sm font-bold tracking-widest uppercase">Initializing AIVoiceCast...</p>
          </div>
      );
  }

  if (isPrivacyOpen) {
      return <PrivacyPolicy onBack={() => setIsPrivacyOpen(false)} />;
  }

  if (!currentUser) {
      return <LoginPage onPrivacyClick={() => setIsPrivacyOpen(true)} />;
  }

  return (
    <div className="min-h-screen supports-[min-height:100dvh]:min-h-[100dvh] bg-slate-950 text-slate-100 font-sans overflow-x-hidden">
      
      {/* Navbar - Simplified for Feed Mode */}
      {viewState !== 'chat' && viewState !== 'live_session' && (
      <nav className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center cursor-pointer" onClick={() => { setViewState('directory'); }}>
              <div className="bg-gradient-to-tr from-indigo-600 to-purple-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
                <Podcast className="text-white w-6 h-6" />
              </div>
              <span className="ml-3 text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 hidden sm:block">
                {t.appTitle}
              </span>
            </div>
            
            {/* Conditional Search - Hidden on Main Feed to reduce clutter, visible elsewhere */}
            {(viewState as string) !== 'directory' && (
            <div className="hidden md:flex flex-1 max-w-md mx-8 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-500" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-slate-700 rounded-full leading-5 bg-slate-800/50 text-slate-300 placeholder-slate-500 focus:outline-none focus:bg-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm transition-all"
                placeholder={t.search}
                value={searchQuery}
                onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (e.target.value && viewState !== 'directory') setViewState('directory');
                }}
              />
            </div>
            )}

            <div className="flex items-center space-x-2 sm:space-x-4">
              
              {/* Feature Buttons - Hidden on Mobile to reduce noise */}
              <div className="hidden lg:flex gap-2">
                  <button 
                    onClick={() => setViewState('code_studio')} 
                    className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800/50 hover:bg-emerald-900/30 text-emerald-400 text-xs font-bold rounded-lg transition-colors"
                  >
                    <Code size={14}/><span>{t.code}</span>
                  </button>
                  <button 
                    onClick={() => setViewState('whiteboard')} 
                    className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800/50 hover:bg-pink-900/30 text-pink-400 text-xs font-bold rounded-lg transition-colors"
                  >
                    <PenTool size={14}/><span>{t.whiteboard}</span>
                  </button>
              </div>

              {!isFirebaseConfigured && (
                  <button onClick={() => setIsFirebaseModalOpen(true)} className="p-2 text-amber-500 bg-amber-900/20 rounded-full hover:bg-amber-900/40 border border-amber-900/50 animate-pulse">
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
                   setIsSettingsModalOpen={setIsAccountSettingsOpen}
                   onOpenUserGuide={() => setViewState('user_guide')}
                   t={t}
                />
              </div>
            </div>
          </div>
        </div>
      </nav>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden h-[calc(100vh-64px)]">
        {viewState === 'mission' && <MissionManifesto onBack={() => setViewState('directory')} />}
        {viewState === 'user_guide' && <UserManual onBack={() => setViewState('directory')} />}
        
        {viewState === 'code_studio' && (
            <CodeStudio 
                onBack={() => { setViewState('directory'); }} 
                currentUser={currentUser} 
                userProfile={userProfile}
                sessionId={sharedSessionId}
                accessKey={accessKey}
                onSessionStart={handleSessionStart} 
                onSessionStop={handleSessionStop} 
                onStartLiveSession={(channel, context) => handleStartLiveSession(channel, context)} 
            />
        )}
        
        {viewState === 'whiteboard' && (
            <Whiteboard 
                onBack={() => { setViewState('directory'); }}
                sessionId={sharedSessionId}
                accessKey={accessKey}
                onSessionStart={handleSessionStart} 
            />
        )}
        
        {viewState === 'blog' && <BlogView onBack={() => setViewState('directory')} currentUser={currentUser} />}
        {viewState === 'chat' && <WorkplaceChat onBack={() => setViewState('directory')} currentUser={currentUser} />}
        {viewState === 'careers' && <CareerCenter onBack={() => setViewState('directory')} currentUser={currentUser} />}

        {viewState === 'directory' && (
          <div className="h-full flex flex-col">
            
            {/* Secondary Nav / Tabs (Horizontal Scroll) */}
            <div className="bg-slate-900/50 backdrop-blur-md border-b border-slate-800 p-2 overflow-x-auto shrink-0 scrollbar-hide">
                <div className="flex space-x-2 w-max px-2">
                   {[
                     { id: 'categories', label: t.directory, icon: Layout }, // Main Feed
                     { id: 'calendar', label: t.calendar, icon: Calendar },
                     { id: 'careers', label: t.careers, icon: Briefcase },
                     { id: 'chat', label: t.chat, icon: MessageSquare },
                     { id: 'code', label: t.code, icon: Code },
                     { id: 'blog', label: t.blog, icon: Rss },
                     { id: 'mentorship', label: t.mentorship, icon: Users },
                     { id: 'groups', label: t.groups, icon: Users },
                     { id: 'recordings', label: t.recordings, icon: Disc },
                     { id: 'docs', label: t.docs, icon: FileText },
                   ].map(tab => (
                     <button
                       key={tab.id}
                       onClick={() => {
                           if (tab.id === 'code') setViewState('code_studio');
                           else if (tab.id === 'blog') setViewState('blog');
                           else if (tab.id === 'chat') setViewState('chat');
                           else if (tab.id === 'careers') setViewState('careers');
                           else setActiveTab(tab.id);
                       }}
                       className={`flex items-center space-x-2 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-md' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                     >
                       <tab.icon size={14} />
                       <span>{tab.label}</span>
                     </button>
                   ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative">
               
               {/* 1. Main Feed (TikTok Style) */}
               {activeTab === 'categories' && (
                   <PodcastFeed 
                       channels={feedChannels}
                       onChannelClick={(id) => { setActiveChannelId(id); setViewState('podcast_detail'); }}
                       onStartLiveSession={(channel) => handleStartLiveSession(channel)}
                       userProfile={userProfile}
                       globalVoice={globalVoice}
                   />
               )}

               {/* 2. Other Tabs (Standard Layout) */}
               {activeTab !== 'categories' && (
                   <div className="h-full overflow-y-auto p-4 md:p-8 animate-fade-in max-w-7xl mx-auto w-full">
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

                       {activeTab === 'groups' && <GroupManager />}
                       {activeTab === 'recordings' && <RecordingList onStartLiveSession={handleStartLiveSession} />}
                       {activeTab === 'docs' && <DocumentList />}
                   </div>
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
                   bookingId: lectureId, 
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
               initialTranscript={liveConfig.initialTranscript}
               onEndSession={() => {
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
        {viewState === 'firestore_debug' && <FirestoreInspector onBack={() => setViewState('directory')} />}
      </div>

      <CreateChannelModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onCreate={handleCreateChannel} />
      <VoiceCreateModal isOpen={isVoiceCreateOpen} onClose={() => setIsVoiceCreateOpen(false)} onCreate={handleCreateChannel} />
      <ApiKeyModal isOpen={isApiKeyModalOpen} onClose={() => setIsApiKeyModalOpen(false)} onKeyUpdate={setHasApiKey} />
      <DataSyncModal isOpen={isSyncModalOpen} onClose={() => setIsSyncModalOpen(false)} />
      <FirebaseConfigModal isOpen={isFirebaseModalOpen} onClose={() => setIsFirebaseModalOpen(false)} onConfigUpdate={(valid) => { if(valid) window.location.reload(); }} />

      {isAccountSettingsOpen && userProfile && (
          <SettingsModal 
             isOpen={true} 
             onClose={() => setIsAccountSettingsOpen(false)} 
             user={userProfile} 
             onUpdateProfile={(updated) => setUserProfile(updated)}
             onUpgradeClick={() => setIsPricingOpen(true)}
          />
      )}

      {isPricingOpen && userProfile && (
          <PricingModal 
             isOpen={true} 
             onClose={() => setIsPricingOpen(false)} 
             user={userProfile} 
             onSuccess={handleUpgradeSuccess}
          />
      )}

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