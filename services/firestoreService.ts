import { db, auth, storage } from './firebaseConfig';
import firebase from 'firebase/compat/app';
import { 
  Channel, UserProfile, CommunityDiscussion, GeneratedLecture, Chapter, 
  Booking, Invitation, Group, RecordingSession, Attachment, Comment, 
  BlogPost, Blog, RealTimeMessage, ChatChannel, CareerApplication, 
  JobPosting, CodeProject, WhiteboardElement, CodeFile, SubscriptionTier, CursorPosition, CloudItem, GlobalStats
} from '../types';
import { HANDCRAFTED_CHANNELS } from '../utils/initialData';
import { ARCHITECTURE_BLOG_POST } from '../utils/blogContent';

// --- User & Profile ---

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const doc = await db.collection('users').doc(uid).get();
  if (doc.exists) {
    return doc.data() as UserProfile;
  }
  return null;
}

export async function getUserProfileByEmail(email: string): Promise<UserProfile | null> {
  const snapshot = await db.collection('users').where('email', '==', email).limit(1).get();
  if (!snapshot.empty) {
    return snapshot.docs[0].data() as UserProfile;
  }
  return null;
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const snapshot = await db.collection('users').limit(100).get();
  return snapshot.docs.map(doc => doc.data() as UserProfile);
}

export async function syncUserProfile(user: firebase.User): Promise<void> {
  const userRef = db.collection('users').doc(user.uid);
  const doc = await userRef.get();
  
  if (!doc.exists) {
    const newProfile: UserProfile = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || 'User',
      photoURL: user.photoURL || '',
      groups: [],
      interests: [], 
      createdAt: Date.now(),
      subscriptionTier: 'free',
      followers: [],
      following: []
    };
    await userRef.set(newProfile);
    
    // Update global stats
    const statsRef = db.collection('stats').doc('global');
    await statsRef.set({
        uniqueUsers: firebase.firestore.FieldValue.increment(1)
    }, { merge: true });
  } else {
    await userRef.update({
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

export async function updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
    await db.collection('users').doc(uid).update(data);
}

export async function incrementApiUsage(uid: string) {
    const userRef = db.collection('users').doc(uid);
    await userRef.update({
        apiUsageCount: firebase.firestore.FieldValue.increment(1)
    });
}

export async function logUserActivity(action: string, details: any) {
    try {
        await db.collection('activity_logs').add({
            action,
            details,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            userId: auth.currentUser?.uid || 'anonymous'
        });
    } catch(e) {
        console.warn("Log failed", e);
    }
}

// --- Social Graph (Following) ---

export async function followUser(currentUserId: string, targetUserId: string) {
    const batch = db.batch();
    const currentUserRef = db.collection('users').doc(currentUserId);
    const targetUserRef = db.collection('users').doc(targetUserId);

    batch.update(currentUserRef, {
        following: firebase.firestore.FieldValue.arrayUnion(targetUserId)
    });
    
    batch.update(targetUserRef, {
        followers: firebase.firestore.FieldValue.arrayUnion(currentUserId)
    });

    await batch.commit();
}

export async function unfollowUser(currentUserId: string, targetUserId: string) {
    const batch = db.batch();
    const currentUserRef = db.collection('users').doc(currentUserId);
    const targetUserRef = db.collection('users').doc(targetUserId);

    batch.update(currentUserRef, {
        following: firebase.firestore.FieldValue.arrayRemove(targetUserId)
    });
    
    batch.update(targetUserRef, {
        followers: firebase.firestore.FieldValue.arrayRemove(currentUserId)
    });

    await batch.commit();
}

// --- Channels (Public & Private) ---

export async function publishChannelToFirestore(channel: Channel) {
    await db.collection('channels').doc(channel.id).set(channel);
}

export async function getPublicChannels(): Promise<Channel[]> {
    const snapshot = await db.collection('channels').get();
    return snapshot.docs.map(doc => doc.data() as Channel);
}

export function subscribeToPublicChannels(onUpdate: (channels: Channel[]) => void, onError?: (error: any) => void) {
    return db.collection('channels')
        .onSnapshot(snapshot => {
            const channels = snapshot.docs.map(doc => doc.data() as Channel);
            onUpdate(channels);
        }, onError);
}

export async function deleteChannelFromFirestore(channelId: string) {
    await db.collection('channels').doc(channelId).delete();
}

export async function voteChannel(channelId: string, type: 'like' | 'dislike') {
    const ref = db.collection('channels').doc(channelId);
    // Optimistic update often handled in UI, this persists it
    // Check if channel exists in public DB first, otherwise it's local only
    const doc = await ref.get();
    if (doc.exists) {
        if (type === 'like') await ref.update({ likes: firebase.firestore.FieldValue.increment(1) });
        else await ref.update({ dislikes: firebase.firestore.FieldValue.increment(1) });
    }
}

export async function addCommentToChannel(channelId: string, comment: Comment) {
    const ref = db.collection('channels').doc(channelId);
    const doc = await ref.get();
    if (doc.exists) {
        await ref.update({
            comments: firebase.firestore.FieldValue.arrayUnion(comment)
        });
    }
}

export async function updateCommentInChannel(channelId: string, commentId: string, newText: string, newAttachments: Attachment[]) {
    // Note: Firestore array manipulation for updating a specific item object is hard.
    // Usually requires reading, modifying, writing back.
    const ref = db.collection('channels').doc(channelId);
    await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) return;
        const data = doc.data() as Channel;
        const comments = data.comments.map(c => c.id === commentId ? { ...c, text: newText, attachments: newAttachments } : c);
        t.update(ref, { comments });
    });
}

