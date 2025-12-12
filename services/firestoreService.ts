
import { db, auth, storage } from './firebaseConfig';
import firebase from 'firebase/compat/app';
import { 
  Channel, UserProfile, CommunityDiscussion, GeneratedLecture, Chapter, 
  Booking, Invitation, Group, RecordingSession, Attachment, Comment, 
  BlogPost, Blog, RealTimeMessage, ChatChannel, CareerApplication, 
  JobPosting, CodeProject, WhiteboardElement, CodeFile, SubscriptionTier, CursorPosition, CloudItem, GlobalStats
} from '../types';
import { HANDCRAFTED_CHANNELS } from '../utils/initialData';

// --- USERS & PROFILES ---

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const doc = await db.collection('users').doc(uid).get();
  return doc.exists ? (doc.data() as UserProfile) : null;
}

export async function getGlobalStats(): Promise<GlobalStats> {
  const doc = await db.collection('stats').doc('global').get();
  if (!doc.exists) return { totalLogins: 0, uniqueUsers: 0 };
  
  const data = doc.data();
  return {
      totalLogins: data?.totalLogins || 0,
      uniqueUsers: data?.uniqueUsers || 0
  };
}

export async function recalculateGlobalStats(): Promise<number> {
  // 1. Count Users
  const usersSnap = await db.collection('users').get();
  const userCount = usersSnap.size;

  // 2. Update Global Stats
  await db.collection('stats').doc('global').set({
      uniqueUsers: userCount
  }, { merge: true });

  return userCount;
}

