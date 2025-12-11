
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';
import { ArrowLeft, Save, Folder, File, Code, Plus, Trash2, Loader2, ChevronRight, ChevronDown, X, MessageSquare, FileCode, FileJson, FileType, Search, Coffee, Hash, CloudUpload, Edit3, BookOpen, Bot, Send, Maximize2, Minimize2, GripVertical, UserCheck, AlertTriangle, Archive, Sparkles, Video, Mic, CheckCircle, Monitor, FileText, Eye, Github, GitBranch, GitCommit, FolderOpen, RefreshCw, GraduationCap, DownloadCloud, Terminal, Undo2, Check, Share2, Copy, Lock, Link, Image as ImageIcon, Users, UserPlus, ShieldAlert, Crown, Bug, ChevronUp, Zap, Expand, Shrink, Edit2 } from 'lucide-react';
import { GEMINI_API_KEY } from '../services/private_keys';
import { CodeProject, CodeFile, ChatMessage, Channel, GithubMetadata, CursorPosition } from '../types';
import { MarkdownView } from './MarkdownView';
import { saveCodeProject, subscribeToCodeProject, updateCodeFile, deleteCodeFile, updateCursor, claimCodeProjectLock, requestEditAccess, grantEditAccess, denyEditAccess } from '../services/firestoreService';
import { signInWithGitHub, reauthenticateWithGitHub } from '../services/authService';
import { fetchUserRepos, fetchRepoContents, commitToRepo, fetchPublicRepoInfo, fetchFileContent, fetchRepoSubTree } from '../services/githubService';
import { LiveSession } from './LiveSession';
import { encodePlantUML } from '../utils/plantuml';

interface CodeStudioProps {
  onBack: () => void;
  currentUser: any;
  sessionId?: string;
  accessKey?: string; // Secret write token from URL
  onSessionStart?: (id: string) => void;
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
    {
        id: 'plantuml', label: 'PlantUML', ext: 'puml',
        defaultCode: `@startuml\nactor User\nparticipant "Frontend" as A\nparticipant "Backend" as B\nUser -> A: Click Button\nA -> B: Request Data\nB --> A: Response\nA --> User: Show Data\n@enduml`
    }
];

