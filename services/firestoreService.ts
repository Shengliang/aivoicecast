
import firebase from 'firebase/compat/app';
import { auth, db, storage } from './firebaseConfig';
import { 
  UserProfile, Channel, ChannelStats, Comment, Attachment, 
  Group, ChatChannel, RealTimeMessage, 
  GeneratedLecture, CommunityDiscussion, 
  Booking, Invitation, RecordingSession, 
  CodeProject, CodeFile, CursorPosition, CloudItem, 
  WhiteboardElement, 
  Blog, BlogPost, 
  JobPosting, CareerApplication, 
  Notebook, AgentMemory,
  GlobalStats,
  SubscriptionTier
} from '../types';

// Constants
const USERS_COLLECTION = 'users';
const CHANNELS_COLLECTION = 'channels';
const CHANNEL_STATS_COLLECTION = 'channel_stats';
const GROUPS_COLLECTION = 'groups';
const MESSAGES_COLLECTION = 'messages';
const BOOKINGS_COLLECTION = 'bookings';
const RECORDINGS_COLLECTION = 'recordings';
const DISCUSSIONS_COLLECTION = 'discussions';
const LECTURES_COLLECTION = 'lectures';
const CURRICULUM_COLLECTION = 'curriculums';
const BLOGS_COLLECTION = 'blogs';
const POSTS_COLLECTION = 'posts';
const JOBS_COLLECTION = 'jobs';
const APPLICATIONS_COLLECTION = 'applications';
const CODE_PROJECTS_COLLECTION = 'code_projects';
const WHITEBOARDS_COLLECTION = 'whiteboards';
const SAVED_WORDS_COLLECTION = 'saved_words';
const CARDS_COLLECTION = 'cards';

// --- Helpers ---
const sanitizeData = (data: any) => JSON.parse(JSON.stringify(data));

// --- Users & Auth ---

export async function syncUserProfile(user: firebase.User): Promise<void> {
  const userRef = db.collection(USERS_COLLECTION).doc(user.uid);
  const snap = await userRef.get();
  
  if (!snap.exists) {
    await userRef.set({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      createdAt: Date.now(),
      lastLogin: Date.now(),
      subscriptionTier: 'free',
      apiUsageCount: 0
    });
  } else {
    await userRef.update({
      lastLogin: Date.now()
    });
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const doc = await db.collection(USERS_COLLECTION).doc(uid).get();
  return doc.exists ? (doc.data() as UserProfile) : null;
}

export async function updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  await db.collection(USERS_COLLECTION).doc(uid).update(data);
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const snap = await db.collection(USERS_COLLECTION).get();
  return snap.docs.map(d => d.data() as UserProfile);
}

export async function getUserProfileByEmail(email: string): Promise<UserProfile | null> {
  const snap = await db.collection(USERS_COLLECTION).where('email', '==', email).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].data() as UserProfile;
}

export function logUserActivity(action: string, details: any) {
  db.collection('activity_logs').add({
    action,
    details,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(console.error);
}

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

export function setupSubscriptionListener(uid: string, callback: (tier: SubscriptionTier) => void) {
  return db.collection(USERS_COLLECTION).doc(uid).onSnapshot(doc => {
    const data = doc.data();
    if (data) callback(data.subscriptionTier || 'free');
  });
}

export async function setUserSubscriptionTier(uid: string, tier: 'free' | 'pro') {
    await db.collection(USERS_COLLECTION).doc(uid).update({ subscriptionTier: tier });
}

// --- Channels ---

export async function getPublicChannels(): Promise<Channel[]> {
  const snap = await db.collection(CHANNELS_COLLECTION).where('visibility', '==', 'public').get();
  return snap.docs.map(d => d.data() as Channel);
}

export function subscribeToPublicChannels(onUpdate: (channels: Channel[]) => void, onError?: (error: any) => void) {
  return db.collection(CHANNELS_COLLECTION)
    .where('visibility', '==', 'public')
    .onSnapshot(
      snap => onUpdate(snap.docs.map(d => d.data() as Channel)),
      err => onError && onError(err)
    );
}

export function subscribeToAllChannelsAdmin(onUpdate: (channels: Channel[]) => void, onError?: (error: any) => void) {
    return db.collection(CHANNELS_COLLECTION)
        .onSnapshot(
            snap => onUpdate(snap.docs.map(d => d.data() as Channel)),
            err => onError && onError(err)
        );
}

export async function publishChannelToFirestore(channel: Channel) {
  await db.collection(CHANNELS_COLLECTION).doc(channel.id).set(sanitizeData(channel));
}

export async function deleteChannelFromFirestore(channelId: string) {
    await db.collection(CHANNELS_COLLECTION).doc(channelId).delete();
}

export async function voteChannel(channel: Channel, type: 'like' | 'dislike') {
  // Update main doc (legacy support)
  const ref = db.collection(CHANNELS_COLLECTION).doc(channel.id);
  const update = type === 'like' 
    ? { likes: firebase.firestore.FieldValue.increment(1) }
    : { dislikes: firebase.firestore.FieldValue.increment(1) };
  ref.update(update).catch(() => {}); // Ignore error if doc missing

  // Update stats collection
  const statsRef = db.collection(CHANNEL_STATS_COLLECTION).doc(channel.id);
  await statsRef.set(update, { merge: true });
}

export function subscribeToChannelStats(channelId: string, callback: (stats: ChannelStats) => void, initialStats: ChannelStats) {
    return db.collection(CHANNEL_STATS_COLLECTION).doc(channelId).onSnapshot(doc => {
        if (doc.exists) {
            callback(doc.data() as ChannelStats);
        } else {
            callback(initialStats);
        }
    });
}

export async function shareChannel(channelId: string) {
    const statsRef = db.collection(CHANNEL_STATS_COLLECTION).doc(channelId);
    await statsRef.set({ shares: firebase.firestore.FieldValue.increment(1) }, { merge: true });
}

export async function addCommentToChannel(channelId: string, comment: Comment) {
  const ref = db.collection(CHANNELS_COLLECTION).doc(channelId);
  await ref.update({
    comments: firebase.firestore.FieldValue.arrayUnion(sanitizeData(comment))
  });
}

export async function updateCommentInChannel(channelId: string, comment: Comment) {
    // This is tricky with arrayUnion/Remove. Firestore doesn't support updating array items easily.
    // We fetch, update, and save.
    const ref = db.collection(CHANNELS_COLLECTION).doc(channelId);
    await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) return;
        const data = doc.data() as Channel;
        const comments = data.comments.map(c => c.id === comment.id ? comment : c);
        t.update(ref, { comments });
    });
}

