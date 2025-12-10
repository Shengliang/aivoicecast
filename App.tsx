import React, { useState, useEffect } from 'react';
import { ViewState, Channel, UserProfile } from './types';
import { auth } from './services/firebaseConfig';
import { getUserProfile, voteChannel, publishChannelToFirestore } from './services/firestoreService';
import { CalendarView } from './components/CalendarView';
import { PodcastDetail } from './components/PodcastDetail';
import { LiveSession } from './components/LiveSession';
import { CreateChannelModal } from './components/CreateChannelModal';
import { VoiceCreateModal } from './components/VoiceCreateModal';
import { ApiKeyModal } from './components/ApiKeyModal';
import { DataSyncModal } from './components/DataSyncModal';
import { SettingsModal } from './components/SettingsModal';
import { PricingModal } from './components/PricingModal';
import { StudioMenu } from './components/StudioMenu';
import { MissionManifesto } from './components/MissionManifesto';
import { HelpCenter } from './components/HelpCenter';
import { CodeStudio } from './components/CodeStudio';
import { Whiteboard } from './components/Whiteboard';
import { BlogView } from './components/BlogView';
import { WorkplaceChat } from './components/WorkplaceChat';
import { CareerCenter } from './components/CareerCenter';
import { DebugView } from './components/DebugView';
import { CloudDebugView } from './components/CloudDebugView';
import { FirestoreInspector } from './components/FirestoreInspector';
import { PublicChannelInspector } from './components/PublicChannelInspector';
import { LoginPage } from './components/LoginPage';
import { Notifications } from './components/Notifications';
import { UserAuth } from './components/UserAuth';
import { HANDCRAFTED_CHANNELS } from './utils/initialData';
import { Podcast, Menu, Globe, Calendar as CalendarIcon, Briefcase, Code, PenTool, Rss, MessageSquare, ShieldAlert } from 'lucide-react';

type ExtendedViewState = ViewState | 'firestore_debug' | 'help';

const UI_TEXT = {
  en: {
    directory: "Discover",
    host: "Host",
  },
  zh: {
    directory: "发现",
    host: "主播",
  }
};

