import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { ArrowLeft, Play, Save, Folder, File, Code, Terminal, Plus, Trash2, Loader2, ChevronRight, ChevronDown, Download, Smartphone, X, MessageSquare, CheckCircle, FileCode, FileJson, FileType, Search, Coffee, Hash, Eye, CloudUpload, PenTool, Edit3 } from 'lucide-react';
import { GEMINI_API_KEY } from '../services/private_keys';
import { CodeProject, CodeFile } from '../types';
import { MarkdownView } from './MarkdownView';
import { saveCodeProject } from '../services/firestoreService';

interface CodeStudioProps {
  onBack: () => void;
  currentUser: any;
}

const INITIAL_PROJECT: CodeProject = {
  id: 'proj-bst-polyglot',
  name: 'BST Polyglot (Gold Standard)',
  lastModified: Date.now(),
  files: [
    {
      name: 'python/is_bst.py',
      language: 'python',
      content: `class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

# Gold Standard Approach 1: Recursive DFS with Range
# Time Complexity: O(N) - visits every node once
# Space Complexity: O(H) - recursion stack depth (H = height of tree)
def is_valid_bst_recursive(root, min_val=float('-inf'), max_val=float('inf')):
    if not root:
        return True
    
    # The current node's value must be strictly between min and max
    if not (min_val < root.val < max_val):
        return False
        
    # Recursively validate subtrees with updated constraints
    # Left child must be < root.val
    # Right child must be > root.val
    return (is_valid_bst_recursive(root.left, min_val, root.val) and
            is_valid_bst_recursive(root.right, root.val, max_val))

# Gold Standard Approach 2: Iterative DFS using Stack
# Explicit stack avoids recursion depth limits in Python
def is_valid_bst_iterative(root):
    if not root:
        return True
    
    # Stack stores tuple: (node, lower_limit, upper_limit)
    stack = [(root, float('-inf'), float('inf'))]
    
    while stack:
        node, low, high = stack.pop()
        if not node:
            continue
        
        if not (low < node.val < high):
            return False
            
        # Push children to stack with updated constraints
        stack.append((node.right, node.val, high))
        stack.append((node.left, low, node.val))
        
    return True`
    },
    {
      name: 'typescript/solution.ts',
      language: 'typescript',
      content: `class TreeNode {
    val: number;
    left: TreeNode | null;
    right: TreeNode | null;
    constructor(val?: number, left?: TreeNode | null, right?: TreeNode | null) {
        this.val = (val === undefined ? 0 : val);
        this.left = (left === undefined ? null : left);
        this.right = (right === undefined ? null : right);
    }
}

// Approach 1: Recursive with Type Safety
function isValidBST(root: TreeNode | null): boolean {
    return validate(root, -Infinity, Infinity);
}

function validate(node: TreeNode | null, min: number, max: number): boolean {
    if (!node) return true;
    
    if (node.val <= min || node.val >= max) return false;
    
    return validate(node.left, min, node.val) && 
           validate(node.right, node.val, max);
}

// Approach 2: Iterative with Type Alias
type StackFrame = { node: TreeNode, min: number, max: number };

function isValidBSTIterative(root: TreeNode | null): boolean {
    if (!root) return true;
    const stack: StackFrame[] = [{ node: root, min: -Infinity, max: Infinity }];
    
    while (stack.length) {
        const { node, min, max } = stack.pop()!;
        
        if (node.val <= min || node.val >= max) return false;
        
        if (node.right) stack.push({ node: node.right, min: node.val, max });
        if (node.left) stack.push({ node: node.left, min, max: node.val });
    }
    return true;
}`
    },
    {
      name: 'csharp/Solution.cs',
      language: 'c#',
      content: `using System;
using System.Collections.Generic;

public class TreeNode {
    public int val;
    public TreeNode left;
    public TreeNode right;
    public TreeNode(int val=0, TreeNode left=null, TreeNode right=null) {
        this.val = val;
        this.left = left;
        this.right = right;
    }
}

public class Solution {
    // Approach 1: Recursive using nullable long to handle Int32.MaxValue bounds
    public bool IsValidBST(TreeNode root) {
        return Validate(root, long.MinValue, long.MaxValue);
    }

    private bool Validate(TreeNode node, long min, long max) {
        if (node == null) return true;
        
        if (node.val <= min || node.val >= max) return false;
        
        return Validate(node.left, min, node.val) &&
               Validate(node.right, node.val, max);
    }

    // Approach 2: Iterative In-Order Traversal
    public bool IsValidBSTIterative(TreeNode root) {
        var stack = new Stack<TreeNode>();
        TreeNode prev = null;
        
        while (root != null || stack.Count > 0) {
            while (root != null) {
                stack.Push(root);
                root = root.left;
            }
            
            root = stack.Pop();
            
            // If next element in in-order traversal is smaller/equal to previous, invalid
            if (prev != null && root.val <= prev.val) return false;
            
            prev = root;
            root = root.right;
        }
        return true;
    }
}`
    },
    {
      name: 'c/main.c',
      language: 'c',
      content: `#include <stdbool.h>
#include <limits.h>
#include <stdlib.h>

struct TreeNode {
    int val;
    struct TreeNode *left;
    struct TreeNode *right;
};

// Helper function using long long to prevent integer overflow on boundary checks
bool validate(struct TreeNode* root, long long min, long long max) {
    if (root == NULL) return true;
    
    // Check constraints
    if (root->val <= min || root->val >= max) return false;
    
    // Recursively validate subtrees
    return validate(root->left, min, root->val) &&
           validate(root->right, root->val, max);
}

bool isValidBST(struct TreeNode* root) {
    // LLONG_MIN/MAX are needed because a valid BST node can contain INT_MIN/INT_MAX
    return validate(root, LLONG_MIN, LLONG_MAX);
}`
    },
    {
      name: 'javascript/is_bst.js',
      language: 'javascript',
      content: `class TreeNode {
  constructor(val, left = null, right = null) {
    this.val = val;
    this.left = left;
    this.right = right;
  }
}

/**
 * Validates a Binary Search Tree using Recursion.
 * @param {TreeNode} root
 * @param {number} min - Lower bound
 * @param {number} max - Upper bound
 * @return {boolean}
 */
function isValidBSTRecursive(root, min = -Infinity, max = Infinity) {
  if (!root) return true;
  
  if (root.val <= min || root.val >= max) return false;
  
  return isValidBSTRecursive(root.left, min, root.val) && 
         isValidBSTRecursive(root.right, root.val, max);
}

/**
 * Validates a BST using Iteration (Stack).
 * Avoids call stack overflow for deep trees.
 */
function isValidBSTIterative(root) {
  if (!root) return true;
  const stack = [{ node: root, min: -Infinity, max: Infinity }];
  
  while (stack.length > 0) {
    const { node, min, max } = stack.pop();
    if (!node) continue;
    
    if (node.val <= min || node.val >= max) return false;
    
    stack.push({ node: node.right, min: node.val, max });
    stack.push({ node: node.left, min, max: node.val });
  }
  return true;
}`
    },
    {
      name: 'java/Solution.java',
      language: 'java',
      content: `class TreeNode {
    int val;
    TreeNode left;
    TreeNode right;
    TreeNode() {}
    TreeNode(int val) { this.val = val; }
    TreeNode(int val, TreeNode left, TreeNode right) {
        this.val = val;
        this.left = left;
        this.right = right;
    }
}

class Solution {
    // Approach 1: Recursive with Range (Long to handle Integer.MAX_VALUE)
    public boolean isValidBST(TreeNode root) {
        return validate(root, Long.MIN_VALUE, Long.MAX_VALUE);
    }

    private boolean validate(TreeNode node, long min, long max) {
        if (node == null) return true;
        if (node.val <= min || node.val >= max) return false;
        return validate(node.left, min, node.val) && validate(node.right, node.val, max);
    }

    // Approach 2: Iterative In-Order Traversal
    public boolean isValidBSTIterative(TreeNode root) {
        if (root == null) return true;
        Stack<TreeNode> stack = new Stack<>();
        TreeNode pre = null;
        while (root != null || !stack.isEmpty()) {
            while (root != null) {
                stack.push(root);
                root = root.left;
            }
            root = stack.pop();
            if (pre != null && root.val <= pre.val) return false;
            pre = root;
            root = root.right;
        }
        return true;
    }
}`
    },
    {
      name: 'cpp/solution.cpp',
      language: 'c++',
      content: `#include <climits>
#include <stack>

struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
};

class Solution {
public:
    // Approach 1: Recursive using pointers for nullable min/max
    bool isValidBST(TreeNode* root) {
        return validate(root, nullptr, nullptr);
    }

    bool validate(TreeNode* node, TreeNode* minNode, TreeNode* maxNode) {
        if (!node) return true;
        if (minNode && node->val <= minNode->val) return false;
        if (maxNode && node->val >= maxNode->val) return false;
        return validate(node->left, minNode, node) && validate(node->right, node, maxNode);
    }

    // Approach 2: Iterative In-Order
    bool isValidBSTIterative(TreeNode* root) {
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
};`
    },
    {
      name: 'go/main.go',
      language: 'go',
      content: `package main

import "math"

type TreeNode struct {
    Val   int
    Left  *TreeNode
    Right *TreeNode
}

// Approach: Recursive with Range
func isValidBST(root *TreeNode) bool {
    return validate(root, math.MinInt64, math.MaxInt64)
}

func validate(node *TreeNode, min, max int64) bool {
    if node == nil {
        return true
    }
    if int64(node.Val) <= min || int64(node.Val) >= max {
        return false
    }
    return validate(node.Left, min, int64(node.Val)) && 
           validate(node.Right, int64(node.Val), max)
}`
    },
    {
      name: 'rust/lib.rs',
      language: 'rust',
      content: `use std::cell::RefCell;
use std::rc::Rc;

#[derive(Debug, PartialEq, Eq)]
pub struct TreeNode {
  pub val: i32,
  pub left: Option<Rc<RefCell<TreeNode>>>,
  pub right: Option<Rc<RefCell<TreeNode>>>,
}

impl TreeNode {
  #[inline]
  pub fn new(val: i32) -> Self {
    TreeNode {
      val,
      left: None,
      right: None,
    }
  }
}

pub struct Solution {}

impl Solution {
    pub fn is_valid_bst(root: Option<Rc<RefCell<TreeNode>>>) -> bool {
        Self::validate(&root, None, None)
    }

    fn validate(node: &Option<Rc<RefCell<TreeNode>>>, min: Option<i32>, max: Option<i32>) -> bool {
        match node {
            Some(n) => {
                let val = n.borrow().val;
                if let Some(min_val) = min {
                    if val <= min_val { return false; }
                }
                if let Some(max_val) = max {
                    if val >= max_val { return false; }
                }
                Self::validate(&n.borrow().left, min, Some(val)) &&
                Self::validate(&n.borrow().right, Some(val), max)
            },
            None => true,
        }
    }
}`
    }
  ]
};

