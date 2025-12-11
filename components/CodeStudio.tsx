
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CodeProject, CodeFile, UserProfile, Channel } from '../types';
import { ArrowLeft, Save, Plus, Github, Cloud, HardDrive, Code, X, ChevronRight, ChevronDown, File, Folder, DownloadCloud, Loader2, CheckCircle, AlertTriangle, Info, FolderPlus, FileCode, RefreshCw, LogIn, CloudUpload, Trash2, ArrowUp, Edit2, FolderOpen, MoreVertical, Send, MessageSquare, Bot, Mic, Sparkles, SidebarClose, SidebarOpen, Users } from 'lucide-react';
import { connectGoogleDrive } from '../services/authService';
import { fetchPublicRepoInfo, fetchRepoContents, fetchFileContent, commitToRepo, fetchRepoSubTree } from '../services/githubService';
import { listCloudDirectory, saveProjectToCloud, deleteCloudItem, createCloudFolder, CloudItem, subscribeToCodeProject, saveCodeProject } from '../services/firestoreService';
import { ensureCodeStudioFolder, listDriveFiles, readDriveFile, saveToDrive, deleteDriveFile, createDriveFolder, DriveFile } from '../services/googleDriveService';
import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from '../services/private_keys';

interface CodeStudioProps {
  onBack: () => void;
  currentUser: any;
  userProfile?: UserProfile | null;
  sessionId?: string;
  accessKey?: string;
  onSessionStart?: (id: string) => void;
  onStartLiveSession?: (channel: Channel, context?: string) => void;
}

const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'json', label: 'JSON' },
  { id: 'markdown', label: 'Markdown' }
];

const PRESET_REPOS = [
  { label: 'CodeStudio (Demo)', path: 'Shengliang/codestudio' },
  { label: 'Linux Kernel', path: 'torvalds/linux' },
  { label: 'PostgreSQL', path: 'postgres/postgres' },
  { label: 'MySQL Server', path: 'mysql/mysql-server' },
  { label: 'Redis', path: 'redis/redis' },
  { label: 'React', path: 'facebook/react' },
  { label: 'Vue', path: 'vuejs/core' },
  { label: 'Node.js', path: 'nodejs/node' }
];

// Helper: Determine language from extension
function getLanguageFromExt(filename: string): any {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['js', 'jsx'].includes(ext || '')) return 'javascript';
    if (['ts', 'tsx'].includes(ext || '')) return 'typescript';
    if (ext === 'py') return 'python';
    if (ext === 'html') return 'html';
    if (ext === 'css') return 'css';
    if (ext === 'json') return 'json';
    if (ext === 'md') return 'markdown';
    return 'text';
}

// Helper Component: File Icon
const FileIcon: React.FC<{ filename: string }> = ({ filename }) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['js', 'ts', 'jsx', 'tsx'].includes(ext || '')) return <FileCode size={14} className="text-yellow-400" />;
    if (['html', 'css'].includes(ext || '')) return <Code size={14} className="text-orange-400" />;
    if (['py'].includes(ext || '')) return <FileCode size={14} className="text-blue-400" />;
    if (['json'].includes(ext || '')) return <FileCode size={14} className="text-green-400" />;
    return <File size={14} className="text-slate-400" />;
};

// Tree Node Structure
interface TreeNode {
    id: string; 
    name: string;
    type: 'file' | 'folder';
    data: any; 
    children: TreeNode[];
    isLoaded?: boolean; 
}

