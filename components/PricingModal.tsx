
import React, { useState } from 'react';
import { X, Check, Zap, Loader2, Sparkles, Crown, CreditCard } from 'lucide-react';
import { UserProfile, SubscriptionTier } from '../types';
import { createStripeCheckoutSession } from '../services/firestoreService';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onSuccess: (tier: SubscriptionTier) => void;
}

export const PricingModal: React.FC<PricingModalProps> = ({ isOpen, onClose, user, onSuccess }) => {
  const [processing, setProcessing] = useState(false);

  if (!isOpen) return null;

  const handleCheckout = async () => {
    // Guard against missing user info (rare edge case on stale profiles)
    if (!user || !user.uid) {
        alert("Error: User profile is incomplete. Please sign out and sign in again.");
        return;
    }

    setProcessing(true);
    try {
      // Create session via Stripe Extension
      const url = await createStripeCheckoutSession(user.uid);
      
      // Redirect to Stripe
      window.location.assign(url);
      
    } catch (e: any) {
      console.error("Checkout Creation Failed:", e);
      alert(`Checkout failed: ${e.message || "Unknown error."}`);
      setProcessing(false);
    }
  };

  const currentTier = user.subscriptionTier || 'free';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-fade-in-up my-auto relative">
        
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/50 shrink-0">
          <div>
             <h2 className="text-2xl font-bold text-white">Upgrade Plan</h2>
             <p className="text-slate-400 text-sm">Unlock the full power of AIVoiceCast.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-8 overflow-y-auto flex-1 flex flex-col items-center justify-center">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-3xl">
              
              {/* FREE TIER */}
              <div className="bg-slate-800/30 border border-slate-700 rounded-2xl p-8 flex flex-col relative h-full">
                 <h3 className="text-xl font-bold text-white mb-2">Free Starter</h3>
                 <div className="text-4xl font-bold text-white mb-6">$0 <span className="text-sm font-normal text-slate-500">/mo</span></div>
                 
                 <ul className="space-y-4 mb-8 flex-1">
                    <li className="flex items-center gap-3 text-sm text-slate-300"><Check size={18} className="text-emerald-500"/> Unlimited Listening</li>
                    <li className="flex items-center gap-3 text-sm text-slate-300"><Check size={18} className="text-emerald-500"/> 5 AI Generation Credits</li>
                    <li className="flex items-center gap-3 text-sm text-slate-300"><Check size={18} className="text-emerald-500"/> Public Groups Only</li>
                    <li className="flex items-center gap-3 text-sm text-slate-500"><X size={18} /> No Private Channels</li>
                    <li className="flex items-center gap-3 text-sm text-slate-500"><X size={18} /> Standard Voice Quality</li>
                 </ul>

                 <button 
                    disabled={true}
                    className="w-full py-4 rounded-xl border border-slate-600 text-slate-400 font-bold text-sm cursor-default"
                 >
                    Current Plan
                 </button>
              </div>

              {/* PRO TIER */}
              <div className="bg-gradient-to-b from-indigo-900/20 to-slate-900 border border-indigo-500 rounded-2xl p-8 flex flex-col relative transform hover:scale-[1.02] transition-transform shadow-2xl shadow-indigo-500/10">
                 <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-600 text-white text-xs uppercase font-bold px-4 py-1.5 rounded-full shadow-lg flex items-center gap-1">
                    <Crown size={12} fill="currentColor"/> Best Value
                 </div>
                 <h3 className="text-xl font-bold text-indigo-300 mb-2 flex items-center gap-2">Pro Membership</h3>
                 <div className="text-4xl font-bold text-white mb-6">$29 <span className="text-sm font-normal text-slate-500">/mo</span></div>
                 
                 <ul className="space-y-4 mb-8 flex-1">
                    <li className="flex items-center gap-3 text-sm text-white"><Check size={18} className="text-indigo-400"/> <strong>Unlimited</strong> AI Generation</li>
                    <li className="flex items-center gap-3 text-sm text-white"><Check size={18} className="text-indigo-400"/> <strong>Private</strong> Channels & Groups</li>
                    <li className="flex items-center gap-3 text-sm text-white"><Check size={18} className="text-indigo-400"/> Neural Voices (Gemini)</li>
                    <li className="flex items-center gap-3 text-sm text-white"><Check size={18} className="text-indigo-400"/> Code Studio Pro (Git Sync)</li>
                    <li className="flex items-center gap-3 text-sm text-white"><Check size={18} className="text-indigo-400"/> Priority 1-on-1 Mentorship</li>
                 </ul>

                 {currentTier === 'pro' ? (
                     <button disabled className="w-full py-4 bg-slate-700 text-white font-bold rounded-xl text-sm border border-slate-600">Plan Active</button>
                 ) : (
                     <button 
                        onClick={handleCheckout}
                        disabled={processing}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm shadow-xl shadow-indigo-500/20 transition-all flex justify-center items-center gap-2"
                     >
                        {processing ? <Loader2 className="animate-spin" size={18}/> : <><CreditCard size={18}/> Checkout with Stripe</>}
                     </button>
                 )}
              </div>

           </div>
           
           <div className="mt-8 text-center text-xs text-slate-500">
              <p>Secure payment processing via Stripe. You can cancel at any time.</p>
              <p className="mt-1">All prices in USD. Enterprise plans available.</p>
           </div>
        </div>
      </div>
    </div>
  );
};