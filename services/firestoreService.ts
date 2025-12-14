import { 
  Channel, 
  GeneratedLecture, 
  CommunityDiscussion, 
  RecordingSession, 
  Comment, 
  Group, 
  UserProfile, 
  Chapter,
  Invitation,
  Booking,
  CodeProject,
  CodeFile,
  CursorPosition,
  CloudItem,
  WhiteboardElement,
  BlogPost,
  RealTimeMessage,
  CareerApplication,
  JobPosting,
  ChatChannel,
  SubscriptionTier,
  ChannelStats,
  GlobalStats,
  Notebook
} from '../types';
import { db, auth, storage } from './firebaseConfig';
import firebase from 'firebase/compat/app';
import { HANDCRAFTED_CHANNELS } from '../utils/initialData';

// Collection Constants
const USERS_COLLECTION = 'users';
const CHANNELS_COLLECTION = 'channels';
const CHANNEL_STATS_COLLECTION = 'channel_stats';
const LECTURES_COLLECTION = 'lectures';
const CURRICULUM_COLLECTION = 'curriculums';
const DISCUSSIONS_COLLECTION = 'discussions';
const RECORDINGS_COLLECTION = 'recordings';
const GROUPS_COLLECTION = 'groups';
const INVITATIONS_COLLECTION = 'invitations';
const BOOKINGS_COLLECTION = 'bookings';
const SAVED_WORDS_COLLECTION = 'saved_words';
const PROJECTS_COLLECTION = 'code_projects';
const WHITEBOARDS_COLLECTION = 'whiteboards';
const BLOGS_COLLECTION = 'blogs';
const POSTS_COLLECTION = 'blog_posts';
const JOBS_COLLECTION = 'job_postings';
const APPLICATIONS_COLLECTION = 'career_applications';
const STATS_COLLECTION = 'stats';
const DM_CHANNELS_COLLECTION = 'chat_channels';
const ACTIVITY_LOGS_COLLECTION = 'activity_logs';

// --- User & Profile ---

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const doc = await db.collection(USERS_COLLECTION).doc(uid).get();
    if (doc.exists) {
      return doc.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }
}

