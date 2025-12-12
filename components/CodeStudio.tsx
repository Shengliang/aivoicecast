
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { CodeProject, CodeFile, UserProfile, Channel, CursorPosition, CloudItem } from '../types';
import { ArrowLeft, Save, Plus, Github, Cloud, HardDrive, Code, X, ChevronRight, ChevronDown, File, Folder, DownloadCloud, Loader2, CheckCircle, AlertTriangle, Info, FolderPlus, FileCode, RefreshCw, LogIn, CloudUpload, Trash2, ArrowUp, Edit2, FolderOpen, MoreVertical, Send, MessageSquare, Bot, Mic, Sparkles, SidebarClose, SidebarOpen, Users, Eye, FileText as FileTextIcon, Image as ImageIcon, StopCircle, Minus, Maximize2, Lock, Unlock, Share2, Terminal, Copy, WifiOff, PanelRightClose, PanelRightOpen, Monitor, Laptop } from 'lucide-react';
import { listCloudDirectory, saveProjectToCloud, deleteCloudItem, createCloudFolder, subscribeToCodeProject, saveCodeProject, updateCodeFile, updateCursor, claimCodeProjectLock, updateProjectActiveFile, deleteCodeFile, moveCloudFile } from '../services/firestoreService';
import { ensureCodeStudioFolder, listDriveFiles, readDriveFile, saveToDrive, deleteDriveFile, createDriveFolder, DriveFile, moveDriveFile } from '../services/googleDriveService';
import { connectGoogleDrive } from '../services/authService';
import { fetchPublicRepoInfo, fetchRepoContents, fetchFileContent } from '../services/githubService';
import { MarkdownView } from './MarkdownView';
import { encodePlantUML } from '../utils/plantuml';

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

const PRESET_REPOS = [
  { label: 'React (Facebook)', path: 'facebook/react' },
  { label: 'Vue (Evan You)', path: 'vuejs/core' },
  { label: 'VS Code', path: 'microsoft/vscode' },
  { label: 'Linux', path: 'torvalds/linux' },
  { label: 'Python', path: 'python/cpython' }
];

function getLanguageFromExt(filename: string): any {
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
    return 'text';
}

// --- Helper Components ---

const FileIcon = ({ filename }: { filename: string }) => {
    const lang = getLanguageFromExt(filename);
    if (lang === 'javascript' || lang === 'typescript') return <FileCode size={16} className="text-yellow-400" />;
    if (lang === 'python') return <FileCode size={16} className="text-blue-400" />;
    if (lang === 'c++') return <FileCode size={16} className="text-indigo-400" />;
    if (lang === 'html') return <FileCode size={16} className="text-orange-400" />;
    if (lang === 'css') return <FileCode size={16} className="text-blue-300" />;
    if (lang === 'json') return <FileCode size={16} className="text-green-400" />;
    if (lang === 'markdown') return <FileTextIcon size={16} className="text-slate-400" />;
    if (lang === 'plantuml') return <ImageIcon size={16} className="text-pink-400" />;
    return <File size={16} className="text-slate-500" />;
};

