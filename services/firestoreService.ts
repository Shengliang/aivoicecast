
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
      createdAt: Date.now(),
      subscriptionTier: 'free'
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

export async function getAllUsers(): Promise<UserProfile[]> {
    const snap = await db.collection('users').limit(100).get(); // Limit for safety
    return snap.docs.map(d => d.data() as UserProfile);
}

export async function getUserProfileByEmail(email: string): Promise<UserProfile | null> {
    const snap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (snap.empty) return null;
    return snap.docs[0].data() as UserProfile;
}

export async function logUserActivity(action: string, details: any): Promise<void> {
    if (!auth.currentUser) return;
    await db.collection('activity_logs').add({
        userId: auth.currentUser.uid,
        action,
        details,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Update login stats if action is login
    if (action === 'login') {
        await db.collection('stats').doc('global').set({
            totalLogins: firebase.firestore.FieldValue.increment(1)
        }, { merge: true });
    }
}

export async function getGlobalStats(): Promise<GlobalStats> {
    const doc = await db.collection('stats').doc('global').get();
    return doc.exists ? (doc.data() as GlobalStats) : { totalLogins: 0, uniqueUsers: 0 };
}

export async function recalculateGlobalStats(): Promise<number> {
    const snap = await db.collection('users').get();
    const count = snap.size;
    await db.collection('stats').doc('global').set({ uniqueUsers: count }, { merge: true });
    return count;
}

// --- Channels ---

export async function publishChannelToFirestore(channel: Channel): Promise<void> {
    await db.collection('channels').doc(channel.id).set(channel);
}

export async function getPublicChannels(): Promise<Channel[]> {
    const snap = await db.collection('channels').where('visibility', '==', 'public').limit(50).get();
    return snap.docs.map(d => d.data() as Channel);
}

export function subscribeToPublicChannels(onUpdate: (channels: Channel[]) => void, onError?: (error: any) => void): () => void {
    return db.collection('channels')
        .where('visibility', '==', 'public')
        .limit(50)
        .onSnapshot(
            (snap) => {
                const channels = snap.docs.map(d => d.data() as Channel);
                onUpdate(channels);
            },
            (error) => {
                if (onError) onError(error);
            }
        );
}

export async function getGroupChannels(groupIds: string[]): Promise<Channel[]> {
    if (groupIds.length === 0) return [];
    // Firestore 'in' query supports up to 10 values
    const chunks = [];
    for (let i = 0; i < groupIds.length; i += 10) {
        chunks.push(groupIds.slice(i, i + 10));
    }
    
    let allChannels: Channel[] = [];
    for (const chunk of chunks) {
        const snap = await db.collection('channels')
            .where('visibility', '==', 'group')
            .where('groupId', 'in', chunk)
            .get();
        allChannels = [...allChannels, ...snap.docs.map(d => d.data() as Channel)];
    }
    return allChannels;
}

export async function voteChannel(channelId: string, type: 'like' | 'dislike'): Promise<void> {
    const ref = db.collection('channels').doc(channelId);
    if (type === 'like') {
        await ref.update({ likes: firebase.firestore.FieldValue.increment(1) });
    } else {
        await ref.update({ dislikes: firebase.firestore.FieldValue.increment(1) });
    }
}

export async function deleteChannelFromFirestore(channelId: string): Promise<void> {
    await db.collection('channels').doc(channelId).delete();
}

export async function seedDatabase(): Promise<void> {
    const batch = db.batch();
    for (const ch of HANDCRAFTED_CHANNELS) {
        const ref = db.collection('channels').doc(ch.id);
        const doc = { ...ch, visibility: 'public', ownerId: 'system' };
        batch.set(ref, doc);
    }
    await batch.commit();
}

// --- Comments & Attachments ---

export async function addCommentToChannel(channelId: string, comment: Comment): Promise<void> {
    const ref = db.collection('channels').doc(channelId);
    await ref.update({
        comments: firebase.firestore.FieldValue.arrayUnion(comment)
    });
}

export async function updateCommentInChannel(channelId: string, comment: Comment): Promise<void> {
    // This is tricky with arrayUnion, simpler to read-modify-write for complex array updates or subcollections
    // For this app, comments are in the document array.
    await db.runTransaction(async (t) => {
        const ref = db.collection('channels').doc(channelId);
        const doc = await t.get(ref);
        if (!doc.exists) return;
        const data = doc.data() as Channel;
        const newComments = data.comments.map(c => c.id === comment.id ? comment : c);
        t.update(ref, { comments: newComments });
    });
}

export async function deleteCommentFromChannel(channelId: string, commentId: string): Promise<void> {
    await db.runTransaction(async (t) => {
        const ref = db.collection('channels').doc(channelId);
        const doc = await t.get(ref);
        if (!doc.exists) return;
        const data = doc.data() as Channel;
        const newComments = data.comments.filter(c => c.id !== commentId);
        t.update(ref, { comments: newComments });
    });
}

export async function addChannelAttachment(channelId: string, attachment: Attachment): Promise<void> {
    const ref = db.collection('channels').doc(channelId);
    await ref.update({
        appendix: firebase.firestore.FieldValue.arrayUnion(attachment)
    });
}

export async function uploadFileToStorage(path: string, file: Blob | File, metadata?: any): Promise<string> {
    const ref = storage.ref(path);
    await ref.put(file, metadata);
    return await ref.getDownloadURL();
}

export async function uploadCommentAttachment(file: File, path: string): Promise<string> {
    return uploadFileToStorage(path, file);
}

// --- Lectures & Curriculum ---

export async function saveLectureToFirestore(channelId: string, lectureId: string, lecture: GeneratedLecture): Promise<void> {
    await db.collection('channels').doc(channelId).collection('lectures').doc(lectureId).set(lecture);
}

export async function getLectureFromFirestore(channelId: string, lectureId: string): Promise<GeneratedLecture | null> {
    const doc = await db.collection('channels').doc(channelId).collection('lectures').doc(lectureId).get();
    return doc.exists ? (doc.data() as GeneratedLecture) : null;
}

export async function deleteLectureFromFirestore(channelId: string, lectureId: string): Promise<void> {
    await db.collection('channels').doc(channelId).collection('lectures').doc(lectureId).delete();
}

export async function saveCurriculumToFirestore(channelId: string, curriculum: Chapter[]): Promise<void> {
    await db.collection('channels').doc(channelId).update({ chapters: curriculum });
}

export async function getCurriculumFromFirestore(channelId: string): Promise<Chapter[] | null> {
    const doc = await db.collection('channels').doc(channelId).get();
    if (doc.exists) {
        return (doc.data() as Channel).chapters || null;
    }
    return null;
}

// --- API Usage ---

export async function incrementApiUsage(uid: string): Promise<void> {
    await db.collection('users').doc(uid).update({
        apiUsageCount: firebase.firestore.FieldValue.increment(1)
    });
}

// --- Discussions ---

export async function saveDiscussion(discussion: CommunityDiscussion): Promise<string> {
    const docRef = await db.collection('discussions').add(discussion);
    return docRef.id;
}

export async function updateDiscussion(discussionId: string, transcript: any[]): Promise<void> {
    await db.collection('discussions').doc(discussionId).update({
        transcript,
        updatedAt: Date.now()
    });
}

export async function getDiscussionById(id: string): Promise<CommunityDiscussion> {
    const doc = await db.collection('discussions').doc(id).get();
    if (!doc.exists) throw new Error("Discussion not found");
    return { id: doc.id, ...doc.data() } as CommunityDiscussion;
}

export async function saveDiscussionDesignDoc(discussionId: string, docContent: string, title?: string): Promise<void> {
    const data: any = { designDoc: docContent };
    if (title) data.title = title;
    await db.collection('discussions').doc(discussionId).update(data);
}

export async function getUserDesignDocs(uid: string): Promise<CommunityDiscussion[]> {
    const snap = await db.collection('discussions')
        .where('userId', '==', uid)
        .where('designDoc', '!=', null)
        .orderBy('designDoc') // Required for inequality filter
        .orderBy('createdAt', 'desc')
        .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CommunityDiscussion));
}