export async function syncUserProfile(user: firebase.User): Promise<void> {
  const userRef = db.collection(USERS_COLLECTION).doc(user.uid);
  const doc = await userRef.get();
  
  const userData: Partial<UserProfile> = {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || 'Anonymous',
    photoURL: user.photoURL || '',
    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (!doc.exists) {
    // New User
    await userRef.set({
      ...userData,
      createdAt: Date.now(),
      groups: [],
      apiUsageCount: 0,
      subscriptionTier: 'free'
    });
    // Increment global user count
    const statsRef = db.collection(STATS_COLLECTION).doc('global');
    await statsRef.set({ uniqueUsers: firebase.firestore.FieldValue.increment(1) }, { merge: true });
  } else {
    // Update existing
    await userRef.update(userData);
  }
}

export async function updateUserProfile(uid: string, data: Partial<UserProfile>) {
    await db.collection(USERS_COLLECTION).doc(uid).update(data);
}

export async function getAllUsers(): Promise<UserProfile[]> {
    const snap = await db.collection(USERS_COLLECTION).limit(100).get(); // Limit for safety
    return snap.docs.map(d => d.data() as UserProfile);
}

export async function getUserProfileByEmail(email: string): Promise<UserProfile | null> {
    const snap = await db.collection(USERS_COLLECTION).where('email', '==', email).limit(1).get();
    if (!snap.empty) {
        return snap.docs[0].data() as UserProfile;
    }
    return null;
}

export async function incrementApiUsage(uid: string) {
    const userRef = db.collection(USERS_COLLECTION).doc(uid);
    await userRef.update({
        apiUsageCount: firebase.firestore.FieldValue.increment(1)
    });
}

export async function logUserActivity(action: string, metadata: any = {}) {
    if (!auth.currentUser) return;
    await db.collection(ACTIVITY_LOGS_COLLECTION).add({
        action,
        metadata,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        userId: auth.currentUser.uid
    });
    
    // Increment global login counter if login
    if (action === 'login') {
        const statsRef = db.collection(STATS_COLLECTION).doc('global');
        await statsRef.set({ totalLogins: firebase.firestore.FieldValue.increment(1) }, { merge: true });
    }
}

export async function getGlobalStats(): Promise<GlobalStats> {
    const doc = await db.collection(STATS_COLLECTION).doc('global').get();
    if (doc.exists) {
        return doc.data() as GlobalStats;
    }
    return { totalLogins: 0, uniqueUsers: 0 };
}

// --- Social Graph (Follow/Unfollow) ---

export async function followUser(followerId: string, targetId: string) {
    const batch = db.batch();
    const followerRef = db.collection(USERS_COLLECTION).doc(followerId);
    const targetRef = db.collection(USERS_COLLECTION).doc(targetId);

    batch.update(followerRef, { following: firebase.firestore.FieldValue.arrayUnion(targetId) });
    batch.update(targetRef, { followers: firebase.firestore.FieldValue.arrayUnion(followerId) });

    await batch.commit();
}

export async function unfollowUser(followerId: string, targetId: string) {
    const batch = db.batch();
    const followerRef = db.collection(USERS_COLLECTION).doc(followerId);
    const targetRef = db.collection(USERS_COLLECTION).doc(targetId);

    batch.update(followerRef, { following: firebase.firestore.FieldValue.arrayRemove(targetId) });
    batch.update(targetRef, { followers: firebase.firestore.FieldValue.arrayRemove(followerId) });

    await batch.commit();
}

// --- Admin / Debug ---

export async function seedDatabase() {
    const batch = db.batch();
    // Assuming HANDCRAFTED_CHANNELS is imported from initialData
    HANDCRAFTED_CHANNELS.forEach(channel => {
        // Only seed if not offline channel
        if (channel.id !== 'offline-architecture-101') {
            const ref = db.collection(CHANNELS_COLLECTION).doc(channel.id);
            // Set channel data
            batch.set(ref, {
                ...channel,
                visibility: 'public', // Force public for seeded channels
                ownerId: null // System owned
            }, { merge: true });
            
            // Init stats
            const statsRef = db.collection(CHANNEL_STATS_COLLECTION).doc(channel.id);
            batch.set(statsRef, {
                likes: channel.likes,
                dislikes: channel.dislikes,
                shares: 0
            }, { merge: true });
        }
    });
    await batch.commit();
}

export async function recalculateGlobalStats() {
    const usersSnap = await db.collection(USERS_COLLECTION).get();
    const count = usersSnap.size;
    await db.collection(STATS_COLLECTION).doc('global').set({ uniqueUsers: count }, { merge: true });
    return count;
}

export async function claimSystemChannels(email: string) {
    const user = await getUserProfileByEmail(email);
    if (!user) throw new Error("User not found");
    
    const snap = await db.collection(CHANNELS_COLLECTION).where('ownerId', '==', null).get();
    const batch = db.batch();
    let count = 0;
    
    snap.docs.forEach(doc => {
        batch.update(doc.ref, { ownerId: user.uid });
        count++;
    });
    
    if (count > 0) await batch.commit();
    return count;
}

export async function setUserSubscriptionTier(uid: string, tier: 'free' | 'pro') {
    await db.collection(USERS_COLLECTION).doc(uid).update({ subscriptionTier: tier });
}

// --- Channels ---

export async function publishChannelToFirestore(channel: Channel) {
  await db.collection(CHANNELS_COLLECTION).doc(channel.id).set(channel);
  // Initialize separate stats doc
  await db.collection(CHANNEL_STATS_COLLECTION).doc(channel.id).set({
      likes: channel.likes || 0,
      dislikes: channel.dislikes || 0,
      shares: channel.shares || 0
  }, { merge: true });
}

export async function getPublicChannels(): Promise<Channel[]> {
  try {
    // Attempt optimized query (Requires Composite Index)
    const snap = await db.collection(CHANNELS_COLLECTION)
      .where('visibility', 'in', ['public', 'group'])
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    return snap.docs.map(d => d.data() as Channel);
  } catch (e: any) {
    // Fallback: If index is missing, query without sort and sort in memory
    if (e.code === 'failed-precondition' || e.message?.includes('index')) {
        console.warn("Firestore Index missing for Public Channels. Falling back to client-side sort.");
        const snap = await db.collection(CHANNELS_COLLECTION)
          .where('visibility', 'in', ['public', 'group'])
          .limit(50)
          .get();
        const data = snap.docs.map(d => d.data() as Channel);
        // Manual Sort
        return data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    throw e;
  }
}

export async function getCreatorChannels(ownerId: string): Promise<Channel[]> {
  try {
    // Optimized query for recent episodes/channels by a specific creator
    const snap = await db.collection(CHANNELS_COLLECTION)
      .where('ownerId', '==', ownerId)
      .where('visibility', '==', 'public')
      .orderBy('createdAt', 'desc')
      .limit(21) // 3 columns * 7 rows typical max
      .get();
    return snap.docs.map(d => d.data() as Channel);
  } catch (e: any) {
    // Fallback if index missing
    if (e.code === 'failed-precondition' || e.message?.includes('index')) {
        const snap = await db.collection(CHANNELS_COLLECTION)
          .where('ownerId', '==', ownerId)
          .where('visibility', '==', 'public')
          .limit(50)
          .get();
        const data = snap.docs.map(d => d.data() as Channel);
        return data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 21);
    }
    console.error("Error fetching creator channels:", e);
    return [];
  }
}

export function subscribeToPublicChannels(onUpdate: (channels: Channel[]) => void, onError: (error: any) => void) {
  return db.collection(CHANNELS_COLLECTION)
    .where('visibility', '==', 'public')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .onSnapshot(snap => {
      onUpdate(snap.docs.map(d => d.data() as Channel));
    }, onError);
}

export function subscribeToChannelStats(channelId: string, onUpdate: (stats: ChannelStats) => void, defaultStats?: ChannelStats) {
    return db.collection(CHANNEL_STATS_COLLECTION).doc(channelId).onSnapshot(doc => {
        if (doc.exists) {
            onUpdate(doc.data() as ChannelStats);
        } else {
            // Fallback default
            onUpdate(defaultStats || { likes: 0, dislikes: 0, shares: 0 });
        }
    });
}

export async function getGroupChannels(groupIds: string[]): Promise<Channel[]> {
  if (groupIds.length === 0) return [];
  // Firestore 'in' limit is 10
  const chunks = [];
  for (let i=0; i<groupIds.length; i+=10) {
      chunks.push(groupIds.slice(i, i+10));
  }
  
  let results: Channel[] = [];
  for (const chunk of chunks) {
      const snap = await db.collection(CHANNELS_COLLECTION)
        .where('visibility', '==', 'group')
        .where('groupId', 'in', chunk)
        .get();
      results = [...results, ...snap.docs.map(d => d.data() as Channel)];
  }
  return results;
}

export async function voteChannel(channel: Channel, type: 'like' | 'dislike') {
  const statsRef = db.collection(CHANNEL_STATS_COLLECTION).doc(channel.id);
  const userRef = db.collection(USERS_COLLECTION).doc(auth.currentUser!.uid);
  
  const batch = db.batch();
  
  if (type === 'like') {
      batch.set(statsRef, { likes: firebase.firestore.FieldValue.increment(1) }, { merge: true });
      batch.update(userRef, { likedChannelIds: firebase.firestore.FieldValue.arrayUnion(channel.id) });
  } else {
      batch.set(statsRef, { likes: firebase.firestore.FieldValue.increment(-1) }, { merge: true }); 
      batch.update(userRef, { likedChannelIds: firebase.firestore.FieldValue.arrayRemove(channel.id) });
  }
  
  await batch.commit();
}

export async function deleteChannelFromFirestore(id: string) {
  const batch = db.batch();
  batch.delete(db.collection(CHANNELS_COLLECTION).doc(id));
  batch.delete(db.collection(CHANNEL_STATS_COLLECTION).doc(id));
  await batch.commit();
}

export async function shareChannel(id: string) {
    await db.collection(CHANNEL_STATS_COLLECTION).doc(id).set({
        shares: firebase.firestore.FieldValue.increment(1)
    }, { merge: true });
}

export async function getChannelsByIds(ids: string[]): Promise<Channel[]> {
    if (ids.length === 0) return [];
    // Firestore 'in' limit 10
    const chunks = [];
    for (let i=0; i<ids.length; i+=10) {
        chunks.push(ids.slice(i, i+10));
    }
    let results: Channel[] = [];
    for (const chunk of chunks) {
        const snap = await db.collection(CHANNELS_COLLECTION).where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get();
        results = [...results, ...snap.docs.map(d => d.data() as Channel)];
    }
    return results;
}

export async function addChannelAttachment(channelId: string, attachment: any) {
    await db.collection(CHANNELS_COLLECTION).doc(channelId).update({
        appendix: firebase.firestore.FieldValue.arrayUnion(attachment)
    });
}

// --- Comments ---

export async function addCommentToChannel(channelId: string, comment: Comment) {
  await db.collection(CHANNELS_COLLECTION).doc(channelId).update({
    comments: firebase.firestore.FieldValue.arrayUnion(comment)
  });
}

export async function updateCommentInChannel(channelId: string, updatedComment: Comment) {
    const ref = db.collection(CHANNELS_COLLECTION).doc(channelId);
    await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        const data = doc.data() as Channel;
        const newComments = data.comments.map(c => c.id === updatedComment.id ? updatedComment : c);
        t.update(ref, { comments: newComments });
    });
}