const FileTreeItem = ({ node, depth, activeId, onSelect, onToggle, onDelete, onShare, expandedIds, loadingIds, onDragStart, onDrop }: any) => {
    const isExpanded = expandedIds[node.id];
    const isLoading = loadingIds[node.id];
    const isActive = activeId === node.id;
    
    return (
        <div>
            <div 
                className={`flex items-center gap-1 py-1 px-2 cursor-pointer select-none hover:bg-slate-800 ${isActive ? 'bg-indigo-900/30 text-white' : 'text-slate-400'}`}
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
                <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                    {onShare && <button onClick={(e) => { e.stopPropagation(); onShare(node); }} className="p-1 hover:text-white"><Share2 size={10}/></button>}
                    {onDelete && <button onClick={(e) => { e.stopPropagation(); onDelete(node); }} className="p-1 hover:text-red-400"><Trash2 size={10}/></button>}
                </div>
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

const RichCodeEditor = ({ code, onChange, onCursorMove, language, isShared, remoteCursors, localCursor, readOnly }: any) => {
    return (
        <div className="w-full h-full relative font-mono text-sm">
            <textarea
                className="w-full h-full bg-[#1e1e1e] text-[#d4d4d4] p-4 resize-none outline-none leading-relaxed"
                value={code}
                onChange={(e) => onChange(e.target.value)}
                onSelect={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    const val = target.value.substr(0, target.selectionStart);
                    const lines = val.split('\n');
                    if (onCursorMove) onCursorMove(lines.length, lines[lines.length - 1].length);
                }}
                spellCheck={false}
                readOnly={readOnly}
            />
            {remoteCursors && remoteCursors.map((c: any) => (
                <div key={c.clientId} className="absolute pointer-events-none px-1 rounded text-[9px] text-white" style={{ top: 8, right: 8, background: c.color }}>
                    {c.userName} is editing
                </div>
            ))}
        </div>
    );
};

const AIChatPanel = ({ isOpen, onClose, messages, onSendMessage, isThinking, onApplyCode, onStartLive, isVoiceActive }: any) => {
    const [input, setInput] = useState('');
    return (
        <div className="flex flex-col h-full bg-slate-900 border-l border-slate-800">
            <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                <span className="font-bold text-white text-sm flex items-center gap-2"><Bot size={16} className="text-indigo-400"/> AI Assistant</span>
                <button onClick={onClose}><PanelRightClose size={16} className="text-slate-400 hover:text-white"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((m: any, i: number) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[90%] rounded-lg p-3 text-xs leading-relaxed ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                            {m.text}
                        </div>
                    </div>
                ))}
                {isThinking && <div className="text-slate-500 text-xs flex items-center gap-2 justify-center"><Loader2 className="animate-spin" size={12}/> AI is thinking...</div>}
            </div>
            <div className="p-3 border-t border-slate-800 bg-slate-900">
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={input} 
                        onChange={e => setInput(e.target.value)} 
                        onKeyDown={e => { if(e.key === 'Enter') { onSendMessage(input); setInput(''); } }}
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        placeholder="Ask AI..."
                    />
                    <button onClick={() => { onSendMessage(input); setInput(''); }} className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"><Send size={16}/></button>
                </div>
            </div>
        </div>
    );
};

// --- Main Component ---

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