const WEB_PROJECT_FILES: CodeFile[] = [
    {
        name: 'src/App.tsx',
        language: 'typescript (react)',
        content: `import React from 'react';\n\nexport default function App() {\n  return (\n    <div style={{padding: 20}}>\n      <h1>Hello from CodeStudio</h1>\n      <p>This is a simulated React environment.</p>\n    </div>\n  );\n}`
    },
    {
        name: 'src/styles.css',
        language: 'css',
        content: 'body { font-family: sans-serif; background: #1e1e1e; color: white; }'
    }
];

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

const TEMPLATES = [
    { id: 'all', label: 'Polyglot Example' },
    { id: 'web', label: 'React Web App' }
];

const INTERVIEW_LANGUAGES = [
    { id: 'python', label: 'Python', ext: 'py' },
    { id: 'javascript', label: 'JavaScript', ext: 'js' },
    { id: 'typescript', label: 'TypeScript', ext: 'ts' },
    { id: 'java', label: 'Java', ext: 'java' },
    { id: 'cpp', label: 'C++', ext: 'cpp' },
    { id: 'c', label: 'C', ext: 'c' },
    { id: 'csharp', label: 'C#', ext: 'cs' },
    { id: 'rust', label: 'Rust', ext: 'rs' },
    { id: 'go', label: 'Go', ext: 'go' },
];

