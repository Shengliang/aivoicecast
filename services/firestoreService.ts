import { db, auth, storage } from './firebaseConfig';
import firebase from 'firebase/compat/app';
import { 
  Channel, UserProfile, GeneratedLecture, CommunityDiscussion, 
  Attachment, Chapter, Booking, Invitation, RecordingSession, 
  CodeProject, CodeFile, WhiteboardElement, CloudItem, CursorPosition,
  BlogPost, Comment, JobPosting, CareerApplication, RealTimeMessage, ChatChannel,
  GlobalStats, Group
} from '../types';
import { HANDCRAFTED_CHANNELS } from '../utils/initialData';

// --- Users ---

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const doc = await db.collection('users').doc(uid).get();
  return doc.exists ? (doc.data() as UserProfile) : null;
}

export async function syncUserProfile(user: firebase.User): Promise<void> {
  const userRef = db.collection('users').doc(user.uid);
  const doc = await userRef.get();
  if (!doc.exists) {
    await userRef.set({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || 'User',
      photoURL: user.photoURL || '',
      createdAt: Date.now(),
      lastLogin: Date.now(),
      apiUsageCount: 0
    });
  } else {
    await userRef.update({ lastLogin: Date.now() });
  }
}

export async function updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  await db.collection('users').doc(uid).update(data);
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const snapshot = await db.collection('users').get();
  return snapshot.docs.map(doc => doc.data() as UserProfile);
}

export async function getUserProfileByEmail(email: string): Promise<UserProfile | null> {
  const snapshot = await db.collection('users').where('email', '==', email).limit(1).get();
  if (snapshot.empty) return null;
  return snapshot.docs[0].data() as UserProfile;
}

export async function followUser(followerId: string, targetId: string): Promise<void> {
  const batch = db.batch();
  const followerRef = db.collection('users').doc(followerId);
  const targetRef = db.collection('users').doc(targetId);
  
  batch.update(followerRef, { following: firebase.firestore.FieldValue.arrayUnion(targetId) });
  batch.update(targetRef, { followers: firebase.firestore.FieldValue.arrayUnion(followerId) });
  await batch.commit();
}

export async function unfollowUser(followerId: string, targetId: string): Promise<void> {
  const batch = db.batch();
  const followerRef = db.collection('users').doc(followerId);
  const targetRef = db.collection('users').doc(targetId);
  
  batch.update(followerRef, { following: firebase.firestore.FieldValue.arrayRemove(targetId) });
  batch.update(targetRef, { followers: firebase.firestore.FieldValue.arrayRemove(followerId) });
  await batch.commit();
}