export const CodeStudio: React.FC<CodeStudioProps> = ({ onBack, currentUser, userProfile, sessionId, accessKey, onSessionStart, onSessionStop }) => {
  const defaultFile: CodeFile = {
      name: 'hello.cpp',
      path: 'cloud://hello.cpp',
      language: 'c++',
      content: `#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}`,
      loaded: true,
      isDirectory: false,
      isModified: true
  };

  const [project, setProject] = useState<CodeProject>({ id: 'init', name: 'New Project', files: [defaultFile], lastModified: Date.now() });
  const [activeFile, setActiveFile] = useState<CodeFile | null>(defaultFile);
  const [activeTab, setActiveTab] = useState<'cloud' | 'drive' | 'github' | 'session'>('cloud');
  
  const [selectedExplorerNode, setSelectedExplorerNode] = useState<TreeNode | null>(null);
  const [draggedNode, setDraggedNode] = useState<TreeNode | null>(null);
  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isRightOpen, setIsRightOpen] = useState(true);
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'ai', text: string}>>([{ role: 'ai', text: "Hello! I'm your coding assistant." }]);
  const [isChatThinking, setIsChatThinking] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  
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
  const [saveStatus, setSaveStatus] = useState<'saved' | 'modified' | 'saving'>('saved');
  const [isSharedSession, setIsSharedSession] = useState(!!sessionId);
  const clientId = useRef(crypto.randomUUID()).current;
  const [localCursor, setLocalCursor] = useState<{line: number, col: number} | null>(null);
  
  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const debugRef = useRef<HTMLDivElement>(null);

  // Editor vs Preview State
  const [editorMode, setEditorMode] = useState<'code' | 'preview'>('code');
  const [plantUmlUrl, setPlantUmlUrl] = useState<string | null>(null);
  const lastActivePathRef = useRef<string | null>(null);

  useEffect(() => {
      const currentPath = activeFile ? (activeFile.path || activeFile.name) : null;
      if (currentPath !== lastActivePathRef.current) {
          lastActivePathRef.current = currentPath;
          // File switched - set default view mode
          if (activeFile) {
              const ext = activeFile.name.split('.').pop()?.toLowerCase();
              if (['md', 'markdown', 'puml', 'plantuml'].includes(ext || '')) {
                  setEditorMode('preview');
              } else {
                  setEditorMode('code');
              }
          }
      }
  }, [activeFile?.path, activeFile?.name]); // Trigger only when file identity changes

  useEffect(() => {
      if (activeFile && (activeFile.name.endsWith('.puml') || activeFile.name.endsWith('.plantuml')) && editorMode === 'preview') {
          encodePlantUML(activeFile.content).then(code => {
              setPlantUmlUrl(`http://www.plantuml.com/plantuml/svg/${code}`);
          });
      }
  }, [activeFile?.content, editorMode, activeFile?.name]);

  const addDebugLog = (msg: string) => {
      setDebugLogs(prev => {
          const newLogs = [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`];
          return newLogs.slice(-20);
      });
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = crypto.randomUUID();
      setNotifications(prev => [...prev, { id, type, message }]);
      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  };

  const isLockedByOther = useMemo(() => {
      if (!project.activeClientId) return false;
      if (project.activeClientId === clientId) return false;
      return (Date.now() - project.lastModified) < 30000;
  }, [project.activeClientId, project.lastModified, clientId]);

  const activeWriterName = isLockedByOther ? (project.activeWriterName || "Unknown") : (project.activeClientId === clientId ? "You" : null);

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

  const handleCopyDebug = () => {
      if (debugRef.current) {
          navigator.clipboard.writeText(debugRef.current.innerText);
          showToast("Debug info copied", "success");
      }
  };

  const refreshExplorer = async () => {
      if (activeTab === 'cloud' && currentUser) {
          const path = `projects/${currentUser.uid}`;
          await refreshCloudPath(path);
      } else if (activeTab === 'drive' && driveToken && driveRootId) {
          const files = await listDriveFiles(driveToken, driveRootId);
          setDriveItems([{ id: driveRootId, name: 'CodeStudio', mimeType: 'application/vnd.google-apps.folder', isLoaded: true }, ...files.map(f => ({ ...f, parentId: driveRootId, isLoaded: false }))]);
      }
      showToast("Explorer Refreshed", "success");
  };

  const handleSmartSave = async () => {
      setSaveStatus('saving');
      try {
          if (activeTab === 'cloud' && currentUser && activeFile) {
               const rootPrefix = `projects/${currentUser.uid}`;
               let targetPath = activeFile.path || '';
               let filename = activeFile.name;

               // Case 1: New File Template (cloud://)
               if (!targetPath || targetPath.startsWith('cloud://')) {
                   // Save to root if no specific folder logic (CodeStudio often works at root)
                   // But better to use the user's project root
                   targetPath = `${rootPrefix}/${filename}`;
               } 
               // Case 2: Existing File (or navigated into folder)
               else if (!targetPath.startsWith(rootPrefix)) {
                   // CRITICAL FIX: If path is relative or malformed, prepend user root
                   // Remove any leading slashes first
                   const cleanPath = targetPath.replace(/^\/+/, '');
                   targetPath = `${rootPrefix}/${cleanPath}`;
               }

               // Extract proper parent directory and filename from the Full Path
               const lastSlash = targetPath.lastIndexOf('/');
               const parentPath = lastSlash > -1 ? targetPath.substring(0, lastSlash) : rootPrefix;
               const finalFilename = lastSlash > -1 ? targetPath.substring(lastSlash + 1) : filename;

               await saveProjectToCloud(parentPath, finalFilename, activeFile.content);
               
               // Update state with the confirmed absolute path
               const updatedFile = { ...activeFile, path: targetPath, name: finalFilename };
               setActiveFile(updatedFile);
               setProject(prev => ({
                   ...prev,
                   files: prev.files.map(f => (f.path === activeFile.path || f.name === activeFile.name) ? updatedFile : f)
               }));
               
               // Refresh the directory we just saved to
               await refreshCloudPath(parentPath);

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
          console.error("Save Error:", e);
          showToast("Save failed: " + e.message, "error");
      }
  };

  const refreshCloudPath = async (path: string) => {
      if (!currentUser) return;
      try {
          const items = await listCloudDirectory(path);
          setCloudItems(prev => {
              const existingMap = new Map(prev.map(i => [i.fullPath, i]));
              items.forEach(i => existingMap.set(i.fullPath, i));
              return Array.from(existingMap.values());
          });
      } catch(e) { console.error(e); }
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

  const handleExplorerSelect = (node: TreeNode) => {
      setSelectedExplorerNode(node);
      if (node.type === 'file') {
          if (activeTab === 'cloud') handleCloudSelect(node);
          else if (activeTab === 'drive') handleDriveSelect(node);
          else if (activeTab === 'github') handleWorkspaceSelect(node);
          else setActiveFile(node.data);
      }
  };

  const handleCloudToggle = async (node: TreeNode) => {
      const isExpanded = expandedFolders[node.id];
      setExpandedFolders(prev => ({ ...prev, [node.id]: !isExpanded }));
      if (!isExpanded) {
          setLoadingFolders(prev => ({ ...prev, [node.id]: true }));
          try { await refreshCloudPath(node.id); } catch(e) { console.error(e); } finally { setLoadingFolders(prev => ({ ...prev, [node.id]: false })); }
      }
  };

  const handleConnectDrive = async () => {
      try {
          const token = await connectGoogleDrive();
          setDriveToken(token);
          const rootId = await ensureCodeStudioFolder(token);
          setDriveRootId(rootId);
          const files = await listDriveFiles(token, rootId);
          setDriveItems([{ id: rootId, name: 'CodeStudio', mimeType: 'application/vnd.google-apps.folder', isLoaded: true }, ...files.map(f => ({ ...f, parentId: rootId, isLoaded: false }))]);
          showToast("Google Drive Connected", "success");
      } catch(e: any) { showToast(e.message, "error"); }
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
                  return Array.from(new Map(combined.map(item => [item.id, item])).values());
              });
          } catch(e) { console.error(e); } finally { setLoadingFolders(prev => ({ ...prev, [node.id]: false })); }
      }
  };

  const handleDriveSelect = async (node: TreeNode) => {
      const driveFile = node.data as DriveFile;
      if (!driveToken) return;
      setLoadingFolders(prev => ({ ...prev, [node.id]: true }));
      try {
          const text = await readDriveFile(driveToken, driveFile.id);
          const newFile: CodeFile = { name: driveFile.name, path: `drive://${driveFile.id}`, content: text, language: getLanguageFromExt(driveFile.name), loaded: true, isDirectory: false };
          setActiveFile(newFile);
      } catch (e: any) { showToast("Failed to read Drive file", "error"); } finally { setLoadingFolders(prev => ({ ...prev, [node.id]: false })); }
  };

  const handleDragStart = (e: React.DragEvent, node: TreeNode) => {
      setDraggedNode(node);
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetNode: TreeNode) => {
      e.preventDefault();
      if (!draggedNode) return;
      if (draggedNode.id === targetNode.id) return;
      if (targetNode.type !== 'folder') return; 

      try {
          if (activeTab === 'cloud') {
              if (draggedNode.type === 'folder') {
                  alert("Moving folders is not supported in Cloud mode yet.");
                  return;
              }
              const item = draggedNode.data as CloudItem;
              const targetPath = (targetNode.data as CloudItem).fullPath;
              const newFullPath = targetPath.replace(/\/+$/, '') + '/' + item.name;
              
              await moveCloudFile(item.fullPath, newFullPath);
              
              setCloudItems(prev => prev.filter(i => i.fullPath !== item.fullPath));
              await refreshCloudPath(targetPath);
              
              if (activeFile && activeFile.path === item.fullPath) {
                  const updatedFile = { ...activeFile, path: newFullPath };
                  setActiveFile(updatedFile);
                  setProject(prev => ({
                       ...prev,
                       files: prev.files.map(f => f.path === activeFile.path ? updatedFile : f)
                   }));
              }
              showToast("File moved in Cloud", "success");
          }
      } catch (err: any) {
          showToast("Move failed: " + err.message, "error");
      } finally {
          setDraggedNode(null);
      }
  };

  const handleCreateFolder = async () => {
      const name = prompt("Folder Name:");
      if (!name) return;
      try {
          if (activeTab === 'cloud' && currentUser) {
              const parentPath = selectedExplorerNode?.type === 'folder' ? selectedExplorerNode.id : `projects/${currentUser.uid}`;
              await createCloudFolder(parentPath, name);
              showToast("Folder created", "success");
              await refreshCloudPath(parentPath);
          } 
      } catch(e: any) { showToast(e.message, "error"); }
  };

  const handleCreateFile = async () => {
      const name = prompt("File Name (e.g. main.py):");
      if (!name) return;

      try {
          if (activeTab === 'cloud' && currentUser) {
              let parentPath = `projects/${currentUser.uid}`;
              if (selectedExplorerNode) {
                  if (selectedExplorerNode.type === 'folder') {
                      parentPath = selectedExplorerNode.id;
                  } else {
                      const parts = selectedExplorerNode.id.split('/');
                      parts.pop(); 
                      if (parts.length > 0) parentPath = parts.join('/');
                  }
              }
              
              const cleanParent = parentPath.replace(/\/+$/, '');
              // Ensure we don't save to root if we are supposed to be in user project
              if (!cleanParent.startsWith(`projects/${currentUser.uid}`)) {
                  // This handles cases where selection is root or weird
                  // Note: parentPath logic above should already cover it if selectedExplorerNode is correct
              }

              await saveProjectToCloud(cleanParent, name, "// New File");
              const fullPath = `${cleanParent}/${name}`;
              await refreshCloudPath(cleanParent);
              
              const newFile: CodeFile = {
                  name: name,
                  path: fullPath,
                  language: getLanguageFromExt(name),
                  content: '// New File',
                  loaded: true,
                  isDirectory: false,
                  isModified: false
              };
              
              setActiveFile(newFile);
              setProject(prev => {
                  const exists = prev.files.some(f => f.path === fullPath);
                  if (exists) return prev;
                  return { ...prev, files: [...prev.files, newFile] };
              });
              
              showToast("File created", "success");
          } else if (activeTab === 'session') {
              let prefix = '';
              if (selectedExplorerNode) {
                  if (selectedExplorerNode.type === 'folder') {
                      prefix = selectedExplorerNode.id + '/';
                  } else {
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
      } catch(e: any) { showToast(e.message, "error"); }
  };

  const handleDeleteItem = async (node: TreeNode) => {
      if (!confirm(`Delete ${node.name}?`)) return;
      try {
          if (activeTab === 'cloud') {
              await deleteCloudItem(node.data as CloudItem);
              setCloudItems(prev => prev.filter(i => i.fullPath !== node.id));
          } else if (activeTab === 'session') {
              setProject(prev => ({ ...prev, files: prev.files.filter(f => (f.path || f.name) !== node.id) }));
              if (activeFile && (activeFile.path || activeFile.name) === node.id) setActiveFile(null);
              if (isSharedSession && sessionId) await deleteCodeFile(sessionId, node.name);
          }
          showToast("Item deleted", "success");
      } catch(e: any) { showToast(e.message, "error"); }
  };

  const handleShareItem = (node: TreeNode) => {
      let link = "";
      if (activeTab === 'cloud') link = (node.data as CloudItem).url || "";
      if (link) {
          navigator.clipboard.writeText(link);
          showToast("Link copied!", "success");
      }
  };

  const handleCodeChange = (val: string) => {
      if (isLockedByOther) return;
      if (!activeFile) return;
      refreshLock();
      const updatedFile = { ...activeFile, content: val, isModified: true };
      setActiveFile(updatedFile);
      setSaveStatus('modified');
      setProject(prev => ({
          ...prev,
          files: prev.files.map(f => (f.path || f.name) === (activeFile.path || activeFile.name) ? updatedFile : f)
      }));
      if (isSharedSession && sessionId) {
          updateCodeFile(sessionId, updatedFile).catch(e => console.error(e));
      }
  };

  const handleLoadPublicRepo = async () => {
      if (!publicRepoPath.trim()) return;
      setIsLoadingPublic(true);
      try {
          const [owner, repo] = publicRepoPath.split('/');
          const info = await fetchPublicRepoInfo(owner, repo);
          const { files, latestSha } = await fetchRepoContents(null, owner, repo, info.default_branch);
          
          const newProjectData: CodeProject = { 
              id: sessionId || `gh-${info.id}`,
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
              if (isSharedSession && sessionId) {
                  updateCodeFile(sessionId, updatedFile);
              }
          } catch(e) { showToast("Load failed", "error"); }
      } else {
          setActiveFile(file);
      }
  };

  useEffect(() => { 
      if (activeTab === 'cloud' && currentUser) listCloudDirectory(`projects/${currentUser.uid}`).then(setCloudItems); 
  }, [activeTab, currentUser]);

  useEffect(() => {
      if (sessionId) {
          setIsSharedSession(true);
          const unsubscribe = subscribeToCodeProject(sessionId, (remoteProject) => {
              setProject(remoteProject);
          });
          return () => unsubscribe();
      } else {
          setIsSharedSession(false);
      }
  }, [sessionId]);

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
      const freshRoot: TreeNode[] = [];
      const freshMap = new Map<string, TreeNode>();
      cloudItems.forEach(item => freshMap.set(item.fullPath, { id: item.fullPath, name: item.name, type: item.isFolder ? 'folder' : 'file', data: item, children: [], isLoaded: true }));
      cloudItems.forEach(item => {
          const node = freshMap.get(item.fullPath)!;
          const parts = item.fullPath.split('/');
          parts.pop();
          const parentPath = parts.join('/');
          
          if (freshMap.has(parentPath)) {
              freshMap.get(parentPath)!.children.push(node);
          } else {
              freshRoot.push(node);
          }
      });
      return freshRoot;
  }, [cloudItems, currentUser]);

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
                  <button onClick={() => refreshExplorer()} className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="Refresh"><RefreshCw size={16}/></button>
              </div>

              <div className="flex-1 overflow-y-auto">
                  {activeTab === 'cloud' && (
                      <div className="p-2">
                          {!currentUser ? <p className="text-xs text-slate-500 p-4 text-center">Sign in to access your Private Cloud storage.</p> : cloudTree.map(node => <FileTreeItem key={node.id} node={node} depth={0} activeId={selectedExplorerNode?.id} onSelect={handleExplorerSelect} onToggle={handleCloudToggle} onDelete={handleDeleteItem} onShare={handleShareItem} expandedIds={expandedFolders} loadingIds={loadingFolders} onDragStart={handleDragStart} onDrop={handleDrop}/>)}
                      </div>
                  )}
                  {activeTab === 'drive' && (
                      <div className="p-2">
                          {!driveToken ? <div className="p-4 text-center"><button onClick={handleConnectDrive} className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg border border-slate-700 hover:bg-slate-700">Connect Drive</button></div> : driveTree.map(node => <FileTreeItem key={node.id} node={node} depth={0} activeId={selectedExplorerNode?.id} onSelect={handleExplorerSelect} onToggle={handleDriveToggle} expandedIds={expandedFolders} loadingIds={loadingFolders} onDragStart={handleDragStart} onDrop={handleDrop}/>)}
                      </div>
                  )}
                  {activeTab === 'github' && (
                      <div className="p-2">
                          {!project.github ? <div className="p-4 text-center"><button onClick={() => setShowImportModal(true)} className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg border border-slate-700 hover:bg-slate-700">Open Repo</button></div> : workspaceTree.map(node => <FileTreeItem key={node.id} node={node} depth={0} activeId={selectedExplorerNode?.id} onSelect={handleExplorerSelect} onToggle={(n: any) => setExpandedFolders(prev => ({...prev, [n.id]: !expandedFolders[n.id]}))} expandedIds={expandedFolders} loadingIds={loadingFolders} onDragStart={handleDragStart} onDrop={handleDrop}/>)}
                      </div>
                  )}
                  {activeTab === 'session' && (
                      <div className="p-2">
                          {workspaceTree.map(node => <FileTreeItem key={node.id} node={node} depth={0} activeId={selectedExplorerNode?.id} onSelect={handleExplorerSelect} onToggle={(n: any) => setExpandedFolders(prev => ({...prev, [n.id]: !expandedFolders[n.id]}))} onDelete={handleDeleteItem} expandedIds={expandedFolders} loadingIds={loadingFolders} onDragStart={handleDragStart} onDrop={handleDrop}/>)}
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
                            {/* Preview Toggle */}
                            {(activeFile.name.endsWith('.md') || activeFile.name.endsWith('.markdown') || activeFile.name.endsWith('.puml') || activeFile.name.endsWith('.plantuml')) && (
                                <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700 ml-4">
                                    <button onClick={() => setEditorMode('code')} className={`px-3 py-1 text-xs font-bold rounded-md ${editorMode === 'code' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>Code</button>
                                    <button onClick={() => setEditorMode('preview')} className={`px-3 py-1 text-xs font-bold rounded-md ${editorMode === 'preview' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>Preview</button>
                                </div>
                            )}
                        </div>
                        <div className="text-xs text-slate-500">
                            {saveStatus === 'saving' ? <span className="text-indigo-400 flex items-center gap-1"><Loader2 size={10} className="animate-spin"/> Saving...</span> : 
                             saveStatus === 'modified' ? <span className="text-amber-400">Unsaved</span> : 
                             <span className="text-emerald-400">Saved</span>}
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden relative">
                        {editorMode === 'preview' ? (
                            <div className="w-full h-full overflow-y-auto bg-slate-900 p-8">
                                {activeFile.name.endsWith('.md') || activeFile.name.endsWith('.markdown') ? (
                                    <div className="prose prose-invert max-w-none">
                                        <MarkdownView content={activeFile.content} />
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center">
                                        {plantUmlUrl ? <img src={plantUmlUrl} alt="UML Diagram" className="max-w-full border border-slate-700 rounded-lg p-4 bg-white" /> : <div className="text-slate-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin"/> Rendering UML...</div>}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <RichCodeEditor code={activeFile.content} onChange={handleCodeChange} onCursorMove={(l: number, c: number) => setLocalCursor({line: l, col: c})} language={activeFile.language} isShared={isSharedSession} remoteCursors={activeRemoteCursors} localCursor={localCursor} readOnly={isLockedByOther} />
                        )}
                    </div>
                  </>
              ) : <div className="flex-1 flex flex-col items-center justify-center text-slate-600"><Code size={48} className="mb-4 opacity-20" /><p className="text-sm">Select a file from the explorer.</p></div>}
              
              {showDebug && (
                  <div ref={debugRef} className="absolute bottom-4 right-4 w-96 max-h-64 bg-black/80 backdrop-blur-sm border border-green-900 rounded-lg p-3 font-mono text-[10px] text-green-400 overflow-hidden flex flex-col shadow-2xl z-50 pointer-events-auto select-text cursor-text">
                      <div className="flex justify-between items-center border-b border-green-900/50 pb-1 mb-1">
                          <span className="font-bold flex items-center gap-2"><Terminal size={12}/> SESSION DEBUG</span>
                          <div className="flex items-center gap-2">
                              <button onClick={handleCopyDebug} className="bg-green-900/50 hover:bg-green-800 text-green-200 px-2 rounded border border-green-700/50 text-[9px] flex items-center gap-1 transition-colors">
                                  <Copy size={10} /> Copy
                              </button>
                          </div>
                      </div>
                      <div className="flex-1 overflow-y-auto border-t border-green-900/30 pt-1 space-y-0.5 scrollbar-thin scrollbar-thumb-green-900">
                          {debugLogs.map((log, i) => (
                              <p key={i} className="opacity-80 break-words">{log}</p>
                          ))}
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
                  onSendMessage={(txt: string) => setChatMessages(p => [...p, {role: 'user', text: txt}])} 
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
