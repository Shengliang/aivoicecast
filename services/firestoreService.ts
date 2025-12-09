
// [FORCE-SYNC-v3.44.0] Timestamp: ${new Date().toISOString()}
import { db, auth, storage } from './firebaseConfig';
import firebase from 'firebase/compat/app';
import { Channel, Group, UserProfile, Invitation, GeneratedLecture, CommunityDiscussion, Comment, Booking, RecordingSession, TranscriptItem, CodeProject, Attachment, Blog, BlogPost, SubscriptionTier, CodeFile, CursorPosition, RealTimeMessage, ChatChannel } from '../types';
import { HANDCRAFTED_CHANNELS } from '../utils/initialData';
import { SPOTLIGHT_DATA } from '../utils/spotlightContent';
import { OFFLINE_LECTURES, OFFLINE_CHANNEL_ID } from '../utils/offlineContent';

// --- STRIPE CONFIGURATION ---
// REPLACE THIS WITH YOUR ACTUAL STRIPE PRICE ID FROM THE DASHBOARD

export const STRIPE_PRICE_ID_PROMO = 'price_1ScFfnIVNYhSs7Hca9yHlHwA'; // $0.01 for 1st month
export const STRIPE_PRICE_ID_REGULAR = 'price_1ScGG7IVNYhSs7HchATUVYY4'; // $29.00/mo normal

// Set the active price ID here
export const STRIPE_PRICE_ID = STRIPE_PRICE_ID_PROMO; 

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

// --- WORKPLACE CHAT ---

export async function sendMessage(channelId: string, text: string, collectionPath?: string, replyTo?: any): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("Must be logged in");

    // Default collection path is 'chat_channels/{id}/messages', but groups use 'groups/{id}/messages'
    const basePath = collectionPath || `chat_channels/${channelId}/messages`;
    
    const payload: any = {
        text,
        senderId: user.uid,
        senderName: user.displayName || 'Anonymous',
        senderImage: user.photoURL || '',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (replyTo) {
        payload.replyTo = sanitizeData(replyTo);
    }
    
    await db.collection(basePath).add(payload);

    // Update last message on the parent doc if it's a chat_channel
    if (basePath.startsWith('chat_channels')) {
        db.collection('chat_channels').doc(channelId).set({
            lastMessage: {
                text,
                senderName: user.displayName || 'Anonymous',
                timestamp: Date.now()
            }
        }, { merge: true });
    }
}

export async function deleteMessage(channelId: string, messageId: string, collectionPath?: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("Must be logged in");

    const basePath = collectionPath || `chat_channels/${channelId}/messages`;
    // Note: Firestore Rules should enforce ownership check
    await db.collection(basePath).doc(messageId).delete();
}

export function subscribeToMessages(channelId: string, onUpdate: (msgs: RealTimeMessage[]) => void, collectionPath?: string): () => void {
    const basePath = collectionPath || `chat_channels/${channelId}/messages`;
    
    return db.collection(basePath)
        .orderBy('timestamp', 'desc')
        .limit(50)
        .onSnapshot((snapshot) => {
            const msgs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as RealTimeMessage)).reverse();
            onUpdate(msgs);
        });
}

export async function createOrGetDMChannel(otherUserId: string): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error("Must be logged in");

    // Check if DM exists
    const snap = await db.collection('chat_channels')
        .where('type', '==', 'dm')
        .where('memberIds', 'array-contains', user.uid)
        .get();

    const existing = snap.docs.find(doc => {
        const data = doc.data();
        return data.memberIds.includes(otherUserId);
    });

    if (existing) return existing.id;

    // Create new
    const otherUser = await getUserProfile(otherUserId);
    const name = otherUser ? `${user.displayName} & ${otherUser.displayName}` : 'Direct Message';

    const docRef = await db.collection('chat_channels').add({
        type: 'dm',
        memberIds: [user.uid, otherUserId],
        name,
        createdAt: Date.now()
    });
    return docRef.id;
}

export async function getUserDMChannels(): Promise<ChatChannel[]> {
    const user = auth.currentUser;
    if (!user) return [];

    const snap = await db.collection('chat_channels')
        .where('type', '==', 'dm')
        .where('memberIds', 'array-contains', user.uid)
        .get();

    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatChannel));
}

// --- REAL-TIME COLLABORATION LISTENERS ---

