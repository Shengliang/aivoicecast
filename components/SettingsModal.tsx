import React, { useState } from 'react';
import { UserProfile } from '../types';
import { X, User, Shield, CreditCard, LogOut, CheckCircle, AlertTriangle } from 'lucide-react';
import { downgradeUserSubscription } from '../services/firestoreService';

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
  const [isDowngrading, setIsDowngrading] = useState(false);

  if (!isOpen) return null;

  const currentTier = user.subscriptionTier || 'free';
  const isPaid = currentTier === 'creator' || currentTier === 'pro';

  const handleDowngrade = async () => {
    if (!confirm("Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing cycle.")) return;
    
    setIsDowngrading(true);
    try {
        await downgradeUserSubscription(user.uid);
        if (onUpdateProfile) {
            onUpdateProfile({ ...user, subscriptionTier: 'free' });
        }
        alert("Subscription canceled. You have been downgraded to the Free plan.");
    } catch (e) {
        console.error(e);
        alert("Failed to downgrade. Please try again.");
    } finally {
        setIsDowngrading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-fade-in-up">
        
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950">
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <User className="text-slate-400 w-5 h-5" />
            <span>Account Settings</span>
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-8">
            {/* Profile Section */}
            <div className="flex items-center gap-4">
                {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName} className="w-16 h-16 rounded-full border-2 border-slate-700" />
                ) : (
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
                        <User size={32} />
                    </div>
                )}
                <div>
                    <h3 className="text-lg font-bold text-white">{user.displayName}</h3>
                    <p className="text-sm text-slate-400">{user.email}</p>
                    <p className="text-xs text-slate-500 mt-1 font-mono">UID: {user.uid.substring(0, 8)}...</p>
                </div>
            </div>

            <div className="h-px bg-slate-800 w-full" />

            {/* Membership Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Shield size={16}/> Membership Status
                    </h4>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${
                        currentTier === 'pro' ? 'bg-amber-900/30 text-amber-400 border-amber-500/50' : 
                        currentTier === 'creator' ? 'bg-indigo-900/30 text-indigo-400 border-indigo-500/50' : 
                        'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                        {currentTier} Plan
                    </span>
                </div>

                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                    {isPaid ? (
                        <div className="space-y-4">
                            <div className="flex items-start gap-3">
                                <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                                <div>
                                    <p className="text-sm text-white font-medium">Active Subscription</p>
                                    <p className="text-xs text-slate-400 mt-1">Your {currentTier} benefits are currently active.</p>
                                </div>
                            </div>
                            <div className="pt-2 flex justify-end">
                                <button 
                                    onClick={handleDowngrade}
                                    disabled={isDowngrading}
                                    className="text-xs text-red-400 hover:text-red-300 underline disabled:opacity-50"
                                >
                                    {isDowngrading ? 'Processing...' : 'Cancel Subscription'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="text-slate-500 shrink-0 mt-0.5" size={18} />
                                <div>
                                    <p className="text-sm text-slate-300 font-medium">Free Plan</p>
                                    <p className="text-xs text-slate-500 mt-1">Upgrade to unlock neural voices, private groups, and unlimited generation.</p>
                                </div>
                            </div>
                            {onUpgradeClick && (
                                <button 
                                    onClick={() => { onClose(); onUpgradeClick(); }}
                                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold shadow-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <CreditCard size={16} />
                                    <span>Upgrade Plan</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};