
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Share2, Trash2, Undo, PenTool, Eraser, Download, Square, Circle, Minus, ArrowRight, Type, ZoomIn, ZoomOut, MousePointer2 } from 'lucide-react';
import { auth } from '../services/firebaseConfig';
import { saveWhiteboardSession, subscribeToWhiteboard } from '../services/firestoreService';

interface WhiteboardProps {
  onBack: () => void;
  sessionId?: string;
}

type ToolType = 'pen' | 'eraser' | 'rect' | 'circle' | 'line' | 'arrow' | 'text' | 'pan';

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
      if (tool === 'pan') {
          setIsPanning(true);
          const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
          const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
          lastPanPoint.current = { x: clientX, y: clientY };
          return;
      }

      const { x, y } = getWorldCoordinates(e);

      if (tool === 'text') {
          const id = crypto.randomUUID();
          setTextInput({ id, x, y, text: '' });
          return;
      }

      setIsDrawing(true);
      
      const id = crypto.randomUUID();
      const newEl: WhiteboardElement = {
          id,
          type: tool,
          x, y,
          color: tool === 'eraser' ? '#0f172a' : color,
          strokeWidth: tool === 'eraser' ? 20 : lineWidth,
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

      if (!isDrawing || !currentElement) return;
      const { x, y } = getWorldCoordinates(e);

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
          ctx.lineWidth = el.strokeWidth / scale; // Keep line width consistent visually or scale it? Keeping it logical usually better.
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

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
              // Ellipse drawing
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
              drawArrowHead(ctx, el.x, el.y, ex, ey, el.color);
          } else if (el.type === 'text' && el.text) {
              ctx.font = `${20}px sans-serif`;
              ctx.fillStyle = el.color;
              ctx.fillText(el.text, el.x, el.y);
          }
      };

      // Draw saved elements
      elements.forEach(renderElement);
      // Draw active element
      if (currentElement) renderElement(currentElement);

      ctx.restore();

  }, [elements, currentElement, scale, offset]);

  // Handle Text Input Completion
  const handleTextComplete = () => {
      if (textInput && textInput.text.trim()) {
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
      setTool('pen'); // Reset to pen after typing
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

  // Keyboard shortcut for Undo (Ctrl+Z)
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
              setElements(prev => prev.slice(0, -1));
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
                <button onClick={() => setTool('pan')} className={`p-2 rounded ${tool === 'pan' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Pan">
                    <MousePointer2 size={18}/>
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
                <button onClick={handleClear} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400" title="Clear All">
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
                style={{ cursor: tool === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'crosshair' }}
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
                        top: textInput.y * scale + offset.y - 12, // adjust for font height
                        fontSize: `${20 * scale}px`,
                        color: color,
                        background: 'transparent',
                        border: '1px dashed #64748b',
                        outline: 'none',
                        minWidth: '100px',
                        overflow: 'hidden',
                        resize: 'none',
                        fontFamily: 'sans-serif'
                    }}
                    placeholder="Type here..."
                />
            )}
        </div>
    </div>
  );
};
