
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { ArrowLeft, Play, Save, Folder, File, Code, Terminal, Plus, Trash2, Loader2, ChevronRight, ChevronDown, Download, Smartphone, X, MessageSquare, CheckCircle, FileCode, FileJson, FileType, Search, Coffee, Hash, Eye, CloudUpload } from 'lucide-react';
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
      name: 'python/build_bst.py',
      language: 'python',
      content: `class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

# Construct BST from Preorder Traversal
# Uses O(N) time complexity by passing bound constraints
def bstFromPreorder(preorder: list[int]) -> TreeNode:
    # Use a list for 'idx' to emulate pass-by-reference mutable integer
    idx = [0]
    n = len(preorder)
    
    def build(bound):
        # Stop if we used all elements OR next element exceeds bound
        if idx[0] == n or preorder[idx[0]] > bound:
            return None
            
        val = preorder[idx[0]]
        idx[0] += 1
        root = TreeNode(val)
        
        # Left child must be smaller than current val
        root.left = build(val)
        
        # Right child must be smaller than the bound inherited from parent
        root.right = build(bound)
        
        return root
        
    return build(float('inf'))`
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
      name: 'javascript/build_bst.js',
      language: 'javascript',
      content: `class TreeNode {
  constructor(val, left = null, right = null) {
    this.val = val;
    this.left = left;
    this.right = right;
  }
}

/**
 * Construct BST from Preorder Traversal
 * Time Complexity: O(N)
 */
function bstFromPreorder(preorder) {
  let idx = 0;
  
  function build(bound) {
    if (idx === preorder.length || preorder[idx] > bound) {
      return null;
    }
    
    const root = new TreeNode(preorder[idx++]);
    root.left = build(root.val);
    root.right = build(bound);
    
    return root;
  }
  
  return build(Infinity);
}`
    },
    {
      name: 'java/IsBST.java',
      language: 'java',
      content: `import java.util.Stack;

public class IsBST {
    public static class TreeNode {
        int val;
        TreeNode left;
        TreeNode right;
        TreeNode(int x) { val = x; }
    }

    // Approach 1: Recursive with Integer constraints
    // Using Integer object allows null to represent infinity
    public boolean isValidBSTRecursive(TreeNode root) {
        return validate(root, null, null);
    }

    private boolean validate(TreeNode node, Integer min, Integer max) {
        if (node == null) return true;
        
        if ((min != null && node.val <= min) || (max != null && node.val >= max)) {
            return false;
        }
        
        return validate(node.left, min, node.val) && validate(node.right, node.val, max);
    }

    // Approach 2: Iterative
    // Generic approach suitable for interviews
    public boolean isValidBSTIterative(TreeNode root) {
        if (root == null) return true;
        Stack<State> stack = new Stack<>();
        stack.push(new State(root, null, null));

        while (!stack.isEmpty()) {
            State current = stack.pop();
            TreeNode node = current.node;
            
            if (node == null) continue;
            
            if ((current.min != null && node.val <= current.min) ||
                (current.max != null && node.val >= current.max)) {
                return false;
            }
            
            stack.push(new State(node.right, node.val, current.max));
            stack.push(new State(node.left, current.min, node.val));
        }
        return true;
    }

    private static class State {
        TreeNode node;
        Integer min, max;
        State(TreeNode n, Integer min, Integer max) {
            this.node = n; this.min = min; this.max = max;
        }
    }
}`
    },
    {
      name: 'java/BuildBST.java',
      language: 'java',
      content: `public class BuildBST {
    public static class TreeNode {
        int val;
        TreeNode left, right;
        TreeNode(int x) { val = x; }
    }

    private int idx = 0;

    public TreeNode bstFromPreorder(int[] preorder) {
        idx = 0; // reset index for new calls
        return build(preorder, Integer.MAX_VALUE);
    }

    private TreeNode build(int[] preorder, int bound) {
        if (idx == preorder.length || preorder[idx] > bound) {
            return null;
        }

        TreeNode root = new TreeNode(preorder[idx++]);
        root.left = build(preorder, root.val);
        root.right = build(preorder, bound);

        return root;
    }
}`
    },
    {
      name: 'cpp/is_bst.cpp',
      language: 'c++',
      content: `#include <stack>
#include <limits>
#include <tuple>

using namespace std;

struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode(int x) : val(x), left(NULL), right(NULL) {}
};

// Approach 1: Recursive
// Using long long to handle edge cases where val is INT_MAX or INT_MIN
bool isValidBSTRecursive(TreeNode* root, long minVal = LONG_MIN, long maxVal = LONG_MAX) {
    if (!root) return true;
    
    if (root->val <= minVal || root->val >= maxVal) return false;
    
    return isValidBSTRecursive(root->left, minVal, root->val) &&
           isValidBSTRecursive(root->right, root->val, maxVal);
}

// Approach 2: Iterative with std::stack
bool isValidBSTIterative(TreeNode* root) {
    if (!root) return true;
    stack<tuple<TreeNode*, long, long>> s;
    s.push({root, LONG_MIN, LONG_MAX});
    
    while (!s.empty()) {
        auto [node, minVal, maxVal] = s.top();
        s.pop();
        
        if (!node) continue;
        if (node->val <= minVal || node->val >= maxVal) return false;
        
        s.push({node->right, node->val, maxVal});
        s.push({node->left, minVal, node->val});
    }
    return true;
}`
    },
    {
      name: 'cpp/build_bst.cpp',
      language: 'c++',
      content: `#include <vector>
#include <climits>

struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode(int x) : val(x), left(NULL), right(NULL) {}
};

class Solution {
    int idx = 0;
public:
    TreeNode* bstFromPreorder(std::vector<int>& preorder) {
        idx = 0;
        return build(preorder, INT_MAX);
    }
    
    TreeNode* build(std::vector<int>& preorder, int bound) {
        if (idx == preorder.size() || preorder[idx] > bound) {
            return nullptr;
        }
        
        TreeNode* root = new TreeNode(preorder[idx++]);
        root.left = build(preorder, root->val);
        root.right = build(preorder, bound);
        
        return root;
    }
};`
    },
    {
      name: 'c/is_bst.c',
      language: 'c',
      content: `#include <stdio.h>
#include <stdlib.h>
#include <limits.h>
#include <stdbool.h>

struct TreeNode {
    int val;
    struct TreeNode *left;
    struct TreeNode *right;
};

// Approach 1: Recursive Helper
bool isValidBSTRecursiveHelper(struct TreeNode* root, long min, long max) {
    if (root == NULL) return true;
    
    if (root->val <= min || root->val >= max) return false;
    
    return isValidBSTRecursiveHelper(root->left, min, root->val) &&
           isValidBSTRecursiveHelper(root->right, root->val, max);
}

bool isValidBSTRecursive(struct TreeNode* root) {
    return isValidBSTRecursiveHelper(root, LONG_MIN, LONG_MAX);
}

// Approach 2: Iterative (Manual Stack Management)
struct State {
    struct TreeNode* node;
    long min;
    long max;
};

bool isValidBSTIterative(struct TreeNode* root) {
    if (!root) return true;
    
    // Simple fixed-size stack for demo. In production, use dynamic array.
    struct State stack[1000]; 
    int top = -1;
    
    stack[++top] = (struct State){root, LONG_MIN, LONG_MAX};
    
    while (top >= 0) {
        struct State current = stack[top--];
        struct TreeNode* node = current.node;
        
        if (!node) continue;
        if (node->val <= current.min || node->val >= current.max) return false;
        
        // Push Right then Left
        stack[++top] = (struct State){node->right, node->val, current.max};
        stack[++top] = (struct State){node->left, current.min, node->val};
    }
    return true;
}`
    },
    {
      name: 'c/build_bst.c',
      language: 'c',
      content: `#include <stdio.h>
#include <stdlib.h>
#include <limits.h>

struct TreeNode {
    int val;
    struct TreeNode *left;
    struct TreeNode *right;
};

struct TreeNode* createNode(int val) {
    struct TreeNode* node = (struct TreeNode*)malloc(sizeof(struct TreeNode));
    node->val = val;
    node->left = NULL;
    node->right = NULL;
    return node;
}

struct TreeNode* build(int* preorder, int preorderSize, int* idx, int bound) {
    if (*idx == preorderSize || preorder[*idx] > bound) {
        return NULL;
    }
    
    struct TreeNode* root = createNode(preorder[(*idx)++]);
    
    root->left = build(preorder, preorderSize, idx, root->val);
    root->right = build(preorder, preorderSize, idx, bound);
    
    return root;
}

struct TreeNode* bstFromPreorder(int* preorder, int preorderSize) {
    int idx = 0;
    return build(preorder, preorderSize, &idx, INT_MAX);
}`
    },
    {
      name: 'rust/is_bst.rs',
      language: 'rust',
      content: `use std::cell::RefCell;
use std::rc::Rc;

#[derive(Debug, PartialEq, Eq)]
pub struct TreeNode {
  pub val: i32,
  pub left: Option<Rc<RefCell<TreeNode>>>,
  pub right: Option<Rc<RefCell<TreeNode>>>,
}

// Approach 1: Recursive with Option types for bounds
// Using i64 for bounds to cover full i32 range of node values
pub fn is_valid_bst_recursive(root: Option<Rc<RefCell<TreeNode>>>) -> bool {
    fn validate(node: Option<Rc<RefCell<TreeNode>>>, min: Option<i64>, max: Option<i64>) -> bool {
        match node {
            Some(n) => {
                let val = n.borrow().val as i64;
                if let Some(min_val) = min { if val <= min_val { return false; } }
                if let Some(max_val) = max { if val >= max_val { return false; } }
                
                // Recursively call for children
                validate(n.borrow().left.clone(), min, Some(val)) &&
                validate(n.borrow().right.clone(), Some(val), max)
            }
            None => true,
        }
    }
    validate(root, None, None)
}

// Approach 2: Iterative with Vector as Stack
pub fn is_valid_bst_iterative(root: Option<Rc<RefCell<TreeNode>>>) -> bool {
    if root.is_none() { return true; }
    let mut stack = vec![(root, None::<i64>, None::<i64>)];
    
    while let Some((node_opt, min, max)) = stack.pop() {
        if let Some(node) = node_opt {
            let val = node.borrow().val as i64;
            
            if let Some(min_val) = min { if val <= min_val { return false; } }
            if let Some(max_val) = max { if val >= max_val { return false; } }
            
            stack.push((node.borrow().right.clone(), Some(val), max));
            stack.push((node.borrow().left.clone(), min, Some(val)));
        }
    }
    true
}`
    },
    {
      name: 'rust/build_bst.rs',
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
      right: None
    }
  }
}

