
import React, { useState, useEffect, useMemo } from 'react';
import { Channel, ViewState, UserProfile, TranscriptItem, SubscriptionTier } from './types';
import { 
  Podcast, Mic, Layout, Search, Sparkles, LogOut, 
  Settings, Menu, X, Plus, Github, Database, Cloud, Globe, 
  Calendar, Briefcase, Users, Disc, FileText, AlertTriangle, List, BookOpen, ChevronDown, Table as TableIcon, LayoutGrid, Rocket, Code, Wand2, PenTool, Rss, Loader2, MessageSquare,
  Home, Video as VideoIcon, Inbox, User, PlusSquare, ArrowLeft, Play, Book, Gift, Square, Shield, AppWindow
} from 'lucide-react';
import { LiveSession } from './components/LiveSession';
import { PodcastDetail } from './components/PodcastDetail';
import { ChannelCard } from './components/ChannelCard';
import { UserAuth } from './components/UserAuth';
import { CreateChannelModal } from './components/CreateChannelModal';
import { VoiceCreateModal } from './components/VoiceCreateModal';
import { DataSyncModal } from './components/DataSyncModal';
import { FirebaseConfigModal } from './components/FirebaseConfigModal';
import { DebugView } from './components/DebugView';
import { CloudDebugView } from './components/CloudDebugView';
import { PublicChannelInspector } from './components/PublicChannelInspector';
import { MyChannelInspector } from './components/MyChannelInspector';
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
import { PodcastFeed } from './components/PodcastFeed'; 
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
import { NotebookViewer } from './components/NotebookViewer'; 
import { CardWorkshop } from './components/CardWorkshop';
import { CardExplorer } from './components/CardExplorer';
import { IconStudio } from './components/IconStudio';
import { BrandLogo } from './components/BrandLogo';

import { auth, isFirebaseConfigured } from './services/firebaseConfig';
import { 
  voteChannel, publishChannelToFirestore, updateCommentInChannel, 
  deleteCommentFromChannel, addCommentToChannel, getPublicChannels, 
  subscribeToPublicChannels, getGroupChannels, getUserProfile,
  setupSubscriptionListener, createOrGetDMChannel, subscribeToAllChannelsAdmin
} from './services/firestoreService';
import { getUserChannels, saveUserChannel, deleteUserChannel } from './utils/db';
import { HANDCRAFTED_CHANNELS, CATEGORY_STYLES, TOPIC_CATEGORIES } from './utils/initialData';
import { OFFLINE_CHANNEL_ID } from './utils/offlineContent';
import { warmUpAudioContext, stopAllPlatformAudio, isAnyAudioPlaying } from './utils/audioUtils';

const APP_VERSION = "v3.85.1"; 

const UI_TEXT = {
  en: {
    appTitle: "AIVoiceCast",
    directory: "Explore", 
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
    mission: "Mission & Manifesto",
    code: "Code Studio",
    whiteboard: "Whiteboard",
    blog: "Community Blog",
    chat: "Team Chat",
    careers: "Careers",
    notebooks: "LLM Notebooks",
    cards: "Card Workshop",
    icons: "Icon Studio"
  },
  zh: {
    appTitle: "AI 播客",
    directory: "探索",
    myFeed: "我的订阅",
    live: "直播中",
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
    mission: "使命与宣言",
    code: "代码工作室",
    whiteboard: "白板",
    blog: "社区博客",
    chat: "团队聊天",
    careers: "职业发展",
    notebooks: "LLM 笔记本",
    cards: "贺卡工坊",
    icons: "图标工作室"
  }
};

type ExtendedViewState = ViewState | 'firestore_debug' | 'my_channel_debug' | 'card_viewer';