export async function linkDiscussionToLectureSegment(channelId: string, lectureId: string, segmentIndex: number, discussionId: string): Promise<void> {
    // This assumes lecture is stored in subcollection
    const ref = db.collection('channels').doc(channelId).collection('lectures').doc(lectureId);
    // Need to read, modify specific array item, write back.
    await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) return;
        const data = doc.data() as GeneratedLecture;
        if (data.sections && data.sections[segmentIndex]) {
            data.sections[segmentIndex].discussionId = discussionId;
            t.update(ref, { sections: data.sections });
        }
    });
}

// --- Groups & Invitations ---

export async function createGroup(name: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("Not logged in");
    
    const groupRef = db.collection('groups').doc();
    const group: Group = {
        id: groupRef.id,
        name,
        ownerId: user.uid,
        memberIds: [user.uid],
        createdAt: Date.now()
    };
    
    await groupRef.set(group);
    
    // Add to user profile
    await db.collection('users').doc(user.uid).update({
        groups: firebase.firestore.FieldValue.arrayUnion(groupRef.id)
    });
}

export async function getUserGroups(uid: string): Promise<Group[]> {
    const user = await getUserProfile(uid);
    if (!user || !user.groups || user.groups.length === 0) return [];
    
    // Fetch in chunks of 10
    const groupIds = user.groups;
    const chunks = [];
    for (let i = 0; i < groupIds.length; i += 10) chunks.push(groupIds.slice(i, i+10));
    
    let groups: Group[] = [];
    for (const chunk of chunks) {
        const snap = await db.collection('groups').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get();
        groups = [...groups, ...snap.docs.map(d => d.data() as Group)];
    }
    return groups;
}

