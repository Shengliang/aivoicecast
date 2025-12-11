import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Code, Save, Share2, Loader2, GitBranch, Lock, 
  ChevronDown, GitCommit, CheckCircle, Bot, GraduationCap, 
  Shrink, Expand, Plus, Cloud, BookOpen, Bug, CloudUpload, 
  Github, Edit3, Eye, Search, FileText, X, Trash2
} from 'lucide-react';
import { CodeProject, CodeFile } from '../types';
import { auth } from '../services/firebaseConfig';
import { 
  subscribeToCodeProject, saveCodeProject, getProjectsFromStorage
} from '../services/firestoreService';
import { fetchRepoContents } from '../services/githubService';

interface CodeStudioProps {
  onBack: () => void;
  currentUser: any;
  sessionId?: string;
  accessKey?: string;
  onSessionStart: (id: string) => void;
}

const LANGUAGES = [
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'java', label: 'Java' },
  { id: 'cpp', label: 'C++' },
  { id: 'rust', label: 'Rust' },
  { id: 'go', label: 'Go' },
];

const PRESET_REPOS = [
  { label: 'React', path: 'facebook/react' },
  { label: 'TensorFlow', path: 'tensorflow/tensorflow' },
  { label: 'Linux', path: 'torvalds/linux' },
];