export async function deleteCommentFromChannel(channelId: string, commentId: string) {
    const ref = db.collection(CHANNELS_COLLECTION).doc(channelId);
    await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        const data = doc.data() as Channel;
        const newComments = data.comments.filter(c => c.id !== commentId);
        t.update(ref, { comments: newComments });
    });
}

export async function uploadCommentAttachment(file: File, path: string): Promise<string> {
    const ref = storage.ref(path);
    await ref.put(file);
    return await ref.getDownloadURL();
}

// --- Lectures & Curriculum ---

export async function saveLectureToFirestore(channelId: string, lectureId: string, lecture: GeneratedLecture) {
  await db.collection(CHANNELS_COLLECTION).doc(channelId).collection(LECTURES_COLLECTION).doc(lectureId).set(lecture);
}

export async function getLectureFromFirestore(channelId: string, lectureId: string): Promise<GeneratedLecture | null> {
  const doc = await db.collection(CHANNELS_COLLECTION).doc(channelId).collection(LECTURES_COLLECTION).doc(lectureId).get();
  return doc.exists ? doc.data() as GeneratedLecture : null;
}

export async function saveCurriculumToFirestore(channelId: string, chapters: Chapter[]) {
  await db.collection(CHANNELS_COLLECTION).doc(channelId).collection(CURRICULUM_COLLECTION).doc('main').set({ chapters });
}

