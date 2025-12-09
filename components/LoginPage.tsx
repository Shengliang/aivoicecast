
import React, { useState } from 'react';
import { Podcast, ArrowRight, ShieldCheck, Loader2, AlertCircle, Terminal } from 'lucide-react';
import { signInWithGoogle } from '../services/authService';
import { logUserActivity } from '../services/firestoreService';

export const LoginPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const user = await signInWithGoogle();
      if (user) {
        // Success handled by App.tsx listener
        logUserActivity('login', { method: 'google', email: user.email });
      }
    } catch (e: any) {
      console.error("Login Error:", e);
      let msg = "Login failed. Please try again.";
      if (e.code === 'auth/popup-closed-by-user') msg = "Sign-in cancelled.";
      else if (e.code === 'auth/popup-blocked') msg = "Popup blocked. Please allow popups for this site.";
      else if (e.code === 'auth/operation-not-supported-in-this-environment') {
          msg = "Environment Error: Firebase Auth does not support this environment (e.g. file:// or restricted iframe).";
      }
      setError(msg);
      setIsLoading(false);
    }
  };

  const handleDevBypass = () => {
      localStorage.setItem('aivoicecast_dev_mode', 'true');
      window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[120px]"></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl shadow-2xl p-8 text-center">
          
          {/* Logo */}
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-6">
            <Podcast className="text-white w-10 h-10" />
          </div>

          <h1 className="text-3xl font-bold text-white mb-2">AIVoiceCast</h1>
          <p className="text-slate-400 text-sm mb-8">
            Interactive AI Audio Platform
          </p>

          <div className="space-y-6">
            <div className="bg-indigo-900/20 border border-indigo-500/20 rounded-xl p-4 text-left">
              <h3 className="text-indigo-300 font-bold text-sm flex items-center gap-2 mb-1">
                <ShieldCheck size={16} /> Members Only
              </h3>
              <p className="text-xs text-indigo-200/70 leading-relaxed">
                Guest access is disabled. You must register or sign in with a valid Gmail/Google account to access this platform.
              </p>
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-3 text-red-300 text-xs flex flex-col gap-2 text-left">
                <div className="flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{error}</span>
                </div>
                {error.includes("Environment Error") && (
                    <button 
                        onClick={handleDevBypass}
                        className="mt-2 w-full py-2 bg-red-800 hover:bg-red-700 text-white rounded font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                        <Terminal size={14} />
                        <span>Enable Dev Mode (Bypass)</span>
                    </button>
                )}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="w-full bg-white hover:bg-slate-100 text-slate-900 font-bold py-3.5 rounded-xl shadow-lg flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02] disabled:opacity-70 disabled:cursor-not-allowed"
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
                  <span>Sign in with Google</span>
                  <ArrowRight size={16} className="text-slate-400" />
                </>
              )}
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-800">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
              Restricted Access Area
            </p>
          </div>
        </div>
        
        <p className="text-center text-slate-600 text-xs mt-6">
          By signing in, you agree to join the AIVoiceCast Member Community.
        </p>
      </div>
    </div>
  );
};
