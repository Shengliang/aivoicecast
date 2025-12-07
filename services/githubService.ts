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
    validExtensions.some(ext => item.path.toLowerCase().endsWith(ext)) &&
    item.size < 1000000 // Limit file size to ~1MB
  );

  // 4. Fetch content for each file
  // Increased limit to 100 files to capture deeper trees
  const filesToFetch = blobEntries.slice(0, 100); 

  const files: CodeFile[] = await Promise.all(filesToFetch.map(async (item: any) => {
    let content = '';

    // STRATEGY: Use Raw Content CDN for anonymous requests to bypass API Rate Limits
    if (!token) {
        // Raw URL: https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
        // We must encode the path to handle spaces or special characters
        const encodedPath = item.path.split('/').map(encodeURIComponent).join('/');
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodedPath}`;
        
        try {
            const res = await fetch(rawUrl);
            if (!res.ok) throw new Error(`Failed to fetch raw content: ${res.status}`);
            content = await res.text();
        } catch (e) {
            console.warn(`Failed to fetch raw ${item.path}`, e);
            content = "// Failed to load content from raw.githubusercontent.com";
        }
    } else {
        // Authenticated: Use API Blob (Better for private repos or specific SHAs)
        try {
            const blobRes = await fetch(item.url, { headers });
            // If individual blob fetch fails due to rate limit, we might want to fail the whole operation
            if (!blobRes.ok && blobRes.status === 403) throw new Error('GitHub API rate limit exceeded during file fetch.');
            
            const blobData = await blobRes.json();
            // Content is base64 encoded in API response
            content = atob(blobData.content.replace(/\n/g, ''));
        } catch(e) {
            content = "// Binary content or encoding error";
        }
    }

    // Determine language based on extension
    const ext = item.path.split('.').pop()?.toLowerCase();
    let language: any = 'text';
    if (['js', 'jsx'].includes(ext)) language = 'javascript';
    else if (['ts', 'tsx'].includes(ext)) language = 'typescript';
    else if (ext === 'py') language = 'python';
    else if (['cpp', 'c', 'h', 'hpp', 'cc', 'hh', 'cxx'].includes(ext)) language = 'c++';
    else if (ext === 'java') language = 'java';
    else if (ext === 'go') language = 'go';
    else if (ext === 'rs') language = 'rust';
    else if (ext === 'json') language = 'json';
    else if (ext === 'md') language = 'markdown';
    else if (ext === 'html') language = 'html';
    else if (ext === 'css') language = 'css';

    return {
      name: item.path, // Use full path as name
      language: language,
      content: content,
      sha: item.sha,
      path: item.path
    };
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
  // (In a full implementation, we'd check diffs. Here we just upload current state of all files)
  const treeItems = await Promise.all(project.files.map(async (file) => {
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