const EXAMPLE_PROJECTS: Record<string, CodeProject> = {
  is_bst: {
    id: 'proj-is-bst',
    name: 'Example: Validate BST (C++23 Template)',
    lastModified: Date.now(),
    files: [
      {
        name: 'validate_bst.cpp',
        language: 'c++',
        content: `#include <iostream>
#include <memory>
#include <stack>
#include <limits>
#include <concepts>

// C++20 Concept to ensure value type is ordered
template<typename T>
concept Ordered = requires(T a, T b) {
    { a < b } -> std::convertible_to<bool>;
    { a > b } -> std::convertible_to<bool>;
};

// C++23 Style Template Node with Smart Pointers
template<Ordered T>
struct TreeNode {
    T val;
    // Using std::unique_ptr for automatic memory management (RAII)
    // No manual delete needed. Prevents memory leaks.
    std::unique_ptr<TreeNode<T>> left;
    std::unique_ptr<TreeNode<T>> right;

    TreeNode(T x) : val(x), left(nullptr), right(nullptr) {}
};

class Solution {
public:
    // Validate if the tree is a Binary Search Tree
    // Uses raw pointer for traversal to avoid ownership transfer issues
    template<Ordered T>
    bool isValidBST(const std::unique_ptr<TreeNode<T>>& root) {
        std::stack<TreeNode<T>*> stack;
        TreeNode<T>* curr = root.get();
        TreeNode<T>* prev = nullptr;
        
        while (curr != nullptr || !stack.empty()) {
            while (curr != nullptr) {
                stack.push(curr);
                curr = curr->left.get();
            }
            
            curr = stack.top();
            stack.pop();
            
            // Validation logic: In-order traversal must be strictly increasing
            if (prev != nullptr && curr->val <= prev->val) {
                return false;
            }
            
            prev = curr;
            curr = curr->right.get();
        }
        return true;
    }
};

int main() {
    // Modern C++: Use std::make_unique to prevent memory leaks automatically
    auto root = std::make_unique<TreeNode<int>>(2);
    root->left = std::make_unique<TreeNode<int>>(1);
    root->right = std::make_unique<TreeNode<int>>(3);

    Solution s;
    bool result = s.isValidBST(root);
    
    std::cout << "Is Valid BST: " << (result ? "Yes" : "No") << std::endl;
    
    // root is automatically destroyed here. No leak.
    return 0;
}`
      }
    ]
  },
};

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
        case 'cpp': case 'cc': case 'cxx': case 'h': case 'hpp': case 'hh': return 'c++';
        case 'c': return 'c';
        case 'md': return 'markdown';
        case 'cs': return 'c#';
        case 'puml': case 'plantuml': case 'iuml': return 'plantuml';
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
    } else if (['cpp', 'c', 'h', 'hpp', 'cc', 'hh', 'cxx'].includes(ext || '')) {
        color = 'text-blue-500';
        Icon = Code;
    } else if (ext === 'cs') {
        color = 'text-purple-400';
        Icon = Hash;
    } else if (ext === 'md') {
        color = 'text-gray-400';
        Icon = FileText;
    } else if (['puml', 'plantuml', 'iuml'].includes(ext || '')) {
        color = 'text-emerald-400';
        Icon = ImageIcon;
    }

    return <Icon size={14} className={color} />;
};

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children: FileNode[];
  index?: number; 
  isLoading?: boolean; 
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
  expandedFolders: Record<string, boolean>;
  toggleFolder: (path: string) => void;
  loadingFolders: Record<string, boolean>;
}> = ({ node, depth, activeFileIndex, onSelect, expandedFolders, toggleFolder, loadingFolders }) => {
  const isOpen = expandedFolders[node.path];
  const isLoading = loadingFolders[node.path];
  
  if (node.type === 'folder') {
    return (
      <>
        <button 
          onClick={() => toggleFolder(node.path)}
          className={`w-full flex items-center space-x-1 px-3 py-1.5 text-xs text-left hover:bg-slate-800 transition-colors text-slate-400 hover:text-white`}
          style={{ paddingLeft: `${depth * 12 + 12}px` }}
        >
          {isLoading ? (
             <Loader2 size={14} className="animate-spin text-indigo-400" />
          ) : isOpen ? (
             <ChevronDown size={14} />
          ) : (
             <ChevronRight size={14} />
          )}
          
          {isOpen ? <FolderOpen size={14} className="text-indigo-400" /> : <Folder size={14} className="text-indigo-400" />}
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen && node.children.map(child => (
          <FileTreeNode 
            key={child.path} 
            node={child} 
            depth={depth + 1}
            activeFileIndex={activeFileIndex}
            onSelect={onSelect}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            loadingFolders={loadingFolders}
          />
        ))}
      </>
    );
  }

  const isActive = node.index === activeFileIndex;
  return (
    <button 
      onClick={() => node.index !== undefined && onSelect(node.index)}
      className={`w-full flex items-center space-x-2 px-3 py-1.5 text-xs text-left transition-colors border-l-2 ${isActive ? 'bg-slate-800 text-white border-indigo-500' : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
      style={{ paddingLeft: `${depth * 12 + 12}px` }}
    >
      <FileIcon filename={node.name} />
      <span className="truncate">{node.name}</span>
    </button>
  );
};

const generateHighlightedHTML = (code: string, language: string) => {
  const escapeHtml = (text: string) => text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  
  const placeholders: string[] = [];
  const addPlaceholder = (htmlFragment: string) => {
    placeholders.push(htmlFragment);
    return `«PH${placeholders.length - 1}»`;
  };

  let processed = escapeHtml(code);

  if (language === 'c++' || language === 'c' || language === 'cpp') {
    processed = processed.replace(/(&quot;.*?&quot;)/g, match => addPlaceholder(`<span class="text-amber-400">${match}</span>`));
    processed = processed.replace(/(&#039;.*?&#039;)/g, match => addPlaceholder(`<span class="text-amber-300">${match}</span>`));
    processed = processed.replace(/(#include)(\s+)(&lt;.*?&gt;|&quot;.*?&quot;)/g, (_match, p1, p2, p3) => {
        return addPlaceholder(`<span class="text-pink-400">${p1}</span>`) + p2 + addPlaceholder(`<span class="text-emerald-300">${p3}</span>`);
    });
    processed = processed.replace(/(#define|#ifdef|#ifndef|#endif|#pragma|#include)/g, match => addPlaceholder(`<span class="text-pink-400">${match}</span>`));
    processed = processed.replace(/(\/\/.*)/g, match => addPlaceholder(`<span class="text-slate-500 italic">${match}</span>`));
    processed = processed.replace(/(\/\*[\s\S]*?\*\/)/g, match => addPlaceholder(`<span class="text-slate-500 italic">${match}</span>`));

    const keywords = [
      "int", "float", "double", "char", "void", "bool", "long", "short", "unsigned", "signed", 
      "struct", "class", "public", "private", "protected", "virtual", "override", "final", "static", "const", "constexpr", "concept", "requires",
      "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "default", "return", 
      "new", "delete", "this", "true", "false", "nullptr", "namespace", "using", "template", "typename",
      "try", "catch", "throw", "auto", "explicit", "friend", "inline", "mutable", "operator", 
      "std", "vector", "string", "cout", "cin", "endl", "map", "set", "stack", "queue", "pair", "unique_ptr", "shared_ptr", "make_unique", "make_shared"
    ];
    const kwRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
    processed = processed.replace(kwRegex, match => addPlaceholder(`<span class="text-blue-400 font-bold">${match}</span>`));
    processed = processed.replace(/\b([a-zA-Z_]\w*)(?=\()/g, match => addPlaceholder(`<span class="text-yellow-200">${match}</span>`));
    processed = processed.replace(/\b(\d+)\b/g, match => addPlaceholder(`<span class="text-emerald-300">${match}</span>`));
  } else if (language === 'python') {
      processed = processed.replace(/(&quot;.*?&quot;|&#039;.*?&#039;)/g, match => addPlaceholder(`<span class="text-amber-400">${match}</span>`));
      processed = processed.replace(/(#.*)/g, match => addPlaceholder(`<span class="text-slate-500 italic">${match}</span>`));
      const keywords = ["def", "return", "if", "elif", "else", "while", "for", "in", "import", "from", "class", "try", "except", "print", "True", "False", "None", "self"];
      const kwRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
      processed = processed.replace(kwRegex, match => addPlaceholder(`<span class="text-blue-400 font-bold">${match}</span>`));
      processed = processed.replace(/\b([a-zA-Z_]\w*)(?=\()/g, match => addPlaceholder(`<span class="text-yellow-200">${match}</span>`));
  }

  placeholders.forEach((ph, i) => {
    processed = processed.split(`«PH${i}»`).join(ph);
  });

  return processed;
};

const CodeCursor: React.FC<{ cursor: CursorPosition; currentLine: number; isLocal?: boolean }> = ({ cursor, currentLine, isLocal }) => {
    // Force 24px line height calculation.
    // Ensure we are working with numbers.
    const lineIndex = Math.max(0, cursor.line - 1);
    const top = lineIndex * 24;
    
    // Explicitly convert column to numbers for debug/render safety
    const colIndex = cursor.column || 0;
    
    return (
        <div 
            className={`absolute z-30 pointer-events-none transition-all duration-100 ease-out ${isLocal ? 'opacity-50' : 'opacity-100'}`}
            style={{ 
                top: `${top}px`, 
                left: `calc(${colIndex}ch)`, 
                height: `24px`
            }}
        >
            <div className={`w-0.5 h-full absolute top-0 left-0 ${isLocal ? 'animate-pulse' : ''}`} style={{ backgroundColor: cursor.color, boxShadow: `0 0 4px ${cursor.color}` }}></div>
            <div 
                className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[10px] font-bold text-white whitespace-nowrap shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: cursor.color }}
            >
                {cursor.userName}
            </div>
            {!isLocal && (
                <div 
                    className="absolute -top-4 -left-1 w-2 h-2 rounded-full"
                    style={{ backgroundColor: cursor.color }}
                    title={`${cursor.userName} (L${cursor.line})`}
                />
            )}
        </div>
    );
};

const EnhancedEditor = ({ code, language, onChange, onScroll, onSelect, textAreaRef, lineNumbersRef, isLoadingContent, scrollToLine, cursors, readOnly, localCursor }: any) => {
  const cursorMoveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      if (scrollToLine !== null && textAreaRef.current) {
          const lineHeight = 24; 
          const scrollPos = (scrollToLine - 1) * lineHeight;
          textAreaRef.current.scrollTo({ top: scrollPos, behavior: 'smooth' });
      }
  }, [scrollToLine]);

  const handleScrollLocal = (e: React.UIEvent<HTMLTextAreaElement>) => {
      // Sync Line Numbers
      if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
      
      // Sync Pre (Highlighting)
      const pre = e.currentTarget.previousElementSibling?.previousElementSibling as HTMLPreElement;
      if (pre && pre.tagName === 'PRE') { 
          pre.scrollTop = e.currentTarget.scrollTop; 
          pre.scrollLeft = e.currentTarget.scrollLeft; 
      }

      // Sync Cursors Layer
      if (cursorMoveRef.current) {
          cursorMoveRef.current.style.transform = `translateY(-${e.currentTarget.scrollTop}px)`;
      }

      // Propagate
      if (onScroll) onScroll(e);
  };

  // We explicitly set lineHeight to 24px via inline styles to avoid browser discrepancies with 'rem' based classes
  const editorStyle = {
      lineHeight: '24px',
      padding: '16px', // Matches top: 16px, left: 16px for cursor layer
      fontSize: '14px',
      fontFamily: 'monospace',
      margin: 0
  };

  return (
    <div className={`flex-1 relative bg-slate-950 flex overflow-hidden font-mono text-sm ${readOnly ? 'cursor-default' : ''}`}>
        <div 
            ref={lineNumbersRef}
            className="w-12 bg-slate-900 border-r border-slate-800 text-right text-slate-600 select-none overflow-hidden flex-shrink-0 font-mono"
            style={{ paddingTop: '16px', paddingBottom: '16px', paddingRight: '12px', lineHeight: '24px', fontSize: '14px' }}
        >
            {code.split('\n').map((_: any, i: number) => (
                <div key={i} className={scrollToLine === (i + 1) ? "text-yellow-400 font-bold bg-yellow-900/20" : ""}>{i + 1}</div>
            ))}
        </div>
        
        <div className="relative flex-1 h-full overflow-hidden group">
            {isLoadingContent && (
               <div className="absolute inset-0 bg-slate-950/80 z-20 flex flex-col items-center justify-center">
                  <Loader2 className="animate-spin text-indigo-400 mb-2" size={32} />
                  <span className="text-slate-400 text-xs">Fetching file content...</span>
               </div>
            )}

            <pre
                className="absolute top-0 left-0 w-full h-full pointer-events-none whitespace-pre overflow-hidden border-0"
                aria-hidden="true"
                style={{ ...editorStyle, tabSize: 4 }}
            >
                <code 
                    dangerouslySetInnerHTML={{ __html: generateHighlightedHTML(code, language) + '<br/>' }} 
                />
            </pre>
            
            {/* Cursor Layer - Matches Textarea Padding (16px) using explicit absolute coordinates */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden font-mono" style={{ lineHeight: '24px', fontSize: '14px' }}>
                <div ref={cursorMoveRef} className="absolute w-full" style={{ top: '16px', left: '16px' }}>
                    {cursors && cursors.map((c: CursorPosition) => (
                        <CodeCursor key={c.clientId || c.userId} cursor={c} currentLine={0} />
                    ))}

                    {/* Render local cursor for Read-Only users so they see where they are */}
                    {readOnly && localCursor && (
                        <CodeCursor 
                            cursor={{ 
                                clientId: 'local-ghost', 
                                userId: 'me', 
                                userName: 'You', 
                                fileName: '', 
                                line: localCursor.line, 
                                column: localCursor.column, 
                                color: '#94a3b8', // Gray
                                updatedAt: Date.now() 
                            }} 
                            currentLine={0}
                            isLocal={true}
                        />
                    )}
                </div>
            </div>

            <textarea
                ref={textAreaRef}
                value={code}
                onChange={(e) => onChange(e.target.value)}
                onScroll={handleScrollLocal}
                onSelect={onSelect}
                onClick={onSelect}
                onKeyUp={onSelect}
                className={`absolute top-0 left-0 w-full h-full border-0 bg-transparent text-transparent caret-white outline-none resize-none whitespace-pre overflow-auto ${readOnly ? 'pointer-events-auto' : ''}`}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                readOnly={readOnly}
                style={{ ...editorStyle, tabSize: 4 }}
            />
        </div>
    </div>
  );
};

const updateFileTool: FunctionDeclaration = {
    name: 'update_file',
    description: 'Completely overwrite the active file with new code. YOU MUST PROVIDE THE FULL FILE CONTENT, DO NOT PROVIDE SNIPPETS OR PARTIAL UPDATES.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            code: { type: Type.STRING, description: 'The complete new source code for the file.' }
        },
        required: ['code']
    }
};

const PlantUMLPreview = ({ code }: { code: string }) => {
    const [encodedCode, setEncodedCode] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const process = async () => {
            if (!code.trim()) return;
            setLoading(true);
            setError(null);
            try {
                const encoded = await encodePlantUML(code);
                setEncodedCode(encoded);
            } catch (e: any) {
                setError(e.message || "Encoding error");
            } finally {
                setLoading(false);
            }
        };
        const timer = setTimeout(process, 800);
        return () => clearTimeout(timer);
    }, [code]);

    const handleDownload = async (format: 'svg' | 'png' | 'pdf') => {
        if (!encodedCode) return;
        const url = `https://www.plantuml.com/plantuml/${format}/${encodedCode}`;
        
        if (format === 'pdf') {
             window.open(url, '_blank');
             return;
        }

        try {
            const res = await fetch(url);
            if(!res.ok) throw new Error("Failed to fetch");
            const blob = await res.blob();
            const localUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = localUrl;
            a.download = `diagram.${format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(localUrl);
        } catch(e) {
            window.open(url, '_blank');
        }
    };

    return (
        <div className="flex-1 bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden">
             <div className="p-2 border-b border-slate-800 bg-slate-900 flex justify-end gap-2 shrink-0">
                <button onClick={() => handleDownload('png')} disabled={!encodedCode} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 hover:text-white rounded flex items-center gap-2 transition-colors disabled:opacity-50 border border-slate-700">
                    <ImageIcon size={14} /> PNG
                </button>
                <button onClick={() => handleDownload('svg')} disabled={!encodedCode} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 hover:text-white rounded flex items-center gap-2 transition-colors disabled:opacity-50 border border-slate-700">
                    <Code size={14} /> SVG
                </button>
                <button onClick={() => handleDownload('pdf')} disabled={!encodedCode} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 hover:text-white rounded flex items-center gap-2 transition-colors disabled:opacity-50 border border-slate-700">
                    <FileText size={14} /> PDF
                </button>
             </div>

             <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-center bg-slate-900/50">
                {loading && <div className="text-indigo-400 flex flex-col items-center"><Loader2 className="animate-spin mb-2" size={24}/><span>Rendering...</span></div>}
                {error && <div className="text-red-400 p-4 border border-red-500/20 bg-red-900/10 rounded">{error}</div>}
                {!loading && !error && encodedCode && (
                    <div className="bg-white p-4 rounded-lg shadow-xl overflow-auto max-w-full border border-slate-600">
                        <img src={`https://www.plantuml.com/plantuml/svg/${encodedCode}`} alt="Diagram" className="max-w-full" />
                    </div>
                )}
                {!loading && !encodedCode && !error && <div className="text-slate-500">Preview will appear here...</div>}
            </div>
        </div>
    );
};

