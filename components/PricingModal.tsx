import React, { useState } from 'react';
import { X, Check, Zap, Loader2, Sparkles } from 'lucide-react';
import { UserProfile, SubscriptionTier } from '../types';
import { upgradeUserSubscription } from '../services/firestoreService';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onSuccess: () => void;
}

export const PricingModal: React.FC<PricingModalProps> = ({ isOpen, onClose, user, onSuccess }) => {
  const [processingTier, setProcessingTier] = useState<SubscriptionTier | null>(null);

  if (!isOpen) return null;

  const handleUpgrade = async (tier: SubscriptionTier) => {
    setProcessingTier(tier);
    try {
      // Simulate API latency
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update Database
      await upgradeUserSubscription(user.uid, tier);
      
      // Refresh local state (handled by parent or re-fetch)
      onSuccess();
      onClose();
      alert(`Successfully upgraded to ${tier.toUpperCase()} plan!`);
    } catch (e) {
      alert("Payment failed. Please try again.");
    } finally {
      setProcessingTier(null);
    }
  };

  const currentTier = user.subscriptionTier || 'free';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-fade-in-up my-auto relative">
        
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/50 shrink-0">
          <div>
             <h2 className="text-2xl font-bold text-white">Upgrade Plan</h2>
             <p className="text-slate-400 text-sm">Unlock the full power of AIVoiceCast.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-8 overflow-y-auto flex-1">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* FREE TIER */}
              <div className="bg-slate-800/30 border border-slate-700 rounded-2xl p-6 flex flex-col relative">
                 <h3 className="text-lg font-bold text-white mb-2">Free Starter</h3>
                 <div className="text-3xl font-bold text-white mb-6">$0 <span className="text-sm font-normal text-slate-500">/mo</span></div>
                 
                 <ul className="space-y-3 mb-8 flex-1">
                    <li className="flex items-center gap-2 text-sm text-slate-300"><Check size={16} className="text-emerald-500"/> Unlimited Listening</li>
                    <li className="flex items-center gap-2 text-sm text-slate-300"><Check size={16} className="text-emerald-500"/> 5 AI Generation Credits</li>
                    <li className="flex items-center gap-2 text-sm text-slate-300"><Check size={16} className="text-emerald-500"/> Public Groups Only</li>
                    <li className="flex items-center gap-2 text-sm text-slate-500"><X size={16} /> No Private Channels</li>
                    <li className="flex items-center gap-2 text-sm text-slate-500"><X size={16} /> Standard Voice Quality</li>
                 </ul>

                 <button 
                    disabled={true}
                    className="w-full py-3 rounded-xl border border-slate-600 text-slate-400 font-bold text-sm cursor-default"
                 >
                    Current Plan
                 </button>
              </div>

              {/* CREATOR TIER (Best Value) */}
              <div className="bg-indigo-900/10 border border-indigo-500 rounded-2xl p-6 flex flex-col relative transform scale-105 shadow-xl shadow-indigo-500/10">
                 <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-600 text-white text-[10px] uppercase font-bold px-3 py-1 rounded-full shadow-lg">Most Popular</div>
                 <h3 className="text-lg font-bold text-indigo-300 mb-2 flex items-center gap-2"><Sparkles size={18}/> Creator</h3>
                 <div className="text-3xl font-bold text-white mb-6">$15 <span className="text-sm font-normal text-slate-500">/mo</span></div>
                 
                 <ul className="space-y-3 mb-8 flex-1">
                    <li className="flex items-center gap-2 text-sm text-white"><Check size={16} className="text-indigo-400"/> <strong>Unlimited</strong> AI Generation</li>
                    <li className="flex items-center gap-2 text-sm text-white"><Check size={16} className="text-indigo-400"/> Create Private Channels</li>
                    <li className="flex items-center gap-2 text-sm text-white"><Check size={16} className="text-indigo-400"/> Access <strong>Neural Voices</strong></li>
                    <li className="flex items-center gap-2 text-sm text-white"><Check size={16} className="text-indigo-400"/> Create 3 Private Groups</li>
                    <li className="flex items-center gap-2 text-sm text-white"><Check size={16} className="text-indigo-400"/> Priority Support</li>
                 </ul>

                 {currentTier === 'creator' ? (
                     <button disabled className="w-full py-3 bg-indigo-600/50 text-white font-bold rounded-xl text-sm border border-indigo-500">Current Plan</button>
                 ) : (
                     <button 
                        onClick={() => handleUpgrade('creator')}
                        disabled={!!processingTier}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm shadow-lg transition-all flex justify-center items-center gap-2"
                     >
                        {processingTier === 'creator' ? <Loader2 className="animate-spin" size={16}/> : 'Upgrade to Creator'}
                     </button>
                 )}
              </div>

              {/* PRO TIER */}
              <div className="bg-slate-800/30 border border-slate-700 rounded-2xl p-6 flex flex-col relative">
                 <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><Zap size={18} className="text-amber-400"/> Pro Power</h3>
                 <div className="text-3xl font-bold text-white mb-6">$30 <span className="text-sm font-normal text-slate-500">/mo</span></div>
                 
                 <ul className="space-y-3 mb-8 flex-1">
                    <li className="flex items-center gap-2 text-sm text-slate-300"><Check size={16} className="text-amber-400"/> All Creator Features</li>
                    <li className="flex items-center gap-2 text-sm text-slate-300"><Check size={16} className="text-amber-400"/> <strong>Unlimited</strong> Private Groups</li>
                    <li className="flex items-center gap-2 text-sm text-slate-300"><Check size={16} className="text-amber-400"/> Code Studio <strong>Pro</strong> (Git Sync)</li>
                    <li className="flex items-center gap-2 text-sm text-slate-300"><Check size={16} className="text-amber-400"/> Early Access to Gemini Models</li>
                    <li className="flex items-center gap-2 text-sm text-slate-300"><Check size={16} className="text-amber-400"/> 1-on-1 Mentorship Matching</li>
                 </ul>

                 {currentTier === 'pro' ? (
                     <button disabled className="w-full py-3 bg-slate-700 text-white font-bold rounded-xl text-sm">Current Plan</button>
                 ) : (
                     <button 
                        onClick={() => handleUpgrade('pro')}
                        disabled={!!processingTier}
                        className="w-full py-3 bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-300 border border-slate-600 font-bold rounded-xl text-sm transition-all flex justify-center items-center gap-2"
                     >
                        {processingTier === 'pro' ? <Loader2 className="animate-spin" size={16}/> : 'Upgrade to Pro'}
                     </button>
                 )}
              </div>

           </div>
           
           <div className="mt-8 text-center text-xs text-slate-500">
              <p>Secure payment processing via Stripe. You can cancel at any time.</p>
              <p className="mt-1">Need a Team plan? Contact sales@aivoicecast.com</p>
           </div>
        </div>
      </div>
    </div>
  );
};