pub fn bst_from_preorder(preorder: Vec<i32>) -> Option<Rc<RefCell<TreeNode>>> {
    let mut idx = 0;
    
    fn build(preorder: &Vec<i32>, idx: &mut usize, bound: i32) -> Option<Rc<RefCell<TreeNode>>> {
        if *idx == preorder.len() || preorder[*idx] > bound {
            return None;
        }
        
        let val = preorder[*idx];
        *idx += 1;
        
        let mut root = TreeNode::new(val);
        root.left = build(preorder, idx, val);
        root.right = build(preorder, idx, bound);
        
        Some(Rc::new(RefCell::new(root)))
    }
    
    build(&preorder, &mut idx, i32::MAX)
}`
    },
    {
      name: 'go/is_bst.go',
      language: 'go',
      content: `package main

import "math"

type TreeNode struct {
	Val   int
	Left  *TreeNode
	Right *TreeNode
}

// Approach 1: Recursive
func isValidBSTRecursive(root *TreeNode) bool {
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
}

// Approach 2: Iterative using Slice as Stack
type State struct {
	node *TreeNode
	min  int64
	max  int64
}

func isValidBSTIterative(root *TreeNode) bool {
	if root == nil {
		return true
	}
	stack := []State{{root, math.MinInt64, math.MaxInt64}}
	
	for len(stack) > 0 {
		curr := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		node := curr.node
		
		if node == nil {
			continue
		}
		if int64(node.Val) <= curr.min || int64(node.Val) >= curr.max {
			return false
		}
		
		stack = append(stack, State{node.Right, int64(node.Val), curr.max})
		stack = append(stack, State{node.Left, curr.min, int64(node.Val)})
	}
	return true
}`
    },
    {
      name: 'go/build_bst.go',
      language: 'go',
      content: `package main