export async function getGroupMembers(memberIds: string[]): Promise<UserProfile[]> {
    if (memberIds.length === 0) return [];
    // Only fetch first 10 for display to avoid query limits in simple UI
    const subset = memberIds.slice(0, 10);
    const snap = await db.collection('users').where('uid', 'in', subset).get();
    return snap.docs.map(d => d.data() as UserProfile);
}

export async function removeMemberFromGroup(groupId: string, memberId: string): Promise<void> {
    await db.collection('groups').doc(groupId).update({
        memberIds: firebase.firestore.FieldValue.arrayRemove(memberId)
    });
    await db.collection('users').doc(memberId).update({
        groups: firebase.firestore.FieldValue.arrayRemove(groupId)
    });
}

export async function sendInvitation(groupId: string, email: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("Not logged in");
    
    // Verify group ownership
    const groupDoc = await db.collection('groups').doc(groupId).get();
    if (!groupDoc.exists || (groupDoc.data() as Group).ownerId !== user.uid) {
        throw new Error("Only owner can invite");
    }
    
    const invite: Invitation = {
        id: '', // set later
        fromUserId: user.uid,
        fromName: user.displayName || 'User',
        toEmail: email,
        groupId,
        groupName: (groupDoc.data() as Group).name,
        status: 'pending',
        createdAt: Date.now()
    };
    
    await db.collection('invitations').add(invite);
}

export async function getPendingInvitations(email: string): Promise<Invitation[]> {
    const snap = await db.collection('invitations')
        .where('toEmail', '==', email)
        .where('status', '==', 'pending')
        .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Invitation));
}

