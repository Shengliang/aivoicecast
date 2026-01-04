import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { CodeProject, CodeFile, UserProfile, Channel, CursorPosition, CloudItem } from '../types';
import { ArrowLeft, Save, Plus, Github, Cloud, HardDrive, Code, X, ChevronRight, ChevronDown, File, Folder, DownloadCloud, Loader2, CheckCircle, AlertTriangle, Info, FolderPlus, FileCode, RefreshCw, LogIn, CloudUpload, Trash2, ArrowUp, Edit2, FolderOpen, MoreVertical, Send, MessageSquare, Bot, Mic, Sparkles, SidebarClose, SidebarOpen, Users, Eye, FileText as FileTextIcon, Image as ImageIcon, StopCircle, Minus, Maximize2, Minimize2, Lock, Unlock, Share2, Terminal, Copy, WifiOff, PanelRightClose, PanelRightOpen, PanelLeftClose, PanelLeftOpen, Monitor, Laptop, PenTool, Edit3, ShieldAlert, ZoomIn, ZoomOut, Columns, Rows, Grid2X2, Square as SquareIcon, GripVertical, GripHorizontal, FileSearch, Indent, Wand2, Check, UserCheck, Briefcase, FileUser, Trophy, Star, Play, Camera, History, Search, FileUp } from 'lucide-react';
import { listCloudDirectory, saveProjectToCloud, deleteCloudItem, createCloudFolder, subscribeToCodeProject, saveCodeProject, updateCodeFile, updateCursor, claimCodeProjectLock, updateProjectActiveFile, deleteCodeFile, moveCloudFile, updateProjectAccess, sendShareNotification, deleteCloudFolderRecursive } from '../services/firestoreService';
import { ensureCodeStudioFolder, listDriveFiles, readDriveFile, saveToDrive, deleteDriveFile, createDriveFolder, DriveFile, moveDriveFile } from '../services/googleDriveService';
import { connectGoogleDrive, signInWithGitHub } from '../services/authService';
import { fetchRepoInfo, fetchRepoContents, fetchFileContent, updateRepoFile, deleteRepoFile, renameRepoFile } from '../services/githubService';
import { MarkdownView } from './MarkdownView';
import { encodePlantUML } from '../utils/plantuml';
import { Whiteboard } from './Whiteboard';
import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';

// --- Interfaces & Constants ---

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
type InterviewType = 'coding' | 'system-design' | 'behavior';

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
                            onSelect={onSelect} 
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

