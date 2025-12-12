
export type AttachmentType = 'image' | 'audio' | 'video' | 'file';

export interface Attachment {
  id: string;
  type: AttachmentType;
  url: string;
  name?: string;
  uploadedAt?: number;
}

export interface Comment {
  id: string;
  userId?: string; // Added for ownership check
  user: string;
  text: string;
  timestamp: number;
  attachments?: Attachment[];
}

export interface TranscriptItem {
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
}

export interface SubTopic {
  id: string;
  title: string;
  isCompleted?: boolean;
}

export interface Chapter {
  id: string;
  title: string;
  subTopics: SubTopic[];
}

export type ChannelVisibility = 'private' | 'public' | 'group';

export interface Channel {
  id: string;
  title: string;
  description: string;
  author: string;
  ownerId?: string; // Firebase UID of creator
  visibility?: ChannelVisibility;
  groupId?: string; // If visibility is 'group'
  voiceName: string; // 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
  systemInstruction: string;
  likes: number;
  dislikes: number;
  comments: Comment[];
  tags: string[];
  imageUrl: string;
  welcomeMessage?: string;
  starterPrompts?: string[];
  chapters?: Chapter[];
  appendix?: Attachment[]; // New field for generated/uploaded docs
  createdAt?: number; // Timestamp for sorting
}

export interface LectureSection {
  speaker: string; // 'Teacher' | 'Student'
  text: string;
  discussionId?: string; // ID of the linked discussion
}

export interface GeneratedLecture {
  topic: string;
  professorName: string;
  studentName: string;
  sections: LectureSection[];
}

export interface CommunityDiscussion {
  id: string;
  lectureId: string;
  channelId: string;
  userId: string;
  userName: string;
  transcript: TranscriptItem[];
  summary?: string;
  designDoc?: string; // New field for generated formal document
  createdAt: number;
  segmentIndex?: number; // If linked to a specific segment
  updatedAt?: number;
  title?: string; // Editable title for docs
  isManual?: boolean; // Created manually via editor
}

export type ViewState = 'directory' | 'podcast_detail' | 'live_session' | 'create_channel' | 'debug' | 'cloud_debug' | 'public_debug' | 'mission' | 'code_studio' | 'whiteboard' | 'blog' | 'chat' | 'careers' | 'user_guide';

export interface AudioState {
  isConnected: boolean;
  isTalking: boolean;
  volume: number;
}

export interface Group {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  createdAt: number;
}

export type SubscriptionTier = 'free' | 'pro';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  groups: string[]; // IDs of groups joined
  apiUsageCount?: number;
  createdAt?: number; // Added for sorting
  lastLogin?: any;
  subscriptionTier?: SubscriptionTier;
  subscriptionStatus?: 'active' | 'past_due' | 'canceled';
  defaultRepoUrl?: string; // User preferred git repo
}

export interface Invitation {
  id: string;
  fromUserId: string;
  fromName: string;
  toEmail: string;
  groupId: string;
  groupName: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
}

export interface Booking {
  id: string;
  userId: string;
  hostName?: string; // Name of the person booking (for P2P)
  mentorId: string; // Corresponds to Channel ID OR 'p2p-meeting'
  mentorName: string; // Channel Title OR 'Peer Meeting'
  mentorImage: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  topic: string;
  invitedEmail?: string; // For inviting another member or the P2P Guest
  status: 'scheduled' | 'completed' | 'cancelled' | 'pending' | 'rejected';
  type?: 'ai' | 'p2p';
  createdAt: number;
  recordingUrl?: string; // URL to audio recording
  transcriptUrl?: string; // URL to transcript markdown
}

export interface RecordingSession {
  id: string;
  userId: string;
  channelId: string;
  channelTitle: string;
  channelImage: string;
  timestamp: number;
  mediaUrl: string;     // audio or video
  mediaType: string;    // mime type
  transcriptUrl: string;
}

export interface TodoItem {
  id: string;
  text: string;
  isCompleted: boolean;
  date: string; // YYYY-MM-DD
}

export interface CodeFile {
  name: string;
  language: 'python' | 'javascript' | 'typescript' | 'html' | 'css' | 'java' | 'c++' | 'c' | 'rust' | 'go' | 'c#' | 'json' | 'markdown' | 'text' | 'typescript (react)' | 'javascript (react)' | 'plantuml';
  content: string;
  sha?: string; // GitHub blob SHA for updates
  path?: string; // Full path in repo
  loaded?: boolean; // For lazy loading large repos
  isDirectory?: boolean; // Is this a folder?
  treeSha?: string; // If folder, the SHA of the tree
  childrenFetched?: boolean; // Have we fetched this folder's contents?
  isModified?: boolean; // Has the file been edited locally?
}

export interface ChatMessage {
  role: 'user' | 'ai' | 'system';
  text: string;
}

export interface GithubMetadata {
  owner: string;
  repo: string;
  branch: string;
  sha: string;
}

export interface CursorPosition {
  clientId: string; // Unique per session/tab (allows same user in 2 tabs)
  userId: string;
  userName: string;
  fileName: string; // The file they are looking at
  line: number; // 1-based line number
  column: number; // 0-based column index
  color: string;
  updatedAt: number;
}

export interface CodeProject {
  id: string;
  name: string;
  files: CodeFile[];
  lastModified: number;
  ownerId?: string;
  github?: GithubMetadata;
  review?: string;
  humanComments?: string;
  interviewFeedback?: string;
  chatHistory?: ChatMessage[];
  cursors?: Record<string, CursorPosition>; // Map of ClientID -> Cursor
  activeClientId?: string; // LOCK: The ClientID currently holding write access
  activeWriterName?: string; // Display name of the active writer
  activeFilePath?: string; // SYNC: The file path currently active by the writer
  editRequest?: { // Pending request for control
    clientId: string;
    userName: string;
    timestamp: number;
  };
}

export interface Blog {
  id: string;
  ownerId: string;
  authorName: string;
  title: string;
  description: string;
  createdAt: number;
}

export interface BlogPost {
  id: string;
  blogId: string;
  authorId: string;
  authorName: string;
  authorImage?: string;
  title: string;
  content: string;
  excerpt: string;
  tags: string[];
  status: 'draft' | 'published';
  publishedAt?: number;
  createdAt: number;
  likes: number;
  imageUrl?: string;
  comments?: Comment[];
  commentCount?: number;
}

export interface ChatChannel {
  id: string;
  name: string;
  type: 'public' | 'group' | 'dm';
  groupId?: string;
  memberIds?: string[];
  lastMessage?: {
    text: string;
    senderName: string;
    timestamp: number;
  };
  createdAt: number;
}

export interface RealTimeMessage {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderImage?: string;
  timestamp: any; // Firestore Timestamp or number
  replyTo?: {
    id: string;
    text: string;
    senderName: string;
  };
}

export interface CareerApplication {
  id?: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhotoURL?: string; // Added for displaying profile photo
  role: 'mentor' | 'expert' | 'contributor';
  expertise: string[];
  bio: string;
  resumeUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

export interface JobPosting {
  id?: string;
  title: string;
  company: string;
  location: string;
  type: 'full-time' | 'part-time' | 'contract' | 'freelance';
  description: string;
  requirements?: string;
  contactEmail: string;
  postedBy: string; // userId
  postedAt: number;
}