export async function deleteCommentFromChannel(channelId: string, commentId: string) {
    const ref = db.collection('channels').doc(channelId);
    await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) return;
        const data = doc.data() as Channel;
        const comments = data.comments.filter(c => c.id !== commentId);
        t.update(ref, { comments });
    });
}

export async function addChannelAttachment(channelId: string, attachment: Attachment) {
    // If public channel
    const ref = db.collection('channels').doc(channelId);
    const doc = await ref.get();
    if (doc.exists) {
        await ref.update({
            appendix: firebase.firestore.FieldValue.arrayUnion(attachment)
        });
    }
}

export async function getGroupChannels(groupIds: string[]): Promise<Channel[]> {
    if (groupIds.length === 0) return [];
    // Firestore 'in' query limit is 10. Split if needed.
    const chunks = [];
    for (let i = 0; i < groupIds.length; i += 10) {
        chunks.push(groupIds.slice(i, i + 10));
    }
    
    let results: Channel[] = [];
    for (const chunk of chunks) {
        const snap = await db.collection('channels').where('visibility', '==', 'group').where('groupId', 'in', chunk).get();
        const chunkChannels = snap.docs.map(doc => doc.data() as Channel);
        results = [...results, ...chunkChannels];
    }
    return results;
}

// --- Lecture & Curriculum ---

export async function saveLectureToFirestore(channelId: string, lectureId: string, lecture: GeneratedLecture) {
    await db.collection('channels').doc(channelId).collection('lectures').doc(lectureId).set(lecture);
}

export async function getLectureFromFirestore(channelId: string, lectureId: string): Promise<GeneratedLecture | null> {
    const doc = await db.collection('channels').doc(channelId).collection('lectures').doc(lectureId).get();
    if (doc.exists) return doc.data() as GeneratedLecture;
    return null;
}

export async function deleteLectureFromFirestore(channelId: string, lectureId: string) {
    await db.collection('channels').doc(channelId).collection('lectures').doc(lectureId).delete();
}

export async function saveCurriculumToFirestore(channelId: string, chapters: Chapter[]) {
    await db.collection('channels').doc(channelId).update({ chapters });
}

export async function getCurriculumFromFirestore(channelId: string): Promise<Chapter[] | null> {
    const doc = await db.collection('channels').doc(channelId).get();
    if (doc.exists) return (doc.data() as Channel).chapters || null;
    return null;
}

// --- Groups ---

export async function createGroup(name: string) {
    const user = auth.currentUser;
    if (!user) throw new Error("Must be logged in");
    
    const groupRef = db.collection('groups').doc();
    const group: Group = {
        id: groupRef.id,
        name,
        ownerId: user.uid,
        memberIds: [user.uid],
        createdAt: Date.now()
    };
    await groupRef.set(group);
    
    await db.collection('users').doc(user.uid).update({
        groups: firebase.firestore.FieldValue.arrayUnion(group.id)
    });
}