export async function syncUserProfile(user: firebase.User): Promise<void> {
  const userRef = db.collection('users').doc(user.uid);
  const doc = await userRef.get();
  
  const userData: Partial<UserProfile> = {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || 'User',
    photoURL: user.photoURL || '',
    lastLogin: Date.now()
  };

  if (!doc.exists) {
    await userRef.set({
      ...userData,
      createdAt: Date.now(),
      groups: [],
      apiUsageCount: 0,
      subscriptionTier: 'free'
    });
    
    // Increment Unique Users Count Global Stats
    const statsRef = db.collection('stats').doc('global');
    try {
        await statsRef.set({
            uniqueUsers: firebase.firestore.FieldValue.increment(1)
        }, { merge: true });
    } catch (e) {
        console.error("Failed to increment unique users stat:", e);
    }

  } else {
    await userRef.update(userData);
  }
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

export async function incrementApiUsage(uid: string): Promise<void> {
  const userRef = db.collection('users').doc(uid);
  await userRef.update({
    apiUsageCount: firebase.firestore.FieldValue.increment(1)
  });
}

export async function logUserActivity(type: string, data: any): Promise<void> {
  await db.collection('activity_logs').add({
    type,
    data,
    timestamp: Date.now(),
    userId: auth.currentUser?.uid || 'anonymous'
  });

  // Increment Total Logins Global Stats
  if (type === 'login') {
      const statsRef = db.collection('stats').doc('global');
      try {
          await statsRef.set({
              totalLogins: firebase.firestore.FieldValue.increment(1)
          }, { merge: true });
      } catch (e) {
          console.error("Failed to increment login stat:", e);
      }
  }
}

export function setupSubscriptionListener(uid: string, callback: (tier: SubscriptionTier) => void): () => void {
  return db.collection('users').doc(uid).onSnapshot(doc => {
    const data = doc.data() as UserProfile;
    if (data && data.subscriptionTier) {
      callback(data.subscriptionTier);
    }
  });
}

// --- CHANNELS & CONTENT ---

export async function publishChannelToFirestore(channel: Channel): Promise<void> {
  await db.collection('channels').doc(channel.id).set(channel);
}

export async function getPublicChannels(): Promise<Channel[]> {
  const snapshot = await db.collection('channels')
    .where('visibility', '==', 'public')
    .get();
  return snapshot.docs.map(doc => doc.data() as Channel);
}

export function subscribeToPublicChannels(
  onUpdate: (channels: Channel[]) => void, 
  onError?: (error: any) => void
): () => void {
  return db.collection('channels')
    .where('visibility', '==', 'public')
    .onSnapshot(
      snapshot => {
        const channels = snapshot.docs.map(doc => doc.data() as Channel);
        onUpdate(channels);
      },
      error => {
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
    const snapshot = await db.collection('channels')
      .where('visibility', '==', 'group')
      .where('groupId', 'in', chunk)
      .get();
    allChannels = [...allChannels, ...snapshot.docs.map(doc => doc.data() as Channel)];
  }
  return allChannels;
}

export async function deleteChannelFromFirestore(channelId: string): Promise<void> {
  await db.collection('channels').doc(channelId).delete();
}

export async function voteChannel(channelId: string, type: 'like' | 'dislike'): Promise<void> {
  const ref = db.collection('channels').doc(channelId);
  if (type === 'like') {
    await ref.update({ likes: firebase.firestore.FieldValue.increment(1) });
  } else {
    await ref.update({ dislikes: firebase.firestore.FieldValue.increment(1) });
  }
}

export async function addCommentToChannel(channelId: string, comment: Comment): Promise<void> {
  const ref = db.collection('channels').doc(channelId);
  await ref.update({
    comments: firebase.firestore.FieldValue.arrayUnion(comment)
  });
}

export async function updateCommentInChannel(channelId: string, comment: Comment): Promise<void> {
  const ref = db.collection('channels').doc(channelId);
  const doc = await ref.get();
  if (doc.exists) {
    const channel = doc.data() as Channel;
    const updatedComments = channel.comments.map(c => c.id === comment.id ? comment : c);
    await ref.update({ comments: updatedComments });
  }
}

export async function deleteCommentFromChannel(channelId: string, commentId: string): Promise<void> {
  const ref = db.collection('channels').doc(channelId);
  const doc = await ref.get();
  if (doc.exists) {
    const channel = doc.data() as Channel;
    const updatedComments = channel.comments.filter(c => c.id !== commentId);
    await ref.update({ comments: updatedComments });
  }
}

export async function addChannelAttachment(channelId: string, attachment: Attachment): Promise<void> {
  const ref = db.collection('channels').doc(channelId);
  await ref.update({
    appendix: firebase.firestore.FieldValue.arrayUnion(attachment)
  });
}

// --- LECTURES & CURRICULUM ---

export async function saveLectureToFirestore(channelId: string, lectureId: string, lecture: GeneratedLecture): Promise<void> {
  await db.collection('lectures').doc(lectureId).set({
    ...lecture,
    channelId,
    updatedAt: Date.now()
  });
}

export async function getLectureFromFirestore(channelId: string, lectureId: string): Promise<GeneratedLecture | null> {
  const doc = await db.collection('lectures').doc(lectureId).get();
  return doc.exists ? (doc.data() as GeneratedLecture) : null;
}

export async function deleteLectureFromFirestore(channelId: string, lectureId: string): Promise<void> {
  await db.collection('lectures').doc(lectureId).delete();
}

export async function saveCurriculumToFirestore(channelId: string, curriculum: Chapter[]): Promise<void> {
  await db.collection('channels').doc(channelId).update({
    chapters: curriculum
  });
}

export async function getCurriculumFromFirestore(channelId: string): Promise<Chapter[] | null> {
  const doc = await db.collection('channels').doc(channelId).get();
  if (doc.exists) {
    return (doc.data() as Channel).chapters || null;
  }
  return null;
}

// --- DISCUSSIONS & DOCS ---

export async function saveDiscussion(discussion: CommunityDiscussion): Promise<string> {
  const docRef = discussion.id 
    ? db.collection('discussions').doc(discussion.id)
    : db.collection('discussions').doc();
  
  const data = { ...discussion, id: docRef.id };
  await docRef.set(data);
  return docRef.id;
}

export async function updateDiscussion(discussionId: string, transcript: any[]): Promise<void> {
  await db.collection('discussions').doc(discussionId).update({
    transcript,
    updatedAt: Date.now()
  });
}

export async function getDiscussionById(discussionId: string): Promise<CommunityDiscussion | null> {
  const doc = await db.collection('discussions').doc(discussionId).get();
  return doc.exists ? (doc.data() as CommunityDiscussion) : null;
}

export async function saveDiscussionDesignDoc(discussionId: string, docContent: string, title?: string): Promise<void> {
  const updates: any = { designDoc: docContent };
  if (title) updates.title = title;
  await db.collection('discussions').doc(discussionId).update(updates);
}

export async function linkDiscussionToLectureSegment(channelId: string, lectureId: string, segmentIndex: number, discussionId: string): Promise<void> {
  // Logic to link discussion to lecture segment
}

export async function getUserDesignDocs(uid: string): Promise<CommunityDiscussion[]> {
  const snapshot = await db.collection('discussions')
    .where('userId', '==', uid)
    .orderBy('createdAt', 'desc')
    .get();
  return snapshot.docs.map(doc => doc.data() as CommunityDiscussion);
}

// --- GROUPS ---

export async function createGroup(name: string): Promise<string> {
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
    groups: firebase.firestore.FieldValue.arrayUnion(groupRef.id)
  });
  return groupRef.id;
}