export async function respondToInvitation(invite: Invitation, accept: boolean): Promise<void> {
    const batch = db.batch();
    const invRef = db.collection('invitations').doc(invite.id);
    
    if (accept) {
        batch.update(invRef, { status: 'accepted' });
        
        // If it's a group invite (not session), add to group
        if (!invite.type || invite.type === 'group') {
            const user = auth.currentUser;
            if (user) {
                const groupRef = db.collection('groups').doc(invite.groupId);
                batch.update(groupRef, { memberIds: firebase.firestore.FieldValue.arrayUnion(user.uid) });
                
                const userRef = db.collection('users').doc(user.uid);
                batch.update(userRef, { groups: firebase.firestore.FieldValue.arrayUnion(invite.groupId) });
            }
        }
    } else {
        batch.update(invRef, { status: 'rejected' });
    }
    
    await batch.commit();
}

// --- Bookings ---

export async function createBooking(booking: Booking): Promise<void> {
    await db.collection('bookings').add(booking);
}

export async function getUserBookings(uid: string, email: string): Promise<Booking[]> {
    // Get bookings where I am user OR I am invited
    const myBookings = await db.collection('bookings').where('userId', '==', uid).get();
    const invitedBookings = await db.collection('bookings').where('invitedEmail', '==', email).get();
    
    const results = [
        ...myBookings.docs.map(d => ({ id: d.id, ...d.data() } as Booking)),
        ...invitedBookings.docs.map(d => ({ id: d.id, ...d.data() } as Booking))
    ];
    
    // Dedup
    const unique = new Map();
    results.forEach(b => unique.set(b.id, b));
    return Array.from(unique.values());
}

export async function cancelBooking(bookingId: string): Promise<void> {
    await db.collection('bookings').doc(bookingId).update({ status: 'cancelled' });
}

export async function getPendingBookings(email: string): Promise<Booking[]> {
    // For P2P, find bookings where invitedEmail is me and status is pending
    const snap = await db.collection('bookings')
        .where('invitedEmail', '==', email)
        .where('status', '==', 'pending')
        .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
}

export async function respondToBooking(bookingId: string, accept: boolean): Promise<void> {
    await db.collection('bookings').doc(bookingId).update({
        status: accept ? 'scheduled' : 'rejected'
    });
}

export async function updateBookingRecording(bookingId: string, mediaUrl: string, transcriptUrl: string): Promise<void> {
    await db.collection('bookings').doc(bookingId).update({
        status: 'completed',
        recordingUrl: mediaUrl,
        transcriptUrl: transcriptUrl
    });
}

export async function updateBookingInvite(bookingId: string, email: string): Promise<void> {
    await db.collection('bookings').doc(bookingId).update({
        invitedEmail: email
    });
}

export async function deleteBookingRecording(bookingId: string, mediaUrl?: string, transcriptUrl?: string): Promise<void> {
    await db.collection('bookings').doc(bookingId).update({
        recordingUrl: firebase.firestore.FieldValue.delete(),
        transcriptUrl: firebase.firestore.FieldValue.delete()
    });
    
    // Try to delete from storage (optional, catch error if fails)
    try {
        if (mediaUrl) await storage.refFromURL(mediaUrl).delete();
        if (transcriptUrl) await storage.refFromURL(transcriptUrl).delete();
    } catch(e) { console.warn("Storage cleanup failed", e); }
}

// --- Recordings (Ad-Hoc) ---

export async function saveRecordingReference(recording: RecordingSession): Promise<void> {
    await db.collection('recordings').add(recording);
}

export async function getUserRecordings(uid: string): Promise<RecordingSession[]> {
    const snap = await db.collection('recordings').where('userId', '==', uid).orderBy('timestamp', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as RecordingSession));
}

export async function deleteRecordingReference(id: string, mediaUrl: string, transcriptUrl: string): Promise<void> {
    await db.collection('recordings').doc(id).delete();
    try {
        await storage.refFromURL(mediaUrl).delete();
        await storage.refFromURL(transcriptUrl).delete();
    } catch(e) {}
}

// --- Saved Words ---

export async function saveSavedWord(uid: string, data: any): Promise<void> {
    await db.collection('users').doc(uid).collection('saved_words').doc(data.word).set(data);
}