export async function getUserGroups(uid: string): Promise<Group[]> {
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return [];
    
    const groupIds = (userDoc.data() as UserProfile).groups || [];
    if (groupIds.length === 0) return [];
    
    const groups: Group[] = [];
    // Batched get
    for (let i = 0; i < groupIds.length; i += 10) {
        const chunk = groupIds.slice(i, i + 10);
        if (chunk.length === 0) continue;
        const snap = await db.collection('groups').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get();
        snap.forEach(doc => groups.push(doc.data() as Group));
    }
    return groups;
}

export async function sendInvitation(groupId: string, toEmail: string) {
    const user = auth.currentUser;
    if (!user) return;
    
    // Get Group Info
    const groupDoc = await db.collection('groups').doc(groupId).get();
    if (!groupDoc.exists) throw new Error("Group not found");
    const group = groupDoc.data() as Group;
    
    // Check if user is owner
    if (group.ownerId !== user.uid) throw new Error("Only owner can invite");
    
    const inviteRef = db.collection('invitations').doc();
    const invite: Invitation = {
        id: inviteRef.id,
        fromUserId: user.uid,
        fromName: user.displayName || 'User',
        toEmail: toEmail,
        groupId: groupId,
        groupName: group.name,
        status: 'pending',
        createdAt: Date.now(),
        type: 'group'
    };
    await inviteRef.set(invite);
}

export async function getPendingInvitations(email: string): Promise<Invitation[]> {
    const snap = await db.collection('invitations')
        .where('toEmail', '==', email)
        .where('status', '==', 'pending')
        .get();
    return snap.docs.map(doc => doc.data() as Invitation);
}

export async function respondToInvitation(invite: Invitation, accept: boolean) {
    if (accept) {
        if (invite.type === 'group') {
            // Add user to group
            const user = auth.currentUser;
            if (user) {
                await db.collection('groups').doc(invite.groupId).update({
                    memberIds: firebase.firestore.FieldValue.arrayUnion(user.uid)
                });
                await db.collection('users').doc(user.uid).update({
                    groups: firebase.firestore.FieldValue.arrayUnion(invite.groupId)
                });
            }
        }
    }
    
    await db.collection('invitations').doc(invite.id).update({
        status: accept ? 'accepted' : 'rejected'
    });
}

export async function getGroupMembers(memberIds: string[]): Promise<UserProfile[]> {
    if (memberIds.length === 0) return [];
    // Batched fetch
    const users: UserProfile[] = [];
    for (let i = 0; i < memberIds.length; i += 10) {
        const chunk = memberIds.slice(i, i + 10);
        const snap = await db.collection('users').where('uid', 'in', chunk).get();
        snap.forEach(doc => users.push(doc.data() as UserProfile));
    }
    return users;
}

export async function getUniqueGroupMembers(groupIds: string[]): Promise<UserProfile[]> {
    // Simplified: fetch all members from all groups
    const usersMap = new Map<string, UserProfile>();
    for (const gid of groupIds) {
        const gDoc = await db.collection('groups').doc(gid).get();
        if (gDoc.exists) {
            const gData = gDoc.data() as Group;
            const members = await getGroupMembers(gData.memberIds);
            members.forEach(m => usersMap.set(m.uid, m));
        }
    }
    return Array.from(usersMap.values());
}

export async function removeMemberFromGroup(groupId: string, memberId: string) {
    await db.collection('groups').doc(groupId).update({
        memberIds: firebase.firestore.FieldValue.arrayRemove(memberId)
    });
    await db.collection('users').doc(memberId).update({
        groups: firebase.firestore.FieldValue.arrayRemove(groupId)
    });
}

// --- Bookings ---

export async function createBooking(booking: Booking) {
    const ref = db.collection('bookings').doc();
    await ref.set({ ...booking, id: ref.id });
}

