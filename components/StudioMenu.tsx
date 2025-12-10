import React from 'react';
import { UserProfile } from '../types';
import { Sparkles, Plus, Wand2, Key, Database, Settings, HelpCircle, LogOut, User } from 'lucide-react';
import { signOut } from '../services/authService';

interface StudioMenuProps {
  isUserMenuOpen: boolean;
  setIsUserMenuOpen: (isOpen: boolean) => void;
  userProfile: UserProfile | null;
  setUserProfile: (profile: UserProfile | null) => void;
  currentUser: any;
  globalVoice: string;
  setGlobalVoice: (voice: string) => void;
  hasApiKey: boolean;
  setIsCreateModalOpen: (isOpen: boolean) => void;
  setIsVoiceCreateOpen: (isOpen: boolean) => void;
  setIsApiKeyModalOpen: (isOpen: boolean) => void;
  setIsSyncModalOpen: (isOpen: boolean) => void;
  setIsSettingsModalOpen: (isOpen: boolean) => void;
  onOpenHelp: () => void;
  t: any;
}

export const StudioMenu: React.FC<StudioMenuProps> = ({
  isUserMenuOpen, setIsUserMenuOpen, userProfile, setUserProfile, currentUser,
  globalVoice, setGlobalVoice, hasApiKey, 
  setIsCreateModalOpen, setIsVoiceCreateOpen, setIsApiKeyModalOpen, setIsSyncModalOpen, setIsSettingsModalOpen, onOpenHelp, t
}) => {
  
  if (!isUserMenuOpen) return null;

  const handleLogout = async () => {
      await signOut();
      setIsUserMenuOpen(false);
      setUserProfile(null);
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)}></div>
      <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in-up">
         
         {currentUser ? (
             <div className="p-4 border-b border-slate-800 bg-slate-950/50">
                 <div className="flex items-center space-x-3">
                     {currentUser.photoURL ? (
                         <img src={currentUser.photoURL} alt="Profile" className="w-10 h-10 rounded-full border border-slate-700" />
                     ) : (
                         <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                             <User size={20} />
                         </div>
                     )}
                     <div className="flex-1 min-w-0">
                         <p className="text-sm font-bold text-white truncate">{currentUser.displayName || 'User'}</p>
                         <p className="text-xs text-slate-500 truncate">{currentUser.email}</p>
                         {userProfile?.subscriptionTier === 'pro' && (
                             <span className="inline-block mt-1 text-[10px] bg-gradient-to-r from-amber-500 to-orange-600 text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                 Pro Member
                             </span>
                         )}
                     </div>
                 </div>
             </div>
         ) : (
             <div className="p-4 border-b border-slate-800 bg-slate-950/50 text-center">
                 <p className="text-sm text-slate-400">Guest Mode</p>
             </div>
         )}

         <div className="p-2 space-y-1">
            <button 
               onClick={() => { setIsCreateModalOpen(true); setIsUserMenuOpen(false); }}
               className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
               <Plus size={16} className="text-emerald-400" />
               <span>New Podcast</span>
            </button>
            <button 
               onClick={() => { setIsVoiceCreateOpen(true); setIsUserMenuOpen(false); }}
               className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
               <Wand2 size={16} className="text-pink-400" />
               <span>Magic Creator</span>
            </button>

            <div className="h-px bg-slate-800 my-2 mx-2" />

            <button 
               onClick={() => { setIsApiKeyModalOpen(true); setIsUserMenuOpen(false); }}
               className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
               <Key size={16} className={hasApiKey ? "text-emerald-400" : "text-slate-500"} />
               <span>API Key {hasApiKey && "Set"}</span>
            </button>
            
            <button 
               onClick={() => { setIsSyncModalOpen(true); setIsUserMenuOpen(false); }}
               className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
               <Database size={16} />
               <span>Backup & Sync</span>
            </button>

            <div className="h-px bg-slate-800 my-2 mx-2" />
            
            <button 
               onClick={() => { setIsSettingsModalOpen(true); setIsUserMenuOpen(false); }}
               className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
               <Settings size={16} />
               <span>Account Settings</span>
            </button>

            <button 
               onClick={() => { onOpenHelp(); setIsUserMenuOpen(false); }}
               className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
               <HelpCircle size={16} />
               <span>Help & FAQ</span>
            </button>

            {currentUser && (
                <>
                    <div className="h-px bg-slate-800 my-2 mx-2" />
                    <button 
                       onClick={handleLogout}
                       className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                       <LogOut size={16} />
                       <span>Sign Out</span>
                    </button>
                </>
            )}
         </div>
      </div>
    </>
  );
};