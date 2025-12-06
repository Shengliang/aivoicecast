

export type AttachmentType = 'image' | 'audio' | 'video' | 'file';

export interface Attachment {
  id: string;
  type: AttachmentType;
  url: string;
  name?: string;
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

export type ViewState = 'directory' | 'podcast_detail' | 'live_session' | 'create_channel' | 'debug' | 'cloud_debug' | 'public_debug' | 'mission' | 'code_studio';

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

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  groups: string[]; // IDs of groups joined
  apiUsageCount?: number;
  createdAt?: number; // Added for sorting
  lastLogin?: any;
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
  language: 'python' | 'javascript' | 'typescript' | 'html' | 'css' | 'java' | 'c++' | 'c' | 'rust' | 'go' | 'c#' | 'json' | 'markdown' | 'text' | 'typescript (react)' | 'javascript (react)';
  content: string;
}

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

export interface CodeProject {
  id: string;
  name: string;
  files: CodeFile[];
  lastModified: number;
  review?: string; // Code Review
  humanComments?: string; // Interviewer/Human notes
  ownerId?: string;
  chatHistory?: ChatMessage[]; // Chat with AI assistant
  interviewFeedback?: string; // Holistic interview feedback
}