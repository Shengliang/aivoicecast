
import { CodeFile, CodeProject } from '../types';

const GITHUB_API_BASE = 'https://api.github.com';

interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  owner: {
    login: string;
  };
}

// Check if a public repo exists and get details (No token required)
export async function fetchPublicRepoInfo(owner: string, repo: string): Promise<{ default_branch: string, id: number, full_name: string }> {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`);
  if (!response.ok) {
      if (response.status === 404) throw new Error(`Repository '${owner}/${repo}' not found. Check spelling.`);
      if (response.status === 403) throw new Error('GitHub API rate limit exceeded. Please sign in to increase limits.');
      throw new Error(`Failed to fetch repository info: ${response.status} ${response.statusText}`);
  }
  return await response.json();
}

// Fetch list of repositories for the authenticated user
export async function fetchUserRepos(token: string): Promise<GithubRepo[]> {
  const response = await fetch(`${GITHUB_API_BASE}/user/repos?sort=updated&per_page=100`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
      if (response.status === 403) throw new Error('GitHub API rate limit exceeded.');
      throw new Error('Failed to fetch repositories');
  }
  return await response.json();
}

// Helper to determine language
function getLanguageFromExt(path: string): any {
    const ext = path.split('.').pop()?.toLowerCase();
    let language: any = 'text';
    if (['js', 'jsx'].includes(ext || '')) language = 'javascript';
    else if (['ts', 'tsx'].includes(ext || '')) language = 'typescript';
    else if (ext === 'py') language = 'python';
    else if (['cpp', 'c', 'h', 'hpp', 'cc', 'hh', 'cxx'].includes(ext || '')) language = 'c++';
    else if (ext === 'java') language = 'java';
    else if (ext === 'go') language = 'go';
    else if (ext === 'rs') language = 'rust';
    else if (ext === 'json') language = 'json';
    else if (ext === 'md') language = 'markdown';
    else if (ext === 'html') language = 'html';
    else if (ext === 'css') language = 'css';
    return language;
}

// Helper: Transform GitHub tree item to CodeFile
const transformTreeItem = (item: any, prefix: string = ''): CodeFile => {
    // If it's a file but size is huge, mark as not loaded but present
    const fullPath = prefix ? `${prefix}/${item.path}` : item.path;
    const isDir = item.type === 'tree';
    
    return {
        name: fullPath,
        language: getLanguageFromExt(fullPath),
        content: '', // Lazy load content
        sha: item.sha,
        path: fullPath,
        loaded: false,
        isDirectory: isDir,
        treeSha: isDir ? item.sha : undefined,
        childrenFetched: false
    };
};

// Fetch single file content (Lazy Load)
export async function fetchFileContent(token: string | null, owner: string, repo: string, path: string, branch: string = 'main'): Promise<string> {
    const headers: Record<string, string> = {};
    if (token) {
        headers.Authorization = `token ${token}`;
    }

    // Use Raw CDN for public/anonymous access to avoid API limits on content
    if (!token) {
        const encodedPath = path.split('/').map(encodeURIComponent).join('/');
        // Append a timestamp to bust cache for latest version
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodedPath}?t=${Date.now()}`;
        try {
            const res = await fetch(rawUrl);
            if (!res.ok) throw new Error("Failed to fetch raw content");
            return await res.text();
        } catch (e) {
            console.warn("Raw fetch failed, trying API fallback", e);
        }
    }

    // API Fallback (or primary for private repos)
    // Also use timestamp for API to avoid caching stale content
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${branch}&t=${Date.now()}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Failed to fetch file content: ${res.status}`);
    
    const data = await res.json();
    if (data.encoding === 'base64' && data.content) {
        return atob(data.content.replace(/\n/g, ''));
    }
    return "// Unable to decode file content";
}

// Fetch the ROOT file tree (Non-Recursive for Lazy Loading)
export async function fetchRepoContents(token: string | null, owner: string, repo: string, branch: string): Promise<{ files: CodeFile[], latestSha: string }> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `token ${token}`;
  }

  // 1. Get the reference of the branch (latest commit SHA)
  const refRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/ref/heads/${branch}`, { headers });
  if (!refRes.ok) {
      if (refRes.status === 403) throw new Error('GitHub API rate limit exceeded. Please sign in.');
      if (refRes.status === 404) throw new Error('Branch not found or repo is empty.');
      throw new Error('Failed to fetch branch reference');
  }
  const refData = await refRes.json();
  const latestSha = refData.object.sha;

  // 2. Get the Tree (Recursive=0 for root only)
  // This allows fetching HUGE repos like MySQL without hitting API limits
  const treeRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${latestSha}`, { headers });
  if (!treeRes.ok) {
      if (treeRes.status === 403) throw new Error('GitHub API rate limit exceeded. Please sign in.');
      throw new Error('Failed to fetch repository tree');
  }
  const treeData = await treeRes.json();

  // 3. Transform Items
  const files: CodeFile[] = treeData.tree.map((item: any) => transformTreeItem(item, ''));

  return { files, latestSha };
}

// Fetch a specific sub-tree (folder contents)
export async function fetchRepoSubTree(token: string | null, owner: string, repo: string, treeSha: string, prefix: string): Promise<CodeFile[]> {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `token ${token}`;
    }

    const treeRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${treeSha}`, { headers });
    if (!treeRes.ok) {
        throw new Error('Failed to fetch folder contents');
    }
    const treeData = await treeRes.json();
    
    // Transform items with the current prefix (e.g. 'src/utils')
    const files: CodeFile[] = treeData.tree.map((item: any) => transformTreeItem(item, prefix));
    
    return files;
}