export async function getCurriculumFromFirestore(channelId: string): Promise<Chapter[] | null> {
  const doc = await db.collection(CHANNELS_COLLECTION).doc(channelId).collection(CURRICULUM_COLLECTION).doc('main').get();
  return doc.exists ? doc.data()?.chapters : null;
}

export async function deleteLectureFromFirestore(channelId: string, lectureId: string) {
    await db.collection(CHANNELS_COLLECTION).doc(channelId).collection(LECTURES_COLLECTION).doc(lectureId).delete();
}

// --- Discussions ---

export async function saveDiscussion(discussion: CommunityDiscussion): Promise<string> {
  const ref = db.collection(DISCUSSIONS_COLLECTION).doc();
  const discussionWithId = { ...discussion, id: ref.id };
  await ref.set(discussionWithId);
  return ref.id;
}

export async function updateDiscussion(id: string, transcript: any[]) {
  await db.collection(DISCUSSIONS_COLLECTION).doc(id).update({
      transcript,
      updatedAt: Date.now()
  });
}

export async function getDiscussionById(id: string): Promise<CommunityDiscussion | null> {
    const doc = await db.collection(DISCUSSIONS_COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as CommunityDiscussion;
}

export async function linkDiscussionToLectureSegment(channelId: string, lectureId: string, segmentIndex: number, discussionId: string) {
    const lectureRef = db.collection(CHANNELS_COLLECTION).doc(channelId).collection(LECTURES_COLLECTION).doc(lectureId);
    await db.runTransaction(async (t) => {
        const doc = await t.get(lectureRef);
        if (!doc.exists) return;
        const data = doc.data() as GeneratedLecture;
        if (data.sections[segmentIndex]) {
            data.sections[segmentIndex].discussionId = discussionId;
            t.update(lectureRef, { sections: data.sections });
        }
    });
}

export async function saveDiscussionDesignDoc(discussionId: string, docContent: string, title?: string) {
    const updateData: any = { designDoc: docContent };
    if (title) updateData.title = title;
    await db.collection(DISCUSSIONS_COLLECTION).doc(discussionId).update(updateData);
}

export async function getUserDesignDocs(uid: string): Promise<CommunityDiscussion[]> {
    const snap = await db.collection(DISCUSSIONS_COLLECTION)
        .where('userId', '==', uid)
        .orderBy('createdAt', 'desc')
        .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CommunityDiscussion))
        .filter(d => d.designDoc || d.isManual);
}

// --- Groups & Invites ---

export async function createGroup(name: string): Promise<string> {
    const ref = await db.collection(GROUPS_COLLECTION).add({
        name,
        ownerId: auth.currentUser!.uid,
        memberIds: [auth.currentUser!.uid],
        createdAt: Date.now()
    });
    // Add group to user profile
    await db.collection(USERS_COLLECTION).doc(auth.currentUser!.uid).update({
        groups: firebase.firestore.FieldValue.arrayUnion(ref.id)
    });
    return ref.id;
}

export async function getUserGroups(uid: string): Promise<Group[]> {
    const userDoc = await db.collection(USERS_COLLECTION).doc(uid).get();
    const groupIds = userDoc.data()?.groups || [];
    if (groupIds.length === 0) return [];
    
    // Chunk requests
    const chunks = [];
    for (let i=0; i<groupIds.length; i+=10) chunks.push(groupIds.slice(i, i+10));
    
    let results: Group[] = [];
    for (const chunk of chunks) {
        const snap = await db.collection(GROUPS_COLLECTION).where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get();
        results = [...results, ...snap.docs.map(d => ({ id: d.id, ...d.data() } as Group))];
    }
    return results;
}

export async function sendInvitation(groupId: string, email: string) {
    const groupDoc = await db.collection(GROUPS_COLLECTION).doc(groupId).get();
    const groupName = groupDoc.data()?.name || "Group";
    
    await db.collection(INVITATIONS_COLLECTION).add({
        fromUserId: auth.currentUser!.uid,
        fromName: auth.currentUser!.displayName || 'User',
        toEmail: email,
        groupId,
        groupName,
        status: 'pending',
        createdAt: Date.now(),
        type: 'group'
    });
}

export async function getPendingInvitations(email: string): Promise<Invitation[]> {
    const snap = await db.collection(INVITATIONS_COLLECTION)
        .where('toEmail', '==', email)
        .where('status', '==', 'pending')
        .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Invitation));
}