export async function getUserBookings(uid: string, email: string): Promise<Booking[]> {
    // Get bookings where user is requestor OR invited guest
    const requestorSnap = await db.collection('bookings').where('userId', '==', uid).get();
    const guestSnap = await db.collection('bookings').where('invitedEmail', '==', email).get();
    
    const bookings = new Map<string, Booking>();
    requestorSnap.forEach(doc => bookings.set(doc.id, doc.data() as Booking));
    guestSnap.forEach(doc => bookings.set(doc.id, doc.data() as Booking));
    
    return Array.from(bookings.values());
}

export async function getPendingBookings(email: string): Promise<Booking[]> {
    // Find bookings where this user is the "invitee" (P2P target) and status is pending
    const snap = await db.collection('bookings')
        .where('invitedEmail', '==', email)
        .where('status', '==', 'pending')
        .get();
    return snap.docs.map(doc => doc.data() as Booking);
}

export async function respondToBooking(bookingId: string, accept: boolean) {
    await db.collection('bookings').doc(bookingId).update({
        status: accept ? 'scheduled' : 'rejected'
    });
}

export async function cancelBooking(bookingId: string) {
    await db.collection('bookings').doc(bookingId).update({ status: 'cancelled' });
}

export async function updateBookingInvite(bookingId: string, email: string) {
    await db.collection('bookings').doc(bookingId).update({ invitedEmail: email });
}

export async function updateBookingRecording(bookingId: string, recordingUrl: string, transcriptUrl: string) {
    // Also update status to completed if not already
    await db.collection('bookings').doc(bookingId).update({ 
        recordingUrl, 
        transcriptUrl,
        status: 'completed'
    });
}

export async function deleteBookingRecording(bookingId: string, recordingUrl?: string, transcriptUrl?: string) {
    // Delete files from storage
    if (recordingUrl) {
        try { await storage.refFromURL(recordingUrl).delete(); } catch(e) {}
    }
    if (transcriptUrl) {
        try { await storage.refFromURL(transcriptUrl).delete(); } catch(e) {}
    }
    // Update doc
    await db.collection('bookings').doc(bookingId).update({
        recordingUrl: firebase.firestore.FieldValue.delete(),
        transcriptUrl: firebase.firestore.FieldValue.delete()
    });
}

// --- Recordings (Ad-Hoc) ---

export async function saveRecordingReference(recording: RecordingSession) {
    const ref = db.collection('recordings').doc();
    await ref.set({ ...recording, id: ref.id });
}

export async function getUserRecordings(uid: string): Promise<RecordingSession[]> {
    const snap = await db.collection('recordings').where('userId', '==', uid).orderBy('timestamp', 'desc').get();
    return snap.docs.map(doc => doc.data() as RecordingSession);
}

export async function deleteRecordingReference(id: string, mediaUrl: string, transcriptUrl: string) {
    try { await storage.refFromURL(mediaUrl).delete(); } catch(e) {}
    try { await storage.refFromURL(transcriptUrl).delete(); } catch(e) {}
    await db.collection('recordings').doc(id).delete();
}

// --- Storage Utils ---

export async function uploadFileToStorage(path: string, file: Blob, metadata?: any): Promise<string> {
    const ref = storage.ref(path);
    await ref.put(file, metadata);
    return await ref.getDownloadURL();
}

export async function uploadCommentAttachment(file: File, path: string): Promise<string> {
    return uploadFileToStorage(path, file);
}

export async function uploadResumeToStorage(userId: string, file: File): Promise<string> {
    const path = `resumes/${userId}_${Date.now()}.pdf`;
    return uploadFileToStorage(path, file);
}

// --- Discussions & Docs ---

export async function saveDiscussion(discussion: CommunityDiscussion): Promise<string> {
    const ref = db.collection('discussions').doc();
    await ref.set({ ...discussion, id: ref.id });
    return ref.id;
}

export async function updateDiscussion(id: string, transcript: any[]) {
    await db.collection('discussions').doc(id).update({ 
        transcript, 
        updatedAt: Date.now()
    });
}

export async function getDiscussionById(id: string): Promise<CommunityDiscussion | null> {
    const doc = await db.collection('discussions').doc(id).get();
    if (doc.exists) return doc.data() as CommunityDiscussion;
    return null;
}

