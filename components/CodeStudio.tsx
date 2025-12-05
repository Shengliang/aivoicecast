import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { ArrowLeft, Play, Save, Folder, File, Code, Terminal, Plus, Trash2, Loader2, ChevronRight, ChevronDown, Download, Smartphone, X } from 'lucide-react';
import { GEMINI_API_KEY } from '../services/private_keys';
import { CodeProject, CodeFile } from '../types';

interface CodeStudioProps {
  onBack: () => void;
  currentUser: any;
}

const INITIAL_PROJECT: CodeProject = {
  id: 'proj-1',
  name: 'Interview Prep: Python',
  lastModified: Date.now(),
  files: [
    {
      name: 'main.py',
      language: 'python',
      content: `def reverse_string(s):\n    return s[::-1]\n\ntext = "AIVoiceCast"\nprint(f"Original: {text}")\nprint(f"Reversed: {reverse_string(text)}")`
    },
    {
      name: 'utils.py',
      language: 'python',
      content: `def is_palindrome(s):\n    return s == s[::-1]`
    }
  ]
};

export const CodeStudio: React.FC<CodeStudioProps> = ({ onBack, currentUser }) => {
  const [project, setProject] = useState<CodeProject>(INITIAL_PROJECT);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Mobile check
  useEffect(() => {
      if (window.innerWidth < 768) setIsSidebarOpen(false);
  }, []);

  const activeFile = project.files[activeFileIndex];

  const handleCodeChange = (newContent: string) => {
    const updatedFiles = [...project.files];
    updatedFiles[activeFileIndex] = { ...activeFile, content: newContent };
    setProject({ ...project, files: updatedFiles });
  };

  const handleRunCode = async () => {
    setIsRunning(true);
    setOutput('');
    
    try {
        // Use Gemini to simulate execution environment
        const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
        if (!apiKey) throw new Error("API Key required to run code simulator.");
        
        const ai = new GoogleGenAI({ apiKey });
        
        // Construct context with all files
        const fileContext = project.files.map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n');
        
        const prompt = `
            You are a Python Interpreter. 
            Execute the following Python project.
            The entry point is likely main.py.
            
            Project Files:
            ${fileContext}
            
            Task:
            1. Simulate the execution of the code.
            2. Return ONLY the console output (stdout/stderr).
            3. If there is an error, show the traceback.
            4. Do not explain the code, just run it.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });
        
        setOutput(response.text || "No output.");
    } catch (e: any) {
        setOutput(`Execution Error: ${e.message}`);
    } finally {
        setIsRunning(false);
    }
  };

  const handleAddFile = () => {
      const name = prompt("File name (e.g. test.py):");
      if (!name) return;
      const newFile: CodeFile = { name, language: 'python', content: '# New file' };
      setProject(prev => ({
          ...prev,
          files: [...prev.files, newFile]
      }));
      setActiveFileIndex(project.files.length); // Switch to new file
  };

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-gray-300 flex flex-col font-mono overflow-hidden">
      
      {/* Top Bar */}
      <div className="h-12 bg-[#2d2d2d] border-b border-[#1e1e1e] flex items-center justify-between px-4 shrink-0">
         <div className="flex items-center gap-3">
             <button onClick={onBack} className="hover:text-white"><ArrowLeft size={18}/></button>
             <span className="text-sm font-bold text-white">{project.name}</span>
         </div>
         <div className="flex items-center gap-2">
             <button 
                onClick={handleRunCode}
                disabled={isRunning}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-sm text-xs font-bold transition-colors"
             >
                {isRunning ? <Loader2 size={14} className="animate-spin"/> : <Play size={14} fill="currentColor" />}
                <span>RUN</span>
             </button>
             <button className="p-1.5 hover:bg-[#3d3d3d] rounded text-gray-400 hover:text-white" title="Save Project (Local)">
                <Save size={16} />
             </button>
         </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
          
          {/* Sidebar (File Explorer) */}
          <div className={`
              absolute md:relative z-20 h-full w-64 bg-[#252526] border-r border-[#1e1e1e] transform transition-transform duration-200
              ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-64'}
          `}>
              <div className="p-2 text-xs font-bold text-gray-500 uppercase tracking-wider flex justify-between items-center">
                  <span>Explorer</span>
                  <button onClick={handleAddFile} className="hover:text-white"><Plus size={14}/></button>
              </div>
              <div className="mt-1">
                  {project.files.map((file, idx) => (
                      <button
                          key={file.name}
                          onClick={() => { setActiveFileIndex(idx); if(window.innerWidth<768) setIsSidebarOpen(false); }}
                          className={`w-full text-left px-4 py-1.5 flex items-center gap-2 text-sm hover:bg-[#2a2d2e] ${activeFileIndex === idx ? 'bg-[#37373d] text-white' : 'text-gray-400'}`}
                      >
                          <File size={14} className={file.name.endsWith('.py') ? 'text-yellow-400' : 'text-blue-400'} />
                          {file.name}
                      </button>
                  ))}
              </div>
          </div>

          {/* Toggle Sidebar (Mobile) */}
          <button 
             onClick={() => setIsSidebarOpen(!isSidebarOpen)}
             className="absolute bottom-4 left-4 z-30 md:hidden p-2 bg-indigo-600 rounded-full text-white shadow-lg"
          >
             <Folder size={20} />
          </button>

          {/* Main Editor Area */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
              {/* Tab Bar */}
              <div className="flex overflow-x-auto bg-[#252526]">
                  {project.files.map((file, idx) => (
                      <div 
                        key={idx}
                        onClick={() => setActiveFileIndex(idx)}
                        className={`px-4 py-2 text-xs border-r border-[#1e1e1e] cursor-pointer flex items-center gap-2 min-w-[100px] ${activeFileIndex === idx ? 'bg-[#1e1e1e] text-white border-t-2 border-t-indigo-500' : 'bg-[#2d2d2d] text-gray-500'}`}
                      >
                          <span>{file.name}</span>
                          {activeFileIndex === idx && <X size={12} className="hover:text-red-400" />}
                      </div>
                  ))}
              </div>

              {/* Code Area (Simple Textarea for Mobile Friendliness) */}
              <div className="flex-1 relative">
                  <textarea 
                      value={activeFile.content}
                      onChange={(e) => handleCodeChange(e.target.value)}
                      className="w-full h-full bg-[#1e1e1e] text-gray-200 p-4 font-mono text-sm outline-none resize-none leading-relaxed"
                      spellCheck={false}
                      autoCapitalize="off"
                      autoComplete="off"
                      autoCorrect="off"
                  />
              </div>

              {/* Terminal / Output */}
              <div className="h-1/3 bg-[#1e1e1e] border-t border-[#3d3d3d] flex flex-col">
                  <div className="px-4 py-1 bg-[#252526] text-xs font-bold text-gray-400 flex items-center gap-2 border-b border-[#3d3d3d]">
                      <Terminal size={12} />
                      <span>TERMINAL / OUTPUT</span>
                  </div>
                  <pre className="flex-1 p-4 font-mono text-xs text-green-400 overflow-y-auto whitespace-pre-wrap">
                      {output || "Ready to run..."}
                  </pre>
              </div>
          </div>
      </div>
    </div>
  );
};