import React, { useState, useEffect } from 'react';
import { UserProfile, SubscriptionTier, GlobalStats, Channel } from '../types';
import { getUserProfile, getGlobalStats, updateUserProfile } from '../services/firestoreService';
import { Sparkles, BarChart2, Plus, Wand2, Key, Database, Crown, Settings, Book, Users, LogIn, Terminal, Cloud, Globe, Mic, LayoutGrid, HardDrive, AlertCircle, Loader2, Gift, CreditCard, ExternalLink, Languages, MousePointer2, Rocket, Shield, X } from 'lucide-react';
import { VOICES } from '../utils/initialData';
import { PricingModal } from './PricingModal';

interface StudioMenuProps {
  isUserMenuOpen: boolean;
  setIsUserMenuOpen: (open: boolean) => void;
  userProfile: UserProfile | null;
  setUserProfile: (p: UserProfile | null) => void;
  currentUser: any;
  globalVoice: string;
  setGlobalVoice: (v: string) => void;
  setIsCreateModalOpen: (open: boolean) => void;
  setIsVoiceCreateOpen: (open: boolean) => void;
  setIsSyncModalOpen: (open: boolean) => void;
  setIsSettingsModalOpen: (open: boolean) => void;
  onOpenUserGuide: () => void;
  onNavigate: (view: string) => void;
  onOpenPrivacy: () => void;
  t: any;
  className?: string;
  channels: Channel[];
  language: 'en' | 'zh';
  setLanguage: (lang: 'en' | 'zh') => void;
  allApps?: any[];
}