export function logUserActivity(action: string, details: any) {
  if (!auth.currentUser) return;
  db.collection('activity_logs').add({
    userId: auth.currentUser.uid,
    action,
    details,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(console.error);
}

export function incrementApiUsage(uid: string) {
  db.collection('users').doc(uid).update({
    apiUsageCount: firebase.firestore.FieldValue.increment(1)
  }).catch(console.error);
}

// --- Channels ---

export async function voteChannel(channel: Channel, type: 'like' | 'dislike') {
    const ref = db.collection('channels').doc(channel.id);
    const user = auth.currentUser;
    const doc = await ref.get();
    
    const batch = db.batch();

    if (doc.exists) {
        const increment = type === 'like' ? 1 : -1;
        batch.update(ref, { likes: firebase.firestore.FieldValue.increment(increment) });
    } else {
        const newLikes = type === 'like' ? (channel.likes || 0) + 1 : Math.max(0, (channel.likes || 0) - 1);
        batch.set(ref, {
            ...channel,
            likes: newLikes,
            visibility: 'public',
            ownerId: channel.ownerId || 'system'
        });
    }

    if (user) {
        const userRef = db.collection('users').doc(user.uid);
        if (type === 'like') {
            batch.update(userRef, {
                likedChannelIds: firebase.firestore.FieldValue.arrayUnion(channel.id)
            });
        } else {
            batch.update(userRef, {
                likedChannelIds: firebase.firestore.FieldValue.arrayRemove(channel.id)
            });
        }
    }

    await batch.commit();
}

export async function getChannelsByIds(ids: string[]): Promise<Channel[]> {
    if (!ids || ids.length === 0) return [];
    const chunks = [];
    for (let i = 0; i < ids.length; i += 10) {
        chunks.push(ids.slice(i, i + 10));
    }
    
    let results: Channel[] = [];
    for (const chunk of chunks) {
        try {
            const snap = await db.collection('channels').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get();
            snap.forEach(doc => results.push(doc.data() as Channel));
        } catch (e) {
            console.warn("Failed to fetch chunk of channels", e);
        }
    }
    return results;
}

export async function shareChannel(channelId: string) {
    const ref = db.collection('channels').doc(channelId);
    await ref.update({ shares: firebase.firestore.FieldValue.increment(1) }).catch(() => {});
}

export async function publishChannelToFirestore(channel: Channel): Promise<void> {
  await db.collection('channels').doc(channel.id).set(channel);
}

export async function getPublicChannels(): Promise<Channel[]> {
  const snapshot = await db.collection('channels').where('visibility', '==', 'public').get();
  return snapshot.docs.map(doc => doc.data() as Channel);
}

export async function deleteChannelFromFirestore(channelId: string): Promise<void> {
  await db.collection('channels').doc(channelId).delete();
}

export async function addChannelAttachment(channelId: string, attachment: Attachment): Promise<void> {
  await db.collection('channels').doc(channelId).update({
    appendix: firebase.firestore.FieldValue.arrayUnion(attachment)
  });
}

export async function seedDatabase(): Promise<void> {
  const batch = db.batch();
  for (const channel of HANDCRAFTED_CHANNELS) {
    const ref = db.collection('channels').doc(channel.id);
    batch.set(ref, { ...channel, visibility: 'public', ownerId: 'system' });
  }
  await batch.commit();
}

// --- Lectures & Content ---

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

export async function saveCurriculumToFirestore(channelId: string, chapters: Chapter[]): Promise<void> {
  await db.collection('channels').doc(channelId).update({ chapters });
}

export async function getCurriculumFromFirestore(channelId: string): Promise<Chapter[] | null> {
  const doc = await db.collection('channels').doc(channelId).get();
  return doc.exists ? (doc.data() as Channel).chapters || null : null;
}

// --- Discussions ---

export async function saveDiscussion(discussion: CommunityDiscussion): Promise<string> {
  const ref = await db.collection('discussions').add(discussion);
  return ref.id;
}

export async function updateDiscussion(id: string, transcript: any[]): Promise<void> {
  await db.collection('discussions').doc(id).update({ transcript });
}

export async function getDiscussionById(id: string): Promise<CommunityDiscussion | null> {
  const doc = await db.collection('discussions').doc(id).get();
  return doc.exists ? { ...doc.data(), id: doc.id } as CommunityDiscussion : null;
}

export async function saveDiscussionDesignDoc(id: string, docContent: string, title?: string): Promise<void> {
  const data: any = { designDoc: docContent };
  if (title) data.title = title;
  await db.collection('discussions').doc(id).update(data);
}

export async function getUserDesignDocs(uid: string): Promise<CommunityDiscussion[]> {
  const snapshot = await db.collection('discussions').where('userId', '==', uid).get();
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as CommunityDiscussion));
}

export async function linkDiscussionToLectureSegment(channelId: string, lectureId: string, segmentIndex: number, discussionId: string): Promise<void> {
  const lectureRef = db.collection('channels').doc(channelId).collection('lectures').doc(lectureId);
  const doc = await lectureRef.get();
  if (doc.exists) {
    const lecture = doc.data() as GeneratedLecture;
    if (lecture.sections[segmentIndex]) {
      lecture.sections[segmentIndex].discussionId = discussionId;
      await lectureRef.set(lecture);
    }
  }
}

// --- Storage ---

export async function uploadFileToStorage(path: string, blob: Blob | File, metadata?: any): Promise<string> {
  const ref = storage.ref(path);
  await ref.put(blob, metadata);
  return await ref.getDownloadURL();
}

export async function uploadCommentAttachment(file: File, path: string): Promise<string> {
  return uploadFileToStorage(path, file);
}

// --- Bookings & Recordings ---

export async function createBooking(booking: Booking): Promise<void> {
  const ref = db.collection('bookings').doc();
  await ref.set({ ...booking, id: ref.id });
}

export async function getUserBookings(uid: string, email?: string): Promise<Booking[]> {
  const bookingsRef = db.collection('bookings');
  const hostSnap = await bookingsRef.where('userId', '==', uid).get();
  
  let guestSnap = { docs: [] as any[] };
  if (email) {
      guestSnap = await bookingsRef.where('invitedEmail', '==', email).get();
  }
  
  const bookings = new Map<string, Booking>();
  hostSnap.docs.forEach(doc => bookings.set(doc.id, doc.data() as Booking));
  guestSnap.docs.forEach(doc => bookings.set(doc.id, doc.data() as Booking));
  
  return Array.from(bookings.values());
}

