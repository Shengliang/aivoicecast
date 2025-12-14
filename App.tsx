
import React, { useState, useEffect, useMemo } from 'react';
import { Podcast, Search, Menu, X, Plus, Home, Mic, Video, LayoutGrid, List, Calendar, MessageSquare, FileText, Code, Briefcase, PenTool, Settings, Shield, HardDrive, Cloud, Book, Rocket, Users } from 'lucide-react';
import { Channel, ViewState, UserProfile, TranscriptItem } from './types';
import { HANDCRAFTED_CHANNELS } from './utils/initialData';
import { auth, isFirebaseConfigured as isServiceConfigured } from './services/firebaseConfig';
import { getPublicChannels, subscribeToPublicChannels, getUserProfile, voteChannel, syncUserProfile } from './services/firestoreService';
import { saveUserChannel } from './utils/db';
import { UserAuth } from './components/UserAuth';
import { PodcastFeed } from './components/PodcastFeed';
import { PodcastDetail } from './components/PodcastDetail';
import { LiveSession } from './components/LiveSession';
import { CalendarView } from './components/CalendarView';
import { StudioMenu } from './components/StudioMenu';
import { Notifications } from './components/Notifications';
import { CreateChannelModal } from './components/CreateChannelModal';
import { VoiceCreateModal } from './components/VoiceCreateModal';
import { ApiKeyModal } from './components/ApiKeyModal';
import { DataSyncModal } from './components/DataSyncModal';
import { FirebaseConfigModal } from './components/FirebaseConfigModal';
import { SettingsModal } from './components/SettingsModal';
import { GroupManager } from './components/GroupManager';
import { DocumentList } from './components/DocumentList';
import { RecordingList } from './components/RecordingList';
import { MentorBooking } from './components/MentorBooking';
import { CodeStudio } from './components/CodeStudio';
import { Whiteboard } from './components/Whiteboard';
import { BlogView } from './components/BlogView';
import { WorkplaceChat } from './components/WorkplaceChat';
import { CareerCenter } from './components/CareerCenter';
import { UserManual } from './components/UserManual';
import { MissionManifesto } from './components/MissionManifesto';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { FirestoreInspector } from './components/FirestoreInspector';
import { PublicChannelInspector } from './components/PublicChannelInspector';
import { DebugView } from './components/DebugView';
import { CloudDebugView } from './components/CloudDebugView';
import { LoginPage } from './components/LoginPage';
import { ChannelSettingsModal } from './components/ChannelSettingsModal';
import { CommentsModal } from './components/CommentsModal';
import { PodcastListTable, SortKey } from './components/PodcastListTable';

const UI_TEXT = {
  en: {
    appTitle: "AIVoiceCast",
    search: "Search podcasts, topics, or mentors...",
    host: "Host",
  },
  zh: {
    appTitle: "AIVoiceCast",
    search: "搜索播客，主题或导师...",
    host: "主播",
  }
};

