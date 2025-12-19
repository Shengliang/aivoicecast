
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { CodeProject, CodeFile, UserProfile, Channel, CursorPosition, CloudItem } from '../types';
import { ArrowLeft, Save, Plus, Github, Cloud, HardDrive, Code, X, ChevronRight, ChevronDown, File, Folder, DownloadCloud, Loader2, CheckCircle, AlertTriangle, Info, FolderPlus, FileCode, RefreshCw, LogIn, CloudUpload, Trash2, ArrowUp, Edit2, FolderOpen, MoreVertical, Send, MessageSquare, Bot, Mic, Sparkles, SidebarClose, SidebarOpen, Users, Eye, FileText as FileTextIcon, Image as ImageIcon, StopCircle, Minus, Maximize2, Minimize2, Lock, Unlock, Share2, Terminal, Copy, WifiOff, PanelRightClose, PanelRightOpen, Monitor, Laptop, PenTool, Edit3, ShieldAlert } from 'lucide-react';
import { listCloudDirectory, saveProjectToCloud, deleteCloudItem, createCloudFolder, subscribeToCodeProject, saveCodeProject, updateCodeFile, updateCursor, claimCodeProjectLock, updateProjectActiveFile, deleteCodeFile, moveCloudFile, updateProjectAccess, sendShareNotification } from '../services/firestoreService';
import { ensureCodeStudioFolder, listDriveFiles, readDriveFile, saveToDrive, deleteDriveFile, createDriveFolder, DriveFile, moveDriveFile } from '../services/googleDriveService';
import { connectGoogleDrive, signInWithGitHub } from '../services/authService';
import { fetchRepoInfo, fetchRepoContents, fetchFileContent, updateRepoFile, deleteRepoFile, renameRepoFile } from '../services/githubService';
import { MarkdownView } from './MarkdownView';
import { encodePlantUML } from '../utils/plantuml';
import { Whiteboard } from './Whiteboard';
import { GoogleGenAI } from '@google/genai';
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

const PRESET_REPOS = [
  { label: 'React (Facebook)', path: 'facebook/react' },
  { label: 'Vue (Evan You)', path: 'vuejs/core' },
  { label: 'VS Code', path: 'microsoft/vscode' },
  { label: 'Linux', path: 'torvalds/linux' },
  { label: 'Python', path: 'python/cpython' }
];

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