export async function deleteCommentFromChannel(channelId: string, commentId: string) {
    const ref = db.collection(CHANNELS_COLLECTION).doc(channelId);
    await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) return;
        const data = doc.data() as Channel;
        const comments = data.comments.filter(c => c.id !== commentId);
        t.update(ref, { comments });
    });
}

export async function addChannelAttachment(channelId: string, attachment: Attachment) {
    const ref = db.collection(CHANNELS_COLLECTION).doc(channelId);
    await ref.update({
        appendix: firebase.firestore.FieldValue.arrayUnion(attachment)
    });
}

export async function getChannelsByIds(ids: string[]): Promise<Channel[]> {
    if (ids.length === 0) return [];
    // Firestore 'in' query limit is 10. We might need to batch or loop.
    // For simplicity, fetch up to 10 here.
    const safeIds = ids.slice(0, 10);
    const snap = await db.collection(CHANNELS_COLLECTION).where(firebase.firestore.FieldPath.documentId(), 'in', safeIds).get();
    return snap.docs.map(d => d.data() as Channel);
}

export async function getCreatorChannels(ownerId: string): Promise<Channel[]> {
    const snap = await db.collection(CHANNELS_COLLECTION).where('ownerId', '==', ownerId).limit(20).get();
    return snap.docs.map(d => d.data() as Channel);
}

export async function claimSystemChannels(ownerEmail: string): Promise<number> {
    const user = await getUserProfileByEmail(ownerEmail);
    if (!user) throw new Error("User not found");
    const snap = await db.collection(CHANNELS_COLLECTION).where('ownerId', '==', null).get();
    const batch = db.batch();
    snap.docs.forEach(doc => {
        batch.update(doc.ref, { ownerId: user.uid, author: user.displayName });
    });
    await batch.commit();
    return snap.size;
}

// --- Groups & Chat ---

export async function createGroup(name: string) {
  if (!auth.currentUser) throw new Error("Must be logged in");
  const groupRef = db.collection(GROUPS_COLLECTION).doc();
  const group: Group = {
    id: groupRef.id,
    name,
    ownerId: auth.currentUser.uid,
    memberIds: [auth.currentUser.uid],
    createdAt: Date.now()
  };
  await groupRef.set(group);
  return group.id;
}

export async function getUserGroups(uid: string): Promise<Group[]> {
  const snap = await db.collection(GROUPS_COLLECTION).where('memberIds', 'array-contains', uid).get();
  return snap.docs.map(d => d.data() as Group);
}

export async function getGroupChannels(groupIds: string[]): Promise<Channel[]> {
  if (groupIds.length === 0) return [];
  // Batched query
  const snap = await db.collection(CHANNELS_COLLECTION)
    .where('visibility', '==', 'group')
    .where('groupId', 'in', groupIds.slice(0, 10)) 
    .get();
  return snap.docs.map(d => d.data() as Channel);
}

