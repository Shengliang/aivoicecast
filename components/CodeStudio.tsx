
import React, { useState, useEffect } from 'react';
import { CodeProject, CodeFile } from '../types';
import { saveCodeProject, subscribeToCodeProject, getUserCodeProjects } from '../services/firestoreService';
import { fetchUserRepos, fetchRepoContents, fetchFileContent, commitToRepo } from '../services/githubService';
import { ArrowLeft, Save, Share2, Github, Loader2, FileCode, Folder, FolderOpen, Plus, RefreshCw, Terminal, Play } from 'lucide-react';

interface CodeStudioProps {
  onBack: () => void;
  currentUser: any;
  sessionId?: string;
}

export const CodeStudio: React.FC<CodeStudioProps> = ({ onBack, currentUser, sessionId }) => {
  const [projects, setProjects] = useState<CodeProject[]>([]);
  const [activeProject, setActiveProject] = useState<CodeProject | null>(null);
  const [activeFile, setActiveFile] = useState<CodeFile | null>(null);
  
  // Loading States
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // GitHub State
  const [githubToken, setGithubToken] = useState<string>(''); // In a real app, manage this via auth
  const [repos, setRepos] = useState<any[]>([]);
  const [showRepoList, setShowRepoList] = useState(false);

  // Sharing
  const [isSharedSession, setIsSharedSession] = useState(!!sessionId);

  useEffect(() => {
    if (sessionId) {
      // Subscribe to shared session
      setIsLoading(true);
      const unsubscribe = subscribeToCodeProject(sessionId, (project) => {
        setActiveProject(project);
        if (!activeFile && project.files.length > 0) {
            setActiveFile(project.files[0]);
        }
        setIsLoading(false);
        setIsSharedSession(true);
      });
      return () => unsubscribe();
    } else if (currentUser) {
      // Load user projects
      loadUserProjects();
    }
  }, [sessionId, currentUser]);

  const loadUserProjects = async () => {
      if (!currentUser) return;
      setIsLoading(true);
      try {
          const userProjects = await getUserCodeProjects(currentUser.uid);
          setProjects(userProjects);
      } catch(e) {
          console.error(e);
      } finally {
          setIsLoading(false);
      }
  };

  const handleCreateProject = () => {
      const newProject: CodeProject = {
          id: crypto.randomUUID(),
          name: "New Project",
          files: [
              { name: "main.js", language: "javascript", content: "// Start coding...", loaded: true }
          ],
          lastModified: Date.now(),
          ownerId: currentUser?.uid
      };
      setActiveProject(newProject);
      setActiveFile(newProject.files[0]);
  };

  const handleFileSelect = async (file: CodeFile) => {
      if (!file.loaded && activeProject?.github) {
          // Lazy load content from GitHub
          try {
              const content = await fetchFileContent(githubToken || null, activeProject.github.owner, activeProject.github.repo, file.path || file.name, activeProject.github.branch);
              const updatedFile = { ...file, content, loaded: true };
              const updatedFiles = activeProject.files.map(f => f.path === file.path ? updatedFile : f);
              
              const updatedProject = { ...activeProject, files: updatedFiles };
              setActiveProject(updatedProject);
              setActiveFile(updatedFile);
          } catch(e) {
              alert("Failed to load file content.");
          }
      } else {
          setActiveFile(file);
      }
  };

  const handleCodeChange = (newContent: string) => {
      if (!activeProject || !activeFile) return;
      const updatedFiles = activeProject.files.map(f => 
          f.name === activeFile.name ? { ...f, content: newContent } : f
      );
      setActiveProject({ ...activeProject, files: updatedFiles });
      setActiveFile({ ...activeFile, content: newContent });
  };

  const handleSave = async () => {
      if (!activeProject || !currentUser) return;
      setIsSaving(true);
      try {
          await saveCodeProject(activeProject);
          if (!sessionId) {
              // If it was a new local project, refresh list
              loadUserProjects();
          }
      } catch(e) {
          console.error(e);
          alert("Failed to save project.");
      } finally {
          setIsSaving(false);
      }
  };

  const handleShare = async () => {
      if (!activeProject || !currentUser) return;
      setIsSaving(true);
      try {
          // Attempt to save current project
          let projectToSave = { ...activeProject };
          if (!projectToSave.ownerId) projectToSave.ownerId = currentUser.uid;
          
          try {
             await saveCodeProject(projectToSave);
          } catch (err: any) {
             // If permission denied (likely editing someone else's project or template), clone it
             if (err.code === 'permission-denied' || err.message?.includes('permission')) {
                 projectToSave = {
                     ...projectToSave,
                     id: crypto.randomUUID(), // New ID for fork
                     ownerId: currentUser.uid,
                     name: `${projectToSave.name} (Copy)`
                 };
                 await saveCodeProject(projectToSave);
                 setActiveProject(projectToSave); // Switch to the new clone
             } else {
                 throw err;
             }
          }
          
          // Generate Link
          const url = new URL(window.location.href);
          url.searchParams.set('code_session', projectToSave.id);
          
          await navigator.clipboard.writeText(url.toString());
          alert(`Session Link Copied to Clipboard!\n\nLink: ${url.toString()}\n\nSend this to your team members.`);
          
          setIsSharedSession(true);
      } catch(e: any) {
          console.error(e);
          const msg = e.message || "Unknown error";
          alert(`Failed to create share link: ${msg}`);
      } finally {
          setIsSaving(false);
      }
  };

  // --- GitHub Import Logic ---
  const handleConnectGithub = async () => {
      const token = prompt("Enter GitHub Personal Access Token (Repo scope):");
      if (!token) return;
      setGithubToken(token);
      try {
          setIsLoading(true);
          const repos = await fetchUserRepos(token);
          setRepos(repos);
          setShowRepoList(true);
      } catch(e) {
          alert("Failed to fetch repos.");
      } finally {
          setIsLoading(false);
      }
  };

  const handleImportRepo = async (repo: any) => {
      setIsLoading(true);
      try {
          const { files, latestSha } = await fetchRepoContents(githubToken, repo.owner.login, repo.name, repo.default_branch);
          
          const newProject: CodeProject = {
              id: crypto.randomUUID(),
              name: repo.name,
              files: files,
              lastModified: Date.now(),
              ownerId: currentUser?.uid,
              github: {
                  owner: repo.owner.login,
                  repo: repo.name,
                  branch: repo.default_branch,
                  sha: latestSha
              }
          };
          
          setActiveProject(newProject);
          // Find first readable file
          const firstFile = files.find(f => !f.isDirectory && !f.name.startsWith('.'));
          if (firstFile) handleFileSelect(firstFile);
          
          setShowRepoList(false);
      } catch(e) {
          console.error(e);
          alert("Import failed.");
      } finally {
          setIsLoading(false);
      }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center space-x-4">
              <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">
                  <ArrowLeft size={20} />
              </button>
              <div>
                  <h1 className="text-lg font-bold text-white flex items-center gap-2">
                      <Terminal className="text-emerald-400"/>
                      {activeProject ? activeProject.name : "Code Studio"}
                  </h1>
                  {activeProject?.github && (
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Github size={10}/>
                          <span>{activeProject.github.owner}/{activeProject.github.repo}</span>
                      </div>
                  )}
              </div>
          </div>
          
          <div className="flex items-center space-x-2">
              {!activeProject && (
                  <>
                    <button onClick={handleCreateProject} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm font-bold text-white">
                        <Plus size={14}/> New Project
                    </button>
                    <button onClick={handleConnectGithub} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-sm font-bold text-white">
                        <Github size={14}/> Import Repo
                    </button>
                  </>
              )}
              
              {activeProject && (
                  <>
                    <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-sm font-bold transition-colors">
                        {isSaving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
                        <span>Save</span>
                    </button>
                    <button onClick={handleShare} className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-bold transition-colors ${isSharedSession ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-500/50' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}>
                        <Share2 size={14}/>
                        <span>{isSharedSession ? 'Shared' : 'Share Session'}</span>
                    </button>
                  </>
              )}
          </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
          
          {/* Sidebar / Project List */}
          <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
              {!activeProject ? (
                  <div className="p-4 space-y-2">
                      <h3 className="text-xs font-bold text-slate-500 uppercase">Your Projects</h3>
                      {projects.map(p => (
                          <button key={p.id} onClick={() => { setActiveProject(p); if (p.files.length > 0) setActiveFile(p.files[0]); }} className="w-full text-left px-3 py-2 rounded hover:bg-slate-800 text-sm text-slate-300 flex items-center gap-2">
                              <FileCode size={14}/> {p.name}
                          </button>
                      ))}
                  </div>
              ) : (
                  <div className="flex-1 overflow-y-auto">
                      <div className="p-2 border-b border-slate-800 flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-500 uppercase">Explorer</span>
                          <button onClick={() => setActiveProject(null)} className="text-[10px] text-indigo-400 hover:underline">Close Project</button>
                      </div>
                      <div className="p-2 space-y-1">
                          {activeProject.files.map((file, idx) => (
                              <button 
                                  key={file.path || idx} 
                                  onClick={() => handleFileSelect(file)}
                                  className={`w-full text-left px-3 py-1.5 rounded text-sm flex items-center gap-2 truncate ${activeFile?.path === file.path ? 'bg-indigo-900/30 text-indigo-300 border border-indigo-500/30' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                              >
                                  {file.isDirectory ? <Folder size={14} className="text-slate-500"/> : <FileCode size={14} className="text-indigo-400"/>}
                                  <span className="truncate">{file.name.split('/').pop()}</span>
                              </button>
                          ))}
                      </div>
                  </div>
              )}
          </div>

          {/* Editor Area */}
          <div className="flex-1 bg-slate-950 flex flex-col relative">
              {activeFile ? (
                  <>
                    <div className="flex items-center px-4 py-2 border-b border-slate-800 bg-slate-900/50">
                        <span className="text-xs text-slate-400 font-mono">{activeFile.path || activeFile.name}</span>
                        {!activeFile.loaded && <span className="ml-2 text-[10px] text-amber-400">(Not Loaded)</span>}
                    </div>
                    <textarea 
                        value={activeFile.content}
                        onChange={(e) => handleCodeChange(e.target.value)}
                        className="flex-1 bg-slate-950 text-slate-300 p-4 font-mono text-sm outline-none resize-none"
                        spellCheck={false}
                    />
                  </>
              ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                      <Terminal size={48} className="mb-4 opacity-20"/>
                      <p>Select a file to edit</p>
                  </div>
              )}
              
              {showRepoList && (
                  <div className="absolute inset-0 bg-slate-950/90 flex items-center justify-center z-20">
                      <div className="bg-slate-900 border border-slate-700 rounded-xl w-96 max-h-[80vh] flex flex-col shadow-2xl">
                          <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                              <h3 className="font-bold text-white">Select Repository</h3>
                              <button onClick={() => setShowRepoList(false)}><ArrowLeft size={16} className="text-slate-400 hover:text-white"/></button>
                          </div>
                          <div className="flex-1 overflow-y-auto p-2">
                              {repos.map((repo: any) => (
                                  <button key={repo.id} onClick={() => handleImportRepo(repo)} className="w-full text-left p-3 hover:bg-slate-800 rounded flex flex-col border-b border-slate-800/50 last:border-0">
                                      <span className="text-sm font-bold text-white">{repo.name}</span>
                                      <span className="text-xs text-slate-500">{repo.full_name}</span>
                                  </button>
                              ))}
                          </div>
                      </div>
                  </div>
              )}
          </div>
      </div>
    </div>
  );
};
