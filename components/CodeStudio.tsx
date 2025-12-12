
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { CodeProject, CodeFile, UserProfile, Channel, CursorPosition } from '../types';
import { ArrowLeft, Save, Plus, Github, Cloud, HardDrive, Code, X, ChevronRight, ChevronDown, File, Folder, DownloadCloud, Loader2, CheckCircle, AlertTriangle, Info, FolderPlus, FileCode, RefreshCw, LogIn, CloudUpload, Trash2, ArrowUp, Edit2, FolderOpen, MoreVertical, Send, MessageSquare, Bot, Mic, Sparkles, SidebarClose, SidebarOpen, Users, Eye, FileText as FileTextIcon, Image as ImageIcon, StopCircle, Minus, Maximize2, Lock, Unlock, Share2 } from 'lucide-react';
import { connectGoogleDrive } from '../services/authService';
import { fetchPublicRepoInfo, fetchRepoContents, fetchFileContent, commitToRepo, fetchRepoSubTree } from '../services/githubService';
import { listCloudDirectory, saveProjectToCloud, deleteCloudItem, createCloudFolder, CloudItem, subscribeToCodeProject, saveCodeProject, updateCodeFile, updateCursor, claimCodeProjectLock } from '../services/firestoreService';
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
    return <File size={14} className="text-slate-400" />;
};

interface TreeNode {
    id: string; 
    name: string;
    type: 'file' | 'folder';
    data: any; 
    children: TreeNode[];
    isLoaded?: boolean; 
}

const FileTreeItem: React.FC<{
    node: TreeNode;
    depth: number;
    activeId?: string;
    onSelect: (node: TreeNode) => void;
    onToggle: (node: TreeNode) => void;
    expandedIds: Record<string, boolean>;
    loadingIds: Record<string, boolean>;
}> = ({ node, depth, activeId, onSelect, onToggle, expandedIds, loadingIds }) => {
    const isOpen = expandedIds[node.id];
    const isLoading = loadingIds[node.id];
    const isActive = activeId === node.id;

    return (
        <div className="select-none">
            <div 
                className={`flex items-center justify-between py-1 px-2 cursor-pointer hover:bg-slate-800 transition-colors ${isActive ? 'bg-slate-800 text-white' : 'text-slate-400'} group`}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={() => node.type === 'folder' ? onToggle(node) : onSelect(node)}
            >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {node.type === 'folder' ? (
                        <>
                            <button className="p-0.5 hover:text-white" onClick={(e) => { e.stopPropagation(); onToggle(node); }}>
                                {isLoading ? <Loader2 size={12} className="animate-spin"/> : 
                                 isOpen ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                            </button>
                            {isOpen ? <FolderOpen size={14} className="text-indigo-400 shrink-0"/> : <Folder size={14} className="text-indigo-400 shrink-0"/>}
                            <span className={`text-xs truncate font-bold ${isOpen ? 'text-indigo-200' : ''}`}>{node.name}</span>
                        </>
                    ) : (
                        <>
                            <span className="w-4"></span>
                            <FileIcon filename={node.name} />
                            <span className={`text-xs truncate ${isActive ? 'text-indigo-300' : ''}`}>{node.name}</span>
                        </>
                    )}
                </div>
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
                                expandedIds={expandedIds}
                                loadingIds={loadingIds}
                            />
                        ))
                    ) : (
                        !isLoading && <div className="text-[10px] text-slate-600 pl-8 py-1 italic">Empty</div>
                    )}
                </div>
            )}
        </div>
    );
};

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
            onCursorMove(lines.length, lines[lines.length - 1].length + 1);
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
                        <div key={cursor.clientId} className="absolute pointer-events-none transition-all duration-75" style={{ top: `${(cursor.line - 1) * 21 + PADDING}px`, left: `calc(${(cursor.column - 1)}ch + ${PADDING}px)`, height: '21px', ...EDITOR_FONT }}>
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
        const match = text.match(/```(?:code|javascript|typescript|python)?\n([\s\S]*?)```/);
        return match ? match[1] : null;
    };

    if (!isOpen) return null;

    return (
        <div className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-full absolute right-0 top-0 z-20 shadow-2xl">
            <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                <h3 className="font-bold text-white flex items-center gap-2">
                    {isVoiceActive ? <Mic size={16} className="text-red-500 animate-pulse"/> : <Bot size={16} className="text-indigo-400"/>}
                    AI Assistant
                </h3>
                <div className="flex items-center gap-1">
                    <button onClick={onStartLive} className={`p-1.5 rounded ${isVoiceActive ? 'bg-red-500 text-white' : 'text-pink-400 hover:bg-slate-800'}`}>
                        {isVoiceActive ? <StopCircle size={16} /> : <Mic size={16} />}
                    </button>
                    <button onClick={onClose}><X size={16} className="text-slate-400 hover:text-white"/></button>
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

            <form onSubmit={handleSend} className="p-3 border-t border-slate-800 bg-slate-950">
                <div className="flex gap-2">
                    <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask AI..." className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none"/>
                    <button type="submit" disabled={!input || isThinking} className="p-2 bg-indigo-600 text-white rounded-lg"><Send size={14} /></button>
                </div>
            </form>
        </div>
    );
};

