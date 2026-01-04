
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { CodeProject, CodeFile, UserProfile, Channel, CursorPosition, CloudItem } from '../types';
import { ArrowLeft, Save, Plus, Github, Cloud, HardDrive, Code, X, ChevronRight, ChevronDown, File, Folder, DownloadCloud, Loader2, CheckCircle, AlertTriangle, Info, FolderPlus, FileCode, RefreshCw, LogIn, CloudUpload, Trash2, ArrowUp, Edit2, FolderOpen, MoreVertical, Send, MessageSquare, Bot, Mic, Sparkles, SidebarClose, SidebarOpen, Users, Eye, FileText as FileTextIcon, Image as ImageIcon, StopCircle, Minus, Maximize2, Minimize2, Lock, Unlock, Share2, Terminal, Copy, WifiOff, PanelRightClose, PanelRightOpen, PanelLeftClose, PanelLeftOpen, Monitor, Laptop, PenTool, Edit3, ShieldAlert, ZoomIn, ZoomOut, Columns, Rows, Grid2X2, Square as SquareIcon, GripVertical, GripHorizontal, FileSearch, Indent, Wand2, Check, UserCheck, Briefcase, FileUser, Trophy, Star, Play, Camera, MonitorCheck, Upload } from 'lucide-react';
import { listCloudDirectory, saveProjectToCloud, deleteCloudItem, createCloudFolder, subscribeToCodeProject, saveCodeProject, updateCodeFile, updateCursor, claimCodeProjectLock, updateProjectActiveFile, deleteCodeFile, moveCloudFile, updateProjectAccess, sendShareNotification, deleteCloudFolderRecursive } from '../services/firestoreService';
import { ensureCodeStudioFolder, listDriveFiles, readDriveFile, saveToDrive, deleteDriveFile, createDriveFolder, DriveFile, moveDriveFile } from '../services/googleDriveService';
import { connectGoogleDrive, signInWithGitHub } from '../services/authService';
import { fetchRepoInfo, fetchRepoContents, fetchFileContent, updateRepoFile, deleteRepoFile, renameRepoFile } from '../services/githubService';
import { MarkdownView } from './MarkdownView';
import { encodePlantUML } from '../utils/plantuml';
import { Whiteboard } from './Whiteboard';
import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';
import { ShareModal } from './ShareModal';

// --- Interfaces & Constants ---

type InterviewMode = 'coding' | 'system-design' | 'behavioral';

interface TreeNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
  data?: any;
  isLoaded?: boolean;
  status?: 'modified' | 'new' | 'deleted';
}

type LayoutMode = 'single' | 'split-v' | 'split-h' | 'quad';
type IndentMode = 'tabs' | 'spaces';

interface CodeStudioProps {
  onBack: () => void;
  currentUser: any;
  userProfile: UserProfile | null;
  sessionId?: string;
  accessKey?: string;
  onSessionStart: (id: string) => void;
  onSessionStop: () => void;
  onStartLiveSession: (channel: Channel, context?: string) => void;
}

function getLanguageFromExt(filename: string): any {
    if (!filename) return 'text';
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['js', 'jsx'].includes(ext || '')) return 'javascript';
    if (['ts', 'tsx'].includes(ext || '')) return 'typescript';
    if (ext === 'py') return 'python';
    if (['cpp', 'c', 'h', 'hpp'].includes(ext || '')) return 'c++';
    if (ext === 'html') return 'html';
    if (ext === 'css') return 'css';
    if (ext === 'json') return 'json';
    if (ext === 'md') return 'markdown';
    if (['puml', 'plantuml'].includes(ext || '')) return 'plantuml';
    if (['draw', 'whiteboard', 'wb'].includes(ext || '')) return 'whiteboard';
    return 'text';
}

