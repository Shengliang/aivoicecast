
import React, { useRef, useState, useEffect, useCallback } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null); // Ref for container to size against
  
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

  // The rendering loop
  const redraw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;

      // 1. Clear the canvas (using absolute coordinates)
      ctx.setTransform(1, 0, 0, 1, 0, 0); 
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 2. Apply Scale for High DPI
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      const allElements = currentElement ? [...elements, currentElement] : elements;

      allElements.forEach(el => {
          if (!el) return;
          
          ctx.save();

          // Handle Eraser Mode (Transparency)
          if (el.type === 'eraser') {
              ctx.globalCompositeOperation = 'destination-out';
              ctx.strokeStyle = 'rgba(0,0,0,1)'; 
          } else {
              ctx.globalCompositeOperation = 'source-over';
              ctx.strokeStyle = el.color;
          }

          ctx.lineWidth = el.strokeWidth;
          
          ctx.beginPath();

          if (el.type === 'pencil' || el.type === 'eraser') {
              if (el.points && el.points.length > 0) {
                  const pts = el.points;
                  ctx.moveTo(pts[0].x, pts[0].y);
                  
                  if (pts.length < 3) {
                      // Draw a dot if not enough points for curve
                      const b = pts[0];
                      ctx.lineTo(b.x, b.y + 0.01); 
                  } else {
                      // Smooth curve drawing (quadratic bezier)
                      for (let i = 1; i < pts.length - 1; i++) {
                          const p1 = pts[i];
                          const p2 = pts[i + 1];
                          const midX = (p1.x + p2.x) / 2;
                          const midY = (p1.y + p2.y) / 2;
                          ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
                      }
                      // Connect last point
                      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
                  }
              }
          } else if (el.type === 'line') {
              ctx.moveTo(el.x, el.y);
              ctx.lineTo(el.x + (el.width || 0), el.y + (el.height || 0));
          } else if (el.type === 'rectangle') {
              ctx.rect(el.x, el.y, el.width || 0, el.height || 0);
          } else if (el.type === 'circle') {
              const w = el.width || 0;
              const h = el.height || 0;
              const radiusX = Math.abs(w / 2);
              const radiusY = Math.abs(h / 2);
              const centerX = el.x + w / 2;
              const centerY = el.y + h / 2;
              
              ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
          } else if (el.type === 'text' && el.text) {
              ctx.font = `${el.strokeWidth * 10 + 12}px sans-serif`;
              ctx.fillStyle = el.color;
              ctx.textBaseline = 'top';
              ctx.lineWidth = 1; 
              ctx.fillText(el.text, el.x, el.y); 
          }

          if (el.type !== 'text') {
              ctx.stroke();
          }
          
          ctx.restore();
      });
  }, [elements, currentElement]);

  // Setup Canvas & Resize Observer
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    const updateSize = () => {
        const dpr = window.devicePixelRatio || 1;
        // Set display size (css)
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        
        // Set buffer size (memory)
        canvas.width = container.clientWidth * dpr;
        canvas.height = container.clientHeight * dpr;
        
        // Immediately redraw after resize/clear
        redraw();
    };

    // Initial sizing
    updateSize();

    // Resize observer is more robust than window.resize for flex containers
    const resizeObserver = new ResizeObserver(() => {
        updateSize();
    });
    resizeObserver.observe(container);
    
    return () => resizeObserver.disconnect();
  }, [redraw]);

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
      
      let clientX = 0;
      let clientY = 0;

      if ('touches' in e && e.touches.length > 0) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
          clientX = (e as React.MouseEvent).clientX;
          clientY = (e as React.MouseEvent).clientY;
      }

      return {
          x: clientX - rect.left,
          y: clientY - rect.top
      };
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
      if (tool === 'selection') return;
      // Prevent scrolling on touch
      // e.preventDefault(); 
      
      const { x, y } = getPointerPos(e);

      if (tool === 'text') {
          if (textInput) {
              if (textInput.text.trim()) {
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
              }
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
          color: color, 
          strokeWidth: tool === 'eraser' ? 20 : strokeWidth
      };
      
      setCurrentElement(newEl);
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing || !currentElement) return;
      // e.preventDefault();
      
      const { x, y } = getPointerPos(e);

      if (tool === 'pencil' || tool === 'eraser') {
          setCurrentElement(prev => {
              if (!prev) return null;
              return {
                  ...prev,
                  points: [...(prev.points || []), { x, y }]
              };
          });
      } else {
          setCurrentElement(prev => {
              if (!prev) return null;
              return {
                  ...prev,
                  width: x - prev.x,
                  height: y - prev.y
              };
          });
      }
  };

  const handleMouseUp = () => {
      if (!isDrawing || !currentElement) return;
      setIsDrawing(false);
      
      const isTiny = !currentElement.points && Math.abs(currentElement.width || 0) < 3 && Math.abs(currentElement.height || 0) < 3;
      
      if (!isTiny) {
          const nextElements = [...elements, currentElement];
          setElements(nextElements);
          saveHistory(nextElements);
      }
      
      setCurrentElement(null);
  };

  const handleDownload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tCtx = tempCanvas.getContext('2d');
      if (!tCtx) return;
      
      // Fill background dark for export
      tCtx.fillStyle = '#0f172a'; // slate-950
      tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      tCtx.drawImage(canvas, 0, 0);
      
      const link = document.createElement('a');
      link.download = `whiteboard-${Date.now()}.png`;
      link.href = tempCanvas.toDataURL();
      link.click();
  };

  const handleAskAI = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      setIsAiOpen(true);
      setIsAnalyzing(true);
      setAiAnalysis('');

      try {
          const base64Image = canvas.toDataURL('image/png').split(',')[1];
          const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
          if (!apiKey) throw new Error("API Key required");
          
          const ai = new GoogleGenAI({ apiKey });
          const prompt = "You are an AI assistant viewing a whiteboard. Analyze this sketch. If it's a diagram, explain the architecture. If it's code, explain the logic. If it's a math problem, solve it. Be concise and helpful.";
          
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
          setCurrentElement(null);
      }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden relative select-none">
      
      {/* Header / Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-2xl shadow-xl p-2 flex items-center gap-2 overflow-x-auto max-w-[90vw] scrollbar-hide">
          <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white mr-2 flex-shrink-0">
              <ArrowLeft size={20} />
          </button>
          
          <div className="h-6 w-px bg-slate-700 mx-1 flex-shrink-0" />

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
                  className={`p-2 rounded-xl transition-all flex-shrink-0 ${tool === t.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                  title={t.label}
              >
                  <t.icon size={20} />
              </button>
          ))}

          <div className="h-6 w-px bg-slate-700 mx-1 flex-shrink-0" />

          {/* Color Picker */}
          <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl flex-shrink-0">
              <input 
                  type="color" 
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer bg-transparent border-none outline-none"
                  title="Color"
              />
          </div>

          <div className="h-6 w-px bg-slate-700 mx-1 flex-shrink-0" />

          {/* Actions */}
          <button onClick={undo} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl flex-shrink-0" title="Undo">
              <Undo size={18} />
          </button>
          <button onClick={redo} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl flex-shrink-0" title="Redo">
              <Redo size={18} />
          </button>
          <button onClick={clearCanvas} className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl flex-shrink-0" title="Clear">
              <Trash2 size={18} />
          </button>
          <button onClick={handleDownload} className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-xl flex-shrink-0" title="Download">
              <Download size={18} />
          </button>
          
          <button 
              onClick={handleAskAI} 
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold shadow-lg ml-2 flex-shrink-0"
          >
              <Bot size={16} />
              <span className="hidden sm:inline">Ask AI</span>
          </button>
      </div>

      {/* Canvas Area */}
      <div 
        ref={containerRef}
        className="flex-1 bg-slate-950 relative cursor-crosshair overflow-hidden touch-none w-full h-full"
      >
          <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleMouseDown}
              onTouchMove={handleMouseMove}
              onTouchEnd={handleMouseUp}
              className="block touch-none"
              style={{ width: '100%', height: '100%' }}
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
                      fontSize: `${strokeWidth * 10 + 12}px`,
                      background: 'rgba(30, 41, 59, 0.8)', 
                      border: '1px dashed #6366f1',
                      outline: 'none',
                      minWidth: '100px',
                      padding: '4px',
                      borderRadius: '4px',
                      zIndex: 10
                  }}
                  value={textInput.text}
                  onChange={(e) => setTextInput({ ...textInput, text: e.target.value })}
                  onKeyDown={(e) => {
                      if (e.key === 'Enter') handleMouseDown({ clientX: 0, clientY: 0 } as any); // Force commit
                  }}
                  onBlur={() => handleMouseDown({ clientX: 0, clientY: 0 } as any)} // Commit on blur too
                  placeholder="Type..."
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