const AIChatPanel = ({ isOpen, onClose, messages, onSendMessage, isThinking }: any) => {
    const [input, setInput] = useState('');
    return (
        <div className="flex flex-col h-full bg-slate-950 border-l border-slate-800">
            <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                <span className="font-bold text-slate-300 text-sm flex items-center gap-2"><Bot size={16} className="text-indigo-400"/> AI Assistant</span>
                <button onClick={onClose} title="Minimize AI Panel"><PanelRightClose size={16} className="text-slate-500 hover:text-white"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((m: any, i: number) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[95%] rounded-lg p-3 text-sm leading-relaxed ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                            {m.role === 'ai' ? <MarkdownView content={m.text} /> : <p className="whitespace-pre-wrap">{m.text}</p>}
                        </div>
                    </div>
                ))}
                {isThinking && <div className="text-slate-500 text-xs flex items-center gap-2 justify-center"><Loader2 className="animate-spin" size={12}/> AI is thinking...</div>}
            </div>
            <div className="p-3 border-t border-slate-800 bg-slate-950">
                <div className="flex gap-2">
                    <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if(e.key === 'Enter') { onSendMessage(input); setInput(''); } }} className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500 placeholder-slate-600" placeholder="Ask AI to edit code..." />
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
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'ai', text: string}>>([{ role: 'ai', text: "Hello! I'm your coding assistant. Open a code file or whiteboard to begin. You can ask me to **edit the active file directly**." }]);
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
  const [isZenMode, setIsZenMode] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [indentMode, setIndentMode] = useState<IndentMode>('spaces');
  const [leftWidth, setLeftWidth] = useState(256); 
  const [rightWidth, setRightWidth] = useState(320); 
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  // --- MOCK INTERVIEW STATE ---
  const [isInterviewMode, setIsInterviewMode] = useState(false);
  const [interviewStep, setInterviewStep] = useState<'setup' | 'active' | 'feedback' | 'archive'>('setup');
  const [resumeText, setResumeText] = useState(userProfile?.interests?.join(', ') || '');
  const [jobDescription, setJobDescription] = useState('');
  const [interviewType, setInterviewType] = useState<InterviewType>('coding');
  const [interviewFeedback, setInterviewFeedback] = useState<string | null>(null);
  const [interviewScore, setInterviewScore] = useState<number | null>(null);
  const [interviewTimer, setInterviewTimer] = useState(1800); 
  const [pastInterviews, setPastInterviews] = useState<any[]>([]);
  const [archiveSearch, setArchiveSearch] = useState('');
  const timerRef = useRef<any>(null);

  // Recording State
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const centerContainerRef = useRef<HTMLDivElement>(null);
  const activeFile = activeSlots[focusedSlot];

  // Load Past Interviews
  useEffect(() => {
    if (currentUser) {
        listDriveFiles(driveToken || '', driveRootId || '').then(files => {
            setPastInterviews(files.filter(f => f.name.includes('Mock_Interview')));
        }).catch(() => {});
    }
  }, [currentUser, driveToken, driveRootId]);

  // Tool for In-Place Editing
  const updateFileTool: FunctionDeclaration = {
    name: "update_active_file",
    description: "Updates the content of the currently focused file in the editor. Use this whenever the user asks for code modifications, refactoring, or additions to the file they are working on.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        new_content: {
          type: Type.STRING,
          description: "The complete new content of the file."
        },
        summary: {
          type: Type.STRING,
          description: "A brief summary of what you changed."
        }
      },
      required: ["new_content"]
    }
  };

  const submitFeedbackTool: FunctionDeclaration = {
      name: "submit_interview_feedback",
      description: "Submit final feedback and scoring for the mock interview. Use this only when the interview is naturally concluded or requested by the user.",
      parameters: {
          type: Type.OBJECT,
          properties: {
              score: { type: Type.NUMBER, description: "Overall score from 0-100" },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Key positive points" },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Areas for improvement" },
              summary: { type: Type.STRING, description: "Detailed narrative feedback in Markdown" }
          },
          required: ["score", "summary"]
      }
  };

  const setupInterviewRecording = async () => {
      try {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          
          const canvas = document.createElement('canvas');
          canvas.width = 1920;
          canvas.height = 1080;
          const ctx = canvas.getContext('2d');

          const vScreen = document.createElement('video');
          vScreen.muted = true;
          vScreen.srcObject = screenStream;
          await vScreen.play();

          const vCam = document.createElement('video');
          vCam.muted = true;
          vCam.srcObject = cameraStream;
          await vCam.play();

          const draw = () => {
              if (!ctx) return;
              ctx.drawImage(vScreen, 0, 0, canvas.width, canvas.height);
              const pipWidth = 480;
              const pipHeight = (vCam.videoHeight / vCam.videoWidth) * pipWidth || 360;
              const margin = 40;
              ctx.fillStyle = 'rgba(0,0,0,0.5)';
              ctx.fillRect(canvas.width - pipWidth - margin - 5, canvas.height - pipHeight - margin - 5, pipWidth + 10, pipHeight + 10);
              ctx.drawImage(vCam, canvas.width - pipWidth - margin, canvas.height - pipHeight - margin, pipWidth, pipHeight);
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

      } catch(e) {
          console.error("Failed to start interview recording", e);
      }
  };

  const stopInterviewRecordingAndSave = async () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          const stopPromise = new Promise<void>(resolve => {
              if (mediaRecorderRef.current) {
                  mediaRecorderRef.current.onstop = () => resolve();
                  mediaRecorderRef.current.stop();
              } else resolve();
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
              
              const videoBlob = new Blob(recorderChunksRef.current, { type: 'video/webm' });
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              const fileName = `Mock_Interview_${interviewType.toUpperCase()}_${timestamp}.webm`;
              const reportName = `Mock_Interview_REPORT_${interviewType.toUpperCase()}_${timestamp}.md`;
              
              const reader = new FileReader();
              reader.onload = async () => {
                  const content = reader.result as string;
                  await saveToDrive(token!, rootId!, fileName, content, 'video/webm');
                  if (interviewFeedback) {
                      await saveToDrive(token!, rootId!, reportName, `## Interview Score: ${interviewScore}/100\n\n${interviewFeedback}`, 'text/markdown');
                  }
                  console.log("Interview recording and report saved to Google Drive.");
              };
              reader.readAsArrayBuffer(videoBlob);
          } catch(e) {
              console.error("Failed to save recording to Drive", e);
          }
      }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'resume' | 'jd') => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
          const text = event.target?.result as string;
          if (target === 'resume') setResumeText(text);
          else setJobDescription(text);
      };
      reader.readAsText(file);
  };

  const handleSetLayout = (mode: LayoutMode) => {
      setLayoutMode(mode);
      if (mode === 'single' && focusedSlot !== 0) setFocusedSlot(0);
  };

  const handleSmartSave = async (targetFileOverride?: CodeFile) => {
    const fileToSave = targetFileOverride || activeFile;
    if (!fileToSave || (!fileToSave.isModified && saveStatus === 'saved')) return;
    setSaveStatus('saving');
    try {
        if (activeTab === 'cloud' && currentUser) {
             const rootPrefix = `projects/${currentUser.uid}`;
             let targetPath = fileToSave.path || `${rootPrefix}/${fileToSave.name}`;
             const lastSlash = targetPath.lastIndexOf('/');
             const parentPath = lastSlash > -1 ? targetPath.substring(0, lastSlash) : rootPrefix;
             await saveProjectToCloud(parentPath, fileToSave.name, fileToSave.content);
             await refreshCloudPath(parentPath);
        } else if (activeTab === 'drive' && driveToken && driveRootId) {
             await saveToDrive(driveToken, driveRootId, fileToSave.name, fileToSave.content);
        } else if (isSharedSession && sessionId) {
             await updateCodeFile(sessionId, fileToSave);
        }
        setSaveStatus('saved');
    } catch(e: any) { setSaveStatus('modified'); }
  };

  const handleFormatCode = async (slotIdx: number) => {
      const file = activeSlots[slotIdx];
      if (!file || isFormattingSlots[slotIdx]) return;

      setIsFormattingSlots(prev => ({ ...prev, [slotIdx]: true }));
      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const prompt = `You are an expert code formatter. Reformat the following ${file.language} code. Respond ONLY with the reformatted code.
          CODE:
          ${file.content}`;

          const resp = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: prompt
          });

          const formatted = resp.text?.trim() || file.content;
          handleCodeChangeInSlot(formatted, slotIdx);
      } catch (e: any) {
          console.error("Formatting failed", e);
      } finally {
          setIsFormattingSlots(prev => ({ ...prev, [slotIdx]: false }));
      }
  };

  const updateSlotFile = async (file: CodeFile | null, slotIndex: number) => {
      const newSlots = [...activeSlots];
      newSlots[slotIndex] = file;
      setActiveSlots(newSlots);
      if (file && isPreviewable(file.name)) {
          setSlotViewModes(prev => ({ ...prev, [slotIndex]: 'code' }));
      }
      if (file && isSharedSession && sessionId) {
          updateProjectActiveFile(sessionId, file.path || file.name);
          updateCodeFile(sessionId, file);
      }
  };

  const isPreviewable = (filename: string) => {
      const ext = filename.split('.').pop()?.toLowerCase();
      return ['md', 'puml', 'plantuml'].includes(ext || '');
  };

  const toggleSlotViewMode = (idx: number) => {
      setSlotViewModes(prev => ({ ...prev, [idx]: prev[idx] === 'preview' ? 'code' : 'preview' }));
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
          } else if (activeTab === 'github') {
                const file = node.data as CodeFile;
                if (!file.loaded && project.github) {
                    const content = await fetchFileContent(githubToken, project.github.owner, project.github.repo, file.path || file.name, project.github.branch);
                    fileData = { ...file, content, loaded: true };
                } else { fileData = file; }
          } else {
              fileData = node.data;
          }
          if (fileData) updateSlotFile(fileData, focusedSlot);
      } else {
          if (activeTab === 'cloud') handleCloudToggle(node);
          else if (activeTab === 'drive') handleDriveToggle(node);
          else setExpandedFolders(prev => ({...prev, [node.id]: !expandedFolders[node.id]}));
      }
  };

  const handleCodeChangeInSlot = (newCode: string, slotIdx: number) => {
      const file = activeSlots[slotIdx];
      if (!file) return;
      const updatedFile = { ...file, content: newCode, isModified: true };
      const newSlots = [...activeSlots];
      newSlots[slotIdx] = updatedFile;
      setActiveSlots(newSlots);
      setProject(prev => ({
          ...prev,
          files: prev.files.map(f => (f.path || f.name) === (file.path || f.name) ? updatedFile : f)
      }));
      setSaveStatus('modified');
      if (isSharedSession && sessionId) updateCodeFile(sessionId, updatedFile);
  };

  const resize = useCallback((e: MouseEvent) => {
    if (isDraggingLeft) { const newWidth = e.clientX; if (newWidth > 160 && newWidth < 500) setLeftWidth(newWidth); }
    if (isDraggingRight) { const newWidth = window.innerWidth - e.clientX; if (newWidth > 160 && newWidth < 500) setRightWidth(newWidth); }
    if (isDraggingInner && centerContainerRef.current) {
        const rect = centerContainerRef.current.getBoundingClientRect();
        if (layoutMode === 'split-v') {
            const newRatio = ((e.clientX - rect.left) / rect.width) * 100;
            if (newRatio > 10 && newRatio < 90) setInnerSplitRatio(newRatio);
        } else if (layoutMode === 'split-h') {
            const newRatio = ((e.clientY - rect.top) / rect.height) * 100;
            if (newRatio > 10 && newRatio < 90) setInnerSplitRatio(newRatio);
        }
    }
  }, [isDraggingLeft, isDraggingRight, isDraggingInner, layoutMode]);

  useEffect(() => {
      if (isDraggingLeft || isDraggingRight || isDraggingInner) {
          window.addEventListener('mousemove', resize);
          const stop = () => { setIsDraggingLeft(false); setIsDraggingRight(false); setIsDraggingInner(false); };
          window.addEventListener('mouseup', stop);
          return () => { window.removeEventListener('mousemove', resize); window.removeEventListener('mouseup', stop); };
      }
  }, [isDraggingLeft, isDraggingRight, isDraggingInner, resize]);

  const refreshCloudPath = async (path: string) => {
      if (!currentUser) return;
      try { const items = await listCloudDirectory(path); setCloudItems(prev => { const map = new Map(prev.map(i => [i.fullPath, i])); items.forEach(i => map.set(i.fullPath, i)); return Array.from(map.values()); }); } catch(e) { console.error(e); }
  };

  const handleCloudToggle = async (node: TreeNode) => { const isExpanded = expandedFolders[node.id]; setExpandedFolders(prev => ({ ...prev, [node.id]: !isExpanded })); if (!isExpanded) { setLoadingFolders(prev => ({ ...prev, [node.id]: true })); try { await refreshCloudPath(node.id); } catch(e) { console.error(e); } finally { setLoadingFolders(prev => ({ ...prev, [node.id]: false })); } } };
  const handleDriveToggle = async (node: TreeNode) => { const driveFile = node.data as DriveFile; const isExpanded = expandedFolders[node.id]; setExpandedFolders(prev => ({ ...prev, [node.id]: !isExpanded })); if (!isExpanded && driveToken && (!node.children || node.children.length === 0)) { setLoadingFolders(prev => ({ ...prev, [node.id]: true })); try { const files = await listDriveFiles(driveToken, driveFile.id); setDriveItems(prev => { const newItems = files.map(f => ({ ...f, parentId: node.id, isLoaded: false })); return Array.from(new Map([...prev, ...newItems].map(item => [item.id, item])).values()); }); } catch(e) { console.error(e); } finally { setLoadingFolders(prev => ({ ...prev, [node.id]: false })); } } };
  const handleConnectDrive = async () => { try { const token = await connectGoogleDrive(); setDriveToken(token); const rootId = await ensureCodeStudioFolder(token); setDriveRootId(rootId); const files = await listDriveFiles(token, rootId); setDriveItems([{ id: rootId, name: 'CodeStudio', mimeType: 'application/vnd.google-apps.folder', isLoaded: true }, ...files.map(f => ({ ...f, parentId: driveRootId, isLoaded: false }))]); setActiveTab('drive'); } catch(e: any) { console.error(e); } };

  const handleCreateFile = async () => { const name = prompt("File Name:"); if (!name) return;
      try {
          const content = "// New File";
          if (activeTab === 'cloud' && currentUser) {
              await saveProjectToCloud(`projects/${currentUser.uid}`, name, content);
              await refreshCloudPath(`projects/${currentUser.uid}`);
          }
          const newFile: CodeFile = { name, path: name, language: getLanguageFromExt(name), content, loaded: true, isDirectory: false, isModified: true };
          updateSlotFile(newFile, focusedSlot);
      } catch(e: any) { console.error(e); }
  };

  const handleCreateWhiteboard = async () => { const name = prompt("Whiteboard Name:"); if (!name) return;
      const fileName = name.endsWith('.wb') ? name : name + '.wb';
      const content = "[]";
      try {
          if (activeTab === 'cloud' && currentUser) {
              await saveProjectToCloud(`projects/${currentUser.uid}`, fileName, content);
              await refreshCloudPath(`projects/${currentUser.uid}`);
          }
          const newFile: CodeFile = { name: fileName, path: fileName, language: 'whiteboard', content, loaded: true, isDirectory: false, isModified: true };
          updateSlotFile(newFile, focusedSlot);
      } catch(e: any) { console.error(e); }
  };

  const handleSendMessage = async (input: string) => {
      if (!input.trim()) return;
      setChatMessages(prev => [...prev, { role: 'user', text: input }]);
      setIsChatThinking(true);
      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const activeFile = activeSlots[focusedSlot];
          const contextFiles = activeSlots.filter(f => f !== null).map(f => `File: ${f?.name}\nLanguage: ${f?.language}\nContent:\n${f?.content}`).join('\n\n---\n\n');
          
          let systemPrompt = `You are a Senior Software Engineer helping a user in Code Studio.
          Focused File: ${activeFile?.name || "None"}
          Context:\n${contextFiles}\n
          User: "${input}"`;

          if (isInterviewMode) {
              systemPrompt = `You are a Lead Engineer conducting a ${interviewType.toUpperCase()} Mock Interview.
              RESUME: ${resumeText}
              JD: ${jobDescription}
              CONTEXT: ${contextFiles}`;
          }

          const tools: any[] = [{ functionDeclarations: [updateFileTool] }];
          if (isInterviewMode) tools[0].functionDeclarations.push(submitFeedbackTool);

          const resp = await ai.models.generateContent({ 
              model: 'gemini-3-flash-preview', 
              contents: systemPrompt,
              config: { tools }
          });

          if (resp.functionCalls) {
              for (const fc of resp.functionCalls) {
                  if (fc.name === 'update_active_file') {
                      handleCodeChangeInSlot(fc.args.new_content, focusedSlot);
                      setChatMessages(prev => [...prev, { role: 'ai', text: `✨ Edits applied to ${activeFile?.name}` }]);
                  } else if (fc.name === 'submit_interview_feedback') {
                      setInterviewScore(fc.args.score);
                      setInterviewFeedback(fc.args.summary);
                      setInterviewStep('feedback');
                      if (timerRef.current) clearInterval(timerRef.current);
                      stopInterviewRecordingAndSave();
                  }
              }
          } else {
              setChatMessages(prev => [...prev, { role: 'ai', text: resp.text || "" }]);
          }
      } catch (e: any) { setChatMessages(prev => [...prev, { role: 'ai', text: `Error: ${e.message}` }]); } finally { setIsChatThinking(false); }
  };

  const handleStartInterview = async () => {
      setInterviewStep('active');
      setInterviewTimer(1800); 
      setChatMessages([{ role: 'ai', text: `Welcome. I've analyzed your background and the ${interviewType} role requirements. Let's begin the evaluation.` }]);
      await setupInterviewRecording();
      timerRef.current = setInterval(() => {
          setInterviewTimer(t => { if (t <= 1) { clearInterval(timerRef.current); handleSendMessage("Time is up."); return 0; } return t - 1; });
      }, 1000);
      setIsRightOpen(true);
  };

  const handleResetInterview = () => {
      setIsInterviewMode(false);
      setInterviewStep('setup');
      setInterviewFeedback(null);
      setInterviewScore(null);
      if (timerRef.current) clearInterval(timerRef.current);
  };

  const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const cloudTree = useMemo(() => {
      const freshRoot: TreeNode[] = [];
      const freshMap = new Map<string, TreeNode>();
      cloudItems.forEach(item => freshMap.set(item.fullPath, { id: item.fullPath, name: item.name, type: item.isFolder ? 'folder' : 'file', data: item, children: [], isLoaded: true }));
      cloudItems.forEach(item => { const node = freshMap.get(item.fullPath)!; const parts = item.fullPath.split('/'); parts.pop(); const parentPath = parts.join('/'); if (freshMap.has(parentPath)) { freshMap.get(parentPath)!.children.push(node); } else { freshRoot.push(node); } });
      return freshRoot;
  }, [cloudItems]);

  const workspaceTree = useMemo(() => {
      const root: TreeNode[] = [];
      const map = new Map<string, TreeNode>();
      const repoFiles = Array.isArray(project.files) ? project.files : [];
      repoFiles.forEach(f => { const path = f.path || f.name; map.set(path, { id: path, name: f.name.split('/').pop()!, type: f.isDirectory ? 'folder' : 'file', data: f, children: [], status: f.isModified ? 'modified' : undefined }); });
      repoFiles.forEach(f => { const path = f.path || f.name; const node = map.get(path)!; const parts = path.split('/'); if (parts.length === 1) root.push(node); else { const parent = map.get(parts.slice(0, -1).join('/')); if (parent) parent.children.push(node); else root.push(node); } });
      return root;
  }, [project.files]);

  const driveTree = useMemo(() => {
      const root: TreeNode[] = [];
      const map = new Map<string, TreeNode>();
      driveItems.forEach(item => {
          map.set(item.id, {
              id: item.id,
              name: item.name,
              type: item.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
              data: item,
              children: [],
              isLoaded: item.isLoaded
          });
      });
      driveItems.forEach(item => {
          const node = map.get(item.id)!;
          if (item.parentId && map.has(item.parentId)) map.get(item.parentId)!.children.push(node);
          else if (!item.parentId) root.push(node);
      });
      return root;
  }, [driveItems]);

  const refreshExplorer = async () => {
      if (activeTab === 'cloud' && currentUser) await refreshCloudPath(`projects/${currentUser.uid}`);
      else if (activeTab === 'drive' && driveToken && driveRootId) {
          const files = await listDriveFiles(driveToken, driveRootId);
          setDriveItems([{ id: driveRootId, name: 'CodeStudio', mimeType: 'application/vnd.google-apps.folder', isLoaded: true }, ...files.map(f => ({ ...f, parentId: driveRootId, isLoaded: false }))]);
      }
  };

  const handleOpenRepo = async (repoPath?: string) => {
    const path = repoPath || userProfile?.defaultRepoUrl;
    if (!path) return alert("No default repository set.");
    const [owner, repo] = path.split('/');
    if (!owner || !repo) return alert("Invalid repository format.");
    setLoadingFolders(prev => ({ ...prev, github_root: true }));
    try {
        const info = await fetchRepoInfo(owner, repo, githubToken);
        const { files, latestSha } = await fetchRepoContents(githubToken, owner, repo, info.default_branch);
        setProject({ id: `gh-${info.id}`, name: info.full_name, files: files, lastModified: Date.now(), github: { owner, repo, branch: info.default_branch, sha: latestSha } });
        setActiveTab('github');
    } catch (e: any) { alert(e.message); } finally { setLoadingFolders(prev => ({ ...prev, github_root: false })); }
  };

  useEffect(() => { if (activeTab === 'cloud' && currentUser) refreshExplorer(); }, [activeTab, currentUser]);

  const renderSlot = (idx: number) => {
      const file = activeSlots[idx];
      const isFocused = focusedSlot === idx;
      const viewMode = slotViewModes[idx] || 'code';
      const isVisible = layoutMode === 'single' ? idx === 0 : (layoutMode === 'quad' ? true : idx < 2);
      if (!isVisible) return null;
      const slotStyle: React.CSSProperties = {};
      if (layoutMode === 'split-v' || layoutMode === 'split-h') {
          const size = idx === 0 ? `${innerSplitRatio}%` : `${100 - innerSplitRatio}%`;
          if (layoutMode === 'split-v') slotStyle.width = size; else slotStyle.height = size;
          slotStyle.flex = 'none';
      }
      return (
          <div key={idx} onClick={() => setFocusedSlot(idx)} style={slotStyle} className={`flex flex-col min-w-0 border ${isFocused ? 'border-indigo-500 z-10 shadow-lg' : 'border-slate-800'} relative transition-all overflow-hidden bg-slate-950 flex-1`}>
              {file ? (
                  <>
                    <div className={`px-4 py-2 flex items-center justify-between shrink-0 border-b ${isFocused ? 'bg-indigo-900/20' : 'bg-slate-900'}`}>
                        <div className="flex items-center gap-2 overflow-hidden">
                            <FileIcon filename={file.name} />
                            <span className={`text-xs font-bold truncate ${isFocused ? 'text-indigo-200' : 'text-slate-400'}`}>{file.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            {isPreviewable(file.name) && (
                                <button onClick={(e) => { e.stopPropagation(); toggleSlotViewMode(idx); }} className={`p-1.5 rounded ${viewMode === 'preview' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}><Code size={14}/></button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); updateSlotFile(null, idx); }} className="p-1.5 text-slate-500 hover:text-white"><X size={14}/></button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden">
                        {viewMode === 'preview' ? <MarkdownView content={file.content} /> : <RichCodeEditor code={file.content} onChange={(code: string) => handleCodeChangeInSlot(code, idx)} language={file.language} fontSize={fontSize} indentMode={indentMode} />}
                    </div>
                  </>
              ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-700 bg-slate-950/50 border-2 border-dashed border-slate-800 m-4 rounded-xl cursor-pointer hover:border-slate-600">
                      <Plus size={32} className="opacity-20 mb-2" />
                      <p className="text-xs font-bold uppercase">Pane {idx + 1}</p>
                  </div>
              )}
          </div>
      );
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden relative">
      <header className="h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 z-20">
         <div className="flex items-center space-x-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"><ArrowLeft size={20} /></button>
            <button onClick={() => setIsLeftOpen(!isLeftOpen)} className={`p-2 rounded-lg ${isLeftOpen ? 'bg-slate-800 text-white' : 'text-slate-400'}`}><PanelLeftClose size={20} /></button>
            <h1 className="font-bold text-white text-sm flex items-center gap-2">
                {isInterviewMode ? <UserCheck className="text-emerald-400" size={18}/> : <Code className="text-indigo-400" size={18}/>}
                {isInterviewMode ? 'Interview Studio' : project.name}
            </h1>
         </div>
         <div className="flex items-center space-x-2">
            {!isInterviewMode ? (
                <button onClick={() => setIsInterviewMode(true)} className="flex items-center space-x-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md mr-4 animate-pulse"><UserCheck size={14}/><span>Mock Interview</span></button>
            ) : (
                <div className="flex items-center gap-4 mr-4">
                    <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                        <span className="text-xs font-mono text-red-400">{formatTime(interviewTimer)}</span>
                    </div>
                    <button onClick={() => setInterviewStep('archive')} className="p-2 hover:bg-slate-800 rounded text-slate-400"><History size={16}/></button>
                    <button onClick={handleResetInterview} className="text-xs text-slate-400 hover:text-white font-bold">Exit</button>
                </div>
            )}
            <button onClick={() => handleSmartSave()} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md mr-2"><Save size={14}/><span>Save</span></button>
            <button onClick={() => setIsRightOpen(!isRightOpen)} className={`p-2 rounded-lg ${isRightOpen ? 'bg-slate-800 text-white' : 'text-slate-400'}`}><PanelRightClose size={20} /></button>
         </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
          <div className={`${isLeftOpen ? '' : 'hidden'} bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 overflow-hidden`} style={{ width: `${leftWidth}px` }}>
              <div className="flex border-b border-slate-800 bg-slate-900">
                  <button onClick={() => setActiveTab('cloud')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'cloud' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500'}`}><Cloud size={16}/></button>
                  <button onClick={() => setActiveTab('drive')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'drive' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500'}`}><HardDrive size={16}/></button>
                  <button onClick={() => setActiveTab('github')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'github' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500'}`}><Github size={16}/></button>
              </div>
              <div className="flex-1 overflow-y-auto">
                  {activeTab === 'cloud' && cloudTree.map(node => <FileTreeItem key={node.id} node={node} depth={0} activeId={activeFile?.path} onSelect={handleExplorerSelect} onToggle={handleCloudToggle} expandedIds={expandedFolders} loadingIds={loadingFolders} />)}
                  {activeTab === 'drive' && (driveToken ? driveTree.map(node => <FileTreeItem key={node.id} node={node} depth={0} activeId={activeFile?.path} onSelect={handleExplorerSelect} onToggle={handleDriveToggle} expandedIds={expandedFolders} loadingIds={loadingFolders} />) : <div className="p-4 text-center"><button onClick={handleConnectDrive} className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg border border-slate-700">Connect Drive</button></div>)}
              </div>
          </div>

          <div onMouseDown={() => setIsDraggingLeft(true)} className="w-1 cursor-col-resize hover:bg-indigo-500/50 shrink-0 bg-slate-800/20"></div>

          <div ref={centerContainerRef} className={`flex-1 bg-slate-950 flex min-w-0 relative ${layoutMode === 'quad' ? 'grid grid-cols-2 grid-rows-2' : layoutMode === 'split-v' ? 'flex-row' : 'flex-col'}`}>
              
              {isInterviewMode && interviewStep === 'setup' && (
                  <div className="absolute inset-0 z-50 bg-slate-950 flex items-center justify-center p-8 overflow-y-auto">
                      <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-[2rem] p-10 shadow-2xl space-y-8 animate-fade-in-up">
                          <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                  <div className="p-3 bg-emerald-500/20 rounded-2xl text-emerald-400"><UserCheck size={32} /></div>
                                  <div><h2 className="text-2xl font-black text-white">Interview Prep</h2><p className="text-slate-400 text-sm">Configure your tailored mock interview session.</p></div>
                              </div>
                              <button onClick={() => setInterviewStep('archive')} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 flex items-center gap-2 text-xs font-bold"><History size={16}/> Archive</button>
                          </div>
                          
                          <div className="space-y-4">
                              <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Sparkles size={14}/> Interview Type</label>
                              <div className="grid grid-cols-3 gap-2">
                                  {['coding', 'system-design', 'behavior'].map(t => (
                                      <button key={t} onClick={() => setInterviewType(t as InterviewType)} className={`py-3 rounded-xl border text-xs font-bold capitalize transition-all ${interviewType === t ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>{t.replace('-', ' ')}</button>
                                  ))}
                              </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-3">
                                  <div className="flex justify-between items-center"><label className="text-xs font-bold text-slate-500 uppercase">Your Resume</label><label className="text-[10px] text-indigo-400 hover:underline cursor-pointer flex items-center gap-1"><FileUp size={10}/> Upload PDF/TXT <input type="file" className="hidden" onChange={e => handleFileUpload(e, 'resume')}/></label></div>
                                  <textarea value={resumeText} onChange={e => setResumeText(e.target.value)} placeholder="Paste resume or upload file..." className="w-full h-40 bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-300 outline-none focus:border-emerald-500 resize-none"/>
                              </div>
                              <div className="space-y-3">
                                  <div className="flex justify-between items-center"><label className="text-xs font-bold text-slate-500 uppercase">Job Description</label><label className="text-[10px] text-indigo-400 hover:underline cursor-pointer flex items-center gap-1"><FileUp size={10}/> Upload <input type="file" className="hidden" onChange={e => handleFileUpload(e, 'jd')}/></label></div>
                                  <textarea value={jobDescription} onChange={e => setJobDescription(e.target.value)} placeholder="Paste job details..." className="w-full h-40 bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-300 outline-none focus:border-indigo-500 resize-none"/>
                              </div>
                          </div>

                          <div className="flex gap-4">
                              <button onClick={handleResetInterview} className="flex-1 py-4 bg-slate-800 text-slate-300 font-bold rounded-2xl">Cancel</button>
                              <button onClick={handleStartInterview} className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl shadow-xl flex items-center justify-center gap-2"><Play size={20} fill="currentColor"/><span>Start Session</span></button>
                          </div>
                      </div>
                  </div>
              )}

              {isInterviewMode && interviewStep === 'archive' && (
                  <div className="absolute inset-0 z-50 bg-slate-950 flex items-center justify-center p-8 overflow-y-auto">
                      <div className="max-w-4xl w-full bg-slate-900 border border-slate-800 rounded-[2rem] p-10 shadow-2xl flex flex-col max-h-[80vh]">
                          <div className="flex justify-between items-center mb-6">
                              <h2 className="text-2xl font-black text-white flex items-center gap-2"><History className="text-indigo-400"/> Interview History</h2>
                              <button onClick={() => setInterviewStep('setup')} className="p-2 text-slate-400 hover:text-white"><X/></button>
                          </div>
                          <div className="relative mb-6">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16}/>
                              <input type="text" value={archiveSearch} onChange={e => setArchiveSearch(e.target.value)} placeholder="Search reports..." className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:border-indigo-500 outline-none"/>
                          </div>
                          <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-thin">
                              {pastInterviews.filter(i => i.name.toLowerCase().includes(archiveSearch.toLowerCase())).map(i => (
                                  <div key={i.id} className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl flex items-center justify-between hover:bg-slate-800 transition-colors cursor-pointer group">
                                      <div className="flex items-center gap-4">
                                          <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg"><FileTextIcon size={20}/></div>
                                          <div>
                                              <p className="text-sm font-bold text-slate-200">{i.name.replace('Mock_Interview_', '').replace('.webm', '').replace('.md', '')}</p>
                                              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Recorded Session</p>
                                          </div>
                                      </div>
                                      <button className="p-2 bg-slate-900 rounded-lg text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity"><Play size={16}/></button>
                                  </div>
                              ))}
                              {pastInterviews.length === 0 && <div className="text-center py-20 text-slate-600 italic">No past sessions found in your Drive.</div>}
                          </div>
                      </div>
                  </div>
              )}

              {isInterviewMode && interviewStep === 'feedback' && (
                  <div className="absolute inset-0 z-50 bg-slate-950 flex items-center justify-center p-8 overflow-y-auto">
                      <div className="max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-[2rem] p-10 shadow-2xl space-y-8 animate-fade-in-up">
                          <div className="flex justify-between items-start">
                              <div className="flex items-center gap-4">
                                  <div className="p-4 bg-emerald-500 text-white rounded-3xl"><Trophy size={32} /></div>
                                  <div><h2 className="text-3xl font-black text-white">Evaluation Report</h2><p className="text-slate-400">Generated by Neural Interviewer.</p></div>
                              </div>
                              <div className="text-right"><div className="text-5xl font-black text-emerald-400">{interviewScore}</div><div className="text-[10px] font-bold text-slate-500 uppercase">Score</div></div>
                          </div>
                          <div className="bg-slate-950/50 rounded-2xl p-8 border border-slate-800 prose prose-invert max-w-none"><MarkdownView content={interviewFeedback || ""} /></div>
                          <div className="flex gap-4"><button onClick={handleResetInterview} className="flex-1 py-4 bg-indigo-600 text-white font-black rounded-2xl">Start New Round</button></div>
                      </div>
                  </div>
              )}

              {layoutMode === 'single' && renderSlot(0)}
              {layoutMode === 'split-v' && (
                  <>
                    {renderSlot(0)}
                    <div onMouseDown={() => setIsDraggingInner(true)} className="w-1.5 cursor-col-resize hover:bg-indigo-500/50 z-40 bg-slate-800 group relative flex-shrink-0"><div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 bg-indigo-500 p-1 rounded-full"><GripVertical size={12}/></div></div>
                    {renderSlot(1)}
                  </>
              )}
              {layoutMode === 'split-h' && (
                  <>
                    {renderSlot(0)}
                    <div onMouseDown={() => setIsDraggingInner(true)} className="h-1.5 cursor-row-resize hover:bg-indigo-500/50 z-40 bg-slate-800 group relative flex-shrink-0"><div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 bg-indigo-500 p-1 rounded-full"><GripHorizontal size={12}/></div></div>
                    {renderSlot(1)}
                  </>
              )}
              {layoutMode === 'quad' && [0,1,2,3].map(i => renderSlot(i))}
          </div>

          <div onMouseDown={() => setIsDraggingRight(true)} className="w-1 cursor-col-resize hover:bg-indigo-500/50 shrink-0 bg-slate-800/20"></div>

          <div className={`${isRightOpen ? '' : 'hidden'} bg-slate-950 flex flex-col shrink-0 overflow-hidden`} style={{ width: `${rightWidth}px` }}>
              <AIChatPanel isOpen={true} onClose={() => setIsRightOpen(false)} messages={chatMessages} onSendMessage={handleSendMessage} isThinking={isChatThinking} />
          </div>
      </div>
    </div>
  );
};