export async function respondToInvitation(invitation: Invitation, accept: boolean) {
    const batch = db.batch();
    const inviteRef = db.collection(INVITATIONS_COLLECTION).doc(invitation.id);
    
    batch.update(inviteRef, { status: accept ? 'accepted' : 'rejected' });
    
    if (accept && invitation.type !== 'session') {
        const uid = auth.currentUser!.uid;
        const groupRef = db.collection(GROUPS_COLLECTION).doc(invitation.groupId);
        const userRef = db.collection(USERS_COLLECTION).doc(uid);
        
        batch.update(groupRef, { memberIds: firebase.firestore.FieldValue.arrayUnion(uid) });
        batch.update(userRef, { groups: firebase.firestore.FieldValue.arrayUnion(invitation.groupId) });
    }
    
    await batch.commit();
}

export async function getGroupMembers(memberIds: string[]): Promise<UserProfile[]> {
    if (memberIds.length === 0) return [];
    const chunks = [];
    for (let i=0; i<memberIds.length; i+=10) chunks.push(memberIds.slice(i, i+10));
    
    let users: UserProfile[] = [];
    for (const chunk of chunks) {
        const snap = await db.collection(USERS_COLLECTION).where('uid', 'in', chunk).get();
        users = [...users, ...snap.docs.map(d => d.data() as UserProfile)];
    }
    return users;
}

export async function removeMemberFromGroup(groupId: string, memberId: string) {
    const batch = db.batch();
    const groupRef = db.collection(GROUPS_COLLECTION).doc(groupId);
    const userRef = db.collection(USERS_COLLECTION).doc(memberId);
    
    batch.update(groupRef, { memberIds: firebase.firestore.FieldValue.arrayRemove(memberId) });
    batch.update(userRef, { groups: firebase.firestore.FieldValue.arrayRemove(groupId) });
    
    await batch.commit();
}

// --- Bookings ---

export async function createBooking(booking: Booking) {
    await db.collection(BOOKINGS_COLLECTION).add(booking);
}

export async function getUserBookings(uid: string, email: string): Promise<Booking[]> {
    const ownerSnap = await db.collection(BOOKINGS_COLLECTION).where('userId', '==', uid).get();
    const invitedSnap = await db.collection(BOOKINGS_COLLECTION).where('invitedEmail', '==', email).get();
    
    const bookings = [
        ...ownerSnap.docs.map(d => ({ id: d.id, ...d.data() } as Booking)),
        ...invitedSnap.docs.map(d => ({ id: d.id, ...d.data() } as Booking))
    ];
    
    const unique = new Map();
    bookings.forEach(b => unique.set(b.id, b));
    return Array.from(unique.values());
}

export async function getPendingBookings(email: string): Promise<Booking[]> {
    const snap = await db.collection(BOOKINGS_COLLECTION)
        .where('invitedEmail', '==', email)
        .where('status', '==', 'pending')
        .where('type', '==', 'p2p')
        .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
}

export async function respondToBooking(bookingId: string, accept: boolean) {
    await db.collection(BOOKINGS_COLLECTION).doc(bookingId).update({
        status: accept ? 'scheduled' : 'rejected'
    });
}

export async function updateBookingInvite(bookingId: string, email: string) {
    await db.collection(BOOKINGS_COLLECTION).doc(bookingId).update({
        invitedEmail: email
    });
}

export async function cancelBooking(id: string) {
    await db.collection(BOOKINGS_COLLECTION).doc(id).update({ status: 'cancelled' });
}

// --- Recordings ---

export async function uploadFileToStorage(path: string, file: Blob | File, metadata?: any): Promise<string> {
    const ref = storage.ref(path);
    await ref.put(file, metadata);
    return await ref.getDownloadURL();
}

export async function saveRecordingReference(recording: RecordingSession) {
    await db.collection(RECORDINGS_COLLECTION).add(recording);
}

export async function getUserRecordings(uid: string): Promise<RecordingSession[]> {
    const snap = await db.collection(RECORDINGS_COLLECTION).where('userId', '==', uid).orderBy('timestamp', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as RecordingSession));
}

export async function deleteRecordingReference(id: string, mediaUrl?: string, transcriptUrl?: string): Promise<void> {
    await db.collection(RECORDINGS_COLLECTION).doc(id).delete();
    if (mediaUrl) await storage.refFromURL(mediaUrl).delete().catch(() => {});
    if (transcriptUrl) await storage.refFromURL(transcriptUrl).delete().catch(() => {});
}

export async function updateBookingRecording(bookingId: string, mediaUrl: string, transcriptUrl: string): Promise<void> {
    await db.collection(BOOKINGS_COLLECTION).doc(bookingId).update({
        recordingUrl: mediaUrl,
        transcriptUrl: transcriptUrl,
        status: 'completed'
    });
}