export const CodeStudio: React.FC<CodeStudioProps> = ({ onBack, currentUser, userProfile, sessionId, accessKey, onSessionStart }) => {
  const [project, setProject] = useState<CodeProject>({ id: 'init', name: 'New Project', files: [], lastModified: Date.now() });
  const [activeFile, setActiveFile] = useState<CodeFile | null>(null);
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code');
  const [activeTab, setActiveTab] = useState<'github' | 'cloud' | 'drive'>('github');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAIChatOpen, setIsAIChatOpen] = useState(true);
  
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
  
  // -- LOCK LOGIC --
  const isLockedByOther = useMemo(() => {
      if (!project.activeClientId) return false;
      if (project.activeClientId === clientId) return false;
      return (Date.now() - project.lastModified) < 30000;
  }, [project.activeClientId, project.lastModified, clientId]);

  const activeWriterName = isLockedByOther ? (project.activeWriterName || "Unknown") : (project.activeClientId === clientId ? "You" : null);

  const handleTakeControl = async () => {
      if (!isSharedSession || !sessionId || !currentUser) return;
      try {
          await claimCodeProjectLock(sessionId, clientId, currentUser.displayName || 'Anonymous');
          showNotification("You have taken edit control.", "success");
      } catch(e) { showNotification("Failed to take control.", "error"); }
  };

  const refreshLock = useCallback(async () => {
      if (!isSharedSession || !sessionId || !currentUser) return;
      if (project.activeClientId === clientId || !isLockedByOther) {
          try { await claimCodeProjectLock(sessionId, clientId, currentUser.displayName || 'Anonymous'); } catch(e) {}
      }
  }, [isSharedSession, sessionId, currentUser, project.activeClientId, isLockedByOther, clientId]);

  const activeRemoteCursors = useMemo(() => {
      if (!project.cursors || !activeFile) return [];
      return (Object.values(project.cursors) as CursorPosition[]).filter(c => c.clientId !== clientId && c.fileName === activeFile.name);
  }, [project.cursors, activeFile, clientId]);

  // -- FILESYSTEM --
  useEffect(() => {
      if (sessionId) {
          setIsSharedSession(true);
          const unsubscribe = subscribeToCodeProject(sessionId, (remoteProject) => {
              setProject(prev => {
                  if (remoteProject.lastModified > prev.lastModified) return remoteProject;
                  return { ...prev, cursors: remoteProject.cursors, activeClientId: remoteProject.activeClientId, activeWriterName: remoteProject.activeWriterName };
              });
              
              if (activeFile && !activeFile.path?.startsWith('drive') && !activeFile.path?.startsWith('cloud')) {
                  const remoteFile = remoteProject.files.find(f => (f.path || f.name) === (activeFile.path || activeFile.name));
                  if (remoteFile && remoteFile.content !== activeFile.content) setActiveFile(remoteFile);
              }
          });
          return () => unsubscribe();
      }
  }, [sessionId, clientId, activeFile]);

  // -- TREE BUILDING --
  const workspaceTree = useMemo(() => {
      const root: TreeNode[] = [];
      const map = new Map<string, TreeNode>();
      const repoFiles = project.files.filter(f => !f.path?.startsWith('drive://') && !f.path?.startsWith('cloud://'));
      repoFiles.forEach(f => {
          const path = f.path || f.name;
          map.set(path, { id: path, name: f.name.split('/').pop()!, type: f.isDirectory ? 'folder' : 'file', data: f, children: [], isLoaded: f.childrenFetched });
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

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = crypto.randomUUID();
      setNotifications(prev => [...prev, { id, type, message }]);
      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  };

  const handleShare = async () => {
        const idToShare = sessionId || crypto.randomUUID();
        
        if (!sessionId) {
            // Create initial cloud instance if local
            const newProject: CodeProject = {
                id: idToShare,
                name: project.name || 'Shared Project',
                files: project.files,
                lastModified: Date.now(),
                ownerId: currentUser?.uid
            };
            await saveCodeProject(newProject);
            if (onSessionStart) onSessionStart(idToShare);
        }

        const url = new URL(window.location.href);
        url.searchParams.set('session', idToShare);
        await navigator.clipboard.writeText(url.toString());
        showNotification("Session Link Copied!", "success");
  };

  const handleSmartSave = async () => {
      if (!activeFile) return;
      setSaveStatus('saving');
      try {
          if (activeFile.path?.startsWith('drive://') && driveToken) {
              await saveToDrive(driveToken, driveRootId || 'root', activeFile.name, activeFile.content);
              showNotification("Saved to Google Drive", "success");
          } 
          // 2. Handle Private Cloud Files
          else if (activeFile.path?.startsWith('cloud://')) {
              const fullStoragePath = activeFile.path.substring(8); 
              const lastSlash = fullStoragePath.lastIndexOf('/');
              const dir = lastSlash > -1 ? fullStoragePath.substring(0, lastSlash) : `projects/${currentUser?.uid}`;
              const name = lastSlash > -1 ? fullStoragePath.substring(lastSlash + 1) : activeFile.name;
              await saveProjectToCloud(dir, name, activeFile.content); 
              showNotification("Saved to Private Cloud", "success");
          } 
          // 3. Handle GitHub Files
          else if (project.github && activeTab === 'github' && activeFile.path) {
              const ghToken = localStorage.getItem('github_token');
              if (ghToken) { await commitToRepo(ghToken, project, "Update from CodeStudio"); showNotification("Pushed to GitHub", "success"); }
              else showNotification("No GitHub token found", "error");
          } 
          // 4. Handle Shared Session / Local
          else {
              if (isSharedSession && sessionId) {
                  await updateCodeFile(sessionId, activeFile);
                  showNotification("Synced to Shared Session", "success");
              } else if (activeTab === 'cloud' && currentUser) {
                  const userDir = `projects/${currentUser.uid}`;
                  await saveProjectToCloud(userDir, activeFile.name, activeFile.content);
                  listCloudDirectory(userDir).then(setCloudItems);
                  showNotification("Saved to Cloud", "success");
              } else {
                  showNotification("Saved locally (temporary)", "success");
              }
          }
          setSaveStatus('saved');
      } catch (e: any) { showNotification("Save failed: " + e.message, "error"); setSaveStatus('modified'); }
  };

  const handleCodeChange = (val: string) => {
      if (isLockedByOther) return;
      if (!activeFile) return;
      refreshLock();
      const updatedFile = { ...activeFile, content: val, isModified: true };
      setActiveFile(updatedFile);
      setSaveStatus('modified');
      if (!activeFile.path?.startsWith('drive') && !activeFile.path?.startsWith('cloud')) {
          setProject(prev => ({
              ...prev,
              files: prev.files.map(f => (f.path || f.name) === (activeFile.path || activeFile.name) ? updatedFile : f)
          }));
          if (isSharedSession && sessionId) updateCodeFile(sessionId, updatedFile).catch(console.error);
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
          setProject({ id: `gh-${info.id}`, name: info.full_name, files, lastModified: Date.now(), github: { owner, repo, branch: info.default_branch, sha: latestSha } });
          setActiveFile(null); setShowImportModal(false); setExpandedFolders({}); setActiveTab('github'); showNotification("Repo opened", "success");
      } catch (e: any) { showNotification(e.message, "error"); } finally { setIsLoadingPublic(false); }
  };

  const handleWorkspaceSelect = async (node: TreeNode) => {
      const file = node.data as CodeFile;
      if (!file.loaded && project.github) {
          try {
              const content = await fetchFileContent(null, project.github.owner, project.github.repo, file.path || file.name, project.github.branch);
              const updatedFile = { ...file, content, loaded: true };
              setProject(prev => ({ ...prev, files: prev.files.map(f => (f.path || f.name) === (file.path || file.name) ? updatedFile : f) }));
              setActiveFile(updatedFile);
          } catch(e) { showNotification("Load failed", "error"); }
      } else {
          setActiveFile(file);
      }
  };

  const handleCloudSelect = async (node: TreeNode) => {
      const item = node.data as CloudItem;
      if (item.isFolder || !item.url) return;
      setLoadingFolders(prev => ({ ...prev, [item.fullPath]: true }));
      try {
          const res = await fetch(item.url);
          const text = await res.text();
          setActiveFile({ name: item.name, path: `cloud://${item.fullPath}`, content: text, language: getLanguageFromExt(item.name), loaded: true, isDirectory: false });
      } catch (e) { showNotification("Download failed", "error"); } finally { setLoadingFolders(prev => ({ ...prev, [item.fullPath]: false })); }
  };

  // --- Drive Logic ---
  const handleConnectDrive = async () => {
      try { 
          const token = await connectGoogleDrive(); 
          setDriveToken(token); 
          setIsDriveLoading(true); 
          const rootId = await ensureCodeStudioFolder(token); 
          setDriveRootId(rootId); 
          const files = await listDriveFiles(token, rootId); 
          setDriveItems([{ id: rootId, name: 'CodeStudio', mimeType: 'application/vnd.google-apps.folder', isLoaded: true }, ...files.map(f => ({ ...f, parentId: rootId, isLoaded: false }))]); 
      } catch(e: any) { 
          showNotification(e.message, "error"); 
      } finally { 
          setIsDriveLoading(false); 
      }
  };

  const handleDriveToggle = async (node: TreeNode) => {
      const driveFile = node.data as (DriveFile & { isLoaded?: boolean });
      if (driveFile.isLoaded || !driveToken) {
          setExpandedFolders(prev => ({ ...prev, [node.id]: !prev[node.id] }));
          return;
      }

      setLoadingFolders(prev => ({ ...prev, [node.id]: true }));
      try {
          const files = await listDriveFiles(driveToken, driveFile.id);
          const newItems = files.map(f => ({ ...f, parentId: driveFile.id, isLoaded: false }));
          setDriveItems(prev => {
              const updated = prev.map(i => i.id === driveFile.id ? { ...i, isLoaded: true } : i);
              const uniqueNew = newItems.filter(n => !prev.some(p => p.id === n.id));
              return [...updated, ...uniqueNew];
          });
          setExpandedFolders(prev => ({ ...prev, [node.id]: true }));
      } catch (e: any) {
          showNotification("Failed to list Drive folder", "error");
      } finally {
          setLoadingFolders(prev => ({ ...prev, [node.id]: false }));
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
          showNotification("Failed to read Drive file", "error");
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

      <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 z-20">
         <div className="flex items-center space-x-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"><ArrowLeft size={20} /></button>
            <div className="flex flex-col">
               <h1 className="font-bold text-white text-sm flex items-center gap-2">{project.name} {activeFile && ` - ${activeFile.name}`}</h1>
               {isLockedByOther && <span className="text-[10px] text-amber-400 flex items-center gap-1 bg-amber-900/30 px-2 py-0.5 rounded border border-amber-500/50"><Lock size={10}/> Locked by {activeWriterName} (Read Only)</span>}
            </div>
         </div>
         <div className="flex items-center space-x-2">
            {isLockedByOther && <button onClick={handleTakeControl} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold flex items-center gap-1"><Unlock size={12}/> Take Control</button>}
            <button onClick={handleShare} className="flex items-center space-x-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-md"><Share2 size={14}/><span>Share</span></button>
            <button onClick={handleSmartSave} className="flex items-center space-x-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md"><Save size={14}/><span>Save</span></button>
            <button onClick={() => setIsAIChatOpen(!isAIChatOpen)} className="p-2 rounded-lg text-slate-400 hover:text-white"><SidebarOpen size={18}/></button>
         </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
          <div className={`${isSidebarOpen ? 'w-64' : 'w-0'} bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300 overflow-hidden`}>
              <div className="flex border-b border-slate-800 bg-slate-950/50">
                  <button onClick={() => setActiveTab('github')} className={`flex-1 py-3 flex justify-center border-b-2 ${activeTab === 'github' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500'}`}><Github size={18}/></button>
                  <button onClick={() => setActiveTab('cloud')} className={`flex-1 py-3 flex justify-center border-b-2 ${activeTab === 'cloud' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500'}`}><Cloud size={18}/></button>
                  <button onClick={() => setActiveTab('drive')} className={`flex-1 py-3 flex justify-center border-b-2 ${activeTab === 'drive' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500'}`}><HardDrive size={18}/></button>
              </div>
              <div className="flex-1 overflow-y-auto">
                  {activeTab === 'github' && (
                      <div className="p-2">
                          <button onClick={() => setShowImportModal(true)} className="text-[10px] text-indigo-400 hover:underline px-2 mb-2">Open Repo</button>
                          {workspaceTree.map(node => <FileTreeItem key={node.id} node={node} depth={0} activeId={activeFile?.path || activeFile?.name} onSelect={handleWorkspaceSelect} onToggle={(n) => setExpandedFolders(p => ({...p, [n.id]: !p[n.id]}))} expandedIds={expandedFolders} loadingIds={loadingFolders}/>)}
                      </div>
                  )}
                  {activeTab === 'cloud' && (
                      <div className="p-2">
                          {!currentUser ? <p className="text-xs text-slate-500 p-2">Sign in required.</p> : cloudTree.map(node => <FileTreeItem key={node.id} node={node} depth={0} onSelect={handleCloudSelect} onToggle={()=>{}} expandedIds={expandedFolders} loadingIds={loadingFolders}/>)}
                      </div>
                  )}
                  {activeTab === 'drive' && (
                      <div className="p-2">
                          {!driveToken ? (
                              <div className="text-center p-4">
                                  <p className="text-xs text-slate-500 mb-2">Access Google Drive.</p>
                                  <button onClick={handleConnectDrive} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-xs text-white rounded font-bold transition-colors">Connect Drive</button>
                              </div>
                          ) : (
                              driveTree.map(node => (
                                  <FileTreeItem 
                                      key={node.id} node={node} depth={0} 
                                      activeId={activeFile?.path}
                                      onSelect={handleDriveSelect} 
                                      onToggle={handleDriveToggle} 
                                      expandedIds={expandedFolders} loadingIds={loadingFolders}
                                  />
                              ))
                          )}
                      </div>
                  )}
              </div>
          </div>

          <div className="flex-1 bg-[#1e1e1e] flex flex-col min-w-0 relative">
              {activeFile ? (
                  <>
                    <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2"><FileIcon filename={activeFile.name} /><span className="text-sm font-bold text-white">{activeFile.name}</span></div>
                    </div>
                    <div className="flex-1 overflow-hidden relative">
                        <RichCodeEditor code={activeFile.content} onChange={handleCodeChange} onCursorMove={(l, c) => setLocalCursor({line: l, col: c})} language={activeFile.language} isShared={isSharedSession} remoteCursors={activeRemoteCursors} localCursor={localCursor} readOnly={isLockedByOther} />
                    </div>
                  </>
              ) : <div className="flex-1 flex flex-col items-center justify-center text-slate-600"><Code size={48} className="mb-4 opacity-20" /><p className="text-sm">Select a file.</p></div>}
          </div>

          <AIChatPanel isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} messages={chatMessages} onSendMessage={(txt) => setChatMessages(p => [...p, {role: 'user', text: txt}])} isThinking={isChatThinking} onApplyCode={handleCodeChange} onStartLive={()=>{}} isVoiceActive={isVoiceActive}/>
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
