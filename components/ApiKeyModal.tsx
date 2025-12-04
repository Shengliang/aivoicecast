
import React, { useState, useEffect } from 'react';
import { X, Key, Save, Trash2, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyUpdate: (hasKey: boolean) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onKeyUpdate }) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'cleared'>('idle');

  useEffect(() => {
    if (isOpen) {
      const stored = localStorage.getItem('gemini_api_key');
      if (stored) {
        setApiKey(stored);
      }
    }
  }, [isOpen]);

  const handleSave = () => {
    if (!apiKey.trim()) return;
    localStorage.setItem('gemini_api_key', apiKey.trim());
    setStatus('saved');
    onKeyUpdate(true);
    setTimeout(() => {
        onClose();
        setStatus('idle');
    }, 1000);
  };

  const handleClear = () => {
    localStorage.removeItem('gemini_api_key');
    setApiKey('');
    setStatus('cleared');
    onKeyUpdate(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in-up">
        
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900">
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Key className="text-indigo-400 w-5 h-5" />
            <span>Set API Key</span>
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <p className="text-sm text-slate-400">
            To use this app, you need a Google Gemini API Key. The key is stored locally in your browser and never sent to our servers.
          </p>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
              Enter your Gemini API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-4 pr-12 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all font-mono text-sm"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
              >
                {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {status === 'saved' && (
            <div className="flex items-center space-x-2 text-emerald-400 text-sm bg-emerald-900/20 p-3 rounded-lg border border-emerald-900/50">
               <CheckCircle size={16} />
               <span>API Key saved successfully!</span>
            </div>
          )}
          
          {status === 'cleared' && (
            <div className="flex items-center space-x-2 text-amber-400 text-sm bg-amber-900/20 p-3 rounded-lg border border-amber-900/50">
               <AlertCircle size={16} />
               <span>API Key removed.</span>
            </div>
          )}

          <div className="flex space-x-3 pt-2">
             <button
               onClick={handleSave}
               disabled={!apiKey}
               className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center space-x-2"
             >
               <Save size={18} />
               <span>Save Key</span>
             </button>
             
             <button
               onClick={handleClear}
               className="px-4 bg-slate-800 hover:bg-red-900/30 hover:text-red-400 text-slate-400 border border-slate-700 rounded-xl transition-colors"
               title="Remove Key"
             >
               <Trash2 size={18} />
             </button>
          </div>
          
          <div className="text-center">
            <a 
              href="https://aistudio.google.com/app/apikey" 
              target="_blank" 
              rel="noreferrer"
              className="text-xs text-indigo-400 hover:text-indigo-300 underline"
            >
              Get a key from Google AI Studio
            </a>
          </div>

        </div>
      </div>
    </div>
  );
};
