
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';
import { ArrowLeft, Save, Folder, File, Code, Plus, Trash2, Loader2, ChevronRight, ChevronDown, X, MessageSquare, FileCode, FileJson, FileType, Search, Coffee, Hash, CloudUpload, Edit3, BookOpen, Bot, Send, Maximize2, Minimize2, GripVertical, UserCheck, AlertTriangle, Archive, Sparkles, Video, Mic, CheckCircle, Monitor, FileText, Eye, Github, GitBranch, GitCommit, FolderOpen, RefreshCw, GraduationCap, DownloadCloud, Terminal, Undo2, Check, Share2, Copy } from 'lucide-react';
import { GEMINI_API_KEY } from '../services/private_keys';
import { CodeProject, CodeFile, ChatMessage, Channel, GithubMetadata } from '../types';
import { MarkdownView } from './MarkdownView';
import { saveCodeProject, subscribeToCodeProject } from '../services/firestoreService';
import { signInWithGitHub, reauthenticateWithGitHub } from '../services/authService';
import { fetchUserRepos, fetchRepoContents, commitToRepo, fetchPublicRepoInfo, fetchFileContent, fetchRepoSubTree, createFileInRepo } from '../services/githubService';
import { LiveSession } from './LiveSession';

interface CodeStudioProps {
  onBack: () => void;
  currentUser: any;
  sessionId?: string; // New prop for shared sessions
  initialGithub?: { owner: string, repo: string, path?: string } | null;
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
  build_bst: {
    id: 'proj-build-bst',
    name: 'Example: Build BST (C++23 Template)',
    lastModified: Date.now(),
    files: [
      {
        name: 'build_bst.cpp',
        language: 'c++',
        content: `#include <iostream>
#include <vector>
#include <memory>

template<typename T>
struct TreeNode {
    T val;
    std::unique_ptr<TreeNode<T>> left;
    std::unique_ptr<TreeNode<T>> right;
    TreeNode(T x) : val(x), left(nullptr), right(nullptr) {}
};

class Solution {
public:
    // Convert Sorted Array to Height Balanced BST
    template<typename T>
    std::unique_ptr<TreeNode<T>> sortedArrayToBST(const std::vector<T>& nums) {
        return build(nums, 0, nums.size() - 1);
    }
    
private:
    template<typename T>
    std::unique_ptr<TreeNode<T>> build(const std::vector<T>& nums, int left, int right) {
        if (left > right) return nullptr;
        
        int mid = left + (right - left) / 2;
        auto node = std::make_unique<TreeNode<T>>(nums[mid]);
        
        node->left = build(nums, left, mid - 1);
        node->right = build(nums, mid + 1, right);
        
        return node;
    }

public:
    // Helper to print tree (Pre-order)
    template<typename T>
    void printTree(const std::unique_ptr<TreeNode<T>>& node) {
        if (!node) return;
        std::cout << node->val << " ";
        printTree(node->left);
        printTree(node->right);
    }
};

int main() {
    std::vector<int> nums = {-10, -3, 0, 5, 9};
    Solution s;
    auto root = s.sortedArrayToBST(nums);
    
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
    name: 'Interview: Empty C++23',
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
#include <memory>
#include <ranges> // C++20/23 ranges

using namespace std;

// Template definition for a binary tree node.
template<typename T>
struct TreeNode {
    T val;
    std::unique_ptr<TreeNode<T>> left;
    std::unique_ptr<TreeNode<T>> right;
    
    TreeNode() : val(T()), left(nullptr), right(nullptr) {}
    TreeNode(T x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(T x, std::unique_ptr<TreeNode<T>> left, std::unique_ptr<TreeNode<T>> right) 
        : val(x), left(std::move(left)), right(std::move(right)) {}
};

class Solution {
public:
    void solve() {
        // Your code here
        std::vector<int> v = {1, 2, 3, 4, 5};
        
        // Example C++20/23 range usage
        auto even = v | std::views::filter([](int n){ return n % 2 == 0; });
        
        std::cout << "Even numbers: ";
        for(int n : even) std::cout << n << " ";
        std::cout << std::endl;
    }
};

int main() {
    Solution s;
    s.solve();
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
        case 'cpp': case 'cc': case 'cxx': case 'h': case 'hpp': case 'hh': return 'c++';
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
    } else if (['cpp', 'c', 'h', 'hpp', 'cc', 'hh', 'cxx'].includes(ext || '')) {
        color = 'text-blue-500';
        Icon = Code;
    } else if (ext === 'cs') {
        color = 'text-purple-400';
        Icon = Hash;
    } else if (ext === 'md') {
        color = 'text-gray-400';
        Icon = FileText;
    }

    return <Icon size={14} className={color} />;
};

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children: FileNode[];
  index?: number; // Index in the flat project.files array
  isLoading?: boolean; // For folders being fetched
}

// Rebuild tree to handle lazy loaded folder entries
const buildFileTree = (files: CodeFile[], expandedFolders: Record<string, boolean>): FileNode[] => {
  const root: FileNode[] = [];
  const map: Record<string, FileNode> = {};

  // First pass: Create nodes for all explicit file entries
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
          type: 'folder', // Assume folder until proven file or explicit entry
          children: [],
        };
        map[currentFullPath] = node;
        
        if (parentNode) {
          parentNode.children.push(node);
        } else {
          root.push(node);
        }
      }
      
      // If this is the entry for the file/folder itself
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
  
  // Sort: Folders first, then files (alphabetical)
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

// Recursive Component for Tree
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

  // File
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

// --- SYNTAX HIGHLIGHTING EDITOR ---

const generateHighlightedHTML = (code: string, language: string) => {
  // Safe escape ensuring quotes are also escaped to avoid attribute injection
  const escapeHtml = (text: string) => text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  
  // Use a map to protect specific tokens (strings, comments) from being partially matched by keywords
  // Using «PH#» delimiters to safely isolate from word boundary matches (\b)
  const placeholders: string[] = [];
  const addPlaceholder = (htmlFragment: string) => {
    placeholders.push(htmlFragment);
    return `«PH${placeholders.length - 1}»`;
  };

  let processed = escapeHtml(code);

  if (language === 'c++' || language === 'c' || language === 'cpp') {
    // 1. Strings (Double Quote) - matches escaped &quot;
    processed = processed.replace(/(&quot;.*?&quot;)/g, match => addPlaceholder(`<span class="text-amber-400">${match}</span>`));
    // 1b. Chars (Single Quote) - matches escaped &#039;
    processed = processed.replace(/(&#039;.*?&#039;)/g, match => addPlaceholder(`<span class="text-amber-300">${match}</span>`));
    
    // 2. Preprocessor directives
    // Specifc match for #include <...> or #include "..." to color the header path correctly
    processed = processed.replace(/(#include)(\s+)(&lt;.*?&gt;|&quot;.*?&quot;)/g, (_match, p1, p2, p3) => {
        return addPlaceholder(`<span class="text-pink-400">${p1}</span>`) + p2 + addPlaceholder(`<span class="text-emerald-300">${p3}</span>`);
    });
    
    // Generic match for other directives or bare #include
    processed = processed.replace(/(#define|#ifdef|#ifndef|#endif|#pragma|#include)/g, match => addPlaceholder(`<span class="text-pink-400">${match}</span>`));

    // 3. Comments (Double Slash) - matches unescaped // if present (unlikely after escape) or generally works on text
    processed = processed.replace(/(\/\/.*)/g, match => addPlaceholder(`<span class="text-slate-500 italic">${match}</span>`));
    
    // 4. Comments (Block) - Basic multiline support
    processed = processed.replace(/(\/\*[\s\S]*?\*\/)/g, match => addPlaceholder(`<span class="text-slate-500 italic">${match}</span>`));

    // 5. Keywords
    const keywords = [
      "int", "float", "double", "char", "void", "bool", "long", "short", "unsigned", "signed", 
      "struct", "class", "public", "private", "protected", "virtual", "override", "final", "static", "const", "constexpr", "concept", "requires",
      "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "default", "return", 
      "new", "delete", "this", "true", "false", "nullptr", "namespace", "using", "template", "typename",
      "try", "catch", "throw", "auto", "explicit", "friend", "inline", "mutable", "operator", 
      "std", "vector", "string", "cout", "cin", "endl", "map", "set", "stack", "queue", "pair", "unique_ptr", "shared_ptr", "make_unique", "make_shared"
    ];
    // Word boundary regex
    const kwRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
    processed = processed.replace(kwRegex, match => addPlaceholder(`<span class="text-blue-400 font-bold">${match}</span>`));

    // 6. Functions (Word followed by paren)
    processed = processed.replace(/\b([a-zA-Z_]\w*)(?=\()/g, match => addPlaceholder(`<span class="text-yellow-200">${match}</span>`));
    
    // 7. Numbers (Only process things that aren't already placeholders)
    processed = processed.replace(/\b(\d+)\b/g, match => addPlaceholder(`<span class="text-emerald-300">${match}</span>`));
  } 
  
  // Basic Python support
  else if (language === 'python') {
      // Strings
      processed = processed.replace(/(&quot;.*?&quot;|&#039;.*?&#039;)/g, match => addPlaceholder(`<span class="text-amber-400">${match}</span>`));
      // Comments
      processed = processed.replace(/(#.*)/g, match => addPlaceholder(`<span class="text-slate-500 italic">${match}</span>`));
      // Keywords
      const keywords = ["def", "return", "if", "elif", "else", "while", "for", "in", "import", "from", "class", "try", "except", "print", "True", "False", "None", "self"];
      const kwRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
      processed = processed.replace(kwRegex, match => addPlaceholder(`<span class="text-blue-400 font-bold">${match}</span>`));
      // Functions
      processed = processed.replace(/\b([a-zA-Z_]\w*)(?=\()/g, match => addPlaceholder(`<span class="text-yellow-200">${match}</span>`));
  }

  // Restore placeholders iteratively
  // Using split/join avoids the issue where replacement string contains '$' which string.replace handles specially
  placeholders.forEach((ph, i) => {
    processed = processed.split(`«PH${i}»`).join(ph);
  });

  return processed;
};

const EnhancedEditor = ({ code, language, onChange, onScroll, onSelect, textAreaRef, lineNumbersRef, isLoadingContent, scrollToLine }: any) => {
  // Handle Scroll To Line Request
  useEffect(() => {
      if (scrollToLine !== null && textAreaRef.current) {
          const lineHeight = 24; // matches leading-6 class (1.5rem = 24px)
          const scrollPos = (scrollToLine - 1) * lineHeight;
          textAreaRef.current.scrollTo({ top: scrollPos, behavior: 'smooth' });
      }
  }, [scrollToLine]);

  return (
    <div className="flex-1 relative bg-slate-950 flex overflow-hidden font-mono text-sm">
        {/* Line Numbers */}
        <div 
            ref={lineNumbersRef}
            className="w-12 bg-slate-900 border-r border-slate-800 text-right text-slate-600 py-4 pr-3 select-none overflow-hidden flex-shrink-0 leading-6"
        >
            {code.split('\n').map((_: any, i: number) => (
                <div key={i} className={scrollToLine === (i + 1) ? "text-yellow-400 font-bold bg-yellow-900/20" : ""}>{i + 1}</div>
            ))}
        </div>
        
        <div className="relative flex-1 h-full overflow-hidden">
            {/* Loading Indicator */}
            {isLoadingContent && (
               <div className="absolute inset-0 bg-slate-950/80 z-20 flex flex-col items-center justify-center">
                  <Loader2 className="animate-spin text-indigo-400 mb-2" size={32} />
                  <span className="text-slate-400 text-xs">Fetching file content...</span>
               </div>
            )}

            {/* Syntax Highlight Layer (Background) */}
            <pre
                className="absolute top-0 left-0 w-full h-full p-4 pointer-events-none margin-0 whitespace-pre overflow-hidden leading-6"
                aria-hidden="true"
                style={{
                    fontFamily: 'monospace',
                    tabSize: 4
                }}
                dangerouslySetInnerHTML={{ __html: generateHighlightedHTML(code, language) }}
            />

            {/* Actual Text Area (Foreground, Transparent) */}
            <textarea
                ref={textAreaRef}
                value={code}
                onChange={onChange}
                onScroll={onScroll}
                onSelect={onSelect}
                spellCheck={false}
                className="absolute top-0 left-0 w-full h-full p-4 bg-transparent text-transparent caret-white outline-none resize-none overflow-auto whitespace-pre leading-6"
                style={{
                    fontFamily: 'monospace',
                    tabSize: 4
                }}
            />
        </div>
    </div>
  );
};

export const CodeStudio: React.FC<CodeStudioProps> = ({ onBack, currentUser, sessionId, initialGithub }) => {
  const [project, setProject] = useState<CodeProject>(EXAMPLE_PROJECTS.is_bst);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [loadingFolders, setLoadingFolders] = useState<Record<string, boolean>>({});
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [isSharedSession, setIsSharedSession] = useState(!!sessionId);
  const [isSaving, setIsSaving] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  
  // Rebuild file tree when files change
  const fileTree = useMemo(() => buildFileTree(project.files, expandedFolders), [project.files, expandedFolders]);
  
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Initialize Session
  useEffect(() => {
      // 1. If explicit sessionId is provided, try to load it from Firestore
      if (sessionId) {
          setIsSharedSession(true);
          const unsub = subscribeToCodeProject(sessionId, (remoteProj) => {
              // Merge remote with local? Just overwrite for now to be simple
              setProject(remoteProj);
          });
          return () => unsub();
      } 
      
      // 2. If GitHub params provided, load from GitHub directly
      if (initialGithub) {
          loadFromGithub(initialGithub.owner, initialGithub.repo, initialGithub.path);
      }
  }, [sessionId, initialGithub]);

  const loadFromGithub = async (owner: string, repo: string, path?: string) => {
      try {
          const content = await fetchFileContent(null, owner, repo, path || 'README.md'); // Public fetch
          const newFile: CodeFile = {
              name: path || 'README.md',
              language: getLanguageFromFilename(path || 'README.md') as any,
              content: content,
              loaded: true
          };
          setProject({
              id: `gh-${owner}-${repo}`,
              name: `${owner}/${repo}`,
              files: [newFile],
              lastModified: Date.now()
          });
      } catch (e) {
          console.error("Failed to load initial GitHub file", e);
      }
  };

  useEffect(() => {
      // Sync scrolling
      const textArea = textAreaRef.current;
      const lineNumbers = lineNumbersRef.current;
      
      const handleScroll = () => {
          if (lineNumbers && textArea) {
              lineNumbers.scrollTop = textArea.scrollTop;
          }
      };
      
      if (textArea) {
          textArea.addEventListener('scroll', handleScroll);
          return () => textArea.removeEventListener('scroll', handleScroll);
      }
  }, []);

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newVal = e.target.value;
      const updatedFiles = [...project.files];
      updatedFiles[activeFileIndex] = { ...updatedFiles[activeFileIndex], content: newVal };
      setProject({ ...project, files: updatedFiles, lastModified: Date.now() });
  };

  const handleSave = async () => {
      setIsSaving(true);
      try {
          await saveCodeProject(project);
      } catch (e: any) {
          // If permission error (e.g. dev mode or guest), ask for fallback
          if (e.message?.includes('permission') || !currentUser || currentUser.uid === 'dev-user') {
              if (confirm("Cloud save failed (Permission Denied). Save to GitHub 'Shengliang/codestudio' instead?")) {
                  await handleGithubShareFallback();
                  setIsSaving(false);
                  return;
              }
          }
          console.error(e);
      }
      setIsSaving(false);
  };

  const handleShare = async () => {
      // 1. Ensure project has a shareable ID (not a default example one)
      let projectId = project.id;
      if (projectId.startsWith('proj-')) {
          projectId = `share-${crypto.randomUUID()}`;
          setProject(prev => ({ ...prev, id: projectId }));
      }

      setIsSaving(true);
      try {
          // Try standard Firestore save first
          await saveCodeProject({ ...project, id: projectId });
          
          const url = new URL(window.location.href);
          url.searchParams.set('code_session', projectId);
          setShareLink(url.toString());
          
          await navigator.clipboard.writeText(url.toString());
          alert("Share Link Copied to Clipboard!");
          setIsSharedSession(true);
          
      } catch (e: any) {
          console.error("Share failed", e);
          if (confirm("Failed to create share link (Permission Denied). Create a public GitHub link instead?")) {
              await handleGithubShareFallback();
          }
      } finally {
          setIsSaving(false);
      }
  };

  const handleGithubShareFallback = async () => {
      try {
          // 1. Ensure Auth
          let token = githubToken;
          if (!token) {
              const authResult = await signInWithGitHub(); // Ensure this handles linking if already logged in via Google
              if (authResult.token) {
                  setGithubToken(authResult.token);
                  token = authResult.token;
              } else {
                  throw new Error("GitHub Login Failed");
              }
          }

          // 2. Define Target (Shengliang/codestudio)
          const owner = "Shengliang";
          const repo = "codestudio";
          const currentFile = project.files[activeFileIndex];
          const filename = currentFile.name.includes('/') ? currentFile.name.split('/').pop() : currentFile.name;
          const path = `shared/${Date.now()}_${filename}`;

          // 3. Create File
          await createFileInRepo(
              token!, 
              owner, 
              repo, 
              path, 
              currentFile.content, 
              `Shared from Code Studio: ${filename}`
          );

          // 4. Generate Link
          const url = new URL(window.location.href);
          // Remove session param if present to avoid confusion
          url.searchParams.delete('code_session');
          // Add GitHub params
          url.searchParams.set('gh_owner', owner);
          url.searchParams.set('gh_repo', repo);
          url.searchParams.set('gh_path', path);
          
          setShareLink(url.toString());
          await navigator.clipboard.writeText(url.toString());
          alert(`File saved to GitHub (${owner}/${repo}/${path})!\n\nShare link copied.`);

      } catch(e: any) {
          alert(`GitHub Share Failed: ${e.message}`);
      }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white">
                    <ArrowLeft size={18} />
                </button>
                <span className="font-bold text-sm truncate">{project.name}</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2">
                {fileTree.map(node => (
                    <FileTreeNode 
                        key={node.path}
                        node={node}
                        depth={0}
                        activeFileIndex={activeFileIndex}
                        onSelect={setActiveFileIndex}
                        expandedFolders={expandedFolders}
                        toggleFolder={(path) => setExpandedFolders(prev => ({...prev, [path]: !prev[path]}))}
                        loadingFolders={loadingFolders}
                    />
                ))}
            </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 flex flex-col">
            <div className="h-12 bg-slate-900 border-b border-slate-800 flex items-center px-4 justify-between">
                <span className="text-xs text-slate-400 font-mono">{project.files[activeFileIndex]?.name || 'No File Selected'}</span>
                
                <div className="flex items-center gap-2">
                    {shareLink && (
                        <span className="text-[10px] text-emerald-400 bg-emerald-900/20 px-2 py-1 rounded border border-emerald-900/50 flex items-center gap-1">
                            <Check size={10} /> Link Ready
                        </span>
                    )}
                    
                    <button 
                        onClick={handleShare}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold transition-colors"
                    >
                        {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
                        <span>Share</span>
                    </button>

                    <button 
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-1 text-xs text-slate-300 hover:text-white px-3 py-1.5 hover:bg-slate-800 rounded transition-colors"
                    >
                        <Save size={14} /> Save
                    </button>
                </div>
            </div>
            {project.files[activeFileIndex] ? (
                <EnhancedEditor 
                    code={project.files[activeFileIndex].content} 
                    language={project.files[activeFileIndex].language}
                    onChange={handleCodeChange}
                    textAreaRef={textAreaRef}
                    lineNumbersRef={lineNumbersRef}
                    isLoadingContent={project.files[activeFileIndex].loaded === false}
                    scrollToLine={null}
                />
            ) : (
                <div className="flex-1 flex items-center justify-center text-slate-600">
                    Select a file to edit
                </div>
            )}
        </div>
    </div>
  );
};