export const CodeStudio: React.FC<CodeStudioProps> = ({ onBack, currentUser, sessionId, accessKey, onSessionStart }) => {
  const [project, setProject] = useState<CodeProject>(EXAMPLE_PROJECTS['is_bst']);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [loadingFolders, setLoadingFolders] = useState<Record<string, boolean>>({}); 
  const [activeSideView, setActiveSideView] = useState<'none' | 'chat' | 'tutor' | 'review'>('chat');
  const [sidebarTab, setSidebarTab] = useState<'explorer' | 'search'>('explorer');
  const [isSaving, setIsSaving] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showExamplesDropdown, setShowExamplesDropdown] = useState(false);
  const [showShareDropdown, setShowShareDropdown] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [tutorSessionId, setTutorSessionId] = useState<string>(''); 
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<{fileIndex: number, fileName: string, line: number, content: string}[]>([]);
  const [scrollToLine, setScrollToLine] = useState<number | null>(null);
  const [selection, setSelection] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatWidth, setChatWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false); 
  const [publicRepoPath, setPublicRepoPath] = useState('');
  const [isLoadingPublic, setIsLoadingPublic] = useState(false);
  const [repos, setRepos] = useState<any[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [needsGitHubReauth, setNeedsGitHubReauth] = useState(false);
  const [isSharedSession, setIsSharedSession] = useState(false);
  const [showDebug, setShowDebug] = useState(true); // Toggle for Cursor Debugger
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // File Rename State
  const [renamingFileIndex, setRenamingFileIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  
  // WRITE ACCESS STATE
  const [isReadOnly, setIsReadOnly] = useState(false); 
  const [hasWritePermission, setHasWritePermission] = useState(false); 

  // Local user's current cursor position (even if read-only)
  const [localCursor, setLocalCursor] = useState<{ line: number, column: number } | null>(null);

  const [guestId] = useState(() => 'guest_' + Math.floor(Math.random() * 10000));
  
  // Use Session Storage for Client ID to persist across refreshes but expire on tab close
  const [localClientId] = useState(() => {
      const stored = sessionStorage.getItem('code_studio_client_id');
      if (stored) return stored;
      const newId = crypto.randomUUID();
      sessionStorage.setItem('code_studio_client_id', newId);
      return newId;
  });
  
  const [remoteCursors, setRemoteCursors] = useState<CursorPosition[]>([]);
  const cursorUpdateTimerRef = useRef<any>(null);
  
  const autoSaveTimerRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // REFS for state access inside callbacks/closures
  const activeFileIndexRef = useRef(0);

  const activeFile = project.files[activeFileIndex] || project.files[0];
  const isMarkdown = activeFile ? activeFile.name.toLowerCase().endsWith('.md') : false;
  const isPlantUML = activeFile ? ['puml', 'plantuml', 'iuml'].includes(activeFile.name.split('.').pop()?.toLowerCase() || '') : false;
  const isGithubLinked = currentUser?.providerData?.some((p: any) => p.providerId === 'github.com');
  const myUserId = currentUser?.uid || guestId;
  const isOwner = currentUser && (currentUser.uid === project.ownerId || currentUser.email === 'shengliang.song@gmail.com');

  const fileTree = React.useMemo(() => buildFileTree(project.files, expandedFolders), [project.files, expandedFolders]);

  // Sync ref
  useEffect(() => { activeFileIndexRef.current = activeFileIndex; }, [activeFileIndex]);

  useEffect(() => {
      if (sessionId) {
          setIsSharedSession(true);
          const unsubscribe = subscribeToCodeProject(sessionId, (remoteProject) => {
              // Extract all cursors for leader election
              const allCursors = Object.values(remoteProject.cursors || {});
              const otherCursors = allCursors.filter(c => c.userId !== myUserId);
              setRemoteCursors(otherCursors);

              // Leader Election: Smallest ClientID wins (handles deadlocks if owner leaves)
              const allClientIds = allCursors.map(c => c.clientId);
              if (!allClientIds.includes(localClientId)) {
                  if (allClientIds.length === 0) allClientIds.push(localClientId);
              }
              allClientIds.sort();
              const leaderClientId = allClientIds[0];
              const isSessionLeader = localClientId === leaderClientId;
              
              // ACCESS CONTROL LOGIC
              // @ts-ignore
              const projectWriteToken = remoteProject.writeToken;
              
              // Base permission: Owner of Project OR has Token OR is Session Leader
              const isProjectOwner = currentUser && (currentUser.uid === remoteProject.ownerId);
              const hasToken = projectWriteToken && accessKey === projectWriteToken;
              const effectiveAdmin = isProjectOwner || hasToken || isSessionLeader;
              
              setHasWritePermission(effectiveAdmin);

              // Multi-write strategy:
              // If effectiveAdmin, we are allowed to write.
              // We accept remote updates, BUT we preserve our local active file IF we are actively typing.
              
              setProject(prev => {
                  const canEdit = effectiveAdmin;
                  
                  if (canEdit) {
                      setIsReadOnly(false);
                      
                      // Check if typing (autoSaveTimer is non-null)
                      const isTyping = !!autoSaveTimerRef.current;
                      const activeFileName = prev.files[activeFileIndexRef.current]?.name;

                      // Smart Merge
                      const mergedFiles = remoteProject.files.map(remoteFile => {
                          if (isTyping && remoteFile.name === activeFileName) {
                              // We are typing in this file, ignore remote update for now to avoid jump/overwrite
                              // We will push our changes via autoSave soon anyway.
                              return prev.files.find(f => f.name === activeFileName) || remoteFile;
                          }
                          return remoteFile;
                      });
                      
                      return { ...remoteProject, files: mergedFiles };
                  } else {
                      // Reader: Always take full state
                      setIsReadOnly(true);
                      return remoteProject;
                  }
              });
          });
          return () => unsubscribe();
      }
  }, [sessionId, myUserId, localClientId, accessKey, currentUser]); 

  const handleCursorUpdate = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      // Send cursor updates even if read-only so others can see where I am looking
      
      const target = e.currentTarget;
      const val = target.value;
      const selStart = target.selectionStart;
      
      const lines = val.substring(0, selStart).split("\n");
      const line = lines.length;
      const column = lines[lines.length - 1].length;
      
      setLocalCursor({ line, column });

      if (cursorUpdateTimerRef.current) clearTimeout(cursorUpdateTimerRef.current);
      cursorUpdateTimerRef.current = setTimeout(() => {
          if (isSharedSession) {
              updateCursor(project.id, {
                  clientId: localClientId,
                  userId: myUserId,
                  userName: currentUser?.displayName || 'Guest',
                  fileName: activeFile.name,
                  line,
                  column,
                  color: '#'+Math.floor(Math.random()*16777215).toString(16), 
                  updatedAt: Date.now()
              });
          }
      }, 500); 
      
      setSelection(target.selectionStart !== target.selectionEnd ? val.substring(target.selectionStart, target.selectionEnd) : '');
  };

  // ... (Keep debounce, loadContent, effects, etc. unchanged)
  const [debouncedFileContext, setDebouncedFileContext] = useState('');
  useEffect(() => {
      const handler = setTimeout(() => {
          if (!activeFile) return;
          const content = activeFile.content.length > 20000 
              ? activeFile.content.substring(0, 20000) + "\n...[Content Truncated]..."
              : activeFile.content;
          setDebouncedFileContext(`[USER ACTIVITY UPDATE]\nCurrent File: ${activeFile.name}\n${selection ? `SELECTED: ${selection}` : ''}\n---\n${content}`);
      }, 1500);
      return () => clearTimeout(handler);
  }, [activeFile, selection, project.files]); 

  useEffect(() => {
      const loadContent = async () => {
          if (activeFile && activeFile.isDirectory !== true && activeFile.loaded === false && !isLoadingFile) {
              setIsLoadingFile(true);
              try {
                  const content = await fetchFileContent(githubToken, project.github?.owner || '', project.github?.repo || '', activeFile.path || activeFile.name, project.github?.branch);
                  setProject(prev => {
                      const newFiles = [...prev.files];
                      newFiles[activeFileIndex] = { ...activeFile, content, loaded: true };
                      return { ...prev, files: newFiles };
                  });
              } catch(e) { console.error(e); } finally { setIsLoadingFile(false); }
          }
      };
      const timeout = setTimeout(loadContent, 50);
      return () => clearTimeout(timeout);
  }, [activeFileIndex, project.github, githubToken]);

  const handleSearch = (term: string) => {
      setSearchTerm(term);
      if (!term.trim()) { setSearchResults([]); return; }
      const results: any[] = [];
      project.files.forEach((file, fIdx) => {
          if (file.isDirectory || file.loaded === false) return; 
          file.content.split('\n').forEach((line, lIdx) => {
              if (line.toLowerCase().includes(term.toLowerCase())) {
                  results.push({ fileIndex: fIdx, fileName: file.name, line: lIdx + 1, content: line.trim() });
              }
          });
      });
      setSearchResults(results);
  };

  const toggleFolder = async (path: string) => {
      const isCurrentlyOpen = expandedFolders[path];
      if (!isCurrentlyOpen) {
          const folderEntry = project.files.find(f => f.name === path && f.isDirectory);
          if (folderEntry && !folderEntry.childrenFetched && folderEntry.treeSha) {
              setLoadingFolders(prev => ({ ...prev, [path]: true }));
              try {
                  const newFiles = await fetchRepoSubTree(githubToken, project.github?.owner || '', project.github?.repo || '', folderEntry.treeSha, path);
                  setProject(prev => {
                      const updatedFiles = prev.files.map(f => f.name === path ? { ...f, childrenFetched: true } : f);
                      const uniqueNewFiles = newFiles.filter(f => !new Set(prev.files.map(f => f.name)).has(f.name));
                      return { ...prev, files: [...updatedFiles, ...uniqueNewFiles] };
                  });
              } catch (e) { alert("Failed to load folder."); } finally { setLoadingFolders(prev => ({ ...prev, [path]: false })); }
          }
      }
      setExpandedFolders(prev => ({ ...prev, [path]: !isCurrentlyOpen }));
  };

  const startResizing = (mouseDownEvent: React.MouseEvent) => {
      mouseDownEvent.preventDefault();
      const startX = mouseDownEvent.clientX;
      const startWidth = chatWidth;
      const doDrag = (dragEvent: MouseEvent) => setChatWidth(Math.max(250, Math.min(startWidth + (startX - dragEvent.clientX), 800)));
      const stopDrag = () => {
          document.removeEventListener('mousemove', doDrag);
          document.removeEventListener('mouseup', stopDrag);
          setIsResizing(false);
      };
      document.addEventListener('mousemove', doDrag);
      document.addEventListener('mouseup', stopDrag);
      setIsResizing(true);
  };

  const handleAddFile = (langId: string) => {
      if (isReadOnly) return;
      const langConfig = LANGUAGES.find(l => l.id === langId);
      if (!langConfig) return;
      const baseName = "code";
      let fileName = `${baseName}.${langConfig.ext}`;
      let counter = 1;
      while (project.files.some(f => f.name === fileName)) { fileName = `${baseName}_${counter}.${langConfig.ext}`; counter++; }
      const newFile: CodeFile = { name: fileName, language: langConfig.id as any, content: langConfig.defaultCode, loaded: true };
      
      if (isSharedSession) {
          updateCodeFile(project.id, newFile);
      }
      
      setProject(prev => ({ ...prev, files: [...prev.files, newFile] }));
      setActiveFileIndex(project.files.length);
      setShowLanguageDropdown(false);
      setIsPreviewMode(false);
  };

  const handleExampleSwitch = (exampleKey: string) => {
      setProject({ ...EXAMPLE_PROJECTS[exampleKey], id: `proj-${exampleKey}-${Date.now()}` });
      setActiveFileIndex(0);
      setActiveSideView('none');
      setShowExamplesDropdown(false);
      setChatMessages([]);
      setIsPreviewMode(false);
  };

  const updateFileAtIndex = (index: number, newContent: string) => {
      if (isReadOnly) return;
      
      const updatedProject = { ...project };
      const updatedFiles = [...updatedProject.files];
      
      updatedFiles[index] = {
          ...updatedFiles[index],
          content: newContent,
          loaded: true
      };
      updatedProject.files = updatedFiles;
      
      // Send update to Firestore immediately (debounced locally by typing speed, but firestore handles overwrite)
      if (isSharedSession) {
          if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
          // 800ms debounce to avoid spamming Firestore, but feel responsive
          autoSaveTimerRef.current = setTimeout(() => {
              updateCodeFile(project.id, updatedFiles[index]);
              autoSaveTimerRef.current = null;
          }, 800); 
      }
      
      setProject(updatedProject);
  };

  const handleCodeChange = (newContent: string) => {
      updateFileAtIndex(activeFileIndex, newContent);
  };

  const startRenaming = (index: number, currentName: string) => {
      if (isReadOnly) return;
      setRenamingFileIndex(index);
      setRenameValue(currentName);
  };

  const confirmRename = () => {
      if (renamingFileIndex === null) return;
      
      const newName = renameValue.trim();
      const oldName = project.files[renamingFileIndex].name;
      
      if (!newName || newName === oldName) {
          setRenamingFileIndex(null);
          return;
      }
      
      const updatedFiles = [...project.files];
      updatedFiles[renamingFileIndex] = { ...updatedFiles[renamingFileIndex], name: newName };
      
      if (isSharedSession) {
          // Delete old entry and add new entry
          deleteCodeFile(project.id, oldName);
          updateCodeFile(project.id, updatedFiles[renamingFileIndex]);
      }
      
      setProject({ ...project, files: updatedFiles });
      setRenamingFileIndex(null);
  };

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
      if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
      const pre = e.currentTarget.previousElementSibling as HTMLPreElement;
      if (pre) { pre.scrollTop = e.currentTarget.scrollTop; pre.scrollLeft = e.currentTarget.scrollLeft; }
  };

  const handleShare = async (mode: 'read' | 'edit') => {
      if (!currentUser) { alert("Please sign in to share."); return; }
      setIsSaving(true);
      try {
          // If we already have a session ID passed down, reuse it.
          // Otherwise, generate a new one.
          let sessionToUse = sessionId;
          
          if (!sessionToUse) {
              sessionToUse = crypto.randomUUID();
          }

          // Generate or retrieve Write Token
          // If the project already has one, reuse it. Else make one.
          let writeToken = (project as any).writeToken;
          if (!writeToken) {
              writeToken = crypto.randomUUID();
          }

          // Initial Save to unified ID (if not already saved or if this is the first share)
          if (!sessionId || !(project as any).writeToken) {
              let projectToSave = { ...project };
              // Ensure we save it with the session ID as the doc ID
              projectToSave = { ...projectToSave, id: sessionToUse, ownerId: currentUser.uid, writeToken } as any;
              setProject(projectToSave);
              await saveCodeProject(projectToSave);
              
              // Notify App to update URL/State (only if it's new)
              if (onSessionStart && !sessionId) {
                  onSessionStart(sessionToUse);
              }
          }
          
          const url = new URL(window.location.href);
          // Set unified session param
          url.searchParams.set('session', sessionToUse);
          
          if (mode === 'edit') {
              url.searchParams.set('key', writeToken); // Use key instead of mode=edit
          } else {
              url.searchParams.delete('key'); 
          }
          // Remove insecure mode parameter
          url.searchParams.delete('mode');
          
          await navigator.clipboard.writeText(url.toString());
          alert(`${mode === 'edit' ? 'Edit' : 'Read-Only'} Link Copied!\n\n${url.toString()}`);
          
          setIsSharedSession(true);
          setShowShareDropdown(false);
      } catch(e: any) { alert(`Failed to share: ${e.message}`); } finally { setIsSaving(false); }
  };

  const handleGitHubConnect = async () => {
      try {
          const res = (needsGitHubReauth || isGithubLinked) ? await reauthenticateWithGitHub() : await signInWithGitHub();
          if (res.token) {
              setGithubToken(res.token);
              setShowImportModal(false); 
              
              // Only open repo selector if we don't have a project loaded, 
              // implies we are connecting to load something.
              // If project is already loaded, assume user just wanted to auth for commit.
              if (!project.github) {
                  setShowGithubModal(true);
                  setIsLoadingRepos(true);
                  setRepos(await fetchUserRepos(res.token));
                  setIsLoadingRepos(false);
              } else {
                  alert("GitHub Connected Successfully!");
              }
          }
      } catch(e: any) { alert("GitHub Login Failed: " + e.message); }
  };

  const handleLoadPublicRepo = async (overridePath?: string) => {
      const path = overridePath || publicRepoPath;
      if (!path.trim()) return;
      setIsLoadingPublic(true); if (overridePath) setIsLoadingFile(true);
      try {
          const [owner, repo] = path.split('/');
          const info = await fetchPublicRepoInfo(owner, repo);
          const { files, latestSha } = await fetchRepoContents(githubToken, owner, repo, info.default_branch);
          setProject({ id: `gh-${info.id}`, name: info.full_name, files, lastModified: Date.now(), github: { owner, repo, branch: info.default_branch, sha: latestSha } });
          setActiveFileIndex(0); setShowImportModal(false); setPublicRepoPath(''); setExpandedFolders({});
      } catch (e: any) { alert("Failed: " + e.message); } finally { setIsLoadingPublic(false); setIsLoadingFile(false); }
  };

  const handleRepoSelect = async (repo: any) => {
      setIsLoadingRepos(true);
      try {
          if (!githubToken) throw new Error("No token");
          const { files, latestSha } = await fetchRepoContents(githubToken, repo.owner.login, repo.name, repo.default_branch);
          setProject({ id: `gh-${repo.id}`, name: repo.full_name, files, lastModified: Date.now(), github: { owner: repo.owner.login, repo: repo.name, branch: repo.default_branch, sha: latestSha } });
          setActiveFileIndex(0); setShowGithubModal(false); setExpandedFolders({});
      } catch(e: any) { alert("Failed: " + e.message); } finally { setIsLoadingRepos(false); }
  };

  const handleCommit = async () => {
      if (isReadOnly) return;
      if (!githubToken) {
          alert("Please connect your GitHub account to commit changes.");
          setShowImportModal(true);
          return;
      }
      if (!commitMessage.trim() || !project.github) return;
      setIsCommitting(true);
      try {
          const newSha = await commitToRepo(githubToken, project, commitMessage);
          setProject(prev => ({ ...prev, github: prev.github ? { ...prev.github, sha: newSha } : undefined }));
          alert("Pushed successfully!"); setShowCommitModal(false); setCommitMessage('');
      } catch(e: any) { alert("Commit failed: " + e.message); } finally { setIsCommitting(false); }
  };

  const handleGenerateQuestions = async () => {
      if (isReadOnly) return;
      setIsGeneratingQuestions(true);
      try {
          const ai = new GoogleGenAI({ apiKey: localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || '' });
          const response = await ai.models.generateContent({ model: 'gemini-3-pro-preview', contents: "Generate 2 coding interview questions..." });
          const content = response.text || "Failed.";
          const qFile: CodeFile = { name: `interview_q_${Date.now()}.md`, language: 'markdown', content, loaded: true };
          const sFile: CodeFile = { name: `solution_${Date.now()}.cpp`, language: 'c++', content: '', loaded: true };
          
          if (isSharedSession) { updateCodeFile(project.id, qFile); updateCodeFile(project.id, sFile); }
          setProject(prev => ({ ...prev, files: [...prev.files, qFile, sFile] }));
          setActiveFileIndex(project.files.length + 1); setIsSidebarOpen(true);
      } catch(e: any) { alert(`Error: ${e.message}`); } finally { setIsGeneratingQuestions(false); }
  };

  const handleSaveProject = async () => {
      if (!currentUser) return alert("Sign in required.");
      if (isReadOnly) return alert("Read-only mode.");
      setIsSaving(true);
      try { await saveCodeProject(project); alert("Saved!"); } catch(e) { alert("Failed."); } finally { setIsSaving(false); }
  };

  const handleLiveCodeUpdate = async (name: string, args: any) => {
      if (name === 'update_file') {
          const newCode = args.code;
          if (newCode && !isReadOnly) {
              updateFileAtIndex(activeFileIndex, newCode);
              return "File updated.";
          } else if (isReadOnly) {
              return "Error: User is in Read-Only mode. Cannot update file.";
          }
      }
      return "Unknown tool";
  };

  const handleSendChatMessage = async () => {
      if (!chatInput.trim()) return;
      const userMsg: ChatMessage = { role: 'user', text: chatInput };
      setChatMessages(prev => [...prev, userMsg]);
      setChatInput('');
      setIsChatLoading(true);

      try {
          const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
          if (!apiKey) {
              throw new Error("API Key is missing.");
          }
          const ai = new GoogleGenAI({ apiKey });
          
          // Contextualize
          const context = activeFile ? `Current File: ${activeFile.name}\n\`\`\`${activeFile.language}\n${activeFile.content}\n\`\`\`\n` : '';
          const systemPrompt = "You are an expert coding assistant. Answer the user's question based on the provided code context. Be concise and helpful.";
          
          // Flatten history for simple generation (avoids strict chat history validation issues)
          let conversationText = `System: ${systemPrompt}\n\n`;
          if (context) conversationText += `Context:\n${context}\n\n`;
          
          chatMessages.forEach(m => {
              conversationText += `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}\n`;
          });
          conversationText += `User: ${userMsg.text}\nAssistant:`;

          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: conversationText,
              config: {
                  // Enable tools for the chat model
                  tools: [{ functionDeclarations: [updateFileTool] }]
              }
          });

          // Check for tool calls first
          if (response.functionCalls && response.functionCalls.length > 0) {
              const fc = response.functionCalls[0];
              if (fc.name === 'update_file') {
                  const newCode = fc.args.code;
                  if (typeof newCode === 'string') {
                      if (isReadOnly) {
                          setChatMessages(prev => [...prev, { role: 'ai', text: "I cannot edit the file because you are in Read-Only mode." }]);
                      } else {
                          updateFileAtIndex(activeFileIndex, newCode);
                          setChatMessages(prev => [...prev, { role: 'ai', text: `*I have updated the file ${activeFile.name} with the requested changes.*` }]);
                      }
                  } else {
                      setChatMessages(prev => [...prev, { role: 'ai', text: "Error: Invalid code format received from tool." }]);
                  }
              }
          } else {
              const responseText = response.text || "No response.";
              setChatMessages(prev => [...prev, { role: 'ai', text: responseText }]);
          }
      } catch(e: any) {
          setChatMessages(prev => [...prev, { role: 'ai', text: `Error: ${e.message}` }]);
      } finally {
          setIsChatLoading(false);
          // Scroll to bottom
          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
        containerRef.current?.requestFullscreen().catch(err => {
            alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
        setIsFullscreen(true);
    } else {
        document.exitFullscreen();
        setIsFullscreen(false);
    }
  };

  useEffect(() => {
      const handleFsChange = () => {
          setIsFullscreen(!!document.fullscreenElement);
      };
      document.addEventListener('fullscreenchange', handleFsChange);
      return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden relative">
      
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
               {!isReadOnly && (
               <button onClick={handleSaveProject} disabled={isSaving} className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors">
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
               </button>
               )}
               
               {/* ALWAYS Show Import/Connect Button (So users can authenticate) */}
               {!isReadOnly && (
                   <button onClick={() => setShowImportModal(true)} className={`p-2 hover:bg-slate-700 rounded transition-colors ${(needsGitHubReauth || isGithubLinked || githubToken) ? 'text-amber-400 hover:text-amber-200' : 'text-slate-400 hover:text-white'}`} title="Manage Repository / Connect GitHub">
                       {(needsGitHubReauth || isGithubLinked || githubToken) ? <RefreshCw size={16} /> : <Github size={16} />}
                   </button>
               )}

               {/* Commit Button (Only if Repo is loaded) */}
               {project.github && !isReadOnly && (
                   <button onClick={() => setShowCommitModal(true)} className="p-2 hover:bg-slate-700 rounded text-emerald-400 hover:text-white transition-colors" title="Commit Changes">
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

            <div className="relative">
                <button onClick={() => setShowExamplesDropdown(!showExamplesDropdown)} className="flex items-center space-x-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors shadow-lg shadow-indigo-500/20">
                    <BookOpen size={14} /> <span>Examples</span>
                </button>
                {showExamplesDropdown && (
                    <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowExamplesDropdown(false)}></div>
                    <div className="absolute top-full right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-40 overflow-hidden py-1">
                        <div className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase">Offline Templates</div>
                        {Object.keys(EXAMPLE_PROJECTS).map(key => (
                            <button key={key} onClick={() => handleExampleSwitch(key)} className="w-full text-left px-4 py-2 hover:bg-slate-800 text-xs text-slate-300 hover:text-white">
                                {EXAMPLE_PROJECTS[key].name}
                            </button>
                        ))}
                        <div className="border-t border-slate-800 my-1"></div>
                        <button onClick={() => { setShowExamplesDropdown(false); handleLoadPublicRepo("Shengliang/codestudio"); }} className="w-full text-left px-4 py-2 hover:bg-slate-800 text-xs text-indigo-300 hover:text-white flex items-center gap-2">
                            <Github size={12} /> Load Shengliang/codestudio
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

      <div className="flex-1 flex overflow-hidden relative">
         
         <div className={`${isSidebarOpen ? 'w-64' : 'w-0'} bg-slate-900 border-r border-slate-800 flex-shrink-0 transition-all duration-300 overflow-hidden flex flex-col`}>
            <div className="flex border-b border-slate-800 shrink-0">
               <button onClick={() => setSidebarTab('explorer')} className={`flex-1 py-2 text-xs font-bold flex justify-center items-center gap-1 ${sidebarTab === 'explorer' ? 'bg-slate-800 text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-white'}`}>
                  <FolderOpen size={14}/> Explorer
               </button>
               <button onClick={() => setSidebarTab('search')} className={`flex-1 py-2 text-xs font-bold flex justify-center items-center gap-1 ${sidebarTab === 'search' ? 'bg-slate-800 text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-white'}`}>
                  <Search size={14}/> Search
               </button>
            </div>

            <div className="flex-1 overflow-y-auto">
               {sidebarTab === 'explorer' ? (
                  <div className="p-2 space-y-0.5">
                     {fileTree.map(node => (
                       <FileTreeNode 
                           key={node.path}
                           node={node}
                           depth={0}
                           activeFileIndex={activeFileIndex}
                           onSelect={(idx) => { setActiveFileIndex(idx); setSelection(''); }}
                           expandedFolders={expandedFolders}
                           toggleFolder={toggleFolder}
                           loadingFolders={loadingFolders}
                       />
                     ))}
                  </div>
               ) : (
                  <div className="p-4 flex flex-col h-full">
                     <div className="relative mb-4">
                        <input type="text" placeholder="Find in files..." value={searchTerm} onChange={(e) => handleSearch(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"/>
                        <Search size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"/>
                     </div>
                     <div className="flex-1 overflow-y-auto space-y-2">
                        {searchResults.map((res, i) => (
                              <div key={i} onClick={() => { setActiveFileIndex(res.fileIndex); setScrollToLine(res.line); setTimeout(() => setScrollToLine(null), 1000); }} className="bg-slate-800/50 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 p-2 rounded cursor-pointer group">
                                 <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-bold text-indigo-300 truncate">{res.fileName.split('/').pop()}</span>
                                    <span className="text-[10px] text-slate-500 font-mono">L{res.line}</span>
                                 </div>
                                 <div className="text-[10px] text-slate-400 font-mono bg-slate-950/50 p-1 rounded truncate">{res.content}</div>
                              </div>
                        ))}
                     </div>
                  </div>
               )}
            </div>
         </div>

         <div className="flex-1 flex flex-col min-w-0 relative">
            <div className="flex items-center bg-slate-900 border-b border-slate-800 px-2 overflow-x-auto scrollbar-hide">
               <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-500 hover:text-white mr-2">
                  {isSidebarOpen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}
               </button>
               {project.files.map((file, idx) => {
                  return (
                  <div key={idx} onClick={() => setActiveFileIndex(idx)} className={`group relative flex items-center space-x-2 px-4 py-2.5 border-r border-slate-800 cursor-pointer min-w-[140px] max-w-[220px] ${activeFileIndex === idx ? 'bg-slate-950 text-white border-t-2 border-t-indigo-500' : 'bg-slate-900 text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}>
                     <FileIcon filename={file.name} />
                     
                     {renamingFileIndex === idx ? (
                         <input 
                            autoFocus
                            type="text" 
                            value={renameValue} 
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') confirmRename();
                                if (e.key === 'Escape') setRenamingFileIndex(null);
                            }}
                            onBlur={confirmRename}
                            className="bg-slate-800 text-xs text-white outline-none w-full border border-indigo-500 rounded px-1"
                         />
                     ) : (
                         <span className="text-xs font-medium truncate flex-1" title={file.name}>{file.name.split('/').pop()}</span>
                     )}

                     {!isReadOnly && renamingFileIndex !== idx && (
                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                            <button className="text-slate-500 hover:text-indigo-400 mr-1" onClick={(e) => { e.stopPropagation(); startRenaming(idx, file.name); }}>
                               <Edit2 size={10} />
                            </button>
                            <button className="text-slate-500 hover:text-red-400" onClick={(e) => { e.stopPropagation(); if (isSharedSession) deleteCodeFile(project.id, file.name); setProject(prev => ({ ...prev, files: prev.files.filter((_, i) => i !== idx) })); }}>
                               <X size={12} />
                            </button>
                        </div>
                     )}
                  </div>
               )})}
            </div>

            <div className="flex-1 relative bg-slate-950 flex overflow-hidden">
                {(isMarkdown || isPlantUML) && (
                    <button onClick={() => setIsPreviewMode(!isPreviewMode)} className="absolute top-2 right-6 z-20 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-lg border border-slate-700 shadow-lg flex items-center gap-2 backdrop-blur-sm transition-all">
                        {isPreviewMode ? <Code size={14}/> : (isPlantUML ? <ImageIcon size={14} /> : <Eye size={14}/>)} <span>{isPreviewMode ? "Edit Source" : "Preview"}</span>
                    </button>
                )}

                {activeFile && activeFile.isDirectory ? (
                    <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-slate-500">
                        <FolderOpen size={48} className="opacity-20 mb-4" />
                        <p>Select a file to edit.</p>
                    </div>
                ) : isMarkdown && isPreviewMode ? (
                    <div className="flex-1 overflow-y-auto p-8 bg-slate-950">
                        <div className="max-w-3xl mx-auto pb-20"><MarkdownView content={activeFile.content} /></div>
                    </div>
                ) : isPlantUML && isPreviewMode ? (
                    <PlantUMLPreview code={activeFile.content} />
                ) : (
                    <EnhancedEditor 
                        code={activeFile.content}
                        language={getLanguageFromFilename(activeFile.name)}
                        onChange={handleCodeChange}
                        onScroll={handleScroll}
                        onSelect={handleCursorUpdate}
                        textAreaRef={textareaRef}
                        lineNumbersRef={lineNumbersRef}
                        isLoadingContent={isLoadingFile}
                        scrollToLine={scrollToLine}
                        cursors={remoteCursors.filter(c => c.fileName === activeFile.name)}
                        readOnly={isReadOnly}
                        localCursor={localCursor}
                    />
                )}
                
                {/* Debug Panel */}
                {showDebug && (
                    debugExpanded ? (
                        <div className="absolute bottom-4 right-4 bg-black/80 text-green-400 p-4 rounded font-mono text-xs z-50 border border-green-500/30 max-w-sm pointer-events-none select-text shadow-2xl animate-fade-in-up">
                            <h4 className="font-bold border-b border-green-500/30 mb-2 pb-1 text-white flex justify-between items-center pointer-events-auto cursor-pointer" onClick={() => setDebugExpanded(false)}>
                                <span>DEBUG: Cursor Sync</span>
                                <div className="flex items-center gap-2 text-slate-500">
                                    <span className="text-[9px]">Fixed 24px line-height</span>
                                    <ChevronDown size={14} className="hover:text-white"/>
                                </div>
                            </h4>
                            <div className="mb-3">
                                <span className="text-white block mb-1 font-bold">LOCAL (SENDING):</span>
                                <div className="pl-2 border-l-2 border-green-500 text-[10px]">
                                    <div className="grid grid-cols-2 gap-x-4">
                                        <span>Line: <span className="text-white">{localCursor?.line ?? '-'}</span></span>
                                        <span>Col: <span className="text-white">{localCursor?.column ?? '-'}</span></span>
                                    </div>
                                    <div className="text-slate-500 mt-1">
                                        Raw Index: {Math.max(0, (localCursor?.line || 1) - 1)}<br/>
                                        Top: {(Math.max(0, (localCursor?.line || 1) - 1) * 24)}px
                                    </div>
                                </div>
                            </div>
                            <div>
                                <span className="text-white block mb-1 font-bold">REMOTE (RECEIVING):</span>
                                {remoteCursors.length === 0 ? (
                                    <div className="text-slate-500 italic pl-2">No remote cursors</div>
                                ) : (
                                    remoteCursors.map((c, i) => (
                                        <div key={i} className="pl-2 border-l-2 border-indigo-500 mb-2 text-[10px]">
                                            <span className="font-bold text-indigo-300 block mb-0.5">{c.userName}</span>
                                            <div className="grid grid-cols-2 gap-x-4 text-slate-300">
                                                <span>Line: {c.line}</span>
                                                <span>Col: {c.column}</span>
                                            </div>
                                            <div className="text-slate-500 mt-0.5">
                                                Calc: ({c.line} - 1) * 24<br/>
                                                Top: {((c.line - 1) * 24)}px
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    ) : (
                        <button 
                            onClick={() => setDebugExpanded(true)}
                            className="absolute bottom-4 right-4 bg-black/80 text-green-400 p-2 rounded-lg border border-green-500/30 text-[10px] font-mono hover:bg-slate-900 transition-all shadow-lg flex items-center gap-2 z-50 animate-fade-in"
                        >
                            <Bug size={12} />
                            <span>
                                Local: L{localCursor?.line || 1} C{localCursor?.column || 0}
                                {remoteCursors.length > 0 && ` | Remote: ${remoteCursors.length}`}
                            </span>
                            <ChevronUp size={12} className="text-slate-500"/>
                        </button>
                    )
                )}
            </div>
         </div>

         {activeSideView !== 'none' && (
             <>
                <div className="w-1 bg-slate-800 hover:bg-indigo-500 cursor-col-resize z-30 transition-colors" onMouseDown={startResizing} />
                <div style={{ width: chatWidth }} className="bg-slate-900 border-l border-slate-800 flex flex-col flex-shrink-0 relative h-full">
                    <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-950/50 shrink-0">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            {activeSideView === 'tutor' && <><GraduationCap size={16} className="text-emerald-400"/> Code Tutor</>}
                            {activeSideView === 'chat' && <><Bot size={16} className="text-indigo-400"/> AI Assistant</>}
                            {activeSideView === 'review' && <><CheckCircle size={16} className="text-purple-400"/> Code Review</>}
                        </h3>
                        <div className="flex gap-1">
                            <button onClick={() => setActiveSideView('none')} className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800"><X size={16} /></button>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto relative scrollbar-thin scrollbar-thumb-slate-700 min-h-0">
                        {activeSideView === 'tutor' ? (
                            <LiveSession 
                                channel={{ id: `code-tutor-${tutorSessionId}`, title: 'Code Tutor', description: 'Interactive Code Explanation', author: 'AI', voiceName: 'Puck', systemInstruction: 'You are a patient Senior Engineer acting as a Code Tutor. Monitor user activity. If the user asks you to change code, use the `update_file` tool to rewrite it in-place.', likes: 0, dislikes: 0, comments: [], tags: ['Tutor', 'Education'], imageUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&q=80', createdAt: Date.now() }}
                                initialContext={debouncedFileContext} 
                                lectureId={`tutor-${tutorSessionId}`}
                                recordingEnabled={false}
                                onEndSession={() => setActiveSideView('none')}
                                language="en"
                                customTools={[updateFileTool]}
                                onCustomToolCall={handleLiveCodeUpdate}
                            />
                        ) : activeSideView === 'review' ? (
                            <div className="p-4 space-y-4">
                                {project.review ? <MarkdownView content={project.review} /> : <p className="text-slate-500 text-center text-sm">No review generated yet.</p>}
                            </div>
                        ) : (
                            <div className="p-4 space-y-4">
                                {chatMessages.map((msg, idx) => (
                                    <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                        <div className={`max-w-[90%] p-3 rounded-xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}><MarkdownView content={msg.text} /></div>
                                    </div>
                                ))}
                                {isChatLoading && (
                                    <div className="flex justify-start">
                                        <div className="bg-slate-800 text-slate-400 p-3 rounded-xl text-sm flex items-center gap-2">
                                            <Loader2 size={14} className="animate-spin" /> Thinking...
                                        </div>
                                    </div>
                                )}
                                <div ref={chatEndRef} />
                            </div>
                        )}
                    </div>

                    {/* Chat Input Footer - Always visible for 'chat' mode */}
                    {activeSideView === 'chat' && (
                        <div className="p-3 border-t border-slate-800 bg-slate-900 shrink-0">
                            <div className="flex gap-2 relative bg-slate-800 rounded-lg p-1 border border-slate-700">
                                <textarea
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChatMessage(); } }}
                                    placeholder="Ask about this code..."
                                    rows={1}
                                    className="flex-1 bg-transparent text-sm text-white px-2 py-1.5 outline-none resize-none max-h-32 scrollbar-hide"
                                    style={{ minHeight: '36px' }}
                                />
                                <button 
                                    onClick={handleSendChatMessage} 
                                    disabled={!chatInput.trim() || isChatLoading}
                                    className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-end"
                                >
                                    <Send size={16} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
             </>
         )}
      </div>

      {showImportModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2"><CloudUpload size={24} className="text-indigo-400"/> Import Project</h3>
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
                      <div className="text-center space-y-3">
                          <button onClick={handleGitHubConnect} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all border border-slate-700 hover:border-slate-500">
                              <Github size={18} />
                              <span>{(needsGitHubReauth || isGithubLinked) ? "Reconnect GitHub Account" : "Connect GitHub Account"}</span>
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {showGithubModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6 flex flex-col max-h-[80vh]">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2"><Github size={24} className="text-white"/> Select Repository</h3>
                      <button onClick={() => setShowGithubModal(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                  </div>
                  <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                      {isLoadingRepos ? <div className="py-10 text-center"><Loader2 className="animate-spin mx-auto text-indigo-400"/></div> : repos.length === 0 ? <div className="py-10 text-center text-slate-500">No repositories found.</div> : (
                          <div className="space-y-2">
                              {repos.map((repo: any) => (
                                  <button key={repo.id} onClick={() => handleRepoSelect(repo)} className="w-full text-left p-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-between group">
                                      <div><div className="font-bold text-white text-sm">{repo.full_name}</div><div className="text-xs text-slate-400 flex items-center gap-2"><span>{repo.private ? "Private" : "Public"}</span><span>•</span><span>{repo.default_branch}</span></div></div>
                                      <ChevronRight size={16} className="text-slate-500 group-hover:text-white"/>
                                  </button>
                              ))}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {showCommitModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2"><GitCommit size={20} className="text-emerald-400"/> Commit & Push</h3>
                      <button onClick={() => setShowCommitModal(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                  </div>
                  <div className="space-y-4">
                      <div><label className="text-xs font-bold text-slate-500 uppercase">Commit Message</label><textarea value={commitMessage} onChange={e => setCommitMessage(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white mt-1 h-24 focus:outline-none focus:border-emerald-500" placeholder="Update solution..."/></div>
                      <button onClick={handleCommit} disabled={isCommitting || !commitMessage} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg flex items-center justify-center gap-2">{isCommitting ? <Loader2 size={16} className="animate-spin"/> : <CloudUpload size={16}/>}<span>Push Changes</span></button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