export async function updateBookingRecording(bookingId: string, mediaUrl: string, transcriptUrl: string): Promise<void> {
  await db.collection('bookings').doc(bookingId).update({
    status: 'completed',
    recordingUrl: mediaUrl,
    transcriptUrl: transcriptUrl
  });
}

export async function saveRecordingReference(recording: RecordingSession): Promise<void> {
  await db.collection('recordings').add(recording);
}

export async function getUserRecordings(uid: string): Promise<RecordingSession[]> {
  const snapshot = await db.collection('recordings').where('userId', '==', uid).orderBy('timestamp', 'desc').get();
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as RecordingSession));
}

export async function deleteBookingRecording(bookingId: string, mediaUrl?: string, transcriptUrl?: string): Promise<void> {
  await db.collection('bookings').doc(bookingId).update({
    recordingUrl: firebase.firestore.FieldValue.delete(),
    transcriptUrl: firebase.firestore.FieldValue.delete()
  });
  if (mediaUrl) await storage.refFromURL(mediaUrl).delete().catch(() => {});
  if (transcriptUrl) await storage.refFromURL(transcriptUrl).delete().catch(() => {});
}

export async function deleteRecordingReference(id: string, mediaUrl: string, transcriptUrl: string): Promise<void> {
  await db.collection('recordings').doc(id).delete();
  if (mediaUrl) await storage.refFromURL(mediaUrl).delete().catch(() => {});
  if (transcriptUrl) await storage.refFromURL(transcriptUrl).delete().catch(() => {});
}

export async function cancelBooking(bookingId: string): Promise<void> {
  await db.collection('bookings').doc(bookingId).update({ status: 'cancelled' });
}

export async function getPendingBookings(email: string): Promise<Booking[]> {
  const snapshot = await db.collection('bookings').where('invitedEmail', '==', email).where('status', '==', 'pending').get();
  return snapshot.docs.map(doc => doc.data() as Booking);
}

export async function respondToBooking(bookingId: string, accept: boolean): Promise<void> {
  await db.collection('bookings').doc(bookingId).update({
    status: accept ? 'scheduled' : 'rejected'
  });
}

export async function updateBookingInvite(bookingId: string, email: string): Promise<void> {
  await db.collection('bookings').doc(bookingId).update({ invitedEmail: email });
}

// --- Groups & Invites ---

export async function createGroup(name: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in");
  const ref = db.collection('groups').doc();
  const group: Group = {
    id: ref.id,
    name,
    ownerId: user.uid,
    memberIds: [user.uid],
    createdAt: Date.now()
  };
  await ref.set(group);
  await db.collection('users').doc(user.uid).update({
    groups: firebase.firestore.FieldValue.arrayUnion(ref.id)
  });
}

export async function getUserGroups(uid: string): Promise<Group[]> {
  const snapshot = await db.collection('groups').where('memberIds', 'array-contains', uid).get();
  return snapshot.docs.map(doc => doc.data() as Group);
}

export async function getGroupMembers(memberIds: string[]): Promise<UserProfile[]> {
  if (memberIds.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < memberIds.length; i += 10) {
      chunks.push(memberIds.slice(i, i + 10));
  }
  let users: UserProfile[] = [];
  for (const chunk of chunks) {
      const snap = await db.collection('users').where('uid', 'in', chunk).get();
      users.push(...snap.docs.map(d => d.data() as UserProfile));
  }
  return users;
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
  if (!user) return;
  const groupDoc = await db.collection('groups').doc(groupId).get();
  if (!groupDoc.exists) throw new Error("Group not found");
  
  await db.collection('invitations').add({
    groupId,
    groupName: groupDoc.data()?.name,
    fromId: user.uid,
    fromName: user.displayName,
    toEmail: email,
    status: 'pending',
    type: 'group',
    createdAt: Date.now()
  });
}

export async function getPendingInvitations(email: string): Promise<Invitation[]> {
  const snapshot = await db.collection('invitations').where('toEmail', '==', email).where('status', '==', 'pending').get();
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Invitation));
}

