import React, { useState, useEffect, useRef } from 'react';
import { CodeProject, CodeFile } from '../types';
import { ArrowLeft, Save, Plus, Github, Cloud, HardDrive, Code, X, ChevronRight, ChevronDown, File, Folder, DownloadCloud, Loader2, CheckCircle, AlertTriangle, Info, FolderPlus, FileCode, RefreshCw, LogIn, CloudUpload, Trash2, ArrowUp, Edit2 } from 'lucide-react';
import { connectGoogleDrive } from '../services/authService';
import { fetchPublicRepoInfo, fetchRepoContents, fetchFileContent } from '../services/githubService';
import { listCloudDirectory, saveProjectToCloud, deleteCloudItem, createCloudFolder, CloudItem } from '../services/firestoreService';
import { ensureCodeStudioFolder, listDriveFiles, readDriveFile, saveToDrive, deleteDriveFile, createDriveFolder, DriveFile } from '../services/googleDriveService';

interface CodeStudioProps {
  onBack: () => void;
  currentUser: any;
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

// Helper Component: File Tree Node
const FileTreeNode: React.FC<{
    node: CodeFile;
    depth: number;
    activeFileIndex: number;
    onSelect: (idx: number) => void;
    onFolderSelect: (folderPath: string) => void;
    expandedFolders: Record<string, boolean>;
    toggleFolder: (path: string) => void;
    loadingFolders: Record<string, boolean>;
    selectedFolder: string | null;
    onSaveNode: (node: CodeFile) => void;
    onDeleteNode: (node: CodeFile) => void;
}> = ({ node, depth, activeFileIndex, onSelect, onFolderSelect, expandedFolders, toggleFolder, loadingFolders, selectedFolder, onSaveNode, onDeleteNode }) => {
    
    // Calculate index if using a flat list or handle selection logic
    // For simplicity in this demo, we assume node object comparison or path matching for selection
    const isSelected = selectedFolder === node.path; // Simplified for folders

    return (
        <div style={{ paddingLeft: `${depth * 12}px` }}>
            <div 
                className={`flex items-center justify-between py-1 px-2 rounded cursor-pointer group hover:bg-slate-800 ${isSelected ? 'bg-slate-800' : ''}`}
                onClick={() => node.isDirectory ? toggleFolder(node.path!) : onSelect(-1)} // -1 placeholder, real impl needs index lookup
            >
                <div className="flex items-center gap-2 overflow-hidden" onClick={() => !node.isDirectory && onSelect(-1)}>
                    {node.isDirectory ? (
                        <>
                            {loadingFolders[node.path!] ? <Loader2 size={12} className="animate-spin text-slate-400"/> : 
                             expandedFolders[node.path!] ? <ChevronDown size={12} className="text-slate-400"/> : <ChevronRight size={12} className="text-slate-400"/>}
                            <Folder size={14} className="text-indigo-400 shrink-0"/>
                        </>
                    ) : (
                        <FileIcon filename={node.name} />
                    )}
                    <span className={`text-xs truncate ${node.isDirectory ? 'text-slate-300 font-bold' : 'text-slate-400'}`}>{node.name.split('/').pop()}</span>
                </div>
            </div>
            {node.isDirectory && expandedFolders[node.path!] && (
                <div>
                    {/* Children would be rendered here if we had a recursive structure passed down. 
                        For this flat file list demo, we are simplifying. 
                        In a real recursive tree, we would map children here. */}
                </div>
            )}
        </div>
    );
};

// Helper Component: Simple Editor
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

export const CodeStudio: React.FC<CodeStudioProps> = ({ onBack, currentUser }) => {
  const [project, setProject] = useState<CodeProject>({ id: 'init', name: 'New Project', files: [], lastModified: Date.now() });
  const [activeFileIndex, setActiveFileIndex] = useState<number>(-1);
  const [activeTab, setActiveTab] = useState<'github' | 'cloud' | 'drive'>('github');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Notification State
  const [notifications, setNotifications] = useState<Array<{id: string, type: 'success' | 'error' | 'info', message: string}>>([]);
  
  // Modal State
  const [modal, setModal] = useState<{
      title: string; 
      message?: string; 
      hasInput?: boolean; 
      inputPlaceholder?: string; 
      inputValue?: string; 
      onConfirm: (val?: string) => void;
      isDestructive?: boolean;
  } | null>(null);
  
  // GitHub State
  const [publicRepoPath, setPublicRepoPath] = useState('');
  const [isLoadingPublic, setIsLoadingPublic] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [loadingFolders, setLoadingFolders] = useState<Record<string, boolean>>({});
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  // Cloud State
  const [cloudFiles, setCloudFiles] = useState<CloudItem[]>([]);
  const [isCloudLoading, setIsCloudLoading] = useState(false);
  const [currentCloudPath, setCurrentCloudPath] = useState('projects');
  const [cloudBreadcrumbs, setCloudBreadcrumbs] = useState<Array<{name: string, path: string}>>([{name: 'Projects', path: 'projects'}]);

  // Drive State
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [currentDriveFolderId, setCurrentDriveFolderId] = useState<string>('');
  const [driveBreadcrumbs, setDriveBreadcrumbs] = useState<Array<{name: string, id: string}>>([]);

  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'modified' | 'saving'>('saved');

  // --- Helper Functions ---

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = crypto.randomUUID();
      setNotifications(prev => [...prev, { id, type, message }]);
      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  };

