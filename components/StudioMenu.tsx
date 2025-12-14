
import React, { useState, useEffect } from 'react';
import { UserProfile, SubscriptionTier, GlobalStats } from '../types';
import { getUserProfile, getGlobalStats } from '../services/firestoreService';
import { Sparkles, BarChart2, Plus, Wand2, Key, Database, Crown, Settings, Book, Users, LogIn, Terminal, Cloud, Globe } from 'lucide-react';
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
  hasApiKey: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
  setIsVoiceCreateOpen: (open: boolean) => void;
  setIsApiKeyModalOpen: (open: boolean) => void;
  setIsSyncModalOpen: (open: boolean) => void;
  setIsSettingsModalOpen: (open: boolean) => void;
  onOpenUserGuide: () => void;
  onNavigate: (view: string) => void;
  t: any;
}

export const StudioMenu: React.FC<StudioMenuProps> = ({
  isUserMenuOpen, setIsUserMenuOpen, userProfile, setUserProfile, currentUser,
  globalVoice, setGlobalVoice, hasApiKey, 
  setIsCreateModalOpen, setIsVoiceCreateOpen, setIsApiKeyModalOpen, setIsSyncModalOpen, setIsSettingsModalOpen, onOpenUserGuide, onNavigate, t
}) => {
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [globalStats, setGlobalStats] = useState<GlobalStats>({ totalLogins: 0, uniqueUsers: 0 });
  
  useEffect(() => {
      if (isUserMenuOpen) {
          getGlobalStats().then(setGlobalStats).catch(console.error);
      }
  }, [isUserMenuOpen]);

  if (!isUserMenuOpen || !currentUser) return null;

  const handleUpgradeSuccess = async (newTier: SubscriptionTier) => {
      // 1. Optimistic Update locally so UI reflects change instantly
      if (userProfile) {
          setUserProfile({ ...userProfile, subscriptionTier: newTier });
      }
      
      // 2. Fetch fresh from DB (in case of real latency)
      try {
          const fresh = await getUserProfile(currentUser.uid);
          if (fresh) setUserProfile(fresh);
      } catch(e) {
          // Ignore fetch error, rely on optimistic update
      }
  };

  const getTierLabel = () => {
      const tier = userProfile?.subscriptionTier || 'free';
      if (tier === 'pro') return { label: 'PRO MEMBER', color: 'text-amber-400 bg-amber-900/50 border border-amber-500/20' };
      return { label: 'FREE TIER', color: 'text-slate-400 bg-slate-800' };
  };

  const tierInfo = getTierLabel();

  // Helper for stat boxes
  const StatBox = ({ icon: Icon, label, value }: { icon: any, label: string, value: number | string }) => (
      <div className="flex flex-col items-center bg-slate-800/50 p-2 rounded-lg border border-slate-800">
          <Icon size={14} className="text-indigo-400 mb-1" />
          <span className="text-[10px] text-slate-500 uppercase font-bold">{label}</span>
          <span className="text-sm font-bold text-white">{value}</span>
      </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)}></div>
      <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in-up">
         <div className="p-3 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-2">
               <Sparkles size={12} className="text-indigo-400" />
               <span>Creator Studio</span>
            </h3>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${tierInfo.color}`}>
                {tierInfo.label}
            </span>
         </div>
         
         {/* Stats Grid */}
         <div className="grid grid-cols-3 gap-2 p-2 border-b border-slate-800 bg-slate-900/30">
            <StatBox icon={BarChart2} label="API Usage" value={userProfile?.apiUsageCount || 0} />
            <StatBox icon={Users} label="Members" value={globalStats.uniqueUsers} />
            <StatBox icon={LogIn} label="Logins" value={globalStats.totalLogins} />
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
            
            <div className="px-3 py-2">
               <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Live Host Voice</label>
                  <span className="text-xs text-indigo-400">{globalVoice}</span>
                </div>
               <div className="grid grid-cols-3 gap-1">
                  {['Auto', ...VOICES].map(v => (
                     <button 
                        key={v}
                        onClick={() => setGlobalVoice(v)}
                        className={`text-[10px] py-1 rounded border ${globalVoice === v ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                     >
                        {v}
                     </button>
                  ))}
                </div>
            </div>

            <div className="h-px bg-slate-800 my-2 mx-2" />

            <button 
               onClick={() => { setIsApiKeyModalOpen(true); setIsUserMenuOpen(false); }}
               className={`w-full flex items-center space-x-3 px-3 py-2 text-sm rounded-lg transition-colors ${!hasApiKey ? 'text-red-400 hover:bg-red-900/20' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}
            >
               <Key size={16} />
               <span>{hasApiKey ? "Change API Key" : "Set API Key (Required)"}</span>
            </button>
            <button 
               onClick={() => { setIsSyncModalOpen(true); setIsUserMenuOpen(false); }}
               className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
               <Database size={16} />
               <span>Data Sync & Backup</span>
            </button>
            
            {/* User Guide Button */}
            <button 
               onClick={() => { onOpenUserGuide(); setIsUserMenuOpen(false); }}
               className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
               <Book size={16} />
               <span>User Guide / Manual</span>
            </button>
            
            {/* Settings Button */}
            <button 
               onClick={() => { setIsSettingsModalOpen(true); setIsUserMenuOpen(false); }}
               className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
               <Settings size={16} />
               <span>Account Settings</span>
            </button>

            <div className="h-px bg-slate-800 my-2 mx-2" />
            
            {/* Developer Tools Footer */}
            <div className="px-2 pb-2">
                <p className="px-2 text-[10px] font-bold text-slate-500 uppercase mb-1">Developer Tools</p>
                <div className="grid grid-cols-2 gap-1">
                    <button onClick={() => { onNavigate('debug'); setIsUserMenuOpen(false); }} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-400 hover:text-white flex flex-col items-center justify-center gap-1">
                        <Database size={12}/> <span>Local DB</span>
                    </button>
                    <button onClick={() => { onNavigate('firestore_debug'); setIsUserMenuOpen(false); }} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-400 hover:text-white flex flex-col items-center justify-center gap-1">
                        <Terminal size={12}/> <span>Firestore</span>
                    </button>
                    <button onClick={() => { onNavigate('cloud_debug'); setIsUserMenuOpen(false); }} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-400 hover:text-white flex flex-col items-center justify-center gap-1">
                        <Cloud size={12}/> <span>Storage</span>
                    </button>
                    <button onClick={() => { onNavigate('public_debug'); setIsUserMenuOpen(false); }} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-400 hover:text-white flex flex-col items-center justify-center gap-1">
                        <Globe size={12}/> <span>Registry</span>
                    </button>
                </div>
            </div>
         </div>
      </div>

      {isPricingOpen && userProfile && (
          <PricingModal 
             isOpen={true} 
             onClose={() => setIsPricingOpen(false)} 
             user={userProfile} 
             onSuccess={handleUpgradeSuccess}
          />
      )}
    </>
  );
};
