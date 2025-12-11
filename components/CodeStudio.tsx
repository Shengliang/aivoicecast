
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';
import { ArrowLeft, Save, Folder, File, Code, Plus, Trash2, Loader2, ChevronRight, ChevronDown, X, MessageSquare, FileCode, FileJson, FileType, Search, Coffee, Hash, CloudUpload, Edit3, BookOpen, Bot, Send, Maximize2, Minimize2, GripVertical, UserCheck, AlertTriangle, Archive, Sparkles, Video, Mic, CheckCircle, Monitor, FileText, Eye, Github, GitBranch, GitCommit, FolderOpen, RefreshCw, GraduationCap, DownloadCloud, Terminal, Undo2, Check, Share2, Copy, Lock, Link, Image as ImageIcon, Users, UserPlus, ShieldAlert, Crown, Bug, ChevronUp, Zap, Expand, Shrink, Edit2, History, Cloud, HardDrive, LogIn } from 'lucide-react';
import { GEMINI_API_KEY } from '../services/private_keys';
import { CodeProject, CodeFile, ChatMessage, Channel, GithubMetadata, CursorPosition } from '../types';
import { MarkdownView } from './MarkdownView';
import { saveCodeProject, subscribeToCodeProject, updateCodeFile, deleteCodeFile, updateCursor, claimCodeProjectLock, requestEditAccess, grantEditAccess, denyEditAccess, saveProjectToStorage, getProjectsFromStorage, deleteProjectFromStorage } from '../services/firestoreService';
import { signInWithGitHub, reauthenticateWithGitHub, connectGoogleDrive } from '../services/authService';
import { fetchUserRepos, fetchRepoContents, commitToRepo, fetchPublicRepoInfo, fetchFileContent, fetchRepoSubTree, fetchRepoCommits } from '../services/githubService';
import { LiveSession } from './LiveSession';
import { encodePlantUML } from '../utils/plantuml';
import { ensureCodeStudioFolder, listDriveFiles, readDriveFile, saveToDrive, deleteDriveFile, DriveFile } from '../services/googleDriveService';

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
    if (ext === 'md') return <FileText size={14} className="text-gray-400" />;
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
        
        {node.isModified && !node.type /* Yellow dot fallback if buttons hidden */ && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 ml-1"></span>}
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

export const CodeStudio: React.FC<CodeStudioProps> = ({ onBack, currentUser, sessionId, accessKey, onSessionStart }) => {
  const [project, setProject] = useState<CodeProject>({ id: 'init', name: 'New Project', files: [], lastModified: Date.now() });
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [loadingFolders, setLoadingFolders] = useState<Record<string, boolean>>({});
  
  // Selection
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  // STORAGE TABS
  const [activeTab, setActiveTab] = useState<'session' | 'github' | 'cloud' | 'drive'>('session');
  
  // Cloud (Firebase) State
  const [cloudFiles, setCloudFiles] = useState<any[]>([]);
  const [isCloudLoading, setIsCloudLoading] = useState(false);

  // Drive State
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null);

  // Modals & UI
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false); // For Github Clone
  const [publicRepoPath, setPublicRepoPath] = useState('');
  const [isLoadingPublic, setIsLoadingPublic] = useState(false);
  
  const activeFile = project.files[activeFileIndex];
  
  const fileTree = React.useMemo(() => buildFileTree(project.files, expandedFolders), [project.files, expandedFolders]);

  // --- TAB HANDLERS ---

  useEffect(() => {
      if (activeTab === 'cloud' && currentUser) {
          fetchCloudFiles();
      }
      if (activeTab === 'drive' && driveToken && !driveFiles.length) {
          refreshDrive();
      }
  }, [activeTab, currentUser]);

  const fetchCloudFiles = async () => {
      setIsCloudLoading(true);
      try {
          const files = await getProjectsFromStorage(currentUser.uid);
          setCloudFiles(files);
      } catch(e) {
          console.error(e);
      } finally {
          setIsCloudLoading(false);
      }
  };

  const handleConnectDrive = async () => {
      try {
          const token = await connectGoogleDrive();
          setDriveToken(token);
          await initDrive(token);
      } catch (e: any) {
          console.error("Drive Auth Failed:", e);
          alert("Failed to connect Drive: " + e.message);
      }
  };

  const initDrive = async (token: string) => {
      setIsDriveLoading(true);
      try {
          const folderId = await ensureCodeStudioFolder(token);
          setDriveFolderId(folderId);
          const files = await listDriveFiles(token, folderId);
          setDriveFiles(files);
      } catch(e: any) {
          console.error("Drive Init Failed:", e);
          alert("Drive Error: " + e.message);
      } finally {
          setIsDriveLoading(false);
      }
  };

  const refreshDrive = async () => {
      if (!driveToken || !driveFolderId) return;
      setIsDriveLoading(true);
      try {
          const files = await listDriveFiles(driveToken, driveFolderId);
          setDriveFiles(files);
      } catch(e) { console.error(e); } finally { setIsDriveLoading(false); }
  };

  // --- FILE OPERATIONS ---

  const handleLoadCloudFile = async (file: any) => {
      // 1. Handle Placeholder
      if (file.name === 'README_EMPTY.md' || file.fileName === 'README_EMPTY.md') {
          alert("This is a placeholder file indicating the folder is empty. Create and save a new project to overwrite it.");
          return;
      }

      if (!confirm("Load this file? If it is a project, current session will be replaced.")) return;
      
      setIsCloudLoading(true);
      try {
          const res = await fetch(file.url);
          if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
          
          const text = await res.text();
          let isProject = false;

          try {
              const data = JSON.parse(text);
              // Basic check if it follows CodeProject shape
              if (data.files && Array.isArray(data.files)) {
                  setProject(data);
                  setActiveFileIndex(0);
                  setExpandedFolders({});
                  setActiveTab('session'); // Switch back to session view
                  isProject = true;
              }
          } catch(e) {
              // Parse error means it's likely raw code/text
          }

          if (!isProject) {
              // Treat as importing a single file source code
              const newFile: CodeFile = {
                  name: file.name, // Use original name from metadata
                  language: getLanguageFromFilename(file.name) as any,
                  content: text,
                  loaded: true,
                  isModified: true
              };
              setProject(prev => ({ ...prev, files: [...prev.files, newFile] }));
              setActiveFileIndex(project.files.length);
              setActiveTab('session');
          }

      } catch(e: any) {
          console.error("Cloud Load Error:", e);
          alert("Failed to load file. (CORS might be blocking direct download). " + e.message);
      } finally {
          setIsCloudLoading(false);
      }
  };

  const handleLoadDriveFile = async (fileId: string, filename: string) => {
      if (!driveToken) return;
      if (!confirm(`Load "${filename}" from Google Drive? This will add it to your current project.`)) return;
      
      setIsDriveLoading(true);
      try {
          const text = await readDriveFile(driveToken, fileId);
          
          // Check if it's a project json just in case, though we prefer raw files now
          try {
              const data = JSON.parse(text);
              if (data.files && Array.isArray(data.files) && confirm("This looks like a full CodeProject JSON. Replace entire session?")) {
                  setProject(data);
                  setActiveFileIndex(0);
                  setExpandedFolders({});
                  setActiveTab('session');
                  return;
              }
          } catch (e) {
              // Not a project JSON, treat as raw file
          }
          
          // Add as new file
          const newFile: CodeFile = {
              name: filename,
              language: getLanguageFromFilename(filename) as any,
              content: text,
              loaded: true,
              isModified: true
          };
          
          // Check if file already exists in project, if so, update content
          const existingIdx = project.files.findIndex(f => f.name === filename);
          if (existingIdx >= 0) {
              const updatedFiles = [...project.files];
              updatedFiles[existingIdx] = newFile;
              setProject(prev => ({ ...prev, files: updatedFiles }));
              setActiveFileIndex(existingIdx);
          } else {
              setProject(prev => ({ ...prev, files: [...prev.files, newFile] }));
              setActiveFileIndex(project.files.length);
          }
          
          setActiveTab('session');

      } catch(e: any) {
          console.error("Drive Load Error:", e);
          alert("Failed to read Drive file: " + e.message);
      } finally {
          setIsDriveLoading(false);
      }
  };

  const handleSaveToCloud = async () => {
      if (!currentUser) return;
      setIsCloudLoading(true);
      try {
          await saveProjectToStorage(currentUser.uid, project);
          await fetchCloudFiles(); // Refresh list
          alert("Saved to Firebase Cloud Storage!");
      } catch(e: any) {
          console.error("Cloud Save Error:", e);
          alert("Save failed: " + e.message);
      } finally {
          setIsCloudLoading(false);
      }
  };

  // Helper to save a list of files to drive
  const saveFilesToDrive = async (filesToSave: CodeFile[]) => {
      if (!driveToken || !driveFolderId) {
          alert("Please connect to Google Drive first.");
          return;
      }
      
      setIsDriveLoading(true);
      try {
          const savedNames: string[] = [];
          
          for (const file of filesToSave) {
              if (file.isDirectory) continue;
              
              const mimeType = getMimeTypeFromFilename(file.name);
              await saveToDrive(driveToken, driveFolderId, file.name, file.content, mimeType);
              savedNames.push(file.name);
          }
          
          // Update local state to remove modified flag for saved files
          setProject(prev => ({
              ...prev,
              files: prev.files.map(f => savedNames.includes(f.name) ? { ...f, isModified: false } : f)
          }));
          
          await refreshDrive();
      } catch(e: any) {
          console.error("Drive Save Error:", e);
          alert("Drive save failed: " + e.message);
      } finally {
          setIsDriveLoading(false);
      }
  };

  const handleSaveToDrive = async () => {
      // Save ONLY modified files to optimize
      const modifiedFiles = project.files.filter(f => f.isModified && !f.isDirectory);
      if (modifiedFiles.length === 0) return;
      
      await saveFilesToDrive(modifiedFiles);
  };

  const handleDeleteDriveFile = async (fileId: string) => {
      if (!driveToken) return;
      if (!confirm("Are you sure you want to delete this file from Google Drive?")) return;
      
      setIsDriveLoading(true);
      try {
          await deleteDriveFile(driveToken, fileId);
          await refreshDrive();
      } catch(e: any) {
          console.error("Drive Delete Failed:", e);
          alert("Failed to delete: " + e.message);
      } finally {
          setIsDriveLoading(false);
      }
  };

  const handleGeneralSave = () => {
      // Logic to decide where to save based on context
      if (activeTab === 'drive' && driveToken) {
          handleSaveToDrive();
      } else if (activeTab === 'cloud' && currentUser) {
          handleSaveToCloud();
      } else {
          // Default logic
          if (driveToken) {
              // Drive: Silent save (status update only)
              handleSaveToDrive(); 
          } else if (currentUser) {
              if (confirm("Save to Cloud Storage?")) handleSaveToCloud();
          } else {
              alert("Sign in or Connect Drive to save your project.");
          }
      }
  };

  // Node Actions (Explorer)
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
      if (!confirm(`Delete ${node.type === 'folder' ? 'folder and its contents' : 'file'} "${node.name}" from workspace?`)) return;
      
      let newFiles: CodeFile[] = [];
      if (node.type === 'folder') {
          newFiles = project.files.filter(f => !f.name.startsWith(node.path + '/'));
      } else {
          newFiles = project.files.filter((_, i) => i !== node.index);
      }
      
      setProject(prev => ({ ...prev, files: newFiles }));
      // Adjust active index
      if (activeFileIndex >= newFiles.length) setActiveFileIndex(Math.max(0, newFiles.length - 1));
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
          setActiveTab('session');
      } catch (e: any) { 
          alert("Failed: " + e.message); 
      } finally { 
          setIsLoadingPublic(false); 
      }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header */}
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
               <button onClick={handleGeneralSave} className="flex items-center space-x-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors shadow-md">
                   {isDriveLoading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} <span>Save Project</span>
               </button>

               <div className="relative">
                    <button onClick={() => setShowLanguageDropdown(!showLanguageDropdown)} className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors border border-slate-700">
                        <Plus size={14} /> <span>New File</span>
                    </button>
                    {showLanguageDropdown && (
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
          {/* Sidebar */}
          <div className={`${isSidebarOpen ? 'w-72' : 'w-0'} bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300`}>
              
              {/* Sidebar Tabs */}
              <div className="flex border-b border-slate-800 bg-slate-950/50">
                  <button onClick={() => setActiveTab('session')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'session' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`} title="Current Session"><FolderOpen size={18}/></button>
                  <button onClick={() => setActiveTab('github')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'github' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`} title="GitHub"><Github size={18}/></button>
                  <button onClick={() => setActiveTab('cloud')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'cloud' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`} title="Cloud Storage"><Cloud size={18}/></button>
                  <button onClick={() => setActiveTab('drive')} className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === 'drive' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`} title="Google Drive"><HardDrive size={18}/></button>
              </div>

              {/* Sidebar Content */}
              <div className="flex-1 overflow-y-auto">
                  
                  {/* TAB 1: SESSION */}
                  {activeTab === 'session' && (
                      <div className="p-2 space-y-0.5">
                          {fileTree.map(node => (
                              <FileTreeNode 
                                  key={node.path}
                                  node={node}
                                  depth={0}
                                  activeFileIndex={activeFileIndex}
                                  onSelect={setActiveFileIndex}
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
                  )}

                  {/* TAB 2: GITHUB */}
                  {activeTab === 'github' && (
                      <div className="p-4 space-y-4">
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

                  {/* TAB 3: CLOUD */}
                  {activeTab === 'cloud' && (
                      <div className="p-2">
                          <div className="px-2 mb-2 flex justify-between items-center">
                              <span className="text-xs font-bold text-slate-500 uppercase">Cloud Files</span>
                              <button onClick={fetchCloudFiles} className="p-1 hover:bg-slate-700 rounded text-slate-400"><RefreshCw size={12}/></button>
                          </div>
                          {isCloudLoading ? (
                              <div className="py-8 text-center text-indigo-400"><Loader2 className="animate-spin mx-auto"/></div>
                          ) : cloudFiles.length === 0 ? (
                              <div className="p-4 text-center text-slate-500 text-xs italic">No cloud files found.</div>
                          ) : (
                              cloudFiles.map((file) => (
                                  <div key={file.fullPath} className="flex items-center justify-between p-2 hover:bg-slate-800 rounded group">
                                      <div className="flex items-center gap-2 overflow-hidden">
                                          <FileCode size={14} className="text-indigo-400 shrink-0"/>
                                          <span className="text-xs text-slate-300 truncate" title={file.name}>{file.name}</span>
                                      </div>
                                      <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                                          <button onClick={() => handleLoadCloudFile(file)} className="p-1 hover:bg-indigo-600 rounded text-slate-400 hover:text-white" title="Import"><DownloadCloud size={12}/></button>
                                          <button onClick={async () => {
                                              if(!confirm("Delete?")) return;
                                              setIsCloudLoading(true);
                                              await deleteProjectFromStorage(file.fullPath);
                                              await fetchCloudFiles();
                                          }} className="p-1 hover:bg-red-600 rounded text-slate-400 hover:text-white" title="Delete"><Trash2 size={12}/></button>
                                      </div>
                                  </div>
                              ))
                          )}
                      </div>
                  )}

                  {/* TAB 4: DRIVE */}
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
                                  <div className="px-2 mb-2 flex justify-between items-center">
                                      <span className="text-xs font-bold text-slate-500 uppercase">Drive Files</span>
                                      <button onClick={refreshDrive} className="p-1 hover:bg-slate-700 rounded text-slate-400"><RefreshCw size={12}/></button>
                                  </div>
                                  {isDriveLoading ? (
                                      <div className="py-8 text-center text-indigo-400"><Loader2 className="animate-spin mx-auto"/></div>
                                  ) : driveFiles.length === 0 ? (
                                      <div className="p-4 text-center text-slate-500 text-xs italic">Folder 'codestudio' is empty.</div>
                                  ) : (
                                      driveFiles.map((file) => (
                                          <div key={file.id} className="flex items-center justify-between p-2 hover:bg-slate-800 rounded group">
                                              <div className="flex items-center gap-2 overflow-hidden">
                                                  <FileCode size={14} className="text-green-400 shrink-0"/>
                                                  <span className="text-xs text-slate-300 truncate" title={file.name}>{file.name}</span>
                                              </div>
                                              <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                                                  <button onClick={() => handleLoadDriveFile(file.id, file.name)} className="p-1 hover:bg-indigo-600 rounded text-slate-400 hover:text-white" title="Import"><DownloadCloud size={12}/></button>
                                                  <button onClick={() => handleDeleteDriveFile(file.id)} className="p-1 hover:bg-red-600 rounded text-slate-400 hover:text-white" title="Delete"><Trash2 size={12}/></button>
                                              </div>
                                          </div>
                                      ))
                                  )}
                              </>
                          )}
                      </div>
                  )}
              </div>
          </div>

          {/* Editor Area */}
          <div className="flex-1 bg-slate-950 flex flex-col min-w-0">
              {activeFile && (
                  <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center gap-2">
                      <FileIcon filename={activeFile.name} />
                      <span className="text-sm text-slate-300">{activeFile.name}</span>
                      {activeFile.isModified && <div className="w-2 h-2 bg-yellow-500 rounded-full ml-2"></div>}
                  </div>
              )}
              
              {activeFile ? (
                  <SimpleEditor code={activeFile.content} onChange={handleCodeChange} />
              ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                      <Code size={48} className="mb-4 opacity-20" />
                      <p>Select a file to edit</p>
                  </div>
              )}
          </div>
      </div>

      {/* Git Import Modal */}
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
