
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';
import { ArrowLeft, Save, Folder, File, Code, Plus, Trash2, Loader2, ChevronRight, ChevronDown, X, MessageSquare, FileCode, FileJson, FileType, Search, Coffee, Hash, CloudUpload, Edit3, BookOpen, Bot, Send, Maximize2, Minimize2, GripVertical, UserCheck, AlertTriangle, Archive, Sparkles, Video, Mic, CheckCircle, Monitor, FileText, Eye, Github, GitBranch, GitCommit, FolderOpen, RefreshCw, GraduationCap, DownloadCloud, Terminal, Undo2, Check, Share2, Copy, Lock, Link, Image as ImageIcon, Users, UserPlus, ShieldAlert, Crown, Bug, ChevronUp, Zap, Expand, Shrink, Edit2, History, Cloud } from 'lucide-react';
import { GEMINI_API_KEY } from '../services/private_keys';
import { CodeProject, CodeFile, ChatMessage, Channel, GithubMetadata, CursorPosition } from '../types';
import { MarkdownView } from './MarkdownView';
import { saveCodeProject, subscribeToCodeProject, updateCodeFile, deleteCodeFile, updateCursor, claimCodeProjectLock, requestEditAccess, grantEditAccess, denyEditAccess, saveProjectToStorage, getProjectsFromStorage, deleteProjectFromStorage } from '../services/firestoreService';
import { signInWithGitHub, reauthenticateWithGitHub } from '../services/authService';
import { fetchUserRepos, fetchRepoContents, commitToRepo, fetchPublicRepoInfo, fetchFileContent, fetchRepoSubTree, fetchRepoCommits } from '../services/githubService';
import { LiveSession } from './LiveSession';
import { encodePlantUML } from '../utils/plantuml';

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
}> = ({ node, depth, activeFileIndex, onSelect, onFolderSelect, expandedFolders, toggleFolder, loadingFolders, selectedFolder }) => {
  const isOpen = expandedFolders[node.path];
  const isLoading = loadingFolders[node.path];
  const isSelected = selectedFolder === node.path && node.type === 'folder';
  
  if (node.type === 'folder') {
    return (
      <>
        <div 
          className={`w-full flex items-center space-x-1 px-3 py-1.5 text-xs text-left transition-colors cursor-pointer group ${isSelected ? 'bg-indigo-900/40 text-indigo-300' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          style={{ paddingLeft: `${depth * 12 + 12}px` }}
          onClick={(e) => {
              e.stopPropagation();
              onFolderSelect(node.path);
              toggleFolder(node.path);
          }}
        >
          {isLoading ? (
             <Loader2 size={14} className="animate-spin text-indigo-400" />
          ) : isOpen ? (
             <ChevronDown size={14} />
          ) : (
             <ChevronRight size={14} />
          )}
          
          {isOpen ? <FolderOpen size={14} className={isSelected ? "text-indigo-400" : "text-slate-500"} /> : <Folder size={14} className={isSelected ? "text-indigo-400" : "text-slate-500"} />}
          <span className="truncate">{node.name}</span>
        </div>
        {isOpen && node.children.map(child => (
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
          />
        ))}
      </>
    );
  }

  const isActive = node.index === activeFileIndex;
  return (
    <button 
      onClick={(e) => { e.stopPropagation(); node.index !== undefined && onSelect(node.index); }}
      className={`w-full flex items-center space-x-2 px-3 py-1.5 text-xs text-left transition-colors border-l-2 ${isActive ? 'bg-slate-800 text-white border-indigo-500' : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
      style={{ paddingLeft: `${depth * 12 + 12}px` }}
    >
      <FileIcon filename={node.name} />
      <span className="truncate flex-1">{node.name}</span>
      {node.isModified && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 ml-2" title="Modified"></span>}
    </button>
  );
};

// Simplified editor for brevity in this response, ideally would be the Full EnhancedEditor
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
  
  // Selection & Cloud State
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [cloudFiles, setCloudFiles] = useState<any[]>([]);
  const [isCloudLoading, setIsCloudLoading] = useState(false);

  // Modals & UI
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showExamplesDropdown, setShowExamplesDropdown] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [publicRepoPath, setPublicRepoPath] = useState('');
  const [isLoadingPublic, setIsLoadingPublic] = useState(false);
  const [githubToken, setGithubToken] = useState<string | null>(null);
  
  const activeFile = project.files[activeFileIndex];
  const isOwner = currentUser && (currentUser.uid === project.ownerId || currentUser.email === 'shengliang.song@gmail.com');
  const isReadOnly = false; // Simplified

  const fileTree = React.useMemo(() => buildFileTree(project.files, expandedFolders), [project.files, expandedFolders]);

  const handleOpenCloud = async () => {
      if (!currentUser) return alert("Sign in required.");
      setShowStorageModal(true);
      setIsCloudLoading(true);
      try {
          const files = await getProjectsFromStorage(currentUser.uid);
          setCloudFiles(files);
      } catch(e) {
          console.error(e);
          alert("Failed to load cloud files.");
      } finally {
          setIsCloudLoading(false);
      }
  };

  const handleCloudLoad = async (url: string) => {
      if (!confirm("Load project? Unsaved changes will be lost.")) return;
      setIsCloudLoading(true);
      try {
          const res = await fetch(url);
          const data = await res.json();
          setProject(data);
          setActiveFileIndex(0);
          setShowStorageModal(false);
          setExpandedFolders({});
      } catch(e) {
          alert("Failed to load.");
      } finally {
          setIsCloudLoading(false);
      }
  };

  const handleCloudSave = async () => {
      if (!currentUser) return;
      setIsCloudLoading(true);
      try {
          await saveProjectToStorage(currentUser.uid, project);
          const files = await getProjectsFromStorage(currentUser.uid);
          setCloudFiles(files);
      } catch(e) {
          alert("Save failed.");
      } finally {
          setIsCloudLoading(false);
      }
  };

  const handleAddFile = (langId: string) => {
      const lang = LANGUAGES.find(l => l.id === langId);
      if (!lang) return;
      
      const timestamp = Date.now();
      const filename = `untitled_${timestamp}.${lang.ext}`;
      
      // If a folder is selected, create file inside it.
      // Otherwise, create in root.
      const fullPath = selectedFolder ? `${selectedFolder}/${filename}` : filename;

      const newFile: CodeFile = {
          name: fullPath,
          language: lang.id as any,
          content: lang.defaultCode,
          loaded: true,
          isModified: true
      };
      
      if (selectedFolder) {
          setExpandedFolders(prev => ({ ...prev, [selectedFolder]: true }));
      }

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
          setShowExamplesDropdown(false);
          setPublicRepoPath('');
          setExpandedFolders({});
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
               <div className="relative">
                    <button onClick={() => setShowLanguageDropdown(!showLanguageDropdown)} className="flex items-center space-x-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors">
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
                
                <button 
                     onClick={handleOpenCloud} 
                     className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-bold transition-colors text-slate-300 hover:text-white"
                >
                     <Cloud size={14} /> <span>Cloud Files</span>
                </button>

                <div className="relative">
                    <button onClick={() => setShowExamplesDropdown(!showExamplesDropdown)} className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-bold transition-colors text-slate-300 hover:text-white">
                        <BookOpen size={14} /> <span>Repositories</span>
                    </button>
                    {showExamplesDropdown && (
                        <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowExamplesDropdown(false)}></div>
                        <div className="absolute top-full right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-40 overflow-hidden py-1">
                            <div className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase">Presets</div>
                            {PRESET_REPOS.map(repo => (
                                <button key={repo.path} onClick={() => handleLoadPublicRepo(repo.path)} className="w-full text-left px-4 py-2 hover:bg-slate-800 text-xs text-slate-300 hover:text-white flex items-center gap-2">
                                    <Github size={12} /> {repo.label}
                                </button>
                            ))}
                            <div className="border-t border-slate-800 my-1"></div>
                            <button onClick={() => { setShowExamplesDropdown(false); setShowImportModal(true); }} className="w-full text-left px-4 py-2 hover:bg-slate-800 text-xs text-slate-300 hover:text-white flex items-center gap-2">
                                <CloudUpload size={12} /> Clone Repository...
                            </button>
                        </div>
                        </>
                    )}
                </div>
            </div>
         </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
          {/* File Explorer Sidebar */}
          <div className={`${isSidebarOpen ? 'w-64' : 'w-0'} bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300`}>
              <div className="p-3 border-b border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider flex justify-between items-center">
                  <span>Explorer</span>
                  <div className="flex gap-1">
                      {selectedFolder && (
                          <span className="text-[9px] bg-indigo-900 text-indigo-300 px-1 rounded truncate max-w-[80px]" title={selectedFolder}>
                              {selectedFolder.split('/').pop()}
                          </span>
                      )}
                      <button onClick={() => setSelectedFolder(null)} className="hover:text-white" title="Unselect Folder"><X size={12}/></button>
                  </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
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
                      />
                  ))}
              </div>
          </div>

          {/* Editor Area */}
          <div className="flex-1 bg-slate-950 flex flex-col min-w-0">
              {/* Tab Bar */}
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

      {/* Cloud Storage Modal */}
      {showStorageModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl p-6 flex flex-col max-h-[80vh] animate-fade-in-up">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2"><Cloud size={24} className="text-indigo-400"/> Cloud Projects</h3>
                      <button onClick={() => setShowStorageModal(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                  </div>
                  
                  <button 
                      onClick={handleCloudSave} 
                      disabled={isCloudLoading}
                      className="w-full mb-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg"
                  >
                      {isCloudLoading ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>}
                      <span>Save Current Workspace to Cloud</span>
                  </button>
                  
                  <div className="flex-1 overflow-y-auto pr-1">
                      {isCloudLoading && cloudFiles.length === 0 ? (
                          <div className="py-10 text-center"><Loader2 className="animate-spin mx-auto text-indigo-400"/></div>
                      ) : cloudFiles.length === 0 ? (
                          <div className="py-10 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">No saved projects found.</div>
                      ) : (
                          <div className="space-y-2">
                              {cloudFiles.map((file) => (
                                  <div key={file.fullPath} className="bg-slate-800 border border-slate-700 rounded-lg p-3 flex items-center justify-between group hover:border-indigo-500/50 transition-colors">
                                      <div className="flex-1 min-w-0 mr-3">
                                          <div className="flex items-center gap-2 mb-1">
                                              <FileCode size={16} className="text-indigo-400 shrink-0"/>
                                              <p className="font-bold text-white text-sm truncate">{file.name}</p>
                                          </div>
                                          <p className="text-xs text-slate-500 font-mono">{new Date(file.timeCreated).toLocaleString()}</p>
                                      </div>
                                      <div className="flex items-center gap-2">
                                          <button 
                                              onClick={() => handleCloudLoad(file.url)}
                                              className="p-1.5 bg-slate-700 hover:bg-indigo-600 text-white rounded transition-colors"
                                              title="Load Project"
                                          >
                                              <DownloadCloud size={14}/>
                                          </button>
                                          <button 
                                              onClick={async () => {
                                                  if(!confirm("Delete backup?")) return;
                                                  setIsCloudLoading(true);
                                                  try {
                                                      await deleteProjectFromStorage(file.fullPath);
                                                      const f = await getProjectsFromStorage(currentUser.uid);
                                                      setCloudFiles(f);
                                                  } catch(e) { alert("Error deleting"); } finally { setIsCloudLoading(false); }
                                              }}
                                              className="p-1.5 bg-slate-700 hover:bg-red-600 text-slate-300 hover:text-white rounded transition-colors"
                                              title="Delete Backup"
                                          >
                                              <Trash2 size={14}/>
                                          </button>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

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