export function subscribeToCodeProject(projectId: string, onUpdate: (project: CodeProject) => void): () => void {
  return db.collection('code_projects').doc(projectId).onSnapshot((doc) => {
    if (doc.exists) {
      const data = doc.data();
      let files: CodeFile[] = [];
      
      // Handle both legacy Array and new Map structure
      if (Array.isArray(data?.files)) {
          files = data.files as CodeFile[];
      } else if (data?.files && typeof data.files === 'object') {
          // Sort by name or some other criteria to maintain order stability
          files = (Object.values(data.files) as CodeFile[]).sort((a: any, b: any) => {
              if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
              return a.name.localeCompare(b.name);
          });
      }
      
      onUpdate({ ...data, id: doc.id, files } as CodeProject);
    }
  });
}

// Granular Update for Single File (Supports Concurrent Editing of Different Files)
export async function updateCodeFile(projectId: string, file: CodeFile): Promise<void> {
    const safeFile = sanitizeData(file);
    // Use FieldPath to strictly treat the filename as a key, preventing dot-notation parsing
    // e.g. 'files.main.js' becomes {'files': {'main.js': val}} instead of {'files': {'main': {'js': val}}}
    const path = new firebase.firestore.FieldPath('files', file.name);
    
    await db.collection('code_projects').doc(projectId).update(
        path, safeFile,
        'lastModified', Date.now()
    );
}

export async function deleteCodeFile(projectId: string, fileName: string): Promise<void> {
    const path = new firebase.firestore.FieldPath('files', fileName);
    await db.collection('code_projects').doc(projectId).update(
        path, firebase.firestore.FieldValue.delete(),
        'lastModified', Date.now()
    );
}

// Update User Cursor Position
export async function updateCursor(projectId: string, cursor: CursorPosition): Promise<void> {
    if (!cursor.userId) return;
    // Use UserID as key so we only have one cursor per authenticated user (simplifying cursor count)
    const path = new firebase.firestore.FieldPath('cursors', cursor.userId);
    await db.collection('code_projects').doc(projectId).update(
        path, sanitizeData(cursor)
    );
}

// Updated to handle both Legacy Arrays and New Maps
export function subscribeToWhiteboard(boardId: string, onUpdate: (elements: any[]) => void): () => void {
  return db.collection('whiteboards').doc(boardId).onSnapshot((doc) => {
    if (doc.exists) {
      const data = doc.data();
      let elements: any[] = [];
      if (Array.isArray(data?.elements)) {
          elements = data.elements; // Support legacy array format
      } else if (data?.elements && typeof data.elements === 'object') {
          elements = Object.values(data.elements); // Convert Map to Array for UI
      }
      onUpdate(elements);
    }
  });
}

// Bulk Save / Reset (Overwrites everything with a Map)
export async function saveWhiteboardSession(boardId: string, elements: any[]): Promise<void> {
  const user = auth.currentUser;
  
  // Convert Array to Map for granular updates later
  const elementsMap: Record<string, any> = {};
  elements.forEach(el => {
      if(el.id) elementsMap[el.id] = sanitizeData(el);
  });

  // Prepare payload
  const payload: any = {
    elements: elementsMap,
    lastModified: Date.now(),
    updatedBy: user?.uid || 'anonymous'
  };

  if (user) {
      payload.ownerId = user.uid;
  }

  // Use set with merge to update the map structure
  await db.collection('whiteboards').doc(boardId).set(payload, { merge: true });
}

// NEW: Update Single Element (Granular Sync)
export async function updateWhiteboardElement(boardId: string, element: any): Promise<void> {
    if (!element || !element.id) return;
    const path = new firebase.firestore.FieldPath('elements', element.id);
    
    await db.collection('whiteboards').doc(boardId).update(
        path, sanitizeData(element),
        'lastModified', Date.now()
    );
}

