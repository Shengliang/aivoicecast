
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, Square, Circle, Minus, Type, Eraser, 
  Undo, Redo, Download, MousePointer, Pencil, Bot, 
  Loader2, X, Palette, Trash2, Maximize, Sparkles, Send, Mic, MicOff, Image as ImageIcon, Zap,
  ZoomIn, ZoomOut, Move
} from 'lucide-react';
import { GoogleGenAI, FunctionDeclaration, Type as GenAIType, SchemaType } from '@google/genai';
import { GEMINI_API_KEY } from '../services/private_keys';
import { MarkdownView } from './MarkdownView';
import { ChatMessage } from '../types';
import { GeminiLiveService } from '../services/geminiLive';

interface WhiteboardProps {
  onBack: () => void;
}

type ToolType = 'selection' | 'pencil' | 'rectangle' | 'circle' | 'line' | 'text' | 'eraser' | 'pan';

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

// --- TOOL DEFINITIONS FOR GEMINI ---
const drawTools: FunctionDeclaration[] = [
  {
    name: 'draw_rectangle',
    description: 'Draw a rectangle/box on the whiteboard. Useful for architectural nodes, servers, or containers.',
    parameters: {
      type: GenAIType.OBJECT,
      properties: {
        x: { type: GenAIType.NUMBER, description: 'X coordinate (0-1000). Center is 500.' },
        y: { type: GenAIType.NUMBER, description: 'Y coordinate (0-800). Center is 400.' },
        width: { type: GenAIType.NUMBER, description: 'Width of rectangle' },
        height: { type: GenAIType.NUMBER, description: 'Height of rectangle' },
        color: { type: GenAIType.STRING, description: 'Hex color code (e.g. #ff0000)' },
        label: { type: GenAIType.STRING, description: 'Optional text label to place inside center' }
      },
      required: ['x', 'y', 'width', 'height']
    }
  },
  {
    name: 'draw_circle',
    description: 'Draw a circle. Useful for users, databases, or start/end nodes.',
    parameters: {
      type: GenAIType.OBJECT,
      properties: {
        x: { type: GenAIType.NUMBER, description: 'X coordinate of bounding box top-left' },
        y: { type: GenAIType.NUMBER, description: 'Y coordinate of bounding box top-left' },
        diameter: { type: GenAIType.NUMBER, description: 'Diameter of the circle' },
        color: { type: GenAIType.STRING },
        label: { type: GenAIType.STRING, description: 'Optional text label to place inside center' }
      },
      required: ['x', 'y', 'diameter']
    }
  },
  {
    name: 'draw_line',
    description: 'Draw a straight line or connector arrow between points.',
    parameters: {
      type: GenAIType.OBJECT,
      properties: {
        x1: { type: GenAIType.NUMBER, description: 'Start X' },
        y1: { type: GenAIType.NUMBER, description: 'Start Y' },
        x2: { type: GenAIType.NUMBER, description: 'End X' },
        y2: { type: GenAIType.NUMBER, description: 'End Y' },
        color: { type: GenAIType.STRING }
      },
      required: ['x1', 'y1', 'x2', 'y2']
    }
  },
  {
    name: 'draw_path',
    description: 'Draw a freehand sketch, curve, or complex shape (like a person, cloud, or symbol) using a series of points.',
    parameters: {
      type: GenAIType.OBJECT,
      properties: {
        points: {
          type: GenAIType.ARRAY,
          description: 'A flat array of coordinates [x1, y1, x2, y2, x3, y3...]. Use at least 6 points for a visible curve.',
          items: { type: GenAIType.NUMBER }
        },
        color: { type: GenAIType.STRING },
        strokeWidth: { type: GenAIType.NUMBER }
      },
      required: ['points']
    }
  },
  {
    name: 'add_text',
    description: 'Write free-floating text on the whiteboard.',
    parameters: {
      type: GenAIType.OBJECT,
      properties: {
        x: { type: GenAIType.NUMBER },
        y: { type: GenAIType.NUMBER },
        text: { type: GenAIType.STRING },
        color: { type: GenAIType.STRING },
        fontSize: { type: GenAIType.NUMBER, description: 'Font size scale (1-5), default 2' }
      },
      required: ['x', 'y', 'text']
    }
  },
  {
    name: 'clear_board',
    description: 'Clear all elements from the whiteboard.',
    parameters: {
      type: GenAIType.OBJECT,
      properties: {},
    }
  }
];