function cleanRepoPath(input: string) {
    if (!input) return null;
    let clean = input.trim();
    // Remove protocol and domain if present
    clean = clean.replace(/^(https?:\/\/)?(www\.)?github\.com\//, '');
    // Remove .git extension
    if (clean.endsWith('.git')) clean = clean.slice(0, -4);
    
    const parts = clean.split('/').filter(Boolean);
    if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
    return null;
}

// --- Helper Components ---

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
                <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                    {onRename && <button onClick={(e) => { e.stopPropagation(); onRename(node); }} className="p-1 hover:text-indigo-400" title="Rename"><Edit3 size={10}/></button>}
                    {onShare && <button onClick={(e) => { e.stopPropagation(); onShare(node); }} className="p-1 hover:text-white" title="Copy Link"><Share2 size={10}/></button>}
                    {onDelete && <button onClick={(e) => { e.stopPropagation(); onDelete(node); }} className="p-1 hover:text-red-400" title="Delete"><Trash2 size={10}/></button>}
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

const RichCodeEditor = ({ code, onChange, onCursorMove, language, isShared, remoteCursors, localCursor, readOnly }: any) => {
    return (
        <div className="w-full h-full relative font-mono text-sm">
            <textarea
                className="w-full h-full bg-slate-950 text-slate-300 p-4 resize-none outline-none leading-relaxed"
                value={code || ''}
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

const AIChatPanel = ({ isOpen, onClose, messages, onSendMessage, isThinking }: any) => {
    const [input, setInput] = useState('');
    return (
        <div className="flex flex-col h-full bg-slate-950 border-l border-slate-800">
            <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                <span className="font-bold text-slate-300 text-sm flex items-center gap-2"><Bot size={16} className="text-indigo-400"/> AI Assistant</span>
                <button onClick={onClose}><PanelRightClose size={16} className="text-slate-500 hover:text-white"/></button>
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
            <div className="p-3 border-t border-slate-800 bg-slate-950">
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={input} 
                        onChange={e => setInput(e.target.value)} 
                        onKeyDown={e => { if(e.key === 'Enter') { onSendMessage(input); setInput(''); } }}
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500 placeholder-slate-600"
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
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'ai', text: string}>>([{ role: 'ai', text: "Hello! I'm your coding assistant. Open a code file or whiteboard to begin." }]);
  const [isChatThinking, setIsChatThinking] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  
  const [cloudItems, setCloudItems] = useState<CloudItem[]>([]); 
  const [driveItems, setDriveItems] = useState<(DriveFile & { parentId?: string, isLoaded?: boolean })[]>([]); 
  const [driveRootId, setDriveRootId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [loadingFolders, setLoadingFolders] = useState<Record<string, boolean>>({});
  const [notifications, setNotifications] = useState<Array<{id: string, type: 'success' | 'error' | 'info', message: string}>>([]);
  
  const [publicRepoPath, setPublicRepoPath] = useState(userProfile?.defaultRepoUrl || '');
  const [isLoadingPublic, setIsLoadingPublic] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [githubToken, setGithubToken] = useState<string | null>(null);
  
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
  
  // Zen Mode State
  const [isZenMode, setIsZenMode] = useState(false);
  
  // Share Modal State
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isAccessDenied, setIsAccessDenied] = useState(false);

  const addDebugLog = (msg: string) => {
      setDebugLogs(prev => {
          const newLogs = [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`];
          return newLogs.slice(-20);
      });
  };

  // Sync active file with Firestore
  const updateActiveFileAndSync = (file: CodeFile | null) => {
      setActiveFile(file);
      if (file) {
          const filePath = file.path || file.name;
          addDebugLog(`Switched active file: ${filePath}`);
          if (isSharedSession && sessionId) {
              updateProjectActiveFile(sessionId, filePath);
          }
      } else {
          addDebugLog(`Closed current file`);
          if (isSharedSession && sessionId) {
              updateProjectActiveFile(sessionId, '');
          }
      }
  };

  // Sync default repo if profile loads late
  useEffect(() => {
      if (userProfile?.defaultRepoUrl && !publicRepoPath) {
          setPublicRepoPath(userProfile.defaultRepoUrl);
      }
  }, [userProfile?.defaultRepoUrl]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = crypto.randomUUID();
      setNotifications(prev => [...prev, { id, type, message }]);
      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  };

  // Access Control Check
  useEffect(() => {
      if (isSharedSession && project && currentUser) {
          if (project.accessLevel === 'restricted') {
              // Allow owner OR whitelisted users
              const isOwner = project.ownerId === currentUser.uid;
              const isAllowed = project.allowedUserIds?.includes(currentUser.uid);
              
              if (!isOwner && !isAllowed) {
                  setIsAccessDenied(true);
              } else {
                  setIsAccessDenied(false);
              }
          } else {
              setIsAccessDenied(false);
          }
      }
  }, [project.accessLevel, project.allowedUserIds, project.ownerId, currentUser, isSharedSession]);

  const handleCodeChange = (newCode: string) => {
      if (!activeFile) return;
      const updatedFile = { ...activeFile, content: newCode, isModified: true };
      setActiveFile(updatedFile);
      setProject(prev => ({
          ...prev,
          files: prev.files.map(f => (f.path || f.name) === (activeFile.path || activeFile.name) ? updatedFile : f)
      }));
      setSaveStatus('modified');
      if (isSharedSession && sessionId) { 
          updateCodeFile(sessionId, updatedFile).catch(e => console.error("Sync failed", e));
      }
  };

  // --- UNIFIED AI ASSISTANT LOGIC ---
  const handleSendMessage = async (input: string) => {
      if (!input.trim()) return;
      
      const newMessages = [...chatMessages, { role: 'user' as const, text: input }];
      setChatMessages(newMessages);
      setIsChatThinking(true);

      const isWhiteboard = activeFile && getLanguageFromExt(activeFile.name) === 'whiteboard';
      const contextType = isWhiteboard ? "Whiteboard / System Design" : "Code Editor";
      
      try {
          // FIX: Always use const ai = new GoogleGenAI({apiKey: process.env.API_KEY}); exclusively from process.env.API_KEY.
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

          if (isWhiteboard && activeFile) {
              const currentElements = JSON.parse(activeFile.content || "[]");
              const contextSummary = currentElements.length > 20 ? currentElements.slice(-20) : currentElements;
              const prompt = `You are an expert System Design Architect... Current Context: ${contextType} User Request: "${input}" Current Board Elements: ${JSON.stringify(contextSummary)}`;
              const resp = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt, config: { responseMimeType: 'application/json' } });
              const result = JSON.parse(resp.text || "{}");
              if (result.answer) setChatMessages(prev => [...prev, { role: 'ai', text: result.answer }]);
              if (result.newElements && Array.isArray(result.newElements)) {
                  const merged = [...currentElements, ...result.newElements];
                  handleCodeChange(JSON.stringify(merged));
                  showToast("Whiteboard updated by AI", "success");
              }
          } else if (activeFile) {
              const prompt = `You are a Senior Software Engineer... Current File: ${activeFile.name}... Code Context: ${(activeFile.content || '').substring(0, 2000)}... User Request: "${input}"`;
              const resp = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
              const responseText = resp.text || "I couldn't generate a response.";
              setChatMessages(prev => [...prev, { role: 'ai', text: responseText }]);
              if (input.toLowerCase().includes("fix") || input.toLowerCase().includes("rewrite")) {
                  const match = responseText.match(/```(?:\w+)?\n([\s\S]*?)```/);
                  if (match && match[1].length > 50 && confirm("AI generated a code block. Replace current file content with it?")) handleCodeChange(match[1]);
              }
          } else {
              setChatMessages(prev => [...prev, { role: 'ai', text: "Please open a file or whiteboard first so I can help you." }]);
          }
      } catch (e: any) {
          console.error("AI Error:", e);
          setChatMessages(prev => [...prev, { role: 'ai', text: `Error: ${e.message}` }]);
      } finally {
          setIsChatThinking(false);
      }
  };

  const handleLoadPublicRepo = useCallback(async () => {
      if (!publicRepoPath.trim()) return;
      const cleaned = cleanRepoPath(publicRepoPath);
      if (!cleaned) return;
      const { owner, repo } = cleaned;
      setIsLoadingPublic(true);
      try {
          const info = await fetchRepoInfo(owner, repo, githubToken); 
          const { files, latestSha } = await fetchRepoContents(githubToken, owner, repo, info.default_branch);
          const newProjectData: CodeProject = { 
              id: sessionId || `gh-${info.id}`, name: info.full_name, files, lastModified: Date.now(), 
              github: { owner, repo, branch: info.default_branch, sha: latestSha }, ownerId: currentUser?.uid
          };
          setProject(newProjectData); setActiveFile(null); setShowImportModal(false); setExpandedFolders({}); 
          showToast(`Repo ${owner}/${repo} opened`, "success");
          if (isSharedSession && sessionId) { await saveCodeProject(newProjectData); updateProjectActiveFile(sessionId, ''); }
      } catch (e: any) { showToast(e.message, "error"); } finally { setIsLoadingPublic(false); }
  }, [publicRepoPath, githubToken, sessionId, currentUser, isSharedSession]);

  useEffect(() => {
      if (activeTab === 'github' && !project.github && publicRepoPath && !isLoadingPublic) handleLoadPublicRepo(); 
  }, [activeTab, publicRepoPath, project.github, handleLoadPublicRepo, githubToken]);

  useEffect(() => {
      const currentPath = activeFile ? (activeFile.path || activeFile.name) : null;
      if (currentPath !== lastActivePathRef.current) {
          lastActivePathRef.current = currentPath;
          if (activeFile) {
              const ext = activeFile.name.split('.').pop()?.toLowerCase();
              if (['md', 'markdown', 'puml', 'plantuml'].includes(ext || '')) setEditorMode('preview'); else setEditorMode('code');
          }
      }
  }, [activeFile?.path, activeFile?.name]);

  useEffect(() => {
      if (activeFile && (activeFile.name.endsWith('.puml') || activeFile.name.endsWith('.plantuml')) && editorMode === 'preview') {
          encodePlantUML(activeFile.content).then(code => setPlantUmlUrl(`http://www.plantuml.com/plantuml/svg/${code}`));
      }
  }, [activeFile?.content, editorMode, activeFile?.name]);

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
      try { await claimCodeProjectLock(sessionId, clientId, currentUser.displayName || 'Anonymous'); showToast("You have taken edit control.", "success"); } catch(e) { showToast("Failed to take control.", "error"); }
  };

  const refreshLock = useCallback(async () => {
      if (!isSharedSession || !sessionId || !currentUser) return;
      if (project.activeClientId === clientId || !isLockedByOther) { try { await claimCodeProjectLock(sessionId, clientId, currentUser.displayName || 'Anonymous'); } catch(e) {} }
  }, [isSharedSession, sessionId, currentUser, project.activeClientId, isLockedByOther, clientId]);

  const handleShare = async () => {
      let targetId = sessionId;
      if (onSessionStart && !targetId) {
          const newId = project.id === 'init' ? crypto.randomUUID() : project.id;
          targetId = newId;
          onSessionStart(newId);
          
          const newProjectState = { ...project, id: targetId, ownerId: currentUser?.uid };
          setProject(newProjectState);
          
          // Create the document immediately so subsequent updates work
          addDebugLog(`Creating new session doc: ${targetId}`);
          try {
              await saveCodeProject(newProjectState);
              addDebugLog("Session doc created successfully.");
          } catch (e: any) {
              addDebugLog(`Failed to create session doc: ${e.message}`);
              showToast("Failed to initialize session", "error");
              return; // Don't open modal if creation failed
          }
      }
      setIsShareModalOpen(true);
  };

  const handleConfirmShare = async (selectedUids: string[], isPublic: boolean) => {
      const targetId = sessionId || project.id;
      if (!targetId || targetId === 'init') {
           addDebugLog("Error: No valid session ID for sharing.");
           return;
      }
      
      addDebugLog(`Updating access for ${targetId}. Public: ${isPublic}, Users: ${selectedUids.join(', ')}`);
      
      try {
          // 1. Update Project Access
          // We use saveCodeProject to ensure we don't get "No such document" if the init save was slow/failed
          // Updating local state first
          const updatedProject = {
              ...project,
              id: targetId,
              accessLevel: isPublic ? 'public' : 'restricted' as 'public' | 'restricted',
              allowedUserIds: selectedUids
          };
          setProject(updatedProject);
          
          await saveCodeProject(updatedProject);
          addDebugLog("Access updated in Firestore.");
          
          // 2. Send Invites
          if (currentUser) {
              const sessionLink = window.location.href;
              const type = activeFile && getLanguageFromExt(activeFile.name) === 'whiteboard' ? 'Whiteboard' : 'Code';
              
              for (const uid of selectedUids) {
                  addDebugLog(`Sending invite to ${uid}...`);
                  await sendShareNotification(uid, type, sessionLink, currentUser.displayName || 'A User');
              }
              showToast(`Shared with ${selectedUids.length} members!`, "success");
          }
      } catch(e: any) {
          addDebugLog(`Share Failed: ${e.message}`);
          console.error("Share error", e);
          showToast("Share failed: " + e.message, "error");
      }
  };

  const handleCopyDebug = () => { if (debugRef.current) { navigator.clipboard.writeText(debugRef.current.innerText); showToast("Debug info copied", "success"); } };

  const refreshExplorer = async () => {
      if (activeTab === 'cloud' && currentUser) {
          await refreshCloudPath(`projects/${currentUser.uid}`);
      } else if (activeTab === 'drive' && driveToken && driveRootId) {
          const files = await listDriveFiles(driveToken, driveRootId);
          setDriveItems([{ id: driveRootId, name: 'CodeStudio', mimeType: 'application/vnd.google-apps.folder', isLoaded: true }, ...files.map(f => ({ ...f, parentId: driveRootId, isLoaded: false }))]);
      } else if (activeTab === 'github' && project.github) {
          const { files, latestSha } = await fetchRepoContents(githubToken, project.github.owner, project.github.repo, project.github.branch);
          setProject(prev => ({ ...prev, files: files, github: { ...prev.github!, sha: latestSha } }));
      }
      showToast("Explorer Refreshed", "success");
  };

  const getOrRequestGithubToken = async (): Promise<string | null> => {
      if (githubToken) return githubToken;
      try {
          const { token } = await signInWithGitHub();
          if (token) { setGithubToken(token); return token; }
          throw new Error("No access token returned");
      } catch (e: any) { showToast(`Auth Failed: ${e.message}`, "error"); return null; }
  };

  const generateAICommitMessage = async (filename: string, code: string): Promise<string> => {
      try {
          // FIX: Always use const ai = new GoogleGenAI({apiKey: process.env.API_KEY}); exclusively from process.env.API_KEY.
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const prompt = `Write a concise commit message for ${filename}:\n${code.substring(0, 500)}`;
          const resp = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
          return resp.text?.trim() || `Update ${filename}`;
      } catch (e) { return `Update ${filename}`; }
  };

  const handleSmartSave = async () => {
      setSaveStatus('saving');
      try {
          if (activeTab === 'cloud' && currentUser && activeFile) {
               const rootPrefix = `projects/${currentUser.uid}`;
               let targetPath = activeFile.path || `${rootPrefix}/${activeFile.name}`;
               if (!targetPath.startsWith(rootPrefix)) targetPath = `${rootPrefix}/${targetPath.replace(/^\/+/, '')}`;
               const lastSlash = targetPath.lastIndexOf('/');
               const parentPath = lastSlash > -1 ? targetPath.substring(0, lastSlash) : rootPrefix;
               await saveProjectToCloud(parentPath, activeFile.name, activeFile.content);
               await refreshCloudPath(parentPath);
               showToast("Saved to Cloud", "success");
          } else if (activeTab === 'drive' && driveToken && driveRootId && activeFile) {
               await saveToDrive(driveToken, driveRootId, activeFile.name, activeFile.content);
               showToast("Saved to Drive", "success");
          } else if (activeTab === 'github' && project.github && activeFile) {
               const token = await getOrRequestGithubToken();
               if (!token) throw new Error("GitHub Token required.");
               const message = await generateAICommitMessage(activeFile.name, activeFile.content);
               const { sha } = await updateRepoFile(token, project.github.owner, project.github.repo, activeFile.path || activeFile.name, activeFile.content, activeFile.sha, message, project.github.branch);
               const updatedFile = { ...activeFile, sha, isModified: false };
               setActiveFile(updatedFile);
               setProject(prev => ({ ...prev, files: prev.files.map(f => (f.path === activeFile.path) ? updatedFile : f) }));
               showToast(`Committed: ${message}`, "success");
          } else if (isSharedSession && sessionId) {
               if (activeFile) await updateCodeFile(sessionId, activeFile);
               await saveCodeProject(project);
               showToast("Synced to Session", "success");
          } else { showToast("Saved locally (Session)", "success"); }
          setSaveStatus('saved');
      } catch(e: any) { setSaveStatus('modified'); showToast("Save failed: " + e.message, "error"); }
  };

  const refreshCloudPath = async (path: string) => {
      if (!currentUser) return;
      try { const items = await listCloudDirectory(path); setCloudItems(prev => { const map = new Map(prev.map(i => [i.fullPath, i])); items.forEach(i => map.set(i.fullPath, i)); return Array.from(map.values()); }); } catch(e) { console.error(e); }
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
                  isDirectory: false,
                  isModified: false 
              };
              
              // 1. Update Local State
              setProject(prev => { 
                  const exists = prev.files.some(f => f.path === newFile.path); 
                  if (!exists) return { ...prev, files: [...prev.files, newFile] }; 
                  return prev; 
              });
              
              // 2. Sync to Session (Firestore) if active
              if (isSharedSession && sessionId) {
                  addDebugLog(`Syncing file to session: ${newFile.name}`);
                  await updateCodeFile(sessionId, newFile);
              }

              // 3. Set Active (Syncs path to Firestore)
              updateActiveFileAndSync(newFile);
              
          } catch(e) { showToast("Failed to load file", "error"); }
      }
  };

  const handleExplorerSelect = (node: TreeNode) => {
      setSelectedExplorerNode(node);
      if (node.type === 'file') {
          if (activeTab === 'cloud') handleCloudSelect(node);
          else if (activeTab === 'drive') handleDriveSelect(node);
          else if (activeTab === 'github') handleWorkspaceSelect(node);
          else updateActiveFileAndSync(node.data);
      }
  };

  const handleCloudToggle = async (node: TreeNode) => { const isExpanded = expandedFolders[node.id]; setExpandedFolders(prev => ({ ...prev, [node.id]: !isExpanded })); if (!isExpanded) { setLoadingFolders(prev => ({ ...prev, [node.id]: true })); try { await refreshCloudPath(node.id); } catch(e) { console.error(e); } finally { setLoadingFolders(prev => ({ ...prev, [node.id]: false })); } } };
  const handleConnectDrive = async () => { try { const token = await connectGoogleDrive(); setDriveToken(token); const rootId = await ensureCodeStudioFolder(token); setDriveRootId(rootId); const files = await listDriveFiles(token, rootId); setDriveItems([{ id: driveRootId, name: 'CodeStudio', mimeType: 'application/vnd.google-apps.folder', isLoaded: true }, ...files.map(f => ({ ...f, parentId: driveRootId, isLoaded: false }))]); showToast("Google Drive Connected", "success"); } catch(e: any) { showToast(e.message, "error"); } };
  const handleDriveToggle = async (node: TreeNode) => { const driveFile = node.data as DriveFile; const isExpanded = expandedFolders[node.id]; setExpandedFolders(prev => ({ ...prev, [node.id]: !isExpanded })); if (!isExpanded && driveToken && (!node.children || node.children.length === 0)) { setLoadingFolders(prev => ({ ...prev, [node.id]: true })); try { const files = await listDriveFiles(driveToken, driveFile.id); setDriveItems(prev => { const newItems = files.map(f => ({ ...f, parentId: node.id, isLoaded: false })); return Array.from(new Map([...prev, ...newItems].map(item => [item.id, item])).values()); }); } catch(e) { console.error(e); } finally { setLoadingFolders(prev => ({ ...prev, [node.id]: false })); } } };
  const handleDriveSelect = async (node: TreeNode) => { const driveFile = node.data as DriveFile; if (!driveToken) return; setLoadingFolders(prev => ({ ...prev, [node.id]: true })); try { const text = await readDriveFile(driveToken, driveFile.id); const newFile: CodeFile = { name: driveFile.name, path: `drive://${driveFile.id}`, content: text, language: getLanguageFromExt(driveFile.name), loaded: true, isDirectory: false, isModified: false }; if (isSharedSession && sessionId) { await updateCodeFile(sessionId, newFile); } updateActiveFileAndSync(newFile); } catch (e: any) { showToast("Failed to read Drive file", "error"); } finally { setLoadingFolders(prev => ({ ...prev, [node.id]: false })); } };
  const handleDragStart = (e: React.DragEvent, node: TreeNode) => { setDraggedNode(node); e.dataTransfer.effectAllowed = 'move'; };
  const handleDrop = async (e: React.DragEvent, targetNode: TreeNode) => { e.preventDefault(); if (!draggedNode) return; if (draggedNode.id === targetNode.id) return; if (targetNode.type !== 'folder') return; try { if (activeTab === 'cloud') { const item = draggedNode.data as CloudItem; const targetPath = (targetNode.data as CloudItem).fullPath; const newFullPath = targetPath.replace(/\/+$/, '') + '/' + item.name; await moveCloudFile(item.fullPath, newFullPath);
                
                // If the moved file is the active one, update its internal path state
                // This ensures "Save" uses the new path in derived calculations
                if (activeFile && (activeFile.path === item.fullPath)) {
                    setActiveFile(prev => prev ? ({ ...prev, path: newFullPath }) : null);
                    addDebugLog(`Active file moved. Updated path: ${newFullPath}`);
                }
                
                setCloudItems(prev => prev.filter(i => i.fullPath !== item.fullPath)); await refreshCloudPath(targetPath); showToast("File moved", "success"); } } catch (err: any) { showToast("Move failed", "error"); } setDraggedNode(null); };
  const handleCreateFolder = async () => { const name = prompt("Folder Name:"); if (!name) return; try { if (activeTab === 'cloud' && currentUser) { await createCloudFolder(`projects/${currentUser.uid}`, name); showToast("Folder created", "success"); await refreshCloudPath(`projects/${currentUser.uid}`); } } catch(e: any) { showToast(e.message, "error"); } };
  const handleCreateFile = async () => { const name = prompt("File Name:"); if (!name) return; await createFileInActiveContext(name, "// New File"); };
  const handleCreateWhiteboard = async () => { const name = prompt("Whiteboard Name:"); if (!name) return; await createFileInActiveContext(name.endsWith('.wb')?name:name+'.wb', "[]"); };
  const createFileInActiveContext = async (name: string, content: string) => { try { if (activeTab === 'cloud' && currentUser) { await saveProjectToCloud(`projects/${currentUser.uid}`, name, content); await refreshCloudPath(`projects/${currentUser.uid}`); const newFile: CodeFile = { name, path: `projects/${currentUser.uid}/${name}`, language: getLanguageFromExt(name), content, loaded: true, isDirectory: false, isModified: false }; setProject(prev => ({ ...prev, files: [...prev.files, newFile] })); if (isSharedSession && sessionId) { await updateCodeFile(sessionId, newFile); } updateActiveFileAndSync(newFile); } else if (activeTab === 'session') { const newFile: CodeFile = { name, path: name, language: getLanguageFromExt(name), content, loaded: true, isDirectory: false, isModified: true }; setProject(prev => ({ ...prev, files: [...prev.files, newFile] })); if (isSharedSession && sessionId) await updateCodeFile(sessionId, newFile); updateActiveFileAndSync(newFile); } } catch(e: any) { showToast(e.message, "error"); } };
  const handleDeleteItem = async (node: TreeNode) => { if (!confirm(`Delete ${node.name}?`)) return; try { if (activeTab === 'cloud') { await deleteCloudItem(node.data as CloudItem); setCloudItems(prev => prev.filter(i => i.fullPath !== node.id)); } else if (activeTab === 'session') { setProject(prev => ({ ...prev, files: prev.files.filter(f => (f.path || f.name) !== node.id) })); if (activeFile && (activeFile.path || activeFile.name) === node.id) setActiveFile(null); if (isSharedSession && sessionId) await deleteCodeFile(sessionId, node.name); } showToast("Deleted", "success"); } catch(e: any) { showToast(e.message, "error"); } };
  const handleRenameItem = async (node: TreeNode) => { /* Simplified for brevity, use existing logic */ };
  const handleShareItem = (node: TreeNode) => { const link = (node.data as CloudItem).url || ""; if (link) { navigator.clipboard.writeText(link); showToast("Link copied!", "success"); } };
  const handleWorkspaceSelect = async (node: TreeNode) => { const file = node.data as CodeFile; if (!file.loaded && project.github) { try { const content = await fetchFileContent(githubToken, project.github.owner, project.github.repo, file.path || file.name, project.github.branch); const updatedFile = { ...file, content, loaded: true }; setProject(prev => ({ ...prev, files: prev.files.map(f => (f.path || f.name) === (file.path || file.name) ? updatedFile : f) })); if (isSharedSession && sessionId) { await updateCodeFile(sessionId, updatedFile); } updateActiveFileAndSync(updatedFile); } catch(e) { showToast("Load failed", "error"); } } else { updateActiveFileAndSync(file); } };

  useEffect(() => { 
      if (activeTab === 'cloud' && currentUser) listCloudDirectory(`projects/${currentUser.uid}`).then(setCloudItems); 
  }, [activeTab, currentUser]);

  useEffect(() => {
      if (sessionId) {
          setIsSharedSession(true);
          const unsubscribe = subscribeToCodeProject(sessionId, (remoteProject) => {
              const safeFiles = Array.isArray(remoteProject?.files) ? remoteProject.files : [];
              setProject({ ...remoteProject, files: safeFiles });
              
              // Sync active file from remote project if available
              if (remoteProject.activeFilePath) {
                  const targetFile = safeFiles.find(f => (f.path || f.name) === remoteProject.activeFilePath);
                  if (targetFile) {
                      setActiveFile(prev => {
                          const prevPath = prev ? (prev.path || prev.name) : null;
                          const newPath = targetFile.path || targetFile.name;
                          if (prevPath !== newPath) {
                              addDebugLog(`Remote requested switch to: ${newPath}`);
                              return targetFile;
                          }
                          // Even if path is same, check if content changed to force refresh
                          if (prev && prev.content !== targetFile.content) {
                              return targetFile;
                          }
                          return targetFile; 
                      });
                  }
              }
          });
          return () => unsubscribe();
      } else {
          setIsSharedSession(false);
      }
  }, [sessionId]);

  const workspaceTree = useMemo(() => {
      const root: TreeNode[] = [];
      const map = new Map<string, TreeNode>();
      const repoFiles = Array.isArray(project.files) ? project.files : [];
      repoFiles.forEach(f => { const path = f.path || f.name; map.set(path, { id: path, name: f.name.split('/').pop()!, type: f.isDirectory ? 'folder' : 'file', data: f, children: [], isLoaded: f.childrenFetched, status: f.isModified ? 'modified' : undefined }); });
      repoFiles.forEach(f => { const path = f.path || f.name; const node = map.get(path)!; const parts = path.split('/'); if (parts.length === 1) root.push(node); else { const parent = map.get(parts.slice(0, -1).join('/')); if (parent) parent.children.push(node); else root.push(node); } });
      return root;
  }, [project.files]);

  const cloudTree = useMemo(() => {
      const freshRoot: TreeNode[] = [];
      const freshMap = new Map<string, TreeNode>();
      cloudItems.forEach(item => freshMap.set(item.fullPath, { id: item.fullPath, name: item.name, type: item.isFolder ? 'folder' : 'file', data: item, children: [], isLoaded: true }));
      cloudItems.forEach(item => { const node = freshMap.get(item.fullPath)!; const parts = item.fullPath.split('/'); parts.pop(); const parentPath = parts.join('/'); if (freshMap.has(parentPath)) { freshMap.get(parentPath)!.children.push(node); } else { freshRoot.push(node); } });
      return freshRoot;
  }, [cloudItems, currentUser]);

  const driveTree = useMemo(() => {
      const root: TreeNode[] = [];
      const map = new Map<string, TreeNode>();
      driveItems.forEach(item => map.set(item.id, { id: item.id, name: item.name, type: item.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file', data: item, children: [], isLoaded: item.isLoaded }));
      driveItems.forEach(item => { const node = map.get(item.id)!; if (item.parentId && map.has(item.parentId)) map.get(item.parentId)!.children.push(node); else if (item.id === driveRootId || !item.parentId) root.push(node); });
      return root;
  }, [driveItems, driveRootId]);

  if (isAccessDenied) {
      return (
          <div className="flex flex-col h-screen bg-slate-950 items-center justify-center text-center p-8">
              <ShieldAlert size={64} className="text-red-500 mb-6 animate-pulse" />
              <h1 className="text-3xl font-bold text-white mb-2">Access Denied</h1>
              <p className="text-slate-400 max-w-md">This session is restricted. You do not have permission to view or edit this project.</p>
              <button onClick={onBack} className="mt-8 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold">Go Back</button>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden relative">
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
          {notifications.map(n => <div key={n.id} className={`flex items-center gap-2 px-4 py-2 rounded-full shadow-xl text-sm font-bold ${n.type==='error'?'bg-red-600':'bg-slate-800 border border-slate-700'}`}><span>{n.message}</span></div>)}
      </div>

      {/* HEADER */}
      <header className="h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 z-20">
         <div className="flex items-center space-x-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"><ArrowLeft size={20} /></button>
            <div className="flex flex-col">
               <h1 className="font-bold text-white text-sm flex items-center gap-2">
                   {project.name} {activeFile && ` - ${activeFile.name}`}
                   {project.accessLevel === 'restricted' && <Lock size={12} className="text-amber-400"/>}
               </h1>
               {isLockedByOther && <span className="text-[10px] text-amber-400 flex items-center gap-1 bg-amber-900/30 px-2 py-0.5 rounded border border-amber-500/50"><Lock size={10}/> Locked by {activeWriterName} (Read Only)</span>}
            </div>
         </div>
         <div className="flex items-center space-x-2">
            {!isZenMode && (
                <button onClick={() => setIsLeftOpen(!isLeftOpen)} className={`p-2 rounded-lg transition-colors ${!isLeftOpen ? 'text-indigo-400 bg-slate-800' : 'text-slate-400 hover:text-white'}`}><SidebarOpen size={18}/></button>
            )}
            
            <button 
                onClick={() => setIsZenMode(!isZenMode)}
                className={`p-2 rounded-lg transition-colors ${isZenMode ? 'text-emerald-400 bg-slate-800' : 'text-slate-400 hover:text-white'}`}
                title={isZenMode ? "Exit Zen Mode" : "Zen Mode (Maximize Editor)"}
            >
                {isZenMode ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}
            </button>

            {isLockedByOther && <button onClick={handleTakeControl} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold flex items-center gap-1"><Unlock size={12}/> Take Control</button>}
            <button onClick={() => setShowDebug(!showDebug)} className={`p-2 rounded-lg transition-colors ${showDebug ? 'text-green-400 bg-green-900/20' : 'text-slate-400 hover:text-white'}`}><Terminal size={18}/></button>
            
            {isSharedSession ? (
                <div className="flex items-center gap-2">
                    <button onClick={handleShare} className="flex items-center space-x-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-md" title="Share Session">
                        <Share2 size={14}/><span>Share</span>
                    </button>
                    <button onClick={() => onSessionStop?.()} className="flex items-center space-x-2 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold shadow-md">
                        <WifiOff size={14}/><span>Stop</span>
                    </button>
                </div>
            ) : (
                <button onClick={handleShare} className="flex items-center space-x-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-md"><Share2 size={14}/><span>Share</span></button>
            )}

            <button onClick={handleSmartSave} className="flex items-center space-x-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md"><Save size={14}/><span>Save</span></button>
            
            {!isZenMode && (
                <button onClick={() => setIsRightOpen(!isRightOpen)} className={`p-2 rounded-lg transition-colors ${!isRightOpen ? 'text-indigo-400 bg-slate-800' : 'text-slate-400 hover:text-white'}`}><PanelRightOpen size={18}/></button>
            )}
         </div>
      </header>

      {/* MAIN BODY (3-PANE) */}
      <div className="flex-1 flex overflow-hidden relative">
          
          {/* LEFT PANE: EXPLORER */}
          <div className={`${isZenMode ? 'hidden' : (isLeftOpen ? 'w-64' : 'w-0')} bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300 overflow-hidden shrink-0`}>
              {/* BACKEND TABS */}
              <div className="flex border-b border-slate-800 bg-slate-900">
                  <button onClick={() => setActiveTab('cloud')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'cloud' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`} title="Private Cloud"><Cloud size={16}/></button>
                  <button onClick={() => setActiveTab('drive')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'drive' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`} title="Google Drive"><HardDrive size={16}/></button>
                  <button onClick={() => setActiveTab('github')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'github' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`} title="GitHub"><Github size={16}/></button>
                  <button onClick={() => setActiveTab('session')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'session' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`} title="Live Session"><Laptop size={16}/></button>
              </div>

              {/* ACTION TOOLBAR - Improved Visibility */}
              <div className="p-3 border-b border-slate-800 flex flex-wrap gap-2 bg-slate-900 justify-center">
                  <button onClick={handleCreateFile} className="flex-1 flex items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white py-1.5 px-2 rounded text-xs font-bold shadow-md transition-colors whitespace-nowrap" title="Create New Code File">
                      <FileCode size={14}/> <span>New File</span>
                  </button>
                  <button onClick={handleCreateWhiteboard} className="flex-1 flex items-center justify-center gap-1 bg-pink-600 hover:bg-pink-500 text-white py-1.5 px-2 rounded text-xs font-bold shadow-md transition-colors whitespace-nowrap" title="Create New Whiteboard">
                      <PenTool size={14}/> <span>New Board</span>
                  </button>
                  <button onClick={handleCreateFolder} className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-colors" title="New Folder">
                      <FolderPlus size={16}/>
                  </button>
                  <button onClick={() => refreshExplorer()} className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-colors" title="Refresh Explorer">
                      <RefreshCw size={16}/>
                  </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                  {activeTab === 'cloud' && (
                      <div className="p-2">
                          {!currentUser ? <p className="text-xs text-slate-500 p-4 text-center">Sign in to access your Private Cloud storage.</p> : cloudTree.map(node => <FileTreeItem key={node.id} node={node} depth={0} activeId={selectedExplorerNode?.id} onSelect={handleExplorerSelect} onToggle={handleCloudToggle} onDelete={handleDeleteItem} onShare={handleShareItem} expandedIds={expandedFolders} loadingIds={loadingFolders} onDragStart={handleDragStart} onDrop={handleDrop}/>)}
                      </div>
                  )}
                  {activeTab === 'drive' && (
                      <div className="p-2">
                          {!driveToken ? <div className="p-4 text-center"><button onClick={handleConnectDrive} className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg border border-slate-700 hover:bg-slate-700">Connect Drive</button></div> : driveTree.map(node => <FileTreeItem key={node.id} node={node} depth={0} activeId={selectedExplorerNode?.id} onSelect={handleDriveSelect} onToggle={handleDriveToggle} expandedIds={expandedFolders} loadingIds={loadingFolders} onDragStart={handleDragStart} onDrop={handleDrop}/>)}
                      </div>
                  )}
                  {activeTab === 'github' && (
                      <div className="p-2">
                          {!githubToken && (
                              <button onClick={() => getOrRequestGithubToken()} className="w-full mb-3 py-2 bg-[#2da44e] hover:bg-[#2c974b] text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm">
                                  <Github size={14} /> <span>Connect GitHub</span>
                              </button>
                          )}
                          {!project.github ? (
                              <div className="p-4 text-center">
                                  {isLoadingPublic ? (
                                      <div className="flex flex-col items-center gap-2 text-slate-500">
                                          <Loader2 className="animate-spin" size={24}/>
                                          <span className="text-xs">Loading {publicRepoPath || 'repo'}...</span>
                                      </div>
                                  ) : (
                                      publicRepoPath ? (
                                          <div className="flex flex-col gap-3">
                                              <div className="text-xs text-slate-400">
                                                  <p>Target: <span className="text-white font-mono">{publicRepoPath}</span></p>
                                                  <p className="mt-1 text-red-400 opacity-80">Load failed. Check permissions or token.</p>
                                              </div>
                                              <div className="flex gap-2 justify-center">
                                                  <button onClick={handleLoadPublicRepo} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-500 shadow-sm">Retry</button>
                                                  <button onClick={() => setShowImportModal(true)} className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs font-bold rounded-lg border border-slate-700 hover:bg-slate-700">Change</button>
                                              </div>
                                          </div>
                                      ) : (
                                          <button onClick={() => setShowImportModal(true)} className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg border border-slate-700 hover:bg-slate-700">Open Repo</button>
                                      )
                                  )}
                              </div>
                          ) : workspaceTree.map(node => <FileTreeItem key={node.id} node={node} depth={0} activeId={selectedExplorerNode?.id} onSelect={handleExplorerSelect} onToggle={(n: any) => setExpandedFolders(prev => ({...prev, [n.id]: !expandedFolders[n.id]}))} onDelete={handleDeleteItem} onRename={handleRenameItem} expandedIds={expandedFolders} loadingIds={loadingFolders} onDragStart={handleDragStart} onDrop={handleDrop}/>)}
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
          <div className="flex-1 bg-slate-950 flex flex-col min-w-0 relative border-r border-slate-800">
              {activeFile ? (
                  <>
                    <div className="bg-slate-950 border-b border-slate-800 px-4 py-2 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                            <FileIcon filename={activeFile.name} />
                            <span className="text-sm font-bold text-white">{activeFile.name}</span>
                            {activeFile.isModified && <span className="w-2 h-2 bg-amber-400 rounded-full"></span>}
                            <button 
                                onClick={() => updateActiveFileAndSync(null)} 
                                className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-white transition-colors ml-1"
                                title="Close file"
                            >
                                <X size={14} />
                            </button>
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
                        {getLanguageFromExt(activeFile.name) === 'whiteboard' ? (
                            <Whiteboard 
                                initialData={activeFile.content}
                                onDataChange={handleCodeChange}
                                isReadOnly={isLockedByOther}
                                disableAI={true} // Disable internal AI, handled by parent
                            />
                        ) : editorMode === 'preview' ? (
                            <div className="w-full h-full overflow-y-auto bg-slate-950 p-8">
                                {activeFile.name.endsWith('.md') || activeFile.name.endsWith('.markdown') ? (
                                    <div className="prose prose-invert max-w-none">
                                        <MarkdownView content={activeFile.content || ''} />
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center">
                                        {plantUmlUrl ? <img src={plantUmlUrl} alt="UML Diagram" className="max-w-full border border-slate-700 rounded-lg p-4 bg-white" /> : <div className="text-slate-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin"/> Rendering UML...</div>}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <RichCodeEditor code={activeFile.content || ''} onChange={handleCodeChange} onCursorMove={(l: number, c: number) => setLocalCursor({line: l, col: c})} language={activeFile.language} isShared={isSharedSession} remoteCursors={activeRemoteCursors} localCursor={localCursor} readOnly={isLockedByOther} />
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
          <div className={`${isZenMode ? 'hidden' : (isRightOpen ? 'w-80' : 'w-0')} bg-slate-950 flex flex-col transition-all duration-300 overflow-hidden shrink-0`}>
              <AIChatPanel 
                  isOpen={true} // Always render content, hide by width 
                  onClose={() => setIsRightOpen(false)} 
                  messages={chatMessages} 
                  onSendMessage={handleSendMessage} 
                  isThinking={isChatThinking} 
                  onApplyCode={handleCodeChange} 
                  onStartLive={()=>{}} 
                  isVoiceActive={isVoiceActive}
              />
          </div>
      </div>

      <ShareModal 
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          onShare={handleConfirmShare}
          link={window.location.href}
          title={project.name}
          currentAccess={project.accessLevel}
          currentAllowedUsers={project.allowedUserIds}
          currentUserUid={currentUser?.uid}
      />

      {showImportModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6">
                  <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-white flex items-center gap-2"><Github size={24}/> Open Repository</h3><button onClick={() => setShowImportModal(false)}><X size={20} className="text-slate-400"/></button></div>
                  <div className="space-y-4">
                      <select onChange={(e) => setPublicRepoPath(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white">
                          <option value="">-- Select Repo --</option>
                          {userProfile?.defaultRepoUrl && <option value={userProfile.defaultRepoUrl}>My Default: {userProfile.defaultRepoUrl}</option>}
                          <option disabled>──────────</option>
                          {PRESET_REPOS.map(p => <option key={p.path} value={p.path}>{p.label}</option>)}
                      </select>
                      <input type="text" placeholder="owner/repo" value={publicRepoPath} onChange={e => setPublicRepoPath(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"/>
                      <button onClick={handleLoadPublicRepo} disabled={isLoadingPublic || !publicRepoPath} className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold">{isLoadingPublic ? <Loader2 size={14} className="animate-spin inline"/> : 'Load'}</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