export async function getSavedWordForUser(uid: string, word: string): Promise<any> {
    const doc = await db.collection('users').doc(uid).collection('saved_words').doc(word).get();
    return doc.exists ? doc.data() : null;
}

// --- Chat & Messaging ---

export async function createOrGetDMChannel(otherUserId: string, otherUserName?: string): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error("Not logged in");
    
    // Consistent ID generation for DMs (lexicographical sort)
    const participants = [user.uid, otherUserId].sort();
    const channelId = `dm_${participants[0]}_${participants[1]}`;
    
    const channelRef = db.collection('chat_channels').doc(channelId);
    const doc = await channelRef.get();
    
    if (!doc.exists) {
        // Prepare names map for quick lookup
        const names: Record<string, string> = {
            [user.uid]: user.displayName || 'User'
        };
        
        if (otherUserName) {
            names[otherUserId] = otherUserName;
        } else {
             // Fallback: try to fetch if not provided
             const p = await getUserProfile(otherUserId);
             if (p) names[otherUserId] = p.displayName;
        }

        await channelRef.set({
            id: channelId,
            type: 'dm',
            memberIds: participants,
            createdAt: Date.now(),
            names
        });
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
        
    const channels = await Promise.all(snap.docs.map(async d => {
        const data = d.data();
        const otherId = data.memberIds.find((id: string) => id !== user.uid);
        
        let name = data.names?.[otherId];
        
        // Fix: If name is missing in channel doc (legacy data), fetch from profile
        if (!name && otherId) {
             const userDoc = await db.collection('users').doc(otherId).get();
             if (userDoc.exists) {
                 name = (userDoc.data() as UserProfile).displayName;
             }
        }
        
        return { ...data, name: name || 'Unknown User', id: d.id } as ChatChannel;
    }));
    
    return channels;
}

export async function sendMessage(channelId: string, text: string, collectionPath: string, replyTo?: any, attachments?: any[]): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("Not logged in");
    
    const msg: Partial<RealTimeMessage> = {
        text,
        senderId: user.uid,
        senderName: user.displayName || 'Anonymous',
        senderImage: user.photoURL || '',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    };
    
    if (replyTo) msg.replyTo = replyTo;
    if (attachments && attachments.length > 0) (msg as any).attachments = attachments;
    
    await db.collection(collectionPath).add(msg);
    
    // Update last message in channel doc for previews
    if (collectionPath.startsWith('chat_channels')) {
        await db.collection('chat_channels').doc(channelId).update({
            lastMessage: {
                text: text || (attachments ? 'Sent an attachment' : ''),
                senderName: user.displayName,
                timestamp: Date.now()
            }
        });
    }
}

export function subscribeToMessages(channelId: string, onUpdate: (msgs: RealTimeMessage[]) => void, collectionPath: string) {
    return db.collection(collectionPath)
        .orderBy('timestamp', 'asc')
        .limitToLast(50)
        .onSnapshot(snap => {
            const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as RealTimeMessage));
            onUpdate(msgs);
        });
}

export async function deleteMessage(channelId: string, messageId: string, collectionPath: string): Promise<void> {
    await db.collection(collectionPath).doc(messageId).delete();
}

export async function getUniqueGroupMembers(groupId: string): Promise<string[]> {
    const doc = await db.collection('groups').doc(groupId).get();
    if (doc.exists) {
        return (doc.data() as Group).memberIds;
    }
    return [];
}

// --- Cloud / Code Studio ---

export async function listCloudDirectory(path: string): Promise<CloudItem[]> {
    const listRef = storage.ref(path);
    const res = await listRef.listAll();
    
    const folders = res.prefixes.map(p => ({
        name: p.name,
        fullPath: p.fullPath,
        isFolder: true
    } as CloudItem));
    
    const files = await Promise.all(res.items.map(async item => {
        const url = await item.getDownloadURL();
        return {
            name: item.name,
            fullPath: item.fullPath,
            isFolder: false,
            url
        } as CloudItem;
    }));
    
    return [...folders, ...files];
}