export async function getUserGroups(uid: string): Promise<Group[]> {
  const snapshot = await db.collection('groups').where('memberIds', 'array-contains', uid).get();
  return snapshot.docs.map(doc => doc.data() as Group);
}

export async function getGroupMembers(memberIds: string[]): Promise<UserProfile[]> {
  const chunks = [];
  for (let i = 0; i < memberIds.length; i += 10) {
    chunks.push(memberIds.slice(i, i + 10));
  }
  let members: UserProfile[] = [];
  for (const chunk of chunks) {
    const snapshot = await db.collection('users').where('uid', 'in', chunk).get();
    members = [...members, ...snapshot.docs.map(doc => doc.data() as UserProfile)];
  }
  return members;
}

export async function sendInvitation(groupId: string, toEmail: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Must be logged in");
  
  const groupDoc = await db.collection('groups').doc(groupId).get();
  const groupName = groupDoc.exists ? groupDoc.data()?.name : 'Group';

  await db.collection('invitations').add({
    fromUserId: user.uid,
    fromName: user.displayName || 'User',
    toEmail,
    groupId,
    groupName,
    status: 'pending',
    createdAt: Date.now()
  });
}

export async function getPendingInvitations(email: string): Promise<Invitation[]> {
  const snapshot = await db.collection('invitations')
    .where('toEmail', '==', email)
    .where('status', '==', 'pending')
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invitation));
}

export async function respondToInvitation(invitation: Invitation, accept: boolean): Promise<void> {
  const batch = db.batch();
  const invRef = db.collection('invitations').doc(invitation.id);
  batch.update(invRef, { status: accept ? 'accepted' : 'rejected' });
  if (accept) {
    const user = auth.currentUser;
    if (user) {
        const groupRef = db.collection('groups').doc(invitation.groupId);
        batch.update(groupRef, {
            memberIds: firebase.firestore.FieldValue.arrayUnion(user.uid)
        });
        const userRef = db.collection('users').doc(user.uid);
        batch.update(userRef, {
            groups: firebase.firestore.FieldValue.arrayUnion(invitation.groupId)
        });
    }
  }
  await batch.commit();
}

export async function removeMemberFromGroup(groupId: string, memberId: string): Promise<void> {
  const batch = db.batch();
  const groupRef = db.collection('groups').doc(groupId);
  batch.update(groupRef, {
    memberIds: firebase.firestore.FieldValue.arrayRemove(memberId)
  });
  const userRef = db.collection('users').doc(memberId);
  batch.update(userRef, {
    groups: firebase.firestore.FieldValue.arrayRemove(groupId)
  });
  await batch.commit();
}

export async function getUniqueGroupMembers(groupIds: string[]): Promise<UserProfile[]> {
    if (groupIds.length === 0) return [];
    const groupSnapshots = await Promise.all(groupIds.map(id => db.collection('groups').doc(id).get()));
    const allMemberIds = new Set<string>();
    groupSnapshots.forEach(snap => {
        if (snap.exists) {
            const data = snap.data() as Group;
            data.memberIds.forEach(id => allMemberIds.add(id));
        }
    });
    const ids = Array.from(allMemberIds);
    if (ids.length === 0) return [];
    return getGroupMembers(ids);
}

// --- BOOKINGS ---

export async function createBooking(booking: Booking): Promise<void> {
  const ref = db.collection('bookings').doc();
  await ref.set({ ...booking, id: ref.id });
}

export async function getUserBookings(uid: string, email: string): Promise<Booking[]> {
  const creatorQuery = db.collection('bookings').where('userId', '==', uid);
  const inviteeQuery = db.collection('bookings').where('invitedEmail', '==', email);
  const [creatorSnap, inviteeSnap] = await Promise.all([creatorQuery.get(), inviteeQuery.get()]);
  const bookings = new Map<string, Booking>();
  creatorSnap.docs.forEach(doc => bookings.set(doc.id, doc.data() as Booking));
  inviteeSnap.docs.forEach(doc => bookings.set(doc.id, doc.data() as Booking));
  return Array.from(bookings.values());
}

