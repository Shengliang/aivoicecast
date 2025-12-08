
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, Square, Circle, Minus, Type, Eraser, 
  Undo, Redo, Download, MousePointer, Pencil, Bot, 
  Loader2, X, Palette, Trash2, Maximize, Sparkles
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
  const containerRef = useRef<HTMLDivElement>(null); 
  
  const [elements, setElements] = useState<DrawingElement[]>([]);
  const [history, setHistory] = useState<DrawingElement[][]>([]);
  const [historyStep, setHistoryStep] = useState(0);
  
  const [tool, setTool] = useState<ToolType>('pencil');
  const [color, setColor] = useState('#ffffff');
  const [strokeWidth, setStrokeWidth] = useState(2);
  
  // Interaction State
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentElement, setCurrentElement] = useState<DrawingElement | null>(null);
  const [textInput, setTextInput] = useState<{x: number, y: number, text: string} | null>(null);
  
  // Selection / Dragging State
  const [selectedElementIds, setSelectedElementIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [selectionBox, setSelectionBox] = useState<{start: Point, current: Point} | null>(null);

  // AI Chat State
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Helper: Get Element Bounds
  const getElementBounds = (el: DrawingElement) => {
      let minX = el.x, maxX = el.x, minY = el.y, maxY = el.y;
      
      if (el.type === 'rectangle' || el.type === 'circle') {
          minX = Math.min(el.x, el.x + (el.width || 0));
          maxX = Math.max(el.x, el.x + (el.width || 0));
          minY = Math.min(el.y, el.y + (el.height || 0));
          maxY = Math.max(el.y, el.y + (el.height || 0));
      } else if (el.type === 'line') {
          minX = Math.min(el.x, el.x + (el.width || 0));
          maxX = Math.max(el.x, el.x + (el.width || 0));
          minY = Math.min(el.y, el.y + (el.height || 0));
          maxY = Math.max(el.y, el.y + (el.height || 0));
      } else if (el.type === 'text') {
          const fontSize = el.strokeWidth * 10 + 12;
          const w = (el.text?.length || 0) * (fontSize * 0.6);
          const h = fontSize * 1.5;
          maxX = el.x + w;
          maxY = el.y + h;
      } else if (el.points && el.points.length > 0) {
          const xs = el.points.map(p => p.x);
          const ys = el.points.map(p => p.y);
          minX = Math.min(...xs);
          maxX = Math.max(...xs);
          minY = Math.min(...ys);
          maxY = Math.max(...ys);
      }
      return { minX, maxX, minY, maxY };
  };

  // Helper: Hit Test
  const isPointInElement = (x: number, y: number, el: DrawingElement): boolean => {
      const padding = 10;
      const b = getElementBounds(el);
      
      // Rough bounds check first
      if (x < b.minX - padding || x > b.maxX + padding || y < b.minY - padding || y > b.maxY + padding) {
          return false;
      }

      if (el.type === 'line') {
          // Precise line hit test
          const x1 = el.x;
          const y1 = el.y;
          const x2 = el.x + (el.width || 0);
          const y2 = el.y + (el.height || 0);
          const A = x - x1;
          const B = y - y1;
          const C = x2 - x1;
          const D = y2 - y1;
          const dot = A * C + B * D;
          const len_sq = C * C + D * D;
          let param = -1;
          if (len_sq !== 0) param = dot / len_sq;
          let xx, yy;
          if (param < 0) { xx = x1; yy = y1; }
          else if (param > 1) { xx = x2; yy = y2; }
          else { xx = x1 + param * C; yy = y1 + param * D; }
          const dx = x - xx;
          const dy = y - yy;
          return (dx * dx + dy * dy) < padding * padding;
      } else if (el.type === 'pencil' || el.type === 'eraser') {
          // Check proximity to any point
          return el.points ? el.points.some(p => Math.abs(p.x - x) < padding && Math.abs(p.y - y) < padding) : false;
      }
      
      // For rect, circle, text, the bounds check is sufficient for simple selection
      return true;
  };

  // Rendering Loop
  const redraw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;

      ctx.setTransform(1, 0, 0, 1, 0, 0); 
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      const allElements = currentElement ? [...elements, currentElement] : elements;

      allElements.forEach(el => {
          if (!el) return;
          
          ctx.save();

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
                      const b = pts[0];
                      ctx.lineTo(b.x, b.y + 0.01); 
                  } else {
                      for (let i = 1; i < pts.length - 1; i++) {
                          const p1 = pts[i];
                          const p2 = pts[i + 1];
                          const midX = (p1.x + p2.x) / 2;
                          const midY = (p1.y + p2.y) / 2;
                          ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
                      }
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

          // Highlight Selected Elements
          if (selectedElementIds.has(el.id)) {
              const bounds = getElementBounds(el);
              ctx.save();
              ctx.strokeStyle = '#6366f1'; // Indigo-500
              ctx.lineWidth = 1;
              ctx.setLineDash([5, 5]);
              const padding = 5;
              ctx.strokeRect(
                  bounds.minX - padding, 
                  bounds.minY - padding, 
                  (bounds.maxX - bounds.minX) + padding * 2, 
                  (bounds.maxY - bounds.minY) + padding * 2
              );
              ctx.restore();
          }
      });

      // Draw Selection Box (Rubber Band)
      if (selectionBox) {
          ctx.save();
          ctx.strokeStyle = '#3b82f6'; // Blue-500
          ctx.fillStyle = 'rgba(59, 130, 246, 0.1)'; 
          ctx.lineWidth = 1;
          const x = Math.min(selectionBox.start.x, selectionBox.current.x);
          const y = Math.min(selectionBox.start.y, selectionBox.current.y);
          const w = Math.abs(selectionBox.current.x - selectionBox.start.x);
          const h = Math.abs(selectionBox.current.y - selectionBox.start.y);
          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
          ctx.restore();
      }

  }, [elements, currentElement, selectedElementIds, selectionBox]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    const updateSize = () => {
        const dpr = window.devicePixelRatio || 1;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.width = container.clientWidth * dpr;
        canvas.height = container.clientHeight * dpr;
        redraw();
    };

    updateSize();
    const resizeObserver = new ResizeObserver(() => updateSize());
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

  const commitText = () => {
      if (textInput && textInput.text.trim()) {
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
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
      if (textInput) {
          commitText();
          return;
      }

      const { x, y } = getPointerPos(e);

      // SELECTION TOOL LOGIC
      if (tool === 'selection') {
          // Find hit element (reverse iterate for z-order)
          let clickedId: string | null = null;
          for (let i = elements.length - 1; i >= 0; i--) {
              if (isPointInElement(x, y, elements[i])) {
                  clickedId = elements[i].id;
                  break;
              }
          }
          
          if (clickedId) {
              // If we clicked an item NOT in current selection, replace selection
              // (Standard behavior: clicking an item selects it. Clicking an already selected group keeps group.)
              if (!selectedElementIds.has(clickedId)) {
                  setSelectedElementIds(new Set([clickedId]));
              }
              
              setIsDragging(true);
              setDragStart({ x, y });
          } else {
              // Clicked empty space: Clear selection and start rubber band
              setSelectedElementIds(new Set());
              setSelectionBox({ start: { x, y }, current: { x, y } });
          }
          return;
      }

      // TEXT TOOL LOGIC
      if (tool === 'text') {
          setTextInput({ x, y, text: '' });
          return;
      }

      // DRAWING TOOL LOGIC
      setIsDrawing(true);
      setSelectedElementIds(new Set()); // Clear selection when drawing

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
      const { x, y } = getPointerPos(e);

      // DRAGGING SELECTION
      if (isDragging && selectedElementIds.size > 0 && dragStart) {
          const dx = x - dragStart.x;
          const dy = y - dragStart.y;
          setDragStart({ x, y }); // Update drag anchor

          setElements(prev => prev.map(el => {
              if (selectedElementIds.has(el.id)) {
                  const newEl = { ...el, x: el.x + dx, y: el.y + dy };
                  if (el.points) {
                      newEl.points = el.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                  }
                  return newEl;
              }
              return el;
          }));
          return;
      }

      // RUBBER BAND SELECTION
      if (selectionBox) {
          setSelectionBox(prev => prev ? { ...prev, current: { x, y } } : null);
          return;
      }

      // DRAWING
      if (!isDrawing || !currentElement) return;

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
      // FINISH DRAG
      if (isDragging) {
          setIsDragging(false);
          setDragStart(null);
          saveHistory(elements);
          return;
      }

      // FINISH SELECTION BOX
      if (selectionBox) {
          const sb = selectionBox;
          const x1 = Math.min(sb.start.x, sb.current.x);
          const x2 = Math.max(sb.start.x, sb.current.x);
          const y1 = Math.min(sb.start.y, sb.current.y);
          const y2 = Math.max(sb.start.y, sb.current.y);

          const newSelection = new Set<string>();
          
          elements.forEach(el => {
              const b = getElementBounds(el);
              // Check intersection of two rectangles
              // Box1 (Selection): x1, y1, x2, y2
              // Box2 (Element): b.minX, b.minY, b.maxX, b.maxY
              // If they don't NOT intersect, they intersect
              if (!(x2 < b.minX || x1 > b.maxX || y2 < b.minY || y1 > b.maxY)) {
                  newSelection.add(el.id);
              }
          });
          
          setSelectedElementIds(newSelection);
          setSelectionBox(null);
          return;
      }

      // FINISH DRAWING
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
          setTextInput(null);
          setSelectedElementIds(new Set());
      }
  };

  const handleDeleteSelected = () => {
      if (selectedElementIds.size > 0) {
          const nextElements = elements.filter(el => !selectedElementIds.has(el.id));
          setElements(nextElements);
          saveHistory(nextElements);
          setSelectedElementIds(new Set());
      }
  };

  // Calculate selection bounds for UI placement
  const getSelectionBounds = () => {
      if (selectedElementIds.size === 0) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      elements.forEach(el => {
          if (selectedElementIds.has(el.id)) {
              const b = getElementBounds(el);
              if (b.minX < minX) minX = b.minX;
              if (b.minY < minY) minY = b.minY;
              if (b.maxX > maxX) maxX = b.maxX;
              if (b.maxY > maxY) maxY = b.maxY;
          }
      });
      
      if (minX === Infinity) return null;
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  };

  const selBounds = getSelectionBounds();

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
              { id: 'selection', icon: MousePointer, label: 'Select & Move' },
              { id: 'pencil', icon: Pencil, label: 'Draw' },
              { id: 'rectangle', icon: Square, label: 'Box' },
              { id: 'circle', icon: Circle, label: 'Circle' },
              { id: 'line', icon: Minus, label: 'Line' },
              { id: 'text', icon: Type, label: 'Text' },
              { id: 'eraser', icon: Eraser, label: 'Erase' },
          ].map((t) => (
              <button
                  key={t.id}
                  onClick={() => {
                      setTool(t.id as ToolType);
                      if (t.id !== 'selection') setSelectedElementIds(new Set());
                  }}
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
                      background: 'rgba(30, 41, 59, 0.9)', 
                      border: '1px dashed #6366f1',
                      outline: 'none',
                      minWidth: '100px',
                      padding: '4px',
                      borderRadius: '4px',
                      zIndex: 50,
                      boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                  }}
                  value={textInput.text}
                  onChange={(e) => setTextInput({ ...textInput, text: e.target.value })}
                  onKeyDown={(e) => {
                      if (e.key === 'Enter') commitText(); 
                  }}
                  onBlur={commitText} 
                  placeholder="Type..."
              />
          )}

          {/* Floating Action Bar for Selection */}
          {selectedElementIds.size > 0 && !isDragging && !selectionBox && selBounds && (
              <div 
                  className="absolute z-40 bg-slate-800 border border-slate-700 rounded-lg p-1 flex gap-1 shadow-xl animate-fade-in"
                  style={{
                      left: selBounds.x,
                      top: selBounds.y - 45
                  }}
              >
                  <button onClick={handleDeleteSelected} className="p-1.5 hover:bg-red-900/30 text-red-400 rounded transition-colors" title="Delete Selection">
                      <Trash2 size={14} />
                  </button>
                  <div className="w-px bg-slate-700 mx-1"></div>
                  <div className="px-2 flex items-center text-xs text-slate-400">
                      {selectedElementIds.size} selected
                  </div>
              </div>
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