export async function saveDiscussionDesignDoc(id: string, doc: string, title?: string) {
    const data: any = { designDoc: doc, updatedAt: Date.now() };
    if (title) data.title = title;
    await db.collection('discussions').doc(id).update(data);
}

export async function getUserDesignDocs(uid: string): Promise<CommunityDiscussion[]> {
    const snap = await db.collection('discussions')
        .where('userId', '==', uid)
        .where('designDoc', '!=', null) // Only docs
        .orderBy('designDoc') // Required for inequality filter
        .orderBy('createdAt', 'desc')
        .get();
    return snap.docs.map(doc => doc.data() as CommunityDiscussion);
}

export async function linkDiscussionToLectureSegment(channelId: string, lectureId: string, segmentIndex: number, discussionId: string) {
    // This requires updating a specific item in the sections array. 
    // We read the lecture, update the array, and write back.
    const lectureRef = db.collection('channels').doc(channelId).collection('lectures').doc(lectureId);
    await db.runTransaction(async (t) => {
        const doc = await t.get(lectureRef);
        if (!doc.exists) return;
        const data = doc.data() as GeneratedLecture;
        if (data.sections && data.sections[segmentIndex]) {
            data.sections[segmentIndex].discussionId = discussionId;
            t.update(lectureRef, { sections: data.sections });
        }
    });
}

// --- Private Cloud (Code Studio) ---

export async function listCloudDirectory(path: string): Promise<CloudItem[]> {
    const listRef = storage.ref(path);
    const res = await listRef.listAll();
    
    const folders = res.prefixes.map(p => ({
        name: p.name,
        fullPath: p.fullPath,
        isFolder: true
    }));
    
    const files = await Promise.all(res.items.map(async (item) => {
        const url = await item.getDownloadURL();
        const meta = await item.getMetadata();
        return {
            name: item.name,
            fullPath: item.fullPath,
            url,
            isFolder: false,
            size: meta.size,
            timeCreated: meta.timeCreated
        };
    }));
    
    return [...folders, ...files];
}

export async function saveProjectToCloud(path: string, fileName: string, content: string) {
    const fullPath = path.endsWith('/') ? `${path}${fileName}` : `${path}/${fileName}`;
    const ref = storage.ref(fullPath);
    await ref.putString(content);
}

export async function deleteCloudItem(item: CloudItem) {
    if (item.isFolder) {
        // Deleting folder means deleting all contents (Storage doesn't have real folders)
        const res = await storage.ref(item.fullPath).listAll();
        await Promise.all(res.items.map(i => i.delete()));
        // Recursively delete subfolders
        await Promise.all(res.prefixes.map(p => deleteCloudItem({ name: p.name, fullPath: p.fullPath, isFolder: true })));
    } else {
        await storage.ref(item.fullPath).delete();
    }
}

export async function createCloudFolder(path: string, folderName: string) {
    // Create a dummy file to establish folder
    await saveProjectToCloud(`${path}/${folderName}`, '.keep', '');
}

export async function moveCloudFile(oldPath: string, newPath: string) {
    const oldRef = storage.ref(oldPath);
    const url = await oldRef.getDownloadURL();
    const response = await fetch(url);
    const blob = await response.blob();
    
    await storage.ref(newPath).put(blob);
    await oldRef.delete();
}

// --- Code Project (Real-time Session) ---

export async function saveCodeProject(project: CodeProject) {
    await db.collection('code_projects').doc(project.id).set(project, { merge: true });
}

export function subscribeToCodeProject(projectId: string, callback: (p: CodeProject) => void) {
    return db.collection('code_projects').doc(projectId).onSnapshot(doc => {
        if (doc.exists) callback(doc.data() as CodeProject);
    });
}

export async function updateCodeFile(projectId: string, file: CodeFile) {
    // We need to update the file in the files array. 
    // Doing this atomically is hard without fetching.
    // For simplicity in this demo, we assume the client has latest state or we use transaction.
    const ref = db.collection('code_projects').doc(projectId);
    await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) return;
        const data = doc.data() as CodeProject;
        const files = data.files || [];
        const index = files.findIndex(f => (f.path || f.name) === (file.path || file.name));
        
        if (index > -1) {
            files[index] = file;
        } else {
            files.push(file);
        }
        
        t.update(ref, { files, lastModified: Date.now() });
    });
}

