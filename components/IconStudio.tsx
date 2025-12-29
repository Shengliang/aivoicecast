
import React, { useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { ArrowLeft, Sparkles, Wand2, Download, Loader2, RefreshCw, Smartphone, Monitor, LayoutGrid, Check, Info, ShieldCheck } from 'lucide-react';

interface IconStudioProps {
  onBack: () => void;
}

const PRESETS = [
  { 
    id: 'official-brand', 
    name: 'AIVoiceCast Official', 
    prompt: 'A premium professional app icon for "AIVoiceCast". A stylized minimalist microphone silhouette integrated with neural network connections and sound wave pulses. Electric indigo and deep purple gradient background. High-gloss 3D depth, metallic accents, soft cinematic shadows. Designed for iOS and Android high-density screens.' 
  },
  { 
    id: '3d-glass', 
    name: '3D Glassmorphic', 
    prompt: 'A modern premium 3D mobile app icon for a podcast platform. A glassmorphic microphone orbited by glowing data rings. Sleek iridescent textures, cinematic lighting on a deep slate background. 8k render, professional App Store quality.' 
  },
  { 
    id: 'minimal-vector', 
    name: 'Minimalist Vector', 
    prompt: 'Flat minimalist vector app icon. Stylized audio frequency waves forming a subtle brain silhouette. Vibrant indigo and teal gradients, sharp geometric shapes, clean white background, high contrast.' 
  },
  { 
    id: 'cyber-neural', 
    name: 'Cyber Neural', 
    prompt: 'Futuristic cyberpunk app icon. A neon glowing circuit board microphone with pulsing fiber optic connections. Electric purple and blue energy, dark technological atmosphere, depth of field.' 
  },
  { 
    id: 'retro-analog', 
    name: 'Retro Analog', 
    prompt: 'Retro-modern analog radio icon. 70s style bold typography elements mixed with 21st century AI nodes. Warm orange and cream tones, grain texture, iconic silhouette.' 
  }
];

export const IconStudio: React.FC<IconStudioProps> = ({ onBack }) => {
  const [activePreset, setActivePreset] = useState(PRESETS[0]);
  const [customPrompt, setCustomPrompt] = useState('');
  const [generatedIcon, setGeneratedIcon] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewMode, setPreviewMode] = useState<'icon' | 'homescreen'>('icon');

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = customPrompt || activePreset.prompt;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: `High-fidelity app icon design for AIVoiceCast platform. Centered composition. No text. Square format. App store aesthetic. ${prompt}` }]
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1"
          }
        }
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          setGeneratedIcon(`data:image/png;base64,${part.inlineData.data}`);
          break;
        }
      }
    } catch (error) {
      console.error("Icon gen failed", error);
      alert("Failed to generate icon. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedIcon) return;
    const a = document.createElement('a');
    a.href = generatedIcon;
    a.download = 'AIVoiceCast_Icon.png';
    a.click();
  };

  return (
    <div className="h-full bg-slate-950 flex flex-col animate-fade-in">
      {/* Header */}
      <div className="p-4 border-b border-slate-900 bg-slate-900 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Sparkles size={20} className="text-cyan-400" />
              App Icon Designer
            </h1>
            <p className="text-xs text-slate-500">Generate professional identity for AIVoiceCast</p>
          </div>
        </div>
        <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
          <button 
            onClick={() => setPreviewMode('icon')} 
            className={`p-2 rounded transition-colors ${previewMode === 'icon' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
            title="Icon Only View"
          >
            <Smartphone size={18}/>
          </button>
          <button 
            onClick={() => setPreviewMode('homescreen')} 
            className={`p-2 rounded transition-colors ${previewMode === 'homescreen' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
            title="Homescreen Mockup"
          >
            <LayoutGrid size={18}/>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* Workspace */}
        <div className="flex-1 overflow-y-auto p-6 md:p-12 flex flex-col items-center justify-center bg-slate-950 relative">
          
          {/* Decorative grid pattern */}
          <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #818cf8 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>

          <div className="relative z-10 group">
            {previewMode === 'icon' ? (
              <div className="w-64 h-64 md:w-80 md:h-80 bg-slate-900 rounded-[22.5%] overflow-hidden shadow-2xl border-4 border-slate-800 relative group transition-all duration-700 hover:rotate-3">
                {generatedIcon ? (
                  <img src={generatedIcon} className="w-full h-full object-cover" alt="Generated Icon" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-700 gap-4">
                    <Wand2 size={64} className="opacity-20 animate-pulse" />
                    <p className="text-sm font-bold uppercase tracking-widest opacity-40">Ready to Render</p>
                  </div>
                )}
                {isGenerating && (
                  <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                    <Loader2 size={48} className="animate-spin text-indigo-400" />
                    <p className="text-sm font-bold text-indigo-200 animate-pulse uppercase tracking-widest">Synthesizing Pixels</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative w-72 h-[550px] bg-slate-800 rounded-[3rem] border-[8px] border-slate-900 shadow-2xl overflow-hidden p-6 scale-90 md:scale-100">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-900 rounded-b-2xl"></div>
                
                {/* Home Screen Grid Mockup */}
                <div className="grid grid-cols-4 gap-4 mt-8">
                  {Array.from({ length: 11 }).map((_, i) => (
                    <div key={i} className="aspect-square bg-white/10 rounded-2xl"></div>
                  ))}
                  <div className="aspect-square bg-slate-900 rounded-[22.5%] overflow-hidden shadow-lg border border-white/10 animate-fade-in">
                    {generatedIcon ? (
                      <img src={generatedIcon} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-indigo-600/20 flex items-center justify-center">
                         <Sparkles size={16} className="text-indigo-400 opacity-40" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 text-center">
                    <p className="text-[10px] font-bold text-white/50 tracking-widest uppercase">AIVoiceCast</p>
                </div>

                {/* Dock Mockup */}
                <div className="absolute bottom-4 left-4 right-4 h-16 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-around px-2">
                   <div className="w-10 h-10 bg-green-500 rounded-xl shadow-inner"></div>
                   <div className="w-10 h-10 bg-blue-500 rounded-xl shadow-inner"></div>
                   <div className="w-10 h-10 bg-indigo-500 rounded-xl shadow-inner"></div>
                   <div className="w-10 h-10 bg-white/40 rounded-xl shadow-inner"></div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-12 flex gap-4 z-10">
            {generatedIcon && (
              <button 
                onClick={handleDownload}
                className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-all border border-slate-700 shadow-lg"
              >
                <Download size={18} />
                Export PNG
              </button>
            )}
            <button 
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-xl shadow-indigo-500/30 active:scale-95"
            >
              {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
              {generatedIcon ? 'Redraw' : 'Generate App Identity'}
            </button>
          </div>
        </div>

        {/* Settings Sidebar */}
        <div className="w-full md:w-96 bg-slate-900 border-l border-slate-800 p-6 flex flex-col gap-8 shrink-0 overflow-y-auto">
          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <LayoutGrid size={14} />
              Concept Presets
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => { setActivePreset(preset); setCustomPrompt(''); }}
                  className={`text-left p-4 rounded-xl border transition-all ${activePreset.id === preset.id && !customPrompt ? 'bg-indigo-900/30 border-indigo-500 ring-1 ring-indigo-500/50' : 'bg-slate-800 border-slate-700 hover:border-slate-500'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-sm text-white">{preset.name}</p>
                    {activePreset.id === preset.id && !customPrompt && <Check size={14} className="text-indigo-400" />}
                  </div>
                  <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed">{preset.prompt}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="flex-1 flex flex-col">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Edit3 size={14} />
              Refinement Prompt
            </h3>
            <div className="flex-1 bg-slate-950 border border-slate-700 rounded-xl focus-within:border-indigo-500 transition-colors p-1 flex flex-col">
                <textarea
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                placeholder="Describe specific visuals, colors, or mood (e.g. 'Matte gold microphone on black marble')..."
                className="w-full flex-1 bg-transparent p-4 text-sm text-slate-300 outline-none resize-none"
                />
                <div className="p-2 border-t border-slate-800 flex justify-end">
                    <button onClick={() => setCustomPrompt('')} className="text-[10px] font-bold text-slate-500 hover:text-white px-2">Clear</button>
                </div>
            </div>
          </section>

          <div className="bg-indigo-900/20 border border-indigo-500/30 p-4 rounded-xl flex gap-3 shadow-inner">
            <ShieldCheck size={18} className="text-indigo-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-indigo-200 leading-relaxed font-medium">
              AIVoiceCast automatically optimizes these prompts for the Gemini 2.5 Flash vision engine to ensure pixel-perfect legibility at small sizes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Edit3 = ({ size, className }: any) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
);