export async function respondToInvitation(invitation: Invitation, accept: boolean): Promise<void> {
  const batch = db.batch();
  const inviteRef = db.collection('invitations').doc(invitation.id);
  
  batch.update(inviteRef, { status: accept ? 'accepted' : 'rejected' });
  
  if (accept && invitation.type === 'group' && invitation.groupId) {
      const user = auth.currentUser;
      if (user) {
          const groupRef = db.collection('groups').doc(invitation.groupId);
          batch.update(groupRef, { memberIds: firebase.firestore.FieldValue.arrayUnion(user.uid) });
          const userRef = db.collection('users').doc(user.uid);
          batch.update(userRef, { groups: firebase.firestore.FieldValue.arrayUnion(invitation.groupId) });
      }
  }
  
  await batch.commit();
}

// --- Stats & Admin ---

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

export async function getDebugCollectionDocs(collectionName: string, limit: number): Promise<any[]> {
  const snapshot = await db.collection(collectionName).limit(limit).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// --- Daily Words ---

export async function saveSavedWord(uid: string, wordData: any): Promise<void> {
  await db.collection('users').doc(uid).collection('saved_words').doc(wordData.word).set(wordData);
}

export async function getSavedWordForUser(uid: string, word: string): Promise<any | null> {
  const doc = await db.collection('users').doc(uid).collection('saved_words').doc(word).get();
  return doc.exists ? doc.data() : null;
}

// --- Cloud & Code Studio ---

export async function listCloudDirectory(path: string): Promise<CloudItem[]> {
  const snapshot = await db.collection('code_files').where('path', '>=', path).where('path', '<=', path + '\uf8ff').get();
  
  const items = new Map<string, CloudItem>();
  
  snapshot.docs.forEach(doc => {
      const data = doc.data();
      const relativePath = data.path.replace(path + '/', '');
      const parts = relativePath.split('/');
      const name = parts[0];
      
      if (!name) return;
      
      if (parts.length === 1) {
          items.set(name, { name, fullPath: data.path, isFolder: false, url: data.downloadUrl });
      } else {
          items.set(name, { name, fullPath: `${path}/${name}`, isFolder: true });
      }
  });
  
  return Array.from(items.values());
}

export async function saveProjectToCloud(parentPath: string, name: string, content: string): Promise<void> {
  const fullPath = `${parentPath}/${name}`.replace(/\/+/g, '/');
  await db.collection('code_files').doc(fullPath.replace(/\//g, '_')).set({
      path: fullPath,
      name,
      content,
      updatedAt: Date.now()
  });
}

export async function deleteCloudItem(item: CloudItem): Promise<void> {
  if (item.isFolder) {
      const snapshot = await db.collection('code_files').where('path', '>=', item.fullPath).where('path', '<=', item.fullPath + '\uf8ff').get();
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
  } else {
      await db.collection('code_files').doc(item.fullPath.replace(/\//g, '_')).delete();
  }
}

export async function createCloudFolder(parentPath: string, name: string): Promise<void> {
  await saveProjectToCloud(`${parentPath}/${name}`, '.keep', '');
}

export async function moveCloudFile(oldPath: string, newPath: string): Promise<void> {
  const docId = oldPath.replace(/\//g, '_');
  const doc = await db.collection('code_files').doc(docId).get();
  if (doc.exists) {
      const data = doc.data();
      const newDocId = newPath.replace(/\//g, '_');
      const batch = db.batch();
      batch.set(db.collection('code_files').doc(newDocId), { ...data, path: newPath, name: newPath.split('/').pop() });
      batch.delete(db.collection('code_files').doc(docId));
      await batch.commit();
  }
}

// --- Code Studio Realtime ---

export function subscribeToCodeProject(projectId: string, callback: (project: CodeProject) => void) {
  return db.collection('code_projects').doc(projectId).onSnapshot(doc => {
      if (doc.exists) {
          callback({ id: doc.id, ...doc.data() } as CodeProject);
      }
  });
}

export async function saveCodeProject(project: CodeProject): Promise<void> {
  await db.collection('code_projects').doc(project.id).set(project, { merge: true });
}

export async function updateCodeFile(projectId: string, file: CodeFile): Promise<void> {
  const projectRef = db.collection('code_projects').doc(projectId);
  await db.runTransaction(async (t) => {
      const doc = await t.get(projectRef);
      if (!doc.exists) return;
      const data = doc.data() as CodeProject;
      const files = data.files || [];
      const index = files.findIndex(f => (f.path || f.name) === (file.path || file.name));
      if (index > -1) {
          files[index] = file;
      } else {
          files.push(file);
      }
      t.update(projectRef, { files, lastModified: Date.now() });
  });
}

export async function deleteCodeFile(projectId: string, fileName: string): Promise<void> {
  const projectRef = db.collection('code_projects').doc(projectId);
  await db.runTransaction(async (t) => {
      const doc = await t.get(projectRef);
      if (!doc.exists) return;
      const data = doc.data() as CodeProject;
      const files = (data.files || []).filter(f => (f.path || f.name) !== fileName && f.name !== fileName);
      t.update(projectRef, { files, lastModified: Date.now() });
  });
}

export async function updateCursor(projectId: string, cursor: CursorPosition): Promise<void> {
  await db.collection('code_projects').doc(projectId).update({
      [`cursors.${cursor.clientId}`]: cursor
  });
}

export async function claimCodeProjectLock(projectId: string, clientId: string, name: string): Promise<void> {
  await db.collection('code_projects').doc(projectId).update({
      activeClientId: clientId,
      activeWriterName: name,
      lastModified: Date.now()
  });
}

export async function updateProjectActiveFile(projectId: string, filePath: string): Promise<void> {
  await db.collection('code_projects').doc(projectId).update({ activeFilePath: filePath });
}

export async function updateProjectAccess(projectId: string, level: 'public' | 'restricted', allowedUids?: string[]): Promise<void> {
  await db.collection('code_projects').doc(projectId).update({
      accessLevel: level,
      allowedUserIds: allowedUids || []
  });
}

export async function sendShareNotification(uid: string, type: string, link: string, senderName: string): Promise<void> {
  await db.collection('invitations').add({
      toEmail: '',
      toUid: uid,
      type: 'session',
      link,
      groupName: `${senderName} shared a ${type} Session`,
      fromName: senderName,
      status: 'pending',
      createdAt: Date.now()
  });
}

// --- Whiteboard ---

export async function saveWhiteboardSession(sessionId: string, elements: WhiteboardElement[]): Promise<void> {
  await db.collection('whiteboards').doc(sessionId).set({ elements }, { merge: true });
}

export function subscribeToWhiteboard(sessionId: string, callback: (elements: WhiteboardElement[]) => void) {
  return db.collection('whiteboards').doc(sessionId).onSnapshot(doc => {
      if (doc.exists) {
          callback(doc.data()?.elements || []);
      }
  });
}

export async function updateWhiteboardElement(sessionId: string, element: WhiteboardElement): Promise<void> {
  const ref = db.collection('whiteboards').doc(sessionId);
  await db.runTransaction(async (t) => {
      const doc = await t.get(ref);
      if (!doc.exists) {
          t.set(ref, { elements: [element] });
          return;
      }
      const elements = doc.data()?.elements as WhiteboardElement[];
      const idx = elements.findIndex(e => e.id === element.id);
      if (idx > -1) elements[idx] = element;
      else elements.push(element);
      t.update(ref, { elements });
  });
}

export async function deleteWhiteboardElements(sessionId: string, ids: string[]): Promise<void> {
  const ref = db.collection('whiteboards').doc(sessionId);
  await db.runTransaction(async (t) => {
      const doc = await t.get(ref);
      if (!doc.exists) return;
      const elements = (doc.data()?.elements as WhiteboardElement[]).filter(e => !ids.includes(e.id));
      t.update(ref, { elements });
  });
}

// --- Blog ---

export async function ensureUserBlog(user: any): Promise<any> {
  const snap = await db.collection('blogs').where('userId', '==', user.uid).get();
  if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
  
  const newBlog = {
      userId: user.uid,
      title: `${user.displayName}'s Blog`,
      description: 'Thoughts on tech and life.'
  };
  const ref = await db.collection('blogs').add(newBlog);
  return { id: ref.id, ...newBlog };
}

export async function getCommunityPosts(): Promise<BlogPost[]> {
  const snap = await db.collection('blog_posts').where('status', '==', 'published').orderBy('publishedAt', 'desc').limit(50).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as BlogPost));
}

export async function getUserPosts(blogId: string): Promise<BlogPost[]> {
  const snap = await db.collection('blog_posts').where('blogId', '==', blogId).orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as BlogPost));
}

export async function createBlogPost(post: Partial<BlogPost>): Promise<void> {
  await db.collection('blog_posts').add(post);
}

export async function updateBlogPost(id: string, post: Partial<BlogPost>): Promise<void> {
  await db.collection('blog_posts').doc(id).update(post);
}

export async function deleteBlogPost(id: string): Promise<void> {
  await db.collection('blog_posts').doc(id).delete();
}

export async function updateBlogSettings(blogId: string, settings: any): Promise<void> {
  await db.collection('blogs').doc(blogId).update(settings);
}

export async function addPostComment(postId: string, comment: Comment): Promise<void> {
  await db.collection('blog_posts').doc(postId).update({
      comments: firebase.firestore.FieldValue.arrayUnion(comment),
      commentCount: firebase.firestore.FieldValue.increment(1)
  });
}

export async function getBlogPost(id: string): Promise<BlogPost | null> {
  const doc = await db.collection('blog_posts').doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } as BlogPost : null;
}