export async function deleteCodeFile(projectId: string, fileName: string) {
    const ref = db.collection('code_projects').doc(projectId);
    await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) return;
        const data = doc.data() as CodeProject;
        const files = data.files.filter(f => (f.path || f.name) !== fileName);
        t.update(ref, { files, lastModified: Date.now() });
    });
}

export async function updateCursor(projectId: string, cursor: CursorPosition) {
    // Use dot notation to update specific map field
    const field = `cursors.${cursor.clientId}`;
    await db.collection('code_projects').doc(projectId).update({
        [field]: cursor
    });
}

export async function claimCodeProjectLock(projectId: string, clientId: string, userName: string) {
    await db.collection('code_projects').doc(projectId).update({
        activeClientId: clientId,
        activeWriterName: userName,
        lastModified: Date.now()
    });
}

export async function updateProjectActiveFile(projectId: string, filePath: string) {
    await db.collection('code_projects').doc(projectId).update({
        activeFilePath: filePath
    });
}

export async function updateProjectAccess(projectId: string, accessLevel: 'public' | 'restricted', allowedUserIds?: string[]) {
    await db.collection('code_projects').doc(projectId).update({
        accessLevel,
        allowedUserIds
    });
}

export async function sendShareNotification(userId: string, type: 'Code' | 'Whiteboard', link: string, fromName: string) {
    const inviteRef = db.collection('invitations').doc();
    const invite: Invitation = {
        id: inviteRef.id,
        fromUserId: 'system',
        fromName: fromName,
        toEmail: 'notification', // Logic handled by ID
        groupId: 'session',
        groupName: `${type} Session`,
        status: 'pending',
        createdAt: Date.now(),
        type: 'session',
        link: link
    };
    
    // We need to associate this invite with the target user.
    // Since 'invitations' collection is queried by 'toEmail', we need the user's email.
    // Ideally we pass email, but if we only have UID, we might need to store UID in invitation
    // and update the query. For now, let's assume we fetch profile to get email.
    const profile = await getUserProfile(userId);
    if (profile && profile.email) {
        invite.toEmail = profile.email;
        await inviteRef.set(invite);
    }
}

// --- Whiteboard ---

export async function saveWhiteboardSession(sessionId: string, elements: WhiteboardElement[]) {
    // Save as a single document for simplicity, or subcollection for huge boards
    await db.collection('whiteboards').doc(sessionId).set({ elements }, { merge: true });
}

export function subscribeToWhiteboard(sessionId: string, callback: (elements: WhiteboardElement[]) => void) {
    return db.collection('whiteboards').doc(sessionId).onSnapshot(doc => {
        if (doc.exists) callback((doc.data() as any).elements || []);
    });
}

export async function updateWhiteboardElement(sessionId: string, element: WhiteboardElement) {
    // Array manipulation again. In real app, maybe store elements as a map or subcollection.
    const ref = db.collection('whiteboards').doc(sessionId);
    await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) return; // Should create first
        const data = doc.data() as any;
        let elements = data.elements || [];
        const idx = elements.findIndex((e: any) => e.id === element.id);
        if (idx > -1) elements[idx] = element;
        else elements.push(element);
        t.update(ref, { elements });
    });
}

export async function deleteWhiteboardElements(sessionId: string, ids: string[]) {
    const ref = db.collection('whiteboards').doc(sessionId);
    await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) return;
        const data = doc.data() as any;
        const elements = data.elements.filter((e: any) => !ids.includes(e.id));
        t.update(ref, { elements });
    });
}

// --- Blog ---

export async function ensureUserBlog(user: any): Promise<Blog> {
    const snap = await db.collection('blogs').where('ownerId', '==', user.uid).get();
    if (!snap.empty) return snap.docs[0].data() as Blog;
    
    // Create
    const newBlog: Blog = {
        id: `blog-${user.uid}`,
        ownerId: user.uid,
        authorName: user.displayName || 'Author',
        title: `${user.displayName}'s Blog`,
        description: 'Thoughts and ideas.',
        createdAt: Date.now()
    };
    await db.collection('blogs').doc(newBlog.id).set(newBlog);
    return newBlog;
}