export async function getPendingBookings(email: string): Promise<Booking[]> {
  const snapshot = await db.collection('bookings')
    .where('invitedEmail', '==', email)
    .where('status', '==', 'pending')
    .get();
  return snapshot.docs.map(doc => doc.data() as Booking);
}

export async function respondToBooking(bookingId: string, accept: boolean): Promise<void> {
  await db.collection('bookings').doc(bookingId).update({
    status: accept ? 'scheduled' : 'rejected'
  });
}

export async function cancelBooking(bookingId: string): Promise<void> {
  await db.collection('bookings').doc(bookingId).update({
    status: 'cancelled'
  });
}

export async function updateBookingInvite(bookingId: string, email: string): Promise<void> {
  await db.collection('bookings').doc(bookingId).update({
    invitedEmail: email
  });
}

// --- RECORDINGS ---

export async function saveRecordingReference(session: RecordingSession): Promise<void> {
  const ref = db.collection('recordings').doc();
  await ref.set({ ...session, id: ref.id });
}

export async function getUserRecordings(uid: string): Promise<RecordingSession[]> {
  const snapshot = await db.collection('recordings').where('userId', '==', uid).orderBy('timestamp', 'desc').get();
  return snapshot.docs.map(doc => doc.data() as RecordingSession);
}

export async function deleteBookingRecording(bookingId: string, mediaUrl?: string, transcriptUrl?: string): Promise<void> {
  await db.collection('bookings').doc(bookingId).update({
    recordingUrl: firebase.firestore.FieldValue.delete(),
    transcriptUrl: firebase.firestore.FieldValue.delete()
  });
  if (mediaUrl) try { await storage.refFromURL(mediaUrl).delete(); } catch(e) {}
  if (transcriptUrl) try { await storage.refFromURL(transcriptUrl).delete(); } catch(e) {}
}

export async function updateBookingRecording(bookingId: string, mediaUrl: string, transcriptUrl: string) {
  await db.collection('bookings').doc(bookingId).update({
    recordingUrl: mediaUrl,
    transcriptUrl: transcriptUrl,
    status: 'completed'
  });
}

export async function deleteRecordingReference(id: string, mediaUrl: string, transcriptUrl: string): Promise<void> {
  await db.collection('recordings').doc(id).delete();
  try { await storage.refFromURL(mediaUrl).delete(); } catch(e) {}
  try { await storage.refFromURL(transcriptUrl).delete(); } catch(e) {}
}

// --- STORAGE ---

export async function uploadFileToStorage(path: string, file: Blob | File, metadata?: any): Promise<string> {
  const ref = storage.ref(path);
  await ref.put(file, metadata);
  return await ref.getDownloadURL();
}

export async function uploadCommentAttachment(file: File, path: string): Promise<string> {
  return uploadFileToStorage(path, file);
}

export async function uploadResumeToStorage(uid: string, file: File): Promise<string> {
  const ref = storage.ref(`resumes/${uid}/${Date.now()}_${file.name}`);
  await ref.put(file);
  return await ref.getDownloadURL();
}

export async function moveCloudFile(oldPath: string, newPath: string, contentType: string = 'text/plain'): Promise<void> {
    const oldRef = storage.ref(oldPath);
    const newRef = storage.ref(newPath);
    const url = await oldRef.getDownloadURL();
    const metadata = await oldRef.getMetadata();
    const res = await fetch(url);
    const blob = await res.blob();
    await newRef.put(blob, { contentType: metadata.contentType || contentType, customMetadata: metadata.customMetadata });
    await oldRef.delete();
}