// --- Payment (Stripe) ---

export async function createStripeCheckoutSession(uid: string): Promise<string> {
  const docRef = await db.collection('customers').doc(uid).collection('checkout_sessions').add({
      price: 'price_1Q...', 
      success_url: window.location.origin,
      cancel_url: window.location.origin,
  });
  
  return new Promise((resolve, reject) => {
      docRef.onSnapshot(snap => {
          const { error, url } = snap.data() || {};
          if (error) reject(new Error(error.message));
          if (url) resolve(url);
      });
  });
}

export async function createStripePortalSession(uid: string): Promise<string> {
  throw new Error("Portal not configured");
}

export async function forceUpgradeDebug(uid: string): Promise<void> {
  await db.collection('users').doc(uid).update({ subscriptionTier: 'pro' });
}

export async function getBillingHistory(uid: string): Promise<any[]> {
  return [
      { date: '2024-05-01', amount: 29.00, status: 'paid' }
  ];
}

// --- Workplace Chat ---

export async function sendMessage(channelId: string, text: string, collectionPath: string, replyTo?: any, attachments?: any[]): Promise<void> {
  await db.collection(collectionPath).add({
      text,
      senderId: auth.currentUser?.uid,
      senderName: auth.currentUser?.displayName || 'User',
      senderImage: auth.currentUser?.photoURL,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      replyTo: replyTo || null,
      attachments: attachments || []
  });
}

