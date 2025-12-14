import React, { useState, useEffect, useMemo } from 'react';
import { Channel, ViewState, UserProfile, TranscriptItem, SubscriptionTier } from './types';
import { 
  Podcast, Mic, Layout, Search, Sparkles, LogOut, 
  Settings, Menu, X, Plus, Github, Database, Cloud, Globe, 
  Calendar, Briefcase, Users, Disc, FileText, AlertTriangle, List, BookOpen, ChevronDown, Table as TableIcon, LayoutGrid, Rocket, Code, Wand2, PenTool, Rss, Loader2, MessageSquare,
  Home, Video as VideoIcon, Inbox, User, PlusSquare, ArrowLeft, Play, Book
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
import { NotebookViewer } from './components/NotebookViewer'; // New Import

import { auth, isFirebaseConfigured } from './services/firebaseConfig';
import { 
  voteChannel, publishChannelToFirestore, updateCommentInChannel, 
  deleteCommentFromChannel, addCommentToChannel, getPublicChannels, 
  subscribeToPublicChannels, getGroupChannels, getUserProfile,
  setupSubscriptionListener, createOrGetDMChannel
} from './services/firestoreService';
import { getUserChannels, saveUserChannel, deleteUserChannel } from './utils/db';
import { HANDCRAFTED_CHANNELS, CATEGORY_STYLES, TOPIC_CATEGORIES } from './utils/initialData';
import { OFFLINE_CHANNEL_ID } from './utils/offlineContent';
import { GEMINI_API_KEY } from './services/private_keys';

const APP_VERSION = "v3.67.0"; // Bump version

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
    mission: "Mission",
    code: "Code Studio",
    whiteboard: "Whiteboard",
    blog: "Community Blog",
    chat: "Team Chat",
    careers: "Careers",
    notebooks: "LLM Notebooks"
  },
  zh: {
    appTitle: "AI 播客",
    directory: "探索",
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
    careers: "职业发展",
    notebooks: "LLM 笔记本"
  }
};