export async function saveProjectToCloud(path: string, filename: string, content: string | Blob, originalName?: string): Promise<void> {
    // Sanitize path to prevent double slashes or leading/trailing slash issues that might cause permission errors.
    // Ensure path doesn't start with / unless intended (Storage usually relative to bucket root).
    const cleanPath = path.replace(/^\/+/, '').replace(/\/+$/, '');
    const cleanFilename = filename.replace(/^\/+/, ''); // Remove leading slash from filename if present
    const ref = storage.ref(`${cleanPath}/${cleanFilename}`);
    
    // Auto-detect content type based on extension if content is string
    let contentType = 'text/plain';
    if (typeof content !== 'string') {
        contentType = content.type || 'application/octet-stream';
    } else {
        const lower = filename.toLowerCase();
        if (lower.endsWith('.js') || lower.endsWith('.jsx')) contentType = 'text/javascript';
        else if (lower.endsWith('.ts') || lower.endsWith('.tsx')) contentType = 'application/x-typescript';
        else if (lower.endsWith('.html')) contentType = 'text/html';
        else if (lower.endsWith('.css')) contentType = 'text/css';
        else if (lower.endsWith('.json')) contentType = 'application/json';
        else if (lower.endsWith('.md')) contentType = 'text/markdown';
        else if (lower.endsWith('.py')) contentType = 'text/x-python';
        else if (lower.endsWith('.cpp') || lower.endsWith('.c') || lower.endsWith('.h')) contentType = 'text/x-c';
    }

    const metadata = { contentType, customMetadata: { originalName: originalName || filename, timestamp: String(Date.now()) } };
    
    if (typeof content === 'string') {
        const blob = new Blob([content], { type: contentType });
        await ref.put(blob, metadata);
    } else {
        await ref.put(content, metadata);
    }
}

// --- CLOUD FILE OPS ---

export async function listCloudDirectory(path: string): Promise<CloudItem[]> {
  const ref = storage.ref(path);
  const res = await ref.listAll();
  
  const folders = res.prefixes.map(p => ({
    name: p.name,
    fullPath: p.fullPath,
    isFolder: true,
    url: ''
  }));

  const files = await Promise.all(res.items.map(async (item) => {
    const url = await item.getDownloadURL();
    let size = 0;
    let timeCreated = '';
    let contentType = '';
    
    try {
        const meta = await item.getMetadata();
        size = meta.size;
        timeCreated = meta.timeCreated;
        contentType = meta.contentType || '';
    } catch(e) {}

    return {
      name: item.name,
      fullPath: item.fullPath,
      isFolder: false,
      url,
      size,
      timeCreated,
      contentType
    };
  }));

  return [...folders, ...files];
}

export async function createCloudFolder(path: string, folderName: string): Promise<void> {
   const cleanPath = path.replace(/\/+$/, '');
   const ref = storage.ref(`${cleanPath}/${folderName}/.keep`);
   await ref.putString(''); 
}

export async function deleteCloudItem(item: CloudItem): Promise<void> {
    if (item.isFolder) {
        await deleteFolderRecursive(item.fullPath);
    } else {
        await storage.ref(item.fullPath).delete();
    }
}

async function deleteFolderRecursive(path: string) {
    const ref = storage.ref(path);
    const list = await ref.listAll();
    await Promise.all(list.items.map(i => i.delete()));
    await Promise.all(list.prefixes.map(p => deleteFolderRecursive(p.fullPath)));
}

// --- CHAT ---

export async function sendMessage(channelId: string, text: string, collectionPath: string, replyTo?: any, attachments?: any[]): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Must be logged in");
  
  await db.collection(collectionPath).add({
    text,
    senderId: user.uid,
    senderName: user.displayName || 'User',
    senderImage: user.photoURL || '',
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    replyTo: replyTo || null,
    attachments: attachments || []
  });
  
  if (collectionPath.includes('chat_channels')) {
      await db.collection('chat_channels').doc(channelId).update({
          lastMessage: {
              text,
              senderName: user.displayName,
              timestamp: Date.now()
          }
      });
  }
}

export function subscribeToMessages(channelId: string, onUpdate: (msgs: RealTimeMessage[]) => void, collectionPath: string): () => void {
  return db.collection(collectionPath)
    .orderBy('timestamp', 'asc')
    .limit(100)
    .onSnapshot(snapshot => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RealTimeMessage));
      onUpdate(msgs);
    });
}

export async function deleteMessage(channelId: string, messageId: string, collectionPath: string): Promise<void> {
  await db.collection(collectionPath).doc(messageId).delete();
}

export async function createOrGetDMChannel(otherUserId: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Must be logged in");
  
  const participants = [user.uid, otherUserId].sort();
  const channelId = `dm_${participants.join('_')}`;
  
  const docRef = db.collection('chat_channels').doc(channelId);
  const doc = await docRef.get();
  
  if (!doc.exists) {
      const otherUser = await getUserProfile(otherUserId);
      const name = `${user.displayName} & ${otherUser?.displayName || 'User'}`;
      await docRef.set({
          id: channelId,
          name,
          type: 'dm',
          memberIds: participants,
          createdAt: Date.now()
      });
  }
  return channelId;
}