export const CodeStudio: React.FC<CodeStudioProps> = ({ onBack, currentUser }) => {
  const [project, setProject] = useState<CodeProject>(INITIAL_PROJECT);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [output, setOutput] = useState('');
  const [humanComments, setHumanComments] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [activeTemplate, setActiveTemplate] = useState('all');
  const [viewMode, setViewMode] = useState<'code' | 'review' | 'notes'>('code');
  const [isSaving, setIsSaving] = useState(false);
  const [showLanguageSelect, setShowLanguageSelect] = useState(false);
  
  // Refs for scrolling sync
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Mobile check
  useEffect(() => {
      if (window.innerWidth < 768) setIsSidebarOpen(false);
      // Auto expand folders
      const allFolders: Record<string, boolean> = {};
      const uniqueFolders = new Set(project.files.map(f => f.name.includes('/') ? f.name.split('/')[0] : 'root'));
      uniqueFolders.forEach(f => allFolders[f] = true);
      setExpandedFolders(allFolders);
  }, [project.files]);

  // Load project review and comments if available
  useEffect(() => {
      setOutput(project.review || '');
      setHumanComments(project.humanComments || '');
  }, [project]);

  const activeFile = project.files[activeFileIndex] || project.files[0];

  const handleTemplateChange = (tmpl: string) => {
    setActiveTemplate(tmpl);
    if (tmpl === 'all') {
        setProject(INITIAL_PROJECT);
    } else if (tmpl === 'web') {
        setProject({
            id: 'proj-web',
            name: 'React Web Starter',
            lastModified: Date.now(),
            files: WEB_PROJECT_FILES,
            humanComments: ''
        });
    }
    setActiveFileIndex(0);
    setViewMode('code');
  };

  const startNewInterview = (langId: string) => {
      const langConfig = INTERVIEW_LANGUAGES.find(l => l.id === langId);
      if (!langConfig) return;

      const newProject: CodeProject = {
          id: `interview-${Date.now()}`,
          name: `${langConfig.label} Interview`,
          lastModified: Date.now(),
          files: [{
              name: `solution.${langConfig.ext}`,
              language: langConfig.id as any,
              content: `// Write your ${langConfig.label} solution here...\n\n`
          }],
          humanComments: '',
          review: ''
      };

      setProject(newProject);
      setActiveFileIndex(0);
      setViewMode('code');
      setShowLanguageSelect(false);
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
      const name = prompt("File name (e.g. python/script.py):");
      if (!name) return;
      const lang: any = getLanguageFromFilename(name);
      const newFile: CodeFile = { name, language: lang, content: '// Start coding...' };
      const newFiles = [...project.files, newFile];
      setProject(prev => ({ ...prev, files: newFiles }));
      setActiveFileIndex(newFiles.length - 1);
      
      const parts = name.split('/');
      if (parts.length > 1) {
          const folderName = parts[0];
          // Fix for: Type 'unknown' cannot be used as an index type
          if (folderName) {
             setExpandedFolders((prev: Record<string, boolean>) => ({...prev, [folderName as string]: true}));
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
  const filesByFolder = React.useMemo<Record<string, {file: CodeFile, index: number}[]>>(() => {
      const groups: Record<string, {file: CodeFile, index: number}[]> = {};
      project.files.forEach((file, index) => {
          const parts = file.name.split('/');
          const folder = parts.length > 1 ? parts[0] : 'root';
          if (!groups[folder]) groups[folder] = [];
          groups[folder].push({ file, index });
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
             
             {/* New Interview Button with Dropdown */}
             <div className="relative">
                 <button 
                    onClick={() => setShowLanguageSelect(!showLanguageSelect)}
                    className="flex items-center gap-2 px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded ml-4 transition-colors"
                 >
                    <Plus size={14} /> Start Interview
                 </button>
                 {showLanguageSelect && (
                     <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowLanguageSelect(false)}></div>
                        <div className="absolute top-full left-0 mt-2 w-48 bg-[#252526] border border-[#3d3d3d] rounded-lg shadow-xl z-50 overflow-hidden">
                            <div className="p-2 text-xs font-bold text-gray-500 uppercase">Select Language</div>
                            {INTERVIEW_LANGUAGES.map(lang => (
                                <button
                                    key={lang.id}
                                    onClick={() => startNewInterview(lang.id)}
                                    className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-[#37373d] hover:text-white transition-colors"
                                >
                                    {lang.label}
                                </button>
                            ))}
                        </div>
                     </>
                 )}
             </div>

             <select
                value={activeTemplate}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="bg-[#3d3d3d] text-white text-xs rounded border border-[#555] outline-none px-2 py-1 ml-2 hover:border-indigo-500 transition-colors cursor-pointer"
             >
                {TEMPLATES.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                ))}
             </select>
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
                                  <Eye size={48} className="opacity-20" />
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