export async function saveProjectToCloud(path: string, name: string, content: string): Promise<void> {
    const ref = storage.ref(`${path}/${name}`);
    await ref.putString(content);
}

export async function deleteCloudItem(item: CloudItem): Promise<void> {
    const ref = storage.ref(item.fullPath);
    await ref.delete();
}

export async function createCloudFolder(path: string, name: string): Promise<void> {
    // Create a dummy file to establish folder
    const ref = storage.ref(`${path}/${name}/.keep`);
    await ref.putString('');
}

export async function moveCloudFile(oldPath: string, newPath: string): Promise<void> {
    const oldRef = storage.ref(oldPath);
    const url = await oldRef.getDownloadURL();
    const res = await fetch(url);
    const blob = await res.blob();
    
    const newRef = storage.ref(newPath);
    await newRef.put(blob);
    await oldRef.delete();
}

// --- Code Project (Realtime) ---

export function subscribeToCodeProject(projectId: string, onUpdate: (project: CodeProject) => void) {
    return db.collection('code_projects').doc(projectId).onSnapshot(doc => {
        if (doc.exists) {
            onUpdate({ id: doc.id, ...doc.data() } as CodeProject);
        }
    });
}

export async function saveCodeProject(project: CodeProject): Promise<void> {
    await db.collection('code_projects').doc(project.id).set(project, { merge: true });
}

export async function updateCodeFile(projectId: string, file: CodeFile): Promise<void> {
    // Firestore cannot easily update array element by field.
    // Standard approach: Read, modify, write.
    // For collaborative editing, we should ideally use subcollections or Yjs.
    // Here we use a simpler array replacement for this demo.
    
    await db.runTransaction(async (t) => {
        const ref = db.collection('code_projects').doc(projectId);
        const doc = await t.get(ref);
        if (!doc.exists) return;
        
        const data = doc.data() as CodeProject;
        const newFiles = data.files.map(f => (f.path || f.name) === (file.path || file.name) ? file : f);
        
        // If new file, add it
        if (!newFiles.some(f => (f.path || f.name) === (file.path || file.name))) {
            newFiles.push(file);
        }
        
        t.update(ref, { files: newFiles, lastModified: Date.now() });
    });
}

export async function updateCursor(projectId: string, cursor: CursorPosition): Promise<void> {
    // Use dot notation to update specific map entry
    const update: any = {};
    update[`cursors.${cursor.clientId}`] = cursor;
    await db.collection('code_projects').doc(projectId).update(update);
}

export async function claimCodeProjectLock(projectId: string, clientId: string, userName: string): Promise<void> {
    await db.collection('code_projects').doc(projectId).update({
        activeClientId: clientId,
        activeWriterName: userName,
        lastModified: Date.now() // extend lock
    });
}

export async function updateProjectActiveFile(projectId: string, filePath: string): Promise<void> {
    await db.collection('code_projects').doc(projectId).update({
        activeFilePath: filePath
    });
}

export async function deleteCodeFile(projectId: string, fileName: string): Promise<void> {
    await db.runTransaction(async (t) => {
        const ref = db.collection('code_projects').doc(projectId);
        const doc = await t.get(ref);
        if (!doc.exists) return;
        const data = doc.data() as CodeProject;
        const newFiles = data.files.filter(f => f.name !== fileName);
        t.update(ref, { files: newFiles });
    });
}

export async function updateProjectAccess(projectId: string, accessLevel: 'public' | 'restricted', allowedUserIds: string[]): Promise<void> {
    await db.collection('code_projects').doc(projectId).update({
        accessLevel,
        allowedUserIds
    });
}

