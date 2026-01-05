import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { CodeProject, CodeFile, UserProfile, Channel, CursorPosition, CloudItem } from '../types';
import { ArrowLeft, Save, Plus, Github, Cloud, HardDrive, Code, X, ChevronRight, ChevronDown, File, Folder, DownloadCloud, Loader2, CheckCircle, AlertTriangle, Info, FolderPlus, FileCode, RefreshCw, LogIn, CloudUpload, Trash2, ArrowUp, Edit2, FolderOpen, MoreVertical, Send, MessageSquare, Bot, Mic, Sparkles, SidebarClose, SidebarOpen, Users, Eye, FileText as FileTextIcon, Image as ImageIcon, StopCircle, Minus, Maximize2, Minimize2, Lock, Unlock, Share2, Terminal, Copy, WifiOff, PanelRightClose, PanelRightOpen, PanelLeftClose, PanelLeftOpen, Monitor, Laptop, PenTool, Edit3, ShieldAlert, ZoomIn, ZoomOut, Columns, Rows, Grid2X2, Square as SquareIcon, GripVertical, GripHorizontal, FileSearch, Indent, Wand2, Check, UserCheck, Briefcase, FileUser, Trophy, Star, Play, Camera } from 'lucide-react';
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
                            onSelect={node.data ? (n: any) => onSelect(n) : onSelect} 
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
  
  const [innerSplitRatio, setInnerSplitRatio] = useState(50); // Percent for splits
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

  // --- COLLABORATION STATE ---
  const [showShareModal, setShowShareModal] = useState(false);
  const [writeToken, setWriteToken] = useState<string | undefined>(accessKey);
  const [isReadOnly, setIsReadOnly] = useState(!!sessionId && !accessKey);
  const [activeClients, setActiveClients] = useState<Record<string, CursorPosition>>({});
  const [clientId] = useState(() => crypto.randomUUID());

  // --- MOCK INTERVIEW STATE ---
  const [isInterviewMode, setIsInterviewMode] = useState(false);
  const [interviewStep, setInterviewStep] = useState<'setup' | 'active' | 'feedback'>('setup');
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [interviewFeedback, setInterviewFeedback] = useState<string | null>(null);
  const [interviewScore, setInterviewScore] = useState<number | null>(null);
  const [interviewTimer, setInterviewTimer] = useState(1800); // 30 minutes in seconds
  const timerRef = useRef<any>(null);

  // Recording State
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const centerContainerRef = useRef<HTMLDivElement>(null);

  const activeFile = activeSlots[focusedSlot];

  // Tool for In-Place Editing
  const updateFileTool: FunctionDeclaration = {
    name: "update_active_file",
    description: "Updates the content of the currently focused file in the editor. Use this whenever the user asks for code modifications, refactoring, or additions to the file they are working on.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        new_content: {
          type: Type.STRING,
          description: "The complete new content of the file. Ensure you maintain proper indentation (spaces/tabs) and formatting. Do not truncate the file unless requested."
        },
        summary: {
          type: Type.STRING,
          description: "A href brief summary of what you changed."
        }
      },
      required: ["new_content"]
    }
  };

  const submitFeedbackTool: FunctionDeclaration = {
      name: "submit_interview_feedback",
      description: "Submit final feedback and scoring for the mock interview. Use this only when the interview is naturally concluded or requested by the user.",
      parameters: {
          // Fixed: Changed GenType to Type
          type: Type.OBJECT,
          properties: {
              // Fixed: Changed GenType to Type
              score: { type: Type.NUMBER, description: "Overall score from 0-100" },
              // Fixed: Changed GenType to Type
              strengths: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Key positive points" },
              // Fixed: Changed GenType to Type
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Areas for improvement" },
              // Fixed: Changed GenType to Type
              summary: { type: Type.STRING, description: "Detailed narrative feedback in Markdown" }
          },
          required: ["score", "summary"]
      }
  };

  // --- Real-time Collaboration Logic ---
  useEffect(() => {
    if (sessionId) {
        setIsSharedSession(true);
        setActiveTab('session');
        const unsubscribe = subscribeToCodeProject(sessionId, (remoteProject) => {
            setProject(prev => {
                const mergedFiles = [...prev.files];
                remoteProject.files.forEach(rf => {
                    const idx = mergedFiles.findIndex(f => (f.path || f.name) === (rf.path || rf.name));
                    if (idx > -1) {
                        if (rf.content !== mergedFiles[idx].content) mergedFiles[idx] = rf;
                    } else {
                        mergedFiles.push(rf);
                    }
                });
                return { ...remoteProject, files: mergedFiles };
            });
            
            if (remoteProject.cursors) setActiveClients(remoteProject.cursors);
            
            if (remoteProject.activeFilePath && remoteProject.activeClientId !== clientId) {
                const remoteFile = remoteProject.files.find(f => (f.path || f.name) === remoteProject.activeFilePath);
                if (remoteFile && (!activeFile || (activeFile.path || activeFile.name) !== remoteProject.activeFilePath)) {
                    updateSlotFile(remoteFile, 0);
                }
            }
        });
        return () => unsubscribe();
    }
  }, [sessionId, clientId]);

  const handleShare = async (uids: string[], isPublic: boolean) => {
      let sid = sessionId;
      let token = writeToken;
      
      if (!sid) {
          sid = crypto.randomUUID();
          token = crypto.randomUUID();
          setWriteToken(token);
          
          const newProject: CodeProject = {
              ...project,
              id: sid,
              ownerId: currentUser?.uid,
              accessLevel: isPublic ? 'public' : 'restricted',
              allowedUserIds: uids
          };
          await saveCodeProject(newProject);
          onSessionStart(sid);
      } else {
          await updateProjectAccess(sid, isPublic ? 'public' : 'restricted', uids);
      }
      
      if (uids.length > 0) {
          const shareUrl = new URL(window.location.href);
          shareUrl.searchParams.set('session', sid);
          shareUrl.searchParams.set('key', token || '');
          uids.forEach(uid => sendShareNotification(uid, 'Code Studio', shareUrl.toString(), currentUser?.displayName || 'A member'));
      }
      setIsSharedSession(true);
  };

  const handleStopSession = () => {
      onSessionStop();
      setIsSharedSession(false);
      setIsReadOnly(false);
      setWriteToken(undefined);
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
          // Add audio tracks from both
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

      // Save to Google Drive
      if (recorderChunksRef.current.length > 0) {
          try {
              let token = driveToken;
              if (!token) token = await connectGoogleDrive();
              let rootId = driveRootId;
              if (!rootId) rootId = await ensureCodeStudioFolder(token);
              
              const videoBlob = new Blob(recorderChunksRef.current, { type: 'video/webm' });
              const fileName = `Mock_Interview_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
              
              const reader = new FileReader();
              reader.onload = async () => {
                  const content = reader.result as string;
                  await saveToDrive(token!, rootId!, fileName, content, 'video/webm');
                  console.log("Interview recording saved to Google Drive.");
              };
              reader.readAsArrayBuffer(videoBlob);
          } catch(e) {
              console.error("Failed to save recording to Drive", e);
          }
      }
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
          const prompt = `You are an expert code formatter. Reformat the following ${file.language} code to follow standard industry best practices. 
          Maintain all logic, comments, and structure. 
          Respond ONLY with the reformatted code. No markdown formatting, no backticks.
          
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
      
      // Default to preview mode if it's a markdown/puml file being opened for the first time
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
      setSlotViewModes(prev => ({
          ...prev,
          [idx]: prev[idx] === 'preview' ? 'code' : 'preview'
      }));
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

          if (fileData) {
              updateSlotFile(fileData, focusedSlot);
          }
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
          Current Focused File: ${activeFile?.name || "None"}
          Workspace Context:\n${contextFiles}\n\n
          User Request: "${input}"
          
          If the user asks for code changes, use the 'update_active_file' tool to apply them directly. 
          When providing code in your conversational response, ensure you use proper Markdown code blocks.`;

          if (isInterviewMode) {
              systemPrompt = `You are a Human Interviewer (e.g., Lead Engineer from a Top Tech Co).
              You are conducting a Mock Interview for a ${activeFile?.language || 'software'} position.
              
              CANDIDATE RESUME:
              ${resumeText || "Not provided"}
              
              TARGET JOB DESCRIPTION:
              ${jobDescription || "Standard Senior Dev role"}
              
              WORKSPACE CONTEXT:
              ${contextFiles}
              
              YOUR GOAL:
              1. Conduct a realistic technical interview. 
              2. Ask probing questions based on the resume and JD.
              3. If they are coding, review their logic and suggest edge cases.
              4. Maintain a professional, realistic interviewer persona. 
              5. DO NOT be too helpful; you are evaluating them.
              
              When finished, use 'submit_interview_feedback' to score and end the session.`;
          }

          const tools: any[] = [{ functionDeclarations: [updateFileTool] }];
          if (isInterviewMode) tools[0].functionDeclarations.push(submitFeedbackTool);

          const resp = await ai.models.generateContent({ 
              model: 'gemini-3-flash-preview', 
              contents: systemPrompt,
              config: { tools }
          });

          // Handle Tool Calls
          if (resp.functionCalls) {
              for (const fc of resp.functionCalls) {
                  if (fc.name === 'update_active_file') {
                      const { new_content, summary } = fc.args;
                      if (activeFile) {
                          handleCodeChangeInSlot(new_content, focusedSlot);
                          setChatMessages(prev => [...prev, { role: 'ai', text: `✨ **In-place Edit Applied to ${activeFile.name}**\n\n${summary || "Code updated successfully."}` }]);
                      } else {
                          setChatMessages(prev => [...prev, { role: 'ai', text: "⚠️ No file is currently focused to apply edits to." }]);
                      }
                      await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: `Tool update_active_file completed successfully.`, config: { tools: [{ functionDeclarations: [updateFileTool] }] } });
                  } else if (fc.name === 'submit_interview_feedback') {
                      const { score, strengths, weaknesses, summary } = fc.args;
                      setInterviewScore(score);
                      setInterviewFeedback(summary);
                      setInterviewStep('feedback');
                      if (timerRef.current) clearInterval(timerRef.current);
                      stopInterviewRecordingAndSave();
                      setChatMessages(prev => [...prev, { role: 'ai', text: `### 🏆 Interview Concluded\n\n**Score: ${score}/100**\n\nReview the feedback report in the main panel.` }]);
                  }
              }
          } else {
              setChatMessages(prev => [...prev, { role: 'ai', text: resp.text || "I couldn't generate a response." }]);
          }

      } catch (e: any) { setChatMessages(prev => [...prev, { role: 'ai', text: `Error: ${e.message}` }]); } finally { setIsChatThinking(false); }
  };

  const handleStartInterview = async () => {
      setInterviewStep('active');
      setInterviewTimer(1800); // 30 minutes
      setChatMessages([{ role: 'ai', text: "Welcome to your mock interview. I've reviewed your resume and the job description. Let's start with a brief introduction of your most significant project." }]);
      
      await setupInterviewRecording();
      
      timerRef.current = setInterval(() => {
          setInterviewTimer(t => {
              if (t <= 1) {
                  clearInterval(timerRef.current);
                  handleSendMessage("The time is up. Please wrap up and provide feedback.");
                  return 0;
              }
              return t - 1;
          });
      }, 1000);
      setIsRightOpen(true);
  };

  const handleResetInterview = () => {
      setIsInterviewMode(false);
      setInterviewStep('setup');
      setInterviewFeedback(null);
      setInterviewScore(null);
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          stopInterviewRecordingAndSave();
      }
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
          if (item.parentId && map.has(item.parentId)) {
              map.get(item.parentId)!.children.push(node);
          } else if (!item.parentId) {
              root.push(node);
          }
      });
      return root;
  }, [driveItems]);

  const refreshExplorer = async () => {
      if (activeTab === 'cloud' && currentUser) {
          await refreshCloudPath(`projects/${currentUser.uid}`);
      } else if (activeTab === 'drive' && driveToken && driveRootId) {
          const files = await listDriveFiles(driveToken, driveRootId);
          setDriveItems([{ id: driveRootId, name: 'CodeStudio', mimeType: 'application/vnd.google-apps.folder', isLoaded: true }, ...files.map(f => ({ ...f, parentId: driveRootId, isLoaded: false }))]);
      }
  };

  const handleOpenRepo = async (repoPath?: string) => {
    const path = repoPath || userProfile?.defaultRepoUrl;
    if (!path) {
        alert("No default repository set in your profile settings.");
        return;
    }
    const [owner, repo] = path.split('/');
    if (!owner || !repo) {
        alert("Invalid repository format in profile. Expected 'owner/repo'.");
        return;
    }
    
    setLoadingFolders(prev => ({ ...prev, github_root: true }));
    try {
        const info = await fetchRepoInfo(owner, repo, githubToken);
        const { files, latestSha } = await fetchRepoContents(githubToken, owner, repo, info.default_branch);
        
        setProject({
            id: `gh-${info.id}`,
            name: info.full_name,
            files: files,
            lastModified: Date.now(),
            github: {
                owner,
                repo,
                branch: info.default_branch,
                sha: latestSha
            }
        });
        setActiveTab('github');
    } catch (e: any) {
        alert(e.message);
    } finally {
        setLoadingFolders(prev => ({ ...prev, github_root: false }));
    }
  };

  useEffect(() => {
    if (activeTab === 'cloud' && currentUser) {
        refreshExplorer();
    }
  }, [activeTab, currentUser]);

  const renderSlot = (idx: number) => {
      const file = activeSlots[idx];
      const isFocused = focusedSlot === idx;
      const viewMode = slotViewModes[idx] || 'code';
      const isFormatting = isFormattingSlots[idx];
      
      const isVisible = layoutMode === 'single' ? idx === 0 : (layoutMode === 'quad' ? true : idx < 2);
      if (!isVisible) return null;

      const slotStyle: React.CSSProperties = {};
      if (layoutMode === 'split-v' || layoutMode === 'split-h') {
          const size = idx === 0 ? `${innerSplitRatio}%` : `${100 - innerSplitRatio}%`;
          if (layoutMode === 'split-v') slotStyle.width = size;
          else slotStyle.height = size;
          slotStyle.flex = 'none';
      }

      return (
          <div 
            key={idx} 
            onClick={() => setFocusedSlot(idx)}
            style={slotStyle}
            className={`flex flex-col min-w-0 border ${isFocused ? 'border-indigo-500 z-10 shadow-[inset_0_0_10px_rgba(79,70,229,0.1)]' : 'border-slate-800'} relative transition-all overflow-hidden bg-slate-950 flex-1`}
          >
              {file ? (
                  <>
                    <div className={`px-4 py-2 flex items-center justify-between shrink-0 border-b ${isFocused ? 'bg-indigo-900/20 border-indigo-500/30' : 'bg-slate-900 border-slate-800'}`}>
                        <div className="flex items-center gap-2 overflow-hidden">
                            <FileIcon filename={file.name} />
                            <span className={`text-xs font-bold truncate ${isFocused ? 'text-indigo-200' : 'text-slate-400'}`}>{file.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            {viewMode === 'code' && !['whiteboard', 'markdown', 'plantuml'].includes(getLanguageFromExt(file.name)) && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleFormatCode(idx); }}
                                    disabled={isFormatting}
                                    className={`p-1.5 rounded transition-colors ${isFormatting ? 'text-indigo-400' : 'text-slate-500 hover:text-indigo-400'}`}
                                    title="Auto-Reformat Code (AI)"
                                >
                                    {isFormatting ? <Loader2 size={14} className="animate-spin"/> : <Wand2 size={14}/>}
                                </button>
                            )}
                            {isPreviewable(file.name) && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); toggleSlotViewMode(idx); }} 
                                    className={`p-1.5 rounded transition-colors ${viewMode === 'preview' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}
                                    title={viewMode === 'preview' ? 'Show Code' : 'Show Preview'}
                                >
                                    {viewMode === 'preview' ? <Code size={14}/> : <Eye size={14}/>}
                                </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); updateSlotFile(null, idx); }} className="p-1.5 hover:bg-slate-800 rounded text-slate-500 hover:text-white transition-colors" title="Close Panel"><X size={14}/></button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden relative">
                        {getLanguageFromExt(file.name) === 'whiteboard' ? (
                            <Whiteboard initialData={file.content} onDataChange={(code) => handleCodeChangeInSlot(code, idx)} disableAI={true} />
                        ) : viewMode === 'preview' ? (
                            <div className="h-full overflow-y-auto p-8 bg-slate-950 text-slate-300 selection:bg-indigo-500/30">
                                <MarkdownView content={file.name.endsWith('.puml') || file.name.endsWith('.plantuml') ? `\`\`\`plantuml\n${file.content}\n\`\`\`` : file.content} />
                            </div>
                        ) : (
                            <RichCodeEditor 
                                code={file.content} 
                                onChange={(code: string) => handleCodeChangeInSlot(code, idx)} 
                                language={file.language} 
                                fontSize={fontSize} 
                                indentMode={indentMode}
                            />
                        )}
                    </div>
                  </>
              ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-700 bg-slate-950/50 border-2 border-dashed border-slate-800 m-4 rounded-xl group cursor-pointer hover:border-slate-600 transition-colors">
                      <Plus size={32} className="opacity-20 group-hover:opacity-40 transition-opacity mb-2" />
                      <p className="text-xs font-bold uppercase tracking-widest">Pane {idx + 1}</p>
                      <p className="text-[10px] opacity-50 mt-1">Select from Explorer</p>
                  </div>
              )}
              {isFocused && <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>}
          </div>
      );
  };

  const getShareLink = () => {
    const url = new URL(window.location.href);
    if (sessionId) url.searchParams.set('session', sessionId);
    if (writeToken) url.searchParams.set('key', writeToken);
    url.searchParams.delete('view');
    url.searchParams.delete('id');
    return url.toString();
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden relative font-sans">
      <header className="h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 z-20">
         <div className="flex items-center space-x-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"><ArrowLeft size={20} /></button>
            
            {/* Sidebar Toggle: Explorer */}
            <button 
                onClick={() => setIsLeftOpen(!isLeftOpen)} 
                className={`p-2 rounded-lg transition-colors ${isLeftOpen ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}
                title={isLeftOpen ? "Hide Explorer" : "Show Explorer"}
            >
                {isLeftOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
            </button>

            <h1 className="font-bold text-white text-sm flex items-center gap-2">
                {isInterviewMode ? <UserCheck className="text-emerald-400" size={18}/> : <Code className="text-indigo-400" size={18}/>}
                {isInterviewMode ? 'Interview Studio' : project.name}
            </h1>

            {isSharedSession && (
                <div className="flex items-center gap-2 px-3 py-1 bg-indigo-900/40 rounded-full border border-indigo-500/30">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></div>
                    <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Live Session</span>
                    {isReadOnly && <Lock size={10} className="text-amber-400 ml-1" title="Read Only Mode"/>}
                </div>
            )}
         </div>

         <div className="flex items-center space-x-2">
            {!isInterviewMode ? (
                <button 
                    onClick={() => setIsInterviewMode(true)}
                    className="flex items-center space-x-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md mr-4 animate-pulse"
                >
                    <UserCheck size={14}/>
                    <span>Mock Interview</span>
                </button>
            ) : (
                <div className="flex items-center gap-4 mr-4">
                    <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                        <span className="text-xs font-mono text-red-400">{formatTime(interviewTimer)}</span>
                    </div>
                    <button 
                        onClick={handleResetInterview}
                        className="text-xs text-slate-400 hover:text-white font-bold"
                    >
                        Exit Mode
                    </button>
                </div>
            )}

            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 mr-4">
                <button onClick={() => handleSetLayout('single')} className={`p-1.5 rounded transition-colors ${layoutMode === 'single' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`} title="Single Frame"><SquareIcon size={16}/></button>
                <button onClick={() => handleSetLayout('split-v')} className={`p-1.5 rounded transition-colors ${layoutMode === 'split-v' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`} title="Vertical Split"><Columns size={16}/></button>
                <button onClick={() => handleSetLayout('split-h')} className={`p-1.5 rounded transition-colors ${layoutMode === 'split-h' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`} title="Horizontal Split"><Rows size={16}/></button>
                <button onClick={() => handleSetLayout('quad')} className={`p-1.5 rounded transition-colors ${layoutMode === 'quad' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`} title="4 Frame Mode"><Grid2X2 size={16}/></button>
            </div>

            <div className="flex items-center gap-1 bg-slate-800/50 p-1 rounded-lg border border-slate-700 mr-2">
                <button 
                    onClick={() => setIndentMode(prev => prev === 'spaces' ? 'tabs' : 'spaces')} 
                    className={`p-1.5 rounded transition-colors flex items-center gap-1.5 px-2.5 ${indentMode === 'tabs' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'}`}
                    title={indentMode === 'tabs' ? "Using Real Tabs" : "Using 4 Spaces"}
                >
                    <Indent size={14} />
                    <span className="text-[10px] font-bold uppercase">{indentMode}</span>
                </button>
                <div className="w-px h-4 bg-slate-700 mx-1"></div>
                <button onClick={() => setFontSize(f => Math.max(10, f - 2))} className="p-1.5 hover:bg-slate-700 rounded text-slate-400"><ZoomOut size={16}/></button>
                <button onClick={() => setFontSize(f => Math.min(48, f + 2))} className="p-1.5 hover:bg-slate-700 rounded text-slate-400"><ZoomIn size={16}/></button>
            </div>

            <button 
                onClick={() => setShowShareModal(true)} 
                className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-bold shadow-md mr-2 transition-all ${isSharedSession ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
            >
                <Share2 size={14}/>
                <span>{isSharedSession ? 'Share' : 'Share'}</span>
            </button>

            <button onClick={() => handleSmartSave()} className="flex items-center space-x-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md mr-2"><Save size={14}/><span>Save</span></button>

            {/* Sidebar Toggle: AI Assistant */}
            <button 
                onClick={() => setIsRightOpen(!isRightOpen)} 
                className={`p-2 rounded-lg transition-colors ${isRightOpen ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-white'}`}
                title={isRightOpen ? "Hide AI Assistant" : "Show AI Assistant"}
            >
                {isRightOpen ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
            </button>
         </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
          {/* EXPLORER PANEL */}
          <div className={`${isZenMode ? 'hidden' : (isLeftOpen ? '' : 'hidden')} bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 overflow-hidden`} style={{ width: `${leftWidth}px` }}>
              <div className="flex border-b border-slate-800 bg-slate-900">
                  <button onClick={() => setActiveTab('cloud')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'cloud' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}><Cloud size={16}/></button>
                  <button onClick={() => setActiveTab('drive')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'drive' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}><HardDrive size={16}/></button>
                  <button onClick={() => setActiveTab('github')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'github' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}><Github size={16}/></button>
                  {isSharedSession && <button onClick={() => setActiveTab('session')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'session' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}><Users size={16}/></button>}
              </div>
              <div className="p-3 border-b border-slate-800 flex flex-wrap gap-2 bg-slate-900 justify-center">
                  <button onClick={handleCreateFile} className="flex-1 flex items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white py-1.5 px-2 rounded text-xs font-bold shadow-md transition-colors whitespace-nowrap"><FileCode size={14}/> <span>New File</span></button>
                  <button onClick={handleCreateWhiteboard} className="flex-1 flex items-center justify-center gap-1 bg-pink-600 hover:bg-pink-500 text-white py-1.5 px-2 rounded text-xs font-bold shadow-md transition-colors whitespace-nowrap"><PenTool size={14}/> <span>New Board</span></button>
                  <button onClick={refreshExplorer} className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"><RefreshCw size={16}/></button>
              </div>
              <div className="flex-1 overflow-y-auto">
                  {(activeTab === 'cloud' || activeTab === 'session') && (activeTab === 'session' ? workspaceTree : cloudTree).map(node => <FileTreeItem key={node.id} node={node} depth={0} activeId={activeFile?.path} onSelect={handleExplorerSelect} onToggle={handleCloudToggle} onDelete={()=>{}} onShare={()=>{}} expandedIds={expandedFolders} loadingIds={loadingFolders} onDragStart={()=>{}} onDrop={()=>{}}/>)}
                  {activeTab === 'drive' && (driveToken ? driveTree.map(node => <FileTreeItem key={node.id} node={node} depth={0} activeId={activeFile?.path} onSelect={handleExplorerSelect} onToggle={handleDriveToggle} onDelete={()=>{}} expandedIds={expandedFolders} loadingIds={loadingFolders} onDragStart={()=>{}} onDrop={()=>{}}/>) : <div className="p-4 text-center"><button onClick={handleConnectDrive} className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg border border-slate-700 hover:bg-slate-700">Connect Drive</button></div>)}
                  {activeTab === 'github' && (project.github ? workspaceTree.map(node => <FileTreeItem key={node.id} node={node} depth={0} activeId={activeFile?.path} onSelect={handleExplorerSelect} onToggle={()=>{}} onDelete={()=>{}} onRename={()=>{}} expandedIds={expandedFolders} loadingIds={loadingFolders} onDragStart={()=>{}} onDrop={()=>{}}/>) : <div className="p-4 text-center"><button onClick={() => handleOpenRepo()} className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg border border-slate-700 hover:bg-slate-700">Open Default Repo</button></div>)}
              </div>
              
              {isSharedSession && (
                  <div className="p-3 border-t border-slate-800 bg-slate-950">
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Active Users</p>
                        <button onClick={handleStopSession} className="text-[9px] text-red-400 hover:text-red-300 font-bold uppercase">End Session</button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                          {Object.values(activeClients).map(client => {
                              // Fixed: Explicitly cast to CursorPosition to fix 'unknown' type error
                              const c = client as CursorPosition;
                              return (
                                <div key={c.clientId} className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shadow-sm" style={{ borderColor: c.color, backgroundColor: `${c.color}30`, color: c.color }} title={`${c.userName} - ${c.fileName}`}>
                                    {c.userName[0].toUpperCase()}
                                </div>
                              );
                          })}
                      </div>
                  </div>
              )}
          </div>

          <div onMouseDown={() => setIsDraggingLeft(true)} className="w-1 cursor-col-resize hover:bg-indigo-500/50 transition-colors z-30 shrink-0 bg-slate-800/20 group relative">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 bg-indigo-500 p-0.5 rounded-full pointer-events-none"><GripVertical size={10}/></div>
          </div>

          {/* MAIN EDITOR AREA: DYNAMIC GRID/FLEX LAYOUT */}
          <div ref={centerContainerRef} className={`flex-1 bg-slate-950 flex min-w-0 relative ${layoutMode === 'quad' ? 'grid grid-cols-2 grid-rows-2' : layoutMode === 'split-v' ? 'flex-row' : layoutMode === 'split-h' ? 'flex-col' : 'flex-col'}`}>
              {/* Interview Setup View Overlay */}
              {isInterviewMode && interviewStep === 'setup' && (
                  <div className="absolute inset-0 z-50 bg-slate-950 flex items-center justify-center p-8 overflow-y-auto">
                      <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-[2rem] p-10 shadow-2xl space-y-8 animate-fade-in-up">
                          <div className="flex items-center gap-4">
                              <div className="p-3 bg-emerald-500/20 rounded-2xl text-emerald-400">
                                  <UserCheck size={32} />
                              </div>
                              <div>
                                  <h2 className="text-2xl font-black text-white">Interview Prep</h2>
                                  <p className="text-slate-400 text-sm">Upload your profile to tailor the mock interview.</p>
                              </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><FileUser size={14}/> Your Resume / Profile</label>
                                  <textarea 
                                    value={resumeText}
                                    onChange={e => setResumeText(e.target.value)}
                                    placeholder="Paste your resume or bio here..."
                                    className="w-full h-48 bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-300 outline-none focus:border-emerald-500 resize-none transition-all"
                                  />
                              </div>
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Briefcase size={14}/> Target Job Description</label>
                                  <textarea 
                                    value={jobDescription}
                                    onChange={e => setJobDescription(e.target.value)}
                                    placeholder="Paste the role details here..."
                                    className="w-full h-48 bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-300 outline-none focus:border-indigo-500 resize-none transition-all"
                                  />
                              </div>
                          </div>

                          <div className="flex gap-4">
                              <button 
                                onClick={handleResetInterview}
                                className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-2xl transition-all"
                              >
                                Cancel
                              </button>
                              <button 
                                onClick={handleStartInterview}
                                className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl shadow-xl shadow-emerald-900/20 transition-all flex items-center justify-center gap-2"
                              >
                                <Play size={20} fill="currentColor"/>
                                <span>Start 30-Min Live Interview</span>
                              </button>
                          </div>
                          <p className="text-[10px] text-slate-500 text-center uppercase tracking-widest">Screen & Camera Recording Enabled Automatically</p>
                      </div>
                  </div>
              )}

              {/* Interview Feedback View Overlay */}
              {isInterviewMode && interviewStep === 'feedback' && (
                  <div className="absolute inset-0 z-50 bg-slate-950 flex items-center justify-center p-8 overflow-y-auto">
                      <div className="max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-[2rem] p-10 shadow-2xl space-y-8 animate-fade-in-up relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-12 bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none"></div>
                          
                          <div className="flex justify-between items-start relative z-10">
                              <div className="flex items-center gap-4">
                                  <div className="p-4 bg-emerald-500 text-white rounded-3xl shadow-xl shadow-emerald-500/20">
                                      <Trophy size={32} />
                                  </div>
                                  <div>
                                      <h2 className="text-3xl font-black text-white">Interview Performance</h2>
                                      <p className="text-slate-400">Detailed feedback and growth analysis.</p>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <div className="text-5xl font-black text-emerald-400">{interviewScore}</div>
                                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Final Score</div>
                              </div>
                          </div>

                          <div className="bg-slate-950/50 rounded-2xl p-8 border border-slate-800 prose prose-invert max-w-none shadow-inner">
                              <MarkdownView content={interviewFeedback || "No feedback generated."} />
                          </div>

                          <div className="flex gap-4">
                              <button 
                                onClick={handleResetInterview}
                                className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-xl shadow-indigo-900/20 transition-all flex items-center justify-center gap-2"
                              >
                                <RefreshCw size={20} />
                                <span>Try Another Round</span>
                              </button>
                              <button 
                                onClick={() => setIsInterviewMode(false)}
                                className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-2xl transition-all"
                              >
                                Done
                              </button>
                          </div>
                      </div>
                  </div>
              )}

              {layoutMode === 'single' && renderSlot(0)}
              
              {layoutMode === 'split-v' && (
                  <>
                    {renderSlot(0)}
                    <div onMouseDown={() => setIsDraggingInner(true)} className="w-1.5 cursor-col-resize hover:bg-indigo-500/50 transition-colors z-40 bg-slate-800 group relative flex-shrink-0">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 bg-indigo-500 p-1 rounded-full shadow-lg pointer-events-none transition-opacity duration-200"><GripVertical size={12}/></div>
                    </div>
                    {renderSlot(1)}
                  </>
              )}

              {layoutMode === 'split-h' && (
                  <>
                    {renderSlot(0)}
                    <div onMouseDown={() => setIsDraggingInner(true)} className="h-1.5 cursor-row-resize hover:bg-indigo-500/50 transition-colors z-40 bg-slate-800 group relative flex-shrink-0">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 bg-indigo-500 p-1 rounded-full shadow-lg pointer-events-none transition-opacity duration-200"><GripHorizontal size={12}/></div>
                    </div>
                    {renderSlot(1)}
                  </>
              )}

              {layoutMode === 'quad' && [0,1,2,3].map(i => renderSlot(i))}
          </div>

          <div onMouseDown={() => setIsDraggingRight(true)} className="w-1 cursor-col-resize hover:bg-indigo-500/50 transition-colors z-30 shrink-0 bg-slate-800/20 group relative">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 bg-indigo-500 p-0.5 rounded-full pointer-events-none"><GripVertical size={10}/></div>
          </div>

          {/* AI PANEL */}
          <div className={`${isZenMode ? 'hidden' : (isRightOpen ? '' : 'hidden')} bg-slate-950 flex flex-col shrink-0 overflow-hidden`} style={{ width: `${rightWidth}px` }}>
              <AIChatPanel isOpen={true} onClose={() => setIsRightOpen(false)} messages={chatMessages} onSendMessage={handleSendMessage} isThinking={isChatThinking} />
          </div>
      </div>

      <ShareModal 
        isOpen={showShareModal} 
        onClose={() => setShowShareModal(false)} 
        onShare={handleShare} 
        link={getShareLink()} 
        title={project.name}
        currentAccess={project.accessLevel}
        currentAllowedUsers={project.allowedUserIds}
        currentUserUid={currentUser?.uid}
      />
    </div>
  );
};
