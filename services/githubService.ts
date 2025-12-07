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

// Fetch single file content (Lazy Load)
export async function fetchFileContent(token: string | null, owner: string, repo: string, path: string, branch: string = 'main'): Promise<string> {
    const headers: Record<string, string> = {};
    if (token) {
        headers.Authorization = `token ${token}`;
    }

    // Use Raw CDN for public/anonymous access to avoid API limits on content
    if (!token) {
        const encodedPath = path.split('/').map(encodeURIComponent).join('/');
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodedPath}`;
        try {
            const res = await fetch(rawUrl);
            if (!res.ok) throw new Error("Failed to fetch raw content");
            return await res.text();
        } catch (e) {
            console.warn("Raw fetch failed, trying API fallback", e);
        }
    }

    // API Fallback (or primary for private repos)
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Failed to fetch file content: ${res.status}`);
    
    const data = await res.json();
    if (data.encoding === 'base64' && data.content) {
        return atob(data.content.replace(/\n/g, ''));
    }
    return "// Unable to decode file content";
}

// Fetch the file tree of a specific repository (Token optional for public repos)
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

  // 2. Get the Tree (Recursive to get all files)
  const treeRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${latestSha}?recursive=1`, { headers });
  if (!treeRes.ok) {
      if (treeRes.status === 403) throw new Error('GitHub API rate limit exceeded. Please sign in.');
      throw new Error('Failed to fetch repository tree');
  }
  const treeData = await treeRes.json();

  // 3. Filter for blobs (files), ignore extremely large files or images for the web editor
  const validExtensions = [
    // Web
    '.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', 
    // Backend/Systems
    '.py', '.go', '.rs', '.java', '.cs',
    // C/C++
    '.c', '.cpp', '.h', '.hpp', '.cc', '.hh', '.cxx', '.hxx',
    // Config/Docs
    '.md', '.txt', '.yml', '.yaml', '.xml', '.gitignore', '.env'
  ];
  
  const blobEntries = treeData.tree.filter((item: any) => 
    item.type === 'blob' && 
    validExtensions.some(ext => item.path.toLowerCase().endsWith(ext))
  );

  // 4. Construct File List (Lazy Load Strategy)
  // We allow up to 3000 files in the tree structure to support large repos like MySQL.
  // But we only fetch content for the first 10 to start quickly.
  const filesListLimit = 3000;
  const filteredEntries = blobEntries.slice(0, filesListLimit); 
  const initialFetchCount = 10;

  const files: CodeFile[] = await Promise.all(filteredEntries.map(async (item: any, index: number) => {
    // Determine language
    const language = getLanguageFromExt(item.path);
    
    // Only fetch content for the first few files
    if (index < initialFetchCount && item.size < 1000000) {
        let content = '';
        if (!token) {
             // Try raw fetch for speed
             const encodedPath = item.path.split('/').map(encodeURIComponent).join('/');
             const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodedPath}`;
             try {
                 const res = await fetch(rawUrl);
                 if (res.ok) content = await res.text();
                 else throw new Error("Raw fetch fail");
             } catch(e) {
                 // API fallback logic would be complex inside map, simplistically we might skip or fail here for anon
                 content = "// Failed to load content via CDN.";
             }
        } else {
             try {
                const blobRes = await fetch(item.url, { headers });
                if (blobRes.ok) {
                    const blobData = await blobRes.json();
                    content = atob(blobData.content.replace(/\n/g, ''));
                } else {
                    content = "// Error fetching content";
                }
             } catch(e) { content = "// Error fetching content"; }
        }
        
        return {
            name: item.path,
            language,
            content,
            sha: item.sha,
            path: item.path,
            loaded: true
        };
    } else {
        // Deferred / Lazy Load
        return {
            name: item.path,
            language,
            content: "", // Placeholder
            sha: item.sha,
            path: item.path,
            loaded: false // Flag for lazy loading
        };
    }
  }));

  return { files, latestSha };
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
  const filesToCommit = project.files.filter(f => f.loaded !== false);

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