export const App: React.FC = () => {
  const [viewState, setViewState] = useState<ExtendedViewState>('directory');
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>(HANDCRAFTED_CHANNELS);
  const [language, setLanguage] = useState<'en' | 'zh'>('en');
  
  // Auth State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isVoiceCreateOpen, setIsVoiceCreateOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [channelToEdit, setChannelToEdit] = useState<Channel | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Session State
  const [sessionContext, setSessionContext] = useState<string | undefined>(undefined);
  const [sessionLectureId, setSessionLectureId] = useState<string | undefined>(undefined);
  const [sessionRecording, setSessionRecording] = useState(false);
  const [sessionVideo, setSessionVideo] = useState(false);
  const [sessionCamera, setSessionCamera] = useState(false);
  
  // Code/Whiteboard Session
  const [collabSessionId, setCollabSessionId] = useState<string | undefined>(undefined);
  const [accessKey, setAccessKey] = useState<string | undefined>(undefined);

  // Settings
  const [hasApiKey, setHasApiKey] = useState(false);
  const [globalVoice, setGlobalVoice] = useState('Auto');

  useEffect(() => {
    const key = localStorage.getItem('gemini_api_key');
    if (key) setHasApiKey(true);

    // URL Param handling
    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get('session');
    const keyParam = params.get('key');
    
    // Legacy params
    const codeSession = params.get('code_session');
    const boardSession = params.get('whiteboard_session');
    const viewParam = params.get('view');

    if (sessionParam) {
        setCollabSessionId(sessionParam);
        if (keyParam) setAccessKey(keyParam);
        // Infer view from context or default to code
        setViewState('code_studio');
    } else if (codeSession) {
        setCollabSessionId(codeSession);
        setViewState('code_studio');
    } else if (boardSession) {
        setCollabSessionId(boardSession);
        setViewState('whiteboard');
    } else if (viewParam === 'blog') {
        setViewState('blog');
    }

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      if (user) {
        const profile = await getUserProfile(user.uid);
        setUserProfile(profile);
      } else {
        setUserProfile(null);
      }
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const t = UI_TEXT[language];

  const activeChannel = channels.find(c => c.id === selectedChannelId);

  const handleChannelClick = (id: string) => {
    setSelectedChannelId(id);
    setViewState('podcast_detail');
  };

  const handleVote = async (id: string, type: 'like' | 'dislike', e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return alert("Please sign in to vote.");
    
    // Optimistic update
    setChannels(prev => prev.map(c => {
      if (c.id === id) {
        return { 
          ...c, 
          likes: type === 'like' ? c.likes + 1 : c.likes,
          dislikes: type === 'dislike' ? c.dislikes + 1 : c.dislikes
        };
      }
      return c;
    }));

    await voteChannel(id, type);
  };

  const handleCreateChannel = async (newChannel: Channel) => {
    setChannels(prev => [newChannel, ...prev]);
    if (currentUser) {
        await publishChannelToFirestore(newChannel);
    }
    handleChannelClick(newChannel.id);
  };

  const startLiveSession = (channel: Channel, context?: string, recordingEnabled?: boolean, lectureId?: string, videoEnabled?: boolean, cameraEnabled?: boolean) => {
      setSelectedChannelId(channel.id);
      setSessionContext(context);
      setSessionRecording(recordingEnabled || false);
      setSessionLectureId(lectureId);
      setSessionVideo(videoEnabled || false);
      setSessionCamera(cameraEnabled || false);
      setViewState('live_session');
  };

  // If no auth and not loading, show Login Page (unless viewing public share)
  if (!isAuthLoading && !currentUser && !collabSessionId && viewState !== 'blog') {
      return <LoginPage />;
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-16 md:w-20 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-6 gap-6 z-30 shrink-0">
        <div className="p-2 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl shadow-lg">
          <Podcast className="text-white w-6 h-6" />
        </div>
        
        <nav className="flex-1 flex flex-col gap-4 w-full px-2">
           <button onClick={() => setViewState('directory')} className={`p-3 rounded-xl transition-all ${viewState === 'directory' ? 'bg-slate-800 text-indigo-400' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`} title={t.directory}>
              <CalendarIcon size={22} />
           </button>
           <button onClick={() => setViewState('code_studio')} className={`p-3 rounded-xl transition-all ${viewState === 'code_studio' ? 'bg-slate-800 text-indigo-400' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`} title="Code Studio">
              <Code size={22} />
           </button>
           <button onClick={() => setViewState('whiteboard')} className={`p-3 rounded-xl transition-all ${viewState === 'whiteboard' ? 'bg-slate-800 text-indigo-400' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`} title="Whiteboard">
              <PenTool size={22} />
           </button>
           <button onClick={() => setViewState('chat')} className={`p-3 rounded-xl transition-all ${viewState === 'chat' ? 'bg-slate-800 text-indigo-400' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`} title="Workplace Chat">
              <MessageSquare size={22} />
           </button>
           <button onClick={() => setViewState('blog')} className={`p-3 rounded-xl transition-all ${viewState === 'blog' ? 'bg-slate-800 text-indigo-400' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`} title="Blog">
              <Rss size={22} />
           </button>
           <button onClick={() => setViewState('careers')} className={`p-3 rounded-xl transition-all ${viewState === 'careers' ? 'bg-slate-800 text-indigo-400' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`} title="Careers">
              <Briefcase size={22} />
           </button>
           {/* Admin/Debug Tools */}
           <button onClick={() => setViewState('public_debug')} className={`p-3 rounded-xl transition-all ${viewState === 'public_debug' ? 'bg-slate-800 text-emerald-400' : 'text-slate-600 hover:text-emerald-400 hover:bg-slate-800/50'}`} title="Public Channels">
              <Globe size={22} />
           </button>
           <button onClick={() => setViewState('firestore_debug')} className={`p-3 rounded-xl transition-all ${viewState === 'firestore_debug' ? 'bg-slate-800 text-amber-400' : 'text-slate-600 hover:text-amber-400 hover:bg-slate-800/50'}`} title="Firestore Inspector">
              <ShieldAlert size={22} />
           </button>
        </nav>

        <div className="flex flex-col gap-4 items-center w-full">
           <Notifications />
           <div className="relative">
              <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="relative">
                 {userProfile?.photoURL ? (
                    <img src={userProfile.photoURL} alt="Profile" className="w-10 h-10 rounded-full border-2 border-slate-700 hover:border-indigo-500 transition-colors object-cover" />
                 ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 border-2 border-slate-700 hover:border-indigo-500 hover:text-white transition-colors">
                       <Menu size={20} />
                    </div>
                 )}
                 {userProfile?.subscriptionTier === 'pro' && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border-2 border-slate-900"></div>
                 )}
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
                 onOpenHelp={() => setViewState('help')}
                 t={t}
              />
           </div>
        </div>
      </aside>

      {/* Main Content Switch */}
      <div className="flex-1 overflow-y-auto relative">
        {viewState === 'mission' && <MissionManifesto onBack={() => setViewState('directory')} />}
        
        {viewState === 'help' && <HelpCenter onBack={() => setViewState('directory')} />}

        {viewState === 'directory' && (
          <CalendarView 
             channels={channels}
             handleChannelClick={handleChannelClick}
             handleVote={handleVote}
             currentUser={currentUser}
             setChannelToEdit={setChannelToEdit}
             setIsSettingsModalOpen={setIsAccountSettingsOpen}
             globalVoice={globalVoice}
             t={t}
             onCommentClick={(channel) => { setSelectedChannelId(channel.id); setViewState('podcast_detail'); }}
             onStartLiveSession={startLiveSession}
             onCreateChannel={handleCreateChannel}
          />
        )}

        {viewState === 'podcast_detail' && activeChannel && (
          <PodcastDetail 
             channel={activeChannel} 
             onBack={() => setViewState('directory')}
             onStartLiveSession={(ctx, lid, rec, vid, seg, cam) => startLiveSession(activeChannel, ctx, rec, lid, vid, cam)}
             language={language}
             onEditChannel={() => { setChannelToEdit(activeChannel); }}
             onViewComments={() => { /* Handled internally in detail view */ }}
             currentUser={currentUser}
          />
        )}

        {viewState === 'live_session' && activeChannel && (
          <LiveSession 
             channel={activeChannel}
             initialContext={sessionContext}
             lectureId={sessionLectureId}
             recordingEnabled={sessionRecording}
             videoEnabled={sessionVideo}
             cameraEnabled={sessionCamera}
             onEndSession={() => setViewState('podcast_detail')}
             language={language}
          />
        )}

        {viewState === 'code_studio' && (
            <CodeStudio 
               onBack={() => setViewState('directory')} 
               currentUser={currentUser}
               sessionId={collabSessionId}
               accessKey={accessKey}
               onSessionStart={(id) => setCollabSessionId(id)}
            />
        )}

        {viewState === 'whiteboard' && (
            <Whiteboard 
               onBack={() => setViewState('directory')}
               sessionId={collabSessionId}
               accessKey={accessKey}
               onSessionStart={(id) => setCollabSessionId(id)}
            />
        )}

        {viewState === 'chat' && (
            <WorkplaceChat 
               onBack={() => setViewState('directory')}
               currentUser={currentUser}
            />
        )}

        {viewState === 'blog' && (
            <BlogView 
               currentUser={currentUser} 
               onBack={() => setViewState('directory')}
            />
        )}

        {viewState === 'careers' && (
            <CareerCenter 
               onBack={() => setViewState('directory')} 
               currentUser={currentUser}
            />
        )}

        {viewState === 'debug' && (
            <DebugView onBack={() => setViewState('directory')} />
        )}

        {viewState === 'cloud_debug' && (
            <CloudDebugView onBack={() => setViewState('directory')} />
        )}

        {viewState === 'firestore_debug' && (
            <FirestoreInspector onBack={() => setViewState('directory')} />
        )}

        {viewState === 'public_debug' && (
            <PublicChannelInspector onBack={() => setViewState('directory')} />
        )}
      </div>

      {/* Modals */}
      {isCreateModalOpen && (
        <CreateChannelModal 
          isOpen={isCreateModalOpen} 
          onClose={() => setIsCreateModalOpen(false)} 
          onCreate={handleCreateChannel}
        />
      )}

      {isVoiceCreateOpen && (
        <VoiceCreateModal 
          isOpen={isVoiceCreateOpen} 
          onClose={() => setIsVoiceCreateOpen(false)} 
          onCreate={handleCreateChannel}
        />
      )}

      {isApiKeyModalOpen && (
        <ApiKeyModal 
          isOpen={isApiKeyModalOpen} 
          onClose={() => setIsApiKeyModalOpen(false)} 
          onKeyUpdate={(hasKey) => setHasApiKey(hasKey)}
        />
      )}

      {isSyncModalOpen && (
        <DataSyncModal 
          isOpen={isSyncModalOpen} 
          onClose={() => setIsSyncModalOpen(false)} 
        />
      )}

      {isAccountSettingsOpen && userProfile && (
          <SettingsModal 
             isOpen={true} 
             onClose={() => setIsAccountSettingsOpen(false)} 
             user={userProfile} 
             onUpdateProfile={(updated) => setUserProfile(updated)}
             onUpgradeClick={() => setIsPricingOpen(true)}
             onOpenHelp={() => { setIsAccountSettingsOpen(false); setViewState('help'); }}
          />
      )}

      {isPricingOpen && userProfile && (
          <PricingModal 
             isOpen={isPricingOpen} 
             onClose={() => setIsPricingOpen(false)}
             user={userProfile}
             onSuccess={(tier) => {
                 setUserProfile({ ...userProfile, subscriptionTier: tier });
                 setIsPricingOpen(false);
             }}
          />
      )}
    </div>
  );
};