import React, { useState, useEffect, useMemo } from 'react';
import { Channel, ViewState, UserProfile, TranscriptItem, SubscriptionTier } from './types';
import { 
  Podcast, Search, Sparkles, LogOut, 
  Menu, X, Plus, Github, Database, Cloud, Globe, 
  Calendar, Briefcase, Users, Disc, FileText, AlertTriangle, Table as TableIcon, LayoutGrid, Rocket, Code, Wand2, PenTool, Rss, Loader2, MessageSquare,
  Home, Video as VideoIcon, User, ArrowLeft, Play, Book, Gift
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
import { NotebookViewer } from './components/NotebookViewer'; 
import { CardWorkshop } from './components/CardWorkshop';
import { CardExplorer } from './components/CardExplorer';

import { auth, isFirebaseConfigured } from './services/firebaseConfig';
import { 
  voteChannel, publishChannelToFirestore, updateCommentInChannel, 
  deleteCommentFromChannel, addCommentToChannel, getPublicChannels, 
  subscribeToPublicChannels, getGroupChannels, getUserProfile,
  setupSubscriptionListener, createOrGetDMChannel, subscribeToAllChannelsAdmin
} from './services/firestoreService';
import { getUserChannels, saveUserChannel, deleteUserChannel } from './utils/db';
import { HANDCRAFTED_CHANNELS } from './utils/initialData';

const UI_TEXT = {
  en: {
    appTitle: "AIVoiceCast",
    directory: "Explore", 
    search: "Search topics...",
    podcasts: "Podcasts",
    code: "Code Studio",
    notebooks: "LLM Notebooks",
    whiteboard: "Whiteboard",
    chat: "Team Chat",
    calendar: "Calendar",
    careers: "Careers",
    blog: "Community Blog",
    cards: "Card Workshop",
    mentorship: "Mentorship",
    groups: "Groups",
    recordings: "Recordings",
    docs: "Documents"
  }
};

type ExtendedViewState = ViewState | 'firestore_debug' | 'my_channel_debug' | 'card_viewer';

const App: React.FC = () => {
  const [language] = useState<'en' | 'zh'>('en');
  const t = UI_TEXT[language];
  const [viewState, setViewState] = useState<ExtendedViewState>('directory');
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isAppsMenuOpen, setIsAppsMenuOpen] = useState(false);
  const [isDesktopAppsOpen, setIsDesktopAppsOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('categories');
  const [searchQuery, setSearchQuery] = useState('');
  const [channels, setChannels] = useState<Channel[]>(HANDCRAFTED_CHANNELS);
  const [publicChannels, setPublicChannels] = useState<Channel[]>([]);
  const [userChannels, setUserChannels] = useState<Channel[]>([]);
  const [groupChannels, setGroupChannels] = useState<Channel[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createModalDate, setCreateModalDate] = useState<Date | null>(null);
  const [isVoiceCreateOpen, setIsVoiceCreateOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isFirebaseModalOpen, setIsFirebaseModalOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false); 
  const [isPricingOpen, setIsPricingOpen] = useState(false); 
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [channelToEdit, setChannelToEdit] = useState<Channel | null>(null);
  const [commentsChannel, setCommentsChannel] = useState<Channel | null>(null);
  const [sharedSessionId, setSharedSessionId] = useState<string | undefined>(undefined);
  const [accessKey, setAccessKey] = useState<string | undefined>(undefined);
  const [viewCardId, setViewCardId] = useState<string | undefined>(undefined);
  const [liveConfig, setLiveConfig] = useState<any>({});
  const [tempChannel, setTempChannel] = useState<Channel | null>(null);
  const [globalVoice, setGlobalVoice] = useState('Auto');
  const [chatTargetId, setChatTargetId] = useState<string | null>(null);

  const allApps = [
    { label: t.podcasts, icon: Podcast, action: () => { setViewState('directory'); setActiveTab('categories'); }, color: 'text-indigo-400' },
    { label: t.code, icon: Code, action: () => setViewState('code_studio'), color: 'text-blue-400' },
    { label: t.notebooks, icon: Book, action: () => setViewState('notebook_viewer'), color: 'text-orange-300' },
    { label: t.whiteboard, icon: PenTool, action: () => setViewState('whiteboard'), color: 'text-pink-400' },
    { label: t.chat, icon: MessageSquare, action: () => setViewState('chat'), color: 'text-indigo-400' },
    { label: t.calendar, icon: Calendar, action: () => { setViewState('directory'); setActiveTab('calendar'); }, color: 'text-emerald-400' },
    { label: t.careers, icon: Briefcase, action: () => setViewState('careers'), color: 'text-yellow-400' },
    { label: t.blog, icon: Rss, action: () => setViewState('blog'), color: 'text-orange-400' },
    { label: t.cards, icon: Gift, action: () => setViewState('card_workshop'), color: 'text-red-400' },
    { label: t.mentorship, icon: Users, action: () => { setViewState('directory'); setActiveTab('mentorship'); }, color: 'text-purple-400' },
    { label: t.groups, icon: Users, action: () => { setViewState('directory'); setActiveTab('groups'); }, color: 'text-cyan-400' },
    { label: t.recordings, icon: Disc, action: () => { setViewState('directory'); setActiveTab('recordings'); }, color: 'text-red-400' },
    { label: t.docs, icon: FileText, action: () => { setViewState('directory'); setActiveTab('docs'); }, color: 'text-gray-400' },
  ];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    const id = params.get('id');
    const tab = params.get('tab');
    if (view === 'directory' || (!view && tab)) { setViewState('directory'); if (tab) setActiveTab(tab); }
    else if (view === 'card' && id) { setViewCardId(id); setViewState('card_viewer'); }
    else if (view === 'podcast' && id) { setActiveChannelId(id); setViewState('podcast_detail'); }

    let unsubscribeAuth = () => {};
    if (isFirebaseConfigured) {
        unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
          setCurrentUser(user);
          if (user) { try { const profile = await getUserProfile(user.uid); setUserProfile(profile); } catch (e) {} }
          setAuthLoading(false); 
        });
    } else { setIsFirebaseModalOpen(true); setAuthLoading(false); }
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    const all = [...HANDCRAFTED_CHANNELS, ...userChannels, ...publicChannels, ...groupChannels];
    const unique = Array.from(new Map(all.map(item => [item.id, item])).values());
    unique.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    setChannels(unique);
  }, [userChannels, publicChannels, groupChannels]);

  const activeChannel = useMemo(() => tempChannel || channels.find(c => c.id === activeChannelId), [channels, activeChannelId, tempChannel]);

  const handleCreateChannel = async (newChannel: Channel) => {
    const ch = { ...newChannel, createdAt: Date.now() };
    setUserChannels(prev => [ch, ...prev]);
    await saveUserChannel(ch);
    if (ch.visibility !== 'private') await publishChannelToFirestore(ch);
  };

  const handleStartLiveSession = (channel: Channel, context?: string, recording?: boolean) => {
      setActiveChannelId(channel.id); setLiveConfig({ context, recording }); setViewState('live_session');
  };

  if (authLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-indigo-400"><Loader2 size={48} className="animate-spin" /></div>;
  if (!currentUser) return <LoginPage />;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      <nav className="hidden md:block sticky top-0 z-50 bg-slate-900 border-b border-slate-800 h-16">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
            <div className="flex items-center cursor-pointer" onClick={() => { setViewState('directory'); setActiveTab('categories'); }}>
              <div className="bg-indigo-600 p-2 rounded-xl"><Podcast className="text-white w-6 h-6" /></div>
              <span className="ml-3 text-xl font-bold">AIVoiceCast</span>
            </div>
            <div className="flex items-center space-x-4">
              <button onClick={() => setIsCreateModalOpen(true)} className="bg-indigo-600 px-4 py-1.5 rounded-lg text-xs font-bold">New</button>
              <UserAuth />
              <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="p-2 text-slate-400"><Menu size={24} /></button>
            </div>
        </div>
      </nav>

      <main className="h-[calc(100vh-64px)] overflow-hidden">
        {viewState === 'directory' && (
           <PodcastFeed channels={channels} onChannelClick={(id) => { setActiveChannelId(id); setViewState('podcast_detail'); }} onStartLiveSession={handleStartLiveSession} userProfile={userProfile} globalVoice={globalVoice} t={t} currentUser={currentUser} setChannelToEdit={setChannelToEdit} setIsSettingsModalOpen={setIsSettingsModalOpen} handleVote={() => {}} />
        )}
        {viewState === 'podcast_detail' && activeChannel && <PodcastDetail channel={activeChannel} onBack={() => setViewState('directory')} onStartLiveSession={handleStartLiveSession} language={language} currentUser={currentUser} />}
        {viewState === 'live_session' && activeChannel && (
          <div className="fixed inset-0 z-[100] bg-slate-950">
             <LiveSession channel={activeChannel} initialContext={liveConfig.context} recordingEnabled={liveConfig.recording} onEndSession={() => setViewState('podcast_detail')} language={language} />
          </div>
        )}
      </main>

      {isUserMenuOpen && (
        <StudioMenu isUserMenuOpen={isUserMenuOpen} setIsUserMenuOpen={setIsUserMenuOpen} userProfile={userProfile} setUserProfile={setUserProfile} currentUser={currentUser} globalVoice={globalVoice} setGlobalVoice={setGlobalVoice} hasApiKey={true} setIsCreateModalOpen={setIsCreateModalOpen} setIsVoiceCreateOpen={setIsVoiceCreateOpen} setIsApiKeyModalOpen={() => {}} setIsSyncModalOpen={setIsSyncModalOpen} setIsSettingsModalOpen={setIsAccountSettingsOpen} onOpenUserGuide={() => {}} onNavigate={setViewState} t={t} className="fixed top-16 right-4 z-[100]" channels={channels} />
      )}

      <CreateChannelModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onCreate={handleCreateChannel} />
      <VoiceCreateModal isOpen={isVoiceCreateOpen} onClose={() => setIsVoiceCreateOpen(false)} onCreate={handleCreateChannel} />
      <DataSyncModal isOpen={isSyncModalOpen} onClose={() => setIsSyncModalOpen(false)} />
      <FirebaseConfigModal isOpen={isFirebaseModalOpen} onClose={() => setIsFirebaseModalOpen(false)} onConfigUpdate={() => window.location.reload()} />
    </div>
  );
};

export default App;