export const StudioMenu: React.FC<StudioMenuProps> = ({
  isUserMenuOpen, setIsUserMenuOpen, userProfile, setUserProfile, currentUser,
  globalVoice, setGlobalVoice, 
  setIsCreateModalOpen, setIsVoiceCreateOpen, setIsSyncModalOpen, setIsSettingsModalOpen, onOpenUserGuide, onNavigate, onOpenPrivacy, t,
  className, channels = [],
  language, setLanguage,
  allApps = []
}) => {
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [globalStats, setGlobalStats] = useState<GlobalStats>({ totalLogins: 0, uniqueUsers: 0 });
  
  // Super Admin Check
  const isSuperAdmin = currentUser?.email === 'shengliang.song@gmail.com';
  
  useEffect(() => {
      if (isUserMenuOpen) {
          getGlobalStats().then(setGlobalStats).catch(console.error);
      }
  }, [isUserMenuOpen]);

  if (!isUserMenuOpen) return null;

  // Handle Unauthenticated State gracefully
  if (!currentUser) {
      return (
        <>
            <div className="fixed inset-0 z-[90]" onClick={() => setIsUserMenuOpen(false)}></div>
            <div 
                className={`${className ? className : 'absolute right-0 top-full mt-2'} w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-[100] p-4 animate-fade-in-up`}
                onClick={(e) => e.stopPropagation()} 
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-slate-300 font-bold">
                        <AlertCircle size={16} className="text-amber-400" />
                        <span>Creator Studio</span>
                    </div>
                    <button onClick={() => setIsUserMenuOpen(false)} className="p-1 hover:bg-slate-800 rounded text-slate-500">
                        <X size={16} />
                    </button>
                </div>
                <p className="text-slate-400 text-sm mb-3">Please sign in to access creator tools, cloud sync, and settings.</p>
                <div className="text-xs text-slate-500 bg-slate-800 p-2 rounded">
                    Tip: Use the "Sign In" button in the navbar.
                </div>
            </div>
        </>
      );
  }

  const handleUpgradeSuccess = async (newTier: SubscriptionTier) => {
      if (userProfile) {
          setUserProfile({ ...userProfile, subscriptionTier: newTier });
      }
      try {
          const fresh = await getUserProfile(currentUser.uid);
          if (fresh) setUserProfile(fresh);
      } catch(e) {}
  };

  const handleSetQuickApp = async (appId: string) => {
      if (!userProfile) return;
      const updated = { ...userProfile, preferredMobileQuickApp: appId };
      setUserProfile(updated);
      try {
          await updateUserProfile(currentUser.uid, { preferredMobileQuickApp: appId });
      } catch(e) {
          console.error("Failed to save quick app preference", e);
      }
  };

  const getTierLabel = () => {
      const tier = userProfile?.subscriptionTier || 'free';
      if (tier === 'pro') return { label: 'PRO MEMBER', color: 'text-amber-400 bg-amber-900/50 border border-amber-500/20' };
      return { label: 'FREE TIER', color: 'text-slate-400 bg-slate-800' };
  };

  const tierInfo = getTierLabel();
  
  const safeChannels = Array.isArray(channels) ? channels : [];
  const totalPodcasts = safeChannels.length;
  let totalLectures = 0;
  try {
      totalLectures = safeChannels.reduce((acc, ch) => {
          if (!ch || !ch.chapters || !Array.isArray(ch.chapters)) return acc;
          return acc + ch.chapters.reduce((cAcc, chap) => cAcc + (chap.subTopics?.length || 0), 0);
      }, 0);
  } catch(e) {}

  const StatBox = ({ icon: Icon, label, value }: { icon: any, label: string, value: number | string }) => (
      <div className="flex flex-col items-center bg-slate-800/50 p-2 rounded-lg border border-slate-800 hover:bg-slate-800 transition-colors">
          <Icon size={14} className="text-indigo-400 mb-1" />
          <span className="text-[10px] text-slate-500 uppercase font-bold">{label}</span>
          <span className="text-sm font-bold text-white">{value}</span>
      </div>
  );

  const quickNavApps = allApps.filter(a => a.id !== 'podcasts');

  return (
    <>
      <div className="fixed inset-0 z-[90]" onClick={() => setIsUserMenuOpen(false)}></div>
      <div 
          className={`${className ? className : 'absolute right-0 top-full mt-2 w-72'} bg-slate-900 border border-slate-700 rounded-xl shadow-2xl animate-fade-in-up max-h-[calc(100vh-6rem)] overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-800 z-[100]`}
          onClick={(e) => e.stopPropagation()}
      >
         <div className="p-3 border-b border-slate-800 bg-slate-950/90 flex justify-between items-center sticky top-0 z-10 backdrop-blur-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-2">
               <Sparkles size={12} className="text-indigo-400" />
               <span>Creator Studio</span>
            </h3>
            <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${tierInfo.color}`}>
                    {tierInfo.label}
                </span>
                <button onClick={() => setIsUserMenuOpen(false)} className="p-1 hover:bg-slate-800 rounded text-slate-500">
                    <X size={14} />
                </button>
            </div>
         </div>
         
         <div className="p-2 border-b border-slate-800 bg-slate-900/30">
            <div className="grid grid-cols-2 gap-2 mb-2">
                <StatBox icon={Mic} label="Podcasts" value={totalPodcasts} />
                <StatBox icon={Book} label="Lectures" value={totalLectures} />
            </div>
            <div className="grid grid-cols-3 gap-2">
                <StatBox icon={BarChart2} label="Usage" value={userProfile?.apiUsageCount || 0} />
                <StatBox icon={Users} label="Members" value={globalStats.uniqueUsers} />
                <StatBox icon={LogIn} label="Logins" value={globalStats.totalLogins} />
            </div>
         </div>

         <div className="p-2 space-y-1">
            <button 
               onClick={() => { setIsPricingOpen(true); }}
               className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-white hover:bg-slate-800 rounded-lg transition-colors bg-gradient-to-r from-indigo-900/20 to-purple-900/20 border border-indigo-500/30 mb-2"
            >
               <div className="p-1.5 bg-amber-500 text-white rounded-md shadow-lg"><Crown size={14} fill="currentColor"/></div>
               <span className="font-bold text-amber-200">Upgrade Membership</span>
            </button>

            <button 
               onClick={() => { setIsCreateModalOpen(true); setIsUserMenuOpen(false); }}
               className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
               <div className="p-1.5 bg-indigo-900/50 text-indigo-400 rounded-md"><Plus size={16}/></div>
               <span className="font-medium">Create Podcast</span>
            </button>
            <button 
               onClick={() => { setIsVoiceCreateOpen(true); setIsUserMenuOpen(false); }}
               className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
               <div className="p-1.5 bg-pink-900/50 text-pink-400 rounded-md"><Wand2 size={16}/></div>
               <span className="font-medium">Magic Voice Create</span>
            </button>
            
            <div className="h-px bg-slate-800 my-2 mx-2" />
            
            <button 
               onClick={() => { onNavigate('mission'); setIsUserMenuOpen(false); }}
               className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
               <div className="p-1.5 bg-orange-900/50 text-orange-400 rounded-md"><Rocket size={16}/></div>
               <span className="font-medium">Mission & Manifesto</span>
            </button>

            <button 
               onClick={() => { onNavigate('card_workshop'); setIsUserMenuOpen(false); }}
               className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
               <div className="p-1.5 bg-red-900/50 text-red-400 rounded-md"><Gift size={16}/></div>
               <span className="font-medium">Create Holiday Card</span>
            </button>
            
            <div className="h-px bg-slate-800 my-2 mx-2" />

            <div className="px-3 py-2">
               <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                      <Languages size={12}/> App Language
                  </label>
                  <span className="text-xs text-indigo-400 font-bold">{language === 'en' ? 'English' : '中文'}</span>
                </div>
               <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-700">
                  <button 
                      onClick={() => setLanguage('en')}
                      className={`flex-1 text-[10px] py-1.5 rounded transition-all font-bold ${language === 'en' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                      ENGLISH
                  </button>
                  <button 
                      onClick={() => setLanguage('zh')}
                      className={`flex-1 text-[10px] py-1.5 rounded transition-all font-bold ${language === 'zh' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                      中文 (ZH)
                  </button>
                </div>
            </div>

            <div className="px-3 py-2">
               <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                      <MousePointer2 size={12}/> Quick Nav Link
                  </label>
                  <span className="text-xs text-indigo-400 font-bold">
                    {quickNavApps.find(a => a.id === (userProfile?.preferredMobileQuickApp || 'code_studio'))?.label}
                  </span>
                </div>
               <div className="grid grid-cols-3 gap-1">
                  {quickNavApps.slice(0,6).map(app => (
                     <button 
                        key={app.id}
                        onClick={() => handleSetQuickApp(app.id)}
                        className={`text-[10px] py-1 px-1 rounded border transition-all truncate ${userProfile?.preferredMobileQuickApp === app.id || (!userProfile?.preferredMobileQuickApp && app.id === 'code_studio') ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                        title={app.label}
                     >
                        {app.label}
                     </button>
                  ))}
                </div>
            </div>
            
            <div className="h-px bg-slate-800 my-2 mx-2" />

            <button 
               onClick={() => { setIsSyncModalOpen(true); setIsUserMenuOpen(false); }}
               className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
               <Database size={16}/>
               <span>Cloud Sync & Backup</span>
            </button>

            <button 
               onClick={() => { setIsSettingsModalOpen(true); setIsUserMenuOpen(false); }}
               className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
               <Settings size={16}/>
               <span>Account Settings</span>
            </button>

            {isSuperAdmin && (
                <div className="pt-2">
                    <div className="px-3 py-1 text-[10px] font-bold text-slate-500 uppercase">System Admin</div>
                    <button onClick={() => onNavigate('public_debug')} className="w-full flex items-center space-x-3 px-3 py-2 text-xs text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors">
                        <Globe size={14}/>
                        <span>Public Registry</span>
                    </button>
                    <button onClick={() => onNavigate('firestore_debug')} className="w-full flex items-center space-x-3 px-3 py-2 text-xs text-amber-400 hover:bg-slate-800 rounded-lg transition-colors">
                        <Database size={14}/>
                        <span>Firestore Inspector</span>
                    </button>
                </div>
            )}
         </div>

         {isPricingOpen && userProfile && (
            <PricingModal 
                isOpen={true} 
                onClose={() => setIsPricingOpen(false)} 
                user={userProfile} 
                onSuccess={handleUpgradeSuccess}
            />
         )}
      </div>
    </>
  );
};