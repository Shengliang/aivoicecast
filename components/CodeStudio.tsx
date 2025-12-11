import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CodeProject, CodeFile, UserProfile } from '../types';
import { ArrowLeft, Save, Plus, Github, Cloud, HardDrive, Code, X, ChevronRight, ChevronDown, File, Folder, DownloadCloud, Loader2, CheckCircle, AlertTriangle, Info, FolderPlus, FileCode, RefreshCw, LogIn, CloudUpload, Trash2, ArrowUp, Edit2, FolderOpen, MoreVertical } from 'lucide-react';
import { connectGoogleDrive } from '../services/authService';
import { fetchPublicRepoInfo, fetchRepoContents, fetchFileContent, commitToRepo, fetchRepoSubTree } from '../services/githubService';
import { listCloudDirectory, saveProjectToCloud, deleteCloudItem, createCloudFolder, CloudItem } from '../services/firestoreService';
import { ensureCodeStudioFolder, listDriveFiles, readDriveFile, saveToDrive, deleteDriveFile, createDriveFolder, DriveFile } from '../services/googleDriveService';

interface CodeStudioProps {
  onBack: () => void;
  currentUser: any;
  userProfile?: UserProfile | null;
  sessionId?: string;
  accessKey?: string;
  onSessionStart?: (id: string) => void;
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
    id: string; // Unique ID (path or id)
    name: string;
    type: 'file' | 'folder';
    data: any; // CodeFile | CloudItem | DriveFile
    children: TreeNode[];
    isLoaded?: boolean; // If children fetched
}