export async function getGroupMembers(memberIds: string[]): Promise<UserProfile[]> {
    if (memberIds.length === 0) return [];
    // Batch fetch users
    const chunks = [];
    for (let i = 0; i < memberIds.length; i += 10) {
        chunks.push(memberIds.slice(i, i + 10));
    }
    
    let profiles: UserProfile[] = [];
    for (const chunk of chunks) {
        const snap = await db.collection(USERS_COLLECTION).where('uid', 'in', chunk).get();
        profiles = [...profiles, ...snap.docs.map(d => d.data() as UserProfile)];
    }
    return profiles;
}

export async function removeMemberFromGroup(groupId: string, memberId: string) {
    await db.collection(GROUPS_COLLECTION).doc(groupId).update({
        memberIds: firebase.firestore.FieldValue.arrayRemove(memberId)
    });
}

export async function sendInvitation(groupId: string, email: string) {
  if (!auth.currentUser) throw new Error("Must be logged in");
  const groupDoc = await db.collection(GROUPS_COLLECTION).doc(groupId).get();
  if (!groupDoc.exists) throw new Error("Group not found");
  const group = groupDoc.data() as Group;

  const invRef = db.collection('invitations').doc();
  const invitation: Invitation = {
    id: invRef.id,
    fromUserId: auth.currentUser.uid,
    fromName: auth.currentUser.displayName || 'User',
    toEmail: email,
    groupId,
    groupName: group.name,
    status: 'pending',
    createdAt: Date.now(),
    type: 'group'
  };
  await invRef.set(invitation);
}

export async function getPendingInvitations(email: string): Promise<Invitation[]> {
  const snap = await db.collection('invitations')
    .where('toEmail', '==', email)
    .where('status', '==', 'pending')
    .get();
  return snap.docs.map(d => d.data() as Invitation);
}

export async function respondToInvitation(invitation: Invitation, accept: boolean) {
  await db.collection('invitations').doc(invitation.id).update({
    status: accept ? 'accepted' : 'rejected'
  });
  if (accept && invitation.type !== 'session') {
    await db.collection(GROUPS_COLLECTION).doc(invitation.groupId).update({
      memberIds: firebase.firestore.FieldValue.arrayUnion(auth.currentUser?.uid)
    });
    // Add group to user profile
    await db.collection(USERS_COLLECTION).doc(auth.currentUser?.uid).update({
        groups: firebase.firestore.FieldValue.arrayUnion(invitation.groupId)
    });
  }
}

// DM & Chat
export async function createOrGetDMChannel(otherUserId: string, otherUserName: string): Promise<string> {
    if (!auth.currentUser) throw new Error("Not logged in");
    const uid = auth.currentUser.uid;
    const sortedIds = [uid, otherUserId].sort();
    const dmId = `dm_${sortedIds[0]}_${sortedIds[1]}`;
    
    const docRef = db.collection('chat_channels').doc(dmId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
        const channel: ChatChannel = {
            id: dmId,
            name: `${auth.currentUser.displayName} & ${otherUserName}`,
            type: 'dm',
            memberIds: sortedIds,
            createdAt: Date.now()
        };
        await docRef.set(channel);
    }
    return dmId;
}

export async function getUserDMChannels(): Promise<ChatChannel[]> {
    if (!auth.currentUser) return [];
    const snap = await db.collection('chat_channels')
        .where('memberIds', 'array-contains', auth.currentUser.uid)
        .get();
    return snap.docs.map(d => d.data() as ChatChannel);
}

export async function sendMessage(channelId: string, text: string, collectionPath?: string, replyTo?: any, attachments?: any[]) {
    if (!auth.currentUser) return;
    const path = collectionPath || `chat_channels/${channelId}/messages`;
    
    // Use 'any' type construction to avoid TypeScript issues with conditional keys
    const messagePayload: any = {
        text,
        senderId: auth.currentUser.uid,
        senderName: auth.currentUser.displayName || 'Anonymous',
        senderImage: auth.currentUser.photoURL || '',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    };

    // Only add optional fields if they exist (Firestore hates undefined)
    if (replyTo) {
        messagePayload.replyTo = replyTo;
    }
    
    if (attachments && attachments.length > 0) {
        messagePayload.attachments = attachments;
    }
    
    const ref = await db.collection(path).add(messagePayload);
    
    // Update channel last message
    // Use set with merge to handle cases where the channel doc might not exist (e.g. 'general' created ad-hoc)
    if (!collectionPath || collectionPath.includes('chat_channels')) {
        db.collection('chat_channels').doc(channelId).set({
            lastMessage: {
                text,
                senderName: auth.currentUser.displayName,
                timestamp: Date.now()
            },
            // Ensure basic fields for hardcoded channels if they are created here
            ...(channelId === 'general' ? { name: 'General', type: 'public' } : {}),
            ...(channelId === 'announcements' ? { name: 'Announcements', type: 'public' } : {})
        }, { merge: true }).catch((err) => console.warn("Failed to update lastMessage", err));
    }
    
    // Add ID to the message document itself
    await ref.update({ id: ref.id });
}

