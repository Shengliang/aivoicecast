import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { ArrowLeft, Save, Folder, File, Code, Plus, Trash2, Loader2, ChevronRight, ChevronDown, X, MessageSquare, FileCode, FileJson, FileType, Search, Coffee, Hash, CloudUpload, Edit3, BookOpen, Bot, Send, Maximize2, Minimize2, GripVertical, UserCheck, AlertTriangle, Archive, Sparkles, Video, Mic, CheckCircle, Monitor, FileText, Eye, Github, GitBranch, GitCommit, FolderOpen, RefreshCw, GraduationCap, DownloadCloud } from 'lucide-react';
import { GEMINI_API_KEY } from '../services/private_keys';
import { CodeProject, CodeFile, ChatMessage, Channel, GithubMetadata } from '../types';
import { MarkdownView } from './MarkdownView';
import { saveCodeProject } from '../services/firestoreService';
import { signInWithGitHub, reauthenticateWithGitHub } from '../services/authService';
import { fetchUserRepos, fetchRepoContents, commitToRepo, fetchPublicRepoInfo } from '../services/githubService';
import { LiveSession } from './LiveSession';

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

// --- FILE TREE UTILS ---

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children: FileNode[];
  index?: number; // Index in the flat project.files array
}

const buildFileTree = (files: CodeFile[]): FileNode[] => {
  const root: FileNode[] = [];
  const map: Record<string, FileNode> = {};

  files.forEach((file, originalIndex) => {
    const parts = file.name.split('/');
    let currentPath = '';
    let parentNode: FileNode | null = null;
    
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      const currentFullPath = currentPath ? `${currentPath}/${part}` : part;
      
      if (!map[currentFullPath]) {
        const node: FileNode = {
          name: part,
          path: currentFullPath,
          type: isFile ? 'file' : 'folder',
          children: [],
          index: isFile ? originalIndex : undefined
        };
        map[currentFullPath] = node;
        
        if (parentNode) {
          parentNode.children.push(node);
        } else {
          root.push(node);
        }
      }
      
      parentNode = map[currentFullPath];
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
}> = ({ node, depth, activeFileIndex, onSelect, expandedFolders, toggleFolder }) => {
  const isOpen = expandedFolders[node.path];
  
  if (node.type === 'folder') {
    return (
      <>
        <button 
          onClick={() => toggleFolder(node.path)}
          className={`w-full flex items-center space-x-1 px-3 py-1.5 text-xs text-left hover:bg-slate-800 transition-colors text-slate-400 hover:text-white`}
          style={{ paddingLeft: `${depth * 12 + 12}px` }}
        >
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
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

export const CodeStudio: React.FC<CodeStudioProps> = ({ onBack, currentUser }) => {
  const [project, setProject] = useState<CodeProject>(EXAMPLE_PROJECTS['is_bst']);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [output, setOutput] = useState('');
  const [humanComments, setHumanComments] = useState('');
  const [interviewFeedback, setInterviewFeedback] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [activeSideView, setActiveSideView] = useState<'none' | 'chat' | 'tutor' | 'review'>('none');
  const [isSaving, setIsSaving] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showExamplesDropdown, setShowExamplesDropdown] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  
  // Selection State for Context Awareness
  const [selection, setSelection] = useState('');

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatWidth, setChatWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Interview Practice State
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [isInterviewSession, setIsInterviewSession] = useState(false);
  const [showInterviewSetup, setShowInterviewSetup] = useState(false);
  const [recordInterview, setRecordInterview] = useState(false);

  // GitHub State
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false); // New Modal for Import
  const [publicRepoPath, setPublicRepoPath] = useState('');
  const [isLoadingPublic, setIsLoadingPublic] = useState(false);
  
  const [repos, setRepos] = useState<any[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [needsGitHubReauth, setNeedsGitHubReauth] = useState(false);
  
  // Check if user is already linked to GitHub
  const isGithubLinked = currentUser?.providerData?.some((p: any) => p.providerId === 'github.com');
  
  // Refs for scrolling sync
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const activeFile = project.files[activeFileIndex] || project.files[0];
  const isMarkdown = activeFile ? activeFile.name.toLowerCase().endsWith('.md') : false;

  // Build Tree
  const fileTree = React.useMemo(() => buildFileTree(project.files), [project.files]);

  // Mobile check
  useEffect(() => {
      if (window.innerWidth < 768) setIsSidebarOpen(false);
      
      // Auto expand root folders on first load
      const initialExpanded: Record<string, boolean> = {};
      // Expand top level directories by default
      project.files.forEach(f => {
          const parts = f.name.split('/');
          if (parts.length > 1) {
              initialExpanded[parts[0]] = true; 
          }
      });
      setExpandedFolders(prev => ({ ...initialExpanded, ...prev }));
  }, [project.files]);

  // Load project review, comments, and history
  useEffect(() => {
      setOutput(project.review || '');
      setHumanComments(project.humanComments || '');
      setInterviewFeedback(project.interviewFeedback || '');
      if (project.chatHistory) setChatMessages(project.chatHistory);
  }, [project]);

  // Scroll chat to bottom
  useEffect(() => {
      if (activeSideView === 'chat') {
          chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
  }, [chatMessages, activeSideView]);

  const handleTextSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      if (start !== end) {
          setSelection(target.value.substring(start, end));
      } else {
          setSelection('');
      }
  };

  // Resizing Logic
  const startResizing = (mouseDownEvent: React.MouseEvent) => {
      mouseDownEvent.preventDefault();
      const startX = mouseDownEvent.clientX;
      const startWidth = chatWidth;

      const doDrag = (dragEvent: MouseEvent) => {
          // Chat is on right, dragging left increases width
          const newWidth = startWidth + (startX - dragEvent.clientX);
          setChatWidth(Math.max(250, Math.min(newWidth, 800)));
      };

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
      const langConfig = LANGUAGES.find(l => l.id === langId);
      if (!langConfig) return;

      const baseName = "code";
      let fileName = `${baseName}.${langConfig.ext}`;
      let counter = 1;
      
      // Find unique filename
      while (project.files.some(f => f.name === fileName)) {
          fileName = `${baseName}_${counter}.${langConfig.ext}`;
          counter++;
      }

      const newFile: CodeFile = {
          name: fileName,
          language: langConfig.id as any,
          content: langConfig.defaultCode
      };

      setProject(prev => ({
          ...prev,
          files: [...prev.files, newFile]
      }));
      
      setActiveFileIndex(project.files.length); // Append to end (current length is index of new last item)
      setShowLanguageDropdown(false);
      setIsPreviewMode(false);
  };

  const handleExampleSwitch = (exampleKey: string) => {
      const example = EXAMPLE_PROJECTS[exampleKey];
      if (!example) return;
      
      setProject({
          ...example,
          id: `proj-${exampleKey}-${Date.now()}` // Unique ID for current session
      });
      setActiveFileIndex(0);
      setActiveSideView('none');
      setShowExamplesDropdown(false);
      setHumanComments('');
      setInterviewFeedback('');
      setOutput('');
      setChatMessages([]);
      setIsPreviewMode(false);
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

  const toggleFolder = (path: string) => {
      setExpandedFolders(prev => ({
          ...prev,
          [path]: !prev[path]
      }));
  };

  // --- GITHUB INTEGRATION ---

  const handleGitHubConnect = async () => {
      try {
          let token: string | null = null;
          
          if (needsGitHubReauth || isGithubLinked) {
              try {
                  const res = await reauthenticateWithGitHub();
                  token = res.token;
                  setNeedsGitHubReauth(false); // Reset flag on success
              } catch (reauthError: any) {
                  throw reauthError;
              }
          } else {
              const res = await signInWithGitHub();
              token = res.token;
          }

          if (token) {
              setGithubToken(token);
              setShowImportModal(false); // Close the new import modal
              setShowGithubModal(true); // Open the list of repos
              setIsLoadingRepos(true);
              const repos = await fetchUserRepos(token);
              setRepos(repos);
              setIsLoadingRepos(false);
          }
      } catch(e: any) {
          if (e.message === 'github-account-already-linked' || e.code === 'auth/credential-already-in-use') {
              setNeedsGitHubReauth(true);
              alert("GitHub is already linked to your account. Please click 'Reconnect GitHub' to refresh permissions.");
          } else if (e.code === 'auth/popup-blocked') {
              alert("Browser blocked the login popup. Please click the button again and allow popups for this site.");
          } else {
              alert("GitHub Login Failed: " + e.message);
          }
      }
  };

  const handleLoadPublicRepo = async () => {
      if (!publicRepoPath.trim()) return;
      setIsLoadingPublic(true);
      try {
          const parts = publicRepoPath.split('/');
          if (parts.length < 2) throw new Error("Invalid format. Use 'owner/repo'");
          const owner = parts[0].trim();
          const repo = parts[1].trim(); 

          const info = await fetchPublicRepoInfo(owner, repo);
          
          // Use existing token if available for higher rate limits, else null
          const tokenToUse = githubToken || null;
          
          const { files, latestSha } = await fetchRepoContents(tokenToUse, owner, repo, info.default_branch);

          setProject({
                id: `gh-${info.id}`,
                name: info.full_name,
                files: files,
                lastModified: Date.now(),
                github: {
                    owner: owner,
                    repo: repo,
                    branch: info.default_branch,
                    sha: latestSha
                }
            });
            
          setActiveFileIndex(0);
          setShowImportModal(false);
          setPublicRepoPath('');
          setChatMessages(prev => [...prev, {role: 'ai', text: `Loaded public repository **${info.full_name}**.`}]);

      } catch (e: any) {
          if (e.message.includes('rate limit')) {
              if(confirm("GitHub API Rate Limit Exceeded.\n\nAnonymous requests are limited to 60/hour.\n\nWould you like to sign in with GitHub to increase your limit to 5000/hour?")) {
                  // Keep modal open, let user click the button
              }
          } else {
              alert("Failed to load public repo: " + e.message);
          }
      } finally {
          setIsLoadingPublic(false);
      }
  };

  const handleRepoSelect = async (repo: any) => {
      setIsLoadingRepos(true);
      try {
          if (!githubToken) throw new Error("No token");
          const { files, latestSha } = await fetchRepoContents(githubToken, repo.owner.login, repo.name, repo.default_branch);
          
          setProject({
              id: `gh-${repo.id}`,
              name: repo.full_name,
              files: files,
              lastModified: Date.now(),
              github: {
                  owner: repo.owner.login,
                  repo: repo.name,
                  branch: repo.default_branch,
                  sha: latestSha
              }
          });
          
          setActiveFileIndex(0);
          setShowGithubModal(false);
          setChatMessages(prev => [...prev, {role: 'ai', text: `Loaded repository **${repo.full_name}** successfully.`}]);
      } catch(e: any) {
          alert("Failed to load repo: " + e.message);
      } finally {
          setIsLoadingRepos(false);
      }
  };

  const handleCommit = async () => {
      // Check if we have write access (token)
      if (!githubToken) {
          if(confirm("You need to sign in with GitHub to commit changes. Connect now?")) {
              try {
                  await handleGitHubConnect();
              } catch(e) {}
          }
          return;
      }

      if (!commitMessage.trim()) return;
      if (!project.github) return;
      
      setIsCommitting(true);
      try {
          const newSha = await commitToRepo(githubToken, project, commitMessage);
          setProject(prev => ({
              ...prev,
              github: prev.github ? { ...prev.github, sha: newSha } : undefined
          }));
          alert("Changes committed and pushed successfully!");
          setShowCommitModal(false);
          setCommitMessage('');
      } catch(e: any) {
          alert("Commit failed: " + e.message);
      } finally {
          setIsCommitting(false);
      }
  };

  const handleGenerateQuestions = async () => {
      setIsGeneratingQuestions(true);
      try {
          const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
          if (!apiKey) throw new Error("API Key required.");
          
          const ai = new GoogleGenAI({ apiKey });
          
          const prompt = `
            Generate 2 medium-difficulty coding interview questions (Algorithm/Data Structure focus).
            Format the output as clear Markdown.
            For each question include:
            1. Problem Title
            2. Problem Description
            3. Example Input/Output
            4. Constraints
            
            Do not provide the solution.
          `;

          const response = await ai.models.generateContent({
              model: 'gemini-3-pro-preview',
              contents: prompt
          });

          const content = response.text || "Failed to generate questions.";
          const timestamp = Date.now();
          const qFileName = `interview_q_${timestamp}.md`;
          
          // 1. Create Question File
          const qFile: CodeFile = {
              name: qFileName,
              language: 'markdown',
              content: content
          };
          
          // 2. Create Solution File (Auto-detected Language)
          const currentExt = project.files[activeFileIndex]?.name.split('.').pop() || 'cpp';
          const langConfig = LANGUAGES.find(l => l.ext === currentExt) || LANGUAGES[0];
          const sFileName = `solution_${timestamp}.${langConfig.ext}`;
          
          const sFile: CodeFile = {
              name: sFileName,
              language: langConfig.id as any,
              content: langConfig.defaultCode
          };
          
          // 3. Update Project State
          setProject(prev => ({
              ...prev,
              files: [...prev.files, qFile, sFile]
          }));
          
          // 4. Post to Chat
          const aiMsg = `### Interview Questions Generated\n\nI've created a file **${qFileName}** with the questions.\n\nI also created **${sFileName}** for you to start coding your solution.\n\nHere are the questions for reference:\n\n${content}`;
          setChatMessages(prev => [...prev, { role: 'ai', text: aiMsg }]);
          
          // 5. UX Updates
          setActiveFileIndex(project.files.length + 1); // Switch to the NEW Solution file (Index: old_len + 1)
          setIsPreviewMode(false);
          setIsSidebarOpen(true);
          setActiveSideView('chat'); // Open chat so they see questions while coding

      } catch(e: any) {
          alert(`Error: ${e.message}`);
      } finally {
          setIsGeneratingQuestions(false);
      }
  };

  const handleStartMockInterview = () => {
      setShowInterviewSetup(true);
  };

  const handleStartTutorSession = () => {
      if (!activeFile) return;
      setActiveSideView('tutor');
  };

  const confirmStartInterview = () => {
      setShowInterviewSetup(false);
      setIsInterviewSession(true);
  };

  const handleReviewCode = async () => {
    setIsReviewing(true);
    setChatMessages(prev => [...prev, { role: 'ai', text: "🔄 *Analyzing code... Please wait.*" }]);

    try {
        const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
        if (!apiKey) throw new Error("API Key required for AI review.");
        
        const ai = new GoogleGenAI({ apiKey });
        const codeFiles = project.files.filter(f => !f.name.endsWith('.md'));
        
        const fileContext = codeFiles.map(f => {
            const lang = getLanguageFromFilename(f.name);
            return `--- File: ${f.name} (Language: ${lang}) ---\n${f.content}`;
        }).join('\n\n');
        
        const prompt = `
            You are a Senior Principal Software Engineer.
            Project Context:
            ${fileContext}
            
            Task:
            1. Analyze **Time and Space Complexity**.
            2. Explain the **Logic** clearly.
            3. Highlight **Potential Bugs** or **Edge Cases**.
            4. Suggest **Refactoring** for readability/performance.
            
            Return the response in detailed Markdown.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview', 
            contents: prompt
        });
        
        const reviewText = response.text || "No feedback generated.";
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fileName = `reviews/Review_${timestamp}.md`;
        
        const newFile: CodeFile = {
            name: fileName,
            language: 'markdown',
            content: reviewText
        };
        
        setChatMessages(prev => {
            const filtered = prev.filter(m => !m.text.includes("Analyzing code"));
            const newMsg: ChatMessage = { role: 'ai', text: `## Code Review\n\nI have analyzed your code. You can find the full report in **${fileName}**.\n\n` + reviewText };
            return [...filtered, newMsg];
        });

        setProject((currentProject) => {
            const updated: CodeProject = { 
                ...currentProject, 
                review: reviewText,
                chatHistory: [...(currentProject.chatHistory || []), { role: 'ai', text: `## Code Review\n\n` + reviewText }],
                files: [...currentProject.files, newFile] 
            };
            
            setTimeout(() => {
                setExpandedFolders(f => ({...f, 'reviews': true}));
                if (currentUser) saveCodeProject(updated).catch(e => console.error("Auto-save review failed", e));
            }, 0);

            return updated;
        });
        
    } catch (e: any) {
        setChatMessages(prev => [...prev, { role: 'ai', text: `Review Error: ${e.message}` }]);
    } finally {
        setIsReviewing(false);
    }
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
          if (!apiKey) throw new Error("API Key required.");
          
          const ai = new GoogleGenAI({ apiKey });
          
          const fileContext = activeFile ? `--- CURRENT FILE: ${activeFile.name} ---\n${activeFile.content}` : "No file active.";
          const historyText = newHistory.slice(-20).map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
          
          const prompt = `
            You are an expert Coding Assistant built into an IDE.
            
            CONTEXT:
            ${fileContext}
            
            CHAT HISTORY:
            ${historyText}
            
            USER QUESTION:
            ${userMsg}
            
            Provide a helpful, concise response. If you provide code, wrap it in markdown code blocks.
          `;

          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt
          });

          const aiMsg = response.text || "I couldn't generate a response.";
          setChatMessages(prev => [...prev, { role: 'ai', text: aiMsg }]);
          
          setProject(prev => ({ ...prev, chatHistory: [...newHistory, { role: 'ai' as const, text: aiMsg }] }));

      } catch(e: any) {
          setChatMessages(prev => [...prev, { role: 'ai', text: `Error: ${e.message}` }]);
      } finally {
          setIsChatLoading(false);
      }
  };

  const handleSaveChatSession = async () => {
      if (chatMessages.length === 0) return;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `chats/Chat_${timestamp}.md`;
      
      const content = chatMessages.map(m => `**${m.role.toUpperCase()}**: ${m.text}`).join('\n\n');
      
      const newFile: CodeFile = {
          name: fileName,
          language: 'markdown',
          content: content
      };
      
      setProject(prev => {
          const updated = {
              ...prev,
              files: [...prev.files, newFile]
          };
          return updated;
      });
      
      setChatMessages([]);
      alert("Chat session saved to project file.");
  };

  const handleSaveProject = async () => {
      if (!currentUser) {
          alert("Please sign in to save projects.");
          return;
      }
      setIsSaving(true);
      try {
          await saveCodeProject(project);
          alert("Project saved successfully!");
      } catch(e) {
          console.error(e);
          alert("Failed to save project.");
      } finally {
          setIsSaving(false);
      }
  };

  const interviewChannel: Channel = {
      id: 'mock-interview',
      title: 'Mock Interviewer',
      description: 'Technical Interview Practice',
      author: 'AI',
      voiceName: 'Fenrir',
      systemInstruction: 'You are a Senior Technical Interviewer at a FAANG company. Conduct a rigorous coding interview. Ask follow-up questions about complexity and edge cases.',
      likes: 0,
      dislikes: 0,
      comments: [],
      tags: ['Interview'],
      imageUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&q=80',
      createdAt: Date.now()
  };

  const tutorChannel: Channel = {
      id: 'code-tutor',
      title: 'Code Tutor',
      description: 'Interactive Code Explanation',
      author: 'AI',
      voiceName: 'Puck', // Friendly voice
      systemInstruction: 'You are a patient and knowledgeable Senior Engineer acting as a Code Tutor. Monitor the user activity. The user will be clicking files or selecting code. When they do, explain the context, walk through logic, or answer their questions. Be concise but insightful. Relate the code to best practices.',
      likes: 0,
      dislikes: 0,
      comments: [],
      tags: ['Tutor', 'Education'],
      imageUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&q=80',
      createdAt: Date.now()
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
      
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
               <div className="flex flex-col">
                   <h1 className="font-bold text-white hidden sm:block truncate max-w-[200px] text-sm">{project.name}</h1>
                   {project.github && <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1"><GitBranch size={10}/> {project.github.branch}</span>}
               </div>
            </div>
            
            {/* Project Actions */}
            <div className="flex items-center space-x-1 bg-slate-800 rounded-lg p-1 border border-slate-700">
               <button onClick={handleSaveProject} disabled={isSaving} className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors" title="Save Project">
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
               </button>
               {project.github ? (
                   <button onClick={() => setShowCommitModal(true)} className="p-2 hover:bg-slate-700 rounded text-emerald-400 hover:text-white transition-colors" title="Commit to GitHub">
                       <GitCommit size={16} />
                   </button>
               ) : (
                   <button 
                       onClick={() => setShowImportModal(true)} 
                       className={`p-2 hover:bg-slate-700 rounded transition-colors ${(needsGitHubReauth || isGithubLinked) ? 'text-amber-400 hover:text-amber-200' : 'text-slate-400 hover:text-white'}`} 
                       title="Import Project from GitHub"
                   >
                       {(needsGitHubReauth || isGithubLinked) ? <RefreshCw size={16} /> : <Github size={16} />}
                   </button>
               )}
               <button onClick={() => setActiveSideView(activeSideView === 'review' ? 'none' : 'review')} className={`p-2 rounded transition-colors ${activeSideView === 'review' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`} title="Code Review">
                  <CheckCircle size={16} />
               </button>
               <button onClick={() => setActiveSideView(activeSideView === 'chat' ? 'none' : 'chat')} className={`p-2 rounded transition-colors ${activeSideView === 'chat' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`} title="AI Assistant">
                  <Bot size={16} />
               </button>
               
               {/* Teach Me Button */}
               <button 
                   onClick={handleStartTutorSession}
                   className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-lg ml-2 ${activeSideView === 'tutor' ? 'bg-emerald-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'}`}
                   title="Start interactive lesson about this file"
               >
                   <GraduationCap size={14} /> <span className="hidden xl:inline">Teach Me</span>
               </button>
            </div>
         </div>

         <div className="flex items-center space-x-3">
            <div className="relative">
                <button 
                    onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                    className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-bold transition-colors"
                >
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

            <div className="relative">
                <button 
                    onClick={() => setShowExamplesDropdown(!showExamplesDropdown)}
                    className="flex items-center space-x-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors shadow-lg shadow-indigo-500/20"
                >
                    <BookOpen size={14} /> <span>Examples</span>
                </button>
                {showExamplesDropdown && (
                    <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowExamplesDropdown(false)}></div>
                    <div className="absolute top-full right-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-40 overflow-hidden py-1">
                        {Object.keys(EXAMPLE_PROJECTS).map(key => (
                            <button key={key} onClick={() => handleExampleSwitch(key)} className="w-full text-left px-4 py-2 hover:bg-slate-800 text-xs text-slate-300 hover:text-white">
                                {EXAMPLE_PROJECTS[key].name}
                            </button>
                        ))}
                    </div>
                    </>
                )}
            </div>
         </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
         
         {/* Sidebar File Tree */}
         <div className={`${isSidebarOpen ? 'w-64' : 'w-0'} bg-slate-900 border-r border-slate-800 flex-shrink-0 transition-all duration-300 overflow-y-auto`}>
            <div className="p-4">
               <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Explorer</h3>
               <div className="space-y-0.5">
                  {fileTree.map(node => (
                    <FileTreeNode 
                        key={node.path}
                        node={node}
                        depth={0}
                        activeFileIndex={activeFileIndex}
                        onSelect={(idx) => { setActiveFileIndex(idx); setSelection(''); }}
                        expandedFolders={expandedFolders}
                        toggleFolder={toggleFolder}
                    />
                  ))}
                  {fileTree.length === 0 && <p className="text-xs text-slate-600 italic">No files.</p>}
               </div>
            </div>
            
            <div className="p-4 border-t border-slate-800">
               <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tools</h3>
               <div className="space-y-2">
                   <button 
                      onClick={handleGenerateQuestions} 
                      disabled={isGeneratingQuestions}
                      className="w-full flex items-center space-x-2 px-3 py-2 bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-400 rounded-lg text-xs font-medium transition-colors border border-slate-700"
                   >
                      {isGeneratingQuestions ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      <span>Generate Questions</span>
                   </button>
                   <button 
                      onClick={handleStartMockInterview}
                      className="w-full flex items-center space-x-2 px-3 py-2 bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-400 rounded-lg text-xs font-medium transition-colors border border-slate-700"
                   >
                      <Mic size={14} />
                      <span>Live Mock Interview</span>
                   </button>
               </div>
            </div>
         </div>

         {/* Main Editor Area */}
         <div className="flex-1 flex flex-col min-w-0 relative">
            
            {/* Editor Tabs */}
            <div className="flex items-center bg-slate-900 border-b border-slate-800 px-2 overflow-x-auto scrollbar-hide">
               <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-500 hover:text-white mr-2">
                  {isSidebarOpen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}
               </button>
               
               {project.files.map((file, idx) => (
                  <div 
                    key={idx}
                    onClick={() => setActiveFileIndex(idx)}
                    className={`flex items-center space-x-2 px-4 py-2.5 border-r border-slate-800 cursor-pointer min-w-[120px] max-w-[200px] ${activeFileIndex === idx ? 'bg-slate-950 text-white border-t-2 border-t-indigo-500' : 'bg-slate-900 text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}
                  >
                     <FileIcon filename={file.name} />
                     <span className="text-xs font-medium truncate" title={file.name}>{file.name.split('/').pop()}</span>
                     {activeFileIndex === idx && (
                        <button className="ml-auto text-slate-500 hover:text-red-400" onClick={(e) => { e.stopPropagation(); /* close file logic */ }}>
                           <X size={12} />
                        </button>
                     )}
                  </div>
               ))}
            </div>

            {/* Editor Content */}
            <div className="flex-1 relative bg-slate-950 flex overflow-hidden">
                {/* Markdown Preview Toggle */}
                {isMarkdown && (
                    <button
                        onClick={() => setIsPreviewMode(!isPreviewMode)}
                        className="absolute top-2 right-6 z-20 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-lg border border-slate-700 shadow-lg flex items-center gap-2 backdrop-blur-sm transition-all"
                    >
                        {isPreviewMode ? <Code size={14}/> : <Eye size={14}/>}
                        <span>{isPreviewMode ? "Edit Source" : "Preview"}</span>
                    </button>
                )}

                {isMarkdown && isPreviewMode ? (
                    <div className="flex-1 overflow-y-auto p-8 bg-slate-950">
                        <div className="max-w-3xl mx-auto pb-20">
                            <MarkdownView content={activeFile.content} />
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Line Numbers */}
                        <div 
                            ref={lineNumbersRef}
                            className="w-12 bg-slate-900 border-r border-slate-800 text-right text-slate-600 font-mono text-sm py-4 pr-3 select-none overflow-hidden flex-shrink-0"
                        >
                            {activeFile.content.split('\n').map((_, i) => (
                                <div key={i} className="leading-6">{i + 1}</div>
                            ))}
                        </div>
                        
                        {/* Code Textarea */}
                        <textarea
                            ref={textareaRef}
                            value={activeFile.content}
                            onChange={(e) => handleCodeChange(e.target.value)}
                            onScroll={handleScroll}
                            onSelect={handleTextSelect}
                            className="flex-1 bg-transparent text-slate-300 font-mono text-sm p-4 outline-none resize-none leading-6 whitespace-pre"
                            spellCheck={false}
                        />
                    </>
                )}
                
                {/* Live Session Overlay (Mock Interview) */}
                {isInterviewSession && (
                    <div className="absolute right-4 bottom-4 w-80 h-96 z-50 bg-slate-900 rounded-xl shadow-2xl border border-indigo-500/50 overflow-hidden flex flex-col animate-fade-in-up">
                        <div className="bg-indigo-900/20 p-2 flex justify-between items-center border-b border-indigo-500/20">
                            <span className="text-xs font-bold text-indigo-300 flex items-center gap-2"><Mic size={12}/> Live Interview</span>
                            <button onClick={() => setIsInterviewSession(false)} className="text-indigo-400 hover:text-white"><X size={14}/></button>
                        </div>
                        <div className="flex-1 relative">
                            <LiveSession 
                                channel={interviewChannel}
                                recordingEnabled={recordInterview}
                                onEndSession={() => setIsInterviewSession(false)}
                                language="en"
                            />
                        </div>
                    </div>
                )}
            </div>
         </div>

         {/* Resizable Chat/Review/Tutor Panel */}
         {activeSideView !== 'none' && (
             <>
                <div 
                    className="w-1 bg-slate-800 hover:bg-indigo-500 cursor-col-resize z-30 transition-colors"
                    onMouseDown={startResizing}
                />
                <div style={{ width: chatWidth }} className="bg-slate-900 border-l border-slate-800 flex flex-col flex-shrink-0 relative">
                    <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            {activeSideView === 'tutor' && <><GraduationCap size={16} className="text-emerald-400"/> Code Tutor</>}
                            {activeSideView === 'chat' && <><Bot size={16} className="text-indigo-400"/> AI Assistant</>}
                            {activeSideView === 'review' && <><CheckCircle size={16} className="text-purple-400"/> Code Review</>}
                        </h3>
                        <div className="flex gap-1">
                            {activeSideView === 'chat' && (
                                <button onClick={handleSaveChatSession} className="p-1.5 text-slate-400 hover:text-emerald-400 rounded hover:bg-slate-800" title="Save Chat">
                                    <Archive size={16} />
                                </button>
                            )}
                            <button onClick={() => setActiveSideView('none')} className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800">
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                    
                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto relative scrollbar-thin scrollbar-thumb-slate-700">
                        {activeSideView === 'tutor' ? (
                            <LiveSession 
                                channel={tutorChannel}
                                initialContext={`
[USER ACTIVITY UPDATE]
Current File: ${activeFile.name}
Language: ${activeFile.language}
Current Directory: ${activeFile.name.includes('/') ? activeFile.name.split('/').slice(0, -1).join('/') : 'root'}
${selection ? `\nUSER SELECTED CODE:\n\`\`\`\n${selection}\n\`\`\`\n(The user is asking about this specific selection)` : ''}

--- FILE CONTENT ---
${activeFile.content}
--------------------

If the user asks questions, answer based on this new context. If they just switched files, acknowledge it briefly.
`}
                                lectureId={`tutor-${project.id}`} // Stabilized ID to prevent unmounts
                                recordingEnabled={false}
                                onEndSession={() => setActiveSideView('none')}
                                language="en"
                            />
                        ) : activeSideView === 'review' ? (
                            <div className="p-4 space-y-4">
                                <div className="text-center mb-4">
                                    <button onClick={handleReviewCode} disabled={isReviewing} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-xs font-bold shadow-lg transition-colors flex items-center justify-center gap-2">
                                        <Search size={14}/> Run New Analysis
                                    </button>
                                </div>
                                {isReviewing ? (
                                    <div className="text-center text-slate-500"><Loader2 className="animate-spin mx-auto mb-2"/> Analyzing code...</div>
                                ) : project.review ? (
                                    <MarkdownView content={project.review} />
                                ) : (
                                    <p className="text-slate-500 text-center text-sm">No review generated yet.</p>
                                )}
                            </div>
                        ) : (
                            // Chat View
                            <div className="p-4 space-y-4 min-h-full">
                                {chatMessages.length === 0 && (
                                    <div className="text-center text-slate-500 mt-10">
                                        <Bot size={32} className="mx-auto mb-2 opacity-50"/>
                                        <p className="text-xs">Ask me to explain code, find bugs, or optimize algorithms.</p>
                                    </div>
                                )}
                                {chatMessages.map((msg, idx) => (
                                    <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                        <div className={`max-w-[90%] p-3 rounded-xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                                            <MarkdownView content={msg.text} />
                                        </div>
                                    </div>
                                ))}
                                {isChatLoading && (
                                    <div className="flex items-center space-x-2 text-slate-500 text-xs">
                                        <Loader2 size={12} className="animate-spin"/>
                                        <span>Thinking...</span>
                                    </div>
                                )}
                                <div ref={chatEndRef} />
                            </div>
                        )}
                    </div>

                    {/* Chat Input (Only for Chat Mode) */}
                    {activeSideView === 'chat' && (
                        <div className="p-3 border-t border-slate-800 bg-slate-900">
                            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg p-1">
                                <input 
                                    type="text" 
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleChatSubmit()}
                                    placeholder="Type a message..."
                                    className="flex-1 bg-transparent text-sm text-white px-2 focus:outline-none"
                                />
                                <button onClick={handleChatSubmit} disabled={!chatInput.trim() || isChatLoading} className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-md">
                                    <Send size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
             </>
         )}
      </div>

      {/* Import Modal */}
      {showImportModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">
                          <CloudUpload size={24} className="text-indigo-400"/> Import Project
                      </h3>
                      <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                  </div>

                  <div className="space-y-6">
                      {/* Public Repo Option */}
                      <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Public Repository (Read-Only)</label>
                          <div className="flex gap-2">
                              <input 
                                  type="text" 
                                  placeholder="owner/repo (e.g. facebook/react)" 
                                  value={publicRepoPath}
                                  onChange={e => setPublicRepoPath(e.target.value)}
                                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                              />
                              <button 
                                  onClick={handleLoadPublicRepo} 
                                  disabled={isLoadingPublic || !publicRepoPath.trim()}
                                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-xs transition-colors border border-slate-700"
                              >
                                  {isLoadingPublic ? <Loader2 size={14} className="animate-spin"/> : 'Load'}
                              </button>
                          </div>
                          <p className="text-[10px] text-slate-500">Fast load. No login required. Changes cannot be pushed back.</p>
                      </div>

                      <div className="relative flex py-2 items-center">
                          <div className="flex-grow border-t border-slate-800"></div>
                          <span className="flex-shrink-0 mx-4 text-slate-500 text-xs font-bold">OR</span>
                          <div className="flex-grow border-t border-slate-800"></div>
                      </div>

                      {/* GitHub Connect Option */}
                      <div className="text-center space-y-3">
                          <button 
                              onClick={handleGitHubConnect}
                              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all border border-slate-700 hover:border-slate-500"
                          >
                              <Github size={18} />
                              <span>{(needsGitHubReauth || isGithubLinked) ? "Reconnect GitHub Account" : "Connect GitHub Account"}</span>
                          </button>
                          <p className="text-[10px] text-slate-500">Required for private repositories and committing changes.</p>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Interview Setup Modal */}
      {showInterviewSetup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl p-6 animate-fade-in-up">
                  <div className="text-center mb-6">
                      <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Mic size={32} className="text-indigo-400" />
                      </div>
                      <h3 className="text-xl font-bold text-white">Start Mock Interview</h3>
                      <p className="text-sm text-slate-400 mt-1">Real-time voice conversation with AI interviewer.</p>
                  </div>
                  
                  <div className="space-y-4">
                      <div 
                          onClick={() => setRecordInterview(!recordInterview)}
                          className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between ${recordInterview ? 'bg-red-900/20 border-red-500/50' : 'bg-slate-800 border-slate-700'}`}
                      >
                          <span className={`text-sm font-bold ${recordInterview ? 'text-red-400' : 'text-slate-400'}`}>Record Session</span>
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${recordInterview ? 'border-red-500 bg-red-500 text-white' : 'border-slate-500'}`}>
                              {recordInterview && <CheckCircle size={12}/>}
                          </div>
                      </div>
                      
                      <button onClick={confirmStartInterview} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg">
                          Begin Interview
                      </button>
                      <button onClick={() => setShowInterviewSetup(false)} className="w-full py-2 text-slate-400 hover:text-white text-sm">
                          Cancel
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* GitHub Repo Selection Modal */}
      {showGithubModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6 flex flex-col max-h-[80vh]">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2"><Github size={24} className="text-white"/> Select Repository</h3>
                      <button onClick={() => setShowGithubModal(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                  </div>
                  <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                      {isLoadingRepos ? (
                          <div className="py-10 text-center"><Loader2 className="animate-spin mx-auto text-indigo-400"/></div>
                      ) : repos.length === 0 ? (
                          <div className="py-10 text-center text-slate-500">No repositories found.</div>
                      ) : (
                          <div className="space-y-2">
                              {repos.map((repo: any) => (
                                  <button key={repo.id} onClick={() => handleRepoSelect(repo)} className="w-full text-left p-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-between group">
                                      <div>
                                          <div className="font-bold text-white text-sm">{repo.full_name}</div>
                                          <div className="text-xs text-slate-400 flex items-center gap-2">
                                              <span>{repo.private ? "Private" : "Public"}</span>
                                              <span>•</span>
                                              <span>{repo.default_branch}</span>
                                          </div>
                                      </div>
                                      <ChevronRight size={16} className="text-slate-500 group-hover:text-white"/>
                                  </button>
                              ))}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Commit Modal */}
      {showCommitModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2"><GitCommit size={20} className="text-emerald-400"/> Commit & Push</h3>
                      <button onClick={() => setShowCommitModal(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                  </div>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase">Repository</label>
                          <div className="text-sm text-white font-mono bg-slate-800 p-2 rounded mt-1 border border-slate-700">
                              {project.github?.owner}/{project.github?.repo} ({project.github?.branch})
                          </div>
                      </div>
                      
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase">Commit Message</label>
                          <textarea 
                              value={commitMessage}
                              onChange={e => setCommitMessage(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white mt-1 h-24 focus:outline-none focus:border-emerald-500"
                              placeholder="Update solution..."
                          />
                      </div>
                      
                      <button 
                          onClick={handleCommit}
                          disabled={isCommitting || !commitMessage}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg flex items-center justify-center gap-2"
                      >
                          {isCommitting ? <Loader2 size={16} className="animate-spin"/> : <CloudUpload size={16}/>}
                          <span>Push Changes</span>
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};