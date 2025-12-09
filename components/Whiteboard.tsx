
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Share2, Trash2, Undo, PenTool, Eraser, Download, Square, Circle, Minus, ArrowRight, Type, ZoomIn, ZoomOut, MousePointer2, MoreHorizontal, Move } from 'lucide-react';
import { auth } from '../services/firebaseConfig';
import { saveWhiteboardSession, subscribeToWhiteboard } from '../services/firestoreService';

interface WhiteboardProps {
  onBack: () => void;
  sessionId?: string;
}

type ToolType = 'select' | 'pen' | 'eraser' | 'rect' | 'circle' | 'line' | 'arrow' | 'text' | 'pan';
type LineStyle = 'solid' | 'dashed' | 'dotted';

interface WhiteboardElement {
  id: string;
  type: ToolType;
  points?: { x: number; y: number }[]; // For pen
  x: number;
  y: number;
  width?: number;
  height?: number;
  endX?: number; // For line/arrow
  endY?: number;
  text?: string;
  color: string;
  strokeWidth: number;
  lineStyle?: LineStyle;
}

export const Whiteboard: React.FC<WhiteboardProps> = ({ onBack, sessionId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elements, setElements] = useState<WhiteboardElement[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentElement, setCurrentElement] = useState<WhiteboardElement | null>(null);
  
  // Tool State
  const [tool, setTool] = useState<ToolType>('pen');
  const [color, setColor] = useState('#ffffff');
  const [lineWidth, setLineWidth] = useState(3);
  const [lineStyle, setLineStyle] = useState<LineStyle>('solid');
  
  // Selection State
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const dragStartPos = useRef<{x: number, y: number} | null>(null);
  const initialElementState = useRef<WhiteboardElement | null>(null);

  // Viewport State
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPoint = useRef({ x: 0, y: 0 });
  
  // Shared Session
  const [isSharedSession, setIsSharedSession] = useState(!!sessionId);
  const currentSessionIdRef = useRef<string>(sessionId || crypto.randomUUID());

  // Text Input State
  const [textInput, setTextInput] = useState<{ id: string; x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    if (sessionId) {
        setIsSharedSession(true);
        currentSessionIdRef.current = sessionId;
        const unsubscribe = subscribeToWhiteboard(sessionId, (remoteElements) => {
            if (remoteElements) {
                setElements(remoteElements);
            }
        });
        return () => unsubscribe();
    }
  }, [sessionId]);

  // Auto-save for shared sessions
  useEffect(() => {
      if (isSharedSession) {
          const timeout = setTimeout(() => {
              saveWhiteboardSession(currentSessionIdRef.current, elements);
          }, 1000);
          return () => clearTimeout(timeout);
      }
  }, [elements, isSharedSession]);

  // Hit Test Logic
  const isPointInElement = (x: number, y: number, el: WhiteboardElement): boolean => {
      const tolerance = 10 / scale;
      
      switch (el.type) {
          case 'rect':
              return x >= el.x && x <= el.x + (el.width || 0) && y >= el.y && y <= el.y + (el.height || 0);
          case 'circle': {
              const rx = Math.abs(el.width || 0) / 2;
              const ry = Math.abs(el.height || 0) / 2;
              const cx = el.x + (el.width || 0) / 2;
              const cy = el.y + (el.height || 0) / 2;
              // Check if point is inside ellipse
              const normX = (x - cx) / rx;
              const normY = (y - cy) / ry;
              return (normX * normX + normY * normY) <= 1;
          }
          case 'line':
          case 'arrow': {
              const x1 = el.x, y1 = el.y;
              const x2 = el.endX || x1, y2 = el.endY || y1;
              // Distance from point to line segment
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
              return (dx * dx + dy * dy) < tolerance * tolerance;
          }
          case 'pen':
          case 'eraser': {
              if (!el.points) return false;
              // Simple bounding box check first
              const minX = Math.min(...el.points.map(p => p.x)) - tolerance;
              const maxX = Math.max(...el.points.map(p => p.x)) + tolerance;
              const minY = Math.min(...el.points.map(p => p.y)) - tolerance;
              const maxY = Math.max(...el.points.map(p => p.y)) + tolerance;
              
              if (x < minX || x > maxX || y < minY || y > maxY) return false;
              
              // Precise point check
              return el.points.some(p => {
                  const dist = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2);
                  return dist < tolerance;
              });
          }
          case 'text':
              // Approx check for text
              const w = (el.text?.length || 5) * 12; // Rough char width
              const h = 24;
              return x >= el.x && x <= el.x + w && y >= el.y - h && y <= el.y;
          default:
              return false;
      }
  };

  // Coordinate Conversion (Screen -> Canvas World)
  const getWorldCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
      if (!canvasRef.current) return { x: 0, y: 0 };
      const rect = canvasRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      
      return {
          x: (clientX - rect.left - offset.x) / scale,
          y: (clientY - rect.top - offset.y) / scale
      };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
      // If we are currently editing text, committing it is handled by blur or keydown.
      // We don't want to start a new shape if we just clicked the textarea.
      // But e.target would be the canvas here.
      if (textInput) {
          handleTextComplete();
          return;
      }

      if (tool === 'pan') {
          setIsPanning(true);
          const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
          const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
          lastPanPoint.current = { x: clientX, y: clientY };
          return;
      }

      const { x, y } = getWorldCoordinates(e);

      if (tool === 'select') {
          // Find top-most element that contains point
          // Iterate backwards to hit the one rendered on top
          let hitId = null;
          for (let i = elements.length - 1; i >= 0; i--) {
              if (isPointInElement(x, y, elements[i])) {
                  hitId = elements[i].id;
                  break;
              }
          }
          
          setSelectedId(hitId);
          if (hitId) {
              setIsDraggingSelection(true);
              dragStartPos.current = { x, y };
              initialElementState.current = JSON.parse(JSON.stringify(elements.find(el => el.id === hitId)));
          }
          return;
      }

      if (tool === 'text') {
          const id = crypto.randomUUID();
          setTextInput({ id, x, y, text: '' });
          return;
      }

      setIsDrawing(true);
      setSelectedId(null); // Deselect when drawing
      
      const id = crypto.randomUUID();
      const newEl: WhiteboardElement = {
          id,
          type: tool,
          x, y,
          color: tool === 'eraser' ? '#0f172a' : color,
          strokeWidth: tool === 'eraser' ? 20 : lineWidth,
          lineStyle: tool === 'eraser' ? 'solid' : lineStyle,
          points: tool === 'pen' || tool === 'eraser' ? [{ x, y }] : undefined,
          width: 0, height: 0,
          endX: x, endY: y
      };
      
      setCurrentElement(newEl);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
      if (isPanning) {
          const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
          const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
          const dx = clientX - lastPanPoint.current.x;
          const dy = clientY - lastPanPoint.current.y;
          setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
          lastPanPoint.current = { x: clientX, y: clientY };
          return;
      }

      const { x, y } = getWorldCoordinates(e);

      if (isDraggingSelection && selectedId && dragStartPos.current && initialElementState.current) {
          const dx = x - dragStartPos.current.x;
          const dy = y - dragStartPos.current.y;
          
          setElements(prev => prev.map(el => {
              if (el.id !== selectedId) return el;
              const init = initialElementState.current!;
              
              const newEl = { ...el };
              newEl.x = init.x + dx;
              newEl.y = init.y + dy;
              
              if (init.type === 'line' || init.type === 'arrow') {
                  newEl.endX = (init.endX || 0) + dx;
                  newEl.endY = (init.endY || 0) + dy;
              } else if (init.type === 'pen' || init.type === 'eraser') {
                  newEl.points = init.points?.map(p => ({
                      x: p.x + dx,
                      y: p.y + dy
                  }));
              }
              
              return newEl;
          }));
          return;
      }

      if (!isDrawing || !currentElement) return;

      if (tool === 'pen' || tool === 'eraser') {
          setCurrentElement(prev => prev ? ({
              ...prev,
              points: [...(prev.points || []), { x, y }]
          }) : null);
      } else if (tool === 'rect' || tool === 'circle') {
          setCurrentElement(prev => prev ? ({
              ...prev,
              width: x - prev.x,
              height: y - prev.y
          }) : null);
      } else if (tool === 'line' || tool === 'arrow') {
          setCurrentElement(prev => prev ? ({
              ...prev,
              endX: x,
              endY: y
          }) : null);
      }
  };

  const stopDrawing = () => {
      if (isPanning) {
          setIsPanning(false);
          return;
      }
      if (isDraggingSelection) {
          setIsDraggingSelection(false);
          dragStartPos.current = null;
          initialElementState.current = null;
          return;
      }
      if (isDrawing && currentElement) {
          setElements(prev => [...prev, currentElement]);
          setCurrentElement(null);
          setIsDrawing(false);
      }
  };

  // Helper: Draw Arrow Head
  const drawArrowHead = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, color: string) => {
      const headLength = 15;
      const angle = Math.atan2(toY - fromY, toX - fromX);
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
      ctx.lineTo(toX, toY);
      ctx.fillStyle = color;
      ctx.fill();
  };

  // Render Canvas
  useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Handle resize
      canvas.width = canvas.parentElement?.clientWidth || 800;
      canvas.height = canvas.parentElement?.clientHeight || 600;

      // Clear & Transform
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0f172a'; // Background
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.save();
      ctx.translate(offset.x, offset.y);
      ctx.scale(scale, scale);

      const renderElement = (el: WhiteboardElement) => {
          ctx.beginPath();
          ctx.strokeStyle = el.color;
          ctx.lineWidth = el.strokeWidth / scale;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          // Line Style
          if (el.lineStyle === 'dashed') ctx.setLineDash([10, 10]);
          else if (el.lineStyle === 'dotted') ctx.setLineDash([3, 5]);
          else ctx.setLineDash([]);

          if (el.type === 'pen' || el.type === 'eraser') {
              if (el.points && el.points.length > 0) {
                  ctx.moveTo(el.points[0].x, el.points[0].y);
                  for (let i = 1; i < el.points.length; i++) {
                      ctx.lineTo(el.points[i].x, el.points[i].y);
                  }
                  ctx.stroke();
              }
          } else if (el.type === 'rect') {
              ctx.strokeRect(el.x, el.y, el.width || 0, el.height || 0);
          } else if (el.type === 'circle') {
              const w = el.width || 0;
              const h = el.height || 0;
              const centerX = el.x + w / 2;
              const centerY = el.y + h / 2;
              ctx.ellipse(centerX, centerY, Math.abs(w / 2), Math.abs(h / 2), 0, 0, 2 * Math.PI);
              ctx.stroke();
          } else if (el.type === 'line') {
              ctx.moveTo(el.x, el.y);
              ctx.lineTo(el.endX || el.x, el.endY || el.y);
              ctx.stroke();
          } else if (el.type === 'arrow') {
              const ex = el.endX || el.x;
              const ey = el.endY || el.y;
              ctx.moveTo(el.x, el.y);
              ctx.lineTo(ex, ey);
              ctx.stroke();
              ctx.setLineDash([]); // Arrowhead always solid
              drawArrowHead(ctx, el.x, el.y, ex, ey, el.color);
          } else if (el.type === 'text' && el.text) {
              ctx.font = `${20}px sans-serif`;
              ctx.fillStyle = el.color;
              ctx.fillText(el.text, el.x, el.y);
          }

          // Render Selection Highlight
          if (selectedId === el.id) {
              ctx.setLineDash([5, 5]);
              ctx.strokeStyle = '#3b82f6'; // Blue selection
              ctx.lineWidth = 1 / scale;
              const padding = 5;
              
              if (el.type === 'rect' || el.type === 'circle') {
                  ctx.strokeRect(
                      Math.min(el.x, el.x + (el.width||0)) - padding, 
                      Math.min(el.y, el.y + (el.height||0)) - padding, 
                      Math.abs(el.width||0) + padding*2, 
                      Math.abs(el.height||0) + padding*2
                  );
              } else if (el.type === 'line' || el.type === 'arrow') {
                  // Rough bounding box for line
                  const minX = Math.min(el.x, el.endX || el.x);
                  const maxX = Math.max(el.x, el.endX || el.x);
                  const minY = Math.min(el.y, el.endY || el.y);
                  const maxY = Math.max(el.y, el.endY || el.y);
                  ctx.strokeRect(minX - padding, minY - padding, maxX - minX + padding*2, maxY - minY + padding*2);
              } else if (el.type === 'text') {
                  const width = ctx.measureText(el.text || '').width;
                  ctx.strokeRect(el.x - padding, el.y - 20 - padding, width + padding*2, 30 + padding*2);
              } else if (el.type === 'pen' || el.type === 'eraser') {
                  if (el.points) {
                      const minX = Math.min(...el.points.map(p => p.x));
                      const maxX = Math.max(...el.points.map(p => p.x));
                      const minY = Math.min(...el.points.map(p => p.y));
                      const maxY = Math.max(...el.points.map(p => p.y));
                      ctx.strokeRect(minX - padding, minY - padding, maxX - minX + padding*2, maxY - minY + padding*2);
                  }
              }
          }
      };

      // Draw saved elements
      elements.forEach(renderElement);
      // Draw active element
      if (currentElement) renderElement(currentElement);

      ctx.restore();

  }, [elements, currentElement, scale, offset, selectedId]);

  // Handle Text Input Completion
  const handleTextComplete = () => {
      if (textInput) {
          if (textInput.text.trim()) {
              const newEl: WhiteboardElement = {
                  id: textInput.id,
                  type: 'text',
                  x: textInput.x,
                  y: textInput.y,
                  text: textInput.text,
                  color: color,
                  strokeWidth: 1
              };
              setElements(prev => [...prev, newEl]);
          }
          setTextInput(null);
          setTool('select'); // Switch to select after typing for better UX
      }
  };

  const handleShare = async () => {
      if (!auth.currentUser) {
          alert("Please sign in to share.");
          return;
      }
      const boardId = currentSessionIdRef.current;
      
      try {
        await saveWhiteboardSession(boardId, elements);
        
        const url = new URL(window.location.href);
        url.searchParams.set('whiteboard_session', boardId);
        const link = url.toString();
        
        await navigator.clipboard.writeText(link);
        alert(`Shared Whiteboard Link Copied!\n\nLink: ${link}\n\nSend this to friends to collaborate in real-time.`);
        
        setIsSharedSession(true);
      } catch(e: any) {
          console.error(e);
          alert(`Failed to share: ${e.message}`);
      }
  };

  const handleClear = () => {
      if(confirm("Clear whiteboard?")) setElements([]);
  };

  const handleDeleteSelected = () => {
      if (selectedId) {
          setElements(prev => prev.filter(el => el.id !== selectedId));
          setSelectedId(null);
      }
  };

  const handleDownload = () => {
      const canvas = canvasRef.current;
      if(canvas) {
          const url = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = url;
          a.download = 'whiteboard.png';
          a.click();
      }
  };

  // Keyboard shortcut for Undo (Ctrl+Z) and Delete
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
              setElements(prev => prev.slice(0, -1));
          }
          if (e.key === 'Delete' || e.key === 'Backspace') {
              if (selectedId && !textInput) {
                  setElements(prev => prev.filter(el => el.id !== selectedId));
                  setSelectedId(null);
              }
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, textInput]);

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900 shrink-0 z-10">
            <div className="flex items-center gap-4">
                <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                    <PenTool className="text-pink-400" /> 
                    Whiteboard
                    {isSharedSession && <span className="text-xs bg-indigo-600 px-2 py-0.5 rounded text-white animate-pulse">LIVE</span>}
                </h1>
            </div>
            
            <div className="flex items-center gap-2">
                <div className="flex bg-slate-800 rounded-lg p-1 mr-4">
                    <button onClick={() => setScale(s => Math.min(s + 0.1, 3))} className="p-2 hover:bg-slate-700 rounded text-slate-400"><ZoomIn size={18}/></button>
                    <span className="text-xs flex items-center px-2 text-slate-400 font-mono">{Math.round(scale * 100)}%</span>
                    <button onClick={() => setScale(s => Math.max(s - 0.1, 0.5))} className="p-2 hover:bg-slate-700 rounded text-slate-400"><ZoomOut size={18}/></button>
                </div>

                <button onClick={handleDownload} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300" title="Download Image">
                    <Download size={18} />
                </button>
                <button onClick={handleShare} className={`p-2 rounded-lg text-white font-bold flex items-center gap-2 ${isSharedSession ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-slate-700 hover:bg-slate-600'}`}>
                    <Share2 size={18} />
                    <span className="hidden sm:inline">{isSharedSession ? 'Copy Link' : 'Share'}</span>
                </button>
            </div>
        </div>

        {/* Toolbar */}
        <div className="bg-slate-900 border-b border-slate-800 p-2 flex flex-wrap justify-center gap-4 shrink-0 z-10">
            <div className="flex bg-slate-800 rounded-lg p-1">
                <button onClick={() => { setTool('select'); setIsDrawing(false); }} className={`p-2 rounded ${tool === 'select' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Select & Move (v)">
                    <MousePointer2 size={18}/>
                </button>
                <button onClick={() => setTool('pan')} className={`p-2 rounded ${tool === 'pan' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Pan (Space)">
                    <Move size={18}/>
                </button>
                <div className="w-px bg-slate-700 mx-1"></div>
                <button onClick={() => setTool('pen')} className={`p-2 rounded ${tool === 'pen' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Pen">
                    <PenTool size={18}/>
                </button>
                <button onClick={() => setTool('eraser')} className={`p-2 rounded ${tool === 'eraser' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Eraser">
                    <Eraser size={18}/>
                </button>
                <button onClick={() => setTool('text')} className={`p-2 rounded ${tool === 'text' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Text">
                    <Type size={18}/>
                </button>
                <div className="w-px bg-slate-700 mx-1"></div>
                <button onClick={() => setTool('rect')} className={`p-2 rounded ${tool === 'rect' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Rectangle">
                    <Square size={18}/>
                </button>
                <button onClick={() => setTool('circle')} className={`p-2 rounded ${tool === 'circle' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Circle">
                    <Circle size={18}/>
                </button>
                <button onClick={() => setTool('line')} className={`p-2 rounded ${tool === 'line' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Line">
                    <Minus size={18}/>
                </button>
                <button onClick={() => setTool('arrow')} className={`p-2 rounded ${tool === 'arrow' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Arrow">
                    <ArrowRight size={18}/>
                </button>
            </div>
            
            {/* Line Options */}
            <div className="flex bg-slate-800 rounded-lg p-1">
                <button onClick={() => setLineStyle('solid')} className={`p-2 rounded text-xs font-mono ${lineStyle === 'solid' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>────</button>
                <button onClick={() => setLineStyle('dashed')} className={`p-2 rounded text-xs font-mono ${lineStyle === 'dashed' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>- - -</button>
                <button onClick={() => setLineStyle('dotted')} className={`p-2 rounded text-xs font-mono ${lineStyle === 'dotted' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>····</button>
            </div>

            <div className="flex items-center gap-2 px-2 bg-slate-800 rounded-lg">
                <input 
                    type="range" min="1" max="20" 
                    value={lineWidth} onChange={(e) => setLineWidth(parseInt(e.target.value))}
                    className="w-20 accent-indigo-500"
                    title="Stroke Width"
                />
            </div>

            <div className="flex items-center gap-2 px-2 bg-slate-800 rounded-lg">
                {['#ffffff', '#ef4444', '#22c55e', '#3b82f6', '#eab308', '#ec4899'].map(c => (
                    <button 
                        key={c}
                        onClick={() => { setColor(c); if(tool==='eraser') setTool('pen'); }}
                        className={`w-5 h-5 rounded-full border ${color === c && tool !== 'eraser' ? 'border-white scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                    />
                ))}
            </div>

            <div className="flex gap-1">
                <button onClick={() => setElements(prev => prev.slice(0, -1))} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="Undo (Ctrl+Z)">
                    <Undo size={18} />
                </button>
                <button onClick={selectedId ? handleDeleteSelected : handleClear} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400" title={selectedId ? "Delete Selected (Del)" : "Clear All"}>
                    <Trash2 size={18} />
                </button>
            </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 relative overflow-hidden bg-slate-950 touch-none cursor-crosshair">
            <canvas 
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="block w-full h-full"
                style={{ cursor: tool === 'pan' ? (isPanning ? 'grabbing' : 'grab') : tool === 'select' ? 'default' : 'crosshair' }}
            />
            
            {/* Text Input Overlay */}
            {textInput && (
                <textarea
                    autoFocus
                    value={textInput.text}
                    onChange={(e) => setTextInput(prev => prev ? ({ ...prev, text: e.target.value }) : null)}
                    onBlur={handleTextComplete}
                    onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextComplete(); } }}
                    style={{
                        position: 'absolute',
                        left: textInput.x * scale + offset.x,
                        top: textInput.y * scale + offset.y - 12,
                        fontSize: `${20 * scale}px`,
                        color: color,
                        background: 'transparent',
                        border: '1px dashed #64748b',
                        outline: 'none',
                        minWidth: '100px',
                        overflow: 'hidden',
                        resize: 'none',
                        fontFamily: 'sans-serif',
                        zIndex: 20
                    }}
                    placeholder="Type here..."
                />
            )}
        </div>
    </div>
  );
};
