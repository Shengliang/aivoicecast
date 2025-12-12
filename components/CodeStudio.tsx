import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { CodeProject, CodeFile, UserProfile, Channel, CursorPosition } from '../types';
import { ArrowLeft, Save, Plus, Github, Cloud, HardDrive, Code, X, ChevronRight, ChevronDown, File, Folder, DownloadCloud, Loader2, CheckCircle, AlertTriangle, Info, FolderPlus, FileCode, RefreshCw, LogIn, CloudUpload, Trash2, ArrowUp, Edit2, FolderOpen, MoreVertical, Send, MessageSquare, Bot, Mic, Sparkles, SidebarClose, SidebarOpen, Users, Eye, FileText as FileTextIcon, Image as ImageIcon, StopCircle, Minus, Maximize2, Lock, Unlock, Share2, Terminal, Copy, WifiOff, PanelRightClose, PanelRightOpen, Monitor, Laptop } from 'lucide-react';
import { connectGoogleDrive } from '../services/authService';
import { fetchPublicRepoInfo, fetchRepoContents, fetchFileContent, commitToRepo, fetchRepoSubTree } from '../services/githubService';
import { listCloudDirectory, saveProjectToCloud, deleteCloudItem, createCloudFolder, CloudItem, subscribeToCodeProject, saveCodeProject, updateCodeFile, updateCursor, claimCodeProjectLock, updateProjectActiveFile, deleteCodeFile } from '../services/firestoreService';
import { ensureCodeStudioFolder, listDriveFiles, readDriveFile, saveToDrive, deleteDriveFile, createDriveFolder, DriveFile } from '../services/googleDriveService';
import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';
import { GeminiLiveService } from '../services/geminiLive';
import { GEMINI_API_KEY } from '../services/private_keys';
import { MarkdownView } from './MarkdownView';
import { encodePlantUML } from '../utils/plantuml';

interface CodeStudioProps {
  onBack: () => void;
  currentUser: any;
  userProfile?: UserProfile | null;
  sessionId?: string;
  accessKey?: string;
  onSessionStart?: (id: string) => void;
  onSessionStop?: () => void;
  onStartLiveSession?: (channel: Channel, context?: string) => void;
}

const PRESET_REPOS = [
  { label: 'CodeStudio (Demo)', path: 'Shengliang/codestudio' },
  { label: 'Linux Kernel', path: 'torvalds/linux' },
  { label: 'React', path: 'facebook/react' },
  { label: 'Node.js', path: 'nodejs/node' }
];

const updateCodeTool: FunctionDeclaration = {
  name: "update_code",
  description: "Update the code in the current active file.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      code: { type: Type.STRING, description: "The full new code content." }
    },
    required: ["code"]
  }
};

function getLanguageFromExt(filename: string): any {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['js', 'jsx'].includes(ext || '')) return 'javascript';
    if (['ts', 'tsx'].includes(ext || '')) return 'typescript';
    if (ext === 'py') return 'python';
    if (ext === 'html') return 'html';
    if (ext === 'css') return 'css';
    if (ext === 'json') return 'json';
    if (ext === 'md') return 'markdown';
    if (['puml', 'plantuml'].includes(ext || '')) return 'plantuml';
    if (['cpp', 'c', 'h', 'hpp', 'cc', 'hh', 'cxx'].includes(ext || '')) return 'c++';
    return 'text';
}

function getRandomColor(id: string) {
    const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e'];
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

const FileIcon: React.FC<{ filename: string }> = ({ filename }) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['js', 'ts', 'jsx', 'tsx'].includes(ext || '')) return <FileCode size={14} className="text-yellow-400" />;
    if (['html', 'css'].includes(ext || '')) return <Code size={14} className="text-orange-400" />;
    if (['py'].includes(ext || '')) return <FileCode size={14} className="text-blue-400" />;
    if (['json'].includes(ext || '')) return <FileCode size={14} className="text-green-400" />;
    if (ext === 'md') return <Info size={14} className="text-indigo-400" />;
    if (['puml', 'plantuml'].includes(ext || '')) return <ImageIcon size={14} className="text-pink-400" />;
    if (['cpp', 'c', 'h', 'hpp'].includes(ext || '')) return <FileCode size={14} className="text-blue-500" />;
    return <File size={14} className="text-slate-400" />;
};

interface TreeNode {
    id: string; 
    name: string;
    type: 'file' | 'folder';
    data: any; 
    children: TreeNode[];
    isLoaded?: boolean; 
    status?: 'modified' | 'new' | 'sync' | 'error';
}

