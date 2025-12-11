
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ArrowLeft, Save, Folder, File, Code, Plus, Trash2, Loader2, ChevronRight, ChevronDown, X, FileCode, FileType, Coffee, CloudUpload, Github, DownloadCloud, RefreshCw, HardDrive, LogIn, ArrowUp, FolderPlus, Cloud, FolderOpen, CheckCircle, AlertTriangle, Info, Edit2 } from 'lucide-react';
import { CodeProject, CodeFile } from '../types';
import { listCloudDirectory, CloudItem, createCloudFolder, deleteCloudItem, saveProjectToCloud, uploadFileToStorage } from '../services/firestoreService';
import { connectGoogleDrive } from '../services/authService';
import { fetchRepoContents, fetchPublicRepoInfo, fetchFileContent } from '../services/githubService';
import { ensureCodeStudioFolder, listDriveFiles, readDriveFile, saveToDrive, deleteDriveFile, createDriveFolder, DriveFile } from '../services/googleDriveService';

interface CodeStudioProps {
  onBack: () => void;
  currentUser: any;
  sessionId?: string;
  accessKey?: string;
  onSessionStart?: (id: string) => void;
}

// ... Languages and Presets ...
const LANGUAGES = [
    { id: 'cpp', label: 'C++', ext: 'cpp', defaultCode: `#include <iostream>\n\nint main() {\n    std::cout << "Hello World" << std::endl;\n    return 0;\n}` },
    { id: 'python', label: 'Python', ext: 'py', defaultCode: `print("Hello World")` },
    { id: 'javascript', label: 'JavaScript', ext: 'js', defaultCode: `console.log("Hello World");` },
    { id: 'typescript', label: 'TypeScript', ext: 'ts', defaultCode: `console.log("Hello World");` },
    { id: 'html', label: 'HTML', ext: 'html', defaultCode: `<!DOCTYPE html>\n<html>\n<body>\n<h1>Hello</h1>\n</body>\n</html>` },
    { id: 'css', label: 'CSS', ext: 'css', defaultCode: `body { background: #000; color: #fff; }` },
    { id: 'java', label: 'Java', ext: 'java', defaultCode: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello World");\n    }\n}` },
    { id: 'plantuml', label: 'PlantUML', ext: 'puml', defaultCode: `@startuml\nA -> B: Hello\n@enduml` }
];

const PRESET_REPOS = [
    { label: 'Default: Code Studio', path: 'Shengliang/codestudio' },
    { label: 'Linux Kernel', path: 'torvalds/linux' },
    { label: 'React', path: 'facebook/react' },
    { label: 'TensorFlow', path: 'tensorflow/tensorflow' }
];

// Helper: Get Language
const getLanguageFromFilename = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch(ext) {
        case 'js': case 'jsx': return 'javascript';
        case 'ts': case 'tsx': return 'typescript';
        case 'py': return 'python';
        case 'html': return 'html';
        case 'css': return 'css';
        case 'java': return 'java';
        case 'cpp': case 'c': case 'h': return 'c++';
        case 'md': return 'markdown';
        case 'puml': return 'plantuml';
        default: return 'text';
    }
};

// Helper: Get MimeType for Drive Upload
const getMimeTypeFromFilename = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch(ext) {
        case 'js': return 'application/javascript';
        case 'json': return 'application/json';
        case 'html': return 'text/html';
        case 'css': return 'text/css';
        case 'py': return 'text/x-python';
        case 'cpp': case 'c': case 'h': return 'text/x-c++src';
        case 'java': return 'text/x-java-source';
        case 'md': return 'text/markdown';
        default: return 'text/plain';
    }
};

// File Icon Component
const FileIcon = ({ filename }: { filename: string }) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['ts', 'tsx', 'js', 'jsx'].includes(ext || '')) return <FileCode size={14} className="text-yellow-400" />;
    if (ext === 'html') return <Code size={14} className="text-orange-400" />;
    if (ext === 'css') return <FileType size={14} className="text-blue-400" />;
    if (ext === 'py') return <FileCode size={14} className="text-blue-300" />;
    if (ext === 'java') return <Coffee size={14} className="text-red-400" />;
    return <File size={14} className="text-slate-400" />;
};

// --- File Tree Types & Logic ---
interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children: FileNode[];
  index?: number; 
  isLoading?: boolean; 
  isModified?: boolean;
}

const buildFileTree = (files: CodeFile[], expandedFolders: Record<string, boolean>): FileNode[] => {
  const root: FileNode[] = [];
  const map: Record<string, FileNode> = {};

  files.forEach((file, originalIndex) => {
    const parts = file.name.split('/');
    let currentPath = '';
    let parentNode: FileNode | null = null;
    
    parts.forEach((part, i) => {
      const isLast = i === parts.length - 1;
      const currentFullPath = currentPath ? `${currentPath}/${part}` : part;
      
      let node = map[currentFullPath];
      
      if (!node) {
        node = {
          name: part,
          path: currentFullPath,
          type: 'folder', 
          children: [],
        };
        map[currentFullPath] = node;
        
        if (parentNode) {
          parentNode.children.push(node);
        } else {
          root.push(node);
        }
      }
      
      if (isLast) {
          node.index = originalIndex;
          node.isModified = file.isModified;
          if (file.isDirectory) {
              node.type = 'folder';
          } else {
              node.type = 'file';
          }
      }
      
      parentNode = node;
      currentPath = currentFullPath;
    });
  });
  
  // Propagate modification state up to folders
  const propagateModified = (nodes: FileNode[]): boolean => {
      let anyModified = false;
      nodes.forEach(node => {
          if (node.type === 'folder') {
              const childModified = propagateModified(node.children);
              if (childModified) node.isModified = true;
          }
          if (node.isModified) anyModified = true;
      });
      return anyModified;
  };
  
  propagateModified(root);
  
  const sortNodes = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'folder' ? -1 : 1;
    });
    nodes.forEach(n => sortNodes(n.children));
  };
  
  sortNodes(root);
  return root;
};