export async function deleteBookingRecording(bookingId: string, recordingUrl?: string, transcriptUrl?: string): Promise<void> {
    if (recordingUrl) {
        try { await storage.refFromURL(recordingUrl).delete(); } catch(e) {}
    }
    if (transcriptUrl) {
        try { await storage.refFromURL(transcriptUrl).delete(); } catch(e) {}
    }
    await db.collection(BOOKINGS_COLLECTION).doc(bookingId).update({
        recordingUrl: firebase.firestore.FieldValue.delete(),
        transcriptUrl: firebase.firestore.FieldValue.delete()
    });
}

// --- Daily Word ---

export async function saveSavedWord(uid: string, wordData: any) {
    await db.collection(USERS_COLLECTION).doc(uid).collection(SAVED_WORDS_COLLECTION).doc(wordData.word).set(wordData);
}

export async function getSavedWordForUser(uid: string, word: string) {
    const doc = await db.collection(USERS_COLLECTION).doc(uid).collection(SAVED_WORDS_COLLECTION).doc(word).get();
    return doc.exists ? doc.data() : null;
}

// --- Code Studio ---

export async function listCloudDirectory(path: string): Promise<CloudItem[]> {
    const ref = storage.ref(path);
    const res = await ref.listAll();
    
    const folders = res.prefixes.map(p => ({
        name: p.name,
        fullPath: p.fullPath,
        isFolder: true
    }));
    
    const files = await Promise.all(res.items.map(async (item) => {
        const meta = await item.getMetadata();
        const url = await item.getDownloadURL();
        return {
            name: item.name,
            fullPath: item.fullPath,
            isFolder: false,
            size: meta.size,
            timeCreated: meta.timeCreated,
            contentType: meta.contentType,
            url
        };
    }));
    
    return [...folders, ...files] as CloudItem[];
}

export async function saveProjectToCloud(path: string, name: string, content: string) {
    const ref = storage.ref(`${path}/${name}`);
    await ref.putString(content);
}

export async function deleteCloudItem(item: CloudItem) {
    if (!item.isFolder) {
        await storage.ref(item.fullPath).delete();
    }
}

export async function createCloudFolder(path: string, name: string) {
    const ref = storage.ref(`${path}/${name}/.keep`);
    await ref.putString('');
}

export function subscribeToCodeProject(sessionId: string, onUpdate: (project: CodeProject) => void) {
    return db.collection(PROJECTS_COLLECTION).doc(sessionId).onSnapshot(doc => {
        if (doc.exists) onUpdate({ id: doc.id, ...doc.data() } as CodeProject);
    });
}

export async function saveCodeProject(project: CodeProject) {
    await db.collection(PROJECTS_COLLECTION).doc(project.id).set(project, { merge: true });
}

export async function updateCodeFile(projectId: string, file: CodeFile) {
    const ref = db.collection(PROJECTS_COLLECTION).doc(projectId);
    await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) return;
        const data = doc.data() as CodeProject;
        const files = data.files || [];
        const idx = files.findIndex(f => (f.path || f.name) === (file.path || file.name));
        if (idx >= 0) files[idx] = file;
        else files.push(file);
        t.update(ref, { files });
    });
}

export async function deleteCodeFile(projectId: string, fileName: string) {
    const ref = db.collection(PROJECTS_COLLECTION).doc(projectId);
    await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) return;
        const data = doc.data() as CodeProject;
        const files = data.files.filter(f => (f.path || f.name) !== fileName);
        t.update(ref, { files });
    });
}

export async function updateCursor(projectId: string, cursor: CursorPosition) {
    await db.collection(PROJECTS_COLLECTION).doc(projectId).update({
        [`cursors.${cursor.clientId}`]: cursor
    });
}

export async function claimCodeProjectLock(projectId: string, clientId: string, name: string) {
    await db.collection(PROJECTS_COLLECTION).doc(projectId).update({
        activeClientId: clientId,
        activeWriterName: name,
        lastModified: Date.now()
    });
}

export async function updateProjectActiveFile(projectId: string, filePath: string) {
    await db.collection(PROJECTS_COLLECTION).doc(projectId).update({
        activeFilePath: filePath
    });
}

export async function moveCloudFile(oldPath: string, newPath: string) {
    const oldRef = storage.ref(oldPath);
    const url = await oldRef.getDownloadURL();
    const res = await fetch(url);
    const blob = await res.blob();
    
    const newRef = storage.ref(newPath);
    await newRef.put(blob);
    await oldRef.delete();
}

export async function updateProjectAccess(projectId: string, accessLevel: 'public' | 'restricted', allowedUserIds?: string[]) {
    await db.collection(PROJECTS_COLLECTION).doc(projectId).update({
        accessLevel,
        allowedUserIds: allowedUserIds || []
    });
}

