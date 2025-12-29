import React, { useState } from 'react';
import { Podcast, ArrowRight, ShieldCheck, Loader2, AlertCircle, Rocket, Shield, Code, Image as ImageIcon, MessageSquare } from 'lucide-react';
import { signInWithGoogle } from '../services/authService';
import { logUserActivity } from '../services/firestoreService';

interface LoginPageProps {
  onPrivacyClick?: () => void;
  onMissionClick?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onPrivacyClick, onMissionClick }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const user = await signInWithGoogle();
      if (user) {
        logUserActivity('login', { method: 'google', email: user.email });
      }
    } catch (e: any) {
      console.error("Login Error:", e);
      let msg = "Login failed. Please try again.";
      
      if (e.code === 'auth/popup-closed-by-user') {
        msg = "Sign-in cancelled.";
      } else if (e.code === 'auth/popup-blocked') {
        msg = "Popup blocked. Please allow popups for this site.";
      } else if (e.code === 'auth/unauthorized-domain') {
        const domain = window.location.hostname;
        msg = `Domain Unauthorized: ${domain}`;
        alert(`⚠️ FIREBASE CONFIG ERROR ⚠️\n\nThe domain "${domain}" is not authorized for Google Sign-In.\n\nTO FIX:\n1. Go to Firebase Console -> Authentication -> Settings -> Authorized Domains.\n2. Click "Add Domain".\n3. Paste: ${domain}`);
      } else if (e.code === 'auth/operation-not-supported-in-this-environment') {
        msg = "Environment not supported (http/https required).";
      }
      
      setError(msg);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[120px]"></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl shadow-2xl p-8 text-center animate-fade-in-up">
          
          {/* Branded 'Digital Core' App Icon */}
          <div className="w-24 h-24 mx-auto mb-6 relative group">
             <div className="absolute inset-0 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl shadow-lg shadow-indigo-500/40 group-hover:scale-105 transition-transform duration-500"></div>
             <svg viewBox="0 0 512 512" className="relative z-10 w-full h-full p-2">
                {/* Diamond Core */}
                <path d="M256 60 L452 256 L256 452 L60 256 Z" fill="white" />
                {/* Pulse Wave */}
                <path 
                    d="M140 256 h40 l15 -30 l20 60 l30 -90 l25 60 l15 -30 h80" 
                    stroke="url(#pulseGrad)" 
                    strokeWidth="18" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    fill="none" 
                />
                <defs>
                    <linearGradient id="pulseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#4338ca" />
                        <stop offset="100%" stopColor="#7e22ce" />
                    </linearGradient>
                </defs>
             </svg>
             {/* Glow effect */}
             <div className="absolute -inset-1 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition-opacity"></div>
          </div>

          <h1 className="text-3xl font-bold text-white mb-2">AIVoiceCast</h1>
          <p className="text-slate-400 text-sm mb-8 font-medium tracking-wide">
            Interactive AI-Native Workspace & Audio Community
          </p>

          <div className="space-y-6">
            {error && (
              <div className="bg-red-900/20 border border-red-900/50 rounded-xl p-3 text-red-300 text-xs flex items-center gap-2 text-left animate-shake">
                <AlertCircle size={16} className="shrink-0" />
                <span className="flex-1">{error}</span>
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="w-full bg-white hover:bg-slate-50 text-slate-900 font-bold py-4 rounded-2xl shadow-xl flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 size={20} className="animate-spin text-indigo-600" />
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  <span>Continue with Google</span>
                  <ArrowRight size={16} className="text-slate-400" />
                </>
              )}
            </button>
            
            <div className="flex items-center justify-center gap-4 mt-6">
                {onMissionClick && (
                    <button 
                        onClick={onMissionClick}
                        className="text-xs text-slate-500 hover:text-orange-400 flex items-center gap-1.5 transition-colors group"
                    >
                        <Rocket size={12} className="group-hover:scale-110 transition-transform" />
                        <span>Mission & Manifesto</span>
                    </button>
                )}
                <div className="w-1 h-1 bg-slate-800 rounded-full"></div>
                {onPrivacyClick && (
                    <button 
                        onClick={onPrivacyClick}
                        className="text-xs text-slate-500 hover:text-emerald-400 flex items-center gap-1.5 transition-colors group"
                    >
                        <Shield size={12} className="group-hover:scale-110 transition-transform" />
                        <span>Privacy Policy</span>
                    </button>
                )}
            </div>
          </div>
        </div>
        
        <div className="mt-8 flex flex-col items-center gap-4 animate-fade-in [animation-delay:400ms]">
            <p className="text-center text-slate-600 text-[10px] uppercase font-bold tracking-widest">
              Integrated Workspace Suite
            </p>
            <div className="flex gap-6 text-slate-700">
                <Code size={18} />
                <ImageIcon size={18} />
                <MessageSquare size={18} />
                <Podcast size={18} />
                <ShieldCheck size={18} />
            </div>
        </div>
      </div>
    </div>
  );
};