import React, { useRef, useState, useEffect } from 'react';
import { 
  ArrowLeft, Square, Circle, Minus, Type, Eraser, 
  Undo, Redo, Download, MousePointer, Pencil, Bot, 
  Loader2, X, Send, Palette, Trash2, Maximize, Sparkles
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from '../services/private_keys';
import { MarkdownView } from './MarkdownView';

interface WhiteboardProps {
  onBack: () => void;
}

type ToolType = 'selection' | 'pencil' | 'rectangle' | 'circle' | 'line' | 'text' | 'eraser';

interface Point {
  x: number;
  y: number;
}

interface DrawingElement {
  id: string;
  type: ToolType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: Point[]; // For pencil
  text?: string;
  color: string;
  strokeWidth: number;
}

export const Whiteboard: React.FC<WhiteboardProps> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elements, setElements] = useState<DrawingElement[]>([]);
  const [history, setHistory] = useState<DrawingElement[][]>([]);
  const [historyStep, setHistoryStep] = useState(0);
  
  const [tool, setTool] = useState<ToolType>('pencil');
  const [color, setColor] = useState('#ffffff');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentElement, setCurrentElement] = useState<DrawingElement | null>(null);
  const [textInput, setTextInput] = useState<{x: number, y: number, text: string} | null>(null);

  // AI Chat State
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Setup Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // High DPI scaling
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }
    
    redraw();
  }, []);

  // Window Resize Handler
  useEffect(() => {
      const handleResize = () => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const parent = canvas.parentElement;
          if (parent) {
              const dpr = window.devicePixelRatio || 1;
              canvas.width = parent.clientWidth * dpr;
              canvas.height = parent.clientHeight * dpr;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                  ctx.scale(dpr, dpr);
                  ctx.lineCap = 'round';
                  ctx.lineJoin = 'round';
              }
              redraw();
          }
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, [elements, currentElement]);

  const saveHistory = (newElements: DrawingElement[]) => {
      const newHistory = history.slice(0, historyStep + 1);
      newHistory.push(newElements);
      setHistory(newHistory);
      setHistoryStep(newHistory.length - 1);
  };

  const undo = () => {
      if (historyStep > 0) {
          const prev = history[historyStep - 1];
          setElements(prev);
          setHistoryStep(historyStep - 1);
      } else if (historyStep === 0) {
          setElements([]);
          setHistoryStep(-1);
      }
  };

  const redo = () => {
      if (historyStep < history.length - 1) {
          const next = history[historyStep + 1];
          setElements(next);
          setHistoryStep(historyStep + 1);
      }
  };

  const getPointerPos = (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      return {
          x: clientX - rect.left,
          y: clientY - rect.top
      };
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
      if (tool === 'selection') return;
      const { x, y } = getPointerPos(e);

      if (tool === 'text') {
          if (textInput) {
              // Commit existing text
              const newEl: DrawingElement = {
                  id: crypto.randomUUID(),
                  type: 'text',
                  x: textInput.x,
                  y: textInput.y,
                  text: textInput.text,
                  color,
                  strokeWidth
              };
              const nextElements = [...elements, newEl];
              setElements(nextElements);
              saveHistory(nextElements);
              setTextInput(null);
          } else {
              setTextInput({ x, y, text: '' });
          }
          return;
      }

      setIsDrawing(true);
      const id = crypto.randomUUID();
      
      const newEl: DrawingElement = {
          id,
          type: tool,
          x,
          y,
          width: 0,
          height: 0,
          points: tool === 'pencil' || tool === 'eraser' ? [{ x, y }] : undefined,
          color: tool === 'eraser' ? '#0f172a' : color, // Eraser matches bg
          strokeWidth: tool === 'eraser' ? 20 : strokeWidth
      };
      
      setCurrentElement(newEl);
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing || !currentElement) return;
      const { x, y } = getPointerPos(e);

      if (tool === 'pencil' || tool === 'eraser') {
          setCurrentElement(prev => ({
              ...prev!,
              points: [...(prev!.points || []), { x, y }]
          }));
      } else {
          setCurrentElement(prev => ({
              ...prev!,
              width: x - prev!.x,
              height: y - prev!.y
          }));
      }
  };

  const handleMouseUp = () => {
      if (!isDrawing || !currentElement) return;
      setIsDrawing(false);
      
      const nextElements = [...elements, currentElement];
      setElements(nextElements);
      saveHistory(nextElements);
      setCurrentElement(null);
  };

  // The rendering loop
  const redraw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw all elements
      [...elements, currentElement].forEach(el => {
          if (!el) return;
          
          ctx.strokeStyle = el.color;
          ctx.lineWidth = el.strokeWidth;
          ctx.beginPath();

          if (el.type === 'pencil' || el.type === 'eraser') {
              if (el.points && el.points.length > 0) {
                  ctx.moveTo(el.points[0].x, el.points[0].y);
                  el.points.forEach(p => ctx.lineTo(p.x, p.y));
              }
          } else if (el.type === 'line') {
              ctx.moveTo(el.x, el.y);
              ctx.lineTo(el.x + (el.width || 0), el.y + (el.height || 0));
          } else if (el.type === 'rectangle') {
              ctx.strokeRect(el.x, el.y, el.width || 0, el.height || 0);
          } else if (el.type === 'circle') {
              const radius = Math.sqrt(Math.pow(el.width || 0, 2) + Math.pow(el.height || 0, 2));
              ctx.arc(el.x, el.y, radius, 0, 2 * Math.PI);
          } else if (el.type === 'text' && el.text) {
              ctx.font = `${el.strokeWidth * 10 + 10}px sans-serif`;
              ctx.fillStyle = el.color;
              ctx.fillText(el.text, el.x, el.y);
          }

          if (el.type !== 'text' && el.type !== 'rectangle') ctx.stroke();
          // specific handling for rect stroke is done via strokeRect
      });
  };

  // Trigger redraw on state change
  useEffect(() => {
      redraw();
  }, [elements, currentElement]);

  const handleDownload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = `whiteboard-${Date.now()}.png`;
      link.href = canvas.toDataURL();
      link.click();
  };

  const handleAskAI = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      setIsAiOpen(true);
      setIsAnalyzing(true);
      setAiAnalysis('');

      try {
          // Get base64 image (remove header)
          const base64Image = canvas.toDataURL('image/png').split(',')[1];
          
          const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
          if (!apiKey) throw new Error("API Key required");
          
          const ai = new GoogleGenAI({ apiKey });
          
          const prompt = "Analyze this whiteboard sketch. Describe the diagram structure, read any text, and explain the technical concept if applicable. If it's a UI mockup, describe the components.";
          
          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: [
                  {
                      parts: [
                          { text: prompt },
                          { inlineData: { mimeType: 'image/png', data: base64Image } }
                      ]
                  }
              ]
          });
          
          setAiAnalysis(response.text || "No analysis generated.");

      } catch(e: any) {
          setAiAnalysis(`Error: ${e.message}`);
      } finally {
          setIsAnalyzing(false);
      }
  };

  const clearCanvas = () => {
      if (confirm("Clear entire whiteboard?")) {
          setElements([]);
          saveHistory([]);
      }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden relative">
      
      {/* Header / Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-2xl shadow-xl p-2 flex items-center gap-2 overflow-x-auto max-w-[90vw]">
          <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white mr-2">
              <ArrowLeft size={20} />
          </button>
          
          <div className="h-6 w-px bg-slate-700 mx-1" />

          {/* Tools */}
          {[
              { id: 'selection', icon: MousePointer, label: 'Select' },
              { id: 'pencil', icon: Pencil, label: 'Draw' },
              { id: 'rectangle', icon: Square, label: 'Box' },
              { id: 'circle', icon: Circle, label: 'Circle' },
              { id: 'line', icon: Minus, label: 'Line' },
              { id: 'text', icon: Type, label: 'Text' },
              { id: 'eraser', icon: Eraser, label: 'Erase' },
          ].map((t) => (
              <button
                  key={t.id}
                  onClick={() => setTool(t.id as ToolType)}
                  className={`p-2 rounded-xl transition-all ${tool === t.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                  title={t.label}
              >
                  <t.icon size={20} />
              </button>
          ))}

          <div className="h-6 w-px bg-slate-700 mx-1" />

          {/* Color Picker */}
          <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl">
              <input 
                  type="color" 
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer bg-transparent border-none outline-none"
              />
          </div>

          <div className="h-6 w-px bg-slate-700 mx-1" />

          {/* Actions */}
          <button onClick={undo} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl" title="Undo">
              <Undo size={18} />
          </button>
          <button onClick={redo} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl" title="Redo">
              <Redo size={18} />
          </button>
          <button onClick={clearCanvas} className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl" title="Clear">
              <Trash2 size={18} />
          </button>
          <button onClick={handleDownload} className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-xl" title="Download">
              <Download size={18} />
          </button>
          
          <button 
              onClick={handleAskAI} 
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold shadow-lg ml-2"
          >
              <Bot size={16} />
              <span className="hidden sm:inline">Ask AI</span>
          </button>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 bg-slate-950 relative cursor-crosshair overflow-hidden touch-none">
          <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleMouseDown}
              onTouchMove={handleMouseMove}
              onTouchEnd={handleMouseUp}
              className="absolute inset-0 w-full h-full block"
          />
          
          {/* Text Input Overlay */}
          {textInput && (
              <input
                  autoFocus
                  style={{ 
                      position: 'absolute', 
                      left: textInput.x, 
                      top: textInput.y,
                      color: color,
                      fontSize: `${strokeWidth * 10 + 10}px`,
                      background: 'transparent',
                      border: '1px dashed #6366f1',
                      outline: 'none',
                      minWidth: '100px'
                  }}
                  value={textInput.text}
                  onChange={(e) => setTextInput({ ...textInput, text: e.target.value })}
                  onKeyDown={(e) => {
                      if (e.key === 'Enter') handleMouseDown({ clientX: 0, clientY: 0 } as any); // Force commit
                  }}
                  placeholder="Type here..."
              />
          )}
      </div>

      {/* AI Panel */}
      {isAiOpen && (
          <div className="absolute top-24 right-4 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[60vh] animate-fade-in-up z-30">
              <div className="p-3 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Sparkles size={14} className="text-purple-400"/> AI Analysis
                  </h3>
                  <button onClick={() => setIsAiOpen(false)}><X size={16} className="text-slate-400 hover:text-white"/></button>
              </div>
              <div className="p-4 overflow-y-auto flex-1 text-sm text-slate-300">
                  {isAnalyzing ? (
                      <div className="flex flex-col items-center justify-center py-8 text-indigo-400 gap-2">
                          <Loader2 className="animate-spin" size={24} />
                          <span className="text-xs">Vision Model is thinking...</span>
                      </div>
                  ) : (
                      <MarkdownView content={aiAnalysis} />
                  )}
              </div>
          </div>
      )}

    </div>
  );
};