
// [FORCE-SYNC-v3.38.0] Timestamp: ${new Date().toISOString()}
import { db, auth, storage } from './firebaseConfig';
import firebase from 'firebase/compat/app';
import { Channel, Group, UserProfile, Invitation, GeneratedLecture, CommunityDiscussion, Comment, Booking, RecordingSession, TranscriptItem, CodeProject, Attachment } from '../types';
import { HANDCRAFTED_CHANNELS } from '../utils/initialData';
import { SPOTLIGHT_DATA } from '../utils/spotlightContent';
import { OFFLINE_LECTURES, OFFLINE_CHANNEL_ID } from '../utils/offlineContent';

// Helper to remove undefined fields which Firestore rejects
function sanitizeData(data: any): any {
  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  } else if (data !== null && typeof data === 'object') {
    const clean: any = {};
    Object.keys(data).forEach(key => {
      const value = data[key];
      if (value !== undefined) {
        clean[key] = sanitizeData(value);
      }
    });
    return clean;
  }
  return data;
}

// --- SAVED WORDS (VOCABULARY) ---

export async function saveSavedWord(userId: string, wordData: any): Promise<void> {
  await db.collection('saved_words').add(sanitizeData({
    userId,
    ...wordData,
    savedAt: Date.now()
  }));
  logUserActivity('save_word', { word: wordData.word });
}

export async function getUserSavedWords(userId: string): Promise<any[]> {
  try {
    const snap = await db.collection('saved_words')
      .where("userId", "==", userId)
      .orderBy("savedAt", "desc")
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("Failed to fetch saved words", e);
    return [];
  }
}

export async function getSavedWordForUser(userId: string, word: string): Promise<any | null> {
  try {
    const snap = await db.collection('saved_words')
      .where("userId", "==", userId)
      .where("word", "==", word)
      .limit(1)
      .get();
    
    if (!snap.empty) {
      return snap.docs[0].data();
    }
    return null;
  } catch (e) {
    console.warn("Failed to fetch specific saved word", e);
    return null;
  }
}

// --- DEBUG / ADMIN ---

export async function getDebugCollectionDocs(collectionName: string, limitVal = 20): Promise<any[]> {
  try {
    const snap = await db.collection(collectionName).limit(limitVal).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error(`Error fetching ${collectionName}`, e);
    throw e;
  }
}

// Helper to find ID by title within a channel's curriculum
function findSubTopicId(channel: Channel, title: string): string | null {
    if (!channel.chapters) return null;
    for(const ch of channel.chapters) {
       for(const sub of ch.subTopics) {
          if(sub.title === title) return sub.id;
       }
    }
    return null;
}

export async function seedDatabase(): Promise<void> {
  const batch = db.batch();
  let channelCount = 0;
  let lectureCount = 0;

  for (const channel of HANDCRAFTED_CHANNELS) {
     const channelRef = db.collection('channels').doc(channel.id);
     
     // 1. Seed Channel Metadata
     // Force visibility to public so they appear for everyone
     const data = { 
         ...channel, 
         visibility: 'public', 
         createdAt: channel.createdAt || Date.now(),
         updatedAt: firebase.firestore.FieldValue.serverTimestamp()
     }; 
     batch.set(channelRef, sanitizeData(data), { merge: true });
     channelCount++;

     // 2. Seed Lectures (Subcollection)
     
     // A. Check Spotlight Data
     const spotlight = SPOTLIGHT_DATA[channel.id];
     if (spotlight && spotlight.lectures) {
        for (const title in spotlight.lectures) {
           const lecture = spotlight.lectures[title];
           const subId = findSubTopicId(channel, title);
           if (subId) {
              const lectureRef = channelRef.collection('lectures').doc(subId);
              batch.set(lectureRef, sanitizeData(lecture), { merge: true });
              lectureCount++;
           }
        }
     }

     // B. Check Offline Lectures (only for the offline channel)
     if (channel.id === OFFLINE_CHANNEL_ID) {
        for (const title in OFFLINE_LECTURES) {
           const lecture = OFFLINE_LECTURES[title];
           const subId = findSubTopicId(channel, title);
           if (subId) {
              const lectureRef = channelRef.collection('lectures').doc(subId);
              batch.set(lectureRef, sanitizeData(lecture), { merge: true });
              lectureCount++;
           }
        }
     }
  }

  await batch.commit();
  console.log(`Seeded ${channelCount} channels and ${lectureCount} lectures to Firestore.`);
}

