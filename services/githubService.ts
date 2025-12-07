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

// Fetch list of repositories for the authenticated user
export async function fetchUserRepos(token: string): Promise<GithubRepo[]> {
  const response = await fetch(`${GITHUB_API_BASE}/user/repos?sort=updated&per_page=100`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) throw new Error('Failed to fetch repositories');
  return await response.json();
}

// Fetch the file tree of a specific repository
export async function fetchRepoContents(token: string, owner: string, repo: string, branch: string): Promise<{ files: CodeFile[], latestSha: string }> {
  // 1. Get the reference of the branch (latest commit SHA)
  const refRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/ref/heads/${branch}`, {
    headers: { Authorization: `token ${token}` }
  });
  if (!refRes.ok) throw new Error('Failed to fetch branch reference');
  const refData = await refRes.json();
  const latestSha = refData.object.sha;

  // 2. Get the Tree (Recursive to get all files)
  const treeRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${latestSha}?recursive=1`, {
    headers: { Authorization: `token ${token}` }
  });
  if (!treeRes.ok) throw new Error('Failed to fetch repository tree');
  const treeData = await treeRes.json();

  // 3. Filter for blobs (files), ignore extremely large files or images for the web editor
  const validExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.cpp', '.c', '.h', '.hpp', '.java', '.cs', '.go', '.rs', '.json', '.md', '.css', '.html', '.txt'];
  
  const blobEntries = treeData.tree.filter((item: any) => 
    item.type === 'blob' && 
    validExtensions.some(ext => item.path.toLowerCase().endsWith(ext)) &&
    item.size < 100000 // Limit file size to ~100KB for browser performance
  );

  // 4. Fetch content for each file (in parallel - limited batching would be better for huge repos)
  // For safety, let's limit to top 20 files to avoid rate limits in this demo
  const filesToFetch = blobEntries.slice(0, 20); 

  const files: CodeFile[] = await Promise.all(filesToFetch.map(async (item: any) => {
    const blobRes = await fetch(item.url, {
      headers: { Authorization: `token ${token}` }
    });
    const blobData = await blobRes.json();
    
    // Content is base64 encoded
    let content = '';
    try {
        content = atob(blobData.content.replace(/\n/g, ''));
    } catch(e) {
        content = "// Binary content or encoding error";
    }

    // Determine language based on extension
    const ext = item.path.split('.').pop()?.toLowerCase();
    let language: any = 'text';
    if (['js', 'jsx'].includes(ext)) language = 'javascript';
    else if (['ts', 'tsx'].includes(ext)) language = 'typescript';
    else if (ext === 'py') language = 'python';
    else if (ext === 'cpp' || ext === 'c' || ext === 'h') language = 'c++';
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