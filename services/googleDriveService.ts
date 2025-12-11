
// Service for Google Drive API interactions

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

export async function ensureCodeStudioFolder(accessToken: string): Promise<string> {
  // 1. Search for folder (created by this app)
  const query = "mimeType='application/vnd.google-apps.folder' and name='codestudio' and trashed=false";
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`;
  
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  if (!searchRes.ok) {
      const errText = await searchRes.text();
      throw new Error(`Drive Search Failed (${searchRes.status}): ${errText}`);
  }
  
  const data = await searchRes.json();
  
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  // 2. Create if not exists
  const metadata = {
    name: 'codestudio',
    mimeType: 'application/vnd.google-apps.folder'
  };
  
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });
  
  if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Drive Folder Create Failed (${createRes.status}): ${errText}`);
  }
  
  const folder = await createRes.json();
  return folder.id;
}

export async function listDriveFiles(accessToken: string, folderId: string): Promise<DriveFile[]> {
  const query = `'${folderId}' in parents and trashed=false`;
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Drive List Failed (${res.status}): ${errText}`);
  }
  const data = await res.json();
  return data.files || [];
}

export async function saveToDrive(accessToken: string, folderId: string, filename: string, content: string): Promise<void> {
  // Simple upload (multipart not implemented for brevity, using simple text upload)
  const metadata = {
    name: filename,
    parents: [folderId],
    mimeType: 'application/json'
  };
  
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([content], { type: 'application/json' }));

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form
  });
  
  if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Drive Upload Failed (${res.status}): ${errText}`);
  }
}

export async function readDriveFile(accessToken: string, fileId: string): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Drive Read Failed (${res.status}): ${errText}`);
  }
  return await res.text();
}