  const activeFile = activeFileIndex >= 0 ? project.files[activeFileIndex] : null;

  // --- GitHub Logic ---

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
          setActiveFileIndex(-1);
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

  const handleCloseRepo = () => {
      if (confirm("Close repository? Unsaved changes in the workspace will be lost.")) {
          setProject({ id: 'init', name: 'New Project', files: [], lastModified: Date.now() });
          setActiveFileIndex(-1);
          setExpandedFolders({});
      }
  };

  const handleGitHubFileSelect = async (index: number) => {
      // Logic to fetch content if lazy loaded
      const file = project.files[index];
      if (file && !file.isDirectory && !file.loaded && project.github) {
          try {
              const content = await fetchFileContent(null, project.github.owner, project.github.repo, file.path || file.name, project.github.branch);
              const newFiles = [...project.files];
              newFiles[index] = { ...file, content, loaded: true };
              setProject(prev => ({ ...prev, files: newFiles }));
          } catch(e) {
              console.error(e);
              showNotification("Failed to load file content", "error");
          }
      }
      setActiveFileIndex(index);
  };

  // --- Cloud Logic ---

  const fetchCloudFiles = async (path: string) => {
      setIsCloudLoading(true);
      try {
          const files = await listCloudDirectory(path);
          setCloudFiles(files);
      } catch (e) { console.error(e); }
      finally { setIsCloudLoading(false); }
  };

  useEffect(() => {
      if (activeTab === 'cloud') {
          fetchCloudFiles(currentCloudPath);
      }
  }, [activeTab, currentCloudPath]);

  const handleCloudFolderClick = (item: CloudItem) => {
      setCurrentCloudPath(item.fullPath);
      setCloudBreadcrumbs(prev => [...prev, { name: item.name, path: item.fullPath }]);
  };

  const handleCloudBack = () => {
      if (cloudBreadcrumbs.length <= 1) return;
      const newCrumbs = cloudBreadcrumbs.slice(0, -1);
      const prev = newCrumbs[newCrumbs.length - 1];
      setCurrentCloudPath(prev.path);
      setCloudBreadcrumbs(newCrumbs);
  };

  const handleCreateCloudFolder = () => {
      setModal({
          title: 'New Folder',
          hasInput: true,
          inputPlaceholder: 'Folder Name',
          onConfirm: () => {} // Handled by submit handler
      });
  };

  const submitCloudFolderCreate = async (name: string) => {
      if (!name) return;
      try {
          await createCloudFolder(currentCloudPath, name);
          fetchCloudFiles(currentCloudPath);
          setModal(null);
          showNotification("Folder created", "success");
      } catch(e) { showNotification("Failed to create folder", "error"); }
  };