export function subscribeToMessages(channelId: string, callback: (msgs: RealTimeMessage[]) => void, collectionPath: string) {
  return db.collection(collectionPath).orderBy('timestamp', 'asc').limit(100).onSnapshot(snap => {
      const msgs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RealTimeMessage));
      callback(msgs);
  });
}

export async function deleteMessage(channelId: string, msgId: string, collectionPath: string): Promise<void> {
  await db.collection(collectionPath).doc(msgId).delete();
}

export async function createOrGetDMChannel(otherUid: string, otherName: string): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No user");
  
  const ids = [uid, otherUid].sort();
  const chatId = ids.join('_');
  
  const ref = db.collection('chat_channels').doc(chatId);
  const doc = await ref.get();
  
  if (!doc.exists) {
      await ref.set({
          id: chatId,
          type: 'dm',
          participants: ids,
          name: `${auth.currentUser?.displayName} & ${otherName}`
      });
  }
  return chatId;
}

export async function getUserDMChannels(): Promise<ChatChannel[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const snap = await db.collection('chat_channels').where('participants', 'array-contains', uid).get();
  return snap.docs.map(d => d.data() as ChatChannel);
}

export async function getUniqueGroupMembers(groupId: string): Promise<UserProfile[]> {
  const group = await db.collection('groups').doc(groupId).get();
  if (!group.exists) return [];
  const memberIds = group.data()?.memberIds || [];
  return getGroupMembers(memberIds);
}

// --- Career Center ---

export async function submitCareerApplication(app: CareerApplication): Promise<void> {
  await db.collection('career_applications').add(app);
}

export async function uploadResumeToStorage(uid: string, file: File): Promise<string> {
  const ref = storage.ref(`resumes/${uid}_${Date.now()}_${file.name}`);
  await ref.put(file);
  return await ref.getDownloadURL();
}

export async function createJobPosting(job: JobPosting): Promise<void> {
  await db.collection('job_postings').add(job);
}

export async function getJobPostings(): Promise<JobPosting[]> {
  const snap = await db.collection('job_postings').orderBy('postedAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as JobPosting));
}

export async function getAllCareerApplications(): Promise<CareerApplication[]> {
  const snap = await db.collection('career_applications').orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CareerApplication));
}