export async function getCommunityPosts(): Promise<BlogPost[]> {
    const snap = await db.collection('blog_posts')
        .where('status', '==', 'published')
        .orderBy('publishedAt', 'desc')
        .limit(20)
        .get();
        
    // Add architecture post if missing (static)
    const posts = snap.docs.map(doc => doc.data() as BlogPost);
    if (!posts.find(p => p.id === ARCHITECTURE_BLOG_POST.id)) {
        posts.unshift(ARCHITECTURE_BLOG_POST);
    }
    return posts;
}

export async function getUserPosts(blogId: string): Promise<BlogPost[]> {
    const snap = await db.collection('blog_posts')
        .where('blogId', '==', blogId)
        .orderBy('createdAt', 'desc')
        .get();
    return snap.docs.map(doc => doc.data() as BlogPost);
}

export async function createBlogPost(post: BlogPost) {
    const ref = db.collection('blog_posts').doc();
    await ref.set({ ...post, id: ref.id });
}

export async function updateBlogPost(id: string, data: Partial<BlogPost>) {
    await db.collection('blog_posts').doc(id).update(data);
}

export async function deleteBlogPost(id: string) {
    await db.collection('blog_posts').doc(id).delete();
}

export async function updateBlogSettings(blogId: string, settings: { title: string, description: string }) {
    await db.collection('blogs').doc(blogId).update(settings);
}

export async function getBlogPost(id: string): Promise<BlogPost | null> {
    if (id === ARCHITECTURE_BLOG_POST.id) return ARCHITECTURE_BLOG_POST;
    const doc = await db.collection('blog_posts').doc(id).get();
    if (doc.exists) return doc.data() as BlogPost;
    return null;
}

export async function addPostComment(postId: string, comment: Comment) {
    if (postId === ARCHITECTURE_BLOG_POST.id) return; // Static post no DB
    await db.collection('blog_posts').doc(postId).update({
        comments: firebase.firestore.FieldValue.arrayUnion(comment),
        commentCount: firebase.firestore.FieldValue.increment(1)
    });
}

// --- Chat & Messages ---

export async function sendMessage(channelId: string, text: string, collectionPath: string, replyTo?: any, attachments?: any[]) {
    const user = auth.currentUser;
    if (!user) return;
    
    const msg: RealTimeMessage = {
        id: '', // set by add
        text,
        senderId: user.uid,
        senderName: user.displayName || 'User',
        senderImage: user.photoURL || undefined,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        replyTo: replyTo,
        // @ts-ignore
        attachments: attachments
    };
    
    const ref = db.collection(collectionPath).doc();
    await ref.set({ ...msg, id: ref.id });
    
    // Update last message metadata for DM lists
    if (collectionPath.startsWith('chat_channels')) {
        await db.collection('chat_channels').doc(channelId).update({
            lastMessage: {
                text,
                senderName: user.displayName,
                timestamp: Date.now()
            }
        });
    }
}

export function subscribeToMessages(channelId: string, callback: (msgs: RealTimeMessage[]) => void, collectionPath: string) {
    return db.collection(collectionPath)
        .orderBy('timestamp', 'asc')
        .limit(100)
        .onSnapshot(snap => {
            const msgs = snap.docs.map(doc => doc.data() as RealTimeMessage);
            callback(msgs);
        });
}

export async function createOrGetDMChannel(otherUserId: string, otherUserName: string): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error("Login required");
    
    // Check if DM exists
    // We can use a consistent ID: sort(uid1, uid2).join('_')
    const ids = [user.uid, otherUserId].sort();
    const channelId = `dm_${ids[0]}_${ids[1]}`;
    
    const doc = await db.collection('chat_channels').doc(channelId).get();
    if (!doc.exists) {
        const channel: ChatChannel = {
            id: channelId,
            name: `${user.displayName} & ${otherUserName}`,
            type: 'dm',
            memberIds: [user.uid, otherUserId],
            createdAt: Date.now()
        };
        await db.collection('chat_channels').doc(channelId).set(channel);
    }
    return channelId;
}