export async function sendShareNotification(uid: string, type: string, link: string, senderName: string) {
    await db.collection(INVITATIONS_COLLECTION).add({
        toEmail: (await getUserProfile(uid))?.email || 'unknown',
        fromName: senderName,
        fromUserId: auth.currentUser!.uid,
        groupName: `${type} Session`,
        type: 'session',
        link: link,
        status: 'pending',
        createdAt: Date.now(),
        groupId: 'placeholder'
    });
}

// --- Whiteboard ---

export async function saveWhiteboardSession(sessionId: string, elements: WhiteboardElement[]) {
    await db.collection(WHITEBOARDS_COLLECTION).doc(sessionId).set({ elements }, { merge: true });
}

export function subscribeToWhiteboard(sessionId: string, onUpdate: (elements: WhiteboardElement[]) => void) {
    return db.collection(WHITEBOARDS_COLLECTION).doc(sessionId).onSnapshot(doc => {
        if (doc.exists) onUpdate(doc.data()?.elements || []);
    });
}

export async function updateWhiteboardElement(sessionId: string, element: WhiteboardElement) {
    const ref = db.collection(WHITEBOARDS_COLLECTION).doc(sessionId);
    await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) {
            t.set(ref, { elements: [element] });
            return;
        }
        const elements = doc.data()?.elements as WhiteboardElement[] || [];
        const idx = elements.findIndex(e => e.id === element.id);
        if (idx >= 0) elements[idx] = element;
        else elements.push(element);
        t.update(ref, { elements });
    });
}

export async function deleteWhiteboardElements(sessionId: string, ids: string[]) {
    const ref = db.collection(WHITEBOARDS_COLLECTION).doc(sessionId);
    await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) return;
        const elements = doc.data()?.elements as WhiteboardElement[] || [];
        const filtered = elements.filter(e => !ids.includes(e.id));
        t.update(ref, { elements: filtered });
    });
}

// --- Blogs ---

export async function ensureUserBlog(user: any): Promise<any> {
    const snapshot = await db.collection(BLOGS_COLLECTION).where('ownerId', '==', user.uid).limit(1).get();
    if (!snapshot.empty) return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    
    const blog = {
        ownerId: user.uid,
        authorName: user.displayName || 'User',
        title: `${user.displayName}'s Blog`,
        description: 'Thoughts on tech and life.',
        createdAt: Date.now()
    };
    const ref = await db.collection(BLOGS_COLLECTION).add(blog);
    return { id: ref.id, ...blog };
}

export async function getCommunityPosts(): Promise<BlogPost[]> {
    const snap = await db.collection(POSTS_COLLECTION)
        .where('status', '==', 'published')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as BlogPost));
}

export async function getUserPosts(blogId: string): Promise<BlogPost[]> {
    const snap = await db.collection(POSTS_COLLECTION)
        .where('blogId', '==', blogId)
        .orderBy('createdAt', 'desc')
        .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as BlogPost));
}

export async function createBlogPost(post: any) {
    await db.collection(POSTS_COLLECTION).add(post);
}

export async function updateBlogPost(id: string, data: any) {
    await db.collection(POSTS_COLLECTION).doc(id).update(data);
}

export async function deleteBlogPost(id: string) {
    await db.collection(POSTS_COLLECTION).doc(id).delete();
}

export async function updateBlogSettings(blogId: string, settings: any) {
    await db.collection(BLOGS_COLLECTION).doc(blogId).update(settings);
}

export async function addPostComment(postId: string, comment: Comment) {
    await db.collection(POSTS_COLLECTION).doc(postId).update({
        comments: firebase.firestore.FieldValue.arrayUnion(comment),
        commentCount: firebase.firestore.FieldValue.increment(1)
    });
}

export async function getBlogPost(id: string): Promise<BlogPost | null> {
    const doc = await db.collection(POSTS_COLLECTION).doc(id).get();
    return doc.exists ? ({ id: doc.id, ...doc.data() } as BlogPost) : null;
}

// --- Billing (Stripe Mocks) ---

export async function createStripeCheckoutSession(uid: string): Promise<string> {
    const ref = await db.collection('customers').doc(uid).collection('checkout_sessions').add({
        price: 'price_12345',
        success_url: window.location.origin,
        cancel_url: window.location.origin,
    });
    // This would typically redirect to the URL in the doc, but we mock the success URL here for dev
    return window.location.origin + '?success=true';
}

export async function createStripePortalSession(uid: string): Promise<string> {
    // This usually requires cloud function to generate link
    // Returning a placeholder for now
    return 'https://billing.stripe.com/p/login/test';
}

export async function getBillingHistory(uid: string) {
    return [
        { amount: 29.00, date: '2024-05-01' },
        { amount: 29.00, date: '2024-04-01' }
    ];
}

export async function forceUpgradeDebug(uid: string) {
    await db.collection(USERS_COLLECTION).doc(uid).update({ subscriptionTier: 'pro' });
}