export function subscribeToMessages(channelId: string, callback: (msgs: RealTimeMessage[]) => void, collectionPath?: string) {
    const path = collectionPath || `chat_channels/${channelId}/messages`;
    return db.collection(path)
        .orderBy('timestamp', 'asc')
        .limit(100)
        .onSnapshot(snap => {
            const msgs = snap.docs.map(d => {
                const data = d.data();
                return { ...data, id: d.id } as RealTimeMessage;
            });
            callback(msgs);
        });
}

export async function deleteMessage(channelId: string, messageId: string, collectionPath?: string) {
    const path = collectionPath || `chat_channels/${channelId}/messages`;
    await db.collection(path).doc(messageId).delete();
}

export async function getUniqueGroupMembers(groupId: string): Promise<UserProfile[]> {
    const group = await db.collection(GROUPS_COLLECTION).doc(groupId).get();
    if (!group.exists) return [];
    const memberIds = (group.data() as Group).memberIds;
    return getGroupMembers(memberIds);
}

// --- Lectures & Content ---

export async function incrementApiUsage(uid: string) {
  const ref = db.collection(USERS_COLLECTION).doc(uid);
  await ref.update({
    apiUsageCount: firebase.firestore.FieldValue.increment(1)
  });
}

export async function saveLectureToFirestore(channelId: string, lectureId: string, lecture: GeneratedLecture) {
  await db.collection(LECTURES_COLLECTION).doc(`${channelId}_${lectureId}`).set({
    ...lecture,
    channelId,
    lectureId,
    createdAt: Date.now()
  });
}

export async function getLectureFromFirestore(channelId: string, lectureId: string): Promise<GeneratedLecture | null> {
  const doc = await db.collection(LECTURES_COLLECTION).doc(`${channelId}_${lectureId}`).get();
  return doc.exists ? (doc.data() as GeneratedLecture) : null;
}

export async function deleteLectureFromFirestore(channelId: string, lectureId: string) {
    await db.collection(LECTURES_COLLECTION).doc(`${channelId}_${lectureId}`).delete();
}

export async function saveCurriculumToFirestore(channelId: string, curriculum: any) {
    await db.collection(CURRICULUM_COLLECTION).doc(channelId).set({ chapters: curriculum });
}

export async function getCurriculumFromFirestore(channelId: string) {
    const doc = await db.collection(CURRICULUM_COLLECTION).doc(channelId).get();
    return doc.exists ? doc.data()?.chapters : null;
}

// --- Discussions ---

export async function saveDiscussion(discussion: CommunityDiscussion): Promise<string> {
  const ref = db.collection(DISCUSSIONS_COLLECTION).doc();
  const data = { ...discussion, id: ref.id };
  await ref.set(sanitizeData(data));
  return ref.id;
}

export async function updateDiscussion(id: string, transcript: any[]) {
    await db.collection(DISCUSSIONS_COLLECTION).doc(id).update({
        transcript: sanitizeData(transcript),
        updatedAt: Date.now()
    });
}

export async function getDiscussionById(id: string): Promise<CommunityDiscussion | null> {
  const doc = await db.collection(DISCUSSIONS_COLLECTION).doc(id).get();
  return doc.exists ? (doc.data() as CommunityDiscussion) : null;
}

export async function saveDiscussionDesignDoc(id: string, doc: string, title?: string) {
    const update: any = { designDoc: doc };
    if (title) update.title = title;
    await db.collection(DISCUSSIONS_COLLECTION).doc(id).update(update);
}

export async function linkDiscussionToLectureSegment(channelId: string, lectureId: string, segmentIndex: number, discussionId: string) {
    // This is logical linking, usually stored in lecture or separate index.
    // For simplicity, we might update the lecture document if it exists in Firestore
    const lectureRef = db.collection(LECTURES_COLLECTION).doc(`${channelId}_${lectureId}`);
    const doc = await lectureRef.get();
    if (doc.exists) {
        const lecture = doc.data() as GeneratedLecture;
        if (lecture.sections[segmentIndex]) {
            lecture.sections[segmentIndex].discussionId = discussionId;
            await lectureRef.update({ sections: lecture.sections });
        }
    }
}

export async function getUserDesignDocs(uid: string): Promise<CommunityDiscussion[]> {
    const snap = await db.collection(DISCUSSIONS_COLLECTION)
        .where('userId', '==', uid)
        .where('designDoc', '!=', null)
        .get();
    return snap.docs.map(d => d.data() as CommunityDiscussion);
}

// --- Bookings ---