// NEW: Delete Elements (Granular Sync)
export async function deleteWhiteboardElements(boardId: string, elementIds: string[]): Promise<void> {
    if (elementIds.length === 0) return;
    
    // We can't use a single map for FieldPath keys easily in update() without varargs
    // but the SDK supports alternating key/values.
    // For simplicity, we loop updates or use a batch if strictly typed, 
    // but standard .update({...}) works if we construct the object carefully,
    // HOWEVER, FieldPath is best. Since we can't dynamic key FieldPath in object literal easily,
    // we iterate or use dot notation if we are sure IDs are safe.
    // UUIDs are safe for dot notation (no dots), so we fall back to dot notation for bulk delete
    // OR we chain updates. 
    
    // Better approach:
    const updateObj: any = { lastModified: Date.now() };
    elementIds.forEach(id => {
        // IDs are UUIDs, safe to use dot notation 'elements.UUID'
        updateObj[`elements.${id}`] = firebase.firestore.FieldValue.delete();
    });
    
    await db.collection('whiteboards').doc(boardId).update(updateObj);
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
      createdAt: Date.now(),
      subscriptionTier: 'free',
      subscriptionStatus: 'active'
    };
    await userRef.set(sanitizeData(newProfile));
  } else {
    // Update login time or details if needed
    const data = snap.data();
    
    // Safety check: ensure retrieved tier matches valid types
    let tier: SubscriptionTier = 'free';
    if (data?.subscriptionTier === 'pro') tier = 'pro';
    if (data?.subscriptionTier === 'creator') tier = 'pro'; // Legacy support

    await userRef.update({
      lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
      displayName: user.displayName || 'Anonymous',
      photoURL: user.photoURL || '',
      // We don't overwrite tier here, it should be managed by the subscription listener
    });
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return null;
  
  const data = snap.data();
  // Safe cast
  let tier: SubscriptionTier = 'free';
  if (data?.subscriptionTier === 'pro' || data?.subscriptionTier === 'creator') tier = 'pro';
  
  // Ensure uid is always present by using the argument or doc ID
  return { ...data, uid: uid, subscriptionTier: tier } as UserProfile;
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

// --- SUBSCRIPTIONS & STRIPE ---

export async function createStripeCheckoutSession(uid: string): Promise<string> {
    if (!uid) throw new Error("User ID missing");

    // SAFETY CHECK: Ensure Price ID is valid (basic check)
    if (!STRIPE_PRICE_ID || STRIPE_PRICE_ID.includes('placeholder')) {
        throw new Error("Configuration Error: The 'STRIPE_PRICE_ID' in services/firestoreService.ts is invalid.");
    }

    // 1. Create a document in the checkout_sessions collection
    // This triggers the "Run Payments with Stripe" extension
    try {
        const sessionRef = await db
            .collection('customers')
            .doc(uid)
            .collection('checkout_sessions')
            .add({
                price: STRIPE_PRICE_ID,
                success_url: window.location.href, // Redirect back to app
                cancel_url: window.location.href,
            });

        // 2. Listen for the `url` field to be populated by the extension
        return new Promise<string>((resolve, reject) => {
            const unsubscribe = sessionRef.onSnapshot((snap) => {
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
            
            // Timeout after 15s to prevent hanging
            setTimeout(() => {
                unsubscribe();
                reject(new Error("Timeout waiting for Stripe. The Firebase Extension may be cold-starting or misconfigured. Please try again."));
            }, 15000);
        });
    } catch (e: any) {
        if (e.code === 'permission-denied') {
            throw new Error("permission-denied");
        }
        throw e;
    }
}

// Create a session for the Stripe Customer Portal (Cancel/Manage Subscription)
export async function createStripePortalSession(uid: string): Promise<string> {
    if (!uid) throw new Error("User ID missing");

    try {
        const sessionRef = await db
            .collection('customers')
            .doc(uid)
            .collection('portal_sessions')
            .add({
                return_url: window.location.href, 
            });

        return new Promise<string>((resolve, reject) => {
            const unsubscribe = sessionRef.onSnapshot((snap) => {
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
            // Timeout after 15s
            setTimeout(() => {
                unsubscribe();
                reject(new Error("Timeout waiting for Stripe Portal."));
            }, 15000);
        });
    } catch (e: any) {
        if (e.code === 'permission-denied') {
            throw new Error("permission-denied");
        }
        throw e;
    }
}

// Listen for subscription changes in real-time
export function setupSubscriptionListener(uid: string, onUpdate: (tier: SubscriptionTier) => void) {
    if (!uid) return () => {};

    // Watch the `subscriptions` sub-collection for this user
    return db
        .collection('customers')
        .doc(uid)
        .collection('subscriptions')
        .where('status', 'in', ['active', 'trialing'])
        .onSnapshot(async (snapshot) => {
            // If any active subscription exists, they are PRO
            const isPro = !snapshot.empty;
            const newTier: SubscriptionTier = isPro ? 'pro' : 'free';
            
            // Sync to User Profile for easier access elsewhere
            const userRef = db.collection('users').doc(uid);
            await userRef.set({ subscriptionTier: newTier }, { merge: true });
            
            onUpdate(newTier);
        }, (error) => {
            // console.warn("Subscription listener error:", error);
            // Permissions errors are common here if rules aren't set, suppress warning spam
        });
}

// Legacy Mock function - Deprecated, kept for backward compat if needed temporarily
export async function upgradeUserSubscription(uid: string, tier: SubscriptionTier): Promise<boolean> {
    return true; // No-op, now handled by Stripe listener
}

// FORCE UPGRADE FOR DEBUGGING
export async function forceUpgradeDebug(uid: string): Promise<void> {
    const userRef = db.collection('users').doc(uid);
    await userRef.set({ subscriptionTier: 'pro' }, { merge: true });
    logUserActivity('debug_force_upgrade', {});
}

export async function downgradeUserSubscription(uid: string): Promise<boolean> {
    // This handles manual local downgrade if needed, but Portal is preferred.
    const userRef = db.collection('users').doc(uid);
    try {
        await userRef.set({
            subscriptionTier: 'free'
        }, { merge: true });
        
        try { logUserActivity('downgrade_subscription', {}); } catch(e) {}
        return true;
    } catch (e: any) {
        throw e;
    }
}

export async function getBillingHistory(uid: string): Promise<any[]> {
    // In real app, query `customers/{uid}/payments`
    return [
        { date: new Date().toLocaleDateString(), amount: '29.00', status: 'paid' },
    ];
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

export async function createGroup(name: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Must be logged in");

  const newGroupRef = db.collection('groups').doc();
  const newGroup: Group = {
    id: newGroupRef.id, 
    name,
    ownerId: user.uid,
    memberIds: [user.uid],
    createdAt: Date.now()
  };

  // Use set instead of add/update to prevent permission errors on incomplete docs
  await newGroupRef.set(sanitizeData(newGroup));

  const userRef = db.collection('users').doc(user.uid);
  // We try to update user, but if rules block it, the group is still created
  try {
      await userRef.update({
        groups: firebase.firestore.FieldValue.arrayUnion(newGroupRef.id)
      });
  } catch (e) {
      console.warn("Could not link group to user profile directly (might be handled by rules or triggers)", e);
  }
  
  logUserActivity('create_group', { groupId: newGroupRef.id, name });

  return newGroupRef.id;
}

export async function joinGroup(groupId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Must be logged in");

  const groupRef = db.collection('groups').doc(groupId);
  const groupSnap = await groupRef.get();

  if (!groupSnap.exists) {
    throw new Error("Group not found");
  }

  await groupRef.update({
    memberIds: firebase.firestore.FieldValue.arrayUnion(user.uid)
  });

  const userRef = db.collection('users').doc(user.uid);
  await userRef.update({
    groups: firebase.firestore.FieldValue.arrayUnion(groupId)
  });
  
  logUserActivity('join_group', { groupId });
}

export async function getUserGroups(uid: string): Promise<Group[]> {
  const profile = await getUserProfile(uid);
  if (!profile || !profile.groups || profile.groups.length === 0) return [];

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
  const promises = memberIds.map(uid => getUserProfile(uid));
  const results = await Promise.all(promises);
  return results.filter(p => p !== null) as UserProfile[];
}

// Get all unique members from all groups a user is in (for Workspace Chat)
export async function getUniqueGroupMembers(uid: string): Promise<UserProfile[]> {
    const userGroups = await getUserGroups(uid);
    if (userGroups.length === 0) return [];

    // Collect all member IDs
    const allMemberIds = new Set<string>();
    userGroups.forEach(g => {
        if (g.memberIds) {
            g.memberIds.forEach(mid => {
                if (mid !== uid) allMemberIds.add(mid); // Exclude self
            });
        }
    });

    if (allMemberIds.size === 0) return [];
    
    // Fetch profiles
    const profiles = await getGroupMembers(Array.from(allMemberIds));
    return profiles;
}

export async function removeMemberFromGroup(groupId: string, memberId: string): Promise<void> {
    const batch = db.batch();
    const groupRef = db.collection('groups').doc(groupId);
    const userRef = db.collection('users').doc(memberId);

    batch.update(groupRef, {
        memberIds: firebase.firestore.FieldValue.arrayRemove(memberId)
    });

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
  
  if (groupData.ownerId !== user.uid) {
     throw new Error("Only the group owner can invite members.");
  }

  const invitation: Invitation = {
    id: '', 
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

  const inviteRef = db.collection('invitations').doc(invitation.id);
  batch.update(inviteRef, { status: accept ? 'accepted' : 'rejected' });

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
  const data = {
    ...channel,
    createdAt: channel.createdAt || Date.now(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  const cleanData = sanitizeData(data);
  await db.collection('channels').doc(channel.id).set(cleanData, { merge: true });
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
  const snapshot = await db.collection('channels')
    .where("visibility", "==", "public")
    .get();
    
  const channels = snapshot.docs.map(d => d.data() as Channel);
  const sorted = channels.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return sorted;
}

export function subscribeToPublicChannels(
  onUpdate: (channels: Channel[]) => void, 
  onError: (error: Error) => void
): () => void {
  return db.collection('channels')
    .where("visibility", "==", "public")
    .onSnapshot(
      (snapshot) => {
        const channels = snapshot.docs.map(d => d.data() as Channel);
        channels.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        onUpdate(channels);
      },
      (error) => {
        onError(error);
      }
    );
}

export async function getGroupChannels(groupIds: string[]): Promise<Channel[]> {
  if (groupIds.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < groupIds.length; i += 10) {
    chunks.push(groupIds.slice(i, i + 10));
  }

  let results: Channel[] = [];
  for (const chunk of chunks) {
    const snap = await db.collection('channels').where("groupId", "in", chunk).get();
    snap.forEach(d => results.push(d.data() as Channel));
  }
  return results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// --- LECTURE CACHING ---

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

// --- DISCUSSIONS ---

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
      
      if (data.sections && data.sections[sectionIndex]) {
        data.sections[sectionIndex].discussionId = discussionId;
        t.set(lectureRef, sanitizeData(data)); 
      }
    });
  } catch(e) {
    console.error("Failed to link discussion to segment", e);
    throw e;
  }
}

// --- RECORDINGS ---

export async function saveRecordingReference(recording: RecordingSession): Promise<void> {
  await db.collection('recordings').add(sanitizeData(recording));
  logUserActivity('save_recording', { channelId: recording.channelId });
}

export async function getUserRecordings(uid: string): Promise<RecordingSession[]> {
  try {
    const snap = await db.collection('recordings')
      .where("userId", "==", uid)
      .orderBy("timestamp", "desc") 
      .get();
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as RecordingSession));
  } catch (e: any) {
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
  try {
    if (mediaUrl) await storage.refFromURL(mediaUrl).delete();
    if (transcriptUrl) await storage.refFromURL(transcriptUrl).delete();
  } catch(e) {
    console.warn("Storage cleanup incomplete", e);
  }
}

// --- BOOKINGS ---

export async function createBooking(booking: Booking): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Must be logged in to book a session.");
  await db.collection('bookings').add(sanitizeData(booking));
  logUserActivity('create_booking', { mentor: booking.mentorName, date: booking.date });
}

export async function getUserBookings(uid: string, email?: string): Promise<Booking[]> {
  try {
    const ownedSnap = await db.collection('bookings')
      .where("userId", "==", uid)
      .get();
    const owned = ownedSnap.docs.map(d => ({ ...d.data(), id: d.id } as Booking));

    let invited: Booking[] = [];
    if (email) {
       const invitedSnap = await db.collection('bookings')
         .where("invitedEmail", "==", email)
         .get();
       invited = invitedSnap.docs.map(d => ({ ...d.data(), id: d.id } as Booking));
    }

    const merged = [...owned, ...invited];
    const unique = Array.from(new Map(merged.map(item => [item.id, item])).values());

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

  batch.update(ref, {
    recordingUrl: firebase.firestore.FieldValue.delete(),
    transcriptUrl: firebase.firestore.FieldValue.delete()
  });

  await batch.commit();

  if (recordingUrl) {
    try { await storage.refFromURL(recordingUrl).delete(); } catch(e) {}
  }
  if (transcriptUrl) {
    try { await storage.refFromURL(transcriptUrl).delete(); } catch(e) {}
  }
  
  logUserActivity('delete_recording', { bookingId });
}

// --- CODE PROJECTS ---

export async function saveCodeProject(project: CodeProject): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Must be logged in to save project");
  
  const filesMap: Record<string, any> = {};
  project.files.forEach(f => {
      // Use filename as key? Firestore keys cannot have dots unless we use FieldPath for updates.
      // But for the initial set, we can store it as a nested object map if keys are sanitized.
      // However, sticking to the existing interface, we just save the full object.
      // To support granular updates via `updateCodeFile`, we rely on `update` with FieldPath.
      filesMap[f.name] = sanitizeData(f);
  });

  const projectData = {
    ...project,
    files: filesMap, // Save as Map
    ownerId: user.uid,
    lastModified: Date.now()
  };
  
  await db.collection('code_projects').doc(project.id).set(sanitizeData(projectData), { merge: true });
  logUserActivity('save_code_project', { projectId: project.id, name: project.name });
}

export async function getUserCodeProjects(uid: string): Promise<CodeProject[]> {
  try {
    const snap = await db.collection('code_projects')
      .where("ownerId", "==", uid)
      .get();
    return snap.docs.map(d => {
        const data = d.data();
        let files: CodeFile[] = [];
        if (Array.isArray(data.files)) {
            files = data.files;
        } else if (data.files) {
            files = Object.values(data.files);
        }
        return { ...data, files } as CodeProject;
    }).sort((a, b) => b.lastModified - a.lastModified);
  } catch(e) {
    console.warn("Failed to get code projects", e);
    return [];
  }
}

// --- BLOGGING ---

export async function ensureUserBlog(user: any): Promise<Blog> {
  if (!user) throw new Error("User required");
  
  const snap = await db.collection('blogs').where("ownerId", "==", user.uid).limit(1).get();
  
  if (!snap.empty) {
    return { ...snap.docs[0].data(), id: snap.docs[0].id } as Blog;
  }
  
  const newBlog: Blog = {
    id: user.uid, 
    ownerId: user.uid,
    authorName: user.displayName || 'Anonymous',
    title: `${user.displayName || 'User'}'s Blog`,
    description: 'Welcome to my corner of the internet.',
    createdAt: Date.now()
  };
  
  await db.collection('blogs').doc(user.uid).set(sanitizeData(newBlog));
  return newBlog;
}

export async function updateBlogSettings(blogId: string, updates: Partial<Blog>): Promise<void> {
  await db.collection('blogs').doc(blogId).update(sanitizeData(updates));
}

export async function createBlogPost(post: BlogPost): Promise<string> {
  const docRef = await db.collection('posts').add(sanitizeData(post));
  return docRef.id;
}

export async function updateBlogPost(postId: string, updates: Partial<BlogPost>): Promise<void> {
  await db.collection('posts').doc(postId).update(sanitizeData(updates));
}

export async function getCommunityPosts(limitVal = 20): Promise<BlogPost[]> {
  try {
    const snap = await db.collection('posts')
      .orderBy("createdAt", "desc")
      .limit(50) 
      .get();
      
    const all = snap.docs.map(d => ({ ...d.data(), id: d.id } as BlogPost));
    return all.filter(p => p.status === 'published').slice(0, limitVal);
  } catch(e) {
    console.error("Failed to fetch community posts", e);
    try {
        const snap = await db.collection('posts').where("status", "==", "published").limit(limitVal).get();
        const docs = snap.docs.map(d => ({ ...d.data(), id: d.id } as BlogPost));
        return docs.sort((a, b) => b.createdAt - a.createdAt);
    } catch (e2) {
        return [];
    }
  }
}

export async function getUserPosts(blogId: string): Promise<BlogPost[]> {
  try {
    const snap = await db.collection('posts')
      .where("blogId", "==", blogId)
      .get();
      
    const docs = snap.docs.map(d => ({ ...d.data(), id: d.id } as BlogPost));
    return docs.sort((a, b) => b.createdAt - a.createdAt);
  } catch(e) {
    console.error("Failed to fetch user posts", e);
    return [];
  }
}

export async function getBlogPost(postId: string): Promise<BlogPost | null> {
  try {
    const doc = await db.collection('posts').doc(postId).get();
    return doc.exists ? ({ ...doc.data(), id: doc.id } as BlogPost) : null;
  } catch(e) {
    return null;
  }
}

export async function addPostComment(postId: string, comment: Comment): Promise<void> {
  const ref = db.collection('posts').doc(postId);
  await ref.update({
    comments: firebase.firestore.FieldValue.arrayUnion(sanitizeData(comment)),
    commentCount: firebase.firestore.FieldValue.increment(1)
  });
}

export async function deleteBlogPost(postId: string): Promise<void> {
  await db.collection('posts').doc(postId).delete();
}
