
import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { X, User, Shield, CreditCard, LogOut, CheckCircle, AlertTriangle, Bell, Lock, Database, Trash2, Edit2, Save, FileText, ExternalLink, Loader2 } from 'lucide-react';
import { logUserActivity, getBillingHistory, createStripePortalSession } from '../services/firestoreService';
import { clearAudioCache } from '../services/tts';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onUpdateProfile?: (updated: UserProfile) => void;
  onUpgradeClick?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, onClose, user, onUpdateProfile, onUpgradeClick 
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'preferences' | 'billing'>('general');
  const [isProcessingPortal, setIsProcessingPortal] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [isEditingName, setIsEditingName] = useState(false);
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [publicProfile, setPublicProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Billing State
  const [billingHistory, setBillingHistory] = useState<any[]>([]);

  useEffect(() => {
      if (activeTab === 'billing' && user.subscriptionTier === 'pro') {
          // Simulate fetch
          getBillingHistory(user.uid).then(setBillingHistory);
      }
  }, [activeTab, user]);

  if (!isOpen) return null;

  const currentTier = user.subscriptionTier || 'free';
  const isPaid = currentTier === 'pro';

  const handleManageSubscription = async () => {
    setIsProcessingPortal(true);
    setError(null);
    try {
        const url = await createStripePortalSession(user.uid);
        window.location.assign(url);
    } catch (e: any) {
        console.error(e);
        setError("Failed to open billing portal: " + e.message);
        setIsProcessingPortal(false);
    }
  };

  const handleSaveProfile = () => {
      if (onUpdateProfile) {
          onUpdateProfile({ ...user, displayName });
      }
      setIsEditingName(false);
      logUserActivity('update_profile', { displayName });
  };

  const handleClearCache = () => {
      if(confirm("Clear all downloaded audio and local settings? This will free up space but require re-downloading content.")) {
          clearAudioCache();
          alert("Local cache cleared.");
      }
  };

  const handleDeleteAccount = () => {
      const confirmText = prompt("Type 'DELETE' to confirm account deletion. This action is irreversible.");
      if (confirmText === 'DELETE') {
          alert("Account deletion request submitted. (Mock action)");
      }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fade-in-up flex flex-col max-h-[90vh]">
        
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950 shrink-0">
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <User className="text-indigo-400 w-5 h-5" />
            <span>Settings</span>
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex border-b border-slate-800 bg-slate-900/50 shrink-0">
            <button onClick={() => setActiveTab('general')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'general' ? 'border-indigo-500 text-white bg-slate-800' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                General
            </button>
            <button onClick={() => setActiveTab('preferences')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'preferences' ? 'border-indigo-500 text-white bg-slate-800' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                Preferences
            </button>
            <button onClick={() => setActiveTab('billing')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'billing' ? 'border-indigo-500 text-white bg-slate-800' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                Billing
            </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-slate-900">
            
            {activeTab === 'general' && (
                <div className="space-y-8">
                    {/* ... (Keep General settings same) ... */}
                    <div className="flex items-start gap-6">
                        <div className="relative group">
                            {user.photoURL ? (
                                <img src={user.photoURL} alt={user.displayName} className="w-20 h-20 rounded-full border-2 border-slate-700 object-cover" />
                            ) : (
                                <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center text-slate-500"><User size={32} /></div>
                            )}
                            <div className="absolute bottom-0 right-0 bg-slate-800 p-1 rounded-full border border-slate-600 text-slate-400 cursor-pointer hover:text-white"><Edit2 size={12} /></div>
                        </div>
                        <div className="flex-1 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Display Name</label>
                                <div className="flex gap-2">
                                    <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={!isEditingName} className={`flex-1 bg-slate-950 border ${isEditingName ? 'border-indigo-500' : 'border-slate-800'} rounded-lg px-3 py-2 text-white text-sm focus:outline-none`} />
                                    {isEditingName ? <button onClick={handleSaveProfile} className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"><Save size={16} /></button> : <button onClick={() => setIsEditingName(true)} className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white"><Edit2 size={16} /></button>}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email Address</label>
                                <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-400 text-sm flex justify-between items-center"><span>{user.email}</span><span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-500">Google Linked</span></div>
                            </div>
                        </div>
                    </div>
                    <div className="h-px bg-slate-800 w-full" />
                    <div className="space-y-4">
                        <h4 className="text-sm font-bold text-red-500 uppercase tracking-wider flex items-center gap-2"><AlertTriangle size={16}/> Danger Zone</h4>
                        <div className="bg-red-900/10 border border-red-900/30 rounded-xl p-4 flex items-center justify-between">
                            <div className="text-sm text-red-200"><p className="font-bold">Delete Account</p><p className="text-xs opacity-70">Permanently remove your profile and all data.</p></div>
                            <button onClick={handleDeleteAccount} className="px-4 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-900/50 rounded-lg text-xs font-bold transition-colors">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'preferences' && (
                <div className="space-y-6">
                    {/* ... (Keep Preferences same) ... */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><Bell size={16}/> Notifications</h4>
                        <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <div><p className="text-sm font-bold text-white">Email Notifications</p><p className="text-xs text-slate-400">Receive updates about your account and new features.</p></div>
                                <button onClick={() => setEmailNotifs(!emailNotifs)} className={`w-10 h-5 rounded-full relative transition-colors ${emailNotifs ? 'bg-indigo-600' : 'bg-slate-600'}`}><div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${emailNotifs ? 'left-6' : 'left-1'}`}></div></button>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><Lock size={16}/> Privacy</h4>
                        <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <div><p className="text-sm font-bold text-white">Public Profile</p><p className="text-xs text-slate-400">Allow other members to find you in the directory.</p></div>
                                <button onClick={() => setPublicProfile(!publicProfile)} className={`w-10 h-5 rounded-full relative transition-colors ${publicProfile ? 'bg-emerald-600' : 'bg-slate-600'}`}><div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${publicProfile ? 'left-6' : 'left-1'}`}></div></button>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><Database size={16}/> Data & Storage</h4>
                        <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-4 flex items-center justify-between">
                            <div><p className="text-sm font-bold text-white">Clear Local Cache</p><p className="text-xs text-slate-400">Remove downloaded audio and temporary files.</p></div>
                            <button onClick={handleClearCache} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold border border-slate-600">Clear Data</button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'billing' && (
                <div className="space-y-6">
                    {error && (
                        <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-3 text-red-300 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="flex items-center justify-between bg-slate-800/50 p-6 rounded-xl border border-slate-700">
                        <div>
                            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-2">
                                <Shield size={16}/> Current Plan
                            </h4>
                            <div className="flex items-center gap-3">
                                <span className={`text-2xl font-bold ${isPaid ? 'text-amber-400' : 'text-white'}`}>
                                    {currentTier === 'pro' ? 'Pro Membership' : 'Free Starter'}
                                </span>
                                {isPaid && <span className="bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded text-xs font-bold border border-emerald-500/30">Active</span>}
                            </div>
                            <p className="text-xs text-slate-400 mt-2 max-w-sm">
                                {isPaid ? "You have access to all premium features including Neural Voices and Private Groups." : "Upgrade to Pro to unlock Neural Voices, Private Channels, and Unlimited Generation."}
                            </p>
                        </div>
                        
                        {!isPaid && onUpgradeClick && (
                            <button 
                                onClick={() => { onClose(); onUpgradeClick(); }}
                                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg transition-colors flex items-center gap-2"
                            >
                                <CreditCard size={16} />
                                <span>Upgrade Now</span>
                            </button>
                        )}
                    </div>

                    {isPaid && (
                        <div className="space-y-6">
                            {/* Manage Subscription Button (Portal) */}
                            <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-3">
                                <p className="text-sm text-slate-400">Need to update your card, download invoices, or cancel your plan?</p>
                                <button 
                                    onClick={handleManageSubscription}
                                    disabled={isProcessingPortal}
                                    className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 rounded-xl font-bold text-sm flex items-center gap-2 transition-all hover:border-slate-500"
                                >
                                    {isProcessingPortal ? <Loader2 size={16} className="animate-spin"/> : <CreditCard size={16} />}
                                    <span>Manage Billing on Stripe</span>
                                    <ExternalLink size={14} className="text-slate-500" />
                                </button>
                            </div>

                            {/* Billing History */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Recent Payments</h4>
                                {billingHistory.length > 0 ? (
                                    <div className="border border-slate-800 rounded-xl overflow-hidden">
                                        {billingHistory.map((bill, i) => (
                                            <div key={i} className="flex justify-between items-center p-3 bg-slate-800/30 border-b border-slate-800 last:border-0 hover:bg-slate-800/50">
                                                <div>
                                                    <p className="text-sm font-bold text-white">${bill.amount}</p>
                                                    <p className="text-[10px] text-slate-500">{bill.date}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded uppercase font-bold">Paid</span>
                                                    <button className="p-1.5 text-slate-400 hover:text-white"><FileText size={14}/></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-500 italic">No invoices found.</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};