// --- STORAGE ---

export async function uploadCommentAttachment(file: Blob, path: string): Promise<string> {
  const ref = storage.ref(path);
  await ref.put(file);
  return await ref.getDownloadURL();
}

export async function uploadFileToStorage(path: string, blob: Blob, metadata: any = {}): Promise<string> {
  const ref = storage.ref(path);
  await ref.put(blob, { customMetadata: metadata });
  return await ref.getDownloadURL();
}

// --- USER PROFILE ---

export async function syncUserProfile(user: any): Promise<void> {
  if (!user) return;
  const userRef = db.collection('users').doc(user.uid);
  const snap = await userRef.get();

  if (!snap.exists) {
    // Create new profile
    const newProfile: UserProfile = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || 'Anonymous',
      photoURL: user.photoURL || '',
      groups: [],
      apiUsageCount: 0,
      createdAt: Date.now()
    };
    await userRef.set(sanitizeData(newProfile));
  } else {
    // Update login time or details if needed
    await userRef.update({
      lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
      displayName: user.displayName || 'Anonymous', // Keep updated
      photoURL: user.photoURL || ''
    });
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  return snap.exists ? (snap.data() as UserProfile) : null;
}

export async function getUserProfileByEmail(email: string): Promise<UserProfile | null> {
  try {
    const snap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (snap.empty) return null;
    return snap.docs[0].data() as UserProfile;
  } catch(e) {
    console.warn("Failed to fetch user by email", e);
    return null;
  }
}

export async function getAllUsers(): Promise<UserProfile[]> {
  try {
    // Fetch all users to display in the member directory
    // Limit to 100 to allow for filtering of invalid emails
    const snap = await db.collection('users').orderBy('createdAt', 'desc').limit(100).get();
    return snap.docs.map(doc => doc.data() as UserProfile);
  } catch (e) {
    console.warn("Failed to fetch all users", e);
    return [];
  }
}

export async function incrementApiUsage(uid: string): Promise<void> {
  if (!uid) return;
  const userRef = db.collection('users').doc(uid);
  try {
    await userRef.update({
      apiUsageCount: firebase.firestore.FieldValue.increment(1)
    });
  } catch (e) {
    console.warn("Failed to increment usage stats", e);
  }
}

// --- ACTIVITY LOGS (METRICS) ---

export async function logUserActivity(type: string, metadata: any = {}): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    await db.collection('activity_logs').add(sanitizeData({
      uid: user.uid,
      email: user.email,
      type,
      metadata,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      clientTime: Date.now()
    }));
  } catch (e) {
    console.warn("Failed to log activity", e);
  }
}

// --- GROUPS ---

export async function createGroup(name: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Must be logged in");

  const newGroup: Group = {
    id: '', // set after creation
    name,
    ownerId: user.uid,
    memberIds: [user.uid],
    createdAt: Date.now()
  };

  const docRef = await db.collection('groups').add(sanitizeData(newGroup));
  
  // Update group with its ID
  await docRef.update({ id: docRef.id });

  // Add group ID to user's profile
  const userRef = db.collection('users').doc(user.uid);
  await userRef.update({
    groups: firebase.firestore.FieldValue.arrayUnion(docRef.id)
  });
  
  logUserActivity('create_group', { groupId: docRef.id, name });

  return docRef.id;
}