export async function createBooking(booking: Booking) {
  const ref = db.collection(BOOKINGS_COLLECTION).doc();
  const data = { ...booking, id: ref.id };
  await ref.set(sanitizeData(data));
  
  if (booking.invitedEmail) {
      // Create Invitation Record
      const invRef = db.collection('invitations').doc();
      await invRef.set({
          id: invRef.id,
          fromUserId: booking.userId,
          fromName: booking.hostName || 'User',
          toEmail: booking.invitedEmail,
          groupId: '', // N/A
          groupName: booking.topic,
          status: 'pending',
          createdAt: Date.now(),
          type: 'session',
          link: window.location.origin // Deep link to app
      });
  }
  
  return ref.id;
}

export async function getUserBookings(uid: string, email?: string): Promise<Booking[]> {
  // Get bookings where I am host OR I am invited
  const hostSnap = await db.collection(BOOKINGS_COLLECTION).where('userId', '==', uid).get();
  let invitedSnap = { docs: [] as any[] };
  
  if (email) {
      invitedSnap = await db.collection(BOOKINGS_COLLECTION).where('invitedEmail', '==', email).get();
  }
  
  const bookings = [
      ...hostSnap.docs.map(d => d.data() as Booking),
      ...invitedSnap.docs.map(d => d.data() as Booking)
  ];
  
  // Dedup
  const unique = new Map();
  bookings.forEach(b => unique.set(b.id, b));
  return Array.from(unique.values());
}

export async function getPendingBookings(email: string): Promise<Booking[]> {
    const snap = await db.collection(BOOKINGS_COLLECTION)
        .where('invitedEmail', '==', email)
        .where('status', '==', 'pending')
        .get();
    return snap.docs.map(d => d.data() as Booking);
}

export async function respondToBooking(bookingId: string, accept: boolean) {
    await db.collection(BOOKINGS_COLLECTION).doc(bookingId).update({
        status: accept ? 'scheduled' : 'rejected'
    });
}

export async function cancelBooking(id: string) {
    await db.collection(BOOKINGS_COLLECTION).doc(id).update({ status: 'cancelled' });
}

export async function updateBookingInvite(bookingId: string, email: string) {
    await db.collection(BOOKINGS_COLLECTION).doc(bookingId).update({ invitedEmail: email });
    // Also trigger invitation
    const booking = (await db.collection(BOOKINGS_COLLECTION).doc(bookingId).get()).data() as Booking;
    const invRef = db.collection('invitations').doc();
    await invRef.set({
          id: invRef.id,
          fromUserId: booking.userId,
          fromName: booking.hostName || 'User',
          toEmail: email,
          groupId: '', 
          groupName: booking.topic,
          status: 'pending',
          createdAt: Date.now(),
          type: 'session',
          link: window.location.origin
    });
}

export async function updateBookingRecording(bookingId: string, mediaUrl: string, transcriptUrl: string) {
    await db.collection(BOOKINGS_COLLECTION).doc(bookingId).update({
        recordingUrl: mediaUrl,
        transcriptUrl: transcriptUrl,
        status: 'completed'
    });
}

export async function deleteBookingRecording(bookingId: string, mediaUrl?: string, transcriptUrl?: string) {
    await db.collection(BOOKINGS_COLLECTION).doc(bookingId).update({
        recordingUrl: firebase.firestore.FieldValue.delete(),
        transcriptUrl: firebase.firestore.FieldValue.delete()
    });
    // Delete files from storage
    if (mediaUrl) await storage.refFromURL(mediaUrl).delete().catch(() => {});
    if (transcriptUrl) await storage.refFromURL(transcriptUrl).delete().catch(() => {});
}

// --- Recordings ---

export async function saveRecordingReference(rec: RecordingSession) {
    const ref = db.collection(RECORDINGS_COLLECTION).doc();
    await ref.set({ ...rec, id: ref.id });
}

export async function getUserRecordings(uid: string): Promise<RecordingSession[]> {
    const snap = await db.collection(RECORDINGS_COLLECTION).where('userId', '==', uid).orderBy('timestamp', 'desc').get();
    return snap.docs.map(d => d.data() as RecordingSession);
}

export async function deleteRecordingReference(id: string, mediaUrl: string, transcriptUrl: string) {
    await db.collection(RECORDINGS_COLLECTION).doc(id).delete();
    if (mediaUrl) await storage.refFromURL(mediaUrl).delete().catch(() => {});
    if (transcriptUrl) await storage.refFromURL(transcriptUrl).delete().catch(() => {});
}

// --- Code Studio ---

export async function saveCodeProject(project: CodeProject) {
    const ref = db.collection(CODE_PROJECTS_COLLECTION).doc(project.id);
    await ref.set(sanitizeData(project), { merge: true });
}