// Helper: Recursive File Tree Item
const FileTreeItem: React.FC<{
    node: TreeNode;
    depth: number;
    activeId?: string;
    onSelect: (node: TreeNode) => void;
    onToggle: (node: TreeNode) => void;
    onDelete?: (node: TreeNode) => void; // Optional delete action
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

// Helper: Simple Editor
const SimpleEditor: React.FC<{ code: string; onChange: (val: string) => void }> = ({ code, onChange }) => {
    return (
        <textarea 
            value={code} 
            onChange={(e) => onChange(e.target.value)} 
            className="w-full h-full bg-slate-950 text-slate-300 font-mono text-sm p-4 outline-none resize-none"
            spellCheck={false}
        />
    );
};

export const CodeStudio: React.FC<CodeStudioProps> = ({ onBack, currentUser, userProfile, sessionId, accessKey, onSessionStart }) => {
  // Project State (The Workspace)
  const [project, setProject] = useState<CodeProject>({ id: 'init', name: 'New Project', files: [], lastModified: Date.now() });
  const [activeFileIndex, setActiveFileIndex] = useState<number>(-1);
  const [activeTab, setActiveTab] = useState<'github' | 'cloud' | 'drive'>('github');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Remote Files State
  const [cloudItems, setCloudItems] = useState<CloudItem[]>([]); // Flat list of known cloud items
  const [driveItems, setDriveItems] = useState<(DriveFile & { parentId?: string, isLoaded?: boolean })[]>([]); // Flat list of known drive items
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
      inputValue?: string; 
      onConfirm: (val?: string) => void;
      isDestructive?: boolean;
  } | null>(null);
  
  // GitHub Specific
  const [publicRepoPath, setPublicRepoPath] = useState('');
  const [isLoadingPublic, setIsLoadingPublic] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Drive Auth
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [isDriveLoading, setIsDriveLoading] = useState(false);

  // Misc
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'modified' | 'saving'>('saved');

  // Initial Load
  const hasAttemptedAutoLoad = useRef(false);
  useEffect(() => {
      if (hasAttemptedAutoLoad.current) return;
      if (sessionId) { hasAttemptedAutoLoad.current = true; return; }
      if (userProfile?.defaultRepoUrl) {
          hasAttemptedAutoLoad.current = true;
          handleLoadPublicRepo(userProfile.defaultRepoUrl);
      }
  }, [userProfile, sessionId]);

  const availablePresets = useMemo(() => {
      const list = [...PRESET_REPOS];
      if (userProfile?.defaultRepoUrl && !list.some(p => p.path.toLowerCase() === userProfile.defaultRepoUrl?.toLowerCase())) {
          list.unshift({ label: 'My Default Repo', path: userProfile.defaultRepoUrl });
      }
      return list;
  }, [userProfile]);

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = crypto.randomUUID();
      setNotifications(prev => [...prev, { id, type, message }]);
      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  };

  const activeFile = activeFileIndex >= 0 ? project.files[activeFileIndex] : null;

  // --- Tree Builders ---

  // 1. GitHub Tree (Workspace)
  const workspaceTree = useMemo(() => {
      const root: TreeNode[] = [];
      const map = new Map<string, TreeNode>();
      
      // Sort files to ensure folders created before children? No, we handle missing parents dynamically or assume sorted.
      // Better: Create all nodes first.
      project.files.forEach(f => {
          const path = f.path || f.name;
          map.set(path, { 
              id: path, 
              name: f.name.split('/').pop()!, 
              type: f.isDirectory ? 'folder' : 'file', 
              data: f, 
              children: [],
              isLoaded: f.childrenFetched 
          });
      });

      project.files.forEach(f => {
          const path = f.path || f.name;
          const node = map.get(path)!;
          const parts = path.split('/');
          if (parts.length === 1) {
              root.push(node);
          } else {
              const parentPath = parts.slice(0, -1).join('/');
              const parent = map.get(parentPath);
              if (parent) parent.children.push(node);
              else root.push(node); // Orphan fallback
          }
      });

      const sortNodes = (nodes: TreeNode[]) => {
          nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));
          nodes.forEach(n => sortNodes(n.children));
      };
      sortNodes(root);
      return root;
  }, [project.files]);

  // 2. Cloud Tree
  const cloudTree = useMemo(() => {
      const root: TreeNode[] = [];
      const map = new Map<string, TreeNode>();

      cloudItems.forEach(item => {
          map.set(item.fullPath, {
              id: item.fullPath,
              name: item.name,
              type: item.isFolder ? 'folder' : 'file',
              data: item,
              children: []
          });
      });

      cloudItems.forEach(item => {
          const node = map.get(item.fullPath)!;
          // Cloud items usually come as flat list from a specific prefix. 
          // If we listed 'projects/subdir/', the item fullPath is 'projects/subdir/file.js'.
          // We need to attach it to its parent if the parent is in the list.
          
          // Logic: We only show items whose parent we have "visited/expanded". 
          // But simpler: just attach to parent if exists in map, else push to root if it's top-level relative to our view?
          // Actually, `listCloudDirectory` returns direct children. 
          // So we build the tree based on the `expandedFolders` logic implicitly: 
          // We load items into `cloudItems`.
          
          const parts = item.fullPath.split('/');
          const parentPath = parts.slice(0, -1).join('/');
          const parent = map.get(parentPath);
          
          if (parent) {
              parent.children.push(node);
          } else {
              // If parent doesn't exist in our known items, it might be a root item or we haven't fetched parent.
              // For visualization, we treat top-level items in the list as roots if they don't have a known parent.
              // HOWEVER, `cloudItems` accumulates everything.
              // Let's filter: Roots are those that don't have a parent in `cloudItems`.
              root.push(node);
          }
      });
      
      // Filter out non-roots from the root array (items that were pushed to children)
      // Actually, my logic above pushes EVERYTHING to root if parent not found.
      // If parent found, it pushes to parent children.
      // So I just need to return the nodes that HAVE NO PARENT in the map.
      
      const realRoots = root.filter(n => {
          const parts = n.id.split('/');
          if (parts.length === 1) return true; // True root
          const parentPath = parts.slice(0, -1).join('/');
          return !map.has(parentPath);
      });

      const sortNodes = (nodes: TreeNode[]) => {
          nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));
          nodes.forEach(n => sortNodes(n.children));
      };
      sortNodes(realRoots);
      return realRoots;
  }, [cloudItems]);

  // 3. Drive Tree
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
          } else {
              // If it's the root folder or an orphan
              if (item.id === driveRootId || !item.parentId) {
                  root.push(node);
              }
          }
      });

      const sortNodes = (nodes: TreeNode[]) => {
          nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));
          nodes.forEach(n => sortNodes(n.children));
      };
      sortNodes(root);
      return root;
  }, [driveItems, driveRootId]);


  // --- GitHub Handlers ---

  const handleLoadPublicRepo = async (path?: string) => {
      const targetPath = path || publicRepoPath;
      if (!targetPath.trim()) return;
      setIsLoadingPublic(true);
      try {
          const [owner, repo] = targetPath.split('/');
          const info = await fetchPublicRepoInfo(owner, repo);
          const { files, latestSha } = await fetchRepoContents(null, owner, repo, info.default_branch);
          setProject({ 
              id: `gh-${info.id}`, name: info.full_name, files, lastModified: Date.now(), 
              github: { owner, repo, branch: info.default_branch, sha: latestSha } 
          });
          setActiveFileIndex(-1);
          setShowImportModal(false);
          setExpandedFolders({});
          setActiveTab('github'); 
          showNotification("Repository cloned", "success");
      } catch (e: any) { showNotification("Failed: " + e.message, "error"); } finally { setIsLoadingPublic(false); }
  };

  const handleWorkspaceSelect = async (node: TreeNode) => {
      const file = node.data as CodeFile;
      const index = project.files.findIndex(f => (f.path || f.name) === (file.path || file.name));
      if (index === -1) return;

      if (!file.loaded && project.github) {
          try {
              const content = await fetchFileContent(null, project.github.owner, project.github.repo, file.path || file.name, project.github.branch);
              setProject(prev => {
                  const newFiles = [...prev.files];
                  newFiles[index] = { ...newFiles[index], content, loaded: true };
                  return { ...prev, files: newFiles };
              });
          } catch(e) { console.error(e); showNotification("Failed to load file", "error"); }
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
              setProject(prev => {
                  const newFiles = prev.files.map(f => (f.path || f.name) === path ? { ...f, childrenFetched: true } : f);
                  const currentPaths = new Set(newFiles.map(f => f.path || f.name));
                  const newChildren = children.filter(c => !currentPaths.has(c.path || c.name));
                  return { ...prev, files: [...newFiles, ...newChildren] };
              });
          } catch (e) { showNotification("Failed to fetch folder", "error"); } finally { setLoadingFolders(prev => ({ ...prev, [path]: false })); }
      }
  };

  // --- Cloud Handlers ---

  const initCloud = async () => {
      if (cloudItems.length > 0) return;
      setLoadingFolders(prev => ({ ...prev, 'root': true }));
      try {
          const items = await listCloudDirectory('projects'); // Start at projects/
          // Ensure we don't duplicate if called multiple times, though hook prevents it
          setCloudItems(items);
      } catch(e) { console.error(e); } finally { setLoadingFolders(prev => ({ ...prev, 'root': false })); }
  };

  useEffect(() => { if (activeTab === 'cloud') initCloud(); }, [activeTab]);

  const handleCloudToggle = async (node: TreeNode) => {
      const item = node.data as CloudItem;
      setExpandedFolders(prev => ({ ...prev, [item.fullPath]: !prev[item.fullPath] }));
      
      // Cloud is inherently flat listing by prefix, so to "expand" we just list the subdirectory
      // But we must check if we already loaded it.
      // Simple heuristic: if node has children in tree, we probably loaded it.
      // But filtering duplicates is better.
      if (!expandedFolders[item.fullPath]) {
          setLoadingFolders(prev => ({ ...prev, [item.fullPath]: true }));
          try {
              const children = await listCloudDirectory(item.fullPath);
              setCloudItems(prev => {
                  const existingPaths = new Set(prev.map(i => i.fullPath));
                  const newItems = children.filter(c => !existingPaths.has(c.fullPath));
                  return [...prev, ...newItems];
              });
          } catch(e) { console.error(e); } finally { setLoadingFolders(prev => ({ ...prev, [item.fullPath]: false })); }
      }
  };

  const handleCloudSelect = async (node: TreeNode) => {
      const item = node.data as CloudItem;
      if (!item.url) return;
      try {
          const res = await fetch(item.url);
          const text = await res.text();
          // Add to workspace
          const newFile: CodeFile = { name: item.name, language: 'javascript', content: text, loaded: true };
          setProject(prev => ({ ...prev, files: [...prev.files, newFile] }));
          setActiveFileIndex(project.files.length);
          showNotification("Imported " + item.name, "success");
      } catch(e) { showNotification("Failed to import", "error"); }
  };

  const handleCloudDelete = async (node: TreeNode) => {
      if(!confirm(`Delete ${node.name}?`)) return;
      try {
          await deleteCloudItem(node.data as CloudItem);
          setCloudItems(prev => prev.filter(i => i.fullPath !== node.id && !i.fullPath.startsWith(node.id + '/')));
          showNotification("Deleted", "success");
      } catch(e) { showNotification("Delete failed", "error"); }
  };

  // --- Drive Handlers ---

  const handleConnectDrive = async () => {
      try {
          const token = await connectGoogleDrive();
          setDriveToken(token);
          setIsDriveLoading(true);
          const rootId = await ensureCodeStudioFolder(token);
          setDriveRootId(rootId);
          
          // Fetch Root contents
          const files = await listDriveFiles(token, rootId);
          // Map to internal structure
          const rootNode = { id: rootId, name: 'CodeStudio', mimeType: 'application/vnd.google-apps.folder', parentId: undefined, isLoaded: true };
          const children = files.map(f => ({ ...f, parentId: rootId, isLoaded: false }));
          
          setDriveItems([rootNode, ...children]);
      } catch(e: any) { showNotification("Drive error: " + e.message, "error"); } finally { setIsDriveLoading(false); }
  };

  const handleDriveToggle = async (node: TreeNode) => {
      const file = node.data as (DriveFile & { isLoaded?: boolean });
      setExpandedFolders(prev => ({ ...prev, [file.id]: !prev[file.id] }));

      if (!file.isLoaded && driveToken && !expandedFolders[file.id]) {
          setLoadingFolders(prev => ({ ...prev, [file.id]: true }));
          try {
              const children = await listDriveFiles(driveToken, file.id);
              setDriveItems(prev => {
                  // Mark parent as loaded
                  const updatedPrev = prev.map(p => p.id === file.id ? { ...p, isLoaded: true } : p);
                  // Add children
                  const newItems = children.filter(c => !prev.some(p => p.id === c.id)).map(c => ({ ...c, parentId: file.id, isLoaded: false }));
                  return [...updatedPrev, ...newItems];
              });
          } catch(e) { console.error(e); } finally { setLoadingFolders(prev => ({ ...prev, [file.id]: false })); }
      }
  };

  const handleDriveSelect = async (node: TreeNode) => {
      if (!driveToken) return;
      try {
          const content = await readDriveFile(driveToken, node.id);
          const newFile: CodeFile = { name: node.name, language: 'javascript', content, loaded: true };
          setProject(prev => ({ ...prev, files: [...prev.files, newFile] }));
          setActiveFileIndex(project.files.length);
          showNotification("Imported " + node.name, "success");
      } catch(e) { showNotification("Failed to import", "error"); }
  };

  const handleDriveDelete = async (node: TreeNode) => {
      if (!driveToken || !confirm("Delete from Drive?")) return;
      try {
          await deleteDriveFile(driveToken, node.id);
          setDriveItems(prev => prev.filter(i => i.id !== node.id));
          showNotification("Deleted", "success");
      } catch(e) { showNotification("Delete failed", "error"); }
  };

  // --- Creation Modals ---
  const handleModalSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!modal) return;
      // @ts-ignore
      const input = e.target.inputVal?.value;
      if (!input) return;

      if (modal.title === 'New Cloud Folder') submitCloudFolderCreate(input);
      if (modal.title === 'New Drive Folder') submitDriveFolderCreate(input);
      if (modal.title === 'New Cloud File') submitCloudFileCreate(input);
  };

  const submitCloudFolderCreate = async (name: string) => {
      try {
          // Simplification: Create in root for now, or last toggled? 
          // Let's assume root 'projects' for simplicity in this generalized tree view
          await createCloudFolder('projects', name);
          const newItem: CloudItem = { name, fullPath: `projects/${name}`, isFolder: true };
          setCloudItems(prev => [...prev, newItem]);
          setModal(null);
      } catch(e) { console.error(e); }
  };

  const submitDriveFolderCreate = async (name: string) => {
      if (!driveToken || !driveRootId) return;
      try {
          const newFolder = await createDriveFolder(driveToken, driveRootId, name);
          setDriveItems(prev => [...prev, { ...newFolder, parentId: driveRootId }]);
          setModal(null);
      } catch(e) { console.error(e); }
  };

  const submitCloudFileCreate = async (name: string) => {
      try {
          await saveProjectToCloud('projects', name, "");
          const newItem: CloudItem = { name, fullPath: `projects/${name}`, isFolder: false, url: '' }; // URL missing but list will fix on refresh
          setCloudItems(prev => [...prev, newItem]);
          setModal(null);
      } catch(e) { console.error(e); }
  };

  // --- Common Editor Logic ---
  const handleCodeChange = (val: string) => {
      if (activeFileIndex < 0) return;
      const newFiles = [...project.files];
      newFiles[activeFileIndex] = { ...newFiles[activeFileIndex], content: val, isModified: true };
      setProject(prev => ({ ...prev, files: newFiles }));
      setSaveStatus('modified');
  };

  const handleSmartSave = async () => {
      setSaveStatus('saving');
      try {
          if (activeTab === 'github') {
              const ghToken = localStorage.getItem('github_token'); 
              if (project.github && ghToken) {
                  await commitToRepo(ghToken, project, "Update from Code Studio");
                  showNotification("Synced changes to GitHub", "success");
              } else {
                  showNotification("Saved locally (Connect GitHub account to sync)", "info");
              }
          } else if (activeTab === 'drive') {
              if (activeFile && driveToken && driveRootId) {
                  await saveToDrive(driveToken, driveRootId, activeFile.name, activeFile.content);
                  showNotification("Saved active file to Google Drive", "success");
              } else {
                  showNotification("Saved locally", "info");
              }
          } else if (activeTab === 'cloud') {
              if (activeFile) {
                  await saveProjectToCloud('projects', activeFile.name, activeFile.content);
                  showNotification("Saved to Cloud Storage", "success");
              }
          } else {
              showNotification("Project saved locally", "success");
          }
          setSaveStatus('saved');
      } catch (e: any) {
          console.error(e);
          showNotification("Save failed: " + e.message, "error");
          setSaveStatus('modified');
      }
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

      {/* Modal */}
      {modal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full shadow-2xl">
                  <h3 className="text-lg font-bold text-white mb-4">{modal.title}</h3>
                  <form onSubmit={handleModalSubmit}>
                      <input name="inputVal" autoFocus placeholder={modal.inputPlaceholder} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white mb-4 outline-none" />
                      <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setModal(null)} className="px-4 py-2 text-slate-300">Cancel</button>
                          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">Confirm</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* Header */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 z-20">
         <div className="flex items-center space-x-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"><ArrowLeft size={20} /></button>
            <div className="flex items-center space-x-2">
               <div className="bg-indigo-600 p-1.5 rounded-lg"><Code size={18} className="text-white" /></div>
               <h1 className="font-bold text-white text-sm">{project.name}</h1>
            </div>
            <div className="flex items-center space-x-2">
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
            </div>
         </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className={`${isSidebarOpen ? 'w-72' : 'w-0'} bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300`}>
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
                                  key={node.id} 
                                  node={node} 
                                  depth={0} 
                                  activeId={activeFile?.path || activeFile?.name}
                                  onSelect={handleWorkspaceSelect}
                                  onToggle={handleWorkspaceToggle}
                                  expandedIds={expandedFolders}
                                  loadingIds={loadingFolders}
                              />
                          ))}
                      </div>
                  )}

                  {/* Cloud View */}
                  {activeTab === 'cloud' && (
                      <div className="p-2">
                          <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-slate-800/50">
                              <span className="text-xs font-bold text-slate-500">CLOUD STORAGE</span>
                              <div className="flex gap-1">
                                  <button onClick={() => setModal({ title: 'New Cloud Folder', hasInput: true, inputPlaceholder: 'Name', onConfirm: () => {} })} className="p-1 hover:text-white text-slate-400"><FolderPlus size={12}/></button>
                                  <button onClick={() => setModal({ title: 'New Cloud File', hasInput: true, inputPlaceholder: 'Name.js', onConfirm: () => {} })} className="p-1 hover:text-white text-slate-400"><FileCode size={12}/></button>
                              </div>
                          </div>
                          {cloudTree.map(node => (
                              <FileTreeItem 
                                  key={node.id} 
                                  node={node} 
                                  depth={0}
                                  onSelect={handleCloudSelect}
                                  onToggle={handleCloudToggle}
                                  onDelete={handleCloudDelete}
                                  expandedIds={expandedFolders}
                                  loadingIds={loadingFolders}
                              />
                          ))}
                          {cloudTree.length === 0 && <div className="p-4 text-xs text-slate-500 text-center">No files in cloud.</div>}
                      </div>
                  )}

                  {/* Drive View */}
                  {activeTab === 'drive' && (
                      <div className="p-2">
                          {!driveToken ? (
                              <div className="p-4 flex flex-col items-center justify-center space-y-3">
                                  <HardDrive size={32} className="text-slate-600"/>
                                  <button onClick={handleConnectDrive} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg flex items-center gap-2">
                                      <LogIn size={14}/> Connect Drive
                                  </button>
                              </div>
                          ) : (
                              <>
                                  <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-slate-800/50">
                                      <span className="text-xs font-bold text-slate-500">GOOGLE DRIVE</span>
                                      <button onClick={() => setModal({ title: 'New Drive Folder', hasInput: true, inputPlaceholder: 'Name', onConfirm: () => {} })} className="p-1 hover:text-white text-slate-400"><FolderPlus size={12}/></button>
                                  </div>
                                  {isDriveLoading ? <div className="p-4 text-center"><Loader2 size={16} className="animate-spin inline"/></div> : (
                                      driveTree.map(node => (
                                          <FileTreeItem 
                                              key={node.id} 
                                              node={node} 
                                              depth={0}
                                              onSelect={handleDriveSelect}
                                              onToggle={handleDriveToggle}
                                              onDelete={handleDriveDelete}
                                              expandedIds={expandedFolders}
                                              loadingIds={loadingFolders}
                                          />
                                      ))
                                  )}
                              </>
                          )}
                      </div>
                  )}
              </div>
          </div>

          {/* Editor Area */}
          <div className="flex-1 bg-slate-950 flex flex-col min-w-0 border-l border-slate-800">
              {activeFile ? (
                  <>
                    <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <FileIcon filename={activeFile.name} />
                            <span className="text-sm font-bold text-white">{activeFile.name}</span>
                            {activeFile.isModified && <span className="w-2 h-2 rounded-full bg-yellow-500"></span>}
                        </div>
                    </div>
                    <SimpleEditor code={activeFile.content} onChange={handleCodeChange} />
                  </>
              ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                      <Code size={48} className="mb-4 opacity-20" />
                      <p className="text-sm">Select a file from the explorer.</p>
                  </div>
              )}
          </div>
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
                          {availablePresets.map(p => <option key={p.path} value={p.path}>{p.label}</option>)}
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