export default function App() {
  const [language, setLanguage] = useState<'en' | 'zh'>('en');
  const t = UI_TEXT[language];
  
  // State
  const [viewState, setViewState] = useState<ViewState>('directory');
  const [searchQuery, setSearchQuery] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [globalVoice, setGlobalVoice] = useState('Auto');
  const [hasApiKey, setHasApiKey] = useState(!!localStorage.getItem('gemini_api_key'));
  
  // Config State: Initialize based on what the Service reports (Private Keys OR LocalStorage)
  const [isFirebaseConfigured, setIsFirebaseConfigured] = useState(isServiceConfigured); 

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isVoiceCreateOpen, setIsVoiceCreateOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isFirebaseConfigOpen, setIsFirebaseConfigOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [channelToEdit, setChannelToEdit] = useState<Channel | null>(null);
  const [commentChannel, setCommentChannel] = useState<Channel | null>(null);

  // Live Session Props (passed when starting session)
  const [liveSessionProps, setLiveSessionProps] = useState<any>(null);

  // View Mode for List (Grid vs List)
  const [listViewMode, setListViewMode] = useState<'grid' | 'list'>('grid');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'likes', direction: 'desc' });

  // Load User
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

  // Load Channels
  useEffect(() => {
    // Merge Handcrafted with Public Channels from Firestore
    // For demo simplicity, we load handcrafted + public snapshot
    const loadChannels = async () => {
        let publicChannels: Channel[] = [];
        try {
            publicChannels = await getPublicChannels();
        } catch(e) {
            console.warn("Offline or failed to fetch public channels");
        }
        
        // Merge without duplicates (ID check)
        const combined = [...HANDCRAFTED_CHANNELS];
        publicChannels.forEach(pc => {
            if (!combined.find(c => c.id === pc.id)) {
                combined.push(pc);
            }
        });
        setChannels(combined);
    };
    loadChannels();
    
    // Subscribe for updates
    const unsub = subscribeToPublicChannels((updated) => {
         setChannels(prev => {
             // Keep handcrafted, update public ones
             const handcrafted = prev.filter(c => HANDCRAFTED_CHANNELS.some(hc => hc.id === c.id));
             // Remove handcrafted duplicates from updated if any
             const validUpdates = updated.filter(u => !handcrafted.some(h => h.id === u.id));
             return [...handcrafted, ...validUpdates];
         });
    });
    return () => unsub();
  }, []);

  const filteredChannels = useMemo(() => {
      let result = channels;
      if (searchQuery) {
          const q = searchQuery.toLowerCase();
          result = result.filter(c => 
              c.title.toLowerCase().includes(q) || 
              c.description.toLowerCase().includes(q) ||
              c.tags.some(tag => tag.toLowerCase().includes(q))
          );
      }
      
      if (listViewMode === 'list') {
          result.sort((a, b) => {
              const valA = a[sortConfig.key] || '';
              const valB = b[sortConfig.key] || '';
              if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
              if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
              return 0;
          });
      } else {
          // Default sort for grid (likes)
          result.sort((a, b) => b.likes - a.likes);
      }
      return result;
  }, [channels, searchQuery, listViewMode, sortConfig]);

  const handleChannelClick = (id: string) => {
      setActiveChannelId(id);
      setViewState('podcast_detail');
  };

  const handleStartLiveSession = (
      channel: Channel, 
      context?: string, 
      recordingEnabled?: boolean, 
      bookingId?: string, 
      videoEnabled?: boolean, 
      cameraEnabled?: boolean,
      activeSegment?: { index: number, lectureId: string },
      initialTranscript?: TranscriptItem[],
      discussionId?: string
  ) => {
      setLiveSessionProps({
          channel,
          initialContext: context,
          lectureId: bookingId,
          recordingEnabled,
          videoEnabled,
          cameraEnabled,
          activeSegment,
          initialTranscript,
          existingDiscussionId: discussionId,
          onEndSession: () => {
              setViewState('directory');
              setLiveSessionProps(null);
          },
          language
      });
      setViewState('live_session');
  };

  const handleCreateChannel = async (newChannel: Channel) => {
      setChannels(prev => [newChannel, ...prev]);
      if (newChannel.visibility === 'public') {
          // Additional logic for public channels if needed
      }
      if (currentUser) {
          await saveUserChannel(newChannel);
      }
      handleChannelClick(newChannel.id);
  };

  const handleVote = async (id: string, type: 'like' | 'dislike', e: React.MouseEvent) => {
      e.stopPropagation();
      await voteChannel(id, type);
      // Optimistic update
      setChannels(prev => prev.map(c => {
          if (c.id === id) {
              return { ...c, likes: type === 'like' ? c.likes + 1 : c.likes, dislikes: type === 'dislike' ? c.dislikes + 1 : c.dislikes };
          }
          return c;
      }));
  };

  const handleSort = (key: SortKey) => {
      setSortConfig(current => ({
          key,
          direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
      }));
  };

  const renderView = () => {
      switch(viewState) {
          case 'directory':
              return (
                  <div className="flex flex-col h-full">
                      {/* View Toggles */}
                      <div className="flex justify-end px-6 pt-4">
                          <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800">
                              <button onClick={() => setListViewMode('grid')} className={`p-2 rounded ${listViewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}><LayoutGrid size={16}/></button>
                              <button onClick={() => setListViewMode('list')} className={`p-2 rounded ${listViewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}><List size={16}/></button>
                          </div>
                      </div>
                      
                      {listViewMode === 'grid' ? (
                          <PodcastFeed 
                              channels={filteredChannels}
                              onChannelClick={handleChannelClick}
                              onStartLiveSession={(ch) => handleStartLiveSession(ch)}
                              userProfile={userProfile}
                              globalVoice={globalVoice}
                              onRefresh={() => { /* re-fetch */ }}
                              t={t}
                              currentUser={currentUser}
                              setChannelToEdit={setChannelToEdit}
                              setIsSettingsModalOpen={setIsSettingsModalOpen}
                              onCommentClick={setCommentChannel}
                              handleVote={handleVote}
                          />
                      ) : (
                          <div className="p-6 overflow-y-auto">
                              <PodcastListTable 
                                  channels={filteredChannels}
                                  onChannelClick={handleChannelClick}
                                  sortConfig={sortConfig}
                                  onSort={handleSort}
                                  globalVoice={globalVoice}
                              />
                          </div>
                      )}
                  </div>
              );
          case 'podcast_detail':
              const channel = channels.find(c => c.id === activeChannelId);
              if (!channel) return <div>Channel not found</div>;
              return (
                  <PodcastDetail 
                      channel={channel} 
                      onBack={() => setViewState('directory')}
                      onStartLiveSession={(ctx, lid, rec, vid, seg, cam) => handleStartLiveSession(channel, ctx, rec, lid, vid, cam, seg)}
                      language={language}
                      currentUser={currentUser}
                      onEditChannel={() => { setChannelToEdit(channel); setIsSettingsModalOpen(true); }}
                      onViewComments={() => setCommentChannel(channel)}
                  />
              );
          case 'live_session':
              if (!liveSessionProps) return <div>No active session</div>;
              return <LiveSession {...liveSessionProps} />;
          case 'calendar':
              return <CalendarView 
                        channels={channels} 
                        handleChannelClick={handleChannelClick}
                        handleVote={handleVote}
                        currentUser={currentUser}
                        setChannelToEdit={setChannelToEdit}
                        setIsSettingsModalOpen={setIsSettingsModalOpen}
                        globalVoice={globalVoice}
                        t={t}
                        onCommentClick={setCommentChannel}
                        onStartLiveSession={handleStartLiveSession}
                        onCreateChannel={handleCreateChannel}
                     />;
          case 'recordings':
              return <div className="p-6 overflow-y-auto h-full"><RecordingList onBack={() => setViewState('directory')} onStartLiveSession={handleStartLiveSession} /></div>;
          case 'mentorship':
              return <div className="overflow-y-auto h-full"><MentorBooking currentUser={currentUser} channels={channels} onStartLiveSession={handleStartLiveSession}/></div>;
          case 'groups':
              return <div className="p-6 overflow-y-auto h-full"><GroupManager /></div>;
          case 'documents':
              return <div className="p-6 overflow-y-auto h-full"><DocumentList onBack={() => setViewState('directory')} /></div>;
          case 'code_studio':
              return <CodeStudio onBack={() => setViewState('directory')} currentUser={currentUser} userProfile={userProfile} onStartLiveSession={handleStartLiveSession} />;
          case 'whiteboard':
              return <Whiteboard onBack={() => setViewState('directory')} />;
          case 'blog':
              return <BlogView currentUser={currentUser} onBack={() => setViewState('directory')} />;
          case 'chat':
              return <WorkplaceChat onBack={() => setViewState('directory')} currentUser={currentUser} />;
          case 'careers':
              return <CareerCenter onBack={() => setViewState('directory')} currentUser={currentUser} />;
          case 'user_guide':
              return <UserManual onBack={() => setViewState('directory')} />;
          case 'mission':
              return <MissionManifesto onBack={() => setViewState('directory')} />;
          case 'privacy':
              return <PrivacyPolicy onBack={() => setViewState('directory')} />;
          case 'debug':
              return <DebugView onBack={() => setViewState('directory')} />;
          case 'cloud_debug':
              return <CloudDebugView onBack={() => setViewState('directory')} />;
          case 'public_debug':
              return <PublicChannelInspector onBack={() => setViewState('directory')} />;
          case 'firestore_debug':
              return <FirestoreInspector onBack={() => setViewState('directory')} />;
          default:
              return <div>View not found</div>;
      }
  };

  // If Firebase not configured, show modal
  if (!isFirebaseConfigured) {
      return (
          <FirebaseConfigModal 
              isOpen={true} 
              onClose={() => {}} 
              onConfigUpdate={(configured) => setIsFirebaseConfigured(configured)} 
          />
      );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
        {/* Navbar */}
        {!['live_session', 'code_studio', 'whiteboard'].includes(viewState) && (
            <header className="h-16 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-4 sm:px-6 z-50 shrink-0">
                
                <div className="flex items-center cursor-pointer" onClick={() => { setViewState('directory'); }}>
                  <div className="bg-gradient-to-tr from-indigo-600 to-purple-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
                    <Podcast className="text-white w-6 h-6" />
                  </div>
                  <span className="ml-3 text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 hidden sm:block">
                    {t.appTitle}
                  </span>
                </div>
                
                {/* Search Bar */}
                <div className="flex-1 max-w-md mx-4 relative hidden md:block">
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

                <div className="flex items-center space-x-2 sm:space-x-4">
                    {/* Navigation Icons (Desktop) */}
                    <div className="hidden lg:flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-800">
                        <button onClick={() => setViewState('directory')} className={`p-2 rounded-lg transition-colors ${viewState === 'directory' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Home"><Home size={18}/></button>
                        <button onClick={() => setViewState('calendar')} className={`p-2 rounded-lg transition-colors ${viewState === 'calendar' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Calendar"><Calendar size={18}/></button>
                        <button onClick={() => setViewState('mentorship')} className={`p-2 rounded-lg transition-colors ${viewState === 'mentorship' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Mentors"><Briefcase size={18}/></button>
                        <button onClick={() => setViewState('code_studio')} className={`p-2 rounded-lg transition-colors ${viewState === 'code_studio' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Code Studio"><Code size={18}/></button>
                    </div>

                    <Notifications />
                    
                    <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="relative">
                        <UserAuth />
                    </button>
                </div>
            </header>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-hidden relative">
            {renderView()}
        </main>

        {/* Mobile Navigation Bar */}
        {!['live_session', 'code_studio', 'whiteboard'].includes(viewState) && (
            <div className="md:hidden h-16 bg-slate-950 border-t border-slate-800 flex items-center justify-around shrink-0 z-50">
                <button onClick={() => setViewState('directory')} className={`flex flex-col items-center gap-1 ${viewState === 'directory' ? 'text-indigo-400' : 'text-slate-500'}`}>
                    <Home size={20}/> <span className="text-[10px]">Home</span>
                </button>
                <button onClick={() => setViewState('calendar')} className={`flex flex-col items-center gap-1 ${viewState === 'calendar' ? 'text-indigo-400' : 'text-slate-500'}`}>
                    <Calendar size={20}/> <span className="text-[10px]">Agenda</span>
                </button>
                <button onClick={() => setViewState('code_studio')} className={`flex flex-col items-center gap-1 ${viewState === 'code_studio' ? 'text-indigo-400' : 'text-slate-500'}`}>
                    <Code size={20}/> <span className="text-[10px]">Code</span>
                </button>
                <button onClick={() => setViewState('mentorship')} className={`flex flex-col items-center gap-1 ${viewState === 'mentorship' ? 'text-indigo-400' : 'text-slate-500'}`}>
                    <Users size={20}/> <span className="text-[10px]">Peers</span>
                </button>
                <button onClick={() => setIsUserMenuOpen(true)} className={`flex flex-col items-center gap-1 text-slate-500`}>
                    <Menu size={20}/> <span className="text-[10px]">Menu</span>
                </button>
            </div>
        )}

        {/* Modals */}
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
            setIsSettingsModalOpen={setIsSettingsModalOpen}
            onOpenUserGuide={() => setViewState('user_guide')}
            t={t}
        />

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
            onKeyUpdate={(val) => setHasApiKey(val)}
        />

        <DataSyncModal 
            isOpen={isSyncModalOpen}
            onClose={() => setIsSyncModalOpen(false)}
        />

        {currentUser && (
            <SettingsModal 
                isOpen={isSettingsModalOpen} 
                onClose={() => setIsSettingsModalOpen(false)} 
                user={userProfile || { uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || '', photoURL: currentUser.photoURL || '', groups: [], createdAt: Date.now() }}
                onUpdateProfile={(updated) => setUserProfile(updated)}
            />
        )}

        {channelToEdit && (
            <ChannelSettingsModal 
                isOpen={!!channelToEdit}
                onClose={() => setChannelToEdit(null)}
                channel={channelToEdit}
                onUpdate={(updated) => {
                    setChannels(prev => prev.map(c => c.id === updated.id ? updated : c));
                    if (currentUser) saveUserChannel(updated);
                }}
            />
        )}

        {commentChannel && (
            <CommentsModal 
                isOpen={!!commentChannel}
                onClose={() => setCommentChannel(null)}
                channel={commentChannel}
                currentUser={currentUser}
                onAddComment={(text, attachments) => {
                    // Handled inside modal via firestore, just refreshing UI state handled by listener
                }}
            />
        )}

    </div>
  );
}
