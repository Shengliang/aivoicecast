
import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { ArrowLeft, Play, Save, Folder, File, Code, Terminal, Plus, Trash2, Loader2, ChevronRight, ChevronDown, Download, Smartphone, X, MessageSquare, CheckCircle, FileCode, FileJson, FileType, Search } from 'lucide-react';
import { GEMINI_API_KEY } from '../services/private_keys';
import { CodeProject, CodeFile } from '../types';
import { MarkdownView } from './MarkdownView';

interface CodeStudioProps {
  onBack: () => void;
  currentUser: any;
}

const INITIAL_PROJECT: CodeProject = {
  id: 'proj-1',
  name: 'Web Component',
  lastModified: Date.now(),
  files: [
    {
      name: 'Button.tsx',
      language: 'typescript',
      content: `import React from 'react';\n\nexport const Button = ({ label, onClick }) => {\n  // TODO: Add type safety\n  return (\n    <button className="btn-primary" onClick={onClick}>\n      {label}\n    </button>\n  );\n};`
    },
    {
      name: 'styles.css',
      language: 'css',
      content: `.btn-primary {\n  background-color: #4f46e5;\n  color: white;\n  padding: 10px 20px;\n  border-radius: 8px;\n}`
    },
    {
      name: 'utils.js',
      language: 'javascript',
      content: `function debounce(func, timeout = 300){\n  let timer;\n  return (...args) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => { func.apply(this, args); }, timeout);\n  };\n}`
    }
  ]
};

// Helper to detect language from filename
const getLanguageFromFilename = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch(ext) {
        case 'js': return 'javascript';
        case 'ts': return 'typescript';
        case 'tsx': return 'typescript (react)';
        case 'jsx': return 'javascript (react)';
        case 'py': return 'python';
        case 'html': return 'html';
        case 'css': return 'css';
        case 'json': return 'json';
        case 'rs': return 'rust';
        case 'go': return 'go';
        case 'java': return 'java';
        case 'cpp': return 'c++';
        case 'c': return 'c';
        case 'md': return 'markdown';
        default: return 'text';
    }
};

const FileIcon = ({ filename }: { filename: string }) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    let color = 'text-slate-400';
    let Icon = File;

    if (['ts', 'tsx', 'js', 'jsx'].includes(ext || '')) {
        color = 'text-yellow-400';
        Icon = FileCode;
    } else if (ext === 'css') {
        color = 'text-blue-400';
        Icon = FileType;
    } else if (ext === 'html') {
        color = 'text-orange-400';
        Icon = Code;
    } else if (ext === 'json') {
        color = 'text-green-400';
        Icon = FileJson;
    } else if (ext === 'py') {
        color = 'text-blue-300';
        Icon = FileCode;
    }

    return <Icon size={14} className={color} />;
};

