import React, { useState, useEffect } from 'react';
import { ArrowLeft, Sparkles, Download, Loader2, AppWindow, RefreshCw, Layers, ShieldCheck, Key, Globe, Layout, Palette, Check, AlertCircle } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

interface IconGeneratorProps {
  onBack: () => void;
  currentUser: any;
}

const STYLE_PRESETS = [
  { name: 'Glassmorphism', prompt: 'Glassmorphic design, frosted glass texture, soft colorful gradients, modern look, translucent, high quality UI' },
  { name: 'Flat Minimal', prompt: 'Flat design, minimalist, bold colors, simple geometric shapes, clean lines, high contrast, material design' },
  { name: 'Cyberpunk', prompt: 'Cyberpunk neon aesthetic, glowing lines, dark background, electric blue and magenta accents, high tech' },
  { name: '3D Isometric', prompt: '3D isometric render, Claymorphism style, soft shadows, rounded edges, high resolution, soft lighting' },
  { name: 'Neumorphism', prompt: 'Neumorphic style, soft shadows and highlights, subtle depth, monochromatic, elegant, Apple aesthetic' },
  { name: 'Ink Wash', prompt: 'Traditional Chinese ink wash painting style, minimalist, elegant brush strokes, negative space, artistic' }
];

export const IconGenerator: React.FC<IconGeneratorProps> = ({ onBack, currentUser }) => {
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState(STYLE_PRESETS[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedIcon, setGeneratedIcon] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(true); 
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      }
    };
    checkApiKey();
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    setGeneratedIcon(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const fullPrompt = `Professional app icon design for: ${prompt}. ${selectedStyle.prompt}. Isolated on a solid background, no text, 8k resolution.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: { parts: [{ text: fullPrompt }] },
        config: { imageConfig: { aspectRatio: "1:1", imageSize: "1K" } },
      });

      let foundImage = false;
      const candidate = response.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData) {
            setGeneratedIcon(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
            foundImage = true;
            break;
          }
        }
      }

      if (!foundImage) throw new Error("Synthesis failed to produce image data.");
    } catch (e: any) {
      if (e.message?.includes("Requested entity was not found.")) {
        setHasApiKey(false);
      } else {
        setError(e.message || "Synthesis failed.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedIcon) return;
    const link = document.createElement('a');
    link.href = generatedIcon;
    link.download = `icon_${Date.now()}.png`;
    link.click();
  };

  if (!hasApiKey) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-950 p-6">
        <div className="max-w-md w-full text-center space-y-8 animate-fade-in-up">
            <ShieldCheck size={64} className="text-indigo-400 mx-auto" />
            <h2 className="text-3xl font-black text-white">API Key Required</h2>
            <button onClick={() => window.aistudio.openSelectKey().then(() => setHasApiKey(true))} className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl">Select API Key</button>
            <button onClick={onBack} className="text-slate-500 hover:text-white text-sm">Return</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      <header className="h-16 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-6 shrink-0 z-20">
          <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"><ArrowLeft size={20} /></button>
              <h1 className="text-lg font-bold text-white flex items-center gap-2"><AppWindow className="text-cyan-400" />Icon Lab</h1>
          </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          <div className="w-full lg:w-[400px] border-r border-slate-800 bg-slate-900/30 p-8 space-y-10 overflow-y-auto scrollbar-thin">
              <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><Layers size={14}/> Concept</h3>
                  <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. 'a minimalist rocket ship'..." className="w-full h-32 bg-slate-900 border border-slate-700 rounded-2xl p-4 text-sm outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none" />
              </div>
              <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><Palette size={14}/> Style</h3>
                  <div className="grid grid-cols-2 gap-3">
                      {STYLE_PRESETS.map((style) => (
                          <button key={style.name} onClick={() => setSelectedStyle(style)} className={`p-3 rounded-xl border text-left transition-all ${selectedStyle.name === style.name ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                              <span className="text-xs font-bold block">{style.name}</span>
                          </button>
                      ))}
                  </div>
              </div>
              <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()} className="w-full py-4 bg-gradient-to-r from-cyan-600 to-indigo-600 text-white font-black rounded-2xl flex items-center justify-center gap-3 disabled:opacity-50">
                  {isGenerating ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
                  <span>{isGenerating ? 'Synthesizing...' : 'Generate Icon'}</span>
              </button>
              {error && <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-xl text-red-300 text-xs flex items-center gap-2"><AlertCircle size={14} />{error}</div>}
          </div>

          <div className="flex-1 bg-slate-950 flex items-center justify-center relative p-8">
              {generatedIcon ? (
                  <div className="flex flex-col items-center animate-fade-in w-full max-w-2xl">
                      <div className="relative p-12 bg-slate-900/40 rounded-[4rem] border border-slate-800 shadow-2xl backdrop-blur-sm mb-8">
                          <img src={generatedIcon} className="w-48 h-48 rounded-[2rem] shadow-2xl border border-white/10" alt="Preview" />
                      </div>
                      <div className="flex gap-4">
                          <button onClick={handleDownload} className="px-8 py-3 bg-white text-slate-950 font-black rounded-xl flex items-center gap-2 shadow-lg"><Download size={18} />Download</button>
                          <button onClick={handleGenerate} className="px-8 py-3 bg-slate-800 text-white font-bold rounded-xl flex items-center gap-2 border border-slate-700"><RefreshCw size={18} />Try Again</button>
                      </div>
                  </div>
              ) : (
                  <div className="text-center space-y-6 opacity-20">
                      <Layout size={64} className="mx-auto" />
                      <p className="text-xl font-bold">Neural Canvas</p>
                  </div>
              )}
          </div>
      </div>
    </div>
  );
};