export async function joinGroup(groupId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Must be logged in");

  const groupRef = db.collection('groups').doc(groupId);
  const groupSnap = await groupRef.get();

  if (!groupSnap.exists) {
    throw new Error("Group not found");
  }

  // Add user to group members
  await groupRef.update({
    memberIds: firebase.firestore.FieldValue.arrayUnion(user.uid)
  });

  // Add group to user profile
  const userRef = db.collection('users').doc(user.uid);
  await userRef.update({
    groups: firebase.firestore.FieldValue.arrayUnion(groupId)
  });
  
  logUserActivity('join_group', { groupId });
}

export async function getUserGroups(uid: string): Promise<Group[]> {
  // 1. Get User Profile to find Group IDs
  const profile = await getUserProfile(uid);
  if (!profile || !profile.groups || profile.groups.length === 0) return [];

  // 2. Fetch Groups
  const groups: Group[] = [];
  for (const gid of profile.groups) {
    try {
      const gSnap = await db.collection('groups').doc(gid).get();
      if (gSnap.exists) {
        groups.push(gSnap.data() as Group);
      }
    } catch (e) {
      console.warn(`Failed to load group ${gid}`, e);
    }
  }
  return groups;
}

export async function getGroupMembers(memberIds: string[]): Promise<UserProfile[]> {
  if (!memberIds || memberIds.length === 0) return [];
  
  // Fetch profiles in parallel
  const promises = memberIds.map(uid => getUserProfile(uid));
  const results = await Promise.all(promises);
  return results.filter(p => p !== null) as UserProfile[];
}

export async function removeMemberFromGroup(groupId: string, memberId: string): Promise<void> {
    const batch = db.batch();
    const groupRef = db.collection('groups').doc(groupId);
    const userRef = db.collection('users').doc(memberId);

    // Remove from Group's member list
    batch.update(groupRef, {
        memberIds: firebase.firestore.FieldValue.arrayRemove(memberId)
    });

    // Remove Group from User's group list
    batch.update(userRef, {
        groups: firebase.firestore.FieldValue.arrayRemove(groupId)
    });

    await batch.commit();
    logUserActivity('remove_member', { groupId, memberId });
}

// --- INVITATIONS ---

export async function sendInvitation(groupId: string, toEmail: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error("Must be logged in");
  
  const groupRef = db.collection('groups').doc(groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) throw new Error("Group not found");
  
  const groupData = groupSnap.data() as Group;
  
  // Check if sender is owner
  if (groupData.ownerId !== user.uid) {
     throw new Error("Only the group owner can invite members.");
  }

  const invitation: Invitation = {
    id: '', // set after creation
    fromUserId: user.uid,
    fromName: user.displayName || user.email,
    toEmail: toEmail.trim(),
    groupId: groupId,
    groupName: groupData.name,
    status: 'pending',
    createdAt: Date.now()
  };

  const docRef = await db.collection('invitations').add(sanitizeData(invitation));
  await docRef.update({ id: docRef.id });
  
  logUserActivity('send_invite', { groupId, to: toEmail });
}

export async function getPendingInvitations(userEmail: string): Promise<Invitation[]> {
  if (!userEmail) return [];
  const snapshot = await db.collection('invitations')
    .where("toEmail", "==", userEmail)
    .where("status", "==", "pending")
    .get();
  
  return snapshot.docs.map(d => d.data() as Invitation);
}

export async function respondToInvitation(invitation: Invitation, accept: boolean): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Must be logged in");

  const batch = db.batch();

  // 1. Update Invitation Status
  const inviteRef = db.collection('invitations').doc(invitation.id);
  batch.update(inviteRef, { status: accept ? 'accepted' : 'rejected' });

  // 2. If accepted, Add User to Group and Group to User
  if (accept) {
     const groupRef = db.collection('groups').doc(invitation.groupId);
     batch.update(groupRef, { memberIds: firebase.firestore.FieldValue.arrayUnion(user.uid) });

     const userRef = db.collection('users').doc(user.uid);
     batch.update(userRef, { groups: firebase.firestore.FieldValue.arrayUnion(invitation.groupId) });
  }

  await batch.commit();
  logUserActivity('respond_invite', { invitationId: invitation.id, accepted: accept });
}