export async function getUserDMChannels(): Promise<ChatChannel[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const snapshot = await db.collection('chat_channels')
    .where('type', '==', 'dm')
    .where('memberIds', 'array-contains', user.uid)
    .get();
  return snapshot.docs.map(doc => doc.data() as ChatChannel);
}

// --- BLOG ---

export async function ensureUserBlog(user: any): Promise<Blog> {
  const snapshot = await db.collection('blogs').where('ownerId', '==', user.uid).limit(1).get();
  if (!snapshot.empty) {
      return snapshot.docs[0].data() as Blog;
  }
  const blogRef = db.collection('blogs').doc();
  const newBlog: Blog = {
      id: blogRef.id,
      ownerId: user.uid,
      authorName: user.displayName || 'Author',
      title: `${user.displayName}'s Blog`,
      description: 'Thoughts on tech and life.',
      createdAt: Date.now()
  };
  await blogRef.set(newBlog);
  return newBlog;
}

export async function getCommunityPosts(): Promise<BlogPost[]> {
  const snapshot = await db.collection('blog_posts')
    .where('status', '==', 'published')
    .orderBy('publishedAt', 'desc')
    .limit(20)
    .get();
  return snapshot.docs.map(doc => doc.data() as BlogPost);
}

export async function getUserPosts(blogId: string): Promise<BlogPost[]> {
  const snapshot = await db.collection('blog_posts')
    .where('blogId', '==', blogId)
    .orderBy('createdAt', 'desc')
    .get();
  return snapshot.docs.map(doc => doc.data() as BlogPost);
}

export async function createBlogPost(post: BlogPost): Promise<void> {
  const ref = db.collection('blog_posts').doc();
  await ref.set({ ...post, id: ref.id });
}

export async function updateBlogPost(postId: string, updates: Partial<BlogPost>): Promise<void> {
  await db.collection('blog_posts').doc(postId).update(updates);
}

export async function deleteBlogPost(postId: string): Promise<void> {
  await db.collection('blog_posts').doc(postId).delete();
}

export async function updateBlogSettings(blogId: string, settings: { title: string, description: string }): Promise<void> {
  await db.collection('blogs').doc(blogId).update(settings);
}

export async function getBlogPost(postId: string): Promise<BlogPost | null> {
  const doc = await db.collection('blog_posts').doc(postId).get();
  return doc.exists ? (doc.data() as BlogPost) : null;
}

export async function addPostComment(postId: string, comment: Comment): Promise<void> {
  const ref = db.collection('blog_posts').doc(postId);
  await ref.update({
      comments: firebase.firestore.FieldValue.arrayUnion(comment),
      commentCount: firebase.firestore.FieldValue.increment(1)
  });
}

// --- CAREER ---

export async function createJobPosting(job: JobPosting): Promise<void> {
  const ref = db.collection('jobs').doc();
  await ref.set({ ...job, id: ref.id });
}

export async function getJobPostings(): Promise<JobPosting[]> {
  const snapshot = await db.collection('jobs').orderBy('postedAt', 'desc').get();
  return snapshot.docs.map(doc => doc.data() as JobPosting);
}

export async function submitCareerApplication(app: CareerApplication): Promise<void> {
  const ref = db.collection('career_applications').doc();
  await ref.set({ ...app, id: ref.id });
}

export async function getAllCareerApplications(): Promise<CareerApplication[]> {
  const snapshot = await db.collection('career_applications')
    .where('status', 'in', ['pending', 'approved'])
    .orderBy('createdAt', 'desc')
    .get();
  return snapshot.docs.map(doc => doc.data() as CareerApplication);
}

// --- WHITEBOARD ---

export async function saveWhiteboardSession(sessionId: string, elements: WhiteboardElement[]): Promise<void> {
  const batch = db.batch();
  const sessionRef = db.collection('whiteboards').doc(sessionId);
  const elementsRef = sessionRef.collection('elements');
  
  batch.set(sessionRef, { updatedAt: Date.now() }, { merge: true });
  elements.forEach(el => {
      batch.set(elementsRef.doc(el.id), el);
  });
  await batch.commit();
}

