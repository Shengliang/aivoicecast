
// Service for Google Drive API interactions

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

export async function ensureCodeStudioFolder(accessToken: string): Promise<string> {
  // 1. Search for folder
  const query = "mimeType='application/vnd.google-apps.folder' and name='codestudio' and trashed=false";
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  if (!searchRes.ok) throw new Error("Failed to search Drive");
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
  
  if (!createRes.ok) throw new Error("Failed to create folder");
  const folder = await createRes.json();
  return folder.id;
}

export async function listDriveFiles(accessToken: string, folderId: string): Promise<DriveFile[]> {
  const query = `'${folderId}' in parents and trashed=false`;
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  if (!res.ok) throw new Error("Failed to list files");
  const data = await res.json();
  return data.files || [];
}

export async function saveToDrive(accessToken: string, folderId: string, filename: string, content: string): Promise<void> {
  // Simple upload (multipart not implemented for brevity, using simple text upload)
  const metadata = {
    name: filename,
    parents: [folderId],
    mimeType: 'text/plain'
  };
  
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([content], { type: 'text/plain' }));

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form
  });
  
  if (!res.ok) throw new Error("Failed to upload to Drive");
}

export async function readDriveFile(accessToken: string, fileId: string): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error("Failed to read file");
  return await res.text();
}