// --- CHANNELS ---

export async function publishChannelToFirestore(channel: Channel): Promise<void> {
  // Ensure we save a clean object with timestamps
  const data = {
    ...channel,
    // Provide defaults for critical fields
    createdAt: channel.createdAt || Date.now(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  // Sanitize data to remove undefined fields (like groupId if not group visibility)
  const cleanData = sanitizeData(data);
  
  // Use set with merge to be safe
  await db.collection('channels').doc(channel.id).set(cleanData, { merge: true });
  console.log(`Published channel ${channel.id} to Firestore (visibility: ${channel.visibility})`);
  logUserActivity('publish_channel', { channelId: channel.id, visibility: channel.visibility });
}

export async function addChannelAttachment(channelId: string, attachment: Attachment): Promise<void> {
  const ref = db.collection('channels').doc(channelId);
  await ref.update({
    appendix: firebase.firestore.FieldValue.arrayUnion(sanitizeData(attachment))
  });
  logUserActivity('add_attachment', { channelId, attachmentName: attachment.name });
}

export async function deleteChannelFromFirestore(channelId: string): Promise<void> {
  await db.collection('channels').doc(channelId).delete();
  logUserActivity('delete_channel', { channelId });
}

export async function voteChannel(channelId: string, type: 'like' | 'dislike'): Promise<void> {
  const ref = db.collection('channels').doc(channelId);
  // We use increment to handle concurrent votes atomically
  const updateData = type === 'like' 
    ? { likes: firebase.firestore.FieldValue.increment(1) }
    : { dislikes: firebase.firestore.FieldValue.increment(1) };
    
  await ref.update(updateData);
  logUserActivity('vote_channel', { channelId, type });
}

export async function addCommentToChannel(channelId: string, comment: Comment): Promise<void> {
  const ref = db.collection('channels').doc(channelId);
  await ref.update({
    comments: firebase.firestore.FieldValue.arrayUnion(sanitizeData(comment))
  });
  logUserActivity('comment_channel', { channelId });
}

export async function updateCommentInChannel(channelId: string, updatedComment: Comment): Promise<void> {
  const ref = db.collection('channels').doc(channelId);
  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);
    if (!doc.exists) throw new Error("Channel does not exist!");
    const data = doc.data() as Channel;
    const comments = data.comments || [];
    const idx = comments.findIndex(c => c.id === updatedComment.id);
    if (idx !== -1) {
      comments[idx] = sanitizeData(updatedComment);
      transaction.update(ref, { comments });
    }
  });
}

export async function deleteCommentFromChannel(channelId: string, commentId: string): Promise<void> {
  const ref = db.collection('channels').doc(channelId);
  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);
    if (!doc.exists) throw new Error("Channel does not exist!");
    const data = doc.data() as Channel;
    const comments = (data.comments || []).filter(c => c.id !== commentId);
    transaction.update(ref, { comments });
  });
}

export async function getPublicChannels(): Promise<Channel[]> {
  console.log("Fetching public channels...");
  const snapshot = await db.collection('channels')
    .where("visibility", "==", "public")
    .get();
    
  const channels = snapshot.docs.map(d => d.data() as Channel);
  // Sort Descending by Creation Time (Newest First)
  const sorted = channels.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  console.log(`Fetched ${sorted.length} public channels`);
  return sorted;
}

// Real-time subscription for public channels
export function subscribeToPublicChannels(
  onUpdate: (channels: Channel[]) => void, 
  onError: (error: Error) => void
): () => void {
  console.log("Subscribing to public channels...");
  return db.collection('channels')
    .where("visibility", "==", "public")
    .onSnapshot(
      (snapshot) => {
        const channels = snapshot.docs.map(d => d.data() as Channel);
        // Client-side sort to guarantee order without complex indexes
        channels.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        console.log(`Realtime update: ${channels.length} public channels`);
        onUpdate(channels);
      },
      (error) => {
        console.warn("Public channels subscription error:", error);
        onError(error);
      }
    );
}

