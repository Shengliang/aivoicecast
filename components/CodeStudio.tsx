import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Save, Github, Play, Loader2, MessageSquare, Code, FileText, Plus, Folder, Trash2, ChevronRight, ChevronDown, Check, X, RefreshCw, Terminal, Send } from 'lucide-react';
import { CodeProject, CodeFile, ChatMessage } from '../types';
import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';
import { GEMINI_API_KEY } from '../services/private_keys';
import { signInWithGitHub, fetchUserRepos, fetchRepoContents, fetchFileContent, commitToRepo, fetchPublicRepoInfo } from '../services/githubService';
import { saveCodeProject, getUserCodeProjects } from '../services/firestoreService';

interface CodeStudioProps {
  onBack: () => void;
  currentUser: any;
}

const DEFAULT_FILE: CodeFile = {
  name: 'main.py',
  language: 'python',
  content: 'print("Hello World")',
  loaded: true
};

export const CodeStudio: React.FC<CodeStudioProps> = ({ onBack, currentUser }) => {
  // ... state ...
  const [project, setProject] = useState<CodeProject>({
    id: crypto.randomUUID(),
    name: 'Untitled Project',
    files: [DEFAULT_FILE],
    lastModified: Date.now(),
    chatHistory: []
  });
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  
  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  
  // Editor State
  const [selection, setSelection] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Pending AI Changes
  const [pendingChange, setPendingChange] = useState<{ original: string, fileIndex: number } | null>(null);

  // Derived
  const activeFile = project.files[activeFileIndex];

  // Sync chat history from project
  useEffect(() => {
      if (project.chatHistory) {
          setChatMessages(project.chatHistory);
      }
  }, [project.id]);

  const handleCodeChange = (newCode: string) => {
      const updatedFiles = [...project.files];
      updatedFiles[activeFileIndex] = { ...updatedFiles[activeFileIndex], content: newCode };
      setProject({ ...project, files: updatedFiles });
  };

  const handleSelectionChange = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const target = e.currentTarget;
      const text = target.value.substring(target.selectionStart, target.selectionEnd);
      setSelection(text);
  };

  const handleChatSubmit = async () => {
      if (!chatInput.trim()) return;
      
      const userMsg = chatInput;
      const newHistory: ChatMessage[] = [...chatMessages, { role: 'user', text: userMsg }];
      setChatMessages(newHistory);
      setChatInput('');
      setIsChatLoading(true);

      try {
          const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
          if (!apiKey) throw new Error("API Key required. Please set it in Settings.");
          
          const ai = new GoogleGenAI({ apiKey });
          
          // Enhanced Context Construction
          let fileContext = "No active file context.";
          if (activeFile && activeFile.loaded && !activeFile.isDirectory) {
              const safeContent = activeFile.content.length > 30000 
                  ? activeFile.content.substring(0, 30000) + "\n...[Content Truncated]..." 
                  : activeFile.content;
                  
              fileContext = `[CURRENT EDITOR STATE]
File: ${activeFile.name}
Language: ${activeFile.language}

${selection ? `[USER SELECTION]
\`\`\`
${selection}
\`\`\`
(The user is specifically asking about the selected code above.)
` : ''}

[FILE CONTENT]
\`\`\`${activeFile.language}
${safeContent}
\`\`\``;
          }

          // Limit history to last 12 messages to keep context focused on code
          const historyText = newHistory.slice(-12).map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n\n');
          
          const updateFileTool: FunctionDeclaration = {
              name: 'update_file',
              description: 'Overwrite the current file content with new code if user asks for changes.',
              parameters: {
                  type: Type.OBJECT,
                  properties: {
                      code: { type: Type.STRING, description: 'The full new code content for the file.' }
                  },
                  required: ['code']
              }
          };

          const prompt = `
            You are an expert Coding Assistant built into an IDE.
            
            ${fileContext}
            
            [CHAT HISTORY]
            ${historyText}
            
            [USER REQUEST]
            ${userMsg}
            
            Instructions:
            1. Answer the user's question based on the [FILE CONTENT] and [USER SELECTION].
            2. Be concise and helpful.
            3. If the user asks to modify the code, use the 'update_file' tool with the COMPLETE new code.
          `;

          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt,
              config: {
                  tools: [{ functionDeclarations: [updateFileTool] }]
              }
          });

          // Handle Tool Calls
          if (response.functionCalls && response.functionCalls.length > 0) {
              const fc = response.functionCalls[0];
              if (fc.name === 'update_file') {
                  const newCode = fc.args['code'] as string;
                  setPendingChange({ original: activeFile.content, fileIndex: activeFileIndex });
                  handleCodeChange(newCode); // Apply immediately
                  const aiMsg = "I've updated the code in the editor. You can Accept or Revert these changes.";
                  
                  const updatedHistory: ChatMessage[] = [...newHistory, { role: 'ai', text: aiMsg }];
                  setChatMessages(updatedHistory);
                  setProject(prev => ({ ...prev, chatHistory: updatedHistory }));
                  return;
              }
          }

          const aiMsg = response.text || "I couldn't generate a response.";
          const updatedHistory: ChatMessage[] = [...newHistory, { role: 'ai', text: aiMsg }];
          setChatMessages(updatedHistory);
          setProject(prev => ({ ...prev, chatHistory: updatedHistory }));

      } catch(e: any) {
          const errorMsg = `Error: ${e.message}`;
          setChatMessages(prev => [...prev, { role: 'ai', text: errorMsg }]);
      } finally {
          setIsChatLoading(false);
      }
  };

  const handleRevertChange = () => {
      if (!pendingChange) return;
      const updatedFiles = [...project.files];
      updatedFiles[pendingChange.fileIndex] = { ...updatedFiles[pendingChange.fileIndex], content: pendingChange.original };
      setProject({ ...project, files: updatedFiles });
      setPendingChange(null);
  };

  const handleAcceptChange = () => {
      setPendingChange(null);
  };

  // ... Render Logic ...
  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900 shrink-0">
            <div className="flex items-center gap-4">
                <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <div className="flex items-center gap-2">
                    <Terminal className="text-emerald-400" size={20} />
                    <input 
                        type="text" 
                        value={project.name} 
                        onChange={(e) => setProject({...project, name: e.target.value})}
                        className="bg-transparent font-bold text-white outline-none border-b border-transparent hover:border-slate-600 focus:border-indigo-500 transition-colors"
                    />
                </div>
            </div>
            
            <div className="flex items-center gap-2">
               {currentUser ? (
                   <button 
                       onClick={() => saveCodeProject(project).then(() => alert("Saved!"))}
                       className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold transition-colors"
                   >
                       <Save size={14} /> Save
                   </button>
               ) : (
                   <span className="text-xs text-slate-500">Sign in to save</span>
               )}
            </div>
        </header>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
            
            {/* Sidebar (Files) */}
            <div className="w-64 border-r border-slate-800 bg-slate-900 flex flex-col">
                <div className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider flex justify-between items-center">
                    <span>Explorer</span>
                    <button 
                        onClick={() => setProject(p => ({ ...p, files: [...p.files, { ...DEFAULT_FILE, name: `new_${Date.now()}.py` }] }))}
                        className="hover:text-white"
                    >
                        <Plus size={14} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {project.files.map((file, idx) => (
                        <div 
                            key={idx} 
                            onClick={() => setActiveFileIndex(idx)}
                            className={`flex items-center gap-2 px-4 py-2 cursor-pointer text-sm ${idx === activeFileIndex ? 'bg-indigo-900/30 text-white border-l-2 border-indigo-500' : 'text-slate-400 hover:bg-slate-800 hover:text-white border-l-2 border-transparent'}`}
                        >
                            {file.isDirectory ? <Folder size={14} className="text-indigo-400" /> : <Code size={14} className="text-emerald-400" />}
                            <span className="truncate">{file.name}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
                {/* Tabs */}
                <div className="flex bg-slate-900 border-b border-slate-800 overflow-x-auto scrollbar-hide">
                    {project.files.map((file, idx) => (
                        <div 
                            key={idx} 
                            onClick={() => setActiveFileIndex(idx)}
                            className={`px-4 py-2 text-xs font-medium cursor-pointer border-r border-slate-800 flex items-center gap-2 min-w-[100px] max-w-[200px] ${idx === activeFileIndex ? 'bg-[#1e1e1e] text-white border-t-2 border-t-indigo-500' : 'text-slate-500 hover:bg-slate-800'}`}
                        >
                            <span className="truncate">{file.name}</span>
                            {idx === activeFileIndex && <span className="w-1.5 h-1.5 rounded-full bg-white ml-auto" />}
                        </div>
                    ))}
                </div>

                {/* Code Editor */}
                <div className="flex-1 relative">
                    <textarea 
                        ref={textareaRef}
                        value={activeFile?.content || ''}
                        onChange={(e) => handleCodeChange(e.target.value)}
                        onSelect={handleSelectionChange}
                        className="w-full h-full bg-[#1e1e1e] text-indigo-100 font-mono text-sm p-4 outline-none resize-none"
                        spellCheck="false"
                        disabled={activeFile?.isDirectory}
                    />
                    
                    {/* Pending Changes Overlay */}
                    {pendingChange && pendingChange.fileIndex === activeFileIndex && (
                        <div className="absolute bottom-4 right-4 bg-slate-800 border border-slate-600 p-3 rounded-lg shadow-2xl flex items-center gap-4 animate-fade-in-up">
                            <span className="text-xs text-slate-300">AI modified this file.</span>
                            <div className="flex gap-2">
                                <button onClick={handleAcceptChange} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded flex items-center gap-1">
                                    <Check size={12}/> Accept
                                </button>
                                <button onClick={handleRevertChange} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded flex items-center gap-1">
                                    <X size={12}/> Revert
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Chat Sidebar */}
            <div className="w-80 border-l border-slate-800 bg-slate-900 flex flex-col">
                <div className="p-3 border-b border-slate-800 bg-slate-950 text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <MessageSquare size={14} className="text-indigo-400" />
                    <span>AI Assistant</span>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {chatMessages.length === 0 ? (
                        <div className="text-center text-slate-500 text-sm mt-10">
                            <p>Ask me to explain code, fix bugs, or generate new functions.</p>
                        </div>
                    ) : (
                        chatMessages.map((msg, idx) => (
                            <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`max-w-[90%] p-3 rounded-lg text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>
                                    <p className="whitespace-pre-wrap">{msg.text}</p>
                                </div>
                            </div>
                        ))
                    )}
                    {isChatLoading && (
                        <div className="flex justify-start">
                            <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                                <Loader2 size={16} className="animate-spin text-indigo-400" />
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-3 border-t border-slate-800 bg-slate-950">
                    <div className="relative">
                        <textarea 
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleChatSubmit();
                                }
                            }}
                            placeholder="Ask Gemini..."
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-3 pr-10 py-2 text-sm text-white outline-none focus:border-indigo-500 resize-none h-12"
                        />
                        <button 
                            onClick={handleChatSubmit}
                            disabled={isChatLoading || !chatInput.trim()}
                            className="absolute right-2 top-2 p-1 text-slate-400 hover:text-indigo-400 disabled:opacity-50"
                        >
                            <Send size={16} />
                        </button>
                    </div>
                    {selection && (
                        <div className="mt-2 text-[10px] text-indigo-400 truncate px-1">
                            Reference: {selection.substring(0, 30)}...
                        </div>
                    )}
                </div>
            </div>

        </div>
    </div>
  );
};