export const CodeStudio: React.FC<CodeStudioProps> = ({ onBack, currentUser }) => {
  const [project, setProject] = useState<CodeProject>(INITIAL_PROJECT);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [output, setOutput] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Mobile check
  useEffect(() => {
      if (window.innerWidth < 768) setIsSidebarOpen(false);
  }, []);

  const activeFile = project.files[activeFileIndex];

  const handleCodeChange = (newContent: string) => {
    const updatedFiles = [...project.files];
    // Auto-detect language change if filename changed (though filename editing is separate, good to keep sync)
    updatedFiles[activeFileIndex] = { 
        ...activeFile, 
        content: newContent 
    };
    setProject({ ...project, files: updatedFiles });
  };

  const handleReviewCode = async () => {
    setIsReviewing(true);
    setOutput('');
    
    try {
        const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
        if (!apiKey) throw new Error("API Key required for AI review.");
        
        const ai = new GoogleGenAI({ apiKey });
        
        // Construct context with all files and their detected languages
        const fileContext = project.files.map(f => {
            const lang = getLanguageFromFilename(f.name);
            return `--- File: ${f.name} (Language: ${lang}) ---\n${f.content}`;
        }).join('\n\n');
        
        const prompt = `
            You are a Senior Principal Software Engineer conducting a thorough code review.
            
            Project Context:
            ${fileContext}
            
            Task:
            1. Analyze the code for logic errors, security vulnerabilities, performance bottlenecks, and code style issues.
            2. Be specific. Reference file names and line numbers (approximate) where possible.
            3. Suggest improvements or specific refactors.
            4. If the code is good, provide a brief "LGTM" (Looks Good To Me) with a minor optimization tip.
            5. Return the response in formatted Markdown. Use headers, bullet points, and code blocks for readability.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview', 
            contents: prompt
        });
        
        setOutput(response.text || "No feedback generated.");
    } catch (e: any) {
        setOutput(`Review Error: ${e.message}`);
    } finally {
        setIsReviewing(false);
    }
  };

  const handleAddFile = () => {
      const name = prompt("File name (e.g. component.tsx, script.py):");
      if (!name) return;
      
      // Auto-detect language for the internal type
      const lang: any = getLanguageFromFilename(name);
      
      const newFile: CodeFile = { name, language: lang, content: '// Start coding...' };
      setProject(prev => ({
          ...prev,
          files: [...prev.files, newFile]
      }));
      setActiveFileIndex(project.files.length); // Switch to new file
  };

  const handleDeleteFile = (idx: number, e: React.MouseEvent) => {
      e.stopPropagation();
      if (project.files.length <= 1) return alert("Cannot delete the last file.");
      if (!confirm("Delete this file?")) return;
      
      const newFiles = project.files.filter((_, i) => i !== idx);
      setProject(prev => ({ ...prev, files: newFiles }));
      if (activeFileIndex >= idx) setActiveFileIndex(Math.max(0, activeFileIndex - 1));
  };

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-gray-300 flex flex-col font-mono overflow-hidden">
      
      {/* Top Bar */}
      <div className="h-12 bg-[#2d2d2d] border-b border-[#1e1e1e] flex items-center justify-between px-4 shrink-0">
         <div className="flex items-center gap-3">
             <button onClick={onBack} className="hover:text-white"><ArrowLeft size={18}/></button>
             <span className="text-sm font-bold text-white flex items-center gap-2">
                 <Folder size={14} className="text-blue-400"/>
                 {project.name}
             </span>
         </div>
         <div className="flex items-center gap-2">
             <button 
                onClick={handleReviewCode}
                disabled={isReviewing}
                className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-sm text-xs font-bold transition-colors"
             >
                {isReviewing ? <Loader2 size={14} className="animate-spin"/> : <Search size={14} />}
                <span>{isReviewing ? 'ANALYZING...' : 'REVIEW CODE'}</span>
             </button>
             <button className="p-1.5 hover:bg-[#3d3d3d] rounded text-gray-400 hover:text-white" title="Save Project (Local)">
                <Save size={16} />
             </button>
         </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
          
          {/* Sidebar (File Explorer) */}
          <div className={`
              absolute md:relative z-20 h-full w-64 bg-[#252526] border-r border-[#1e1e1e] transform transition-transform duration-200 flex flex-col
              ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-64'}
          `}>
              <div className="p-2 text-xs font-bold text-gray-500 uppercase tracking-wider flex justify-between items-center border-b border-[#3d3d3d]">
                  <span>Files</span>
                  <button onClick={handleAddFile} className="hover:text-white p-1 hover:bg-[#37373d] rounded"><Plus size={14}/></button>
              </div>
              <div className="flex-1 overflow-y-auto mt-1">
                  {project.files.map((file, idx) => (
                      <div
                          key={idx} // Using Index as key since names might duplicate temporarily
                          onClick={() => { setActiveFileIndex(idx); if(window.innerWidth<768) setIsSidebarOpen(false); }}
                          className={`w-full text-left px-4 py-1.5 flex items-center justify-between group cursor-pointer ${activeFileIndex === idx ? 'bg-[#37373d] text-white' : 'text-gray-400 hover:bg-[#2a2d2e]'}`}
                      >
                          <div className="flex items-center gap-2 text-sm truncate">
                              <FileIcon filename={file.name} />
                              <span>{file.name}</span>
                          </div>
                          {project.files.length > 1 && (
                              <button 
                                onClick={(e) => handleDeleteFile(idx, e)}
                                className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400"
                              >
                                  <X size={12} />
                              </button>
                          )}
                      </div>
                  ))}
              </div>
          </div>

          {/* Toggle Sidebar (Mobile) */}
          <button 
             onClick={() => setIsSidebarOpen(!isSidebarOpen)}
             className="absolute bottom-4 left-4 z-30 md:hidden p-3 bg-indigo-600 rounded-full text-white shadow-lg"
          >
             <Folder size={20} />
          </button>

          {/* Main Editor Area */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
              {/* Tab Bar */}
              <div className="flex overflow-x-auto bg-[#252526] scrollbar-thin scrollbar-thumb-[#3d3d3d]">
                  {project.files.map((file, idx) => (
                      <div 
                        key={idx}
                        onClick={() => setActiveFileIndex(idx)}
                        className={`px-4 py-2 text-xs border-r border-[#1e1e1e] cursor-pointer flex items-center gap-2 min-w-[100px] hover:bg-[#2d2d2d] transition-colors ${activeFileIndex === idx ? 'bg-[#1e1e1e] text-white border-t-2 border-t-indigo-500' : 'bg-[#2d2d2d] text-gray-500'}`}
                      >
                          <FileIcon filename={file.name} />
                          <span>{file.name}</span>
                      </div>
                  ))}
              </div>

              {/* Code Area */}
              <div className="flex-1 relative group">
                  <textarea 
                      value={activeFile.content}
                      onChange={(e) => handleCodeChange(e.target.value)}
                      className="w-full h-full bg-[#1e1e1e] text-gray-200 p-4 font-mono text-sm outline-none resize-none leading-relaxed"
                      spellCheck={false}
                      autoCapitalize="off"
                      autoComplete="off"
                      autoCorrect="off"
                  />
                  <div className="absolute top-2 right-4 text-xs text-gray-600 bg-[#1e1e1e]/80 px-2 py-1 rounded pointer-events-none border border-[#3d3d3d]">
                      {getLanguageFromFilename(activeFile.name).toUpperCase()}
                  </div>
              </div>

              {/* AI Review / Output Panel */}
              <div className="h-2/5 bg-[#1e1e1e] border-t border-[#3d3d3d] flex flex-col">
                  <div className="px-4 py-1.5 bg-[#252526] text-xs font-bold text-gray-400 flex items-center justify-between border-b border-[#3d3d3d]">
                      <div className="flex items-center gap-2">
                          <MessageSquare size={12} className="text-indigo-400" />
                          <span>AI REVIEW / FEEDBACK</span>
                      </div>
                      <button onClick={() => setOutput('')} className="hover:text-white"><Trash2 size={12}/></button>
                  </div>
                  <div className="flex-1 p-4 overflow-y-auto bg-[#1e1e1e]">
                      {output ? (
                          <div className="prose prose-invert prose-sm max-w-none text-gray-300">
                              <MarkdownView content={output} />
                          </div>
                      ) : (
                          <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-2">
                              <CheckCircle size={32} className="opacity-20" />
                              <p className="text-xs">Ready to review. Click "REVIEW CODE" to analyze.</p>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};