export const CodeStudio: React.FC<CodeStudioProps> = ({ 
  onBack, currentUser, sessionId, accessKey, onSessionStart 
}) => {
  const [project, setProject] = useState<CodeProject>({
    id: 'local-' + Date.now(),
    name: 'New Project',
    files: [],
    lastModified: Date.now()
  });
  
  const [activeFile, setActiveFile] = useState<CodeFile | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSharedSession, setIsSharedSession] = useState(false);
  
  // UI State
  const [activeSideView, setActiveSideView] = useState<'none' | 'review' | 'chat' | 'tutor'>('none');
  const [showShareDropdown, setShowShareDropdown] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showExamplesDropdown, setShowExamplesDropdown] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  
  const isOwner = currentUser && (project.ownerId === currentUser.uid || !project.ownerId);

  useEffect(() => {
    if (sessionId) {
      setIsSharedSession(true);
      // Determine readonly based on accessKey presence/validity (mock logic for now)
      setIsReadOnly(!accessKey); 
      
      const unsubscribe = subscribeToCodeProject(sessionId, (data) => {
        setProject(data);
        if (data.files.length > 0 && !activeFile) {
            setActiveFile(data.files[0]);
        }
      });
      return () => unsubscribe();
    }
  }, [sessionId, accessKey]);

  const handleSaveProject = async () => {
    if (!currentUser) return alert("Sign in to save.");
    setIsSaving(true);
    try {
      await saveCodeProject(project);
      if (!sessionId) {
          onSessionStart(project.id);
      }
    } catch (e) {
      console.error(e);
      alert("Save failed");
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = (mode: 'read' | 'edit') => {
      // Mock sharing logic
      const url = new URL(window.location.href);
      url.searchParams.set('session', project.id);
      if (mode === 'edit') url.searchParams.set('key', 'secret-token');
      navigator.clipboard.writeText(url.toString());
      alert(`Link copied for ${mode} access!`);
      setShowShareDropdown(false);
  };

  const toggleFullScreen = () => {
      if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen();
          setIsFullscreen(true);
      } else {
          document.exitFullscreen();
          setIsFullscreen(false);
      }
  };

  const handleAddFile = (lang: string) => {
      const name = `new_file.${lang === 'python' ? 'py' : lang === 'javascript' ? 'js' : 'txt'}`;
      const newFile: CodeFile = {
          name,
          language: lang as any,
          content: '',
          path: name,
          loaded: true
      };
      const newFiles = [...project.files, newFile];
      setProject({ ...project, files: newFiles });
      setActiveFile(newFile);
      setShowLanguageDropdown(false);
  };

  const handleLoadPublicRepo = async (repoPath: string) => {
      // Basic mock implementation or call githubService
      alert(`Loading ${repoPath}... (Mock)`);
      // Real implementation would use fetchRepoContents
  };

  const handleOpenCloud = () => {
      alert("Cloud files modal placeholder");
  };

  const setTutorSessionId = (id: string) => {
      console.log("Tutor session:", id);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 z-20">
         <div className="flex items-center space-x-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
               <ArrowLeft size={20} />
            </button>
            <div className="flex items-center space-x-2">
               <div className="bg-indigo-600 p-1.5 rounded-lg">
                  <Code size={18} className="text-white" />
               </div>
               
               <div className="flex flex-col cursor-pointer hover:bg-slate-800 rounded px-2 py-1 transition-colors group" onClick={() => !isReadOnly && setShowImportModal(true)}>
                   <div className="flex items-center gap-1">
                       <h1 className="font-bold text-white hidden sm:block truncate max-w-[200px] text-sm">{project.name}</h1>
                       {!isReadOnly && <ChevronDown size={12} className="text-slate-500 group-hover:text-white" />}
                   </div>
                   {project.github && <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1"><GitBranch size={10}/> {project.github.branch}</span>}
               </div>
               
               {isReadOnly ? (
                   <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-900/30 text-amber-400 rounded border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider">
                       <Lock size={10} /> Read Only
                   </div>
               ) : (
                   <div className="flex items-center gap-2 px-3 py-1 bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 rounded text-xs font-bold uppercase tracking-wider">
                       <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                       Editor Access
                   </div>
               )}
            </div>
            
            <div className="flex items-center space-x-1 bg-slate-800 rounded-lg p-1 border border-slate-700">
               <button onClick={handleSaveProject} disabled={isSaving} className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors" title="Save to Session">
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
               </button>
               
               {project.github && !isReadOnly && (
                   <button 
                     onClick={() => isOwner ? setShowCommitModal(true) : alert("Only the project owner can push to GitHub. Your changes have been saved to the live session.")} 
                     className={`p-2 rounded transition-colors ${isOwner ? 'hover:bg-slate-700 text-emerald-400 hover:text-white' : 'hover:bg-slate-800 text-slate-600 cursor-not-allowed'}`} 
                     title={isOwner ? "Commit Changes" : "Only owner can push to GitHub"}
                   >
                       <GitCommit size={16} />
                   </button>
               )}
               
               <div className="relative">
                   <button onClick={() => setShowShareDropdown(!showShareDropdown)} className={`p-2 rounded transition-colors ${isSharedSession ? 'bg-indigo-600 text-white' : 'text-indigo-400 hover:text-white hover:bg-slate-700'}`}>
                       <Share2 size={16} />
                   </button>
                   {showShareDropdown && (
                       <>
                       <div className="fixed inset-0 z-30" onClick={() => setShowShareDropdown(false)}></div>
                       <div className="absolute top-full left-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-40 overflow-hidden py-1">
                           <button onClick={() => handleShare('read')} className="w-full text-left px-4 py-2 hover:bg-slate-800 text-xs text-slate-300 hover:text-white flex items-center gap-2">
                               <Eye size={12} /> Copy Read-Only Link
                           </button>
                           <button onClick={() => handleShare('edit')} className="w-full text-left px-4 py-2 hover:bg-slate-800 text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-2">
                               <Edit3 size={12} /> Copy Edit Link
                           </button>
                       </div>
                       </>
                   )}
               </div>

               <button onClick={() => setActiveSideView(activeSideView === 'review' ? 'none' : 'review')} className={`p-2 rounded transition-colors ${activeSideView === 'review' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}>
                  <CheckCircle size={16} />
               </button>
               <button onClick={() => setActiveSideView(activeSideView === 'chat' ? 'none' : 'chat')} className={`p-2 rounded transition-colors ${activeSideView === 'chat' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}>
                  <Bot size={16} />
               </button>
               
               <button onClick={() => { if(isReadOnly) return alert("You must take edit access first."); if(!activeFile) return; setTutorSessionId(Date.now().toString()); setActiveSideView('tutor'); }} className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-lg ml-2 ${activeSideView === 'tutor' ? 'bg-emerald-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'}`}>
                   <GraduationCap size={14} /> <span className="hidden xl:inline">Teach Me</span>
               </button>
            </div>
         </div>

         <div className="flex items-center space-x-3">
            <button onClick={toggleFullScreen} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors" title="Toggle Full Screen">
                {isFullscreen ? <Shrink size={16} /> : <Expand size={16} />}
            </button>

            {!isReadOnly && (
            <div className="relative">
                <button onClick={() => setShowLanguageDropdown(!showLanguageDropdown)} className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-bold transition-colors">
                    <Plus size={14} /> <span>New File</span>
                </button>
                {showLanguageDropdown && (
                    <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowLanguageDropdown(false)}></div>
                    <div className="absolute top-full right-0 mt-2 w-40 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-40 overflow-hidden py-1">
                        {LANGUAGES.map(lang => (
                            <button key={lang.id} onClick={() => handleAddFile(lang.id)} className="w-full text-left px-4 py-2 hover:bg-slate-800 text-xs text-slate-300 hover:text-white">
                                {lang.label}
                            </button>
                        ))}
                    </div>
                    </>
                )}
            </div>
            )}
            
            <button 
                 onClick={handleOpenCloud} 
                 className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-bold transition-colors text-slate-300 hover:text-white"
                 title="Open Cloud Projects"
            >
                 <Cloud size={14} /> <span>Cloud Files</span>
            </button>

            <div className="relative">
                <button onClick={() => setShowExamplesDropdown(!showExamplesDropdown)} className="flex items-center space-x-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors shadow-lg shadow-indigo-500/20">
                    <BookOpen size={14} /> <span>Repositories</span>
                </button>
                {showExamplesDropdown && (
                    <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowExamplesDropdown(false)}></div>
                    <div className="absolute top-full right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-40 overflow-hidden py-1">
                        <div className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase">Presets</div>
                        {PRESET_REPOS.map(repo => (
                            <button key={repo.path} onClick={() => { setShowExamplesDropdown(false); handleLoadPublicRepo(repo.path); }} className="w-full text-left px-4 py-2 hover:bg-slate-800 text-xs text-slate-300 hover:text-white flex items-center gap-2">
                                <Github size={12} /> {repo.label}
                            </button>
                        ))}
                        {currentUser?.defaultRepoUrl && (
                            <>
                                <div className="border-t border-slate-800 my-1"></div>
                                <button onClick={() => { setShowExamplesDropdown(false); handleLoadPublicRepo(currentUser.defaultRepoUrl); }} className="w-full text-left px-4 py-2 hover:bg-slate-800 text-xs text-indigo-300 hover:text-white flex items-center gap-2">
                                    <Github size={12} /> Your Default Repo
                                </button>
                            </>
                        )}
                        <div className="border-t border-slate-800 my-1"></div>
                        <button onClick={() => { setShowExamplesDropdown(false); setShowImportModal(true); }} className="w-full text-left px-4 py-2 hover:bg-slate-800 text-xs text-slate-300 hover:text-white flex items-center gap-2">
                            <CloudUpload size={12} /> Load Custom...
                        </button>
                    </div>
                    </>
                )}
            </div>
            
            {/* Debug Toggle */}
            <button onClick={() => setShowDebug(!showDebug)} className={`p-2 rounded hover:bg-slate-800 ${showDebug ? 'text-green-400' : 'text-slate-500'}`} title="Toggle Debug Overlay">
                <Bug size={16} />
            </button>
         </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
          {/* File Explorer Sidebar */}
          <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
              <div className="p-3 border-b border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Explorer
              </div>
              <div className="flex-1 overflow-y-auto">
                  {project.files.map((file, idx) => (
                      <button 
                          key={idx}
                          onClick={() => setActiveFile(file)}
                          className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-slate-800 ${activeFile?.name === file.name ? 'bg-slate-800 text-white border-l-2 border-indigo-500' : 'text-slate-400'}`}
                      >
                          <FileText size={14} />
                          <span className="truncate">{file.name}</span>
                      </button>
                  ))}
              </div>
          </div>

          {/* Editor Area */}
          <div className="flex-1 bg-slate-950 flex flex-col">
              {activeFile ? (
                  <textarea 
                      className="flex-1 bg-transparent text-slate-300 font-mono p-4 outline-none resize-none"
                      value={activeFile.content}
                      onChange={(e) => {
                          if (isReadOnly) return;
                          const newContent = e.target.value;
                          setActiveFile({ ...activeFile, content: newContent });
                          const newFiles = project.files.map(f => f.name === activeFile.name ? { ...f, content: newContent } : f);
                          setProject({ ...project, files: newFiles });
                      }}
                      spellCheck={false}
                  />
              ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                      <Code size={48} className="mb-4 opacity-20" />
                      <p>Select a file to edit</p>
                  </div>
              )}
          </div>
      </div>
    </div>
  );
};