export function subscribeToCodeProject(projectId: string, callback: (project: CodeProject) => void) {
    return db.collection(CODE_PROJECTS_COLLECTION).doc(projectId).onSnapshot(doc => {
        if (doc.exists) callback(doc.data() as CodeProject);
    });
}

export async function updateCodeFile(projectId: string, file: CodeFile) {
    const projectRef = db.collection(CODE_PROJECTS_COLLECTION).doc(projectId);
    // We need to update a specific item in the 'files' array.
    // This is hard in Firestore. We usually read-modify-write.
    await db.runTransaction(async (t) => {
        const doc = await t.get(projectRef);
        if (!doc.exists) return;
        const data = doc.data() as CodeProject;
        const files = data.files.map(f => (f.path || f.name) === (file.path || file.name) ? file : f);
        if (!files.find(f => (f.path || f.name) === (file.path || file.name))) {
            files.push(file);
        }
        t.update(projectRef, { files, lastModified: Date.now() });
    });
}

export async function deleteCodeFile(projectId: string, fileName: string) {
    const projectRef = db.collection(CODE_PROJECTS_COLLECTION).doc(projectId);
    await db.runTransaction(async (t) => {
        const doc = await t.get(projectRef);
        if (!doc.exists) return;
        const data = doc.data() as CodeProject;
        const files = data.files.filter(f => (f.path || f.name) !== fileName);
        t.update(projectRef, { files, lastModified: Date.now() });
    });
}

export async function updateCursor(projectId: string, cursor: CursorPosition) {
    const projectRef = db.collection(CODE_PROJECTS_COLLECTION).doc(projectId);
    const updateKey = `cursors.${cursor.clientId}`;
    await projectRef.update({
        [updateKey]: cursor
    });
}

export async function claimCodeProjectLock(projectId: string, clientId: string, userName: string) {
    await db.collection(CODE_PROJECTS_COLLECTION).doc(projectId).update({
        activeClientId: clientId,
        activeWriterName: userName,
        lastModified: Date.now() // Refresh lock timeout
    });
}

export async function updateProjectActiveFile(projectId: string, filePath: string) {
    await db.collection(CODE_PROJECTS_COLLECTION).doc(projectId).update({
        activeFilePath: filePath
    });
}

export async function updateProjectAccess(projectId: string, accessLevel: 'public' | 'restricted', allowedUserIds?: string[]) {
    const update: any = { accessLevel };
    if (allowedUserIds) update.allowedUserIds = allowedUserIds;
    await db.collection(CODE_PROJECTS_COLLECTION).doc(projectId).update(update);
}

export async function sendShareNotification(targetUserId: string, type: string, link: string, senderName: string) {
    // Send via DM if possible, or Invitation
    // Invitation is better for notifications
    const invRef = db.collection('invitations').doc();
    await invRef.set({
        id: invRef.id,
        fromUserId: auth.currentUser?.uid,
        fromName: senderName,
        toEmail: '', // Not needed if we use ID logic in notification component, but good for data
        groupId: '',
        groupName: `${type} Session`,
        status: 'pending',
        createdAt: Date.now(),
        type: 'session',
        link: link
    });
    
    // Hack: Store toEmail based on userId lookup? Or rely on 'invitations' query which usually filters by email.
    // The existing notification component filters by email.
    // We need targetUserEmail.
    const user = await getUserProfile(targetUserId);
    if (user) {
        await invRef.update({ toEmail: user.email });
    }
}

// Cloud Files (Mock filesystem on Storage/Firestore)
export async function listCloudDirectory(path: string): Promise<CloudItem[]> {
    // In a real app, this would query a 'files' collection.
    // For now, we return empty or implement a simple file tracking collection.
    // Assuming 'cloud_files' collection
    const snap = await db.collection('cloud_files').where('parentPath', '==', path).get();
    return snap.docs.map(d => d.data() as CloudItem);
}

export async function saveProjectToCloud(parentPath: string, name: string, content: string) {
    const fullPath = `${parentPath}/${name}`;
    // Save content to Storage
    const fileRef = storage.ref(fullPath);
    await fileRef.putString(content);
    
    // Save metadata
    await db.collection('cloud_files').doc(fullPath.replace(/\//g, '_')).set({
        name,
        fullPath,
        parentPath,
        isFolder: false,
        url: await fileRef.getDownloadURL(),
        timeCreated: new Date().toISOString()
    });
}

export async function createCloudFolder(parentPath: string, name: string) {
    const fullPath = `${parentPath}/${name}`;
    await db.collection('cloud_files').doc(fullPath.replace(/\//g, '_')).set({
        name,
        fullPath,
        parentPath,
        isFolder: true,
        timeCreated: new Date().toISOString()
    });
}

