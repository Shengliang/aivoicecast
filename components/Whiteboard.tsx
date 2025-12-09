
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Share2, Trash2, Undo, PenTool, Eraser, Download, Square, Circle, Minus, ArrowRight, Type, ZoomIn, ZoomOut, MousePointer2, Move, Highlighter, Brush, BoxSelect, Lock, Eye, Edit3, Feather, SprayCan, Droplet, Pencil } from 'lucide-react';
import { auth } from '../services/firebaseConfig';
import { saveWhiteboardSession, subscribeToWhiteboard, updateWhiteboardElement, deleteWhiteboardElements } from '../services/firestoreService';

interface WhiteboardProps {
  onBack: () => void;
  sessionId?: string;
  accessKey?: string; // Secret write token from URL
  onSessionStart?: (id: string) => void;
}

type ToolType = 'select' | 'pen' | 'eraser' | 'rect' | 'circle' | 'line' | 'arrow' | 'text' | 'pan';
type LineStyle = 'solid' | 'dashed' | 'dotted';
type BrushType = 'standard' | 'pencil' | 'marker' | 'calligraphy-pen' | 'writing-brush' | 'airbrush' | 'oil' | 'watercolor' | 'crayon';

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

export const Whiteboard: React.FC<WhiteboardProps> = ({ onBack, sessionId, accessKey, onSessionStart }) => {
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
  const [showShareDropdown, setShowShareDropdown] = useState(false);
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, currX: number, currY: number } | null>(null);
  
  const dragStartPos = useRef<{x: number, y: number} | null>(null);
  const initialSelectionStates = useRef<Map<string, WhiteboardElement>>(new Map());

  // Viewport State
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPoint = useRef({ x: 0, y: 0 });
  
  // Shared Session
  const [isSharedSession, setIsSharedSession] = useState(!!sessionId);
  const [isReadOnly, setIsReadOnly] = useState(false); // Managed internally now
  const currentSessionIdRef = useRef<string>(sessionId || crypto.randomUUID());

  // Text Input State
  const [textInput, setTextInput] = useState<{ id: string; x: number; y: number; text: string; width?: number; height?: number } | null>(null);
  const [textDragStart, setTextDragStart] = useState<{x: number, y: number} | null>(null);
  const [textDragCurrent, setTextDragCurrent] = useState<{x: number, y: number} | null>(null);

  const [writeToken, setWriteToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (sessionId) {
        setIsSharedSession(true);
        currentSessionIdRef.current = sessionId;
        const unsubscribe = subscribeToWhiteboard(sessionId, (remoteData: any) => {
            let remoteElements: WhiteboardElement[] = [];
            
            if (Array.isArray(remoteData)) {
                remoteElements = remoteData;
            }
            setElements(remoteElements);
        });
        
        const hasKey = !!accessKey;
        if (accessKey) {
            setWriteToken(accessKey);
            setIsReadOnly(false);
        } else {
            if (!writeToken) {
                 setIsReadOnly(true);
            }
        }

        return () => unsubscribe();
    }
  }, [sessionId, accessKey]);

  // Force tool reset if read-only
  useEffect(() => {
      if (isReadOnly && tool !== 'pan' && tool !== 'select') {
          setTool('pan');
      }
  }, [isReadOnly, tool]);

  const handleShare = async (mode: 'read' | 'edit') => {
      if (!auth.currentUser) {
          alert("Please sign in to share.");
          return;
      }
      
      let boardId = currentSessionIdRef.current;
      let token = writeToken;
      
      if (!sessionId && !isSharedSession) {
          boardId = crypto.randomUUID();
          currentSessionIdRef.current = boardId;
          token = crypto.randomUUID();
          setWriteToken(token);
      }
      
      if (!token) {
          token = crypto.randomUUID();
          setWriteToken(token);
      }
      
      try {
        await saveWhiteboardSession(boardId, elements);
        
        if (onSessionStart && !sessionId) {
            onSessionStart(boardId);
        }
        
        const url = new URL(window.location.href);
        url.searchParams.set('session', boardId);
        
        if (mode === 'edit') {
            url.searchParams.set('key', token);
        } else {
            url.searchParams.delete('key');
        }

        url.searchParams.delete('whiteboard_session');
        url.searchParams.delete('code_session');
        url.searchParams.delete('view');
        url.searchParams.delete('mode');
        
        const link = url.toString();
        
        await navigator.clipboard.writeText(link);
        alert(`${mode === 'edit' ? 'Edit' : 'Read-Only'} Link Copied!\n\nLink: ${link}`);
        
        setIsSharedSession(true);
        setShowShareDropdown(false);
        setIsReadOnly(false);
      } catch(e: any) {
          console.error(e);
          alert(`Failed to share: ${e.message}`);
      }
  };

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
  }, [selectedIds]);

  const syncUpdate = (el: WhiteboardElement) => {
      if (isSharedSession && !isReadOnly) {
          updateWhiteboardElement(currentSessionIdRef.current, el);
      }
  };

  const updateSelectedElements = (updates: Partial<WhiteboardElement>) => {
      if (selectedIds.length === 0 || isReadOnly) return;
      
      const updatedElements: WhiteboardElement[] = [];
      
      setElements(prev => prev.map(el => {
          if (selectedIds.includes(el.id)) {
              const updated = { ...el, ...updates };
              updatedElements.push(updated);
              return updated;
          }
          return el;
      }));
      
      updatedElements.forEach(el => syncUpdate(el));
  };

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
              const normX = (x - cx) / rx;
              const normY = (y - cy) / ry;
              return (normX * normX + normY * normY) <= 1;
          }
          case 'line':
          case 'arrow': {
              const x1 = el.x, y1 = el.y;
              const x2 = el.endX || x1, y2 = el.endY || y1;
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
              const minX = Math.min(...el.points.map(p => p.x)) - tolerance;
              const maxX = Math.max(...el.points.map(p => p.x)) + tolerance;
              const minY = Math.min(...el.points.map(p => p.y)) - tolerance;
              const maxY = Math.max(...el.points.map(p => p.y)) + tolerance;
              if (x < minX || x > maxX || y < minY || y > maxY) return false;
              return el.points.some(p => {
                  const dist = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2);
                  return dist < tolerance;
              });
          }
          case 'text':
              const fs = el.fontSize || 24;
              const w = el.width || ((el.text?.length || 1) * fs * 0.6);
              const h = el.height || fs * 1.2;
              return x >= el.x && x <= el.x + w && y >= el.y && y <= el.y + h;
          default:
              return false;
      }
  };

  const isElementIntersectingBox = (el: WhiteboardElement, box: {x: number, y: number, w: number, h: number}): boolean => {
      const bx = Math.min(box.x, box.x + box.w);
      const by = Math.min(box.y, box.y + box.h);
      const bw = Math.abs(box.w);
      const bh = Math.abs(box.h);

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
              return { x: e.x, y: e.y, w: e.width || ((e.text?.length || 1) * fs * 0.6), h: e.height || fs };
          }
          return {
              x: Math.min(e.x, e.x + (e.width || 0)),
              y: Math.min(e.y, e.y + (e.height || 0)),
              w: Math.abs(e.width || 0),
              h: Math.abs(e.height || 0)
          };
      };

      const eb = getBounds(el);
      return (bx < eb.x + eb.w && bx + bw > eb.x && by < eb.y + eb.h && by + bh > eb.y);
  };

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

      if (isReadOnly) return;

      const { x, y } = getWorldCoordinates(e);

      if (tool === 'text') {
          setIsDrawing(true);
          setTextDragStart({ x, y });
          setTextDragCurrent({ x, y });
          return;
      }

      if (tool === 'select') {
          let hitId = null;
          for (let i = elements.length - 1; i >= 0; i--) {
              if (isPointInElement(x, y, elements[i])) {
                  hitId = elements[i].id;
                  break;
              }
          }
          
          const isCtrl = (e as React.MouseEvent).ctrlKey || (e as React.MouseEvent).metaKey;

          if (hitId) {
              if (isCtrl) {
                  if (selectedIds.includes(hitId)) {
                      setSelectedIds(prev => prev.filter(id => id !== hitId));
                  } else {
                      setSelectedIds(prev => [...prev, hitId]);
                  }
              } else {
                  if (!selectedIds.includes(hitId)) {
                      setSelectedIds([hitId]);
                  }
              }

              setIsDraggingSelection(true);
              dragStartPos.current = { x, y };
              initialSelectionStates.current.clear();
              
              const idsToDrag = (!isCtrl && !selectedIds.includes(hitId)) 
                  ? [hitId] 
                  : (isCtrl && selectedIds.includes(hitId)) ? selectedIds.filter(id => id !== hitId)
                  : (isCtrl && !selectedIds.includes(hitId)) ? [...selectedIds, hitId]
                  : selectedIds;

              elements.forEach(el => {
                  if (idsToDrag.includes(el.id)) {
                      initialSelectionStates.current.set(el.id, JSON.parse(JSON.stringify(el)));
                  }
              });

          } else {
              if (!isCtrl) setSelectedIds([]);
              setSelectionBox({ startX: x, startY: y, currX: x, currY: y });
          }
          return;
      }

      setIsDrawing(true);
      setSelectedIds([]); 
      
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

      if (isReadOnly) return;

      const { x, y } = getWorldCoordinates(e);

      if (tool === 'text' && isDrawing && textDragStart) {
          setTextDragCurrent({ x, y });
          return;
      }

      if (selectionBox) {
          setSelectionBox(prev => prev ? ({ ...prev, currX: x, currY: y }) : null);
          return;
      }

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
                      newEl.points = init.points?.map(p => ({ x: p.x + dx, y: p.y + dy }));
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

      if (isReadOnly) return;

      if (tool === 'text' && isDrawing && textDragStart && textDragCurrent) {
          setIsDrawing(false);
          const rawW = textDragCurrent.x - textDragStart.x;
          const rawH = textDragCurrent.y - textDragStart.y;
          const width = Math.abs(rawW);
          const height = Math.abs(rawH);
          
          const x = Math.min(textDragStart.x, textDragCurrent.x);
          const y = Math.min(textDragStart.y, textDragCurrent.y);
          
          const isBox = width > 20 && height > 20;
          
          const id = crypto.randomUUID();
          setTextInput({ 
              id, 
              x: isBox ? x : textDragStart.x, 
              y: isBox ? y : textDragStart.y, 
              text: '',
              width: isBox ? width : undefined,
              height: isBox ? height : undefined
          });
          
          setTextDragStart(null);
          setTextDragCurrent(null);
          return;
      }
      
      if (selectionBox) {
          const box = {
              x: selectionBox.startX,
              y: selectionBox.startY,
              w: selectionBox.currX - selectionBox.startX,
              h: selectionBox.currY - selectionBox.startY
          };
          const hitIds = elements.filter(el => isElementIntersectingBox(el, box)).map(el => el.id);
          setSelectedIds(hitIds);
          setSelectionBox(null);
          return;
      }

      if (isDraggingSelection) {
          if (isSharedSession) {
              const movedElements = elements.filter(el => initialSelectionStates.current.has(el.id));
              movedElements.forEach(el => syncUpdate(el));
          }
          
          setIsDraggingSelection(false);
          dragStartPos.current = null;
          initialSelectionStates.current.clear();
          return;
      }

      if (isDrawing && currentElement) {
          setElements(prev => [...prev, currentElement]);
          syncUpdate(currentElement);
          
          setCurrentElement(null);
          setIsDrawing(false);
      }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
      if (isReadOnly || tool === 'pan') return;
      const { x, y } = getWorldCoordinates(e);
      
      // Check if user clicked on existing text
      let hitElement: WhiteboardElement | null = null;
      for (let i = elements.length - 1; i >= 0; i--) {
          if (elements[i].type === 'text' && isPointInElement(x, y, elements[i])) {
              hitElement = elements[i];
              break;
          }
      }

      if (hitElement) {
          // Edit existing text
          setTextInput({
              id: hitElement.id,
              x: hitElement.x,
              y: hitElement.y,
              text: hitElement.text || '',
              width: hitElement.width,
              height: hitElement.height
          });
          // Update Toolbar to match
          setColor(hitElement.color);
          if (hitElement.fontSize) setFontSize(hitElement.fontSize);
          if (hitElement.fontFamily) setFontFamily(hitElement.fontFamily);
      } else {
          // Create new text
          const id = crypto.randomUUID();
          setTool('text');
          setTextInput({ id, x, y, text: '' });
      }
  };

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

  const drawWrappedText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
      const paragraphs = text.split('\n');
      let cursorY = y;

      for (const paragraph of paragraphs) {
          const words = paragraph.split(' ');
          let line = '';
          for (let n = 0; n < words.length; n++) {
              const testLine = line + words[n] + ' ';
              const metrics = ctx.measureText(testLine);
              const testWidth = metrics.width;
              if (testWidth > maxWidth && n > 0) {
                  ctx.fillText(line, x, cursorY);
                  line = words[n] + ' ';
                  cursorY += lineHeight;
              } else {
                  line = testLine;
              }
          }
          ctx.fillText(line, x, cursorY);
          cursorY += lineHeight;
      }
  };

  useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = canvas.parentElement?.clientWidth || 800;
      canvas.height = canvas.parentElement?.clientHeight || 600;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.save();
      ctx.translate(offset.x, offset.y);
      ctx.scale(scale, scale);

      const renderElement = (el: WhiteboardElement) => {
          // If we are editing this text element, do not draw it on canvas (to avoid ghosting)
          if (textInput && el.id === textInput.id) return;

          ctx.save();
          ctx.beginPath();
          ctx.strokeStyle = el.color;
          ctx.lineWidth = el.strokeWidth / scale;
          
          // Default caps
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.globalAlpha = 1.0;
          ctx.shadowBlur = 0;

          // --- Brush Specific Styling ---
          if (el.brushType === 'pencil') {
              ctx.lineWidth = 1 / scale; // Always thin
              ctx.globalAlpha = 0.85;
          } else if (el.brushType === 'marker') {
              ctx.globalAlpha = 0.6;
              ctx.lineCap = 'square';
              ctx.lineJoin = 'bevel';
              ctx.lineWidth = Math.max(el.strokeWidth, 8) / scale; 
          } else if (el.brushType === 'calligraphy-pen') {
              // Western Calligraphy: Slanted Pen via Matrix Transform
              ctx.lineCap = 'butt'; // Flat tip
              // Apply shear transformation (45 degrees approx) to simulate flat nib angle
              ctx.transform(1, 0, -0.5, 1, 0, 0); 
          } else if (el.brushType === 'airbrush') {
              ctx.lineCap = 'round';
              ctx.shadowBlur = 15;
              ctx.shadowColor = el.color;
              ctx.globalAlpha = 0.6;
          } else if (el.brushType === 'oil') {
              ctx.shadowBlur = 1;
              ctx.shadowColor = 'rgba(0,0,0,0.5)';
              ctx.shadowOffsetX = 1;
              ctx.shadowOffsetY = 1;
              ctx.globalAlpha = 1.0;
          } else if (el.brushType === 'watercolor') {
              ctx.shadowBlur = 20;
              ctx.shadowColor = el.color;
              ctx.globalAlpha = 0.4;
          } else if (el.brushType === 'crayon') {
              ctx.lineCap = 'butt';
              ctx.lineJoin = 'bevel';
          }

          if (el.lineStyle === 'dashed') ctx.setLineDash([15, 10]);
          else if (el.lineStyle === 'dotted') ctx.setLineDash([3, 8]);
          else ctx.setLineDash([]);

          if (el.type === 'pen' || el.type === 'eraser') {
              // Special Rendering for Chinese Brush (Variable Width)
              if (el.brushType === 'writing-brush' && el.points && el.points.length > 2) {
                  ctx.lineCap = 'round';
                  ctx.lineJoin = 'round';
                  ctx.shadowBlur = 2; // Slight bleed
                  ctx.shadowColor = el.color;
                  
                  let p1 = el.points[0];
                  let p2 = el.points[1];
                  let lastWidth = el.strokeWidth / scale;

                  ctx.beginPath();
                  
                  // Iterate points to draw segments with variable width
                  for (let i = 1; i < el.points.length - 1; i++) {
                      let p3 = el.points[i+1];
                      
                      // Calculate midpoints for QuadCurve
                      let mid1 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                      let mid2 = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
                      
                      // Velocity-based width calculation
                      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                      // Faster = Thinner, Slower = Thicker
                      const targetWidth = (el.strokeWidth / scale) * Math.max(0.2, (1.2 - Math.min(1, dist / 20))); 
                      
                      // Smooth transition
                      const width = lastWidth * 0.6 + targetWidth * 0.4;

                      // Draw segment
                      ctx.beginPath();
                      ctx.moveTo(mid1.x, mid1.y);
                      ctx.quadraticCurveTo(p2.x, p2.y, mid2.x, mid2.y);
                      ctx.lineWidth = width;
                      ctx.stroke();
                      
                      p1 = p2;
                      p2 = p3;
                      lastWidth = width;
                  }
              } else {
                  // Standard uniform stroke
                  if (el.points && el.points.length > 0) {
                      ctx.beginPath();
                      ctx.moveTo(el.points[0].x, el.points[0].y);
                      for (let i = 1; i < el.points.length; i++) {
                          ctx.lineTo(el.points[i].x, el.points[i].y);
                      }
                      ctx.stroke();
                  }
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
              ctx.setLineDash([]);
              drawArrowHead(ctx, el.x, el.y, ex, ey, el.color);
          } else if (el.type === 'text' && el.text) {
              ctx.font = `${el.fontSize || 24}px ${el.fontFamily || 'sans-serif'}`;
              ctx.textBaseline = 'top';
              ctx.fillStyle = el.color;
              if (el.width) {
                  drawWrappedText(ctx, el.text, el.x, el.y, el.width, (el.fontSize || 24) * 1.2);
              } else {
                  const lines = el.text.split('\n');
                  lines.forEach((line, i) => {
                      ctx.fillText(line, el.x, el.y + i * (el.fontSize || 24) * 1.2);
                  });
              }
          }
          
          ctx.restore();

          if (selectedIds.includes(el.id)) {
              ctx.save();
              ctx.setLineDash([5, 5]);
              ctx.strokeStyle = '#3b82f6';
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
                  const width = el.width || ctx.measureText(el.text || '').width;
                  const height = el.height || (fs * (el.text?.split('\n').length || 1) * 1.2);
                  ctx.strokeRect(el.x - padding, el.y - padding, width + padding*2, height + padding*2);
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

      elements.forEach(renderElement);
      if (currentElement) renderElement(currentElement);

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
      
      if (tool === 'text' && isDrawing && textDragStart && textDragCurrent) {
          ctx.save();
          ctx.setLineDash([5, 5]);
          ctx.strokeStyle = '#22c55e'; 
          ctx.lineWidth = 1 / scale;
          const w = textDragCurrent.x - textDragStart.x;
          const h = textDragCurrent.y - textDragStart.y;
          ctx.strokeRect(textDragStart.x, textDragStart.y, w, h);
          ctx.restore();
      }

      ctx.restore();

  }, [elements, currentElement, scale, offset, selectedIds, selectionBox, tool, isDrawing, textDragStart, textDragCurrent, textInput]);

  const handleTextComplete = () => {
      if (isReadOnly) { setTextInput(null); return; }
      
      if (textInput) {
          if (textInput.text.trim()) {
              const fs = fontSize;
              const lineCount = textInput.text.split('\n').length;
              
              const newEl: WhiteboardElement = {
                  id: textInput.id,
                  type: 'text',
                  x: textInput.x,
                  y: textInput.y,
                  text: textInput.text,
                  color: color,
                  strokeWidth: 1,
                  fontSize: fontSize,
                  fontFamily: fontFamily,
                  width: textInput.width,
                  height: textInput.height || (fs * lineCount * 1.2)
              };
              
              setElements(prev => {
                  const idx = prev.findIndex(e => e.id === newEl.id);
                  if (idx >= 0) {
                      const copy = [...prev];
                      copy[idx] = newEl;
                      return copy;
                  }
                  return [...prev, newEl];
              });
              
              syncUpdate(newEl);
          }
          setTextInput(null);
      }
  };

  const handleClear = () => {
      if(isReadOnly) return;
      if(confirm("Clear whiteboard?")) {
          setElements([]);
          if (isSharedSession) {
              saveWhiteboardSession(currentSessionIdRef.current, []);
          }
      }
  };

  const handleDeleteSelected = () => {
      if(isReadOnly) return;
      if (selectedIds.length > 0) {
          const idsToDelete = [...selectedIds];
          setElements(prev => prev.filter(el => !selectedIds.includes(el.id)));
          setSelectedIds([]);
          
          if (isSharedSession) {
              deleteWhiteboardElements(currentSessionIdRef.current, idsToDelete);
          }
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

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
              if (isReadOnly) return;
              setElements(prev => prev.slice(0, -1));
          }
          if (e.key === 'Delete' || e.key === 'Backspace') {
              if (isReadOnly) return;
              if (selectedIds.length > 0 && !textInput) {
                  handleDeleteSelected();
              }
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, textInput, isReadOnly]);

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
                    {isReadOnly && <span className="text-xs bg-amber-900/50 text-amber-400 px-2 py-0.5 rounded flex items-center gap-1 border border-amber-500/30"><Lock size={10}/> Read Only</span>}
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
                
                <div className="relative">
                    <button onClick={() => setShowShareDropdown(!showShareDropdown)} className={`p-2 rounded-lg text-white font-bold flex items-center gap-2 ${isSharedSession ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-slate-700 hover:bg-slate-600'}`}>
                        <Share2 size={18} />
                        <span className="hidden sm:inline">{isSharedSession ? 'Share' : 'Share'}</span>
                    </button>
                    {showShareDropdown && (
                        <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowShareDropdown(false)}></div>
                        <div className="absolute top-full right-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-40 overflow-hidden py-1">
                            <button onClick={() => handleShare('read')} className="w-full text-left px-4 py-2 hover:bg-slate-800 text-xs text-slate-300 hover:text-white flex items-center gap-2">
                                <Eye size={12} /> Copy Read-Only Link
                            </button>
                            <button onClick={() => handleShare('edit')} className="w-full text-left px-4 py-2 hover:bg-slate-800 text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-2">
                                <Edit3 size={12} /> Copy Edit Link
                            </button>
                        </div>
                        </>
                    )}
                </div>
            </div>
        </div>

        {/* Toolbar */}
        <div className={`bg-slate-900 border-b border-slate-800 p-2 flex flex-wrap justify-center gap-4 shrink-0 z-10 items-center ${isReadOnly ? 'opacity-50 pointer-events-none' : ''}`}>
            
            <div className="flex bg-slate-800 rounded-lg p-1">
                <button onClick={() => { setTool('select'); setIsDrawing(false); }} className={`p-2 rounded ${tool === 'select' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Select (Double click text to edit)">
                    <MousePointer2 size={18}/>
                </button>
                <button onClick={() => setTool('pan')} className={`p-2 rounded ${tool === 'pan' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'} ${isReadOnly ? 'pointer-events-auto opacity-100' : ''}`} title="Pan (Space)">
                    <Move size={18}/>
                </button>
                <div className="w-px bg-slate-700 mx-1"></div>
                <button onClick={() => setTool('pen')} className={`p-2 rounded ${tool === 'pen' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Brushes">
                    <PenTool size={18}/>
                </button>
                <button onClick={() => setTool('eraser')} className={`p-2 rounded ${tool === 'eraser' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Eraser">
                    <Eraser size={18}/>
                </button>
                <button onClick={() => setTool('text')} className={`p-2 rounded ${tool === 'text' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Text (Click to type, Drag for box)">
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
            
            {/* Extended Brush Styles (Only for Pen) */}
            {tool === 'pen' && (
                <div className="flex bg-slate-800 rounded-lg p-1 animate-fade-in gap-1 max-w-md flex-wrap justify-center">
                    <button onClick={() => setBrushType('standard')} className={`p-1.5 rounded ${brushType === 'standard' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'}`} title="Standard Pen">
                        <PenTool size={16} />
                    </button>
                    <button onClick={() => setBrushType('writing-brush')} className={`p-1.5 rounded ${brushType === 'writing-brush' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'}`} title="Chinese Brush">
                        <Brush size={16} />
                    </button>
                    <button onClick={() => setBrushType('pencil')} className={`p-1.5 rounded ${brushType === 'pencil' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'}`} title="Natural Pencil">
                        <Pencil size={16} />
                    </button>
                    <button onClick={() => setBrushType('marker')} className={`p-1.5 rounded ${brushType === 'marker' ? 'bg-slate-700 text-yellow-300' : 'text-slate-400 hover:text-slate-300'}`} title="Marker">
                        <Highlighter size={16} />
                    </button>
                    <button onClick={() => setBrushType('calligraphy-pen')} className={`p-1.5 rounded ${brushType === 'calligraphy-pen' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'}`} title="Ribbon Pen">
                        <Feather size={16} />
                    </button>
                    <button onClick={() => setBrushType('airbrush')} className={`p-1.5 rounded ${brushType === 'airbrush' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'}`} title="Airbrush">
                        <SprayCan size={16} />
                    </button>
                    <button onClick={() => setBrushType('oil')} className={`p-1.5 rounded ${brushType === 'oil' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'}`} title="Oil Brush">
                        <Brush size={16} />
                    </button>
                    <button onClick={() => setBrushType('watercolor')} className={`p-1.5 rounded ${brushType === 'watercolor' ? 'bg-slate-700 text-blue-300' : 'text-slate-400 hover:text-slate-300'}`} title="Watercolor">
                        <Droplet size={16} />
                    </button>
                    <button onClick={() => setBrushType('crayon')} className={`p-1.5 rounded ${brushType === 'crayon' ? 'bg-slate-700 text-orange-300' : 'text-slate-400 hover:text-slate-300'}`} title="Crayon">
                        <Edit3 size={16} />
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
        <div className={`flex-1 relative overflow-hidden bg-slate-950 touch-none ${isReadOnly && tool !== 'pan' ? 'cursor-default' : 'cursor-crosshair'}`}>
            <canvas 
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onDoubleClick={handleDoubleClick}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="block w-full h-full"
                style={{ cursor: tool === 'pan' ? (isPanning ? 'grabbing' : 'grab') : (isReadOnly ? 'default' : (tool === 'select' ? 'default' : 'crosshair')) }}
            />
            
            {textInput && !isReadOnly && (
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
                        width: textInput.width ? textInput.width * scale : 'auto',
                        minWidth: '50px',
                        height: textInput.height ? textInput.height * scale : 'auto',
                        overflow: 'hidden',
                        resize: 'both',
                        whiteSpace: textInput.width ? 'pre-wrap' : 'pre',
                        zIndex: 20,
                        padding: 0,
                        margin: 0,
                        lineHeight: 1.2
                    }}
                    placeholder="Type..."
                />
            )}
        </div>
    </div>
  );
};
