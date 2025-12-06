
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { ArrowLeft, Save, Folder, File, Code, Plus, Trash2, Loader2, ChevronRight, ChevronDown, X, MessageSquare, FileCode, FileJson, FileType, Search, Coffee, Hash, CloudUpload, Edit3, BookOpen } from 'lucide-react';
import { GEMINI_API_KEY } from '../services/private_keys';
import { CodeProject, CodeFile } from '../types';
import { MarkdownView } from './MarkdownView';
import { saveCodeProject } from '../services/firestoreService';

interface CodeStudioProps {
  onBack: () => void;
  currentUser: any;
}

const LANGUAGES = [
    { 
        id: 'cpp', label: 'C++', ext: 'cpp', 
        defaultCode: `#include <iostream>\n#include <vector>\n\nint main() {\n    std::cout << "Hello C++" << std::endl;\n    return 0;\n}` 
    },
    { 
        id: 'python', label: 'Python', ext: 'py', 
        defaultCode: `def main():\n    print("Hello Python")\n\nif __name__ == "__main__":\n    main()` 
    },
    { 
        id: 'java', label: 'Java', ext: 'java', 
        defaultCode: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello Java");\n    }\n}` 
    },
    { 
        id: 'javascript', label: 'JavaScript', ext: 'js', 
        defaultCode: `console.log("Hello JavaScript");` 
    },
    { 
        id: 'csharp', label: 'C#', ext: 'cs', 
        defaultCode: `using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Hello C#");\n    }\n}` 
    },
    { 
        id: 'c', label: 'C', ext: 'c', 
        defaultCode: `#include <stdio.h>\n\nint main() {\n    printf("Hello C\\n");\n    return 0;\n}` 
    },
    { 
        id: 'go', label: 'Go', ext: 'go', 
        defaultCode: `package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello Go")\n}` 
    },
    { 
        id: 'rust', label: 'Rust', ext: 'rs', 
        defaultCode: `fn main() {\n    println!("Hello Rust");\n}` 
    },
    { 
        id: 'typescript', label: 'TypeScript', ext: 'ts', 
        defaultCode: `console.log("Hello TypeScript");` 
    },
];

const EXAMPLE_PROJECTS: Record<string, CodeProject> = {
  is_bst: {
    id: 'proj-is-bst',
    name: 'Example: Validate BST',
    lastModified: Date.now(),
    files: [
      {
        name: 'validate_bst.cpp',
        language: 'c++',
        content: `#include <climits>
#include <stack>
#include <iostream>

struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
};

class Solution {
public:
    // Approach: Iterative In-Order Traversal
    // Time Complexity: O(N)
    // Space Complexity: O(N) in worst case (stack)
    bool isValidBST(TreeNode* root) {
        std::stack<TreeNode*> stack;
        TreeNode* prev = nullptr;
        
        while (root || !stack.empty()) {
            while (root) {
                stack.push(root);
                root = root->left;
            }
            root = stack.top();
            stack.pop();
            
            if (prev && root->val <= prev->val) return false;
            
            prev = root;
            root = root->right;
        }
        return true;
    }
};

int main() {
    // Constructing a sample BST: 
    //   2
    //  / \\
    // 1   3
    TreeNode* root = new TreeNode(2);
    root->left = new TreeNode(1);
    root->right = new TreeNode(3);

    Solution s;
    std::cout << "Is Valid BST: " << (s.isValidBST(root) ? "Yes" : "No") << std::endl;
    return 0;
}`
      }
    ]
  },
  build_bst: {
    id: 'proj-build-bst',
    name: 'Example: Build BST',
    lastModified: Date.now(),
    files: [
      {
        name: 'build_bst.cpp',
        language: 'c++',
        content: `#include <iostream>
#include <vector>

struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
};

class Solution {
public:
    // Convert Sorted Array to Height Balanced BST
    TreeNode* sortedArrayToBST(std::vector<int>& nums) {
        return build(nums, 0, nums.size() - 1);
    }
    
    TreeNode* build(std::vector<int>& nums, int left, int right) {
        if (left > right) return nullptr;
        
        int mid = left + (right - left) / 2;
        TreeNode* node = new TreeNode(nums[mid]);
        
        node->left = build(nums, left, mid - 1);
        node->right = build(nums, mid + 1, right);
        
        return node;
    }
    
    // Helper to print tree (Pre-order)
    void printTree(TreeNode* node) {
        if (!node) return;
        std::cout << node->val << " ";
        printTree(node->left);
        printTree(node->right);
    }
};

int main() {
    std::vector<int> nums = {-10, -3, 0, 5, 9};
    Solution s;
    TreeNode* root = s.sortedArrayToBST(nums);
    
    std::cout << "BST Created (Pre-order): ";
    s.printTree(root);
    std::cout << std::endl;
    
    return 0;
}`
      }
    ]
  },
  empty_cpp: {
    id: 'proj-empty-cpp',
    name: 'Interview: Empty C++',
    lastModified: Date.now(),
    files: [
      {
        name: 'solution.cpp',
        language: 'c++',
        content: `#include <iostream>
#include <vector>
#include <string>
#include <algorithm>
#include <map>
#include <set>
#include <stack>
#include <queue>

using namespace std;

// Definition for a binary tree node.
struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};

class Solution {
public:
    void solve() {
        // Your code here
    }
};

int main() {
    Solution s;
    s.solve();
    cout << "Execution Complete" << endl;
    return 0;
}`
      }
    ]
  }
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
        case 'cs': return 'c#';
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
    } else if (ext === 'java') {
        color = 'text-red-400';
        Icon = Coffee;
    } else if (ext === 'rs') {
        color = 'text-orange-600';
        Icon = FileCode;
    } else if (ext === 'go') {
        color = 'text-cyan-400';
        Icon = FileCode;
    } else if (ext === 'cpp' || ext === 'c') {
        color = 'text-blue-500';
        Icon = Code;
    } else if (ext === 'cs') {
        color = 'text-purple-400';
        Icon = Hash;
    }

    return <Icon size={14} className={color} />;
};