const FileIcon = ({ filename }: { filename: string }) => {
    if (!filename) return <File size={16} className="text-slate-500" />;
    const lang = getLanguageFromExt(filename);
    if (lang === 'javascript' || lang === 'typescript') return <FileCode size={16} className="text-yellow-400" />;
    if (lang === 'python') return <FileCode size={16} className="text-blue-400" />;
    if (lang === 'c++') return <FileCode size={16} className="text-indigo-400" />;
    if (lang === 'html') return <FileCode size={16} className="text-orange-400" />;
    if (lang === 'css') return <FileCode size={16} className="text-blue-300" />;
    if (lang === 'json') return <FileCode size={16} className="text-green-400" />;
    if (lang === 'markdown') return <FileTextIcon size={16} className="text-slate-400" />;
    if (lang === 'plantuml') return <ImageIcon size={16} className="text-pink-400" />;
    if (lang === 'whiteboard') return <PenTool size={16} className="text-pink-500" />;
    return <File size={16} className="text-slate-500" />;
};

const FileTreeItem = ({ node, depth, activeId, onSelect, onToggle, onDelete, onRename, onShare, expandedIds, loadingIds, onDragStart, onDrop }: any) => {
    const isExpanded = expandedIds[node.id];
    const isLoading = loadingIds[node.id];
    const isActive = activeId === node.id;
    
    return (
        <div>
            <div 
                className={`flex items-center gap-1 py-1 px-2 cursor-pointer select-none hover:bg-slate-800/50 group ${isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={() => onSelect(node)}
                draggable
                onDragStart={(e) => onDragStart(e, node)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, node)}
            >
                {node.type === 'folder' && (
                    <div onClick={(e) => { e.stopPropagation(); onToggle(node); }} className="p-0.5 hover:text-white">
                        {isLoading ? <Loader2 size={12} className="animate-spin"/> : isExpanded ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                    </div>
                )}
                {node.type === 'folder' ? (
                    isExpanded ? <FolderOpen size={16} className="text-indigo-400"/> : <Folder size={16} className="text-indigo-400"/>
                ) : (
                    <FileIcon filename={node.name} />
                )}
                <span className="text-xs truncate flex-1">{node.name}</span>
                {node.status === 'modified' && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-1"></div>}
            </div>
            {isExpanded && node.children && (
                <div>
                    {node.children.map((child: any) => (
                        <FileTreeItem 
                            key={child.id} 
                            node={child} 
                            depth={depth + 1} 
                            activeId={activeId} 
                            onSelect={node.data ? (node.data.id ? () => onSelect(child) : () => {}) : () => {}} 
                            onToggle={onToggle} 
                            onDelete={onDelete} 
                            onRename={onRename}
                            onShare={onShare}
                            expandedIds={expandedIds} 
                            loadingIds={loadingIds}
                            onDragStart={onDragStart}
                            onDrop={onDrop}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const RichCodeEditor = ({ code, onChange, onCursorMove, language, readOnly, fontSize, indentMode }: any) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);
    const lineCount = (code || '').split('\n').length;
    
    const handleScroll = () => {
        if (textareaRef.current && lineNumbersRef.current) {
            lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            if (readOnly) return;
            
            const target = e.currentTarget;
            const start = target.selectionStart;
            const end = target.selectionEnd;
            const value = target.value;
            const tabStr = indentMode === 'spaces' ? "    " : "\t"; 
            
            const updatedValue = value.substring(0, start) + tabStr + value.substring(end);
            onChange(updatedValue);

            // Sync the cursor position after the DOM update
            requestAnimationFrame(() => {
                target.selectionStart = target.selectionEnd = start + tabStr.length;
            });
        }
    };

    const editorStyles = { 
        fontSize: `${fontSize}px`, 
        lineHeight: '1.6', 
        tabSize: 4, 
        MozTabSize: 4 
    } as React.CSSProperties;

    return (
        <div className="w-full h-full flex bg-slate-950 font-mono overflow-hidden relative">
            <div ref={lineNumbersRef} className="w-12 flex-shrink-0 bg-slate-900 text-slate-600 py-4 text-right pr-3 select-none overflow-hidden border-r border-slate-800" style={editorStyles}>
                {Array.from({ length: lineCount }).map((_, i) => <div key={i} className="h-[1.6em]">{i + 1}</div>)}
            </div>
            <textarea
                ref={textareaRef}
                className="flex-1 bg-transparent text-slate-300 p-4 resize-none outline-none leading-relaxed overflow-auto whitespace-pre"
                style={editorStyles}
                value={code || ''}
                wrap="off"
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onScroll={handleScroll}
                onSelect={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    const val = target.value.substr(0, target.selectionStart);
                    const lines = val.split('\n');
                    if (onCursorMove) onCursorMove(lines.length, lines[lines.length - 1].length);
                }}
                spellCheck={false}
                readOnly={readOnly}
            />
        </div>
    );
};

const AIChatPanel = ({ isOpen, onClose, messages, onSendMessage, isThinking, isInterviewMode, timerValue }: any) => {
    const [input, setInput] = useState('');
    return (
        <div className="flex flex-col h-full bg-slate-950 border-l border-slate-800">
            <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                <span className="font-bold text-slate-300 text-sm flex items-center gap-2">
                    {isInterviewMode ? <UserCheck size={16} className="text-emerald-400"/> : <Bot size={16} className="text-indigo-400"/>} 
                    {isInterviewMode ? 'Lead Interviewer' : 'AI Assistant'}
                </span>
                {isInterviewMode && (
                    <div className="flex items-center gap-2 px-2 py-0.5 bg-red-900/20 border border-red-900/50 rounded-full animate-pulse">
                        <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                        <span className="text-[10px] font-mono text-red-400">{timerValue}</span>
                    </div>
                )}
                <button onClick={onClose} title="Minimize Panel"><PanelRightClose size={16} className="text-slate-500 hover:text-white"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((m: any, i: number) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[95%] rounded-lg p-3 text-sm leading-relaxed ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                            {m.role === 'ai' ? <MarkdownView content={m.text} /> : <p className="whitespace-pre-wrap">{m.text}</p>}
                        </div>
                    </div>
                ))}
                {isThinking && <div className="text-slate-500 text-xs flex items-center gap-2 justify-center"><Loader2 className="animate-spin" size={12}/> Interviewer is processing...</div>}
            </div>
            <div className="p-3 border-t border-slate-800 bg-slate-950">
                <div className="flex gap-2">
                    <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if(e.key === 'Enter') { onSendMessage(input); setInput(''); } }} className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500 placeholder-slate-600" placeholder={isInterviewMode ? "Speak to interviewer..." : "Ask AI..."} />
                    <button onClick={() => { onSendMessage(input); setInput(''); }} className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"><Send size={16}/></button>
                </div>
            </div>
        </div>
    );
};

export const CodeStudio: React.FC<CodeStudioProps> = ({ onBack, currentUser, userProfile, sessionId, accessKey, onSessionStart, onSessionStop, onStartLiveSession }) => {
  const defaultFile: CodeFile = {
      name: 'hello.cpp',
      path: 'cloud://hello.cpp',
      language: 'c++',
      content: `#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}`,
      loaded: true,
      isDirectory: false,
      isModified: true
  };

  // MULTI-PANE STATE
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('single');
  const [activeSlots, setActiveSlots] = useState<(CodeFile | null)[]>([defaultFile, null, null, null]);
  const [focusedSlot, setFocusedSlot] = useState<number>(0);
  const [slotViewModes, setSlotViewModes] = useState<Record<number, 'code' | 'preview'>>({});
  const [innerSplitRatio, setInnerSplitRatio] = useState(50);
  const [isDraggingInner, setIsDraggingInner] = useState(false);
  const [project, setProject] = useState<CodeProject>({ id: 'init', name: 'New Project', files: [defaultFile], lastModified: Date.now() });
  const [activeTab, setActiveTab] = useState<'cloud' | 'drive' | 'github' | 'session'>('cloud');
  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isRightOpen, setIsRightOpen] = useState(true);
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'ai', text: string}>>([{ role: 'ai', text: "Hello! I'm your coding assistant. Open a code file or whiteboard to begin." }]);
  const [isChatThinking, setIsChatThinking] = useState(false);
  const [isFormattingSlots, setIsFormattingSlots] = useState<Record<number, boolean>>({});
  const [cloudItems, setCloudItems] = useState<CloudItem[]>([]); 
  const [driveItems, setDriveItems] = useState<(DriveFile & { parentId?: string, isLoaded?: boolean })[]>([]); 
  const [driveRootId, setDriveRootId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [loadingFolders, setLoadingFolders] = useState<Record<string, boolean>>({});
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'modified' | 'saving'>('saved');
  const [isSharedSession, setIsSharedSession] = useState(!!sessionId);
  const [fontSize, setFontSize] = useState(14);
  const [indentMode, setIndentMode] = useState<IndentMode>('spaces');
  const [leftWidth, setLeftWidth] = useState(256); 
  const [rightWidth, setRightWidth] = useState(320); 
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  // --- MOCK INTERVIEW STATE ---
  const [isInterviewMode, setIsInterviewMode] = useState(false);
  const [interviewStep, setInterviewStep] = useState<'setup' | 'active' | 'feedback'>('setup');
  const [activeInterviewMode, setActiveInterviewMode] = useState<InterviewMode>('coding');
  const [resumeText, setResumeText] = useState(userProfile?.interests?.join(', ') || '');
  const [jobDescription, setJobDescription] = useState('');
  const [interviewFeedback, setInterviewFeedback] = useState<string | null>(null);
  const [interviewScore, setInterviewScore] = useState<number | null>(null);
  const [interviewTimer, setInterviewTimer] = useState(1800); // 30 mins
  const timerRef = useRef<any>(null);

  // Recording Ref
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const centerContainerRef = useRef<HTMLDivElement>(null);
  const activeFile = activeSlots[focusedSlot];

  // Tools
  const updateFileTool: FunctionDeclaration = {
    name: "update_active_file",
    description: "Updates the content of the currently focused file in the editor.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        new_content: { type: Type.STRING, description: "Complete new content." },
        summary: { type: Type.STRING, description: "Change summary." }
      },
      required: ["new_content"]
    }
  };

  const submitFeedbackTool: FunctionDeclaration = {
      name: "submit_interview_feedback",
      description: "Submit final feedback and scoring.",
      parameters: {
          type: Type.OBJECT,
          properties: {
              score: { type: Type.NUMBER, description: "0-100" },
              summary: { type: Type.STRING, description: "Narrative feedback in Markdown" }
          },
          required: ["score", "summary"]
      }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const setupRecording = async () => {
      try {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          
          const canvas = document.createElement('canvas');
          canvas.width = 1920; canvas.height = 1080;
          const ctx = canvas.getContext('2d');

          const vScreen = document.createElement('video');
          vScreen.muted = true; vScreen.srcObject = screenStream;
          await vScreen.play();

          const vCam = document.createElement('video');
          vCam.muted = true; vCam.srcObject = cameraStream;
          await vCam.play();

          const draw = () => {
              if (!ctx) return;
              ctx.drawImage(vScreen, 0, 0, canvas.width, canvas.height);
              const pipW = 480;
              const pipH = (vCam.videoHeight / vCam.videoWidth) * pipW || 360;
              const margin = 40;
              ctx.fillStyle = 'rgba(0,0,0,0.5)';
              ctx.fillRect(canvas.width - pipW - margin - 5, canvas.height - pipH - margin - 5, pipW + 10, pipH + 10);
              ctx.drawImage(vCam, canvas.width - pipW - margin, canvas.height - pipH - margin, pipW, pipH);
              animationFrameRef.current = requestAnimationFrame(draw);
          };
          draw();

          const mixedStream = canvas.captureStream(30);
          screenStream.getAudioTracks().forEach(t => mixedStream.addTrack(t));
          cameraStream.getAudioTracks().forEach(t => mixedStream.addTrack(t));
          
          recordingStreamRef.current = mixedStream;
          const recorder = new MediaRecorder(mixedStream, { mimeType: 'video/webm;codecs=vp9' });
          recorderChunksRef.current = [];
          recorder.ondataavailable = (e) => { if(e.data.size > 0) recorderChunksRef.current.push(e.data); };
          recorder.start(1000);
          mediaRecorderRef.current = recorder;
      } catch(e) { console.error("Recording init failed", e); }
  };

  const handleStartInterview = async () => {
      setInterviewStep('active');
      setInterviewTimer(1800);
      setChatMessages([{ role: 'ai', text: `Lead Interviewer here. We are conducting a 30-minute **${activeInterviewMode.replace('-', ' ').toUpperCase()}** session. Please begin by walking me through your background as it relates to the JD.` }]);
      
      // Auto-adjust layout for mode
      if (activeInterviewMode === 'system-design') {
          handleCreateWhiteboard('Interview_Canvas.wb');
      } else if (activeInterviewMode === 'behavioral') {
          setIsLeftOpen(false);
      }

      await setupRecording();
      
      timerRef.current = setInterval(() => {
          setInterviewTimer(t => {
              if (t <= 1) { 
                  clearInterval(timerRef.current); 
                  handleSendMessage("Time is up. Summarize your final evaluation."); 
                  return 0; 
              }
              return t - 1;
          });
      }, 1000);
      setIsRightOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'resume' | 'jd') => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      if (target === 'resume') setResumeText(text);
      else setJobDescription(text);
  };

  const stopRecordingAndSave = async () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          const stopPromise = new Promise<void>(res => {
              if (mediaRecorderRef.current) {
                  mediaRecorderRef.current.onstop = () => res();
                  mediaRecorderRef.current.stop();
              } else res();
          });
          await stopPromise;
      }
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (recordingStreamRef.current) recordingStreamRef.current.getTracks().forEach(t => t.stop());

      if (recorderChunksRef.current.length > 0) {
          try {
              let token = driveToken;
              if (!token) token = await connectGoogleDrive();
              let rootId = driveRootId;
              if (!rootId) rootId = await ensureCodeStudioFolder(token);
              const blob = new Blob(recorderChunksRef.current, { type: 'video/webm' });
              const name = `Interview_${activeInterviewMode}_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
              const reader = new FileReader();
              reader.onload = async () => {
                  await saveToDrive(token!, rootId!, name, reader.result as string, 'video/webm');
              };
              reader.readAsArrayBuffer(blob);
          } catch(e) { console.error("Drive save failed", e); }
      }
  };

  const handleResetInterview = () => {
      setIsInterviewMode(false);
      setInterviewStep('setup');
      setInterviewFeedback(null);
      setInterviewScore(null);
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current) stopRecordingAndSave();
  };

  const handleSendMessage = async (input: string) => {
      if (!input.trim()) return;
      setChatMessages(prev => [...prev, { role: 'user', text: input }]);
      setIsChatThinking(true);
      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const contextFiles = activeSlots.filter(f => f !== null).map(f => `File: ${f?.name}\nContent:\n${f?.content}`).join('\n\n---\n\n');
          
          let systemPrompt = `You are a Lead Interviewer at a Tier-1 tech company. 
          MODE: ${activeInterviewMode}
          RESUME: ${resumeText}
          JD: ${jobDescription}
          WORKSPACE: ${contextFiles}
          
          Conduct a high-stakes interview. Be professional and objective.
          If finished, call 'submit_interview_feedback'.`;

          const tools: any[] = [{ functionDeclarations: [updateFileTool, submitFeedbackTool] }];
          const resp = await ai.models.generateContent({ 
              model: 'gemini-3-flash-preview', 
              contents: systemPrompt + `\n\nUser: ${input}`,
              config: { tools }
          });

          if (resp.functionCalls) {
              for (const fc of resp.functionCalls) {
                  if (fc.name === 'update_active_file') {
                      handleCodeChangeInSlot(fc.args.new_content, focusedSlot);
                      setChatMessages(prev => [...prev, { role: 'ai', text: `Code updated. ${fc.args.summary || ''}` }]);
                  } else if (fc.name === 'submit_interview_feedback') {
                      setInterviewScore(fc.args.score);
                      setInterviewFeedback(fc.args.summary);
                      setInterviewStep('feedback');
                      if (timerRef.current) clearInterval(timerRef.current);
                      stopRecordingAndSave();
                  }
              }
          } else {
              setChatMessages(prev => [...prev, { role: 'ai', text: resp.text || "" }]);
          }
      } catch (e: any) { setChatMessages(prev => [...prev, { role: 'ai', text: `Error: ${e.message}` }]); } finally { setIsChatThinking(false); }
  };

  const handleCodeChangeInSlot = (newCode: string, slotIdx: number) => {
      const file = activeSlots[slotIdx];
      if (!file) return;
      const updatedFile = { ...file, content: newCode, isModified: true };
      const newSlots = [...activeSlots];
      newSlots[slotIdx] = updatedFile;
      setActiveSlots(newSlots);
      setSaveStatus('modified');
      if (isSharedSession && sessionId) updateCodeFile(sessionId, updatedFile);
  };

  const handleCreateWhiteboard = async (name: string) => {
      const fileName = name.endsWith('.wb') ? name : name + '.wb';
      const newFile: CodeFile = { name: fileName, path: fileName, language: 'whiteboard', content: "[]", loaded: true, isDirectory: false, isModified: true };
      updateSlotFile(newFile, focusedSlot);
  };

  const updateSlotFile = async (file: CodeFile | null, slotIndex: number) => {
      const newSlots = [...activeSlots];
      newSlots[slotIndex] = file;
      setActiveSlots(newSlots);
  };

  const handleExplorerSelect = async (node: TreeNode) => {
    if (node.type === 'file') {
        let fileData: CodeFile | null = null;
        if (activeTab === 'cloud') {
              const item = node.data as CloudItem;
              if (item.url) {
                  const res = await fetch(item.url);
                  const text = await res.text();
                  fileData = { name: item.name, path: item.fullPath, content: text, language: getLanguageFromExt(item.name), loaded: true, isDirectory: false, isModified: false };
              }
        } else if (activeTab === 'drive') {
              const driveFile = node.data as DriveFile;
              if (driveToken) {
                  const text = await readDriveFile(driveToken, driveFile.id);
                  fileData = { name: driveFile.name, path: `drive://${driveFile.id}`, content: text, language: getLanguageFromExt(driveFile.name), loaded: true, isDirectory: false, isModified: false };
              }
        } else { fileData = node.data; }
        if (fileData) updateSlotFile(fileData, focusedSlot);
    } else {
        setExpandedFolders(prev => ({...prev, [node.id]: !prev[node.id]}));
    }
  };

  const handleSetLayout = (mode: LayoutMode) => { setLayoutMode(mode); };
  const refreshCloudPath = async (p: string) => { const items = await listCloudDirectory(p); setCloudItems(items); };
  const handleCloudToggle = async (n: TreeNode) => { setExpandedFolders(p => ({ ...p, [n.id]: !p[n.id] })); if (!expandedFolders[n.id]) refreshCloudPath(n.id); };

  const cloudTree = useMemo(() => {
      const freshRoot: TreeNode[] = [];
      const freshMap = new Map<string, TreeNode>();
      cloudItems.forEach(item => freshMap.set(item.fullPath, { id: item.fullPath, name: item.name, type: item.isFolder ? 'folder' : 'file', data: item, children: [], isLoaded: true }));
      cloudItems.forEach(item => { const node = freshMap.get(item.fullPath)!; const parts = item.fullPath.split('/'); parts.pop(); const parentPath = parts.join('/'); if (freshMap.has(parentPath)) { freshMap.get(parentPath)!.children.push(node); } else { freshRoot.push(node); } });
      return freshRoot;
  }, [cloudItems]);

  const renderSlot = (idx: number) => {
      const file = activeSlots[idx];
      const isFocused = focusedSlot === idx;
      const isVisible = layoutMode === 'single' ? idx === 0 : (layoutMode === 'quad' ? true : idx < 2);
      if (!isVisible) return null;
      return (
          <div key={idx} onClick={() => setFocusedSlot(idx)} className={`flex flex-col min-w-0 border ${isFocused ? 'border-indigo-500' : 'border-slate-800'} relative bg-slate-950 flex-1`}>
              {file ? (
                  <>
                    <div className="px-4 py-2 flex items-center justify-between bg-slate-900 border-b border-slate-800">
                        <span className="text-xs font-bold text-slate-300">{file.name}</span>
                        <button onClick={() => updateSlotFile(null, idx)}><X size={14}/></button>
                    </div>
                    <div className="flex-1">
                        {getLanguageFromExt(file.name) === 'whiteboard' ? <Whiteboard initialData={file.content} onDataChange={(c) => handleCodeChangeInSlot(c, idx)} disableAI /> : <RichCodeEditor code={file.content} onChange={(c: string) => handleCodeChangeInSlot(c, idx)} language={file.language} fontSize={fontSize} indentMode={indentMode} />}
                    </div>
                  </>
              ) : <div className="flex-1 flex items-center justify-center text-slate-800">Pane {idx + 1}</div>}
          </div>
      );
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <header className="h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 z-20">
         <div className="flex items-center space-x-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"><ArrowLeft size={20} /></button>
            <h1 className="font-bold text-white text-sm flex items-center gap-2">
                {isInterviewMode ? <UserCheck className="text-emerald-400" size={18}/> : <Code className="text-indigo-400" size={18}/>}
                {isInterviewMode ? 'Interview Studio' : project.name}
            </h1>
         </div>
         <div className="flex items-center space-x-2">
            {!isInterviewMode ? <button onClick={() => setIsInterviewMode(true)} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold animate-pulse">Mock Interview</button> : <button onClick={handleResetInterview} className="text-xs text-slate-400 hover:text-white font-bold">Exit Mode</button>}
            <button onClick={() => setIsRightOpen(!isRightOpen)} className={`p-2 rounded-lg ${isRightOpen ? 'bg-slate-800 text-white' : 'text-slate-500'}`}><PanelRightOpen size={20} /></button>
         </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
          <div className={`${isLeftOpen ? '' : 'hidden'} bg-slate-900 border-r border-slate-800 flex flex-col shrink-0`} style={{ width: `${leftWidth}px` }}>
              <div className="flex border-b border-slate-800 bg-slate-900">
                  <button onClick={() => setActiveTab('cloud')} className={`flex-1 py-3 text-xs font-bold ${activeTab === 'cloud' ? 'text-white border-b-2 border-indigo-500' : 'text-slate-500'}`}>CLOUD</button>
                  <button onClick={() => setActiveTab('drive')} className={`flex-1 py-3 text-xs font-bold ${activeTab === 'drive' ? 'text-white border-b-2 border-indigo-500' : 'text-slate-500'}`}>DRIVE</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                  {activeTab === 'cloud' && cloudTree.map(node => <FileTreeItem key={node.id} node={node} depth={0} activeId={activeFile?.path} onSelect={handleExplorerSelect} onToggle={handleCloudToggle} expandedIds={expandedFolders} loadingIds={loadingFolders}/>)}
              </div>
          </div>

          <div className="flex-1 bg-slate-950 flex flex-col relative min-w-0">
              {isInterviewMode && interviewStep === 'setup' && (
                  <div className="absolute inset-0 z-50 bg-slate-950 flex items-center justify-center p-8 overflow-y-auto">
                      <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-10 shadow-2xl space-y-8 animate-fade-in-up">
                          <div className="flex items-center gap-4">
                              <div className="p-3 bg-emerald-500/20 rounded-2xl text-emerald-400"><UserCheck size={32} /></div>
                              <div>
                                  <h2 className="text-2xl font-black text-white">Interview Config</h2>
                                  <p className="text-slate-400 text-sm">30-min session with auto-recording.</p>
                              </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                              {(['coding', 'system-design', 'behavioral'] as InterviewMode[]).map(m => (
                                  <button key={m} onClick={() => setActiveInterviewMode(m)} className={`py-3 rounded-xl border text-xs font-bold capitalize transition-all ${activeInterviewMode === m ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                                      {m.replace('-', ' ')}
                                  </button>
                              ))}
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><FileUser size={14}/> Resume</label>
                                  <div className="relative group">
                                      <textarea value={resumeText} onChange={e => setResumeText(e.target.value)} placeholder="Paste resume..." className="w-full h-40 bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 outline-none focus:border-emerald-500"/>
                                      <label className="absolute bottom-2 right-2 p-2 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors"><Upload size={14}/><input type="file" className="hidden" accept=".txt,.md" onChange={e => handleFileUpload(e, 'resume')}/></label>
                                  </div>
                              </div>
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Briefcase size={14}/> Job Description</label>
                                  <div className="relative group">
                                      <textarea value={jobDescription} onChange={e => setJobDescription(e.target.value)} placeholder="Paste JD..." className="w-full h-40 bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 outline-none focus:border-indigo-500"/>
                                      <label className="absolute bottom-2 right-2 p-2 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors"><Upload size={14}/><input type="file" className="hidden" accept=".txt,.md" onChange={e => handleFileUpload(e, 'jd')}/></label>
                                  </div>
                              </div>
                          </div>

                          <div className="flex gap-4">
                              <button onClick={handleResetInterview} className="flex-1 py-4 bg-slate-800 text-slate-300 font-bold rounded-2xl">Cancel</button>
                              <button onClick={handleStartInterview} className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl shadow-xl flex items-center justify-center gap-2">
                                <Play size={20} fill="currentColor"/><span>Start 30-Min Interview</span>
                              </button>
                          </div>
                          <div className="text-center space-y-1">
                              <p className="text-[10px] text-slate-500 uppercase tracking-widest flex items-center justify-center gap-2"><MonitorCheck size={10}/> Recording Screen & Camera</p>
                              <p className="text-[10px] text-slate-500 uppercase tracking-widest flex items-center justify-center gap-2"><CloudUpload size={10}/> Auto-Save to Google Drive</p>
                          </div>
                      </div>
                  </div>
              )}

              {interviewStep === 'feedback' && (
                  <div className="absolute inset-0 z-50 bg-slate-950 flex items-center justify-center p-8 overflow-y-auto">
                      <div className="max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-10 shadow-2xl space-y-8 animate-fade-in-up">
                          <div className="flex justify-between items-start">
                              <div className="flex items-center gap-4">
                                  <div className="p-4 bg-emerald-500 text-white rounded-2xl shadow-xl"><Trophy size={32} /></div>
                                  <div>
                                      <h2 className="text-2xl font-black text-white">Interview Report</h2>
                                      <p className="text-slate-400 text-sm">Session saved to GDrive.</p>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <div className="text-5xl font-black text-emerald-400">{interviewScore}</div>
                                  <div className="text-[10px] font-bold text-slate-500 uppercase">Score</div>
                              </div>
                          </div>
                          <div className="bg-slate-950 p-8 rounded-2xl border border-slate-800 max-h-96 overflow-y-auto"><MarkdownView content={interviewFeedback || ""} /></div>
                          <button onClick={handleResetInterview} className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl">Return to Studio</button>
                      </div>
                  </div>
              )}

              <div className={`flex-1 flex ${layoutMode === 'split-v' ? 'flex-row' : 'flex-col'}`}>
                  {renderSlot(0)}
                  {layoutMode !== 'single' && renderSlot(1)}
              </div>
          </div>

          <div className={`${isRightOpen ? '' : 'hidden'} bg-slate-950 flex flex-col shrink-0`} style={{ width: `${rightWidth}px` }}>
              <AIChatPanel isOpen={true} onClose={() => setIsRightOpen(false)} messages={chatMessages} onSendMessage={handleSendMessage} isThinking={isChatThinking} isInterviewMode={isInterviewMode} timerValue={formatTime(interviewTimer)} />
          </div>
      </div>
    </div>
  );
};