const App: React.FC = () => {
  const [language, setLanguage] = useState<'en' | 'zh'>('en');
  const t = UI_TEXT[language];
  const [viewState, setViewState] = useState<ExtendedViewState>('directory');
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isAppsMenuOpen, setIsAppsMenuOpen] = useState(false);
  const [isDesktopAppsOpen, setIsDesktopAppsOpen] = useState(false);
  
  // Mobile Navigation State
  const [mobileFeedTab, setMobileFeedTab] = useState<'foryou' | 'following'>('foryou');
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [mobileSearchQuery, setMobileSearchQuery] = useState('');
  
  // Audio State UI
  const [audioIsPlaying, setAudioIsPlaying] = useState(false);

  // Auth State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Privacy Policy Public View
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

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
  const [createModalDate, setCreateModalDate] = useState<Date | null>(null);
  
  const [isVoiceCreateOpen, setIsVoiceCreateOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isFirebaseModalOpen, setIsFirebaseModalOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false); 
  const [isPricingOpen, setIsPricingOpen] = useState(false); 
  
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [channelToEdit, setChannelToEdit] = useState<Channel | null>(null);
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false);
  const [commentsChannel, setCommentsChannel] = useState<Channel | null>(null);

  // Collaboration State
  const [sharedSessionId, setSharedSessionId] = useState<string | undefined>(undefined);
  const [accessKey, setAccessKey] = useState<string | undefined>(undefined);
  
  // Card Viewer State
  const [viewCardId, setViewCardId] = useState<string | undefined>(undefined);

  // Deep Link State for Booking
  const [preSelectedMember, setPreSelectedMember] = useState<UserProfile | null>(null);

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

  const [tempChannel, setTempChannel] = useState<Channel | null>(null);
  const [globalVoice, setGlobalVoice] = useState('Auto');
  const [chatTargetId, setChatTargetId] = useState<string | null>(null);

  const allApps = [
    { id: 'podcasts', label: t.podcasts, icon: Podcast, action: () => { handleSetViewState('directory'); setActiveTab('categories'); }, color: 'text-indigo-400' },
    { id: 'mission', label: t.mission, icon: Rocket, action: () => handleSetViewState('mission'), color: 'text-orange-500' },
    { id: 'code_studio', label: t.code, icon: Code, action: () => handleSetViewState('code_studio'), color: 'text-blue-400' },
    { id: 'notebook_viewer', label: t.notebooks, icon: Book, action: () => handleSetViewState('notebook_viewer'), color: 'text-orange-300' },
    { id: 'whiteboard', label: t.whiteboard, icon: PenTool, action: () => handleSetViewState('whiteboard'), color: 'text-pink-400' },
    { id: 'chat', label: t.chat, icon: MessageSquare, action: () => handleSetViewState('chat'), color: 'text-indigo-400' },
    { id: 'calendar', label: t.calendar, icon: Calendar, action: () => { handleSetViewState('directory'); setActiveTab('calendar'); }, color: 'text-emerald-400' },
    { id: 'careers', label: t.careers, icon: Briefcase, action: () => handleSetViewState('careers'), color: 'text-yellow-400' },
    { id: 'blog', label: t.blog, icon: Rss, action: () => handleSetViewState('blog'), color: 'text-orange-400' },
    { id: 'card_workshop', label: t.cards, icon: Gift, action: () => handleSetViewState('card_workshop'), color: 'text-red-400' },
    { id: 'icon_studio', label: t.icons, icon: AppWindow, action: () => handleSetViewState('icon_studio'), color: 'text-cyan-400' },
    { id: 'mentorship', label: t.mentorship, icon: Users, action: () => { handleSetViewState('directory'); setActiveTab('mentorship'); }, color: 'text-purple-400' },
    { id: 'groups', label: t.groups, icon: Users, action: () => { handleSetViewState('directory'); setActiveTab('groups'); }, color: 'text-cyan-400' },
    { id: 'recordings', label: t.recordings, icon: Disc, action: () => { handleSetViewState('directory'); setActiveTab('recordings'); }, color: 'text-red-400' },
    { id: 'docs', label: t.docs, icon: FileText, action: () => { handleSetViewState('directory'); setActiveTab('docs'); }, color: 'text-gray-400' },
  ];

  const handleSetViewState = (newState: ExtendedViewState) => {
    stopAllPlatformAudio(`Navigation:${viewState}->${newState}`);
    setViewState(newState);
  };

  useEffect(() => {
    const updateAudioState = () => setAudioIsPlaying(isAnyAudioPlaying());
    window.addEventListener('audio-audit-updated', updateAudioState);
    return () => window.removeEventListener('audio-audit-updated', updateAudioState);
  }, []);

  useEffect(() => {
    if (isFirebaseConfigured) {
        auth.onAuthStateChanged(async (user) => {
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
  }, []);

  useEffect(() => {
      if (currentUser && isFirebaseConfigured) {
          const unsub = setupSubscriptionListener(currentUser.uid, (newTier) => {
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
        if (currentUser.email === 'shengliang.song@gmail.com') {
             const unsubAdmin = subscribeToAllChannelsAdmin((data) => setPublicChannels(data));
             return () => unsubAdmin();
        }
        const unsubPublic = subscribeToPublicChannels((data) => setPublicChannels(data));
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
    unique.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    setChannels(unique);
  }, [userChannels, publicChannels, groupChannels]);

  const activeChannel = useMemo(() => {
      return tempChannel || channels.find(c => c.id === activeChannelId);
  }, [channels, activeChannelId, tempChannel]);

  const handleVote = async (id: string, type: 'like' | 'dislike', e: React.MouseEvent) => {
    e.stopPropagation();
    setChannels(prev => prev.map(c => {
      if (c.id === id) return type === 'like' ? { ...c, likes: c.likes + 1 } : { ...c, dislikes: c.dislikes + 1 };
      return c;
    }));
    const channel = channels.find(c => c.id === id);
    if (channel) await voteChannel(channel, type);
  };

  const handleCreateChannel = async (newChannel: Channel) => {
    try {
        const channelToSave = { ...newChannel, createdAt: newChannel.createdAt || Date.now() };
        setUserChannels(prev => [channelToSave, ...prev]);
        await saveUserChannel(channelToSave);
        if (channelToSave.visibility === 'public' || channelToSave.visibility === 'group') await publishChannelToFirestore(channelToSave);
    } catch (error: any) { console.error("Failed to create channel:", error); }
  };

  const handleStartLiveSession = (channel: Channel, context?: string, recordingEnabled?: boolean, bookingId?: string, videoEnabled?: boolean, cameraEnabled?: boolean) => {
      const existing = channels.find(c => c.id === channel.id);
      if (!existing) setTempChannel(channel); else setTempChannel(null);
      setActiveChannelId(channel.id);
      setLiveConfig({ context, bookingId, recording: recordingEnabled, video: videoEnabled, camera: cameraEnabled });
      handleSetViewState('live_session');
  };

  const handleMessageCreator = async (creatorId: string, creatorName: string) => {
      if (!currentUser) return alert("Please sign in to message creators.");
      try {
          const dmId = await createOrGetDMChannel(creatorId, creatorName);
          setChatTargetId(dmId);
          handleSetViewState('chat');
      } catch(e) { alert("Could not start chat."); }
  };

  const feedChannels = useMemo(() => {
      let data = [...channels];
      if (searchQuery) {
          const lowerQ = searchQuery.toLowerCase();
          data = data.filter(c => c.title.toLowerCase().includes(lowerQ) || c.description.toLowerCase().includes(lowerQ));
      }
      return data;
  }, [channels, searchQuery]);

  const handleBookFromProfile = (user: UserProfile) => {
      setPreSelectedMember(user);
      setActiveTab('mentorship');
      handleSetViewState('directory');
  };

  if (authLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-indigo-400"><Loader2 size={48} className="animate-spin mb-4" /></div>;
  if (!currentUser) return <LoginPage onPrivacyClick={() => setIsPrivacyOpen(false)} onMissionClick={() => handleSetViewState('mission')} />;

  const MobileBottomNav = () => {
    const quickAppId = userProfile?.preferredMobileQuickApp || 'code_studio';
    const quickApp = allApps.find(a => a.id === quickAppId) || allApps[1];
    return (
      <div className="md:hidden fixed bottom-0 left-0 w-full bg-slate-950/90 backdrop-blur-md border-t border-slate-800 z-50 px-6 py-2 flex justify-between items-center safe-area-bottom">
          <button onClick={() => { handleSetViewState('directory'); setActiveTab('categories'); }} className={`flex flex-col items-center gap-1 ${viewState === 'directory' && activeTab === 'categories' ? 'text-white' : 'text-slate-500'}`}><Home size={24}/><span className="text-[10px]">Home</span></button>
          <button onClick={() => quickApp.action()} className={`flex flex-col items-center gap-1 ${viewState === quickAppId ? 'text-white' : 'text-slate-500'}`}><quickApp.icon size={24}/><span className="text-[10px]">{quickApp.label}</span></button>
          <button onClick={() => setIsVoiceCreateOpen(true)} className="flex flex-col items-center justify-center -mt-6"><div className="bg-gradient-to-r from-blue-500 to-red-500 p-0.5 rounded-xl w-12 h-8 flex items-center justify-center shadow-lg"><div className="bg-black w-full h-full rounded-lg flex items-center justify-center"><Plus size={20} className="text-white"/></div></div></button>
          <button onClick={() => setIsAppsMenuOpen(true)} className={`flex flex-col items-center gap-1 ${isAppsMenuOpen ? 'text-white' : 'text-slate-500'}`}><LayoutGrid size={24}/><span className="text-[10px]">Apps</span></button>
          <button onClick={() => setIsUserMenuOpen(true)} className={`flex flex-col items-center gap-1 ${isUserMenuOpen ? 'text-white' : 'text-slate-500'}`}><User size={24}/><span className="text-[10px]">Profile</span></button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {viewState !== 'live_session' && (
      <nav className="hidden md:block sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center cursor-pointer" onClick={() => { handleSetViewState('directory'); setActiveTab('categories'); }}><BrandLogo size={36}/><span className="ml-3 text-xl font-bold">AIVoiceCast</span></div>
            <div className="flex flex-1 max-w-md mx-8 relative"><input type="text" className="block w-full pl-10 pr-3 py-2 border border-slate-700 rounded-full bg-slate-800/50 text-slate-300" placeholder={t.search} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}/></div>
            <div className="flex items-center space-x-4"><StudioMenu isUserMenuOpen={isUserMenuOpen} setIsUserMenuOpen={setIsUserMenuOpen} userProfile={userProfile} setUserProfile={setUserProfile} currentUser={currentUser} globalVoice={globalVoice} setGlobalVoice={setGlobalVoice} setIsCreateModalOpen={setIsCreateModalOpen} setIsVoiceCreateOpen={setIsVoiceCreateOpen} setIsSyncModalOpen={setIsSyncModalOpen} setIsSettingsModalOpen={setIsAccountSettingsOpen} onOpenUserGuide={() => handleSetViewState('user_guide')} onNavigate={(view: any) => handleSetViewState(view)} onOpenPrivacy={() => setIsPrivacyOpen(true)} t={t} channels={channels} language={language} setLanguage={setLanguage} allApps={allApps}/></div>
        </div>
      </nav>
      )}

      <div className="flex-1 overflow-hidden h-[calc(100vh-64px)] pb-16 md:pb-0">
        {viewState === 'directory' && (
           <div className="h-full overflow-y-auto p-8 max-w-7xl mx-auto w-full pb-20">
               {activeTab === 'categories' && <PodcastFeed channels={feedChannels} onChannelClick={(id) => { setActiveChannelId(id); handleSetViewState('podcast_detail'); }} onStartLiveSession={handleStartLiveSession} userProfile={userProfile} globalVoice={globalVoice} onRefresh={() => {}} t={t} currentUser={currentUser} setChannelToEdit={setChannelToEdit} setIsSettingsModalOpen={setIsSettingsModalOpen} onCommentClick={() => {}} handleVote={handleVote} onMessageCreator={handleMessageCreator} isFeedActive={true} />}
               {activeTab === 'mentorship' && <MentorBooking currentUser={currentUser} channels={channels} onStartLiveSession={handleStartLiveSession} initialMember={preSelectedMember} />}
               {activeTab === 'calendar' && <CalendarView channels={channels} handleChannelClick={id => { setActiveChannelId(id); handleSetViewState('podcast_detail'); }} handleVote={handleVote} currentUser={currentUser} setChannelToEdit={() => {}} setIsSettingsModalOpen={() => {}} globalVoice={globalVoice} t={t} onCommentClick={() => {}} onStartLiveSession={handleStartLiveSession} onCreateChannel={handleCreateChannel} onSchedulePodcast={() => {}} />}
           </div>
        )}
        {viewState === 'podcast_detail' && activeChannel && <PodcastDetail channel={activeChannel} onBack={() => handleSetViewState('directory')} onStartLiveSession={(context, lectureId, recording, video, segment, camera) => { setLiveConfig({ context, bookingId: lectureId, recording, video, camera, segment }); handleSetViewState('live_session'); }} language={language} currentUser={currentUser} />}
        {viewState === 'live_session' && activeChannel && <div className="fixed inset-0 z-[100] bg-slate-950"><LiveSession channel={activeChannel} initialContext={liveConfig.context} lectureId={liveConfig.bookingId} recordingEnabled={liveConfig.recording} videoEnabled={liveConfig.video} cameraEnabled={liveConfig.camera} activeSegment={liveConfig.segment} initialTranscript={liveConfig.initialTranscript} onEndSession={() => handleSetViewState('podcast_detail')} language={language} /></div>}
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default App;