  const handleCreateCloudFileClick = () => {
      setModal({
          title: 'New Cloud File',
          hasInput: true,
          inputPlaceholder: 'filename.js',
          onConfirm: () => {}
      });
  };

  const submitCloudFileCreate = async (name: string) => {
      if (!name) return;
      try {
          await saveProjectToCloud(currentCloudPath, name, "");
          fetchCloudFiles(currentCloudPath);
          setModal(null);
          showNotification("File created", "success");
      } catch(e) { showNotification("Failed to create file", "error"); }
  };

  const handleDeleteCloudItem = async (item: CloudItem) => {
      if (!confirm(`Delete ${item.name}?`)) return;
      try {
          await deleteCloudItem(item);
          fetchCloudFiles(currentCloudPath);
          showNotification("Deleted", "success");
      } catch(e) { showNotification("Failed to delete", "error"); }
  };

  const handleLoadCloudFile = async (item: CloudItem) => {
      if (!item.url) return;
      try {
          const res = await fetch(item.url);
          const text = await res.text();
          // Add to project files
          const newFile: CodeFile = {
              name: item.name,
              language: 'javascript', // Detect logic needed
              content: text,
              loaded: true
          };
          setProject(prev => ({
              ...prev,
              files: [...prev.files, newFile]
          }));
          setActiveFileIndex(project.files.length);
          showNotification("File imported to workspace", "success");
      } catch(e) { showNotification("Failed to load file", "error"); }
  };

  // --- Drive Logic ---

  const handleConnectDrive = async () => {
      try {
          const token = await connectGoogleDrive();
          setDriveToken(token);
          const rootId = await ensureCodeStudioFolder(token);
          setCurrentDriveFolderId(rootId);
          setDriveBreadcrumbs([{ name: 'CodeStudio', id: rootId }]);
          refreshDrive(rootId, token);
      } catch(e: any) {
          showNotification("Drive connection failed: " + e.message, "error");
      }
  };

  const refreshDrive = async (folderId = currentDriveFolderId, token = driveToken) => {
      if (!token) return;
      setIsDriveLoading(true);
      try {
          const files = await listDriveFiles(token, folderId);
          setDriveFiles(files);
      } catch(e) { console.error(e); }
      finally { setIsDriveLoading(false); }
  };

  const handleDriveFolderClick = (id: string, name: string) => {
      setCurrentDriveFolderId(id);
      setDriveBreadcrumbs(prev => [...prev, { name, id }]);
      refreshDrive(id);
  };

  const handleDriveBack = () => {
      if (driveBreadcrumbs.length <= 1) return;
      const newCrumbs = driveBreadcrumbs.slice(0, -1);
      const prev = newCrumbs[newCrumbs.length - 1];
      setCurrentDriveFolderId(prev.id);
      setDriveBreadcrumbs(newCrumbs);
      refreshDrive(prev.id);
  };

  const handleCreateDriveFolder = () => {
      setModal({
          title: 'New Drive Folder',
          hasInput: true,
          inputPlaceholder: 'Folder Name',
          onConfirm: () => {}
      });
  };

  const submitDriveFolderCreate = async (name: string) => {
      if (!name || !driveToken) return;
      try {
          await createDriveFolder(driveToken, currentDriveFolderId, name);
          refreshDrive();
          setModal(null);
          showNotification("Folder created", "success");
      } catch(e) { showNotification("Failed to create folder", "error"); }
  };

  const handleLoadDriveFile = async (id: string, name: string) => {
      if (!driveToken) return;
      try {
          const content = await readDriveFile(driveToken, id);
          const newFile: CodeFile = {
              name,
              language: 'javascript', 
              content,
              loaded: true
          };
          setProject(prev => ({ ...prev, files: [...prev.files, newFile] }));
          setActiveFileIndex(project.files.length);
          showNotification("File imported from Drive", "success");
      } catch(e) { showNotification("Failed to read file", "error"); }
  };