export const Whiteboard: React.FC<WhiteboardProps> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null); 
  
  const [elements, setElements] = useState<DrawingElement[]>([]);
  const [history, setHistory] = useState<DrawingElement[][]>([]);
  const [historyStep, setHistoryStep] = useState(0);
  
  const [tool, setTool] = useState<ToolType>('pencil');
  const [color, setColor] = useState('#ffffff');
  const [strokeWidth, setStrokeWidth] = useState(2);
  
  // Viewport State (Zoom & Pan)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  
  // Interaction State
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentElement, setCurrentElement] = useState<DrawingElement | null>(null);
  const [textInput, setTextInput] = useState<{x: number, y: number, text: string} | null>(null);
  
  // Selection / Dragging State
  const [selectedElementIds, setSelectedElementIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [isPanning, setIsPanning] = useState(false); // For middle click or pan tool
  const [panStart, setPanStart] = useState<Point | null>(null);
  const [selectionBox, setSelectionBox] = useState<{start: Point, current: Point} | null>(null);

  // AI Assistant State
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  
  // LIVE MODE STATE
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [liveStatus, setLiveStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'speaking'>('disconnected');
  const liveServiceRef = useRef<GeminiLiveService | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

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
      const padding = 10 / zoom; // Adjust padding based on zoom
      const b = getElementBounds(el);
      
      if (x < b.minX - padding || x > b.maxX + padding || y < b.minY - padding || y > b.maxY + padding) {
          return false;
      }

      if (el.type === 'line') {
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
          return el.points ? el.points.some(p => Math.abs(p.x - x) < padding && Math.abs(p.y - y) < padding) : false;
      }
      
      return true;
  };

  // Rendering Loop
  const redraw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;

      // Reset transform to clear full canvas
      ctx.setTransform(1, 0, 0, 1, 0, 0); 
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Apply Zoom & Pan Transform
      // Order: Scale (DPR) -> Translate (Pan) -> Scale (Zoom)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

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
              ctx.lineWidth = 1 / zoom; // Keep outline sharp
              ctx.setLineDash([5 / zoom, 5 / zoom]);
              const padding = 5 / zoom;
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
          ctx.lineWidth = 1 / zoom;
          const x = Math.min(selectionBox.start.x, selectionBox.current.x);
          const y = Math.min(selectionBox.start.y, selectionBox.current.y);
          const w = Math.abs(selectionBox.current.x - selectionBox.start.x);
          const h = Math.abs(selectionBox.current.y - selectionBox.start.y);
          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
          ctx.restore();
      }

  }, [elements, currentElement, selectedElementIds, selectionBox, zoom, pan]);

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

  // Scroll chat
  useEffect(() => {
      if (isAssistantOpen) {
          chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
  }, [chatHistory, isAssistantOpen]);

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

      // Convert Screen Coordinates to World Coordinates (accounting for Zoom & Pan)
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;
      
      return {
          x: (screenX - pan.x) / zoom,
          y: (screenY - pan.y) / zoom
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
      const { x, y } = getPointerPos(e);

      // Handle Pan Tool or Middle Mouse Click
      if (tool === 'pan' || ('button' in e && e.button === 1)) {
          setIsPanning(true);
          // Store screen coordinates for panning delta
          const canvas = canvasRef.current;
          if (canvas) {
              const rect = canvas.getBoundingClientRect();
              const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
              const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
              setPanStart({ x: clientX, y: clientY });
          }
          return;
      }

      if (textInput) {
          commitText();
          return;
      }

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
              if (!selectedElementIds.has(clickedId)) {
                  setSelectedElementIds(new Set([clickedId]));
              }
              
              setIsDragging(true);
              setDragStart({ x, y });
          } else {
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
      setSelectedElementIds(new Set()); 

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
      // PANNING
      if (isPanning && panStart) {
          const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
          const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
          
          const dx = clientX - panStart.x;
          const dy = clientY - panStart.y;
          
          setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
          setPanStart({ x: clientX, y: clientY });
          return;
      }

      const { x, y } = getPointerPos(e);

      // DRAGGING SELECTION
      if (isDragging && selectedElementIds.size > 0 && dragStart) {
          const dx = x - dragStart.x;
          const dy = y - dragStart.y;
          setDragStart({ x, y }); 

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
      if (isPanning) {
          setIsPanning(false);
          setPanStart(null);
          return;
      }

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
              // Check if bounds roughly intersect selection box
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

  // Zoom Controls
  const handleZoom = (direction: 'in' | 'out') => {
      setZoom(prev => {
          const newZoom = direction === 'in' ? prev * 1.2 : prev / 1.2;
          return Math.min(Math.max(newZoom, 0.1), 5); // Limit zoom range
      });
  };

  const resetView = () => {
      setZoom(1);
      setPan({ x: 0, y: 0 });
  };

  const handleDownload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tCtx = tempCanvas.getContext('2d');
      if (!tCtx) return;
      
      tCtx.fillStyle = '#0f172a'; // slate-950 background
      tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      tCtx.drawImage(canvas, 0, 0);
      
      const link = document.createElement('a');
      link.download = `whiteboard-${Date.now()}.png`;
      link.href = tempCanvas.toDataURL();
      link.click();
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

  // --- LIVE AI CONNECTION LOGIC ---

  useEffect(() => {
      return () => {
          // Cleanup live connection
          liveServiceRef.current?.disconnect();
      };
  }, []);

  const toggleLiveMode = () => {
      if (isLiveMode) {
          liveServiceRef.current?.disconnect();
          setIsLiveMode(false);
          setLiveStatus('disconnected');
          setChatHistory(prev => [...prev, { role: 'ai', text: "Live session ended." }]);
      } else {
          startLiveSession();
      }
  };

  const startLiveSession = async () => {
      setLiveStatus('connecting');
      setIsLiveMode(true);
      
      if (!liveServiceRef.current) {
          liveServiceRef.current = new GeminiLiveService();
          liveServiceRef.current.initializeAudio();
      }

      const toolsToUse = [{ functionDeclarations: drawTools }];
      
      const systemInstruction = `You are a Technical Illustrator and Whiteboard Assistant.
      
      ROLE & BEHAVIOR:
      1. Listen to user requests to draw architectural or technical diagrams.
      2. When asked to draw a diagram (e.g., "DynamoDB Architecture"), you MUST Plan and Draw ALL components in the diagram.
         - Do not stop after one box.
         - Typical DynamoDB flow: Client -> API Gateway -> Lambda -> DynamoDB. Draw all 4.
         - Use 'draw_rectangle' for nodes, 'draw_circle' for databases/users, 'draw_line' for connections.
         - Use 'add_text' to label everything clearly.
      3. Layout:
         - Start drawing from the left side (x=100) to right side (x=900).
         - Keep components spaced out.
         - Use the center (500, 400) as the anchor.
      4. Always confirm what you drew verbally after finishing the tool calls.
      
      If you receive PlantUML or Mermaid code in the prompt, interpret it visually and draw it using primitives.
      `;

      try {
          await liveServiceRef.current.connect(
              'Puck',
              systemInstruction,
              {
                  onOpen: () => {
                      setLiveStatus('connected');
                      setChatHistory(prev => [...prev, { role: 'ai', text: "Live session connected. I'm listening..." }]);
                  },
                  onClose: () => {
                      setLiveStatus('disconnected');
                      setIsLiveMode(false);
                  },
                  onError: (err) => {
                      console.error("Live Error", err);
                      setLiveStatus('disconnected');
                      setIsLiveMode(false);
                      setChatHistory(prev => [...prev, { role: 'ai', text: "Connection error." }]);
                  },
                  onVolumeUpdate: (vol) => {
                      // Optional visualization
                  },
                  onTranscript: (text, isUser) => {
                      // Fix: Update the last message if it's the same role to prevent newline spam
                      setChatHistory(prev => {
                          const last = prev[prev.length - 1];
                          if (last && last.role === (isUser ? 'user' : 'ai')) {
                              const newHistory = [...prev];
                              newHistory[newHistory.length - 1] = { ...last, text: last.text + text };
                              return newHistory;
                          }
                          return [...prev, { role: isUser ? 'user' : 'ai', text }];
                      });
                  },
                  onToolCall: async (toolCall: any) => {
                      // Execute drawing tools
                      for (const fc of toolCall.functionCalls) {
                          console.log("Tool Call:", fc.name, fc.args);
                          const args = fc.args;
                          const id = crypto.randomUUID();
                          const newEls: DrawingElement[] = [];
                          
                          if (fc.name === 'draw_rectangle') {
                              newEls.push({
                                  id, type: 'rectangle',
                                  x: args.x, y: args.y, width: args.width, height: args.height,
                                  color: args.color || color, strokeWidth
                              });
                              if (args.label) {
                                  newEls.push({
                                      id: crypto.randomUUID(), type: 'text',
                                      x: args.x + 10, y: args.y + 10,
                                      text: args.label, color: args.color || color, strokeWidth
                                  });
                              }
                          } else if (fc.name === 'draw_circle') {
                              newEls.push({
                                  id, type: 'circle',
                                  x: args.x, y: args.y, width: args.diameter, height: args.diameter,
                                  color: args.color || color, strokeWidth
                              });
                              if (args.label) {
                                  newEls.push({
                                      id: crypto.randomUUID(), type: 'text',
                                      x: args.x + args.diameter/4, y: args.y + args.diameter/3,
                                      text: args.label, color: args.color || color, strokeWidth
                                  });
                              }
                          } else if (fc.name === 'draw_line') {
                              newEls.push({
                                  id, type: 'line',
                                  x: args.x1, y: args.y1,
                                  width: args.x2 - args.x1, height: args.y2 - args.y1,
                                  color: args.color || color, strokeWidth
                              });
                          } else if (fc.name === 'add_text') {
                              newEls.push({
                                  id, type: 'text',
                                  x: args.x, y: args.y,
                                  text: args.text,
                                  color: args.color || color, strokeWidth: args.fontSize || strokeWidth
                              });
                          } else if (fc.name === 'draw_path') {
                              // Convert flat array [x1,y1,x2,y2] to point objects
                              const rawPoints = args.points as number[];
                              const points: Point[] = [];
                              for(let i=0; i<rawPoints.length; i+=2) {
                                  if (i+1 < rawPoints.length) {
                                      points.push({ x: rawPoints[i], y: rawPoints[i+1] });
                                  }
                              }
                              if (points.length > 0) {
                                  newEls.push({
                                      id, type: 'pencil',
                                      x: points[0].x, y: points[0].y, // Reference point
                                      points: points,
                                      color: (args.color as string) || color, 
                                      strokeWidth: (args.strokeWidth as number) || strokeWidth
                                  });
                              }
                          } else if (fc.name === 'clear_board') {
                              setElements([]);
                          }

                          if (newEls.length > 0) {
                              setElements(prev => [...prev, ...newEls]);
                          }
                          
                          // Send response
                          liveServiceRef.current?.sendToolResponse({
                              functionResponses: [{
                                  id: fc.id, name: fc.name, response: { result: "ok" }
                              }]
                          });
                      }
                  }
              },
              toolsToUse
          );
      } catch (e) {
          console.error("Connection failed", e);
          setLiveStatus('disconnected');
          setIsLiveMode(false);
      }
  };

  // --- TEXT CHAT FALLBACK ---

  const handleChatSubmit = async (messageText?: string) => {
      const msg = messageText || chatInput;
      if (!msg.trim()) return;
      
      setChatInput('');
      
      const newHistory = [...chatHistory, { role: 'user', text: msg }];
      setChatHistory(newHistory as any);
      setIsAiProcessing(true);
      
      try {
          const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
          if (!apiKey) throw new Error("API Key required. Please set it in Settings.");
          
          const ai = new GoogleGenAI({ apiKey });
          
          // Capture current canvas for context
          const canvas = canvasRef.current;
          let imagePart = null;
          if (canvas) {
              const base64Image = canvas.toDataURL('image/png').split(',')[1];
              imagePart = { inlineData: { mimeType: 'image/png', data: base64Image } };
          }

          const systemInstruction = `You are a helpful Whiteboard Assistant. 
          You can Draw shapes, lines, text, and FREEHAND PATHS using the provided tools.
          The canvas is roughly 1000x800. Coordinate (0,0) is top-left.`;

          const contents = [
              ...newHistory.map(m => ({ role: m.role === 'ai' ? 'model' : 'user', parts: [{ text: m.text }] })),
              { role: 'user', parts: imagePart ? [imagePart, { text: msg }] : [{ text: msg }] }
          ];

          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: contents,
              config: {
                  systemInstruction,
                  tools: [{ functionDeclarations: drawTools }],
                  toolConfig: { functionCallingConfig: { mode: 'AUTO' } }
              }
          });

          let aiText = response.text || "";
          
          // Execute Tools
          if (response.functionCalls) {
              const newElements: DrawingElement[] = [];
              let shouldClear = false;

              for (const fc of response.functionCalls) {
                  const args = fc.args;
                  const id = crypto.randomUUID();
                  
                  if (fc.name === 'draw_rectangle') {
                      newElements.push({
                          id, type: 'rectangle',
                          x: args.x as number, y: args.y as number,
                          width: args.width as number, height: args.height as number,
                          color: (args.color as string) || color, strokeWidth
                      });
                  } else if (fc.name === 'draw_circle') {
                      newElements.push({
                          id, type: 'circle',
                          x: args.x as number, y: args.y as number,
                          width: args.diameter as number, height: args.diameter as number,
                          color: (args.color as string) || color, strokeWidth
                      });
                  } else if (fc.name === 'draw_line') {
                      newElements.push({
                          id, type: 'line',
                          x: args.x1 as number, y: args.y1 as number,
                          width: (args.x2 as number) - (args.x1 as number), 
                          height: (args.y2 as number) - (args.y1 as number),
                          color: (args.color as string) || color, strokeWidth
                      });
                  } else if (fc.name === 'draw_path') {
                      // Convert flat array [x1,y1,x2,y2] to point objects
                      const rawPoints = args.points as number[];
                      const points: Point[] = [];
                      for(let i=0; i<rawPoints.length; i+=2) {
                          if (i+1 < rawPoints.length) {
                              points.push({ x: rawPoints[i], y: rawPoints[i+1] });
                          }
                      }
                      if (points.length > 0) {
                          newElements.push({
                              id, type: 'pencil',
                              x: points[0].x, y: points[0].y, // Reference point
                              points: points,
                              color: (args.color as string) || color, 
                              strokeWidth: (args.strokeWidth as number) || strokeWidth
                          });
                      }
                  } else if (fc.name === 'add_text') {
                      newElements.push({
                          id, type: 'text',
                          x: args.x as number, y: args.y as number,
                          text: args.text as string,
                          color: (args.color as string) || color, strokeWidth
                      });
                  } else if (fc.name === 'clear_board') {
                      shouldClear = true;
                  }
              }

              if (shouldClear) {
                  setElements([]);
                  aiText += "\n\n*(Board cleared)*";
              } else if (newElements.length > 0) {
                  setElements(prev => [...prev, ...newElements]);
                  saveHistory([...elements, ...newElements]);
                  aiText += `\n\n*(Added ${newElements.length} elements)*`;
              }
          }

          if (!aiText) aiText = "Done.";
          
          setChatHistory(prev => [...prev, { role: 'ai', text: aiText }]);

      } catch(e: any) {
          setChatHistory(prev => [...prev, { role: 'ai', text: `Error: ${e.message}` }]);
      } finally {
          setIsAiProcessing(false);
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
      // Convert to screen coordinates for the floating UI
      const screenX = minX * zoom + pan.x;
      const screenY = minY * zoom + pan.y;
      
      return { x: screenX, y: screenY };
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
              { id: 'selection', icon: MousePointer, label: 'Select' },
              { id: 'pan', icon: Move, label: 'Pan' },
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
              onClick={() => setIsAssistantOpen(!isAssistantOpen)} 
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold shadow-lg ml-2 flex-shrink-0 transition-colors ${isAssistantOpen ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-indigo-400 hover:bg-slate-700'}`}
          >
              <Bot size={16} />
              <span className="hidden sm:inline">Ask AI</span>
          </button>
      </div>

      {/* Floating Zoom Controls */}
      <div className="absolute bottom-6 left-6 z-20 flex gap-2">
          <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-xl p-1 flex gap-1 shadow-lg">
              <button onClick={() => handleZoom('out')} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"><ZoomOut size={18}/></button>
              <button onClick={resetView} className="px-2 text-xs font-mono text-slate-300 flex items-center">{Math.round(zoom * 100)}%</button>
              <button onClick={() => handleZoom('in')} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"><ZoomIn size={18}/></button>
          </div>
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
                      left: textInput.x * zoom + pan.x, // Transform coordinates
                      top: textInput.y * zoom + pan.y,
                      color: color,
                      fontSize: `${(strokeWidth * 10 + 12) * zoom}px`, // Scale font
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

      {/* AI Assistant Panel */}
      {isAssistantOpen && (
          <div className="absolute top-24 right-4 w-96 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh] animate-fade-in-up z-30">
              <div className="p-3 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Sparkles size={14} className="text-indigo-400"/> AI Assistant
                  </h3>
                  <button onClick={() => setIsAssistantOpen(false)}><X size={16} className="text-slate-400 hover:text-white"/></button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900 scrollbar-thin scrollbar-thumb-slate-800">
                  {/* Live Status Indicator */}
                  {isLiveMode && (
                      <div className="flex items-center gap-2 p-2 bg-indigo-900/20 border border-indigo-500/30 rounded-lg mb-2">
                          <div className={`w-2 h-2 rounded-full ${liveStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                          <span className="text-xs font-mono text-indigo-300">Live Voice: {liveStatus}</span>
                      </div>
                  )}

                  {chatHistory.length === 0 && (
                      <div className="text-center text-slate-500 py-8">
                          <Bot size={32} className="mx-auto mb-2 opacity-50"/>
                          <p className="text-xs">Ask me to analyze the board or draw shapes for you.</p>
                          <p className="text-xs italic mt-2">"Draw a red stick figure"</p>
                      </div>
                  )}
                  {chatHistory.map((msg, i) => (
                      <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                          <div className={`max-w-[85%] p-3 rounded-xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                              <MarkdownView content={msg.text} />
                          </div>
                      </div>
                  ))}
                  {isAiProcessing && (
                      <div className="flex items-center gap-2 text-slate-500 text-xs">
                          <Loader2 size={12} className="animate-spin"/> Thinking...
                      </div>
                  )}
                  <div ref={chatEndRef} />
              </div>

              <div className="p-3 border-t border-slate-800 bg-slate-950/50 flex flex-col gap-2">
                  <button 
                      onClick={toggleLiveMode}
                      className={`w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${isLiveMode ? 'bg-red-900/30 text-red-400 border border-red-900/50' : 'bg-emerald-900/30 text-emerald-400 border border-emerald-900/50 hover:bg-emerald-900/50'}`}
                  >
                      {isLiveMode ? <MicOff size={14}/> : <Zap size={14}/>}
                      <span>{isLiveMode ? "Stop Live Session" : "Start Live Voice Control"}</span>
                  </button>

                  <div className="flex items-center gap-2">
                      <input 
                          type="text" 
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleChatSubmit()}
                          placeholder={isLiveMode ? "Voice Active..." : "Type or speak..."}
                          disabled={isLiveMode}
                          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                      />
                      <button 
                          onClick={() => handleChatSubmit()}
                          disabled={!chatInput.trim() || isAiProcessing || isLiveMode}
                          className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                      >
                          <Send size={16}/>
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};