type ExtendedViewState = ViewState | 'firestore_debug';

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
  
  // Messaging Target
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
    { label: t.mentorship, icon: Users, action: () => { setViewState('directory'); setActiveTab('mentorship'); }, color: 'text-purple-400' },
    { label: t.groups, icon: Users, action: () => { setViewState('directory'); setActiveTab('groups'); }, color: 'text-cyan-400' },
    { label: t.recordings, icon: Disc, action: () => { setViewState('directory'); setActiveTab('recordings'); }, color: 'text-red-400' },
    { label: t.docs, icon: FileText, action: () => { setViewState('directory'); setActiveTab('docs'); }, color: 'text-gray-400' },
  ];

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
    
    // 1. Optimistic UI Update (Channel Count)
    setChannels(prev => prev.map(c => {
      if (c.id === id) {
        // Simple increment for visual feedback
        return type === 'like' ? { ...c, likes: c.likes + 1 } : { ...c, dislikes: c.dislikes + 1 };
      }
      return c;
    }));

    // 2. Persist to Firestore
    const channel = channels.find(c => c.id === id);
    if (channel) {
        await voteChannel(channel, type);
        
        // 3. Update User Profile Locally (Optimistic)
        // This ensures visual "Heart" state stays consistent across the app
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

  // --- Messaging Logic ---
  const handleMessageCreator = async (creatorId: string, creatorName: string) => {
      if (!currentUser) { 
          alert("Please sign in to message creators.");
          return;
      }
      
      try {
          const dmId = await createOrGetDMChannel(creatorId, creatorName);
          setChatTargetId(dmId);
          setViewState('chat');
      } catch(e) {
          console.error("Failed to create DM:", e);
          alert("Could not start chat.");
      }
  };

  // --- Sorting Logic ---
  const handleSort = (key: SortKey) => {
      setSortConfig(current => ({
          key,
          direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
      }));
  };

  // Combined Channel List for Feed
  const feedChannels = useMemo(() => {
      let data = [...channels];
      
      // Filter for "Following" tab (Mobile)
      if (mobileFeedTab === 'following') {
          if (userProfile) {
              const followingIds = userProfile.following || [];
              const likedIds = userProfile.likedChannelIds || [];
              
              if (followingIds.length > 0 || likedIds.length > 0) {
                  data = data.filter(c => 
                      (c.ownerId && followingIds.includes(c.ownerId)) || 
                      likedIds.includes(c.id)
                  );
              } else {
                  data = [];
              }
          } else {
              // Guest viewing "Following" -> Empty
              data = [];
          }
      }

      if (searchQuery) {
          const lowerQ = searchQuery.toLowerCase();
          data = data.filter(c => 
              c.title.toLowerCase().includes(lowerQ) || 
              c.description.toLowerCase().includes(lowerQ) ||
              c.tags.some(t => t.toLowerCase().includes(lowerQ))
          );
      }
      
      return data;
  }, [channels, searchQuery, mobileFeedTab, userProfile]);

  const handleRefreshFeed = () => {
      // Simulate fetch new data by reshuffling locally for demo
      setChannels(prev => [...prev.sort(() => 0.5 - Math.random())]);
  };

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

  // Mobile Bottom Nav Component
  const MobileBottomNav = () => (
      <div className="md:hidden fixed bottom-0 left-0 w-full bg-slate-950/90 backdrop-blur-md border-t border-slate-800 z-50 px-6 py-2 flex justify-between items-center safe-area-bottom">
          <button 
              onClick={() => { setViewState('directory'); setActiveTab('categories'); setIsAppsMenuOpen(false); setIsUserMenuOpen(false); }}
              className={`flex flex-col items-center gap-1 ${viewState === 'directory' && activeTab === 'categories' && !isAppsMenuOpen && !isUserMenuOpen ? 'text-white' : 'text-slate-500'}`}
          >
              <Home size={24} fill={viewState === 'directory' && activeTab === 'categories' && !isAppsMenuOpen && !isUserMenuOpen ? "currentColor" : "none"} />
              <span className="text-[10px]">Home</span>
          </button>
          
          <button 
              onClick={() => { setViewState('directory'); setActiveTab('groups'); setIsAppsMenuOpen(false); setIsUserMenuOpen(false); }}
              className={`flex-1 flex-col items-center gap-1 hidden ${activeTab === 'groups' && !isAppsMenuOpen && !isUserMenuOpen ? 'text-white' : 'text-slate-500'}`}
          >
              {/* Hidden in simplified layout to fix spacing, or use flex-1 properly */}
          </button>
          
          <button 
              onClick={() => { setViewState('directory'); setActiveTab('groups'); setIsAppsMenuOpen(false); setIsUserMenuOpen(false); }}
              className={`flex flex-col items-center gap-1 ${activeTab === 'groups' && !isAppsMenuOpen && !isUserMenuOpen ? 'text-white' : 'text-slate-500'}`}
          >
              <Users size={24} fill={activeTab === 'groups' && !isAppsMenuOpen && !isUserMenuOpen ? "currentColor" : "none"} />
              <span className="text-[10px]">Friends</span>
          </button>

          <button 
              onClick={() => setIsVoiceCreateOpen(true)}
              className="flex flex-col items-center justify-center -mt-6"
          >
              <div className="bg-gradient-to-r from-blue-500 to-red-500 p-0.5 rounded-xl w-12 h-8 flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
                  <div className="bg-black w-full h-full rounded-lg flex items-center justify-center">
                      <Plus size={20} className="text-white"/>
                  </div>
              </div>
          </button>

          <button 
              onClick={() => { setIsAppsMenuOpen(true); setIsUserMenuOpen(false); }}
              className={`flex flex-col items-center gap-1 ${isAppsMenuOpen ? 'text-white' : 'text-slate-500'}`}
          >
              <LayoutGrid size={24} fill={isAppsMenuOpen ? "currentColor" : "none"} />
              <span className="text-[10px]">Apps</span>
          </button>

          <button 
              onClick={() => { setIsUserMenuOpen(true); setIsAppsMenuOpen(false); }}
              className={`flex-col items-center gap-1 ${isUserMenuOpen ? 'text-white' : 'text-slate-500'} flex`}
          >
              <User size={24} fill={isUserMenuOpen ? "currentColor" : "none"} />
              <span className="text-[10px]">Profile</span>
          </button>
      </div>
  );

  // Mobile Top Nav Component (Overlay on Feed)
  const MobileTopNav = () => {
      if (viewState !== 'directory' || activeTab !== 'categories') return null;
      return (
          <div className="md:hidden fixed top-0 left-0 w-full z-40 bg-gradient-to-b from-black/80 to-transparent p-4 flex items-center justify-between pointer-events-none">
              <button onClick={() => setViewState('live_session')} className="pointer-events-auto text-white/80 hover:text-white">
                  <VideoIcon size={24} />
              </button>
              
              <div className="flex gap-4 font-bold text-base pointer-events-auto">
                  <button 
                      onClick={() => setMobileFeedTab('following')}
                      className={`${mobileFeedTab === 'following' ? 'text-white border-b-2 border-white pb-1' : 'text-white/60'}`}
                  >
                      Following
                  </button>
                  <span className="text-white/20">|</span>
                  <button 
                      onClick={() => setMobileFeedTab('foryou')}
                      className={`${mobileFeedTab === 'foryou' ? 'text-white border-b-2 border-white pb-1' : 'text-white/60'}`}
                  >
                      For You
                  </button>
              </div>

              <button onClick={() => setIsMobileSearchOpen(true)} className="pointer-events-auto text-white/80 hover:text-white">
                  <Search size={24} />
              </button>
          </div>
      );
  };

  // Mobile Search Overlay
  const MobileSearchOverlay = () => {
      if (!isMobileSearchOpen) return null;
      
      const filteredChannels = channels.filter(c => 
          c.title.toLowerCase().includes(mobileSearchQuery.toLowerCase()) || 
          c.description.toLowerCase().includes(mobileSearchQuery.toLowerCase()) ||
          c.tags.some(t => t.toLowerCase().includes(mobileSearchQuery.toLowerCase()))
      );

      return (
          <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col animate-fade-in">
              <div className="flex items-center gap-4 p-4 border-b border-slate-800 bg-slate-900">
                  <button onClick={() => setIsMobileSearchOpen(false)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400">
                      <ArrowLeft size={24} />
                  </button>
                  <div className="flex-1 relative">
                      <input 
                          autoFocus
                          type="text" 
                          placeholder="Search podcasts..." 
                          value={mobileSearchQuery}
                          onChange={(e) => setMobileSearchQuery(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-full py-2 pl-4 pr-10 text-white focus:outline-none focus:border-indigo-500"
                      />
                      {mobileSearchQuery && (
                          <button onClick={() => setMobileSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                              <X size={16} />
                          </button>
                      )}
                  </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4">
                  {mobileSearchQuery ? (
                      <div className="space-y-4">
                          <p className="text-xs font-bold text-slate-500 uppercase">Results</p>
                          {filteredChannels.length === 0 ? (
                              <p className="text-center text-slate-500 py-8">No results found.</p>
                          ) : (
                              filteredChannels.map(channel => (
                                  <div 
                                      key={channel.id} 
                                      onClick={() => {
                                          setActiveChannelId(channel.id);
                                          setViewState('podcast_detail');
                                          setIsMobileSearchOpen(false);
                                      }}
                                      className="flex items-center gap-4 p-3 bg-slate-900 border border-slate-800 rounded-xl active:scale-95 transition-transform"
                                  >
                                      <img src={channel.imageUrl} className="w-12 h-12 rounded-lg object-cover" alt="" />
                                      <div className="flex-1 min-w-0">
                                          <h4 className="font-bold text-white truncate">{channel.title}</h4>
                                          <p className="text-xs text-slate-400 truncate">{channel.author}</p>
                                      </div>
                                      <button className="p-2 bg-indigo-600 rounded-full text-white">
                                          <Play size={12} fill="currentColor"/>
                                      </button>
                                  </div>
                              ))
                          )}
                      </div>
                  ) : (
                      <div className="text-center text-slate-500 mt-20">
                          <Search size={48} className="mx-auto mb-4 opacity-20" />
                          <p>Type to search podcasts</p>
                      </div>
                  )}
              </div>
          </div>
      );
  };

  return (
    <div className="min-h-screen supports-[min-height:100dvh]:min-h-[100dvh] bg-slate-950 text-slate-100 font-sans overflow-hidden">
      
      {/* Navbar - Desktop Only */}
      {viewState !== 'live_session' && (
      <nav className="hidden md:block sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center cursor-pointer" onClick={() => { setViewState('directory'); }}>
              <div className="bg-gradient-to-tr from-indigo-600 to-purple-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
                <Podcast className="text-white w-6 h-6" />
              </div>
              <span className="ml-3 text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                {t.appTitle}
              </span>
            </div>
            
            <div className="flex flex-1 max-w-md mx-8 relative">
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
              
              {/* Desktop Creation Buttons (Restored) */}
              <div className="hidden lg:flex items-center space-x-2 mr-2">
                  <button
                      onClick={() => setIsCreateModalOpen(true)}
                      className="flex items-center space-x-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                  >
                      <Plus size={14} />
                      <span>New Podcast</span>
                  </button>
                  <button
                      onClick={() => setIsVoiceCreateOpen(true)}
                      className="flex items-center space-x-2 px-3 py-1.5 bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                  >
                      <Sparkles size={14} />
                      <span>Magic Create</span>
                  </button>
              </div>

              {/* Desktop App Group Dropdown */}
              <div className="relative">
                  <button 
                    onClick={() => setIsDesktopAppsOpen(!isDesktopAppsOpen)}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-colors ${isDesktopAppsOpen ? 'bg-slate-800 text-white' : 'bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white'}`}
                  >
                    <LayoutGrid size={16}/><span>Apps</span>
                  </button>
                  
                  {isDesktopAppsOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsDesktopAppsOpen(false)}></div>
                        <div className="absolute top-full right-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 grid grid-cols-3 gap-3 z-50 animate-fade-in-up origin-top-right">
                            {allApps.map(app => (
                                <button
                                    key={app.label}
                                    onClick={() => { app.action(); setIsDesktopAppsOpen(false); }}
                                    className="flex flex-col items-center justify-center gap-2 p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 rounded-xl transition-all group"
                                >
                                    <div className={`p-2 bg-slate-800 rounded-lg group-hover:scale-110 transition-transform ${app.color}`}>
                                        <app.icon size={20} />
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-300 group-hover:text-white">{app.label}</span>
                                </button>
                            ))}
                        </div>
                      </>
                  )}
              </div>

              <button 
                onClick={() => setLanguage(prev => prev === 'en' ? 'zh' : 'en')}
                className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 hover:text-white hover:border-slate-500 transition-all"
                title="Switch Language"
              >
                {language === 'en' ? '中' : 'EN'}
              </button>

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
                {isUserMenuOpen && (
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
                   onNavigate={(view: any) => setViewState(view)}
                   t={t}
                />
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>
      )}

      <MobileTopNav />
      <MobileSearchOverlay />

      {/* Main Content */}
      <div className="flex-1 overflow-hidden h-[calc(100vh-64px)] md:h-[calc(100vh-64px)] pb-16 md:pb-0">
        {viewState === 'mission' && <MissionManifesto onBack={() => setViewState('directory')} />}
        {viewState === 'user_guide' && <UserManual onBack={() => setViewState('directory')} />}
        {viewState === 'notebook_viewer' && <NotebookViewer onBack={() => setViewState('directory')} currentUser={currentUser} />}
        
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
        {viewState === 'chat' && <WorkplaceChat onBack={() => setViewState('directory')} currentUser={currentUser} initialChannelId={chatTargetId} />}
        {viewState === 'careers' && <CareerCenter onBack={() => setViewState('directory')} currentUser={currentUser} />}

        {viewState === 'directory' && (
          <div className="h-full flex flex-col">
            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative">
               
               {/* 1. Main Feed (Hybrid Layout) */}
               {activeTab === 'categories' && (
                   <PodcastFeed 
                       channels={feedChannels}
                       onChannelClick={(id) => { setActiveChannelId(id); setViewState('podcast_detail'); }}
                       onStartLiveSession={(channel) => handleStartLiveSession(channel)}
                       userProfile={userProfile}
                       globalVoice={globalVoice}
                       onRefresh={handleRefreshFeed}
                       t={t}
                       currentUser={currentUser}
                       setChannelToEdit={setChannelToEdit}
                       setIsSettingsModalOpen={setIsSettingsModalOpen}
                       onCommentClick={handleCommentClick}
                       handleVote={handleVote}
                       onMessageCreator={handleMessageCreator}
                       filterMode={mobileFeedTab}
                   />
               )}

               {/* 2. Other Tabs (Standard Layout) */}
               {activeTab !== 'categories' && (
                   <div className="h-full overflow-y-auto p-4 md:p-8 animate-fade-in max-w-7xl mx-auto w-full pb-20">
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
          <div className="fixed inset-0 z-[100] bg-slate-950">
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

      {isAppsMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-950/95 backdrop-blur-md flex flex-col animate-fade-in md:hidden">
            <div className="p-4 flex justify-between items-center border-b border-slate-800 bg-slate-900/50">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <LayoutGrid size={20} className="text-indigo-400" />
                    All Apps
                </h2>
                <button onClick={() => setIsAppsMenuOpen(false)} className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white">
                    <X size={20} />
                </button>
            </div>
            <div className="p-6 grid grid-cols-3 gap-4 overflow-y-auto pb-24">
                {allApps.map((app) => (
                    <button 
                        key={app.label}
                        onClick={() => {
                            app.action();
                            setIsAppsMenuOpen(false);
                        }}
                        className="flex flex-col items-center justify-center gap-3 p-4 bg-slate-900 border border-slate-800 rounded-2xl hover:bg-slate-800 active:scale-95 transition-all aspect-square shadow-lg"
                    >
                        <div className={`p-3 bg-slate-800 rounded-xl ${app.color} shadow-inner`}>
                            <app.icon size={28} />
                        </div>
                        <span className="text-xs font-bold text-slate-300">{app.label}</span>
                    </button>
                ))}
            </div>
        </div>
      )}

      {/* Mobile-only Studio Menu Instance */}
      {isUserMenuOpen && (
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
           onNavigate={(view: any) => setViewState(view)}
           t={t}
           className="fixed bottom-24 right-4 z-50 md:hidden shadow-2xl border-slate-700"
        />
      )}

      <MobileBottomNav />

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