// Fetch Commit History
export async function fetchRepoCommits(token: string | null, owner: string, repo: string, branch: string, limit = 20): Promise<any[]> {
    const headers: Record<string, string> = {};
    if (token) {
        headers.Authorization = `token ${token}`;
    }
    
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?sha=${branch}&per_page=${limit}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error("Failed to fetch commits");
    return await res.json();
}

// Commit and Push changes
export async function commitToRepo(
  token: string, 
  project: CodeProject, 
  message: string
): Promise<string> {
  if (!project.github) throw new Error("Project is not linked to GitHub");
  const { owner, repo, branch, sha: parentSha } = project.github;

  // 1. Create Blobs for changed files
  // Filter out files that were not loaded (lazy loaded files that user didn't touch shouldn't be overwritten with empty string)
  // Also filter out directories, as git/trees expects blobs for files
  const filesToCommit = project.files.filter(f => f.loaded !== false && !f.isDirectory);

  const treeItems = await Promise.all(filesToCommit.map(async (file) => {
    const blobRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: file.content,
        encoding: 'utf-8'
      })
    });
    const blobData = await blobRes.json();
    return {
      path: file.name, // or file.path
      mode: '100644', // file mode
      type: 'blob',
      sha: blobData.sha
    };
  }));

  // 2. Create Tree
  const treeRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify({
      base_tree: parentSha, // Important: base off previous commit to keep deleted files etc (unless we want to overwrite)
      tree: treeItems
    })
  });
  if (!treeRes.ok) throw new Error('Failed to create tree');
  const treeData = await treeRes.json();

  // 3. Create Commit
  const commitRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify({
      message: message,
      tree: treeData.sha,
      parents: [parentSha]
    })
  });
  if (!commitRes.ok) throw new Error('Failed to create commit');
  const commitData = await commitRes.json();

  // 4. Update Reference (Move HEAD)
  const updateRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    method: 'PATCH', // Update reference
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify({
      sha: commitData.sha,
      force: false
    })
  });
  if (!updateRes.ok) throw new Error('Failed to update branch reference');

  return commitData.sha;
}