export const CodeStudio: React.FC<CodeStudioProps> = ({ onBack, currentUser }) => {
  const [project, setProject] = useState<CodeProject>(EXAMPLE_PROJECTS['is_bst']);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [output, setOutput] = useState('');
  const [humanComments, setHumanComments] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<'code' | 'review' | 'notes'>('code');
  const [isSaving, setIsSaving] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showExamplesDropdown, setShowExamplesDropdown] = useState(false);
  
  // Refs for scrolling sync
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Mobile check
  useEffect(() => {
      if (window.innerWidth < 768) setIsSidebarOpen(false);
      // Auto expand folders
      const allFolders: Record<string, boolean> = {};
      const uniqueFolders = new Set(project.files.map(f => f.name.includes('/') ? f.name.split('/')[0] : 'root'));
      uniqueFolders.forEach(f => {
          if (typeof f === 'string') allFolders[f] = true;
      });
      setExpandedFolders(allFolders);
  }, [project.files]);

  // Load project review and comments if available
  useEffect(() => {
      setOutput(project.review || '');
      setHumanComments(project.humanComments || '');
  }, [project]);

  const activeFile = project.files[activeFileIndex] || project.files[0];

  const handleLanguageSwitch = (langId: string) => {
      const langConfig = LANGUAGES.find(l => l.id === langId);
      if (!langConfig) return;

      const newProject: CodeProject = {
          id: `proj-${langId}-${Date.now()}`,
          name: `${langConfig.label} Playground`,
          lastModified: Date.now(),
          files: [{
              name: `solution.${langConfig.ext}`,
              language: langConfig.id as any,
              content: langConfig.defaultCode
          }],
          humanComments: '',
          review: ''
      };

      setProject(newProject);
      setActiveFileIndex(0);
      setViewMode('code');
      setShowLanguageDropdown(false);
      setHumanComments('');
      setOutput('');
  };

  const handleExampleSwitch = (exampleKey: string) => {
      const example = EXAMPLE_PROJECTS[exampleKey];
      if (!example) return;
      
      setProject({
          ...example,
          id: `proj-${exampleKey}-${Date.now()}` // Unique ID for current session
      });
      setActiveFileIndex(0);
      setViewMode('code');
      setShowExamplesDropdown(false);
      setHumanComments('');
      setOutput('');
  };

  const handleCodeChange = (newContent: string) => {
    const updatedFiles = [...project.files];
    updatedFiles[activeFileIndex] = { 
        ...activeFile, 
        content: newContent 
    };
    setProject({ ...project, files: updatedFiles });
  };

  const handleScroll = () => {
      if (textareaRef.current && lineNumbersRef.current) {
          lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
      }
  };

  const handleReviewCode = async () => {
    setIsReviewing(true);
    setViewMode('review'); // Switch to review tab immediately to show loading state
    setOutput('');
    
    try {
        const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
        if (!apiKey) throw new Error("API Key required for AI review.");
        
        const ai = new GoogleGenAI({ apiKey });
        
        const fileContext = project.files.map(f => {
            const lang = getLanguageFromFilename(f.name);
            return `--- File: ${f.name} (Language: ${lang}) ---\n${f.content}`;
        }).join('\n\n');
        
        const prompt = `
            You are a Senior Principal Software Engineer explaining this code to a student.
            
            Project Context:
            ${fileContext}
            
            Task:
            1. Analyze the **Time and Space Complexity** of the implemented algorithms.
            2. Explain the **Logic** clearly (how the recursion or stack works).
            3. Compare this implementation with other common approaches (e.g., Recursion vs Iteration trade-offs).
            4. Highlight **Language-Specific Best Practices** demonstrated in the code.
            
            Return the response in structured Markdown with clear headers.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview', 
            contents: prompt
        });
        
        const reviewText = response.text || "No feedback generated.";
        setOutput(reviewText);
        // Persist review in local project state
        setProject(prev => ({ ...prev, review: reviewText }));
        
    } catch (e: any) {
        setOutput(`Review Error: ${e.message}`);
    } finally {
        setIsReviewing(false);
    }
  };

  const handleSaveToCloud = async () => {
      if (!currentUser) return alert("Please sign in to save projects.");
      setIsSaving(true);
      try {
          // Save everything: Code, AI Review, and Human Comments
          const projectToSave = { 
              ...project, 
              review: output,
              humanComments: humanComments
          };
          await saveCodeProject(projectToSave);
          setProject(projectToSave); // Ensure local state matches saved
          alert("Project (Code, Comments, Review) saved to Cloud!");
      } catch (e: any) {
          console.error(e);
          alert("Failed to save project.");
      } finally {
          setIsSaving(false);
      }
  };

  const handleAddFile = () => {
      const name = prompt("File name (e.g. script.py):");
      if (!name) return;
      const lang: any = getLanguageFromFilename(name);
      const newFile: CodeFile = { name, language: lang, content: '// Start coding...' };
      const newFiles = [...project.files, newFile];
      setProject(prev => ({ ...prev, files: newFiles }));
      setActiveFileIndex(newFiles.length - 1);
      
      const parts = name.split('/');
      if (parts.length > 1) {
          const folderName = parts[0];
          if (folderName) {
             setExpandedFolders(prev => ({...prev, [folderName]: true}));
          }
      }
  };

  const handleDeleteFile = (idx: number, e: React.MouseEvent) => {
      e.stopPropagation();
      if (project.files.length <= 1) return alert("Cannot delete the last file.");
      if (!confirm("Delete this file?")) return;
      
      const newFiles = project.files.filter((_, i) => i !== idx);
      setProject(prev => ({ ...prev, files: newFiles }));
      if (activeFileIndex >= idx) setActiveFileIndex(Math.max(0, activeFileIndex - 1));
  };

  const toggleFolder = (folderName: string) => {
      setExpandedFolders(prev => ({...prev, [folderName]: !prev[folderName]}));
  };

  // Group files by folder
  const filesByFolder = React.useMemo(() => {
      const groups: Record<string, {file: CodeFile, index: number}[]> = {};
      project.files.forEach((file, index) => {
          const parts = file.name.split('/');
          const folderName = (parts.length > 1 && parts[0]) ? String(parts[0]) : 'root';
          if (!groups[folderName]) groups[folderName] = [];
          groups[folderName].push({ file, index });
      });
      return groups;
  }, [project.files]);

  const sortedFolders = Object.keys(filesByFolder).sort((a,b) => a === 'root' ? -1 : b === 'root' ? 1 : a.localeCompare(b));

  const lineNumbers = activeFile ? activeFile.content.split('\n').length : 0;

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-gray-300 flex flex-col font-mono overflow-hidden">
      
      {/* Top Bar */}
      <div className="h-12 bg-[#2d2d2d] border-b border-[#1e1e1e] flex items-center justify-between px-4 shrink-0">
         <div className="flex items-center gap-3">
             <button onClick={onBack} className="hover:text-white"><ArrowLeft size={18}/></button>
             <span className="text-sm font-bold text-white flex items-center gap-2">
                 <Folder size={14} className="text-blue-400"/>
                 <span className="hidden sm:inline">{project.name}</span>
             </span>
             
             {/* Examples Dropdown */}
             <div className="relative ml-2">
                 <button 
                    onClick={() => { setShowExamplesDropdown(!showExamplesDropdown); setShowLanguageDropdown(false); }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white text-xs font-bold rounded border border-[#555] transition-colors"
                 >
                    <BookOpen size={14} />
                    <span>Examples</span>
                    <ChevronDown size={14} />
                 </button>
                 
                 {showExamplesDropdown && (
                     <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowExamplesDropdown(false)}></div>
                        <div className="absolute top-full left-0 mt-2 w-56 bg-[#252526] border border-[#3d3d3d] rounded-lg shadow-xl z-50 overflow-hidden py-1">
                            <button
                                onClick={() => handleExampleSwitch('is_bst')}
                                className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-[#37373d] hover:text-white transition-colors"
                            >
                                Example: Validate BST
                            </button>
                            <button
                                onClick={() => handleExampleSwitch('build_bst')}
                                className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-[#37373d] hover:text-white transition-colors"
                            >
                                Example: Build BST
                            </button>
                            <div className="h-px bg-[#3d3d3d] my-1"></div>
                            <button
                                onClick={() => handleExampleSwitch('empty_cpp')}
                                className="w-full text-left px-4 py-2 text-xs text-emerald-400 hover:bg-[#37373d] hover:text-emerald-300 transition-colors font-bold"
                            >
                                Interview: Empty C++ Solution
                            </button>
                        </div>
                     </>
                 )}
             </div>

             {/* Language Switcher Dropdown */}
             <div className="relative">
                 <button 
                    onClick={() => { setShowLanguageDropdown(!showLanguageDropdown); setShowExamplesDropdown(false); }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white text-xs font-bold rounded border border-[#555] transition-colors"
                 >
                    <span>Language</span>
                    <ChevronDown size={14} />
                 </button>
                 
                 {showLanguageDropdown && (
                     <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowLanguageDropdown(false)}></div>
                        <div className="absolute top-full left-0 mt-2 w-48 bg-[#252526] border border-[#3d3d3d] rounded-lg shadow-xl z-50 overflow-hidden py-1">
                            {LANGUAGES.map(lang => (
                                <button
                                    key={lang.id}
                                    onClick={() => handleLanguageSwitch(lang.id)}
                                    className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-[#37373d] hover:text-white transition-colors flex items-center justify-between group"
                                >
                                    <span>{lang.label}</span>
                                    <span className="text-[10px] text-gray-500 font-mono group-hover:text-gray-400">.{lang.ext}</span>
                                </button>
                            ))}
                        </div>
                     </>
                 )}
             </div>
         </div>

         <div className="flex items-center gap-2">
             <div className="flex bg-[#1e1e1e] rounded p-0.5 border border-[#3d3d3d] mr-2">
                 <button 
                    onClick={() => setViewMode('code')}
                    className={`px-3 py-1 text-xs font-bold rounded transition-colors ${viewMode === 'code' ? 'bg-[#37373d] text-white' : 'text-gray-500 hover:text-gray-300'}`}
                 >
                    Editor
                 </button>
                 <button 
                    onClick={() => setViewMode('review')}
                    className={`px-3 py-1 text-xs font-bold rounded transition-colors flex items-center gap-1 ${viewMode === 'review' ? 'bg-[#37373d] text-white' : 'text-gray-500 hover:text-gray-300'}`}
                 >
                    AI Review
                    {output && viewMode !== 'review' && <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>}
                 </button>
                 <button 
                    onClick={() => setViewMode('notes')}
                    className={`px-3 py-1 text-xs font-bold rounded transition-colors flex items-center gap-1 ${viewMode === 'notes' ? 'bg-[#37373d] text-white' : 'text-gray-500 hover:text-gray-300'}`}
                 >
                    Notes
                    {humanComments && viewMode !== 'notes' && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>}
                 </button>
             </div>

             <button 
                onClick={handleReviewCode}
                disabled={isReviewing}
                className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-sm text-xs font-bold transition-colors"
             >
                {isReviewing ? <Loader2 size={14} className="animate-spin"/> : <Search size={14} />}
                <span>{isReviewing ? 'ANALYZING...' : 'REVIEW CODE'}</span>
             </button>
             <button 
                onClick={handleSaveToCloud}
                disabled={isSaving}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white rounded-sm text-xs font-bold transition-colors border border-gray-600"
                title="Save Project (Code, Comments, AI Review) to Firebase"
             >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
                <span className="hidden sm:inline">SAVE</span>
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
                  <span>Explorer</span>
                  <button onClick={handleAddFile} className="hover:text-white p-1 hover:bg-[#37373d] rounded"><Plus size={14}/></button>
              </div>
              <div className="flex-1 overflow-y-auto mt-1">
                  {sortedFolders.map((folder: string) => (
                      <div key={folder}>
                          {folder !== 'root' && (
                              <div 
                                onClick={() => toggleFolder(folder)}
                                className="flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-[#2a2d2e] text-xs font-bold text-gray-400 select-none"
                              >
                                  {expandedFolders[folder] ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                                  <Folder size={14} className="text-blue-300/50" />
                                  <span>{folder}</span>
                              </div>
                          )}
                          
                          {(folder === 'root' || expandedFolders[folder]) && (
                              <div>
                                  {filesByFolder[folder].map(({file, index}) => (
                                      <div
                                          key={index}
                                          onClick={() => { setActiveFileIndex(index); if(window.innerWidth<768) setIsSidebarOpen(false); setViewMode('code'); }}
                                          className={`w-full text-left px-4 py-1.5 flex items-center justify-between group cursor-pointer ${activeFileIndex === index ? 'bg-[#37373d] text-white' : 'text-gray-400 hover:bg-[#2a2d2e]'} ${folder !== 'root' ? 'pl-8' : ''}`}
                                      >
                                          <div className="flex items-center gap-2 text-sm truncate">
                                              <FileIcon filename={file.name} />
                                              <span>{folder !== 'root' ? file.name.split('/')[1] : file.name}</span>
                                          </div>
                                          {project.files.length > 1 && (
                                              <button 
                                                onClick={(e) => handleDeleteFile(index, e)}
                                                className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400"
                                              >
                                                  <X size={12} />
                                              </button>
                                          )}
                                      </div>
                                  ))}
                              </div>
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

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
              
              {/* File Tabs (Only show in Code mode) */}
              {viewMode === 'code' && (
                  <div className="flex overflow-x-auto bg-[#252526] scrollbar-thin scrollbar-thumb-[#3d3d3d] shrink-0">
                      {project.files.map((file, idx) => (
                          <div 
                            key={idx}
                            onClick={() => { setActiveFileIndex(idx); }}
                            className={`px-4 py-2 text-xs border-r border-[#1e1e1e] cursor-pointer flex items-center gap-2 min-w-[120px] hover:bg-[#2d2d2d] transition-colors ${activeFileIndex === idx ? 'bg-[#1e1e1e] text-white border-t-2 border-t-indigo-500' : 'bg-[#2d2d2d] text-gray-500'}`}
                          >
                              <FileIcon filename={file.name} />
                              <span>{file.name.split('/').pop()}</span>
                          </div>
                      ))}
                  </div>
              )}

              {viewMode === 'code' ? (
                  /* Code Editor View */
                  <div className="flex-1 relative group flex h-full">
                      {/* Line Numbers Gutter */}
                      <div 
                        ref={lineNumbersRef}
                        className="w-12 bg-[#1e1e1e] text-right pr-3 pt-4 text-slate-600 font-mono text-sm select-none border-r border-[#2d2d2d] overflow-hidden h-full"
                      >
                          {Array.from({length: lineNumbers}).map((_, i) => (
                              <div key={i} className="leading-relaxed">{i + 1}</div>
                          ))}
                      </div>

                      {/* Text Editor */}
                      <div className="flex-1 relative h-full">
                          <textarea 
                              ref={textareaRef}
                              value={activeFile?.content || ''}
                              onChange={(e) => handleCodeChange(e.target.value)}
                              onScroll={handleScroll}
                              className="w-full h-full bg-[#1e1e1e] text-gray-200 p-4 font-mono text-sm outline-none resize-none leading-relaxed whitespace-pre overflow-auto"
                              spellCheck={false}
                              autoCapitalize="off"
                              autoComplete="off"
                              autoCorrect="off"
                          />
                          {activeFile && (
                              <div className="absolute top-2 right-4 text-xs text-gray-500 bg-[#1e1e1e]/90 px-2 py-1 rounded pointer-events-none border border-[#3d3d3d]">
                                  {getLanguageFromFilename(activeFile.name).toUpperCase()}
                              </div>
                          )}
                      </div>
                  </div>
              ) : viewMode === 'notes' ? (
                  /* Human Comments View */
                  <div className="flex-1 flex flex-col bg-[#1e1e1e]">
                      <div className="px-4 py-3 bg-[#252526] text-xs font-bold text-gray-400 flex items-center justify-between border-b border-[#3d3d3d]">
                          <div className="flex items-center gap-2">
                              <Edit3 size={14} className="text-blue-400" />
                              <span>INTERVIEWER / HUMAN NOTES</span>
                          </div>
                      </div>
                      <div className="flex-1 p-4">
                          <textarea 
                              value={humanComments}
                              onChange={(e) => setHumanComments(e.target.value)}
                              className="w-full h-full bg-[#252526] text-gray-300 p-4 rounded-lg border border-[#3d3d3d] focus:border-blue-500 outline-none resize-none font-sans text-sm leading-relaxed"
                              placeholder="Type interview notes, feedback, or scratchpad ideas here..."
                          />
                      </div>
                  </div>
              ) : (
                  /* AI Review View */
                  <div className="flex-1 flex flex-col bg-[#1e1e1e] overflow-hidden">
                      <div className="px-4 py-3 bg-[#252526] text-xs font-bold text-gray-400 flex items-center justify-between border-b border-[#3d3d3d]">
                          <div className="flex items-center gap-2">
                              <MessageSquare size={14} className="text-indigo-400" />
                              <span>AI ANALYSIS & FEEDBACK</span>
                          </div>
                          {output && (
                              <button onClick={() => setOutput('')} className="hover:text-white flex items-center gap-1">
                                  <Trash2 size={12}/> Clear
                              </button>
                          )}
                      </div>
                      <div className="flex-1 p-8 overflow-y-auto">
                          {isReviewing ? (
                              <div className="h-full flex flex-col items-center justify-center text-indigo-400 space-y-4">
                                  <Loader2 size={48} className="animate-spin" />
                                  <p className="text-sm font-bold">Analyzing Code Structure...</p>
                              </div>
                          ) : output ? (
                              <div className="prose prose-invert prose-sm max-w-4xl mx-auto text-gray-300">
                                  <MarkdownView content={output} />
                              </div>
                          ) : (
                              <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-4">
                                  <Search size={48} className="opacity-20" />
                                  <div className="text-center">
                                      <p className="text-sm font-bold text-gray-500">No Review Generated Yet</p>
                                      <p className="text-xs mt-2 max-w-xs mx-auto">Click the "REVIEW CODE" button in the top bar to get an AI analysis of your current file.</p>
                                  </div>
                              </div>
                          )}
                      </div>
                  </div>
              )}
          </div>
      </div>
    </div>
  );
};