const FileTreeNode: React.FC<{
  node: FileNode;
  depth: number;
  activeFileIndex: number;
  onSelect: (index: number) => void;
  onFolderSelect: (path: string) => void;
  expandedFolders: Record<string, boolean>;
  toggleFolder: (path: string) => void;
  loadingFolders: Record<string, boolean>;
  selectedFolder: string | null;
  onSaveNode: (node: FileNode) => void;
  onDeleteNode: (node: FileNode) => void;
}> = ({ node, depth, activeFileIndex, onSelect, onFolderSelect, expandedFolders, toggleFolder, loadingFolders, selectedFolder, onSaveNode, onDeleteNode }) => {
  const isOpen = expandedFolders[node.path];
  const isLoading = loadingFolders[node.path];
  const isSelected = selectedFolder === node.path && node.type === 'folder';
  
  return (
    <>
      <div 
        className={`w-full flex items-center space-x-1 px-3 py-1.5 text-xs text-left transition-colors cursor-pointer group hover:bg-slate-800 ${isSelected ? 'bg-indigo-900/40' : ''} ${node.index === activeFileIndex && node.type === 'file' ? 'bg-slate-800 border-l-2 border-indigo-500' : 'border-l-2 border-transparent'}`}
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
        onClick={(e) => {
            e.stopPropagation();
            if (node.type === 'folder') {
                onFolderSelect(node.path);
                toggleFolder(node.path);
            } else {
                if (node.index !== undefined) onSelect(node.index);
            }
        }}
      >
        <span className="shrink-0 text-slate-500 group-hover:text-white">
            {node.type === 'folder' ? (
                isLoading ? <Loader2 size={14} className="animate-spin text-indigo-400" /> :
                isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : null}
        </span>
        
        {node.type === 'folder' ? (
            isOpen ? <FolderOpen size={14} className={isSelected ? "text-indigo-400" : "text-slate-500"} /> : <Folder size={14} className={isSelected ? "text-indigo-400" : "text-slate-500"} />
        ) : (
            <FileIcon filename={node.name} />
        )}
        
        <span className={`truncate flex-1 ${node.index === activeFileIndex ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>{node.name}</span>
        
        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {node.isModified && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onSaveNode(node); }}
                    className="p-1 hover:bg-emerald-900/50 text-emerald-500 rounded"
                    title="Save"
                >
                    <Save size={12} />
                </button>
            )}
            <button 
                onClick={(e) => { e.stopPropagation(); onDeleteNode(node); }}
                className="p-1 hover:bg-red-900/50 text-slate-500 hover:text-red-400 rounded"
                title="Delete"
            >
                <Trash2 size={12} />
            </button>
        </div>
        
        {node.isModified && !node.type && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 ml-1"></span>}
      </div>
      
      {node.type === 'folder' && isOpen && node.children.map(child => (
        <FileTreeNode 
          key={child.path} 
          node={child} 
          depth={depth + 1}
          activeFileIndex={activeFileIndex}
          onSelect={onSelect}
          onFolderSelect={onFolderSelect}
          expandedFolders={expandedFolders}
          toggleFolder={toggleFolder}
          loadingFolders={loadingFolders}
          selectedFolder={selectedFolder}
          onSaveNode={onSaveNode}
          onDeleteNode={onDeleteNode}
        />
      ))}
    </>
  );
};

// Simplified editor
const SimpleEditor = ({ code, onChange }: any) => (
    <textarea 
        className="w-full h-full bg-slate-950 text-slate-300 font-mono p-4 outline-none resize-none"
        value={code}
        onChange={e => onChange(e.target.value)}
        spellCheck={false}
    />
);

interface NotificationState {
    id: number;
    message: string;
    type: 'success' | 'error' | 'info';
}

interface ModalState {
    isOpen: boolean;
    title: string;
    message?: string;
    confirmText?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
    // Input fields
    hasInput?: boolean;
    inputValue?: string;
    inputPlaceholder?: string;
}

export const CodeStudio: React.FC<CodeStudioProps> = ({ onBack, currentUser }) => {
  const [project, setProject] = useState<CodeProject>({ id: 'init', name: 'New Project', files: [], lastModified: Date.now() });
  const [activeFileIndex, setActiveFileIndex] = useState(-1);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [loadingFolders, setLoadingFolders] = useState<Record<string, boolean>>({});
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  // Notifications & Modals
  const [notifications, setNotifications] = useState<NotificationState[]>([]);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'modified'>('saved');

  // STORAGE TABS
  const [activeTab, setActiveTab] = useState<'github' | 'cloud' | 'drive'>('github');
  
  // Cloud (Firebase) State
  const [cloudFiles, setCloudFiles] = useState<CloudItem[]>([]);
  const [isCloudLoading, setIsCloudLoading] = useState(false);
  const [currentCloudPath, setCurrentCloudPath] = useState<string>('');
  const [cloudBreadcrumbs, setCloudBreadcrumbs] = useState<{name: string, path: string}[]>([]);

  // Drive State
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [driveToken, setDriveToken] = useState<string | null>(null);
  
  // Navigation State for Drive
  const [currentDriveFolderId, setCurrentDriveFolderId] = useState<string | null>(null);
  const [driveBreadcrumbs, setDriveBreadcrumbs] = useState<{id: string, name: string}[]>([]);

  // Modals & UI
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [publicRepoPath, setPublicRepoPath] = useState('');
  const [isLoadingPublic, setIsLoadingPublic] = useState(false);
  
  const activeFile = activeFileIndex >= 0 ? project.files[activeFileIndex] : null;
  const fileTree = useMemo(() => project.github ? buildFileTree(project.files, expandedFolders) : [], [project.files, expandedFolders, project.github]);

  // Helper: Show Notification
  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = Date.now();
      setNotifications(prev => [...prev, { id, message, type }]);
      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  };

  // --- AUTO-SAVE LOGIC ---
  useEffect(() => {
      if (!activeFile || !activeFile.isModified) return;

      // Don't auto-save "New Project" to cloud, prevents duplicate dummy files
      if (activeTab === 'cloud' && project.name === 'New Project') return;

      setSaveStatus('modified');
      const timer = setTimeout(async () => {
          setSaveStatus('saving');
          try {
              if (activeTab === 'drive' && driveToken && currentDriveFolderId) {
                   await saveFilesToDrive([activeFile], true);
              } else if (activeTab === 'cloud' && currentUser) {
                   await handleSaveToCloud(true);
              }
              setSaveStatus('saved');
          } catch (e) {
              setSaveStatus('modified'); // Retry later manually or auto
          }
      }, 3000); // 3-second debounce

      return () => clearTimeout(timer);
  }, [project, activeFile, activeTab]); 

  // --- TAB HANDLERS ---

  useEffect(() => {
      if (activeTab === 'cloud' && currentUser) {
          const rootPath = `codestudio/${currentUser.uid}`;
          setCurrentCloudPath(rootPath);
          setCloudBreadcrumbs([{name: 'Root', path: rootPath}]);
          fetchCloudFiles(rootPath);
      }
      if (activeTab === 'drive' && driveToken) {
          if (!currentDriveFolderId) {
              initDrive(driveToken);
          } else if (driveFiles.length === 0) {
              refreshDrive();
          }
      }
  }, [activeTab, currentUser, driveToken]);

  const fetchCloudFiles = async (path: string) => {
      setIsCloudLoading(true);
      try {
          const files = await listCloudDirectory(path);
          setCloudFiles(files);
      } catch(e) {
          console.error(e);
      } finally {
          setIsCloudLoading(false);
      }
  };

  const handleCloudFolderClick = (folder: CloudItem) => {
      setCurrentCloudPath(folder.fullPath);
      setCloudBreadcrumbs(prev => [...prev, { name: folder.name, path: folder.fullPath }]);
      fetchCloudFiles(folder.fullPath);
  };

  const handleCloudBack = () => {
      if (cloudBreadcrumbs.length <= 1) return;
      const newBreadcrumbs = [...cloudBreadcrumbs];
      newBreadcrumbs.pop();
      const parent = newBreadcrumbs[newBreadcrumbs.length - 1];
      setCurrentCloudPath(parent.path);
      setCloudBreadcrumbs(newBreadcrumbs);
      fetchCloudFiles(parent.path);
  };

  const handleCreateCloudFolder = async () => {
      if (!currentCloudPath) return;
      
      setModal({
          isOpen: true,
          title: "New Folder",
          hasInput: true,
          inputPlaceholder: "Folder Name",
          onConfirm: async () => {
              // Handled by inline submit logic
          }
      });
  };
  
  const submitCloudFolderCreate = async (name: string) => {
      setModal(null);
      setIsCloudLoading(true);
      try {
          await createCloudFolder(currentCloudPath, name);
          await fetchCloudFiles(currentCloudPath);
          showNotification("Folder created", "success");
      } catch(e: any) {
          showNotification("Failed to create folder", "error");
      } finally {
          setIsCloudLoading(false);
      }
  };

  const handleCreateCloudFileClick = () => {
      setModal({
          isOpen: true,
          title: "New Cloud File",
          hasInput: true,
          inputPlaceholder: "filename.js",
          inputValue: "",
          onConfirm: () => {} 
      });
  };

  const submitCloudFileCreate = async (filename: string) => {
      setModal(null);
      if (!filename) return;
      
      setIsCloudLoading(true);
      try {
          const fullPath = `${currentCloudPath}/${filename}`;
          // Create empty file
          const blob = new Blob([""], { type: 'text/plain' });
          await uploadFileToStorage(fullPath, blob, { type: 'file' });
          await fetchCloudFiles(currentCloudPath);
          showNotification("File created", "success");
      } catch (e: any) {
          showNotification("Failed to create file: " + e.message, "error");
      } finally {
          setIsCloudLoading(false);
      }
  }

  const handleDeleteCloudItem = async (item: CloudItem) => {
      setModal({
          isOpen: true,
          title: "Delete Item",
          message: `Are you sure you want to delete "${item.name}"?`,
          isDestructive: true,
          onConfirm: async () => {
              setModal(null);
              setIsCloudLoading(true);
              try {
                  await deleteCloudItem(item);
                  await fetchCloudFiles(currentCloudPath);
                  showNotification("Item deleted", "success");
              } catch(e: any) {
                  showNotification("Delete failed", "error");
              } finally {
                  setIsCloudLoading(false);
              }
          }
      });
  };

  const handleConnectDrive = async () => {
      try {
          const token = await connectGoogleDrive();
          setDriveToken(token);
          await initDrive(token);
      } catch (e: any) {
          showNotification("Failed to connect Drive", "error");
      }
  };

  const initDrive = async (token: string) => {
      setIsDriveLoading(true);
      try {
          const rootId = await ensureCodeStudioFolder(token);
          setCurrentDriveFolderId(rootId);
          setDriveBreadcrumbs([{ id: rootId, name: 'codestudio' }]);
          
          const files = await listDriveFiles(token, rootId);
          setDriveFiles(files);
      } catch(e: any) {
          showNotification("Drive Error: " + e.message, "error");
      } finally {
          setIsDriveLoading(false);
      }
  };

  const refreshDrive = async () => {
      if (!driveToken || !currentDriveFolderId) return;
      setIsDriveLoading(true);
      try {
          const files = await listDriveFiles(driveToken, currentDriveFolderId);
          setDriveFiles(files);
      } catch(e) { console.error(e); } finally { setIsDriveLoading(false); }
  };

  // --- FILE OPERATIONS ---

  const handleGitHubFileSelect = async (index: number) => {
      setActiveFileIndex(index);
      const file = project.files[index];
      
      if (!file.loaded && !file.isDirectory && project.github) {
          const newFiles = [...project.files];
          newFiles[index] = { ...file, content: 'Loading...' };
          setProject(prev => ({ ...prev, files: newFiles }));
          
          try {
              const content = await fetchFileContent(null, project.github.owner, project.github.repo, file.path!, project.github.branch);
              setProject(prev => {
                  const updated = [...prev.files];
                  updated[index] = { ...file, content, loaded: true };
                  return { ...prev, files: updated };
              });
          } catch(e) {
              const errFiles = [...project.files];
              errFiles[index] = { ...file, content: '// Failed to load content' };
              setProject(prev => ({ ...prev, files: errFiles }));
              showNotification("Failed to load content", "error");
          }
      }
  };

  const handleLoadCloudFile = async (item: CloudItem) => {
      if (!item.url) return;
      
      setIsCloudLoading(true);
      try {
          const res = await fetch(item.url!);
          if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
          
          const text = await res.text();
          
          try {
              const data = JSON.parse(text);
              if (data.files && (Array.isArray(data.files) || typeof data.files === 'object')) {
                  // Project backup
                  let files: CodeFile[] = [];
                  if (Array.isArray(data.files)) files = data.files;
                  else if (data.files) files = Object.values(data.files);
                  
                  setProject({ ...data, files });
                  setActiveFileIndex(0);
                  showNotification("Project loaded", "success");
                  setIsCloudLoading(false);
                  return;
              }
          } catch(e) {}

          // Load as single file
          const newFile: CodeFile = {
              name: item.name,
              language: getLanguageFromFilename(item.name) as any,
              content: text,
              loaded: true,
              isModified: true
          };
          
          let newIndex = project.files.length;
          
          setProject(prev => {
              // Check if file already exists (by name)
              const existingIdx = prev.files.findIndex(f => f.name === newFile.name);
              if (existingIdx >= 0) {
                  newIndex = existingIdx;
                  const updatedFiles = [...prev.files];
                  updatedFiles[existingIdx] = newFile;
                  return { ...prev, files: updatedFiles };
              } else {
                  return { ...prev, files: [...prev.files, newFile] };
              }
          });
          
          // Calculate correct index after state update might be tricky due to closure, 
          // but relying on effect or simple index search is safe here.
          // We know if it existed or appended.
          const existingIdx = project.files.findIndex(f => f.name === newFile.name);
          setActiveFileIndex(existingIdx >= 0 ? existingIdx : project.files.length);
          
          showNotification(`Loaded ${item.name}`, "success");
      } catch(e: any) {
          showNotification("Failed to load file", "error");
      } finally {
          setIsCloudLoading(false);
      }
  };

  const handleDriveFolderClick = async (fileId: string, fileName: string) => {
      if (!driveToken) return;
      setIsDriveLoading(true);
      try {
          const files = await listDriveFiles(driveToken, fileId);
          setDriveFiles(files);
          setCurrentDriveFolderId(fileId);
          setDriveBreadcrumbs(prev => [...prev, { id: fileId, name: fileName }]);
      } catch (e: any) {
          console.error("Navigate Drive Failed:", e);
      } finally {
          setIsDriveLoading(false);
      }
  };

  const handleDriveBack = async () => {
      if (!driveToken || driveBreadcrumbs.length <= 1) return;
      const newPath = [...driveBreadcrumbs];
      newPath.pop();
      const parent = newPath[newPath.length - 1];
      
      setIsDriveLoading(true);
      try {
          const files = await listDriveFiles(driveToken, parent.id);
          setDriveFiles(files);
          setCurrentDriveFolderId(parent.id);
          setDriveBreadcrumbs(newPath);
      } catch (e) {
          console.error(e);
      } finally {
          setIsDriveLoading(false);
      }
  };

  const handleCreateDriveFolder = async () => {
      if (!driveToken || !currentDriveFolderId) return;
      setModal({
          isOpen: true,
          title: "New Drive Folder",
          hasInput: true,
          inputPlaceholder: "Folder Name",
          onConfirm: async () => {
              // handled inline
          }
      });
  };
  
  const submitDriveFolderCreate = async (name: string) => {
      setModal(null);
      if (!driveToken || !currentDriveFolderId) return;
      setIsDriveLoading(true);
      try {
          await createDriveFolder(driveToken, currentDriveFolderId, name);
          await refreshDrive();
          showNotification("Folder created", "success");
      } catch(e: any) {
          showNotification("Failed to create folder", "error");
      } finally {
          setIsDriveLoading(false);
      }
  };

  const handleLoadDriveFile = async (fileId: string, filename: string) => {
      if (!driveToken) return;
      
      setIsDriveLoading(true);
      try {
          const text = await readDriveFile(driveToken, fileId);
          const existingIdx = project.files.findIndex(f => f.name === filename);
          if (existingIdx >= 0) {
              const updatedFiles = [...project.files];
              updatedFiles[existingIdx] = {
                  ...updatedFiles[existingIdx],
                  content: text,
                  loaded: true,
                  isModified: false
              };
              setProject(prev => ({ ...prev, files: updatedFiles }));
              setActiveFileIndex(existingIdx);
              showNotification("File reloaded", "success");
          } else {
              const newFile: CodeFile = {
                  name: filename,
                  language: getLanguageFromFilename(filename) as any,
                  content: text,
                  loaded: true,
                  isModified: false
              };
              setProject(prev => ({ ...prev, files: [...prev.files, newFile] }));
              setActiveFileIndex(project.files.length);
              showNotification("File opened", "success");
          }
      } catch(e: any) {
          showNotification("Failed to read Drive file", "error");
      } finally {
          setIsDriveLoading(false);
      }
  };

  const handleSaveToCloud = async (silent = false) => {
      if (!currentUser) return;
      
      // Avoid auto-saving "New Project" if silent (auto-save loop) to prevent spamming cloud with empty/default projects
      if (silent && project.name === 'New Project') return;

      if (!silent) setIsCloudLoading(true);
      try {
          const path = currentCloudPath || `codestudio/${currentUser.uid}`;
          const json = JSON.stringify(project);
          
          const sanitizedName = project.name.replace(/[^a-zA-Z0-9-_]/g, '_');
          const filename = `${sanitizedName}.json`;
          
          await saveProjectToCloud(path, filename, json, project.name);
          await fetchCloudFiles(path);
          
          setProject(prev => ({
              ...prev,
              files: prev.files.map(f => ({ ...f, isModified: false }))
          }));
          
          if (!silent) showNotification("Saved to Cloud Storage!", "success");
      } catch(e: any) {
          showNotification("Save failed: " + e.message, "error");
      } finally {
          if (!silent) setIsCloudLoading(false);
      }
  };

  const saveFilesToDrive = async (filesToSave: CodeFile[], silent = false) => {
      if (!driveToken || !currentDriveFolderId) {
          showNotification("Please connect to Google Drive first.", "error");
          return;
      }
      if (!silent) setIsDriveLoading(true);
      try {
          const savedNames: string[] = [];
          for (const file of filesToSave) {
              if (file.isDirectory) continue;
              const mimeType = getMimeTypeFromFilename(file.name);
              await saveToDrive(driveToken, currentDriveFolderId, file.name, file.content, mimeType);
              savedNames.push(file.name);
          }
          setProject(prev => ({
              ...prev,
              files: prev.files.map(f => savedNames.includes(f.name) ? { ...f, isModified: false } : f)
          }));
          await refreshDrive();
          if(!silent) showNotification("Saved to Drive", "success");
      } catch(e: any) {
          showNotification("Drive save failed", "error");
      } finally {
          if (!silent) setIsDriveLoading(false);
      }
  };

  const handleSaveToDrive = async () => {
      const modifiedFiles = project.files.filter(f => f.isModified && !f.isDirectory);
      if (modifiedFiles.length === 0) return;
      await saveFilesToDrive(modifiedFiles);
  };

  const handleSaveActiveFileToDrive = async () => {
      if (!activeFile) return;
      await saveFilesToDrive([activeFile]);
  };

  const handleDeleteDriveFile = async (fileId: string) => {
      if (!driveToken) return;
      setModal({
          isOpen: true,
          title: "Delete Drive File",
          message: "Are you sure you want to delete this file?",
          isDestructive: true,
          onConfirm: async () => {
              setModal(null);
              setIsDriveLoading(true);
              try {
                  await deleteDriveFile(driveToken!, fileId);
                  await refreshDrive();
                  showNotification("File deleted", "success");
              } catch(e: any) {
                  showNotification("Delete failed", "error");
              } finally {
                  setIsDriveLoading(false);
              }
          }
      });
  };

  const handleGeneralSave = () => {
      if (activeTab === 'drive' && driveToken) {
          handleSaveToDrive();
      } else if (activeTab === 'cloud' && currentUser) {
          handleSaveToCloud();
      } else {
          if (driveToken) {
              handleSaveToDrive(); 
          } else if (currentUser) {
              setModal({
                  isOpen: true,
                  title: "Save Project",
                  message: "Save project snapshot to Cloud Storage?",
                  onConfirm: () => {
                      setModal(null);
                      handleSaveToCloud();
                  }
              });
          } else {
              showNotification("Sign in or Connect Drive to save.", "info");
          }
      }
  };

  const handleSaveNode = async (node: FileNode) => {
      let filesToSave: CodeFile[] = [];
      if (node.type === 'folder') {
          filesToSave = project.files.filter(f => f.name.startsWith(node.path + '/') && f.isModified);
      } else {
          const file = project.files[node.index!];
          if (file && file.isModified) filesToSave.push(file);
      }
      
      if (filesToSave.length === 0) return;
      await saveFilesToDrive(filesToSave);
  };

  const handleDeleteNode = async (node: FileNode) => {
      setModal({
          isOpen: true,
          title: "Remove from Workspace",
          message: `Remove ${node.type} "${node.name}" from local workspace? (File remains in remote storage)`,
          isDestructive: true,
          onConfirm: () => {
              setModal(null);
              let newFiles: CodeFile[] = [];
              if (node.type === 'folder') {
                  newFiles = project.files.filter(f => !f.name.startsWith(node.path + '/'));
              } else {
                  newFiles = project.files.filter((_, i) => i !== node.index);
              }
              setProject(prev => ({ ...prev, files: newFiles }));
              if (activeFileIndex >= newFiles.length) setActiveFileIndex(Math.max(0, newFiles.length - 1));
              showNotification("Removed from workspace", "success");
          }
      });
  };

  const handleAddFile = (langId: string) => {
      const lang = LANGUAGES.find(l => l.id === langId);
      if (!lang) return;
      
      const timestamp = Date.now();
      const filename = `untitled_${timestamp}.${lang.ext}`;
      const fullPath = selectedFolder ? `${selectedFolder}/${filename}` : filename;

      const newFile: CodeFile = {
          name: fullPath,
          language: lang.id as any,
          content: lang.defaultCode,
          loaded: true,
          isModified: true
      };
      
      if (selectedFolder) setExpandedFolders(prev => ({ ...prev, [selectedFolder]: true }));

      setProject(prev => ({ ...prev, files: [...prev.files, newFile] }));
      setActiveFileIndex(project.files.length);
      setShowLanguageDropdown(false);
  };

  const toggleFolder = (path: string) => {
      setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const handleCodeChange = (val: string) => {
      const newFiles = [...project.files];
      newFiles[activeFileIndex] = { ...newFiles[activeFileIndex], content: val, isModified: true };
      setProject({ ...project, files: newFiles });
  };

  const handleLoadPublicRepo = async (path?: string) => {
      const targetPath = path || publicRepoPath;
      if (!targetPath.trim()) return;
      
      setIsLoadingPublic(true);
      try {
          const [owner, repo] = targetPath.split('/');
          const info = await fetchPublicRepoInfo(owner, repo);
          const { files, latestSha } = await fetchRepoContents(null, owner, repo, info.default_branch);
          setProject({ 
              id: `gh-${info.id}`, 
              name: info.full_name, 
              files, 
              lastModified: Date.now(), 
              github: { owner, repo, branch: info.default_branch, sha: latestSha } 
          });
          setActiveFileIndex(0);
          setShowImportModal(false);
          setPublicRepoPath('');
          setExpandedFolders({});
          setActiveTab('github'); 
          showNotification("Repository cloned", "success");
      } catch (e: any) { 
          showNotification("Failed: " + e.message, "error");
      } finally { 
          setIsLoadingPublic(false); 
      }
  };

  // Generic Input Submit Handler for Modals
  const handleModalSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!modal) return;
      const input = (e.target as any).inputVal.value;
      if (modal.title === 'New Folder') {
          submitCloudFolderCreate(input);
      } else if (modal.title === 'New Drive Folder') {
          submitDriveFolderCreate(input);
      } else if (modal.title === 'New Cloud File') {
          submitCloudFileCreate(input);
      }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden relative">
      
      {/* Toast Notifications */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
          {notifications.map(n => (
              <div key={n.id} className={`flex items-center gap-2 px-4 py-2 rounded-full shadow-xl text-sm font-bold animate-fade-in-up ${n.type === 'error' ? 'bg-red-600 text-white' : n.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-200 border border-slate-700'}`}>
                  {n.type === 'success' ? <CheckCircle size={14}/> : n.type === 'error' ? <AlertTriangle size={14}/> : <Info size={14}/>}
                  <span>{n.message}</span>
              </div>
          ))}
      </div>

      {/* General Modal */}
      {modal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full shadow-2xl animate-fade-in-up">
                  <h3 className="text-lg font-bold text-white mb-2">{modal.title}</h3>
                  {modal.message && <p className="text-slate-400 text-sm mb-6">{modal.message}</p>}
                  
                  {modal.hasInput ? (
                      <form onSubmit={handleModalSubmit}>
                          <input name="inputVal" autoFocus placeholder={modal.inputPlaceholder} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white mb-4 outline-none focus:border-indigo-500" defaultValue={modal.inputValue} />
                          <div className="flex justify-end gap-3">
                              <button type="button" onClick={() => setModal(null)} className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg text-sm font-bold">Cancel</button>
                              <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold">Confirm</button>
                          </div>
                      </form>
                  ) : (
                      <div className="flex justify-end gap-3">
                          <button onClick={() => setModal(null)} className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg text-sm font-bold">Cancel</button>
                          <button onClick={modal.onConfirm} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 ${modal.isDestructive ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}>
                              {modal.isDestructive && <Trash2 size={14}/>} Confirm
                          </button>
                      </div>
                  )}
              </div>
          </div>
      )}

      <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 z-20">
         <div className="flex items-center space-x-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
               <ArrowLeft size={20} />
            </button>
            <div className="flex items-center space-x-2">
               <div className="bg-indigo-600 p-1.5 rounded-lg">
                  <Code size={18} className="text-white" />
               </div>
               <h1 className="font-bold text-white text-sm">{project.name}</h1>
            </div>
            
            <div className="flex items-center space-x-2">
               {activeTab === 'drive' && (
                   <button onClick={handleSaveActiveFileToDrive} disabled={!activeFile} className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-lg text-xs font-bold transition-colors border border-slate-700">
                       <CloudUpload size={14} /> <span>Save Active File</span>
                   </button>
               )}
               <button onClick={handleGeneralSave} className="flex items-center space-x-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors shadow-md">
                   {isDriveLoading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} <span>Save Project</span>
               </button>

               <div className="relative">
                    <button onClick={() => activeTab === 'cloud' ? handleCreateCloudFileClick() : setShowLanguageDropdown(!showLanguageDropdown)} className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors border border-slate-700">
                        <Plus size={14} /> <span>New File</span>
                    </button>
                    {showLanguageDropdown && activeTab !== 'cloud' && (
                        <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowLanguageDropdown(false)}></div>
                        <div className="absolute top-full left-0 mt-2 w-40 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-40 overflow-hidden py-1">
                            {LANGUAGES.map(lang => (
                                <button key={lang.id} onClick={() => handleAddFile(lang.id)} className="w-full text-left px-4 py-2 hover:bg-slate-800 text-xs text-slate-300 hover:text-white">
                                    {lang.label}
                                </button>
                            ))}
                        </div>
                        </>
                    )}
                </div>
            </div>
         </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
          <div className={`${isSidebarOpen ? 'w-72' : 'w-0'} bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300`}>
              <div className="flex border-b border-slate-800 bg-slate-950/50">
                  <button onClick={() => setActiveTab('github')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'github' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`} title="GitHub"><Github size={18}/></button>
                  <button onClick={() => setActiveTab('cloud')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'cloud' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`} title="Cloud Storage"><Cloud size={18}/></button>
                  <button onClick={() => setActiveTab('drive')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'drive' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`} title="Google Drive"><HardDrive size={18}/></button>
              </div>

              <div className="flex-1 overflow-y-auto">
                  {/* GITHUB TAB */}
                  {activeTab === 'github' && (
                      <div className="p-2">
                          {project.github ? (
                              <div className="space-y-0.5">
                                  <div className="px-2 pb-2 text-xs font-bold text-slate-500 uppercase flex items-center justify-between">
                                      <span>Repository Files</span>
                                      <span className="text-[10px] bg-slate-800 px-1 rounded">{project.github.repo}</span>
                                  </div>
                                  {fileTree.map(node => (
                                      <FileTreeNode 
                                          key={node.path}
                                          node={node}
                                          depth={0}
                                          activeFileIndex={activeFileIndex}
                                          onSelect={(idx) => handleGitHubFileSelect(idx)}
                                          onFolderSelect={setSelectedFolder}
                                          expandedFolders={expandedFolders}
                                          toggleFolder={toggleFolder}
                                          loadingFolders={loadingFolders}
                                          selectedFolder={selectedFolder}
                                          onSaveNode={handleSaveNode}
                                          onDeleteNode={handleDeleteNode}
                                      />
                                  ))}
                              </div>
                          ) : (
                              <div className="p-4 space-y-4">
                                  <div className="text-center p-4 border border-dashed border-slate-700 rounded-lg text-slate-500 text-sm">
                                      No repository loaded.
                                  </div>
                                  <button onClick={() => setShowImportModal(true)} className="w-full py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold hover:bg-slate-700 text-white flex items-center justify-center gap-2">
                                      <DownloadCloud size={14} /> Clone Repo
                                  </button>
                                  
                                  <div className="border-t border-slate-800 pt-2">
                                      <p className="text-[10px] text-slate-500 uppercase font-bold mb-2">Presets</p>
                                      {PRESET_REPOS.map(repo => (
                                        <button key={repo.path} onClick={() => handleLoadPublicRepo(repo.path)} className="w-full text-left px-3 py-2 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-xs text-slate-300 mb-1 flex items-center gap-2">
                                            <Github size={12} /> {repo.label}
                                        </button>
                                      ))}
                                  </div>
                              </div>
                          )}
                      </div>
                  )}

                  {/* CLOUD TAB */}
                  {activeTab === 'cloud' && (
                      <div className="p-2">
                          <div className="px-2 mb-2 flex flex-col space-y-2">
                              <div className="flex justify-between items-center">
                                  <span className="text-xs font-bold text-slate-500 uppercase">Cloud Explorer</span>
                                  <div className="flex gap-1">
                                      <button onClick={handleCreateCloudFolder} className="p-1 hover:bg-slate-700 rounded text-slate-400" title="New Folder"><FolderPlus size={12}/></button>
                                      <button onClick={() => fetchCloudFiles(currentCloudPath)} className="p-1 hover:bg-slate-700 rounded text-slate-400"><RefreshCw size={12}/></button>
                                  </div>
                              </div>
                              {/* Breadcrumbs */}
                              <div className="flex items-center text-[10px] text-slate-400 bg-slate-800 rounded px-2 py-1 overflow-x-auto whitespace-nowrap">
                                  {cloudBreadcrumbs.length > 1 && (
                                      <button onClick={handleCloudBack} className="hover:text-white mr-1"><ArrowUp size={10}/></button>
                                  )}
                                  {cloudBreadcrumbs.map((crumb, i) => (
                                      <span key={crumb.path} className="flex items-center">
                                          {i > 0 && <span className="mx-1">/</span>}
                                          <span className="text-white font-bold">{crumb.name}</span>
                                      </span>
                                  ))}
                              </div>
                          </div>

                          {isCloudLoading ? (
                              <div className="py-8 text-center text-indigo-400"><Loader2 className="animate-spin mx-auto"/></div>
                          ) : cloudFiles.length === 0 ? (
                              <div className="p-4 text-center text-slate-500 text-xs italic">Folder is empty.</div>
                          ) : (
                              cloudFiles.map((item) => (
                                  <div key={item.fullPath} 
                                       className={`flex items-center justify-between p-2 hover:bg-slate-800 rounded group ${item.isFolder ? 'cursor-pointer' : 'cursor-pointer'}`}
                                       onClick={() => item.isFolder ? handleCloudFolderClick(item) : handleLoadCloudFile(item)}
                                  >
                                      <div className="flex items-center gap-2 overflow-hidden">
                                          {item.isFolder ? <Folder size={14} className="text-yellow-500 shrink-0"/> : <FileCode size={14} className="text-indigo-400 shrink-0"/>}
                                          <span className={`text-xs truncate ${item.isFolder ? 'text-white font-medium' : 'text-slate-300'}`} title={item.name}>{item.name}</span>
                                      </div>
                                      <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                                          {!item.isFolder && <button onClick={(e) => { e.stopPropagation(); handleLoadCloudFile(item); }} className="p-1 hover:bg-indigo-600 rounded text-slate-400 hover:text-white" title="Import"><DownloadCloud size={12}/></button>}
                                          <button onClick={(e) => { e.stopPropagation(); handleDeleteCloudItem(item); }} className="p-1 hover:bg-red-600 rounded text-slate-400 hover:text-white" title="Delete"><Trash2 size={12}/></button>
                                      </div>
                                  </div>
                              ))
                          )}
                      </div>
                  )}

                  {/* DRIVE TAB */}
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
                                  <div className="px-2 mb-2 flex flex-col space-y-2">
                                      <div className="flex justify-between items-center">
                                          <span className="text-xs font-bold text-slate-500 uppercase">Drive Explorer</span>
                                          <div className="flex gap-1">
                                              <button onClick={handleCreateDriveFolder} className="p-1 hover:bg-slate-700 rounded text-slate-400" title="New Folder"><FolderPlus size={12}/></button>
                                              <button onClick={refreshDrive} className="p-1 hover:bg-slate-700 rounded text-slate-400"><RefreshCw size={12}/></button>
                                          </div>
                                      </div>
                                      <div className="flex items-center text-[10px] text-slate-400 bg-slate-800 rounded px-2 py-1 overflow-x-auto whitespace-nowrap">
                                          {driveBreadcrumbs.length > 1 && (
                                              <button onClick={handleDriveBack} className="hover:text-white mr-1"><ArrowUp size={10}/></button>
                                          )}
                                          {driveBreadcrumbs.map((crumb, i) => (
                                              <span key={crumb.id} className="flex items-center">
                                                  {i > 0 && <span className="mx-1">/</span>}
                                                  <span className="text-white font-bold">{crumb.name}</span>
                                              </span>
                                          ))}
                                      </div>
                                  </div>

                                  {isDriveLoading ? (
                                      <div className="py-8 text-center text-indigo-400"><Loader2 className="animate-spin mx-auto"/></div>
                                  ) : driveFiles.length === 0 ? (
                                      <div className="p-4 text-center text-slate-500 text-xs italic">Folder is empty.</div>
                                  ) : (
                                      driveFiles.map((file) => {
                                          const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                                          return (
                                              <div key={file.id} 
                                                   onClick={() => isFolder ? handleDriveFolderClick(file.id, file.name) : handleLoadDriveFile(file.id, file.name)}
                                                   className={`flex items-center justify-between p-2 hover:bg-slate-800 rounded group cursor-pointer`}
                                              >
                                                  <div className="flex items-center gap-2 overflow-hidden">
                                                      {isFolder ? <Folder size={14} className="text-yellow-500 shrink-0"/> : <FileCode size={14} className="text-green-400 shrink-0"/>}
                                                      <span className={`text-xs truncate ${isFolder ? 'text-white font-medium' : 'text-slate-300'}`} title={file.name}>{file.name}</span>
                                                  </div>
                                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                                                      {!isFolder && <button onClick={(e) => { e.stopPropagation(); handleLoadDriveFile(file.id, file.name); }} className="p-1 hover:bg-indigo-600 rounded text-slate-400 hover:text-white" title="Open"><FileCode size={12}/></button>}
                                                      <button onClick={(e) => { e.stopPropagation(); handleDeleteDriveFile(file.id); }} className="p-1 hover:bg-red-600 rounded text-slate-400 hover:text-white" title="Delete"><Trash2 size={12}/></button>
                                                  </div>
                                              </div>
                                          );
                                      })
                                  )}
                              </>
                          )}
                      </div>
                  )}
              </div>
          </div>

          <div className="flex-1 bg-slate-950 flex flex-col min-w-0 border-l border-slate-800">
              {/* Single File Header */}
              {activeFile ? (
                  <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                          <FileIcon filename={activeFile.name} />
                          <span className="text-sm font-bold text-white">{activeFile.name}</span>
                          {activeFile.isModified && <span className="w-2 h-2 rounded-full bg-yellow-500" title="Unsaved changes"></span>}
                      </div>
                      <div className="flex items-center gap-3">
                          <span className={`text-xs font-mono ${saveStatus === 'saved' ? 'text-emerald-400' : saveStatus === 'saving' ? 'text-indigo-400 animate-pulse' : 'text-slate-500'}`}>
                              {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Auto-saving...' : 'Modified'}
                          </span>
                      </div>
                  </div>
              ) : (
                  <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 text-xs text-slate-500">
                      No file selected
                  </div>
              )}
              
              {activeFile ? (
                  <SimpleEditor code={activeFile.content} onChange={handleCodeChange} />
              ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                      <Code size={48} className="mb-4 opacity-20" />
                      <p className="text-sm">Select a file from the explorer or create a new one.</p>
                      <div className="flex gap-4 mt-4">
                          <button onClick={() => setActiveTab('drive')} className="text-xs text-indigo-400 hover:text-indigo-300">Browse Drive</button>
                          <button onClick={() => setActiveTab('github')} className="text-xs text-indigo-400 hover:text-indigo-300">Browse GitHub</button>
                      </div>
                  </div>
              )}
          </div>
      </div>

      {showImportModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2"><Github size={24} className="text-white"/> Clone Repository</h3>
                      <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                  </div>
                  <div className="space-y-6">
                      <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Public Repository</label>
                          <div className="flex gap-2">
                              <input type="text" placeholder="owner/repo" value={publicRepoPath} onChange={e => setPublicRepoPath(e.target.value)} className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"/>
                              <button onClick={() => handleLoadPublicRepo()} disabled={isLoadingPublic || !publicRepoPath.trim()} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-xs transition-colors border border-slate-700">{isLoadingPublic ? <Loader2 size={14} className="animate-spin"/> : 'Load'}</button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
