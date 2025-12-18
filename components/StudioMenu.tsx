import React, { useState, useEffect } from 'react';
import { UserProfile, SubscriptionTier, GlobalStats, Channel } from '../types';
import { getUserProfile, getGlobalStats } from '../services/firestoreService';
import { Sparkles, BarChart2, Plus, Wand2, Database, Crown, Settings, Book, Users, LogIn, Terminal, Cloud, Globe, Mic, LayoutGrid, HardDrive, AlertCircle, Loader2, Gift, CreditCard, ExternalLink } from 'lucide-react';
import { VOICES } from '../utils/initialData';

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
  className?: string;
  channels: Channel[];
}

export const StudioMenu: React.FC<StudioMenuProps> = ({
  isUserMenuOpen, setIsUserMenuOpen, userProfile, setUserProfile, currentUser,
  globalVoice, setGlobalVoice, hasApiKey, 
  setIsCreateModalOpen, setIsVoiceCreateOpen, setIsApiKeyModalOpen, setIsSyncModalOpen, setIsSettingsModalOpen, onOpenUserGuide, onNavigate, t,
  className, channels = []
}) => {
  const [globalStats, setGlobalStats] = useState<GlobalStats>({ totalLogins: 0, uniqueUsers: 0 });
  const isSuperAdmin = currentUser?.email === 'shengliang.song@gmail.com';
  
  useEffect(() => {
      if (isUserMenuOpen) { getGlobalStats().then(setGlobalStats).catch(console.error); }
  }, [isUserMenuOpen]);

  if (!isUserMenuOpen || !currentUser) return null;

  return (
    <>
      <div className="fixed inset-0 z-[90]" onClick={() => setIsUserMenuOpen(false)}></div>
      <div className={`${className} w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl animate-fade-in-up z-[100] p-4`} onClick={(e) => e.stopPropagation()}>
         <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
               <Sparkles size={12} className="text-indigo-400" />
               <span>Studio</span>
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                {userProfile?.subscriptionTier === 'pro' ? 'PRO' : 'FREE'}
            </span>
         </div>
         
         <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-slate-800 p-2 rounded-lg text-center">
                <p className="text-[10px] text-slate-500 uppercase">Usage</p>
                <p className="font-bold text-white">{userProfile?.apiUsageCount || 0}</p>
            </div>
            <div className="bg-slate-800 p-2 rounded-lg text-center">
                <p className="text-[10px] text-slate-500 uppercase">Members</p>
                <p className="font-bold text-white">{globalStats.uniqueUsers}</p>
            </div>
         </div>

         <div className="space-y-1">
            <button onClick={() => { setIsCreateModalOpen(true); setIsUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white hover:bg-slate-800 rounded-lg">
               <Plus size={16} className="text-indigo-400" /> <span>Create Podcast</span>
            </button>
            <button onClick={() => { setIsVoiceCreateOpen(true); setIsUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white hover:bg-slate-800 rounded-lg">
               <Wand2 size={16} className="text-pink-400" /> <span>Magic Create</span>
            </button>
            
            <div className="h-px bg-slate-800 my-2" />

            <button onClick={() => { setIsSyncModalOpen(true); setIsUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:text-white rounded-lg transition-colors">
               <Database size={16} /> <span>Sync Data</span>
            </button>
            <button onClick={() => { setIsSettingsModalOpen(true); setIsUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:text-white rounded-lg transition-colors">
               <Settings size={16} /> <span>Settings</span>
            </button>

            {isSuperAdmin && (
                <button onClick={() => { onNavigate('firestore_debug'); setIsUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-amber-400 hover:bg-slate-800 rounded-lg">
                    <Terminal size={16}/> <span>Inspector</span>
                </button>
            )}
         </div>
      </div>
    </>
  );
};