export async function sendShareNotification(toUserId: string, sessionType: 'Code' | 'Whiteboard', link: string, fromName: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("Must be logged in to share.");

    // 1. Send DM (Existing behavior - reliable for real-time if user is looking at chat)
    const channelId = await createOrGetDMChannel(toUserId);
    const collectionPath = `chat_channels/${channelId}/messages`;
    await sendMessage(channelId, `I've shared a ${sessionType} session with you. Click to join: ${link}`, collectionPath);

    // 2. Create Formal Invitation (New behavior - ensures it shows up in Bell Icon)
    // We need the recipient's email because Notifications.tsx queries invites by email.
    const targetUser = await getUserProfile(toUserId);
    
    if (targetUser && targetUser.email) {
        await db.collection('invitations').add({
            fromUserId: user.uid,
            fromName: fromName,
            toEmail: targetUser.email,
            groupId: 'session-invite', // Placeholder for query compatibility
            groupName: `${sessionType} Session: ${fromName}`, // Display name
            type: 'session', // Distinguished type
            link: link, // The actual URL
            status: 'pending',
            createdAt: Date.now()
        });
        console.log(`Invitation doc created for ${targetUser.email}`);
    } else {
        console.warn(`Could not find email for user ${toUserId}, skipping formal invite.`);
    }
}

// --- Whiteboard ---

export function subscribeToWhiteboard(boardId: string, onUpdate: (elements: WhiteboardElement[]) => void) {
    return db.collection('whiteboards').doc(boardId).onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            onUpdate(data?.elements || []);
        }
    });
}

export async function saveWhiteboardSession(boardId: string, elements: WhiteboardElement[]): Promise<void> {
    await db.collection('whiteboards').doc(boardId).set({ elements }, { merge: true });
}

export async function updateWhiteboardElement(boardId: string, element: WhiteboardElement): Promise<void> {
    // In a real optimized app, we would update just the specific element in array or subcollection
    // For this demo, we read-write entire array to ensure consistency with React state
    await db.runTransaction(async (t) => {
        const ref = db.collection('whiteboards').doc(boardId);
        const doc = await t.get(ref);
        if (!doc.exists) {
            t.set(ref, { elements: [element] });
            return;
        }
        const data = doc.data();
        let elements = data?.elements || [];
        const idx = elements.findIndex((e: any) => e.id === element.id);
        if (idx >= 0) elements[idx] = element;
        else elements.push(element);
        t.update(ref, { elements });
    });
}

export async function deleteWhiteboardElements(boardId: string, idsToDelete: string[]): Promise<void> {
    await db.runTransaction(async (t) => {
        const ref = db.collection('whiteboards').doc(boardId);
        const doc = await t.get(ref);
        if (!doc.exists) return;
        const data = doc.data();
        const elements = data?.elements.filter((e: any) => !idsToDelete.includes(e.id));
        t.update(ref, { elements });
    });
}

// --- Blog ---

export async function ensureUserBlog(user: firebase.User): Promise<Blog> {
    const snap = await db.collection('blogs').where('ownerId', '==', user.uid).get();
    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() } as Blog;
    
    // Create new
    const blog: Blog = {
        id: '',
        ownerId: user.uid,
        authorName: user.displayName || 'Author',
        title: `${user.displayName}'s Blog`,
        description: 'Thoughts and stories.',
        createdAt: Date.now()
    };
    const ref = await db.collection('blogs').add(blog);
    return { ...blog, id: ref.id };
}

export async function getCommunityPosts(): Promise<BlogPost[]> {
    const snap = await db.collection('blog_posts')
        .where('status', '==', 'published')
        .orderBy('publishedAt', 'desc')
        .limit(20)
        .get();
    
    const dbPosts = snap.docs.map(d => ({ id: d.id, ...d.data() } as BlogPost));
    
    // Inject Static Architecture Blog Post
    return [ARCHITECTURE_BLOG_POST, ...dbPosts];
}

export async function getUserPosts(blogId: string): Promise<BlogPost[]> {
    const snap = await db.collection('blog_posts')
        .where('blogId', '==', blogId)
        .orderBy('createdAt', 'desc')
        .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as BlogPost));
}

