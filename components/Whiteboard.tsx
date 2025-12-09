
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Share2, Trash2, Undo, PenTool, Eraser, Download, Square, Circle, Minus, ArrowRight, Type, ZoomIn, ZoomOut, MousePointer2, Move, Highlighter, Brush, BoxSelect } from 'lucide-react';
import { auth } from '../services/firebaseConfig';
import { saveWhiteboardSession, subscribeToWhiteboard } from '../services/firestoreService';

interface WhiteboardProps {
  onBack: () => void;
  sessionId?: string;
}

type ToolType = 'select' | 'pen' | 'eraser' | 'rect' | 'circle' | 'line' | 'arrow' | 'text' | 'pan';
type LineStyle = 'solid' | 'dashed' | 'dotted';
type BrushType = 'standard' | 'highlighter' | 'calligraphy' | 'square';

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
  brushType?: BrushType;
  fontSize?: number;
  fontFamily?: string;
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
  const [brushType, setBrushType] = useState<BrushType>('standard');
  const [fontSize, setFontSize] = useState(24);
  const [fontFamily, setFontFamily] = useState('sans-serif');
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, currX: number, currY: number } | null>(null);
  
  const dragStartPos = useRef<{x: number, y: number} | null>(null);
  // Store initial state of ALL selected elements for bulk moving
  const initialSelectionStates = useRef<Map<string, WhiteboardElement>>(new Map());

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

  // Sync state with selection
  useEffect(() => {
      if (selectedIds.length === 1) {
          const el = elements.find(e => e.id === selectedIds[0]);
          if (el) {
              setColor(el.color);
              setLineWidth(el.strokeWidth);
              if (el.type === 'line' || el.type === 'arrow' || el.type === 'rect' || el.type === 'circle') {
                  setLineStyle(el.lineStyle || 'solid');
              }
              if (el.type === 'text') {
                  setFontSize(el.fontSize || 24);
                  setFontFamily(el.fontFamily || 'sans-serif');
              }
              if (el.type === 'pen') {
                  setBrushType(el.brushType || 'standard');
              }
          }
      }
  }, [selectedIds, elements]);

  // --- Bulk Update Helper ---
  const updateSelectedElements = (updates: Partial<WhiteboardElement>) => {
      if (selectedIds.length === 0) return;
      
      setElements(prev => prev.map(el => {
          if (selectedIds.includes(el.id)) {
              return { ...el, ...updates };
          }
          return el;
      }));
  };

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
              const fs = el.fontSize || 24;
              const w = (el.text?.length || 1) * fs * 0.6; // Rough char width
              const h = fs;
              // Top baseline hit test
              return x >= el.x && x <= el.x + w && y >= el.y && y <= el.y + h;
          default:
              return false;
      }
  };

  // Check intersection for Selection Box
  const isElementIntersectingBox = (el: WhiteboardElement, box: {x: number, y: number, w: number, h: number}): boolean => {
      // Normalize box
      const bx = Math.min(box.x, box.x + box.w);
      const by = Math.min(box.y, box.y + box.h);
      const bw = Math.abs(box.w);
      const bh = Math.abs(box.h);

      // Helper for AABB (Axis-Aligned Bounding Box) of element
      const getBounds = (e: WhiteboardElement) => {
          if (e.type === 'pen' || e.type === 'eraser') {
              if (!e.points) return { x: e.x, y: e.y, w: 0, h: 0 };
              const xs = e.points.map(p => p.x);
              const ys = e.points.map(p => p.y);
              return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
          } else if (e.type === 'line' || e.type === 'arrow') {
              return {
                  x: Math.min(e.x, e.endX || e.x),
                  y: Math.min(e.y, e.endY || e.y),
                  w: Math.abs((e.endX || e.x) - e.x),
                  h: Math.abs((e.endY || e.y) - e.y)
              };
          } else if (e.type === 'text') {
              const fs = e.fontSize || 24;
              return { x: e.x, y: e.y, w: (e.text?.length || 1) * fs * 0.6, h: fs };
          }
          // Rect, Circle
          return {
              x: Math.min(e.x, e.x + (e.width || 0)),
              y: Math.min(e.y, e.y + (e.height || 0)),
              w: Math.abs(e.width || 0),
              h: Math.abs(e.height || 0)
          };
      };

      const eb = getBounds(el);
      
      // Check overlap
      return (bx < eb.x + eb.w && bx + bw > eb.x && by < eb.y + eb.h && by + bh > eb.y);
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
      // If user clicks outside textarea, commit it first
      if (textInput) {
          // If we clicked *on* the textarea, the event shouldn't be here (textarea swallows clicks)
          // So this means we clicked the canvas.
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
          let hitId = null;
          // Reverse loop to hit top-most elements first
          for (let i = elements.length - 1; i >= 0; i--) {
              if (isPointInElement(x, y, elements[i])) {
                  hitId = elements[i].id;
                  break;
              }
          }
          
          const isCtrl = (e as React.MouseEvent).ctrlKey || (e as React.MouseEvent).metaKey;

          if (hitId) {
              // Clicked an element
              if (isCtrl) {
                  // Toggle selection
                  if (selectedIds.includes(hitId)) {
                      setSelectedIds(prev => prev.filter(id => id !== hitId));
                  } else {
                      setSelectedIds(prev => [...prev, hitId]);
                  }
              } else {
                  // If clicking an item NOT in selection, verify if we should clear others
                  if (!selectedIds.includes(hitId)) {
                      setSelectedIds([hitId]);
                  }
                  // If clicking an item ALREADY in selection, don't clear (user might want to drag group)
              }

              // Setup dragging for ALL selected items (including the new one if just added)
              setIsDraggingSelection(true);
              dragStartPos.current = { x, y };
              
              // Snapshot all selected elements relative positions
              initialSelectionStates.current.clear();
              // Logic check: state update above might be async, so we manually check IDs
              const idsToDrag = (!isCtrl && !selectedIds.includes(hitId)) 
                  ? [hitId] 
                  : (isCtrl && selectedIds.includes(hitId)) ? selectedIds.filter(id => id !== hitId) // Deselecting shouldn't drag
                  : (isCtrl && !selectedIds.includes(hitId)) ? [...selectedIds, hitId]
                  : selectedIds;

              elements.forEach(el => {
                  if (idsToDrag.includes(el.id)) {
                      initialSelectionStates.current.set(el.id, JSON.parse(JSON.stringify(el)));
                  }
              });

          } else {
              // Clicked Empty Space
              if (!isCtrl) {
                  setSelectedIds([]);
              }
              // Start Selection Box
              setSelectionBox({ startX: x, startY: y, currX: x, currY: y });
          }
          return;
      }

      if (tool === 'text') {
          const id = crypto.randomUUID();
          setTextInput({ id, x, y, text: '' });
          return;
      }

      setIsDrawing(true);
      setSelectedIds([]); // Deselect when drawing
      
      const id = crypto.randomUUID();
      const newEl: WhiteboardElement = {
          id,
          type: tool,
          x, y,
          color: tool === 'eraser' ? '#0f172a' : color,
          strokeWidth: tool === 'eraser' ? 20 : lineWidth,
          lineStyle: tool === 'eraser' ? 'solid' : lineStyle,
          brushType: brushType,
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

      // Selection Box Update
      if (selectionBox) {
          setSelectionBox(prev => prev ? ({ ...prev, currX: x, currY: y }) : null);
          return;
      }

      // Dragging Multiple Elements
      if (isDraggingSelection && dragStartPos.current) {
          const dx = x - dragStartPos.current.x;
          const dy = y - dragStartPos.current.y;
          
          setElements(prev => prev.map(el => {
              if (initialSelectionStates.current.has(el.id)) {
                  const init = initialSelectionStates.current.get(el.id)!;
                  
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
              }
              return el;
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
      
      if (selectionBox) {
          // Calculate intersection
          const box = {
              x: selectionBox.startX,
              y: selectionBox.startY,
              w: selectionBox.currX - selectionBox.startX,
              h: selectionBox.currY - selectionBox.startY
          };
          
          const hitIds = elements
              .filter(el => isElementIntersectingBox(el, box))
              .map(el => el.id);
          
          setSelectedIds(prev => {
              // Add to selection if Ctrl pressed (technically we don't have event here, but standard select box behavior replaces selection)
              return hitIds;
          });
          
          setSelectionBox(null);
          return;
      }

      if (isDraggingSelection) {
          setIsDraggingSelection(false);
          dragStartPos.current = null;
          initialSelectionStates.current.clear();
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
          ctx.save();
          ctx.beginPath();
          ctx.strokeStyle = el.color;
          ctx.lineWidth = el.strokeWidth / scale;
          
          // Brush Styles
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.globalAlpha = 1.0;

          if (el.brushType === 'highlighter') {
              ctx.globalAlpha = 0.5;
              ctx.lineCap = 'butt';
              ctx.lineWidth = (el.strokeWidth * 3) / scale;
          } else if (el.brushType === 'square') {
              ctx.lineCap = 'butt';
              ctx.lineJoin = 'miter';
          } else if (el.brushType === 'calligraphy') {
              ctx.lineCap = 'butt';
          }

          // Line Style (Dashed/Dotted)
          if (el.lineStyle === 'dashed') ctx.setLineDash([15, 10]);
          else if (el.lineStyle === 'dotted') ctx.setLineDash([3, 8]);
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
              ctx.font = `${el.fontSize || 24}px ${el.fontFamily || 'sans-serif'}`;
              ctx.textBaseline = 'top'; // Align top-left like HTML element
              ctx.fillStyle = el.color;
              ctx.fillText(el.text, el.x, el.y);
          }
          
          ctx.restore(); // Restore alpha/line styles

          // Render Selection Highlight
          if (selectedIds.includes(el.id)) {
              ctx.save();
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
                  const minX = Math.min(el.x, el.endX || el.x);
                  const maxX = Math.max(el.x, el.endX || el.x);
                  const minY = Math.min(el.y, el.endY || el.y);
                  const maxY = Math.max(el.y, el.endY || el.y);
                  ctx.strokeRect(minX - padding, minY - padding, maxX - minX + padding*2, maxY - minY + padding*2);
              } else if (el.type === 'text') {
                  const fs = el.fontSize || 24;
                  ctx.font = `${fs}px ${el.fontFamily || 'sans-serif'}`;
                  const width = ctx.measureText(el.text || '').width;
                  ctx.strokeRect(el.x - padding, el.y - padding, width + padding*2, fs + padding*2);
              } else if (el.type === 'pen' || el.type === 'eraser') {
                  if (el.points) {
                      const minX = Math.min(...el.points.map(p => p.x));
                      const maxX = Math.max(...el.points.map(p => p.x));
                      const minY = Math.min(...el.points.map(p => p.y));
                      const maxY = Math.max(...el.points.map(p => p.y));
                      ctx.strokeRect(minX - padding, minY - padding, maxX - minX + padding*2, maxY - minY + padding*2);
                  }
              }
              ctx.restore();
          }
      };

      // Draw saved elements
      elements.forEach(renderElement);
      // Draw active element
      if (currentElement) renderElement(currentElement);

      // Draw Selection Box
      if (selectionBox) {
          ctx.save();
          ctx.setLineDash([5, 5]);
          ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 1 / scale;
          const w = selectionBox.currX - selectionBox.startX;
          const h = selectionBox.currY - selectionBox.startY;
          ctx.fillRect(selectionBox.startX, selectionBox.startY, w, h);
          ctx.strokeRect(selectionBox.startX, selectionBox.startY, w, h);
          ctx.restore();
      }

      ctx.restore();

  }, [elements, currentElement, scale, offset, selectedIds, selectionBox]);

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
                  strokeWidth: 1,
                  fontSize: fontSize,
                  fontFamily: fontFamily
              };
              setElements(prev => [...prev, newEl]);
          }
          setTextInput(null);
          // Don't switch tool, allow multiple text inputs in sequence
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
      if (selectedIds.length > 0) {
          setElements(prev => prev.filter(el => !selectedIds.includes(el.id)));
          setSelectedIds([]);
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
              if (selectedIds.length > 0 && !textInput) {
                  handleDeleteSelected();
              }
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, textInput]);

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
        <div className="bg-slate-900 border-b border-slate-800 p-2 flex flex-wrap justify-center gap-4 shrink-0 z-10 items-center">
            
            <div className="flex bg-slate-800 rounded-lg p-1">
                <button onClick={() => { setTool('select'); setIsDrawing(false); }} className={`p-2 rounded ${tool === 'select' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Select (Ctrl+Click for multiple, Drag for box)">
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
            
            {/* Brush Styles (Only for Pen) */}
            {tool === 'pen' && (
                <div className="flex bg-slate-800 rounded-lg p-1 animate-fade-in">
                    <button onClick={() => setBrushType('standard')} className={`p-2 rounded ${brushType === 'standard' ? 'bg-slate-700 text-white' : 'text-slate-400'}`} title="Standard Pen">
                        <PenTool size={16} />
                    </button>
                    <button onClick={() => setBrushType('highlighter')} className={`p-2 rounded ${brushType === 'highlighter' ? 'bg-slate-700 text-yellow-300' : 'text-slate-400'}`} title="Highlighter">
                        <Highlighter size={16} />
                    </button>
                    <button onClick={() => setBrushType('square')} className={`p-2 rounded ${brushType === 'square' ? 'bg-slate-700 text-white' : 'text-slate-400'}`} title="Square Brush">
                        <BoxSelect size={16} />
                    </button>
                    <button onClick={() => setBrushType('calligraphy')} className={`p-2 rounded ${brushType === 'calligraphy' ? 'bg-slate-700 text-white' : 'text-slate-400'}`} title="Calligraphy">
                        <Brush size={16} />
                    </button>
                </div>
            )}

            {/* Text Options (Font Size/Family) */}
            {(tool === 'text' || (selectedIds.length > 0 && elements.some(el => selectedIds.includes(el.id) && el.type === 'text'))) && (
                <div className="flex items-center gap-2 px-2 bg-slate-800 rounded-lg animate-fade-in py-1">
                    <select 
                        value={fontFamily} 
                        onChange={(e) => {
                            setFontFamily(e.target.value);
                            updateSelectedElements({ fontFamily: e.target.value });
                        }}
                        className="bg-slate-800 text-xs text-white outline-none w-20 border-r border-slate-700 mr-2 cursor-pointer"
                    >
                        <option value="sans-serif" className="bg-slate-900 text-white">Sans</option>
                        <option value="serif" className="bg-slate-900 text-white">Serif</option>
                        <option value="monospace" className="bg-slate-900 text-white">Mono</option>
                        <option value="cursive" className="bg-slate-900 text-white">Hand</option>
                    </select>
                    
                    <input 
                        type="number" 
                        value={fontSize} 
                        onChange={(e) => {
                            const size = parseInt(e.target.value);
                            setFontSize(size);
                            updateSelectedElements({ fontSize: size });
                        }}
                        className="bg-transparent text-xs text-white outline-none w-10 text-center"
                        min="8" max="128"
                    />
                    <span className="text-[10px] text-slate-500">px</span>
                </div>
            )}

            {/* Line Options */}
            <div className="flex bg-slate-800 rounded-lg p-1">
                <button onClick={() => { setLineStyle('solid'); updateSelectedElements({ lineStyle: 'solid' }); }} className={`p-2 rounded text-xs font-mono ${lineStyle === 'solid' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>────</button>
                <button onClick={() => { setLineStyle('dashed'); updateSelectedElements({ lineStyle: 'dashed' }); }} className={`p-2 rounded text-xs font-mono ${lineStyle === 'dashed' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>- - -</button>
                <button onClick={() => { setLineStyle('dotted'); updateSelectedElements({ lineStyle: 'dotted' }); }} className={`p-2 rounded text-xs font-mono ${lineStyle === 'dotted' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>····</button>
            </div>

            <div className="flex items-center gap-2 px-2 bg-slate-800 rounded-lg">
                <input 
                    type="range" min="1" max="20" 
                    value={lineWidth} onChange={(e) => {
                        const width = parseInt(e.target.value);
                        setLineWidth(width);
                        updateSelectedElements({ strokeWidth: width });
                    }}
                    className="w-20 accent-indigo-500"
                    title="Stroke Width"
                />
            </div>

            <div className="flex items-center gap-2 px-2 bg-slate-800 rounded-lg">
                {['#ffffff', '#ef4444', '#22c55e', '#3b82f6', '#eab308', '#ec4899'].map(c => (
                    <button 
                        key={c}
                        onClick={() => { 
                            setColor(c); 
                            if(tool==='eraser') setTool('pen'); 
                            updateSelectedElements({ color: c });
                        }}
                        className={`w-5 h-5 rounded-full border ${color === c && tool !== 'eraser' ? 'border-white scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                    />
                ))}
            </div>

            <div className="flex gap-1">
                <button onClick={() => setElements(prev => prev.slice(0, -1))} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="Undo (Ctrl+Z)">
                    <Undo size={18} />
                </button>
                <button onClick={selectedIds.length > 0 ? handleDeleteSelected : handleClear} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400" title={selectedIds.length > 0 ? "Delete Selected (Del)" : "Clear All"}>
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
                        top: textInput.y * scale + offset.y,
                        fontSize: `${fontSize * scale}px`,
                        fontFamily: fontFamily,
                        color: color,
                        background: 'transparent',
                        border: '1px dashed #64748b',
                        outline: 'none',
                        minWidth: '50px',
                        overflow: 'hidden',
                        resize: 'both',
                        whiteSpace: 'pre',
                        zIndex: 20,
                        padding: 0,
                        margin: 0,
                        lineHeight: 1
                    }}
                    placeholder="Type..."
                />
            )}
        </div>
    </div>
  );
};