export async function getGroupChannels(groupIds: string[]): Promise<Channel[]> {
  if (groupIds.length === 0) return [];
  // 'in' query limits to 10
  const chunks = [];
  for (let i = 0; i < groupIds.length; i += 10) {
    chunks.push(groupIds.slice(i, i + 10));
  }

  let results: Channel[] = [];
  for (const chunk of chunks) {
    const snap = await db.collection('channels').where("groupId", "in", chunk).get();
    snap.forEach(d => results.push(d.data() as Channel));
  }
  // Sort Group channels too
  return results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// --- LECTURE CACHING (Shared Knowledge Base) ---

export async function saveLectureToFirestore(channelId: string, subTopicId: string, lecture: GeneratedLecture): Promise<void> {
  const sanitizedId = subTopicId.replace(/[^a-zA-Z0-9]/g, '_');
  const docRef = db.collection('channels').doc(channelId).collection('lectures').doc(sanitizedId);
  await docRef.set(sanitizeData(lecture));
}

export async function saveCurriculumToFirestore(channelId: string, curriculum: any): Promise<void> {
  const docRef = db.collection('channels').doc(channelId).collection('meta').doc('curriculum');
  await docRef.set(sanitizeData({ chapters: curriculum, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }));
}

export async function getLectureFromFirestore(channelId: string, subTopicId: string): Promise<GeneratedLecture | null> {
  const sanitizedId = subTopicId.replace(/[^a-zA-Z0-9]/g, '_');
  const docRef = db.collection('channels').doc(channelId).collection('lectures').doc(sanitizedId);
  try {
    const snap = await docRef.get();
    return snap.exists ? (snap.data() as GeneratedLecture) : null;
  } catch (e) {
    return null;
  }
}

export async function deleteLectureFromFirestore(channelId: string, subTopicId: string): Promise<void> {
  const sanitizedId = subTopicId.replace(/[^a-zA-Z0-9]/g, '_');
  await db.collection('channels').doc(channelId).collection('lectures').doc(sanitizedId).delete();
  logUserActivity('delete_lecture', { channelId, subTopicId });
}

export async function getCurriculumFromFirestore(channelId: string): Promise<any | null> {
  const docRef = db.collection('channels').doc(channelId).collection('meta').doc('curriculum');
  try {
    const snap = await docRef.get();
    return snap.exists ? snap.data()?.chapters : null;
  } catch (e) {
    return null;
  }
}

// --- DISCUSSIONS (NEW) ---

export async function saveDiscussion(discussion: CommunityDiscussion): Promise<string> {
  const docRef = await db.collection('discussions').add(sanitizeData({
    ...discussion,
    createdAt: Date.now()
  }));
  logUserActivity('share_discussion', { lectureId: discussion.lectureId });
  return docRef.id;
}

export async function updateDiscussion(discussionId: string, transcript: TranscriptItem[]): Promise<void> {
  const ref = db.collection('discussions').doc(discussionId);
  await ref.update({
    transcript: sanitizeData(transcript),
    updatedAt: Date.now()
  });
  logUserActivity('update_discussion', { discussionId });
}

export async function saveDiscussionDesignDoc(discussionId: string, designDoc: string, title?: string): Promise<void> {
  const ref = db.collection('discussions').doc(discussionId);
  const updateData: any = {
    designDoc,
    updatedAt: Date.now()
  };
  if (title) updateData.title = title;
  
  await ref.update(updateData);
  logUserActivity('save_design_doc', { discussionId });
}

export async function getDiscussionsForLecture(lectureId: string): Promise<CommunityDiscussion[]> {
  try {
    // NOTE: Removed server-side sort to avoid requiring composite index
    const snap = await db.collection('discussions')
      .where("lectureId", "==", lectureId)
      .get();
    
    return snap.docs
      .map(d => ({ ...d.data(), id: d.id } as CommunityDiscussion))
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (e) {
    console.warn("Failed to fetch discussions", e);
    return [];
  }
}

export async function getUserDesignDocs(uid: string): Promise<CommunityDiscussion[]> {
  try {
    // NOTE: Removed server-side sort to avoid requiring composite index (userId + createdAt)
    const snap = await db.collection('discussions')
      .where("userId", "==", uid)
      .get();
    
    return snap.docs
      .map(d => ({ ...d.data(), id: d.id } as CommunityDiscussion))
      .filter(d => d.designDoc && d.designDoc.trim().length > 0)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (e) {
    console.warn("Failed to fetch user docs", e);
    return [];
  }
}

export async function getDiscussionById(discussionId: string): Promise<CommunityDiscussion | null> {
  try {
    const doc = await db.collection('discussions').doc(discussionId).get();
    return doc.exists ? ({ ...doc.data(), id: doc.id } as CommunityDiscussion) : null;
  } catch(e) {
    return null;
  }
}

export async function linkDiscussionToLectureSegment(channelId: string, lectureId: string, sectionIndex: number, discussionId: string): Promise<void> {
  const sanitizedId = lectureId.replace(/[^a-zA-Z0-9]/g, '_');
  const lectureRef = db.collection('channels').doc(channelId).collection('lectures').doc(sanitizedId);
  
  try {
    await db.runTransaction(async (t) => {
      const doc = await t.get(lectureRef);
      if (!doc.exists) return;
      
      const data = doc.data() as GeneratedLecture;
      
      // Update the specific section with discussion ID
      if (data.sections && data.sections[sectionIndex]) {
        data.sections[sectionIndex].discussionId = discussionId;
        t.set(lectureRef, sanitizeData(data)); // using set to update the whole object safely
      }
    });
    console.log(`Linked discussion ${discussionId} to segment ${sectionIndex}`);
  } catch(e) {
    console.error("Failed to link discussion to segment", e);
    throw e;
  }
}

// --- RECORDINGS (SESSION HISTORY) ---

export async function saveRecordingReference(recording: RecordingSession): Promise<void> {
  // Use a subcollection under the user OR a top-level collection with userId field.
  // Top-level is better for admin/reporting, but subcollection is cleaner for privacy rules.
  // We'll use top-level 'recordings' with a query.
  await db.collection('recordings').add(sanitizeData(recording));
  logUserActivity('save_recording', { channelId: recording.channelId });
}

export async function getUserRecordings(uid: string): Promise<RecordingSession[]> {
  try {
    const snap = await db.collection('recordings')
      .where("userId", "==", uid)
      .orderBy("timestamp", "desc") // requires composite index or simple if just userId
      .get();
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as RecordingSession));
  } catch (e: any) {
    // If index is missing, try without sort client-side
    if (e.code === 'failed-precondition') {
        const snap = await db.collection('recordings').where("userId", "==", uid).get();
        const data = snap.docs.map(d => ({ ...d.data(), id: d.id } as RecordingSession));
        return data.sort((a, b) => b.timestamp - a.timestamp);
    }
    console.error("Failed to get recordings", e);
    return [];
  }
}

export async function deleteRecordingReference(recordingId: string, mediaUrl: string, transcriptUrl: string): Promise<void> {
  await db.collection('recordings').doc(recordingId).delete();
  
  // Cleanup Storage
  try {
    if (mediaUrl) await storage.refFromURL(mediaUrl).delete();
    if (transcriptUrl) await storage.refFromURL(transcriptUrl).delete();
  } catch(e) {
    console.warn("Storage cleanup incomplete", e);
  }
}

// --- BOOKINGS (MENTORSHIP & P2P) ---

export async function createBooking(booking: Booking): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Must be logged in to book a session.");
  
  await db.collection('bookings').add(sanitizeData(booking));
  logUserActivity('create_booking', { mentor: booking.mentorName, date: booking.date });
}

