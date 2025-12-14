export type SubscriptionTier = 'free' | 'pro';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  groups: string[];
  interests?: string[];
  likedChannelIds?: string[];
  apiUsageCount?: number;
  createdAt?: number;
  lastLogin?: any;
  subscriptionTier?: SubscriptionTier;
  subscriptionStatus?: 'active' | 'past_due' | 'canceled';
  defaultRepoUrl?: string;
  followers?: string[];
  following?: string[];
}

export interface RecordingSession {
  id: string;
  userId: string;
  channelId: string;
  channelTitle: string;
  channelImage: string;
  timestamp: number;
  mediaUrl: string;
  mediaType: string;
  transcriptUrl: string;
}

export interface Channel {
  id: string;
  title: string;
  description: string;
  author: string;
  ownerId?: string;
  visibility: 'private' | 'public' | 'group';
  groupId?: string;
  voiceName: string;
  systemInstruction: string;
  likes: number;
  dislikes: number;
  comments: Comment[];
  tags: string[];
  imageUrl: string;
  createdAt?: number;
  chapters?: Chapter[];
  welcomeMessage?: string;
  starterPrompts?: string[];
  appendix?: Attachment[];
  shares?: number;
}

export type ChannelVisibility = 'private' | 'public' | 'group';

export interface Comment {
  id: string;
  userId: string;
  user: string;
  text: string;
  timestamp: number;
  attachments?: Attachment[];
}

export interface Attachment {
  id: string;
  type: AttachmentType;
  url: string;
  name: string;
  uploadedAt?: number;
}

export type AttachmentType = 'image' | 'video' | 'audio' | 'file';

export interface Chapter {
  id: string;
  title: string;
  subTopics: SubTopic[];
}

export interface SubTopic {
  id: string;
  title: string;
}

export interface TranscriptItem {
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
}

export interface GeneratedLecture {
  topic: string;
  professorName: string;
  studentName: string;
  sections: { speaker: string; text: string; discussionId?: string }[];
}

export interface CommunityDiscussion {
  id: string;
  lectureId: string;
  channelId: string;
  userId: string;
  userName: string;
  transcript: TranscriptItem[];
  createdAt: number;
  segmentIndex?: number;
  summary?: string;
  title?: string;
  designDoc?: string;
  isManual?: boolean;
}

export interface Group {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  createdAt: number;
}

export interface Invitation {
  id: string;
  groupId?: string;
  groupName?: string;
  fromId: string;
  fromName: string;
  toEmail: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
  type: 'group' | 'session';
  link?: string;
}

export interface Booking {
  id: string;
  userId: string;
  hostName?: string;
  mentorId: string;
  mentorName: string;
  mentorImage: string;
  date: string;
  time: string;
  topic: string;
  invitedEmail?: string;
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled' | 'rejected';
  createdAt: number;
  type?: 'ai' | 'p2p';
  recordingUrl?: string;
  transcriptUrl?: string;
}

export interface TodoItem {
  id: string;
  text: string;
  isCompleted: boolean;
  date: string;
}

export interface BlogPost {
  id: string;
  blogId: string;
  authorId: string;
  authorName: string;
  authorImage?: string;
  title: string;
  excerpt?: string;
  content: string;
  tags: string[];
  status: 'draft' | 'published';
  publishedAt?: number;
  createdAt: number;
  likes: number;
  commentCount: number;
  comments?: Comment[];
}

export interface Blog {
  id: string;
  userId: string;
  title: string;
  description: string;
}

export interface CodeProject {
  id: string;
  name: string;
  files: CodeFile[];
  lastModified: number;
  github?: {
    owner: string;
    repo: string;
    branch: string;
    sha: string;
  };
  ownerId?: string;
  activeClientId?: string;
  activeWriterName?: string;
  cursors?: Record<string, CursorPosition>;
  activeFilePath?: string;
  accessLevel?: 'public' | 'restricted';
  allowedUserIds?: string[];
}

export interface CodeFile {
  name: string;
  path: string; // Full path or unique identifier
  content: string;
  language: string;
  loaded: boolean; // For lazy loading
  isDirectory: boolean;
  isModified: boolean;
  sha?: string; // GitHub SHA
  treeSha?: string; // For directories
  childrenFetched?: boolean;
}

export interface CursorPosition {
  clientId: string;
  userName: string;
  fileName: string;
  line: number;
  col: number;
  color: string;
  updatedAt: number;
}

export interface CloudItem {
  name: string;
  fullPath: string;
  isFolder: boolean;
  url?: string;
}

export interface WhiteboardElement {
  id: string;
  type: ToolType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color: string;
  strokeWidth: number;
  points?: { x: number; y: number }[];
  text?: string;
  endX?: number;
  endY?: number;
  lineStyle?: LineStyle;
  brushType?: BrushType;
  fontSize?: number;
  fontFamily?: string;
  borderRadius?: number;
  rotation?: number;
  startArrow?: boolean;
  endArrow?: boolean;
}

export type ToolType = 'select' | 'pan' | 'pen' | 'eraser' | 'rect' | 'circle' | 'line' | 'arrow' | 'text' | 'curve' | 'triangle' | 'star';
export type LineStyle = 'solid' | 'dashed' | 'dotted' | 'dash-dot' | 'long-dash';
export type BrushType = 'standard' | 'pencil' | 'marker' | 'calligraphy-pen' | 'writing-brush' | 'airbrush' | 'oil' | 'watercolor' | 'crayon';

export interface GlobalStats {
  totalLogins: number;
  uniqueUsers: number;
}

export interface CareerApplication {
  userId: string;
  userName: string;
  userEmail: string;
  userPhotoURL?: string;
  role: 'mentor' | 'expert';
  expertise: string[];
  bio: string;
  resumeUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  id?: string;
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
  postedBy: string;
  postedAt: number;
}

export interface RealTimeMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderImage?: string;
  text: string;
  timestamp: any; // Firestore Timestamp
  replyTo?: {
    id: string;
    text: string;
    senderName: string;
  };
  attachments?: {
    type: 'image' | 'video' | 'file';
    url: string;
    name: string;
  }[];
}

export interface ChatChannel {
  id: string;
  type: 'dm';
  participants: string[];
  name: string;
  lastMessage?: string;
  lastMessageTime?: number;
}