export async function createBlogPost(post: BlogPost): Promise<void> {
    await db.collection('blog_posts').add(post);
}

export async function updateBlogPost(postId: string, data: Partial<BlogPost>): Promise<void> {
    await db.collection('blog_posts').doc(postId).update(data);
}

export async function deleteBlogPost(postId: string): Promise<void> {
    await db.collection('blog_posts').doc(postId).delete();
}

export async function updateBlogSettings(blogId: string, settings: { title: string, description: string }): Promise<void> {
    await db.collection('blogs').doc(blogId).update(settings);
}

export async function addPostComment(postId: string, comment: Comment): Promise<void> {
    await db.collection('blog_posts').doc(postId).update({
        comments: firebase.firestore.FieldValue.arrayUnion(comment),
        commentCount: firebase.firestore.FieldValue.increment(1)
    });
}

export async function getBlogPost(postId: string): Promise<BlogPost | null> {
    // Check if it's the static post first
    if (postId === ARCHITECTURE_BLOG_POST.id) {
        return ARCHITECTURE_BLOG_POST;
    }

    const doc = await db.collection('blog_posts').doc(postId).get();
    return doc.exists ? ({ id: doc.id, ...doc.data() } as BlogPost) : null;
}

// --- Stripe / Billing (Client-Side Calls) ---

export async function createStripeCheckoutSession(uid: string): Promise<string> {
    const sessionRef = await db.collection('customers')
        .doc(uid)
        .collection('checkout_sessions')
        .add({
            price: 'price_1Q...', // Replace with real Price ID
            success_url: window.location.origin,
            cancel_url: window.location.origin,
        });
        
    // Wait for cloud function to populate sessionId
    return new Promise((resolve, reject) => {
        sessionRef.onSnapshot((snap) => {
            const { error, url } = snap.data() || {};
            if (error) reject(new Error(error.message));
            if (url) resolve(url);
        });
    });
}

export async function createStripePortalSession(uid: string): Promise<string> {
    const functionRef = firebase.functions().httpsCallable('ext-firestore-stripe-payments-createPortalLink');
    const { data } = await functionRef({ returnUrl: window.location.origin });
    return data.url;
}

export async function getBillingHistory(uid: string): Promise<any[]> {
    // Mock for now or query payments subcollection
    return [];
}

export async function forceUpgradeDebug(uid: string): Promise<void> {
    await db.collection('users').doc(uid).update({ subscriptionTier: 'pro' });
}

export function setupSubscriptionListener(uid: string, callback: (tier: SubscriptionTier) => void) {
    return db.collection('customers').doc(uid).collection('subscriptions')
        .where('status', 'in', ['active', 'trialing'])
        .onSnapshot(snap => {
            if (snap.empty) {
                callback('free');
            } else {
                callback('pro');
            }
        });
}

// --- Career Center ---

export async function submitCareerApplication(app: CareerApplication): Promise<void> {
    await db.collection('career_applications').add(app);
}

export async function getAllCareerApplications(): Promise<CareerApplication[]> {
    const snap = await db.collection('career_applications').orderBy('createdAt', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CareerApplication));
}

export async function createJobPosting(job: JobPosting): Promise<void> {
    await db.collection('job_postings').add(job);
}

export async function getJobPostings(): Promise<JobPosting[]> {
    const snap = await db.collection('job_postings').orderBy('postedAt', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as JobPosting));
}

export async function uploadResumeToStorage(uid: string, file: File): Promise<string> {
    const ref = storage.ref(`resumes/${uid}/${Date.now()}_${file.name}`);
    await ref.put(file);
    return await ref.getDownloadURL();
}

// --- Debugging ---

export async function getDebugCollectionDocs(collectionName: string, limit: number): Promise<any[]> {
    const snap = await db.collection(collectionName).limit(limit).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