export async function getUserDMChannels(): Promise<ChatChannel[]> {
    const user = auth.currentUser;
    if (!user) return [];
    
    const snap = await db.collection('chat_channels')
        .where('memberIds', 'array-contains', user.uid)
        .where('type', '==', 'dm')
        .get();
        
    return snap.docs.map(d => d.data() as ChatChannel);
}

export async function deleteMessage(channelId: string, messageId: string, collectionPath: string) {
    await db.collection(collectionPath).doc(messageId).delete();
}

// --- Career Center ---

export async function submitCareerApplication(app: CareerApplication) {
    const ref = db.collection('career_applications').doc();
    await ref.set({ ...app, id: ref.id });
}

export async function createJobPosting(job: JobPosting) {
    const ref = db.collection('job_postings').doc();
    await ref.set({ ...job, id: ref.id });
}

export async function getJobPostings(): Promise<JobPosting[]> {
    const snap = await db.collection('job_postings').orderBy('postedAt', 'desc').limit(50).get();
    return snap.docs.map(d => d.data() as JobPosting);
}

export async function getAllCareerApplications(): Promise<CareerApplication[]> {
    const snap = await db.collection('career_applications').orderBy('createdAt', 'desc').get();
    return snap.docs.map(d => d.data() as CareerApplication);
}

// --- Stats & Debug ---

export async function getGlobalStats(): Promise<GlobalStats> {
    const doc = await db.collection('stats').doc('global').get();
    if (doc.exists) return doc.data() as GlobalStats;
    return { totalLogins: 0, uniqueUsers: 0 };
}

export async function recalculateGlobalStats(): Promise<number> {
    const snap = await db.collection('users').get();
    const count = snap.size;
    await db.collection('stats').doc('global').set({ uniqueUsers: count }, { merge: true });
    return count;
}

export async function getDebugCollectionDocs(collectionName: string, limit = 20): Promise<any[]> {
    const snap = await db.collection(collectionName).limit(limit).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function seedDatabase() {
    // Example seeding
    const batch = db.batch();
    for (const channel of HANDCRAFTED_CHANNELS) {
        const ref = db.collection('channels').doc(channel.id);
        batch.set(ref, { ...channel, visibility: 'public' });
    }
    await batch.commit();
}

// --- Payments ---

export async function createStripeCheckoutSession(uid: string): Promise<string> {
    const docRef = await db.collection('customers').doc(uid).collection('checkout_sessions').add({
        price: 'price_1Q...', // Replace with real Price ID if needed or get from config
        success_url: window.location.origin,
        cancel_url: window.location.origin,
    });
    
    // Wait for the cloud function to populate the url
    return new Promise((resolve, reject) => {
        const unsubscribe = docRef.onSnapshot(snap => {
            const data = snap.data();
            if (data?.url) {
                unsubscribe();
                resolve(data.url);
            }
            if (data?.error) {
                unsubscribe();
                reject(new Error(data.error.message));
            }
        });
    });
}

export async function createStripePortalSession(uid: string): Promise<string> {
    // Similar to checkout session but for portal
    const functionRef = firebase.functions().httpsCallable('ext-firestore-stripe-payments-createPortalLink');
    const { data } = await functionRef({ returnUrl: window.location.origin });
    return (data as any).url;
}

export async function forceUpgradeDebug(uid: string) {
    await db.collection('users').doc(uid).update({ subscriptionTier: 'pro' });
}

export async function getBillingHistory(uid: string): Promise<any[]> {
    // In a real app with Stripe extension, this would query the 'payments' subcollection
    const snap = await db.collection('customers').doc(uid).collection('payments').get();
    return snap.docs.map(d => d.data());
}

export function setupSubscriptionListener(uid: string, callback: (tier: SubscriptionTier) => void) {
    return db.collection('users').doc(uid).onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data() as UserProfile;
            callback(data.subscriptionTier || 'free');
        }
    });
}

// --- Word of Day ---

export async function saveSavedWord(uid: string, wordData: any) {
    await db.collection('users').doc(uid).collection('saved_words').doc(wordData.word).set(wordData);
}

export async function getSavedWordForUser(uid: string, word: string): Promise<any> {
    const doc = await db.collection('users').doc(uid).collection('saved_words').doc(word).get();
    return doc.exists ? doc.data() : null;
}