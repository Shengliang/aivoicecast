
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

const APP_VERSION = "v3.54.0";

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

// Add to types.ts in real project, but here we extend locally for the new view state
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
  const [authLoading, setAuthLoading] = useState(true); // Loading state for initial auth check

  const [activeTab, setActiveTab] = useState('categories');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Layout & Sorting
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
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false); // New Modal State
  const [isPricingOpen, setIsPricingOpen] = useState(false); // For cross-linking from settings
  
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
    // Check local storage, private key file, or process env
    const key = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY;
    setHasApiKey(!!key);

    // CHECK URL FOR SHARED SESSION (Unified)
    const params = new URLSearchParams(window.location.search);
    const session = params.get('session');
    const keyParam = params.get('key'); // Secret Token for Write Access

    if (session) {
        setSharedSessionId(session);
        if (keyParam) setAccessKey(keyParam);
        
        // Default to Code Studio for shared sessions
        setViewState('code_studio');
    }

    let unsubscribeAuth = () => {};

    // Only attempt to connect auth if we have a valid config, otherwise we risk a crash
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
          setAuthLoading(false); // Auth check complete
        });
    } else {
        // Auto-open modal if configuration is missing
        setIsFirebaseModalOpen(true);
        setAuthLoading(false);
    }

    return () => unsubscribeAuth();
  }, []);

  // Listen for Subscription Changes (Stripe)
  useEffect(() => {
      if (currentUser && isFirebaseConfigured) {
          const unsub = setupSubscriptionListener(currentUser.uid, (newTier) => {
              console.log("Subscription status updated:", newTier);
              setUserProfile(prev => prev ? { ...prev, subscriptionTier: newTier } : prev);
          });
          return () => unsub();
      }
  }, [currentUser]);

  // Load User Channels (Local)
  useEffect(() => {
    getUserChannels().then(setUserChannels);
  }, []);

  // Load Public Channels (Firestore)
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

  // Load Group Channels when profile updates
  useEffect(() => {
    if (userProfile && userProfile.groups && userProfile.groups.length > 0) {
       getGroupChannels(userProfile.groups).then(setGroupChannels);
    }
  }, [userProfile]);

  // Combine all channels
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

  // Calculate Total Lectures
  const totalLectures = useMemo(() => {
    return channels.reduce((acc, channel) => {
      return acc + (channel.chapters?.reduce((cAcc, ch) => cAcc + (ch.subTopics?.length || 0), 0) || 0);
    }, 0);
  }, [channels]);

  // Active channel can be from the list OR the temporary one
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

  // Called when CodeStudio or Whiteboard creates a shared link
  const handleSessionStart = (id: string) => {
      setSharedSessionId(id);
      setAccessKey(undefined); // Reset key, owner doesn't need URL key usually
      
      const url = new URL(window.location.href);
      
      // Clean up all possible params first
      url.searchParams.delete('session');
      url.searchParams.delete('code_session');
      url.searchParams.delete('whiteboard_session');
      url.searchParams.delete('view');
      url.searchParams.delete('key');
      url.searchParams.delete('mode');

      url.searchParams.set('session', id);
      // We do NOT set 'key' in the URL for the creator, as they are Owner by Auth.
      // This keeps the URL clean.
      
      window.history.pushState({}, '', url.toString());
  };

  // --- Sorting & Filtering Logic ---

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

  const tableData = useMemo(() => {
      let data = [...channels];

      if (searchQuery) {
          const lowerQ = searchQuery.toLowerCase();
          data = data.filter(c => 
              c.title.toLowerCase().includes(lowerQ) || 
              c.description.toLowerCase().includes(lowerQ) ||
              c.tags.some(t => t.toLowerCase().includes(lowerQ))
          );
      }

      if (selectedCategory !== 'All') {
          if (selectedCategory === 'Spotlight') {
              data = data.filter(c => HANDCRAFTED_CHANNELS.some(h => h.id === c.id));
          } else {
              const keywords = selectedCategory.toLowerCase().split(/[ &]/).filter(w => w.length > 3);
              data = data.filter(c => keywords.some(k => c.tags.some(t => t.toLowerCase().includes(k)) || c.title.toLowerCase().includes(k)));
          }
      }

      data.sort((a, b) => {
          const aVal = sortConfig.key === 'voiceName' ? a.voiceName : 
                       sortConfig.key === 'likes' ? a.likes : 
                       sortConfig.key === 'createdAt' ? (a.createdAt || 0) : 
                       sortConfig.key === 'author' ? a.author :
                       a.title;
          
          const bVal = sortConfig.key === 'voiceName' ? b.voiceName : 
                       sortConfig.key === 'likes' ? b.likes : 
                       sortConfig.key === 'createdAt' ? (b.createdAt || 0) : 
                       sortConfig.key === 'author' ? b.author :
                       b.title;

          if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
      });

      return data;
  }, [channels, searchQuery, selectedCategory, sortConfig]);

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

  if (!currentUser) {
      return <LoginPage />;
  }

  return (
    <div className="min-h-screen supports-[min-height:100dvh]:min-h-[100dvh] bg-slate-950 text-slate-100 font-sans overflow-x-hidden">
      
      {/* Navbar */}
      {viewState !== 'chat' && (
      <nav className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
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
                    if (e.target.value && activeTab !== 'categories') setActiveTab('categories');
                }}
              />
            </div>

            <div className="flex items-center space-x-2 sm:space-x-4">
              
              <button 
                onClick={() => setViewState('mission')} 
                className="hidden lg:flex items-center space-x-2 px-3 py-1.5 bg-slate-800/50 hover:bg-indigo-900/30 text-indigo-300 text-xs font-bold rounded-lg transition-colors border border-indigo-500/20"
              >
                <Rocket size={14}/>
                <span>{t.mission}</span>
              </button>

              <button 
                onClick={() => { setViewState('code_studio'); }} 
                className={`hidden lg:flex items-center space-x-2 px-3 py-1.5 bg-slate-800/50 hover:bg-emerald-900/30 text-emerald-400 text-xs font-bold rounded-lg transition-colors border border-emerald-500/20 ${viewState === 'code_studio' ? 'ring-1 ring-emerald-500 bg-emerald-900/40' : ''}`}
              >
                <Code size={14}/>
                <span>{t.code}</span>
              </button>

              <button 
                onClick={() => { setViewState('whiteboard'); }} 
                className={`hidden lg:flex items-center space-x-2 px-3 py-1.5 bg-slate-800/50 hover:bg-pink-900/30 text-pink-400 text-xs font-bold rounded-lg transition-colors border border-pink-500/20 ${viewState === 'whiteboard' ? 'ring-1 ring-pink-500 bg-pink-900/40' : ''}`}
              >
                <PenTool size={14}/>
                <span>{t.whiteboard}</span>
              </button>

              {/* Language Switcher */}
              <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
                 <button onClick={() => setLanguage('en')} className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${language === 'en' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>EN</button>
                 <button onClick={() => setLanguage('zh')} className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${language === 'zh' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>中文</button>
              </div>

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

      {/* Main Content Switch */}
      <div className="flex-1 overflow-y-auto">
        {viewState === 'mission' && <MissionManifesto onBack={() => setViewState('directory')} />}
        
        {/* Render User Manual when viewState is 'user_guide' */}
        {viewState === 'user_guide' && <UserManual onBack={() => setViewState('directory')} />}
        
        {viewState === 'code_studio' && (
            <CodeStudio 
                onBack={() => { setViewState('directory'); }} 
                currentUser={currentUser} 
                userProfile={userProfile}
                sessionId={sharedSessionId}
                accessKey={accessKey}
                onSessionStart={handleSessionStart} // Unified Session Handler
                onStartLiveSession={(channel, context) => handleStartLiveSession(channel, context)} // Teach Me Mode
            />
        )}
        
        {viewState === 'whiteboard' && (
            <Whiteboard 
                onBack={() => { setViewState('directory'); }}
                sessionId={sharedSessionId}
                accessKey={accessKey}
                onSessionStart={handleSessionStart} // Unified Session Handler
            />
        )}
        
        {viewState === 'blog' && <BlogView onBack={() => setViewState('directory')} currentUser={currentUser} />}
        
        {viewState === 'chat' && <WorkplaceChat onBack={() => setViewState('directory')} currentUser={currentUser} />}
        
        {viewState === 'careers' && <CareerCenter onBack={() => setViewState('directory')} currentUser={currentUser} />}

        {viewState === 'directory' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
            
            {/* Tabs */}
            <div className="flex space-x-2 overflow-x-auto pb-4 mb-4 scrollbar-hide">
               {[
                 { id: 'categories', label: t.podcasts, icon: Layout },
                 { id: 'calendar', label: t.calendar, icon: Calendar },
                 { id: 'careers', label: t.careers, icon: Briefcase }, // New Tab
                 { id: 'chat', label: t.chat, icon: MessageSquare },
                 { id: 'code', label: t.code, icon: Code },
                 { id: 'blog', label: t.blog, icon: Rss },
                 { id: 'whiteboard', label: t.whiteboard, icon: PenTool },
                 { id: 'mentorship', label: t.mentorship, icon: Users }, // Changed Icon for Mentorship to avoid duplicate Briefcase
                 { id: 'groups', label: t.groups, icon: Users },
                 { id: 'recordings', label: t.recordings, icon: Disc },
                 { id: 'docs', label: t.docs, icon: FileText },
               ].map(tab => (
                 <button
                   key={tab.id}
                   onClick={() => {
                       if (tab.id === 'code') setViewState('code_studio');
                       else if (tab.id === 'whiteboard') setViewState('whiteboard');
                       else if (tab.id === 'blog') setViewState('blog');
                       else if (tab.id === 'chat') setViewState('chat');
                       else if (tab.id === 'careers') setViewState('careers');
                       else setActiveTab(tab.id);
                   }}
                   className={`flex items-center space-x-2 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-md' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                 >
                   <tab.icon size={16} />
                   <span>{tab.label}</span>
                 </button>
               ))}
            </div>

            {/* Content Area */}
            <div className="min-h-[60vh]">
               {activeTab === 'categories' && (
                    <>
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
                        <div className="text-xl font-bold text-white flex items-center gap-2">
                            {searchQuery && (
                                <>
                                    <Search className="text-indigo-400" />
                                    <span>Search: "{searchQuery}"</span>
                                </>
                            )}
                        </div>

                        <div className="flex items-center gap-3 w-full md:w-auto">
                            
                            <button 
                                onClick={() => setIsCreateModalOpen(true)}
                                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-indigo-500/20 whitespace-nowrap"
                                title="Create New Podcast"
                            >
                                <Plus size={16} />
                                <span className="hidden sm:inline">{t.create}</span>
                            </button>

                            <button 
                                onClick={() => setIsVoiceCreateOpen(true)}
                                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-sm font-bold rounded-lg transition-all shadow-lg shadow-pink-500/20 whitespace-nowrap"
                                title="Magic Voice Create"
                            >
                                <Wand2 size={16} />
                                <span className="hidden sm:inline">Magic</span>
                            </button>

                            <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                                <button 
                                    onClick={() => setLayoutMode('grid')}
                                    className={`p-2 rounded-md transition-colors ${layoutMode === 'grid' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                                    title="Grid View"
                                >
                                    <LayoutGrid size={16} />
                                </button>
                                <button 
                                    onClick={() => setLayoutMode('table')}
                                    className={`p-2 rounded-md transition-colors ${layoutMode === 'table' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                                    title="Table View"
                                >
                                    <TableIcon size={16} />
                                </button>
                            </div>

                            <div className="relative flex-1 md:flex-none">
                                <select 
                                    value={selectedCategory} 
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    className="w-full appearance-none bg-slate-800 border border-slate-700 text-white pl-4 pr-10 py-2.5 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer hover:bg-slate-700 transition-colors shadow-sm"
                                >
                                    <option value="All">All Categories</option>
                                    {Object.keys(allCategoryGroups).map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                    </div>

                    {layoutMode === 'table' ? (
                        <PodcastListTable 
                            channels={tableData}
                            onChannelClick={(id) => { setActiveChannelId(id); setViewState('podcast_detail'); }}
                            sortConfig={sortConfig}
                            onSort={handleSort}
                            globalVoice={globalVoice}
                        />
                    ) : (
                        <div className="space-y-6">
                            {searchQuery ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {channels.filter(c => 
                                        c.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                        c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        c.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
                                    ).map(channel => (
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
                            ) : (
                                <div className="space-y-12">
                                    {Object.entries(allCategoryGroups)
                                      .filter(([name]) => selectedCategory === 'All' || selectedCategory === name)
                                      .map(([groupName, groupChannels]) => {
                                        const channels = groupChannels as Channel[];
                                        if (!channels || channels.length === 0) return null;
                                        
                                        return (
                                          <div key={groupName} className="space-y-4 animate-fade-in">
                                            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                              {groupName === 'Spotlight' ? (
                                                <>
                                                  <Sparkles className="text-yellow-400" />
                                                  <span>{t.featured || 'Featured'}</span>
                                                </>
                                              ) : (
                                                <>
                                                  <div className="w-2 h-8 bg-indigo-500 rounded-full"></div>
                                                  <span>{groupName}</span>
                                                  <span className="text-sm font-normal text-slate-500 ml-2">({channels.length})</span>
                                                </>
                                              )}
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
                            )}
                        </div>
                    )}
                    </>
               )}

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

      {viewState === 'directory' && (
        <footer className="bg-slate-950 border-t border-slate-900 py-12 px-4">
           <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="text-center md:text-left">
                 <h3 className="font-bold text-white text-lg flex items-center justify-center md:justify-start gap-2">
                    <Podcast className="text-indigo-500"/> AIVoiceCast
                 </h3>
                 <p className="text-slate-500 text-sm mt-2 max-w-xs">
                    The world's first interactive AI-Human community platform. 
                 </p>
                 <button onClick={() => setViewState('mission')} className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wider">
                    Our Mission
                 </button>
              </div>
              
              <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-400">
                 <button onClick={() => setViewState('debug')} className="hover:text-indigo-400 flex items-center gap-2"><Database size={14}/> IndexedDB</button>
                 <button onClick={() => setViewState('cloud_debug')} className="hover:text-indigo-400 flex items-center gap-2"><Cloud size={14}/> Cloud Storage</button>
                 <button onClick={() => setViewState('firestore_debug')} className="hover:text-indigo-400 flex items-center gap-2"><Database size={14}/> Firestore Data</button>
              </div>
           </div>
           <div className="text-center text-slate-700 text-xs mt-8">
              {channels.length} {t.podcasts} • {totalLectures} {t.lectures} • {APP_VERSION} • Powered by Gemini 2.5 Flash & Firebase
           </div>
        </footer>
      )}

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