  const handleDeleteDriveFile = async (id: string) => {
      if (!driveToken || !confirm("Delete file from Drive?")) return;
      try {
          await deleteDriveFile(driveToken, id);
          refreshDrive();
          showNotification("Deleted", "success");
      } catch(e) { showNotification("Failed to delete", "error"); }
  };

  const handleSaveActiveFileToDrive = async () => {
      if (!activeFile || !driveToken) return;
      try {
          await saveToDrive(driveToken, currentDriveFolderId, activeFile.name, activeFile.content);
          refreshDrive();
          showNotification("Saved to Drive", "success");
      } catch(e) { showNotification("Save failed", "error"); }
  };

  // --- Editor Logic ---

  const handleCodeChange = (val: string) => {
      if (activeFileIndex < 0) return;
      const newFiles = [...project.files];
      newFiles[activeFileIndex] = { ...newFiles[activeFileIndex], content: val, isModified: true };
      setProject(prev => ({ ...prev, files: newFiles }));
      setSaveStatus('modified');
  };

  const handleGeneralSave = () => {
      // If connected to Cloud or Drive, we could sync. 
      // For GitHub, we can't easily push without more complex auth flows (PAT usually).
      // So "Save Project" here acts as a local acknowledgement or could trigger cloud sync if configured.
      setSaveStatus('saved');
      showNotification("Project saved locally", "success");
  };

  const handleAddFile = (langId: string) => {
      const name = `new_file.${langId === 'javascript' ? 'js' : langId === 'python' ? 'py' : 'txt'}`;
      const newFile: CodeFile = { name, language: langId as any, content: '', loaded: true };
      setProject(prev => ({ ...prev, files: [...prev.files, newFile] }));
      setActiveFileIndex(project.files.length);
      setShowLanguageDropdown(false);
  };

  // Tree Logic Stubs
  const toggleFolder = (path: string) => {
      setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
  };
  const handleSaveNode = () => {};
  const handleDeleteNode = () => {};

  // Construct flat list for FileTree visualization in this simple implementation
  // In a real app, this would be recursive
  const fileTree = project.files; 

  const handleModalSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!modal) return;
      // @ts-ignore
      const input = e.target.inputVal?.value;
      if (modal.title === 'New Folder') submitCloudFolderCreate(input);
      else if (modal.title === 'New Drive Folder') submitDriveFolderCreate(input);
      else if (modal.title === 'New Cloud File') submitCloudFileCreate(input);
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
                          <button onClick={() => modal.onConfirm()} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 ${modal.isDestructive ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}>
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
                   <Save size={14} /> <span>Save Project</span>
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
                                  <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-slate-800/50">
                                      <div className="flex items-center gap-2 overflow-hidden">
                                          <Github size={14} className="text-slate-500 shrink-0"/>
                                          <span className="text-xs font-bold text-slate-300 truncate" title={project.github.repo}>
                                              {project.github.repo}
                                          </span>
                                      </div>
                                      <button 
                                          onClick={handleCloseRepo}
                                          className="p-1.5 hover:bg-red-900/30 text-slate-500 hover:text-red-400 rounded transition-colors"
                                          title="Close Repository / Change Repo"
                                      >
                                          <X size={14} />
                                      </button>
                                  </div>
                                  {fileTree.map((node, i) => (
                                      // Using simple click for flat list logic for demonstration
                                      <div key={i} onClick={() => handleGitHubFileSelect(i)} className={`p-2 hover:bg-slate-800 rounded cursor-pointer ${activeFileIndex === i ? 'bg-slate-800' : ''}`}>
                                          <div className="flex items-center gap-2">
                                              <FileIcon filename={node.name} />
                                              <span className="text-xs text-slate-300">{node.name}</span>
                                          </div>
                                      </div>
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
                                       className={`flex items-center justify-between p-2 hover:bg-slate-800 rounded group cursor-pointer`}
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
                                              <button onClick={() => refreshDrive()} className="p-1 hover:bg-slate-700 rounded text-slate-400"><RefreshCw size={12}/></button>
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