export function subscribeToWhiteboard(sessionId: string, onUpdate: (elements: WhiteboardElement[]) => void): () => void {
  return db.collection('whiteboards').doc(sessionId).collection('elements')
    .onSnapshot(snapshot => {
        const elements = snapshot.docs.map(doc => doc.data() as WhiteboardElement);
        onUpdate(elements);
    });
}

export async function updateWhiteboardElement(sessionId: string, element: WhiteboardElement): Promise<void> {
  await db.collection('whiteboards').doc(sessionId).collection('elements').doc(element.id).set(element);
}

export async function deleteWhiteboardElements(sessionId: string, elementIds: string[]): Promise<void> {
  const batch = db.batch();
  elementIds.forEach(id => {
      const ref = db.collection('whiteboards').doc(sessionId).collection('elements').doc(id);
      batch.delete(ref);
  });
  await batch.commit();
}

// --- CODE STUDIO ---

export async function saveCodeProject(project: CodeProject): Promise<void> {
  await db.collection('code_projects').doc(project.id).set(project);
}

export function subscribeToCodeProject(projectId: string, onUpdate: (project: CodeProject) => void): () => void {
    return db.collection('code_projects').doc(projectId).onSnapshot(doc => {
        if (doc.exists) {
            onUpdate({ id: doc.id, ...doc.data() } as CodeProject);
        }
    });
}

export async function updateCodeFile(projectId: string, file: CodeFile): Promise<void> {
  const ref = db.collection('code_projects').doc(projectId);
  await db.runTransaction(async (t) => {
      const doc = await t.get(ref);
      if (!doc.exists) return;
      const project = doc.data() as CodeProject;
      const files = project.files || [];
      const index = files.findIndex(f => (f.path || f.name) === (file.path || file.name));
      if (index > -1) {
          files[index] = file;
      } else {
          files.push(file);
      }
      t.update(ref, { files, lastModified: Date.now() });
  });
}

export async function deleteCodeFile(projectId: string, filePath: string): Promise<void> {
    const ref = db.collection('code_projects').doc(projectId);
    await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) return;
        const project = doc.data() as CodeProject;
        const newFiles = project.files.filter(f => (f.path || f.name) !== filePath);
        t.update(ref, { files: newFiles, lastModified: Date.now() });
    });
}

export async function updateCursor(projectId: string, cursor: CursorPosition): Promise<void> {
    await db.collection('code_projects').doc(projectId).update({
        [`cursors.${cursor.clientId}`]: cursor
    });
}

export async function claimCodeProjectLock(projectId: string, clientId: string, writerName: string): Promise<void> {
    await db.collection('code_projects').doc(projectId).update({
        activeClientId: clientId,
        activeWriterName: writerName,
        lastModified: Date.now()
    });
}

export async function updateProjectActiveFile(projectId: string, filePath: string): Promise<void> {
    await db.collection('code_projects').doc(projectId).update({
        activeFilePath: filePath
    });
}

// --- BILLING & STRIPE ---

export async function createStripeCheckoutSession(uid: string): Promise<string> {
  const docRef = await db.collection('customers').doc(uid).collection('checkout_sessions').add({
    price: 'price_12345',
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
  const functionRef = firebase.functions().httpsCallable('ext-firestore-stripe-payments-createPortalLink');
  const { data } = await functionRef({ returnUrl: window.location.origin });
  return data.url;
}

export async function getBillingHistory(uid: string): Promise<any[]> {
  return [];
}

export async function forceUpgradeDebug(uid: string): Promise<void> {
  await db.collection('users').doc(uid).update({ subscriptionTier: 'pro' });
}

// --- MISC ---

export async function saveSavedWord(uid: string, wordData: any): Promise<void> {
  await db.collection('users').doc(uid).collection('saved_words').doc(wordData.word).set(wordData);
}

export async function getSavedWordForUser(uid: string, word: string): Promise<any | null> {
  const doc = await db.collection('users').doc(uid).collection('saved_words').doc(word).get();
  return doc.exists ? doc.data() : null;
}

export async function getDebugCollectionDocs(collectionName: string, limit: number): Promise<any[]> {
  const snapshot = await db.collection(collectionName).limit(limit).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function seedDatabase(): Promise<void> {
  const batch = db.batch();
  HANDCRAFTED_CHANNELS.forEach(channel => {
      const ref = db.collection('channels').doc(channel.id);
      batch.set(ref, { ...channel, visibility: 'public' }, { merge: true });
  });
  await batch.commit();
}