export function setupSubscriptionListener(uid: string, cb: (tier: any) => void) {
    return db.collection(USERS_COLLECTION).doc(uid).onSnapshot(doc => {
        cb(doc.data()?.subscriptionTier);
    });
}

// --- Chat ---

export async function sendMessage(channelId: string, text: string, collectionPath: string, replyTo?: any, attachments?: any[]) {
    await db.collection(collectionPath).add({
        text,
        senderId: auth.currentUser!.uid,
        senderName: auth.currentUser!.displayName || 'User',
        senderImage: auth.currentUser!.photoURL,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        replyTo: replyTo || null,
        attachments: attachments || []
    });
}

export function subscribeToMessages(channelId: string, onUpdate: (msgs: RealTimeMessage[]) => void, collectionPath: string) {
    return db.collection(collectionPath)
        .orderBy('timestamp', 'asc')
        .limit(100)
        .onSnapshot(snap => {
            const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as RealTimeMessage));
            onUpdate(msgs);
        });
}

export async function createOrGetDMChannel(otherUserId: string, otherUserName: string): Promise<string> {
    const uid = auth.currentUser!.uid;
    const sortedIds = [uid, otherUserId].sort().join('_');
    const ref = db.collection(DM_CHANNELS_COLLECTION).doc(sortedIds);
    
    const doc = await ref.get();
    if (!doc.exists) {
        await ref.set({
            memberIds: [uid, otherUserId],
            name: `${auth.currentUser!.displayName} & ${otherUserName}`,
            type: 'dm',
            createdAt: Date.now()
        });
    }
    return sortedIds;
}

export async function getUserDMChannels(): Promise<ChatChannel[]> {
    const snap = await db.collection(DM_CHANNELS_COLLECTION)
        .where('memberIds', 'array-contains', auth.currentUser!.uid)
        .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatChannel));
}

export async function getUniqueGroupMembers(groupIds: string[]) {
    const members = await getGroupMembers(groupIds);
    const map = new Map();
    members.forEach(m => map.set(m.uid, m));
    return Array.from(map.values());
}

export async function deleteMessage(channelId: string, messageId: string, collectionPath: string) {
    await db.collection(collectionPath).doc(messageId).delete();
}

// --- Career ---

export async function submitCareerApplication(app: CareerApplication) {
    await db.collection(APPLICATIONS_COLLECTION).add(app);
}

export async function uploadResumeToStorage(uid: string, file: File): Promise<string> {
    const ref = storage.ref(`resumes/${uid}/${file.name}`);
    await ref.put(file);
    return await ref.getDownloadURL();
}

export async function createJobPosting(job: JobPosting) {
    await db.collection(JOBS_COLLECTION).add(job);
}

export async function getJobPostings(): Promise<JobPosting[]> {
    const snap = await db.collection(JOBS_COLLECTION).orderBy('postedAt', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as JobPosting));
}

export async function getAllCareerApplications(): Promise<CareerApplication[]> {
    const snap = await db.collection(APPLICATIONS_COLLECTION).orderBy('createdAt', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CareerApplication));
}

// --- LLM Notebooks (New) ---

export async function getCreatorNotebooks(userId: string): Promise<Notebook[]> {
    // For now, return mock notebooks to enable feature without full backend migration
    return [
        {
            id: 'nb-1',
            title: 'Transformer Architecture Deep Dive',
            author: 'AI Research Team',
            description: 'A comprehensive walkthrough of the attention mechanism with Python code.',
            kernel: 'python',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            tags: ['AI', 'Deep Learning'],
            cells: [
                { id: 'c1', type: 'markdown', content: '# Understanding Transformers\n\nIn this notebook, we will explore the **Self-Attention** mechanism.' },
                { id: 'c2', type: 'code', language: 'python', content: 'import torch\nimport torch.nn as nn\n\nclass SelfAttention(nn.Module):\n    def __init__(self, embed_size, heads):\n        super(SelfAttention, self).__init__()\n        # Implementation goes here\n        pass' },
                { id: 'c3', type: 'markdown', content: '## Testing the Layer\nLet\'s instantiate the layer and pass a dummy tensor.' }
            ]
        },
        {
            id: 'nb-2',
            title: 'Data Analysis with Pandas',
            author: 'Data Science Lead',
            description: 'Basic data manipulation techniques for beginners.',
            kernel: 'python',
            createdAt: Date.now() - 86400000,
            updatedAt: Date.now(),
            tags: ['Data Science', 'Pandas'],
            cells: [
                { id: 'c1', type: 'markdown', content: '# Pandas 101\n\nLoad a CSV file and perform basic aggregation.' },
                { id: 'c2', type: 'code', language: 'python', content: 'import pandas as pd\n\ndf = pd.read_csv("data.csv")\ndf.head()' }
            ]
        }
    ];
}

// --- Debug / Admin ---

export async function getDebugCollectionDocs(collectionName: string, limitVal: number) {
    const snap = await db.collection(collectionName).limit(limitVal).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}