// Helper: Recursive File Tree Item
const FileTreeItem: React.FC<{
    node: TreeNode;
    depth: number;
    activeId?: string;
    onSelect: (node: TreeNode) => void;
    onToggle: (node: TreeNode) => void;
    onDelete?: (node: TreeNode) => void;
    expandedIds: Record<string, boolean>;
    loadingIds: Record<string, boolean>;
}> = ({ node, depth, activeId, onSelect, onToggle, onDelete, expandedIds, loadingIds }) => {
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
                {onDelete && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(node); }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-900/50 hover:text-red-400 rounded transition-all"
                        title="Delete"
                    >
                        <Trash2 size={10} />
                    </button>
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

// --- RICH EDITOR (With PrismJS) ---
const RichCodeEditor: React.FC<{ 
    code: string; 
    onChange: (val: string) => void;
    language: string;
    isShared?: boolean;
}> = ({ code, onChange, language, isShared }) => {
    const [highlightedCode, setHighlightedCode] = useState('');
    
    useEffect(() => {
        // Use Prism if available globally
        if ((window as any).Prism) {
            const prismLang = (window as any).Prism.languages[language] || (window as any).Prism.languages.javascript;
            setHighlightedCode((window as any).Prism.highlight(code, prismLang, language));
        } else {
            // Fallback
            setHighlightedCode(code.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
        }
    }, [code, language]);

    return (
        <div className="relative w-full h-full flex overflow-hidden">
            {/* Line Numbers */}
            <div className="w-10 bg-slate-900 text-slate-600 text-right pr-2 select-none text-sm font-mono pt-4 border-r border-slate-800">
                {code.split('\n').map((_, i) => <div key={i}>{i + 1}</div>)}
            </div>
            
            <div className="relative flex-1 h-full overflow-auto bg-[#1e1e1e]">
                {/* Highlight Layer */}
                <pre 
                    className="absolute top-0 left-0 m-0 p-4 font-mono text-sm pointer-events-none w-full min-h-full"
                    style={{ fontFamily: '"JetBrains Mono", monospace', lineHeight: '1.5' }}
                    aria-hidden="true"
                >
                    <code 
                       className={`language-${language}`} 
                       dangerouslySetInnerHTML={{ __html: highlightedCode + '<br/>' }} 
                    />
                </pre>
                
                {/* Input Layer */}
                <textarea 
                    value={code} 
                    onChange={(e) => onChange(e.target.value)} 
                    className="absolute top-0 left-0 w-full h-full p-4 font-mono text-sm bg-transparent text-transparent caret-white outline-none resize-none overflow-hidden"
                    style={{ fontFamily: '"JetBrains Mono", monospace', lineHeight: '1.5' }}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                />
            </div>
        </div>
    );
};

// --- AI Chat Sidebar ---
const AIChatPanel: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    codeContext: string; 
    onApplyCode: (newCode: string) => void;
}> = ({ isOpen, onClose, codeContext, onApplyCode }) => {
    const [messages, setMessages] = useState<Array<{role: 'user' | 'ai', text: string}>>([
        { role: 'ai', text: "Hello! I'm your coding assistant. I can help explain, debug, or rewrite your code." }
    ]);
    const [input, setInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim()) return;
        
        const userMsg = input;
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setInput('');
        setIsThinking(true);

        try {
            const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY;
            if (!apiKey) throw new Error("API Key missing");
            
            const ai = new GoogleGenAI({ apiKey });
            const prompt = `
                You are an expert Pair Programmer.
                
                Current File Context:
                \`\`\`
                ${codeContext}
                \`\`\`
                
                User Request: "${userMsg}"
                
                If the user asks to modify the code, provide the FULL updated code block wrapped in \`\`\`code\`\`\`. 
                Otherwise, explain or answer the question.
            `;

            const res = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt
            });
            
            setMessages(prev => [...prev, { role: 'ai', text: res.text || "No response." }]);
        } catch (e: any) {
            setMessages(prev => [...prev, { role: 'ai', text: "Error: " + e.message }]);
        } finally {
            setIsThinking(false);
        }
    };

    const extractCode = (text: string) => {
        const match = text.match(/```(?:code|javascript|typescript|python|html|css)?\n([\s\S]*?)```/);
        return match ? match[1] : null;
    };

    if (!isOpen) return null;

    return (
        <div className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-full absolute right-0 top-0 z-20 shadow-2xl">
            <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                <h3 className="font-bold text-white flex items-center gap-2"><Bot size={16} className="text-indigo-400"/> AI Assistant</h3>
                <button onClick={onClose}><X size={16} className="text-slate-400 hover:text-white"/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((m, i) => (
                    <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`px-3 py-2 rounded-lg text-xs max-w-[90%] whitespace-pre-wrap ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>
                            {m.text}
                            {m.role === 'ai' && extractCode(m.text) && (
                                <button 
                                    onClick={() => onApplyCode(extractCode(m.text)!)}
                                    className="mt-2 w-full flex items-center justify-center gap-1 bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-400 border border-emerald-500/30 rounded py-1 transition-colors font-bold"
                                >
                                    <Code size={12}/> Apply Code
                                </button>
                            )}
                        </div>
                    </div>
                ))}
                {isThinking && <div className="text-slate-500 text-xs italic flex items-center gap-2"><Loader2 size={12} className="animate-spin"/> AI is coding...</div>}
            </div>

            <form onSubmit={handleSend} className="p-3 border-t border-slate-800 bg-slate-950">
                <div className="flex gap-2">
                    <input 
                        value={input} 
                        onChange={e => setInput(e.target.value)} 
                        placeholder="Ask AI to edit..." 
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                    />
                    <button type="submit" disabled={!input || isThinking} className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50">
                        <Send size={14} />
                    </button>
                </div>
            </form>
        </div>
    );
};

export const CodeStudio: React.FC<CodeStudioProps> = ({ onBack, currentUser, userProfile, sessionId, accessKey, onSessionStart, onStartLiveSession }) => {
  // Project State
  const [project, setProject] = useState<CodeProject>({ id: 'init', name: 'New Project', files: [], lastModified: Date.now() });
  const [activeFileIndex, setActiveFileIndex] = useState<number>(-1);
  const [activeTab, setActiveTab] = useState<'github' | 'cloud' | 'drive'>('github');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  
  // Remote Files State
  const [cloudItems, setCloudItems] = useState<CloudItem[]>([]); 
  const [driveItems, setDriveItems] = useState<(DriveFile & { parentId?: string, isLoaded?: boolean })[]>([]); 
  const [driveRootId, setDriveRootId] = useState<string | null>(null);

  // UI State
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [loadingFolders, setLoadingFolders] = useState<Record<string, boolean>>({});
  const [notifications, setNotifications] = useState<Array<{id: string, type: 'success' | 'error' | 'info', message: string}>>([]);
  const [modal, setModal] = useState<{
      title: string; 
      message?: string; 
      hasInput?: boolean; 
      inputPlaceholder?: string; 
      onConfirm: (val?: string) => void;
  } | null>(null);
  
  // GitHub Specific
  const [publicRepoPath, setPublicRepoPath] = useState('');
  const [isLoadingPublic, setIsLoadingPublic] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Drive Auth
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [isDriveLoading, setIsDriveLoading] = useState(false);

  // Misc
  const [saveStatus, setSaveStatus] = useState<'saved' | 'modified' | 'saving'>('saved');

  // Shared Session
  const [isSharedSession, setIsSharedSession] = useState(!!sessionId);
  const [sharedUsers, setSharedUsers] = useState<string[]>([]); // Mock list of active users

  // --- Real-time Collaboration Hook ---
  useEffect(() => {
      if (sessionId) {
          setIsSharedSession(true);
          const unsubscribe = subscribeToCodeProject(sessionId, (remoteProject) => {
              // Simple Last-Write-Wins Merge Strategy
              setProject(prev => {
                  // Only update if remote is newer
                  if (remoteProject.lastModified > prev.lastModified) {
                      return remoteProject;
                  }
                  return prev;
              });
              
              // If active file was updated remotely, force refresh
              if (activeFileIndex >= 0) {
                  // Re-render handled by React key or state update
              }
          });
          
          setSharedUsers(['You', 'Teammate']); // Mock for UI
          
          return () => unsubscribe();
      }
  }, [sessionId]);

  const activeFile = activeFileIndex >= 0 ? project.files[activeFileIndex] : null;

  // --- Tree Builders ---
  // (Identical to previous implementation - condensed for brevity)
  const workspaceTree = useMemo(() => {
      const root: TreeNode[] = [];
      const map = new Map<string, TreeNode>();
      project.files.forEach(f => {
          const path = f.path || f.name;
          map.set(path, { id: path, name: f.name.split('/').pop()!, type: f.isDirectory ? 'folder' : 'file', data: f, children: [], isLoaded: f.childrenFetched });
      });
      project.files.forEach(f => {
          const path = f.path || f.name;
          const node = map.get(path)!;
          const parts = path.split('/');
          if (parts.length === 1) root.push(node);
          else {
              const parentPath = parts.slice(0, -1).join('/');
              const parent = map.get(parentPath);
              if (parent) parent.children.push(node);
              else root.push(node);
          }
      });
      const sortNodes = (nodes: TreeNode[]) => { nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1)); nodes.forEach(n => sortNodes(n.children)); };
      sortNodes(root);
      return root;
  }, [project.files]);

  const cloudTree = useMemo(() => {
      const root: TreeNode[] = [];
      const map = new Map<string, TreeNode>();
      cloudItems.forEach(item => map.set(item.fullPath, { id: item.fullPath, name: item.name, type: item.isFolder ? 'folder' : 'file', data: item, children: [] }));
      cloudItems.forEach(item => {
          const node = map.get(item.fullPath)!;
          const parts = item.fullPath.split('/');
          const parentPath = parts.slice(0, -1).join('/');
          const parent = map.get(parentPath);
          if (parent) parent.children.push(node); else root.push(node);
      });
      const realRoots = root.filter(n => n.id.split('/').length === 1 || !map.has(n.id.split('/').slice(0, -1).join('/')));
      return realRoots;
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

  // --- Handlers (Identical logic to previous) ---
  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = crypto.randomUUID();
      setNotifications(prev => [...prev, { id, type, message }]);
      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  };

  const handleLoadPublicRepo = async (path?: string) => {
      const targetPath = path || publicRepoPath;
      if (!targetPath.trim()) return;
      setIsLoadingPublic(true);
      try {
          const [owner, repo] = targetPath.split('/');
          const info = await fetchPublicRepoInfo(owner, repo);
          const { files, latestSha } = await fetchRepoContents(null, owner, repo, info.default_branch);
          setProject({ id: `gh-${info.id}`, name: info.full_name, files, lastModified: Date.now(), github: { owner, repo, branch: info.default_branch, sha: latestSha } });
          setActiveFileIndex(-1); setShowImportModal(false); setExpandedFolders({}); setActiveTab('github'); showNotification("Repo loaded", "success");
      } catch (e: any) { showNotification("Failed: " + e.message, "error"); } finally { setIsLoadingPublic(false); }
  };

  const handleWorkspaceSelect = async (node: TreeNode) => {
      const file = node.data as CodeFile;
      const index = project.files.findIndex(f => (f.path || f.name) === (file.path || file.name));
      if (index === -1) return;
      if (!file.loaded && project.github) {
          try {
              const content = await fetchFileContent(null, project.github.owner, project.github.repo, file.path || file.name, project.github.branch);
              setProject(prev => { const newFiles = [...prev.files]; newFiles[index] = { ...newFiles[index], content, loaded: true }; return { ...prev, files: newFiles }; });
          } catch(e) { showNotification("Load failed", "error"); }
      }
      setActiveFileIndex(index);
  };

  const handleWorkspaceToggle = async (node: TreeNode) => {
      const file = node.data as CodeFile;
      const path = file.path || file.name;
      setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
      if (!file.childrenFetched && project.github && !expandedFolders[path]) {
          setLoadingFolders(prev => ({ ...prev, [path]: true }));
          try {
              const children = await fetchRepoSubTree(localStorage.getItem('github_token'), project.github.owner, project.github.repo, file.treeSha!, file.path!);
              setProject(prev => { const newFiles = prev.files.map(f => (f.path || f.name) === path ? { ...f, childrenFetched: true } : f); return { ...prev, files: [...newFiles, ...children.filter(c => !newFiles.some(nf => (nf.path || nf.name) === (c.path || c.name)))] }; });
          } catch (e) { showNotification("Fetch failed", "error"); } finally { setLoadingFolders(prev => ({ ...prev, [path]: false })); }
      }
  };

  // --- Cloud Logic ---
  useEffect(() => { if (activeTab === 'cloud' && cloudItems.length === 0) listCloudDirectory('projects').then(setCloudItems).catch(console.error); }, [activeTab]);
  
  const handleCloudSelect = async (node: TreeNode) => {
      const item = node.data as CloudItem;
      if (item.isFolder || !item.url) return;

      const existingIdx = project.files.findIndex(f => f.path === item.fullPath);
      if (existingIdx !== -1) {
          setActiveFileIndex(existingIdx);
          return;
      }

      setLoadingFolders(prev => ({ ...prev, [item.fullPath]: true }));
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
          setProject(prev => ({ ...prev, files: [...prev.files, newFile] }));
          setActiveFileIndex(project.files.length);
      } catch (e: any) {
          showNotification("Failed to download cloud file", "error");
      } finally {
          setLoadingFolders(prev => ({ ...prev, [item.fullPath]: false }));
      }
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
          // Set root as loaded
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
              // Avoid duplicates
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

      const existingIdx = project.files.findIndex(f => f.path === `drive://${driveFile.id}`);
      if (existingIdx !== -1) {
          setActiveFileIndex(existingIdx);
          return;
      }

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
          setProject(prev => ({ ...prev, files: [...prev.files, newFile] }));
          setActiveFileIndex(project.files.length);
      } catch (e: any) {
          showNotification("Failed to read Drive file", "error");
      } finally {
          setLoadingFolders(prev => ({ ...prev, [node.id]: false }));
      }
  };

  // Editor Logic
  const handleCodeChange = (val: string) => {
      if (activeFileIndex < 0) return;
      const newFiles = [...project.files];
      newFiles[activeFileIndex] = { ...newFiles[activeFileIndex], content: val, isModified: true };
      setProject(prev => ({ ...prev, files: newFiles }));
      setSaveStatus('modified');
      
      // Real-time sync hook (Debounce this in real prod)
      if (isSharedSession && sessionId) {
          saveCodeProject({ ...project, files: newFiles, lastModified: Date.now() });
      }
  };

  const handleShareSession = async () => {
      if (!onSessionStart) return;
      const id = project.id !== 'init' ? project.id : crypto.randomUUID();
      if (project.id === 'init') {
          // Save first
          await saveCodeProject({ ...project, id });
      }
      onSessionStart(id);
      setIsSharedSession(true);
      showNotification("Session shared! URL updated.", "success");
  };

  const handleStartVoice = () => {
      if (!onStartLiveSession || !activeFile) return;
      const channel: Channel = {
          id: `voice-${Date.now()}`,
          title: `Code Review: ${activeFile.name}`,
          description: "Live Code Review",
          author: "System",
          voiceName: "Fenrir",
          systemInstruction: "You are a senior engineer doing a code review. Be strict but helpful.",
          likes: 0, dislikes: 0, comments: [], tags: [], imageUrl: "", createdAt: Date.now()
      };
      onStartLiveSession(channel, activeFile.content);
  };

  const handleSmartSave = async () => {
      setSaveStatus('saving');
      try {
          if (activeTab === 'github' && project.github) {
              const ghToken = localStorage.getItem('github_token');
              if (ghToken) { await commitToRepo(ghToken, project, "Update"); showNotification("Pushed to GitHub", "success"); }
          } else if (activeTab === 'drive' && activeFile && driveToken && driveRootId) {
              // Extract ID if it's a known drive file
              const fileId = activeFile.path?.startsWith('drive://') ? activeFile.path.replace('drive://', '') : '';
              // If it's a new file, saveToDrive handles creation. If existing, it handles patch.
              // Logic needs to know filename.
              await saveToDrive(driveToken, driveRootId, activeFile.name, activeFile.content); 
              showNotification("Saved to Drive", "success");
          } else if (activeTab === 'cloud' && activeFile) {
              await saveProjectToCloud('projects', activeFile.name, activeFile.content); showNotification("Saved to Cloud", "success");
          } else {
              showNotification("Saved locally", "success");
          }
          setSaveStatus('saved');
      } catch (e: any) { showNotification("Save failed: " + e.message, "error"); setSaveStatus('modified'); }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden relative">
      {/* Notifications */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
          {notifications.map(n => (
              <div key={n.id} className={`flex items-center gap-2 px-4 py-2 rounded-full shadow-xl text-sm font-bold animate-fade-in-up ${n.type === 'error' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-200 border border-slate-700'}`}>
                  {n.type === 'error' ? <AlertTriangle size={14}/> : <Info size={14}/>} <span>{n.message}</span>
              </div>
          ))}
      </div>

      {/* Header */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 z-20">
         <div className="flex items-center space-x-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"><ArrowLeft size={20} /></button>
            <div className="flex items-center space-x-2">
               <div className="bg-indigo-600 p-1.5 rounded-lg"><Code size={18} className="text-white" /></div>
               <h1 className="font-bold text-white text-sm">{project.name}</h1>
               {isSharedSession && <span className="bg-red-900/50 text-red-400 text-[10px] px-2 py-0.5 rounded border border-red-500/50 animate-pulse flex items-center gap-1"><Users size={10}/> LIVE</span>}
            </div>
            
            <div className="flex items-center space-x-2">
               {/* Teach Me Button */}
               {activeFile && (
                   <button onClick={handleStartVoice} className="flex items-center space-x-2 px-3 py-1.5 bg-pink-900/30 hover:bg-pink-900/50 text-pink-400 border border-pink-500/30 rounded-lg text-xs font-bold transition-colors">
                       <Mic size={14}/> <span>Teach Me</span>
                   </button>
               )}
               
               {/* Share Button */}
               <button onClick={handleShareSession} className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${isSharedSession ? 'bg-indigo-900/50 text-indigo-300 border-indigo-500/50' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'}`}>
                   <Users size={14}/> <span>{isSharedSession ? 'Shared' : 'Share'}</span>
               </button>

               <button onClick={handleSmartSave} className="flex items-center space-x-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md">
                   {saveStatus === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 
                   <span>Save</span>
               </button>
               <button onClick={() => { 
                   const newFile = { name: 'new.js', language: 'javascript' as any, content: '', loaded: true };
                   setProject(prev => ({ ...prev, files: [...prev.files, newFile] }));
                   setActiveFileIndex(project.files.length);
               }} className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold border border-slate-700">
                   <Plus size={14} /> <span>New File</span>
               </button>
               <button onClick={() => setIsAIChatOpen(!isAIChatOpen)} className={`p-2 rounded-lg transition-colors ${isAIChatOpen ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}>
                   {isAIChatOpen ? <SidebarClose size={18}/> : <SidebarOpen size={18}/>}
               </button>
            </div>
         </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
          {/* Sidebar */}
          <div className={`${isSidebarOpen ? 'w-64' : 'w-0'} bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300 overflow-hidden`}>
              <div className="flex border-b border-slate-800 bg-slate-950/50">
                  <button onClick={() => setActiveTab('github')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'github' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}><Github size={18}/></button>
                  <button onClick={() => setActiveTab('cloud')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'cloud' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}><Cloud size={18}/></button>
                  <button onClick={() => setActiveTab('drive')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'drive' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}><HardDrive size={18}/></button>
              </div>

              <div className="flex-1 overflow-y-auto">
                  {/* GitHub View */}
                  {activeTab === 'github' && (
                      <div className="p-2">
                          <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-slate-800/50">
                              <span className="text-xs font-bold text-slate-500">WORKSPACE</span>
                              <button onClick={() => setShowImportModal(true)} className="text-[10px] text-indigo-400 hover:underline">Import Repo</button>
                          </div>
                          {workspaceTree.map(node => (
                              <FileTreeItem 
                                  key={node.id} node={node} depth={0} 
                                  activeId={activeFile?.path || activeFile?.name}
                                  onSelect={handleWorkspaceSelect} onToggle={handleWorkspaceToggle}
                                  expandedIds={expandedFolders} loadingIds={loadingFolders}
                              />
                          ))}
                      </div>
                  )}
                  
                  {/* Cloud View */}
                  {activeTab === 'cloud' && (
                      <div className="p-2">
                          {cloudTree.map(node => (
                              <FileTreeItem 
                                  key={node.id} node={node} depth={0} 
                                  onSelect={handleCloudSelect} 
                                  onToggle={()=>{}} 
                                  expandedIds={expandedFolders} loadingIds={loadingFolders}
                              />
                          ))}
                          {cloudTree.length===0 && <div className="p-4 text-xs text-slate-500">No cloud files.</div>}
                      </div>
                  )}
                  
                  {/* Drive View */}
                  {activeTab === 'drive' && (
                      <div className="p-2">
                          {!driveToken ? (
                              <div className="text-center p-4">
                                  <p className="text-xs text-slate-500 mb-2">Access your Google Drive files.</p>
                                  <button onClick={handleConnectDrive} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-xs text-white rounded font-bold transition-colors">Connect Drive</button>
                              </div>
                          ) : (
                              driveTree.map(node => (
                                  <FileTreeItem 
                                      key={node.id} node={node} depth={0} 
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

          {/* Editor Area */}
          <div className="flex-1 bg-[#1e1e1e] flex flex-col min-w-0 relative">
              {activeFile ? (
                  <>
                    <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <FileIcon filename={activeFile.name} />
                            <span className="text-sm font-bold text-white">{activeFile.name}</span>
                            {activeFile.isModified && <span className="w-2 h-2 rounded-full bg-yellow-500"></span>}
                        </div>
                        <span className="text-xs text-slate-500">{activeFile.language}</span>
                    </div>
                    <div className="flex-1 overflow-hidden relative">
                        <RichCodeEditor 
                            code={activeFile.content} 
                            onChange={handleCodeChange} 
                            language={activeFile.language}
                            isShared={isSharedSession}
                        />
                    </div>
                  </>
              ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                      <Code size={48} className="mb-4 opacity-20" />
                      <p className="text-sm">Select a file from the explorer.</p>
                  </div>
              )}
          </div>

          {/* AI Chat Sidebar */}
          <AIChatPanel 
              isOpen={isAIChatOpen} 
              onClose={() => setIsAIChatOpen(false)} 
              codeContext={activeFile?.content || ''}
              onApplyCode={handleCodeChange}
          />
      </div>

      {/* GitHub Repo Modal */}
      {showImportModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2"><Github size={24}/> Open Repository</h3>
                      <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                  </div>
                  <div className="space-y-4">
                      <select onChange={(e) => setPublicRepoPath(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none">
                          <option value="">-- Presets --</option>
                          {PRESET_REPOS.map(p => <option key={p.path} value={p.path}>{p.label}</option>)}
                      </select>
                      <input type="text" placeholder="owner/repo" value={publicRepoPath} onChange={e => setPublicRepoPath(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"/>
                      <button onClick={() => handleLoadPublicRepo()} disabled={isLoadingPublic || !publicRepoPath} className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold">{isLoadingPublic ? <Loader2 size={14} className="animate-spin inline"/> : 'Load'}</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