export async function getUserBookings(uid: string, email?: string): Promise<Booking[]> {
  try {
    // 1. Fetch Owned Bookings (Created by user)
    const ownedSnap = await db.collection('bookings')
      .where("userId", "==", uid)
      .get();
    const owned = ownedSnap.docs.map(d => ({ ...d.data(), id: d.id } as Booking));

    let invited: Booking[] = [];
    
    // 2. Fetch Invited Bookings (Guest)
    if (email) {
       const invitedSnap = await db.collection('bookings')
         .where("invitedEmail", "==", email)
         .get();
       invited = invitedSnap.docs.map(d => ({ ...d.data(), id: d.id } as Booking));
    }

    // Merge arrays and remove duplicates based on ID
    const merged = [...owned, ...invited];
    const unique = Array.from(new Map(merged.map(item => [item.id, item])).values());

    // Sort by date/time (descending for scheduling)
    return unique.sort((a, b) => {
        const timeA = new Date(`${a.date}T${a.time}`).getTime();
        const timeB = new Date(`${b.date}T${b.time}`).getTime();
        return timeB - timeA; 
    });

  } catch (e) {
    console.warn("Failed to fetch bookings", e);
    return [];
  }
}

export async function getPendingBookings(email: string): Promise<Booking[]> {
  if (!email) return [];
  // Check for P2P meetings where this user is the invitee AND status is pending
  const snapshot = await db.collection('bookings')
    .where("invitedEmail", "==", email)
    .where("status", "==", "pending")
    .where("type", "==", "p2p")
    .get();
  
  return snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Booking));
}