export async function deleteCloudItem(item: CloudItem) {
    await db.collection('cloud_files').doc(item.fullPath.replace(/\//g, '_')).delete();
    if (!item.isFolder) {
        await storage.ref(item.fullPath).delete();
    }
}

export async function moveCloudFile(oldPath: string, newPath: string) {
    // Copy and Delete
    // Simplified: Just update metadata parentPath
    // In reality, storage move is hard.
    // We will just update metadata for now.
    const docId = oldPath.replace(/\//g, '_');
    const newDocId = newPath.replace(/\//g, '_');
    const doc = await db.collection('cloud_files').doc(docId).get();
    if (doc.exists) {
        const data = doc.data();
        const parts = newPath.split('/');
        const name = parts.pop();
        const parentPath = parts.join('/');
        
        await db.collection('cloud_files').doc(newDocId).set({
            ...data,
            name,
            fullPath: newPath,
            parentPath
        });
        await db.collection('cloud_files').doc(docId).delete();
    }
}

// --- Whiteboard ---

export async function saveWhiteboardSession(sessionId: string, elements: WhiteboardElement[]) {
    await db.collection(WHITEBOARDS_COLLECTION).doc(sessionId).set({ elements: sanitizeData(elements) });
}

export function subscribeToWhiteboard(sessionId: string, callback: (elements: WhiteboardElement[]) => void) {
    return db.collection(WHITEBOARDS_COLLECTION).doc(sessionId).onSnapshot(doc => {
        if (doc.exists) callback(doc.data()?.elements || []);
    });
}

export async function updateWhiteboardElement(sessionId: string, element: WhiteboardElement) {
    // Array update logic
    const ref = db.collection(WHITEBOARDS_COLLECTION).doc(sessionId);
    await db.runTransaction(async t => {
        const doc = await t.get(ref);
        if (!doc.exists) {
            t.set(ref, { elements: [element] });
            return;
        }
        const elements = doc.data()!.elements as WhiteboardElement[];
        const idx = elements.findIndex(e => e.id === element.id);
        if (idx > -1) elements[idx] = element;
        else elements.push(element);
        t.update(ref, { elements: sanitizeData(elements) });
    });
}

export async function deleteWhiteboardElements(sessionId: string, ids: string[]) {
    const ref = db.collection(WHITEBOARDS_COLLECTION).doc(sessionId);
    await db.runTransaction(async t => {
        const doc = await t.get(ref);
        if (!doc.exists) return;
        const elements = doc.data()!.elements as WhiteboardElement[];
        const filtered = elements.filter(e => !ids.includes(e.id));
        t.update(ref, { elements: sanitizeData(filtered) });
    });
}

// --- Blog ---

export async function ensureUserBlog(user: any): Promise<Blog> {
    const snap = await db.collection(BLOGS_COLLECTION).where('ownerId', '==', user.uid).get();
    if (!snap.empty) return snap.docs[0].data() as Blog;
    
    const newBlog: Blog = {
        id: user.uid, // One blog per user for simplicity
        ownerId: user.uid,
        authorName: user.displayName || 'Author',
        title: `${user.displayName}'s Blog`,
        description: 'Welcome to my blog.',
        createdAt: Date.now()
    };
    await db.collection(BLOGS_COLLECTION).doc(newBlog.id).set(newBlog);
    return newBlog;
}

export async function getCommunityPosts(): Promise<BlogPost[]> {
    const snap = await db.collection(POSTS_COLLECTION)
        .where('status', '==', 'published')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();
    return snap.docs.map(d => d.data() as BlogPost);
}

export async function getUserPosts(blogId: string): Promise<BlogPost[]> {
    const snap = await db.collection(POSTS_COLLECTION)
        .where('blogId', '==', blogId)
        .orderBy('createdAt', 'desc')
        .get();
    return snap.docs.map(d => d.data() as BlogPost);
}

export async function createBlogPost(post: BlogPost) {
    const ref = db.collection(POSTS_COLLECTION).doc();
    await ref.set({ ...post, id: ref.id });
}

export async function updateBlogPost(id: string, data: Partial<BlogPost>) {
    await db.collection(POSTS_COLLECTION).doc(id).update(data);
}

export async function deleteBlogPost(id: string) {
    await db.collection(POSTS_COLLECTION).doc(id).delete();
}

export async function updateBlogSettings(id: string, data: Partial<Blog>) {
    await db.collection(BLOGS_COLLECTION).doc(id).update(data);
}

export async function addPostComment(postId: string, comment: Comment) {
    const ref = db.collection(POSTS_COLLECTION).doc(postId);
    await ref.update({
        comments: firebase.firestore.FieldValue.arrayUnion(sanitizeData(comment)),
        commentCount: firebase.firestore.FieldValue.increment(1)
    });
}

export async function getBlogPost(id: string): Promise<BlogPost | null> {
    const doc = await db.collection(POSTS_COLLECTION).doc(id).get();
    return doc.exists ? doc.data() as BlogPost : null;
}

// --- Career ---

export async function getJobPostings(): Promise<JobPosting[]> {
    const snap = await db.collection(JOBS_COLLECTION).orderBy('postedAt', 'desc').get();
    return snap.docs.map(d => d.data() as JobPosting);
}

export async function createJobPosting(job: JobPosting) {
    const ref = db.collection(JOBS_COLLECTION).doc();
    await ref.set({ ...job, id: ref.id });
}

export async function submitCareerApplication(app: CareerApplication) {
    const ref = db.collection(APPLICATIONS_COLLECTION).doc();
    await ref.set({ ...app, id: ref.id });
}

export async function getAllCareerApplications(): Promise<CareerApplication[]> {
    const snap = await db.collection(APPLICATIONS_COLLECTION).orderBy('createdAt', 'desc').get();
    return snap.docs.map(d => d.data() as CareerApplication);
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

export async function uploadResumeToStorage(uid: string, file: File): Promise<string> {
    const path = `resumes/${uid}/${file.name}`;
    return uploadFileToStorage(path, file);
}

// --- Billing ---

export async function createStripeCheckoutSession(uid: string): Promise<string> {
    const docRef = await db.collection('customers').doc(uid).collection('checkout_sessions').add({
        price: 'price_1234', // Replace with real Price ID in Production
        success_url: window.location.origin,
        cancel_url: window.location.origin,
    });
    
    // Wait for Cloud Function to attach url
    return new Promise((resolve, reject) => {
        const unsubscribe = docRef.onSnapshot(snap => {
            const { url, error } = snap.data() || {};
            if (url) {
                unsubscribe();
                resolve(url);
            }
            if (error) {
                unsubscribe();
                reject(new Error(error.message));
            }
        });
    });
}

export async function createStripePortalSession(uid: string): Promise<string> {
    // Mock for now, requires Cloud Function
    throw new Error("Stripe Portal not configured in this demo.");
}

export async function getBillingHistory(uid: string): Promise<any[]> {
    // Mock
    return [];
}

export async function forceUpgradeDebug(uid: string) {
    await db.collection(USERS_COLLECTION).doc(uid).update({ subscriptionTier: 'pro' });
}

// --- Admin ---

export async function getGlobalStats(): Promise<GlobalStats> {
    const snap = await db.collection('stats').doc('global').get();
    return snap.exists ? snap.data() as GlobalStats : { totalLogins: 0, uniqueUsers: 0 };
}

export async function recalculateGlobalStats(): Promise<number> {
    const snap = await db.collection(USERS_COLLECTION).get();
    const count = snap.size;
    await db.collection('stats').doc('global').set({ uniqueUsers: count }, { merge: true });
    return count;
}

export async function getDebugCollectionDocs(collectionName: string, limit = 20): Promise<any[]> {
    const snap = await db.collection(collectionName).limit(limit).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function seedDatabase() {
    // Implementation to upload initialData.ts content
    // Left empty for brevity, usually iterates HANDCRAFTED_CHANNELS
}

// --- Saved Words ---

export async function saveSavedWord(uid: string, wordData: any) {
    await db.collection(USERS_COLLECTION).doc(uid).collection(SAVED_WORDS_COLLECTION).doc(wordData.word).set(wordData);
}

export async function getSavedWordForUser(uid: string, word: string) {
    const doc = await db.collection(USERS_COLLECTION).doc(uid).collection(SAVED_WORDS_COLLECTION).doc(word).get();
    return doc.exists ? doc.data() : null;
}

// --- Notebooks (Mock for now or reuse Discussions) ---
export async function getCreatorNotebooks(creatorId: string): Promise<Notebook[]> {
    // For demo, return empty or static
    return [];
}

// --- Cards (Holiday Card Workshop) ---

export async function saveCard(memory: AgentMemory, cardId?: string): Promise<string> {
    if (!auth.currentUser) throw new Error("Must be logged in to save cards.");
    
    const id = cardId || crypto.randomUUID();
    const docRef = db.collection(CARDS_COLLECTION).doc(id);
    
    const cardData = {
        ...sanitizeData(memory),
        id: id,
        ownerId: auth.currentUser.uid,
        updatedAt: Date.now()
    };
    
    await docRef.set(cardData, { merge: true });
    return id;
}

export async function getCard(cardId: string): Promise<AgentMemory | null> {
    const doc = await db.collection(CARDS_COLLECTION).doc(cardId).get();
    if (doc.exists) {
        return doc.data() as AgentMemory;
    }
    return null;
}

export async function getUserCards(uid: string): Promise<AgentMemory[]> {
    const snap = await db.collection(CARDS_COLLECTION)
        .where('ownerId', '==', uid)
        .orderBy('updatedAt', 'desc')
        .get();
    return snap.docs.map(d => d.data() as AgentMemory);
}