import "math"

type TreeNode struct {
	Val   int
	Left  *TreeNode
	Right *TreeNode
}

func bstFromPreorder(preorder []int) *TreeNode {
	idx := 0
	
	var build func(bound int) *TreeNode
	build = func(bound int) *TreeNode {
		if idx == len(preorder) || preorder[idx] > bound {
			return nil
		}
		
		root := &TreeNode{Val: preorder[idx]}
		idx++
		
		root.Left = build(root.Val)
		root.Right = build(bound)
		
		return root
	}
	
	return build(math.MaxInt64)
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
    { id: 'all', label: 'Polyglot (All Languages)' },
    { id: 'python', label: 'Python' },
    { id: 'javascript', label: 'JavaScript' },
    { id: 'typescript', label: 'TypeScript' },
    { id: 'java', label: 'Java' },
    { id: 'cpp', label: 'C++' },
    { id: 'c', label: 'C' },
    { id: 'csharp', label: 'C#' },
    { id: 'rust', label: 'Rust' },
    { id: 'go', label: 'Go' },
    { id: 'web', label: 'React Web App' }
];

export const CodeStudio: React.FC<CodeStudioProps> = ({ onBack, currentUser }) => {
  const [project, setProject] = useState<CodeProject>(INITIAL_PROJECT);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [output, setOutput] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [activeTemplate, setActiveTemplate] = useState('all');
  const [viewMode, setViewMode] = useState<'code' | 'review'>('code');
  const [isSaving, setIsSaving] = useState(false);
  
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

  // Load project review if available
  useEffect(() => {
      if (project.review) {
          setOutput(project.review);
      } else {
          setOutput('');
      }
  }, [project]);

  const activeFile = project.files[activeFileIndex];

  const handleTemplateChange = (tmpl: string) => {
    setActiveTemplate(tmpl);
    if (tmpl === 'all') {
        setProject(INITIAL_PROJECT);
    } else if (tmpl === 'web') {
        setProject({
            id: 'proj-web',
            name: 'React Web Starter',
            lastModified: Date.now(),
            files: WEB_PROJECT_FILES
        });
    } else {
        // Filter from polyglot
        const filtered = INITIAL_PROJECT.files.filter(f => f.name.startsWith(tmpl + '/'));
        setProject({
            id: `proj-${tmpl}`,
            name: `${tmpl.charAt(0).toUpperCase() + tmpl.slice(1)} Project`,
            lastModified: Date.now(),
            files: filtered.length > 0 ? filtered : [{name: `${tmpl}/main`, language: 'text', content: '// Empty'}]
        });
    }
    setActiveFileIndex(0);
    setViewMode('code');
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
            4. Highlight **Language-Specific Best Practices** demonstrated in the code (e.g., Python's float('-inf'), C++ struct binding, Java Integer objects).
            
            This is "Gold Standard" educational code. Focus on *teaching* why it is good, rather than finding bugs (unless you see a critical flaw).
            
            Return the response in structured Markdown with clear headers.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview', 
            contents: prompt
        });
        
        const reviewText = response.text || "No feedback generated.";
        setOutput(reviewText);
        // Persist review in local project state (not saved to cloud yet unless saved)
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
          // Save both code and review
          const projectToSave = { ...project, review: output };
          await saveCodeProject(projectToSave);
          alert("Project saved to Cloud!");
      } catch (e) {
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
      if (name.includes('/')) {
          const folderName = name.split('/')[0];
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
  const filesByFolder: Record<string, {file: CodeFile, index: number}[]> = React.useMemo(() => {
      const groups: Record<string, {file: CodeFile, index: number}[]> = {};
      project.files.forEach((file, index) => {
          const parts = file.name.split('/');
          const folder = parts.length > 1 ? parts[0] : 'root';
          if (!groups[folder]) groups[folder] = [];
          groups[folder].push({ file, index });
      });
      return groups;
  }, [project.files]);

  const sortedFolders: string[] = Object.keys(filesByFolder).sort((a,b) => a === 'root' ? -1 : b === 'root' ? 1 : a.localeCompare(b));

  const lineNumbers = activeFile.content.split('\n').length;

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
                title="Save Project to Firebase"
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
              
              {/* File Tabs */}
              <div className="flex overflow-x-auto bg-[#252526] scrollbar-thin scrollbar-thumb-[#3d3d3d] shrink-0">
                  {project.files.map((file, idx) => (
                      <div 
                        key={idx}
                        onClick={() => { setActiveFileIndex(idx); setViewMode('code'); }}
                        className={`px-4 py-2 text-xs border-r border-[#1e1e1e] cursor-pointer flex items-center gap-2 min-w-[120px] hover:bg-[#2d2d2d] transition-colors ${activeFileIndex === idx ? 'bg-[#1e1e1e] text-white border-t-2 border-t-indigo-500' : 'bg-[#2d2d2d] text-gray-500'}`}
                      >
                          <FileIcon filename={file.name} />
                          <span>{file.name.split('/').pop()}</span>
                      </div>
                  ))}
              </div>

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
                              value={activeFile.content}
                              onChange={(e) => handleCodeChange(e.target.value)}
                              onScroll={handleScroll}
                              className="w-full h-full bg-[#1e1e1e] text-gray-200 p-4 font-mono text-sm outline-none resize-none leading-relaxed whitespace-pre overflow-auto"
                              spellCheck={false}
                              autoCapitalize="off"
                              autoComplete="off"
                              autoCorrect="off"
                          />
                          <div className="absolute top-2 right-4 text-xs text-gray-500 bg-[#1e1e1e]/90 px-2 py-1 rounded pointer-events-none border border-[#3d3d3d]">
                              {getLanguageFromFilename(activeFile.name).toUpperCase()}
                          </div>
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