export async function respondToBooking(bookingId: string, accept: boolean): Promise<void> {
  const ref = db.collection('bookings').doc(bookingId);
  const status = accept ? 'scheduled' : 'rejected';
  await ref.update({ status });
  logUserActivity('respond_booking', { bookingId, status });
}

export async function updateBookingInvite(bookingId: string, email: string): Promise<void> {
  await db.collection('bookings').doc(bookingId).update({
    invitedEmail: email
  });
}

export async function updateBookingRecording(bookingId: string, recordingUrl: string, transcriptUrl: string): Promise<void> {
  await db.collection('bookings').doc(bookingId).update({
    recordingUrl,
    transcriptUrl,
    status: 'completed'
  });
}

export async function cancelBooking(bookingId: string): Promise<void> {
  await db.collection('bookings').doc(bookingId).update({ status: 'cancelled' });
  logUserActivity('cancel_booking', { bookingId });
}

export async function deleteBookingRecording(bookingId: string, recordingUrl?: string, transcriptUrl?: string): Promise<void> {
  const batch = db.batch();
  const ref = db.collection('bookings').doc(bookingId);

  // Remove recording links from the booking document
  batch.update(ref, {
    recordingUrl: firebase.firestore.FieldValue.delete(),
    transcriptUrl: firebase.firestore.FieldValue.delete()
  });

  await batch.commit();

  // Attempt to delete files from storage
  if (recordingUrl) {
    try { await storage.refFromURL(recordingUrl).delete(); } catch(e) { console.warn("Audio delete failed", e); }
  }
  if (transcriptUrl) {
    try { await storage.refFromURL(transcriptUrl).delete(); } catch(e) { console.warn("Transcript delete failed", e); }
  }
  
  logUserActivity('delete_recording', { bookingId });
}

// --- CODE PROJECTS ---

export async function saveCodeProject(project: CodeProject): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Must be logged in to save project");
  
  const projectData = {
    ...project,
    ownerId: user.uid,
    lastModified: Date.now()
  };
  
  // Use project ID as document ID for consistency
  await db.collection('code_projects').doc(project.id).set(sanitizeData(projectData), { merge: true });
  logUserActivity('save_code_project', { projectId: project.id, name: project.name });
}

export async function getUserCodeProjects(uid: string): Promise<CodeProject[]> {
  try {
    const snap = await db.collection('code_projects')
      .where("ownerId", "==", uid)
      .get();
    return snap.docs.map(d => d.data() as CodeProject).sort((a, b) => b.lastModified - a.lastModified);
  } catch(e) {
    console.warn("Failed to get code projects", e);
    return [];
  }
}
