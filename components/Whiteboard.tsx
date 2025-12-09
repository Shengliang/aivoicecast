
import React, { useState, useEffect, useRef } from 'react';
import { saveWhiteboardSession, subscribeToWhiteboard } from '../services/firestoreService';
import { ArrowLeft, Save, Share2, Trash2, Undo, Redo, PenTool, Eraser } from 'lucide-react';
import { auth } from '../services/firebaseConfig';

interface WhiteboardProps {
  onBack: () => void;
  sessionId?: string;
}

interface DrawElement {
  points: { x: number, y: number }[];
  color: string;
  size: number;
  tool: 'pen' | 'eraser';
}

export const Whiteboard: React.FC<WhiteboardProps> = ({ onBack, sessionId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elements, setElements] = useState<DrawElement[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<DrawElement | null>(null);
  
  // Tools
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState('#ffffff');
  const [size, setSize] = useState(3);
  
  // Session
  const [isSharedSession, setIsSharedSession] = useState(false);
  
  useEffect(() => {
      if (sessionId) {
          setIsSharedSession(true);
          const unsubscribe = subscribeToWhiteboard(sessionId, (remoteElements) => {
              if (remoteElements) {
                  setElements(remoteElements);
                  redraw(remoteElements);
              }
          });
          return () => unsubscribe();
      }
  }, [sessionId]);

  const redraw = (els: DrawElement[]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0f172a'; // slate-950
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw all elements
      els.forEach(el => drawElement(ctx, el));
  };

  const drawElement = (ctx: CanvasRenderingContext2D, el: DrawElement) => {
      if (el.points.length < 2) return;
      
      ctx.beginPath();
      ctx.moveTo(el.points[0].x, el.points[0].y);
      for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i].x, el.points[i].y);
      }
      
      ctx.strokeStyle = el.tool === 'eraser' ? '#0f172a' : el.color;
      ctx.lineWidth = el.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
  };

  // Initial setup & resize
  useEffect(() => {
      const canvas = canvasRef.current;
      if (canvas) {
          const resize = () => {
              canvas.width = window.innerWidth;
              canvas.height = window.innerHeight - 64; // Adjust for header
              redraw(elements);
          };
          window.addEventListener('resize', resize);
          resize();
          return () => window.removeEventListener('resize', resize);
      }
  }, [elements]); // Re-run when elements change to keep drawing

  const getPointerPos = (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      
      let clientX, clientY;
      if ('touches' in e) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
      } else {
          clientX = (e as React.MouseEvent).clientX;
          clientY = (e as React.MouseEvent).clientY;
      }
      
      return {
          x: clientX - rect.left,
          y: clientY - rect.top
      };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault(); // Prevent scrolling on touch
      const { x, y } = getPointerPos(e);
      setIsDrawing(true);
      setCurrentPath({
          points: [{ x, y }],
          color,
          size,
          tool
      });
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing || !currentPath) return;
      e.preventDefault();
      
      const { x, y } = getPointerPos(e);
      const newPath = { ...currentPath, points: [...currentPath.points, { x, y }] };
      setCurrentPath(newPath);
      
      // Draw live
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) drawElement(ctx, newPath);
  };

  const endDrawing = async () => {
      if (!isDrawing || !currentPath) return;
      setIsDrawing(false);
      
      const newElements = [...elements, currentPath];
      setElements(newElements);
      setCurrentPath(null);
      
      // Auto-save if shared (Don't set ownerId on update to avoid permission errors)
      if (isSharedSession && sessionId) {
          await saveWhiteboardSession(sessionId, newElements);
      }
  };

  const handleShare = async () => {
      // Align ID generation with CodeStudio (UUID) for consistency
      const boardId = sessionId || crypto.randomUUID();
      const currentUser = auth.currentUser;
      
      try {
        try {
            // Save current state. Pass current user as owner if creating new.
            await saveWhiteboardSession(boardId, elements, !sessionId && currentUser ? currentUser.uid : undefined);
        } catch (err: any) {
             if (err.code === 'permission-denied' || err.message?.includes('permission')) {
                 // Fork logic: Create NEW board if user doesn't have permission to write to this one
                 const newId = crypto.randomUUID();
                 await saveWhiteboardSession(newId, elements, currentUser ? currentUser.uid : undefined);
                 
                 const url = new URL(window.location.href);
                 url.searchParams.set('whiteboard_session', newId);
                 await navigator.clipboard.writeText(url.toString());
                 alert(`Shared Whiteboard Link Copied!\n\n${url.toString()}\n\n(Copied to clipboard)`);
                 setIsSharedSession(true);
                 return;
             }
             throw err;
        }
        
        const url = new URL(window.location.href);
        url.searchParams.set('whiteboard_session', boardId);
        
        await navigator.clipboard.writeText(url.toString());
        alert(`Shared Whiteboard Link Copied!\n\n${url.toString()}\n\n(Copied to clipboard)`);
        
        setIsSharedSession(true);
      } catch(e: any) {
          console.error(e);
          const msg = e.message || "Unknown error";
          alert(`Failed to share whiteboard: ${msg}. Check Firestore Rules.`);
      }
  };

  const handleClear = () => {
      if(confirm("Clear whiteboard?")) {
          setElements([]);
          redraw([]);
          if (isSharedSession && sessionId) saveWhiteboardSession(sessionId, []);
      }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900 shrink-0 z-10">
          <div className="flex items-center space-x-4">
              <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">
                  <ArrowLeft size={20} />
              </button>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  <PenTool className="text-pink-400"/>
                  Whiteboard
              </h1>
          </div>
          
          <div className="flex items-center gap-4">
              {/* Tool Selector */}
              <div className="flex items-center bg-slate-800 rounded-lg p-1">
                  <button 
                      onClick={() => setTool('pen')}
                      className={`p-2 rounded ${tool === 'pen' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                      title="Pen"
                  >
                      <PenTool size={18}/>
                  </button>
                  <button 
                      onClick={() => setTool('eraser')}
                      className={`p-2 rounded ${tool === 'eraser' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                      title="Eraser"
                  >
                      <Eraser size={18}/>
                  </button>
              </div>

              {/* Colors */}
              <div className="flex gap-2">
                  {['#ffffff', '#ef4444', '#22c55e', '#3b82f6', '#eab308'].map(c => (
                      <button 
                          key={c}
                          onClick={() => setColor(c)}
                          className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-white scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: c }}
                      />
                  ))}
              </div>

              <div className="h-6 w-px bg-slate-800 mx-2"></div>

              <button onClick={handleShare} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm font-bold text-white">
                  <Share2 size={14}/> {isSharedSession ? 'Share' : 'Start Session'}
              </button>
              <button onClick={handleClear} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400">
                  <Trash2 size={18}/>
              </button>
          </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative cursor-crosshair bg-slate-950">
          <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={endDrawing}
              onMouseLeave={endDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={endDrawing}
              className="absolute inset-0 block touch-none"
          />
          {!sessionId && elements.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-700 select-none">
                  <p className="text-xl font-bold">Start Drawing...</p>
              </div>
          )}
      </div>
    </div>
  );
};