const FileTreeItem: React.FC<{
    node: TreeNode;
    depth: number;
    activeId?: string; // Currently highlighted node (file or folder)
    onSelect: (node: TreeNode) => void;
    onToggle: (node: TreeNode) => void;
    onDelete?: (node: TreeNode) => void;
    onShare?: (node: TreeNode) => void;
    expandedIds: Record<string, boolean>;
    loadingIds: Record<string, boolean>;
}> = ({ node, depth, activeId, onSelect, onToggle, onDelete, onShare, expandedIds, loadingIds }) => {
    const isOpen = expandedIds[node.id];
    const isLoading = loadingIds[node.id];
    const isActive = activeId === node.id;
    const [showMenu, setShowMenu] = useState(false);

    return (
        <div className="select-none relative group">
            <div 
                className={`flex items-center justify-between py-1 px-2 cursor-pointer hover:bg-slate-800 transition-colors ${isActive ? 'bg-slate-800/80 text-white border-l-2 border-indigo-500' : 'text-slate-400 border-l-2 border-transparent'}`}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={() => onSelect(node)}
                onMouseEnter={() => setShowMenu(true)}
                onMouseLeave={() => setShowMenu(false)}
            >
                <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                    {node.type === 'folder' ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                            <button className="p-0.5 hover:text-white" onClick={(e) => { e.stopPropagation(); onToggle(node); }}>
                                {isLoading ? <Loader2 size={12} className="animate-spin"/> : 
                                 isOpen ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                            </button>
                            {isOpen ? <FolderOpen size={14} className="text-indigo-400"/> : <Folder size={14} className="text-indigo-400"/>}
                        </div>
                    ) : (
                        <div className="pl-4 shrink-0">
                            <FileIcon filename={node.name} />
                        </div>
                    )}
                    <span className={`text-xs truncate ${isActive ? 'font-bold' : ''} ${node.status === 'modified' ? 'text-amber-400' : ''}`}>
                        {node.name} {node.status === 'modified' && '*'} {node.status === 'new' && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1 rounded ml-1">U</span>}
                    </span>
                </div>

                {/* Context Menu Trigger */}
                {(onDelete || onShare) && (showMenu || isActive) && (
                    <div className="flex items-center gap-1 bg-slate-900/80 rounded px-1" onClick={(e) => e.stopPropagation()}>
                        {onShare && (
                            <button onClick={() => onShare(node)} className="p-1 text-slate-400 hover:text-blue-400" title="Share Link">
                                <Share2 size={12} />
                            </button>
                        )}
                        {onDelete && (
                            <button onClick={() => onDelete(node)} className="p-1 text-slate-400 hover:text-red-400" title="Delete">
                                <Trash2 size={12} />
                            </button>
                        )}
                    </div>
                )}
            </div>
            
            {node.type === 'folder' && isOpen && (
                <div>
                    {node.children.length > 0 ? (
                        node.children.map((child) => (
                            <FileTreeItem 
                                key={child.id} 
                                node={child} 
                                depth={depth + 1}
                                activeId={activeId}
                                onSelect={onSelect}
                                onToggle={onToggle}
                                onDelete={onDelete}
                                onShare={onShare}
                                expandedIds={expandedIds}
                                loadingIds={loadingIds}
                            />
                        ))
                    ) : (
                        !isLoading && <div className="text-[10px] text-slate-600 py-1 italic" style={{ paddingLeft: `${(depth + 1) * 12 + 24}px` }}>Empty</div>
                    )}
                </div>
            )}
        </div>
    );
};

// ... RichCodeEditor ...
const RichCodeEditor: React.FC<{ 
    code: string; 
    onChange: (val: string) => void;
    onCursorMove?: (line: number, col: number) => void;
    language: string;
    isShared?: boolean;
    remoteCursors?: CursorPosition[];
    localCursor?: { line: number, col: number } | null;
    readOnly?: boolean;
}> = ({ code, onChange, onCursorMove, language, isShared, remoteCursors, localCursor, readOnly }) => {
    const [highlightedCode, setHighlightedCode] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lineNumbersRef = useRef<HTMLPreElement>(null);
    const preRef = useRef<HTMLPreElement>(null);
    
    useEffect(() => {
        if ((window as any).Prism) {
            const prismLang = (window as any).Prism.languages[language] || (window as any).Prism.languages.javascript;
            if (prismLang) {
                setHighlightedCode((window as any).Prism.highlight(code, prismLang, language));
            } else {
                setHighlightedCode(code.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
            }
        } else {
            setHighlightedCode(code.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
        }
    }, [code, language]);

    const handleInputEvents = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
        if (onCursorMove) {
            const target = e.target as HTMLTextAreaElement;
            const { selectionStart } = target;
            const textUpToCursor = target.value.substring(0, selectionStart);
            const lines = textUpToCursor.split('\n');
            const col = lines[lines.length - 1].length; // 0-based column
            onCursorMove(lines.length, col);
        }
    };

    const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
        const { scrollTop, scrollLeft } = e.currentTarget;
        if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = scrollTop;
        if (preRef.current) {
            preRef.current.scrollTop = scrollTop;
            preRef.current.scrollLeft = scrollLeft;
        }
    };

    const lineCount = code.split('\n').length;
    const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
    const EDITOR_FONT = { fontFamily: '"JetBrains Mono", monospace', fontSize: '14px', lineHeight: '1.5', tabSize: 4 };
    const PADDING = 16; 

    return (
        <div className={`relative w-full h-full flex bg-[#1e1e1e] overflow-hidden ${readOnly ? 'opacity-90' : ''}`}>
            <pre ref={lineNumbersRef} className="w-12 bg-[#1e1e1e] text-slate-600 text-right pr-3 select-none border-r border-slate-800 shrink-0 overflow-hidden" style={{ ...EDITOR_FONT, paddingTop: `${PADDING}px`, paddingBottom: `${PADDING}px`, margin: 0 }}>
                {lineNumbers}
            </pre>
            <div className="relative flex-1 h-full overflow-hidden">
                <pre ref={preRef} className="absolute inset-0 m-0 w-full h-full pointer-events-none overflow-hidden" style={{ ...EDITOR_FONT, padding: `${PADDING}px`, margin: 0, whiteSpace: 'pre' }}>
                    <code className={`language-${language}`} dangerouslySetInnerHTML={{ __html: highlightedCode + '<br/>' }} />
                </pre>
                
                {/* Remote Cursors */}
                <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
                    {remoteCursors && remoteCursors.map(cursor => (
                        <div key={cursor.clientId} className="absolute pointer-events-none transition-all duration-75" style={{ top: `${(cursor.line - 1) * 21 + PADDING}px`, left: `calc(${(cursor.column)}ch + ${PADDING}px)`, height: '21px', ...EDITOR_FONT }}>
                            <div className="w-0.5 h-full absolute top-0 left-0 animate-pulse" style={{ backgroundColor: cursor.color }}></div>
                            <div className="absolute -top-5 left-0 text-[10px] px-1.5 rounded text-white whitespace-nowrap z-10 shadow-md font-bold" style={{ backgroundColor: cursor.color, fontFamily: 'sans-serif', lineHeight: 'normal' }}>
                                {cursor.userName}
                            </div>
                        </div>
                    ))}
                </div>

                <textarea 
                    ref={textareaRef}
                    value={code} 
                    onChange={(e) => onChange(e.target.value)}
                    onKeyUp={handleInputEvents}
                    onClick={handleInputEvents}
                    onScroll={handleScroll}
                    readOnly={readOnly}
                    className={`absolute inset-0 w-full h-full bg-transparent text-transparent caret-white outline-none resize-none overflow-auto z-10 custom-scrollbar ${readOnly ? 'cursor-not-allowed' : ''}`}
                    style={{ ...EDITOR_FONT, padding: `${PADDING}px`, whiteSpace: 'pre', border: 'none', margin: 0 }}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                />
            </div>
        </div>
    );
};

// ... AIChatPanel ...
const AIChatPanel: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    messages: Array<{role: 'user' | 'ai', text: string}>;
    onSendMessage: (text: string) => void;
    isThinking: boolean;
    onApplyCode: (newCode: string) => void;
    onStartLive: () => void;
    isVoiceActive: boolean;
}> = ({ isOpen, onClose, messages, onSendMessage, isThinking, onApplyCode, onStartLive, isVoiceActive }) => {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim()) return;
        onSendMessage(input);
        setInput('');
    };

    const extractCode = (text: string) => {
        const match = text.match(/```(?:code|javascript|typescript|python|cpp|c\+\+)?\n([\s\S]*?)```/);
        return match ? match[1] : null;
    };

    if (!isOpen) return null;

    return (
        <div className="h-full flex flex-col bg-slate-900 border-l border-slate-800">
            <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                <h3 className="font-bold text-white flex items-center gap-2 text-sm">
                    {isVoiceActive ? <Mic size={14} className="text-red-500 animate-pulse"/> : <Bot size={14} className="text-indigo-400"/>}
                    AI Assistant
                </h3>
                <div className="flex items-center gap-1">
                    <button onClick={onStartLive} className={`p-1 rounded ${isVoiceActive ? 'bg-red-500 text-white' : 'text-pink-400 hover:bg-slate-800'}`}>
                        {isVoiceActive ? <StopCircle size={14} /> : <Mic size={14} />}
                    </button>
                    <button onClick={onClose}><X size={14} className="text-slate-400 hover:text-white"/></button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((m, i) => (
                    <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`px-3 py-2 rounded-lg text-xs max-w-[90%] whitespace-pre-wrap ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>
                            {m.text}
                            {m.role === 'ai' && extractCode(m.text) && (
                                <button onClick={() => onApplyCode(extractCode(m.text)!)} className="mt-2 w-full flex items-center justify-center gap-1 bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 rounded py-1 font-bold">
                                    <Code size={12}/> Apply Code
                                </button>
                            )}
                        </div>
                    </div>
                ))}
                {(isThinking || isVoiceActive) && <div className="text-slate-500 text-xs italic flex items-center gap-2"><Loader2 size={12} className="animate-spin"/> Processing...</div>}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSend} className="p-3 border-t border-slate-800 bg-slate-950 shrink-0">
                <div className="flex gap-2">
                    <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask AI..." className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none"/>
                    <button type="submit" disabled={!input || isThinking} className="p-2 bg-indigo-600 text-white rounded-lg"><Send size={14} /></button>
                </div>
            </form>
        </div>
    );
};

export const CodeStudio: React.FC<CodeStudioProps> = ({ onBack, currentUser, userProfile, sessionId, accessKey, onSessionStart, onSessionStop }) => {
  // Default Hello World C++ File
  const defaultFile: CodeFile = {
      name: 'hello.cpp',
      path: 'cloud://hello.cpp',
      language: 'c++',
      content: `#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}`,
      loaded: true,
      isDirectory: false,
      isModified: true // Mark as new so it encourages saving
  };

  const [project, setProject] = useState<CodeProject>({ id: 'init', name: 'New Project', files: [defaultFile], lastModified: Date.now() });
  const [activeFile, setActiveFile] = useState<CodeFile | null>(defaultFile);
  const [activeTab, setActiveTab] = useState<'cloud' | 'drive' | 'github' | 'session'>('cloud');
  
  // Selection State
  const [selectedExplorerNode, setSelectedExplorerNode] = useState<TreeNode | null>(null);

  // Layout State
  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isRightOpen, setIsRightOpen] = useState(true);
  
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'ai', text: string}>>([{ role: 'ai', text: "Hello! I'm your coding assistant." }]);
  const [isChatThinking, setIsChatThinking] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const liveService = useRef<GeminiLiveService | null>(null);

  const [cloudItems, setCloudItems] = useState<CloudItem[]>([]); 
  const [driveItems, setDriveItems] = useState<(DriveFile & { parentId?: string, isLoaded?: boolean })[]>([]); 
  const [driveRootId, setDriveRootId] = useState<string | null>(null);

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [loadingFolders, setLoadingFolders] = useState<Record<string, boolean>>({});
  const [notifications, setNotifications] = useState<Array<{id: string, type: 'success' | 'error' | 'info', message: string}>>([]);
  
  const [publicRepoPath, setPublicRepoPath] = useState('');
  const [isLoadingPublic, setIsLoadingPublic] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'modified' | 'saving'>('saved');

  const [isSharedSession, setIsSharedSession] = useState(!!sessionId);
  const clientId = useRef(crypto.randomUUID()).current;
  const [localCursor, setLocalCursor] = useState<{line: number, col: number} | null>(null);
  
  // ... (Debug & Lock Logic same as before) ...
  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const debugRef = useRef<HTMLDivElement>(null);

  const addDebugLog = (msg: string) => {
      setDebugLogs(prev => {
          const newLogs = [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`];
          return newLogs.slice(-20); // Keep last 20 logs
      });
  };

  const handleCopyDebug = () => {
      if (debugRef.current) {
          const text = debugRef.current.innerText;
          navigator.clipboard.writeText(text);
          showToast("Debug info copied to clipboard", "success");
      }
  };
  
  const isLockedByOther = useMemo(() => {
      if (!project.activeClientId) return false;
      if (project.activeClientId === clientId) return false;
      return (Date.now() - project.lastModified) < 30000;
  }, [project.activeClientId, project.lastModified, clientId]);

  const activeWriterName = isLockedByOther ? (project.activeWriterName || "Unknown") : (project.activeClientId === clientId ? "You" : null);
  const iAmWriter = project.activeClientId === clientId || (!isLockedByOther && !project.activeClientId);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = crypto.randomUUID();
      setNotifications(prev => [...prev, { id, type, message }]);
      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  };

  const activeRemoteCursors = useMemo(() => {
      if (!project.cursors) return [];
      return (Object.values(project.cursors) as CursorPosition[]).filter(c => c.clientId !== clientId && c.fileName === activeFile?.name);
  }, [project.cursors, clientId, activeFile?.name]);

  const handleTakeControl = async () => {
      if (!isSharedSession || !sessionId || !currentUser) return;
      try {
          await claimCodeProjectLock(sessionId, clientId, currentUser.displayName || 'Anonymous');
          showToast("You have taken edit control.", "success");
      } catch(e) { showToast("Failed to take control.", "error"); }
  };

  const refreshLock = useCallback(async () => {
      if (!isSharedSession || !sessionId || !currentUser) return;
      if (project.activeClientId === clientId || !isLockedByOther) {
          try { await claimCodeProjectLock(sessionId, clientId, currentUser.displayName || 'Anonymous'); } catch(e) {}
      }
  }, [isSharedSession, sessionId, currentUser, project.activeClientId, isLockedByOther, clientId]);

  const handleShare = () => {
      if (onSessionStart && !sessionId) {
          const newId = project.id === 'init' ? crypto.randomUUID() : project.id;
          onSessionStart(newId);
      }
      
      const url = new URL(window.location.href);
      if (sessionId) url.searchParams.set('session', sessionId);
      
      navigator.clipboard.writeText(url.toString());
      showToast("Session link copied!", "success");
  };

  const handleSmartSave = async () => {
      setSaveStatus('saving');
      try {
          if (activeTab === 'cloud' && currentUser && activeFile) {
               await saveProjectToCloud(`projects/${currentUser.uid}`, activeFile.name, activeFile.content);
               showToast("Saved to Cloud", "success");
          } else if (activeTab === 'drive' && driveToken && driveRootId && activeFile) {
               await saveToDrive(driveToken, driveRootId, activeFile.name, activeFile.content);
               showToast("Saved to Drive", "success");
          } else if (isSharedSession && sessionId) {
               if (activeFile) await updateCodeFile(sessionId, activeFile);
               await saveCodeProject(project);
               showToast("Synced to Session", "success");
          } else {
               showToast("Saved locally (Session)", "success");
          }
          setSaveStatus('saved');
      } catch(e: any) {
          setSaveStatus('modified');
          showToast("Save failed: " + e.message, "error");
      }
  };

  const handleExplorerSelect = (node: TreeNode) => {
      setSelectedExplorerNode(node);
      if (node.type === 'file') {
          // If file, handle opening logic based on tab
          if (activeTab === 'cloud') handleCloudSelect(node);
          else if (activeTab === 'drive') handleDriveSelect(node);
          else if (activeTab === 'github') handleWorkspaceSelect(node);
          else setActiveFile(node.data);
      }
  };

  const handleCloudSelect = async (node: TreeNode) => {
      const item = node.data as CloudItem;
      if (!item.isFolder && item.url) {
          try {
              const res = await fetch(item.url);
              const text = await res.text();
              const newFile: CodeFile = {
                  name: item.name,
                  path: item.fullPath,
                  content: text,
                  language: getLanguageFromExt(item.name),
                  loaded: true,
                  isDirectory: false
              };
              setActiveFile(newFile);
              setProject(prev => {
                  const exists = prev.files.some(f => (f.path || f.name) === newFile.path);
                  if (!exists) return { ...prev, files: [...prev.files, newFile] };
                  return prev;
              });
          } catch(e) { showToast("Failed to load file", "error"); }
      }
  };

  const handleConnectDrive = async () => {
      try {
          const token = await connectGoogleDrive();
          setDriveToken(token);
          const rootId = await ensureCodeStudioFolder(token);
          setDriveRootId(rootId);
          // Initial list
          const files = await listDriveFiles(token, rootId);
          setDriveItems([{ id: rootId, name: 'CodeStudio', mimeType: 'application/vnd.google-apps.folder', isLoaded: true }, ...files.map(f => ({ ...f, parentId: rootId, isLoaded: false }))]);
          showToast("Google Drive Connected", "success");
      } catch(e: any) {
          showToast("Drive connection failed: " + e.message, "error");
      }
  };

  const handleDriveToggle = async (node: TreeNode) => {
      const driveFile = node.data as DriveFile;
      const isExpanded = expandedFolders[node.id];
      
      setExpandedFolders(prev => ({ ...prev, [node.id]: !isExpanded }));
      
      if (!isExpanded && driveToken && (!node.children || node.children.length === 0)) {
          setLoadingFolders(prev => ({ ...prev, [node.id]: true }));
          try {
              const files = await listDriveFiles(driveToken, driveFile.id);
              setDriveItems(prev => {
                  const newItems = files.map(f => ({ ...f, parentId: node.id, isLoaded: false }));
                  const combined = [...prev, ...newItems];
                  // Deduplicate
                  const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
                  return unique;
              });
          } catch(e) { console.error(e); } 
          finally { setLoadingFolders(prev => ({ ...prev, [node.id]: false })); }
      }
  };

  // -- FILESYSTEM SYNC --
  useEffect(() => {
      if (sessionId) {
          setIsSharedSession(true);
          const unsubscribe = subscribeToCodeProject(sessionId, (remoteProject) => {
              setProject(remoteProject);
              addDebugLog(`Received project update. Files: ${remoteProject.files.length}`);
          });
          return () => unsubscribe();
      } else {
          setIsSharedSession(false);
      }
  }, [sessionId]);

  // -- TREE BUILDING --
  const workspaceTree = useMemo(() => {
      const root: TreeNode[] = [];
      const map = new Map<string, TreeNode>();
      
      const repoFiles = project.files;
      
      repoFiles.forEach(f => {
          const path = f.path || f.name;
          map.set(path, { id: path, name: f.name.split('/').pop()!, type: f.isDirectory ? 'folder' : 'file', data: f, children: [], isLoaded: f.childrenFetched, status: f.isModified ? 'modified' : undefined });
      });
      repoFiles.forEach(f => {
          const path = f.path || f.name;
          const node = map.get(path)!;
          const parts = path.split('/');
          if (parts.length === 1) root.push(node);
          else {
              const parent = map.get(parts.slice(0, -1).join('/'));
              if (parent) parent.children.push(node); else root.push(node);
          }
      });
      return root;
  }, [project.files]);

  const cloudTree = useMemo(() => {
      const root: TreeNode[] = [];
      const map = new Map<string, TreeNode>();
      cloudItems.forEach(item => map.set(item.fullPath, { id: item.fullPath, name: item.name, type: item.isFolder ? 'folder' : 'file', data: item, children: [], isLoaded: true }));
      cloudItems.forEach(item => {
          const node = map.get(item.fullPath)!;
          const parts = item.fullPath.split('/');
          const parent = map.get(parts.slice(0, -1).join('/'));
          if (parent) parent.children.push(node); else root.push(node);
      });
      return root.filter(n => n.id.split('/').length === 1 || !map.has(n.id.split('/').slice(0, -1).join('/')));
  }, [cloudItems]);

  const driveTree = useMemo(() => {
      const root: TreeNode[] = [];
      const map = new Map<string, TreeNode>();
      driveItems.forEach(item => map.set(item.id, { id: item.id, name: item.name, type: item.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file', data: item, children: [], isLoaded: item.isLoaded }));
      driveItems.forEach(item => {
          const node = map.get(item.id)!;
          if (item.parentId && map.has(item.parentId)) map.get(item.parentId)!.children.push(node); else if (item.id === driveRootId || !item.parentId) root.push(node);
      });
      return root;
  }, [driveItems, driveRootId]);

  const refreshExplorer = () => {
      if (activeTab === 'cloud' && currentUser) {
          listCloudDirectory(`projects/${currentUser.uid}`).then(setCloudItems);
      } else if (activeTab === 'drive' && driveToken && driveRootId) {
          // Re-list root for simplicity
          listDriveFiles(driveToken, driveRootId).then(files => {
              setDriveItems([{ id: driveRootId, name: 'CodeStudio', mimeType: 'application/vnd.google-apps.folder', isLoaded: true }, ...files.map(f => ({ ...f, parentId: driveRootId, isLoaded: false }))]);
          });
      }
  };

  const handleCreateFolder = async () => {
      if (activeTab === 'github') return alert("Folder creation not supported in GitHub view.");
      const name = prompt("Folder Name:");
      if (!name) return;

      try {
          if (activeTab === 'cloud' && currentUser) {
              const parentPath = selectedExplorerNode?.type === 'folder' ? selectedExplorerNode.id : `projects/${currentUser.uid}`;
              await createCloudFolder(parentPath, name);
              showToast("Folder created in Cloud", "success");
          } else if (activeTab === 'drive' && driveToken) {
              const parentId = (selectedExplorerNode?.type === 'folder' ? selectedExplorerNode.id : null) || driveRootId!;
              await createDriveFolder(driveToken, parentId, name);
              showToast("Folder created in Drive", "success");
          } else if (activeTab === 'session') {
              // Local logical folder not fully supported in this simplified model without path management
              showToast("Folders in session are path-based. Create a file like 'folder/file.txt'", "info");
          }
          refreshExplorer();
      } catch(e: any) { showToast(e.message, "error"); }
  };

  const handleCreateFile = async () => {
      if (activeTab === 'github') return alert("File creation not supported in GitHub view.");
      const name = prompt("File Name (e.g. main.py):");
      if (!name) return;

      try {
          if (activeTab === 'cloud' && currentUser) {
              const parentPath = selectedExplorerNode?.type === 'folder' ? selectedExplorerNode.id : `projects/${currentUser.uid}`;
              // Ensure we don't double slash if parentPath ends with / or is root-like
              const fullPath = parentPath.endsWith('/') ? `${parentPath}${name}` : `${parentPath}/${name}`;
              await saveProjectToCloud(parentPath, name, "// New File");
              showToast("File created in Cloud", "success");
          } else if (activeTab === 'drive' && driveToken) {
              const parentId = (selectedExplorerNode?.type === 'folder' ? selectedExplorerNode.id : null) || driveRootId!;
              await saveToDrive(driveToken, parentId, name, "// New File");
              showToast("File created in Drive", "success");
          } else {
              // Session / Local
              // Get path prefix from selected node
              let prefix = '';
              if (selectedExplorerNode) {
                  if (selectedExplorerNode.type === 'folder') {
                      prefix = selectedExplorerNode.id + '/';
                  } else {
                      // If file selected, use its parent directory
                      const parts = selectedExplorerNode.id.split('/');
                      parts.pop();
                      if (parts.length > 0) prefix = parts.join('/') + '/';
                  }
              }
              const fullName = prefix + name;

              const newFile: CodeFile = {
                  name: fullName,
                  path: fullName,
                  language: getLanguageFromExt(name),
                  content: '// New File',
                  loaded: true,
                  isDirectory: false,
                  isModified: true
              };
              setProject(prev => ({ ...prev, files: [...prev.files, newFile] }));
              setActiveFile(newFile);
              if (isSharedSession && sessionId) await updateCodeFile(sessionId, newFile);
          }
          refreshExplorer();
      } catch(e: any) { showToast(e.message, "error"); }
  };

  const handleDeleteItem = async (node: TreeNode) => {
      if (!confirm(`Delete ${node.name}?`)) return;
      try {
          if (activeTab === 'cloud') {
              await deleteCloudItem(node.data as CloudItem);
          } else if (activeTab === 'drive' && driveToken) {
              await deleteDriveFile(driveToken, node.id);
          } else if (activeTab === 'session') {
              // Delete local
              setProject(prev => ({ ...prev, files: prev.files.filter(f => (f.path || f.name) !== node.id) }));
              if (activeFile && (activeFile.path || activeFile.name) === node.id) setActiveFile(null);
              if (isSharedSession && sessionId) await deleteCodeFile(sessionId, node.name);
          }
          showToast("Item deleted", "success");
          refreshExplorer();
      } catch(e: any) { showToast(e.message, "error"); }
  };

  const handleShareItem = (node: TreeNode) => {
      let link = "";
      if (activeTab === 'cloud') link = (node.data as CloudItem).url || "";
      else if (activeTab === 'github') link = `https://github.com/${project.github?.owner}/${project.github?.repo}/blob/${project.github?.branch}/${node.id}`;
      
      if (link) {
          navigator.clipboard.writeText(link);
          showToast("Link copied!", "success");
      } else {
          showToast("No shareable link available", "info");
      }
  };

  const handleCodeChange = (val: string) => {
      if (isLockedByOther) return;
      if (!activeFile) return;
      refreshLock();
      const updatedFile = { ...activeFile, content: val, isModified: true };
      setActiveFile(updatedFile);
      setSaveStatus('modified');
      
      // Update local project state immediately for smooth typing
      setProject(prev => ({
          ...prev,
          files: prev.files.map(f => (f.path || f.name) === (activeFile.path || activeFile.name) ? updatedFile : f)
      }));

      // Broadcast to shared session if active
      if (isSharedSession && sessionId) {
          updateCodeFile(sessionId, updatedFile)
            .then(() => addDebugLog(`Sent update: ${activeFile.name}`))
            .catch(e => addDebugLog(`Sync failed: ${e.message}`));
      }
  };

  // --- Handlers for Loaders ---
  const handleLoadPublicRepo = async () => {
      if (!publicRepoPath.trim()) return;
      setIsLoadingPublic(true);
      try {
          const [owner, repo] = publicRepoPath.split('/');
          const info = await fetchPublicRepoInfo(owner, repo);
          const { files, latestSha } = await fetchRepoContents(null, owner, repo, info.default_branch);
          
          const newProjectData: CodeProject = { 
              id: sessionId || `gh-${info.id}`, // Use session ID if shared to maintain session
              name: info.full_name, 
              files, 
              lastModified: Date.now(), 
              github: { owner, repo, branch: info.default_branch, sha: latestSha },
              ownerId: currentUser?.uid
          };

          setProject(newProjectData);
          setActiveFile(null); 
          setShowImportModal(false); 
          setExpandedFolders({}); 
          setActiveTab('github'); 
          showToast("Repo opened", "success");
          
          if (isSharedSession && sessionId) {
              await saveCodeProject(newProjectData);
              updateProjectActiveFile(sessionId, '');
          }

      } catch (e: any) { showToast(e.message, "error"); } finally { setIsLoadingPublic(false); }
  };

  const handleWorkspaceSelect = async (node: TreeNode) => {
      const file = node.data as CodeFile;
      if (!file.loaded && project.github) {
          try {
              const content = await fetchFileContent(null, project.github.owner, project.github.repo, file.path || file.name, project.github.branch);
              const updatedFile = { ...file, content, loaded: true };
              
              setProject(prev => ({ ...prev, files: prev.files.map(f => (f.path || f.name) === (file.path || file.name) ? updatedFile : f) }));
              setActiveFile(updatedFile);
              
              // If we fetched content, sync it to shared session so readers can see it too
              if (isSharedSession && sessionId) {
                  updateCodeFile(sessionId, updatedFile);
              }
          } catch(e) { showToast("Load failed", "error"); }
      } else {
          setActiveFile(file);
      }
  };

  const handleDriveSelect = async (node: TreeNode) => {
      const driveFile = node.data as DriveFile;
      if (!driveToken) return;

      setLoadingFolders(prev => ({ ...prev, [node.id]: true }));
      try {
          const text = await readDriveFile(driveToken, driveFile.id);
          const newFile: CodeFile = {
              name: driveFile.name,
              path: `drive://${driveFile.id}`, 
              content: text,
              language: getLanguageFromExt(driveFile.name),
              loaded: true,
              isDirectory: false
          };
          setActiveFile(newFile);
      } catch (e: any) {
          showToast("Failed to read Drive file", "error");
      } finally {
          setLoadingFolders(prev => ({ ...prev, [node.id]: false }));
      }
  };

  useEffect(() => { 
      if (activeTab === 'cloud' && currentUser) listCloudDirectory(`projects/${currentUser.uid}`).then(setCloudItems); 
  }, [activeTab, currentUser]);

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden relative">
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
          {notifications.map(n => <div key={n.id} className={`flex items-center gap-2 px-4 py-2 rounded-full shadow-xl text-sm font-bold ${n.type==='error'?'bg-red-600':'bg-slate-800 border border-slate-700'}`}><span>{n.message}</span></div>)}
      </div>

      {/* HEADER */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 z-20">
         <div className="flex items-center space-x-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"><ArrowLeft size={20} /></button>
            <div className="flex flex-col">
               <h1 className="font-bold text-white text-sm flex items-center gap-2">{project.name} {activeFile && ` - ${activeFile.name}`}</h1>
               {isLockedByOther && <span className="text-[10px] text-amber-400 flex items-center gap-1 bg-amber-900/30 px-2 py-0.5 rounded border border-amber-500/50"><Lock size={10}/> Locked by {activeWriterName} (Read Only)</span>}
            </div>
         </div>
         <div className="flex items-center space-x-2">
            <button onClick={() => setIsLeftOpen(!isLeftOpen)} className={`p-2 rounded-lg transition-colors ${!isLeftOpen ? 'text-indigo-400 bg-slate-800' : 'text-slate-400 hover:text-white'}`}><SidebarOpen size={18}/></button>
            {isLockedByOther && <button onClick={handleTakeControl} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold flex items-center gap-1"><Unlock size={12}/> Take Control</button>}
            <button onClick={() => setShowDebug(!showDebug)} className={`p-2 rounded-lg transition-colors ${showDebug ? 'text-green-400 bg-green-900/20' : 'text-slate-400 hover:text-white'}`}><Terminal size={18}/></button>
            
            {isSharedSession ? (
                <div className="flex items-center gap-2">
                    <button onClick={handleShare} className="flex items-center space-x-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-md" title="Copy Link">
                        <Share2 size={14}/><span>Link</span>
                    </button>
                    <button onClick={() => { if(confirm('Disconnect from session?')) onSessionStop?.(); }} className="flex items-center space-x-2 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold shadow-md">
                        <WifiOff size={14}/><span>Stop</span>
                    </button>
                </div>
            ) : (
                <button onClick={handleShare} className="flex items-center space-x-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-md"><Share2 size={14}/><span>Share</span></button>
            )}

            <button onClick={handleSmartSave} className="flex items-center space-x-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md"><Save size={14}/><span>Save</span></button>
            <button onClick={() => setIsRightOpen(!isRightOpen)} className={`p-2 rounded-lg transition-colors ${!isRightOpen ? 'text-indigo-400 bg-slate-800' : 'text-slate-400 hover:text-white'}`}><PanelRightOpen size={18}/></button>
         </div>
      </header>

      {/* MAIN BODY (3-PANE) */}
      <div className="flex-1 flex overflow-hidden relative">
          
          {/* LEFT PANE: EXPLORER */}
          <div className={`${isLeftOpen ? 'w-64' : 'w-0'} bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300 overflow-hidden shrink-0`}>
              {/* BACKEND TABS */}
              <div className="flex border-b border-slate-800 bg-slate-950/50">
                  <button onClick={() => setActiveTab('cloud')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'cloud' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`} title="Private Cloud"><Cloud size={16}/></button>
                  <button onClick={() => setActiveTab('drive')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'drive' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`} title="Google Drive"><HardDrive size={16}/></button>
                  <button onClick={() => setActiveTab('github')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'github' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`} title="GitHub"><Github size={16}/></button>
                  <button onClick={() => setActiveTab('session')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'session' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`} title="Live Session"><Laptop size={16}/></button>
              </div>

              {/* ACTION TOOLBAR */}
              <div className="p-2 border-b border-slate-800 flex gap-2 justify-center bg-slate-900">
                  <button onClick={handleCreateFolder} className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="New Folder"><FolderPlus size={16}/></button>
                  <button onClick={handleCreateFile} className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="New File"><FileCode size={16}/></button>
                  <button onClick={refreshExplorer} className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="Refresh"><RefreshCw size={16}/></button>
              </div>

              <div className="flex-1 overflow-y-auto">
                  {activeTab === 'github' && (
                      <div className="p-2">
                          <div className="flex items-center justify-between px-2 mb-2">
                              <span className="text-[10px] font-bold text-slate-500">REPOSITORY</span>
                              <button onClick={() => setShowImportModal(true)} className="text-[10px] text-indigo-400 hover:underline">Change</button>
                          </div>
                          {workspaceTree.map(node => <FileTreeItem key={node.id} node={node} depth={0} activeId={selectedExplorerNode?.id} onSelect={handleExplorerSelect} onToggle={(n) => setExpandedFolders(p => ({...p, [n.id]: !p[n.id]}))} expandedIds={expandedFolders} loadingIds={loadingFolders} onShare={handleShareItem} />)}
                      </div>
                  )}
                  {activeTab === 'cloud' && (
                      <div className="p-2">
                          {!currentUser ? <p className="text-xs text-slate-500 p-4 text-center">Sign in to access your Private Cloud storage.</p> : cloudTree.map(node => <FileTreeItem key={node.id} node={node} depth={0} activeId={selectedExplorerNode?.id} onSelect={handleExplorerSelect} onToggle={()=>{}} onDelete={handleDeleteItem} onShare={handleShareItem} expandedIds={expandedFolders} loadingIds={loadingFolders}/>)}
                      </div>
                  )}
                  {activeTab === 'drive' && (
                      <div className="p-2">
                          {!driveToken ? (
                              <div className="text-center p-4">
                                  <p className="text-xs text-slate-500 mb-2">Access Google Drive.</p>
                                  <button onClick={handleConnectDrive} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-xs text-white rounded font-bold transition-colors">Connect</button>
                              </div>
                          ) : (
                              driveTree.map(node => (
                                  <FileTreeItem 
                                      key={node.id} node={node} depth={0} 
                                      activeId={selectedExplorerNode?.id}
                                      onSelect={handleExplorerSelect} 
                                      onToggle={handleDriveToggle} 
                                      onDelete={handleDeleteItem}
                                      expandedIds={expandedFolders} loadingIds={loadingFolders}
                                  />
                              ))
                          )}
                      </div>
                  )}
                  {activeTab === 'session' && (
                      <div className="p-2">
                          <p className="text-[10px] font-bold text-slate-500 px-2 mb-2">IN MEMORY / SESSION</p>
                          {workspaceTree.map(node => <FileTreeItem key={node.id} node={node} depth={0} activeId={selectedExplorerNode?.id} onSelect={handleExplorerSelect} onToggle={(n) => setExpandedFolders(p => ({...p, [n.id]: !p[n.id]}))} onDelete={handleDeleteItem} expandedIds={expandedFolders} loadingIds={loadingFolders} />)}
                      </div>
                  )}
              </div>
          </div>

          {/* CENTER PANE: EDITOR */}
          <div className="flex-1 bg-[#1e1e1e] flex flex-col min-w-0 relative border-r border-slate-800">
              {activeFile ? (
                  <>
                    <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                            <FileIcon filename={activeFile.name} />
                            <span className="text-sm font-bold text-white">{activeFile.name}</span>
                            {activeFile.isModified && <span className="w-2 h-2 bg-amber-400 rounded-full"></span>}
                        </div>
                        <div className="text-xs text-slate-500">
                            {saveStatus === 'saving' ? <span className="text-indigo-400 flex items-center gap-1"><Loader2 size={10} className="animate-spin"/> Saving...</span> : 
                             saveStatus === 'modified' ? <span className="text-amber-400">Unsaved</span> : 
                             <span className="text-emerald-400">Saved</span>}
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden relative">
                        <RichCodeEditor code={activeFile.content} onChange={handleCodeChange} onCursorMove={(l, c) => setLocalCursor({line: l, col: c})} language={activeFile.language} isShared={isSharedSession} remoteCursors={activeRemoteCursors} localCursor={localCursor} readOnly={isLockedByOther} />
                    </div>
                  </>
              ) : <div className="flex-1 flex flex-col items-center justify-center text-slate-600"><Code size={48} className="mb-4 opacity-20" /><p className="text-sm">Select a file from the explorer.</p></div>}
              
              {/* DEBUG WINDOW - INTERACTIVE & COPYABLE */}
              {showDebug && (
                  <div ref={debugRef} className="absolute bottom-4 right-4 w-96 max-h-64 bg-black/80 backdrop-blur-sm border border-green-900 rounded-lg p-3 font-mono text-[10px] text-green-400 overflow-hidden flex flex-col shadow-2xl z-50 pointer-events-auto select-text cursor-text">
                      <div className="flex justify-between items-center border-b border-green-900/50 pb-1 mb-1">
                          <span className="font-bold flex items-center gap-2"><Terminal size={12}/> SESSION DEBUG</span>
                          <div className="flex items-center gap-2">
                              <span className={isSharedSession ? "text-green-400 animate-pulse" : "text-slate-500"}>●</span>
                              <button onClick={handleCopyDebug} className="bg-green-900/50 hover:bg-green-800 text-green-200 px-2 rounded border border-green-700/50 text-[9px] flex items-center gap-1 transition-colors">
                                  <Copy size={10} /> Copy
                              </button>
                          </div>
                      </div>
                      <div className="space-y-1 mb-2">
                          <p>Active Name: <span className="text-white break-all">{activeFile?.name || 'None'}</span></p>
                          <p>Active Path: <span className="text-yellow-200 break-all">{activeFile?.path || 'None'}</span></p>
                          {project.activeFilePath && <p>Host File: <span className="text-indigo-300 break-all">{project.activeFilePath}</span></p>}
                          <p>Local Cursor: Ln {localCursor?.line || 0}, Col {localCursor?.col || 0}</p>
                          <p>Remote Cursors: {activeRemoteCursors.length}</p>
                          {activeRemoteCursors.map(c => (
                              <p key={c.clientId} className="pl-2 text-slate-400 flex justify-between">
                                  <span>- {c.userName}</span>
                                  <span>({c.line}, {c.column})</span>
                              </p>
                          ))}
                      </div>
                      <div className="flex-1 overflow-y-auto border-t border-green-900/30 pt-1 space-y-0.5 scrollbar-thin scrollbar-thumb-green-900">
                          {debugLogs.map((log, i) => (
                              <p key={i} className="opacity-80 break-words">{log}</p>
                          ))}
                          {debugLogs.length === 0 && <p className="opacity-30 italic">No activity...</p>}
                      </div>
                  </div>
              )}
          </div>

          {/* RIGHT PANE: AI / PREVIEW */}
          <div className={`${isRightOpen ? 'w-80' : 'w-0'} bg-slate-900 flex flex-col transition-all duration-300 overflow-hidden shrink-0`}>
              <AIChatPanel 
                  isOpen={true} // Always render content, hide by width 
                  onClose={() => setIsRightOpen(false)} 
                  messages={chatMessages} 
                  onSendMessage={(txt) => setChatMessages(p => [...p, {role: 'user', text: txt}])} 
                  isThinking={isChatThinking} 
                  onApplyCode={handleCodeChange} 
                  onStartLive={()=>{}} 
                  isVoiceActive={isVoiceActive}
              />
          </div>
      </div>

      {showImportModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6">
                  <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-white flex items-center gap-2"><Github size={24}/> Open Repository</h3><button onClick={() => setShowImportModal(false)}><X size={20} className="text-slate-400"/></button></div>
                  <div className="space-y-4">
                      <select onChange={(e) => setPublicRepoPath(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"><option value="">-- Presets --</option>{PRESET_REPOS.map(p => <option key={p.path} value={p.path}>{p.label}</option>)}</select>
                      <input type="text" placeholder="owner/repo" value={publicRepoPath} onChange={e => setPublicRepoPath(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"/>
                      <button onClick={handleLoadPublicRepo} disabled={isLoadingPublic || !publicRepoPath} className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold">{isLoadingPublic ? <Loader2 size={14} className="animate-spin inline"/> : 'Load'}</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};