
import { BlogPost } from '../types';

export const ARCHITECTURE_BLOG_POST: BlogPost = {
  id: 'arch-deep-dive-v1',
  blogId: 'system-blog',
  authorId: 'system',
  authorName: 'AIVoiceCast Engineering',
  authorImage: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=200&q=80',
  title: 'Under the Hood: The Architecture of AIVoiceCast',
  excerpt: 'A technical deep dive into how we built the world\'s first generative audio knowledge community. Learn about our React 19 frontend, Firebase backend, and Gemini AI integration.',
  status: 'published',
  publishedAt: 1766016000000, 
  createdAt: 1766016000000,
  likes: 1024,
  commentCount: 0,
  tags: ['Engineering', 'Architecture', 'Firebase', 'Optimization'],
  content: `
# 🛠️ Under the Hood: The Architecture of AIVoiceCast

Welcome to a technical deep dive into the AIVoiceCast platform. Updated as of **December 18, 2025**, this post covers our core stack and our latest optimizations for scaling without infrastructure friction.

---

## 1. Feature Overview
AIVoiceCast supports **6 Core Pillars** of functionality, all integrated into a Single Page Application (SPA):
1. **🎙️ Generative Podcasts**: Creates scripts and audio on-demand using LLMs.
2. **⚡ Live Studio**: Real-time voice-to-voice interaction using WebSockets.
3. **💻 Code Studio**: A full cloud IDE with multi-user collaborative editing.
4. **🎨 Whiteboard**: An infinite canvas shareable in real-time.
5. **💬 Workplace Chat**: A real-time messaging system for teams.
6. **💼 Career Center**: A job board and talent pool for connecting members.

---

## 2. Internal Implementation
### Frontend: React 19 & TypeScript
We use **React 19** to leverage the latest concurrent features. High-frequency data (like audio buffers) stays in \`useRef\` to avoid render overhead.
### Backend: Serverless (Firebase)
* **Auth**: Handles Google & GitHub Sign-In.
* **Firestore**: Stores metadata and social state.
* **Security**: \`firestore.rules\` enforce strict RBAC.

### AI Engine: Gemini API
* **Logic**: \`gemini-3-pro-preview\` for reasoning.
* **Audio**: \`gemini-2.5-flash-preview-tts\` for neural voices.
`
};

export const BACKGROUND_AUDIO_BLOG_POST: BlogPost = {
  id: 'background-audio-fix-v1',
  blogId: 'system-blog',
  authorId: 'system',
  authorName: 'AIVoiceCast Engineering',
  authorImage: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=200&q=80',
  title: '🎧 Beyond the App Switch: Solving Mobile Background Audio',
  excerpt: 'Why do high-quality AI voices stop when you lock your phone? Today we detail our "Media Bridge" fix for mobile background audio playback.',
  status: 'published',
  publishedAt: 1766016000001, 
  createdAt: 1766016000001,
  likes: 850,
  commentCount: 0,
  tags: ['Mobile', 'Web Audio', 'iOS', 'Android'],
  content: `
# 🎧 Beyond the App Switch: Solving Mobile Background Audio

One of the most persistent frustrations in web development is the browser's tendency to kill audio playback the moment a user switches apps or locks their screen. While standard music players (like Spotify) work fine as native apps, web apps face aggressive "freezing" by mobile operating systems.

## The Problem: The "Spotify Paradox"
1. **System Voice (SpeechSynthesis)**: Works in the background because it hands text to the OS accessibility engine. The OS does the work.
2. **AI Voices (OpenAI/Gemini)**: Use the **Web Audio API**. This is driven by JavaScript in your tab. When the tab is hidden, the browser "freezes" JS timers, meaning we can't schedule the next sentence of your lecture.

## Our Solution: The 3-Tier "Media Bridge"
To keep the AI talking through the lock screen, we implemented a sophisticated hardware-software bridge:

### 1. The HTML5 Proxy Bridge
We route the output of our \`AudioContext\` into a hidden HTML5 \`<audio>\` element via a \`MediaStreamDestination\`. Mobile OSs grant high priority to standard media tags. By using the Web Audio API to "broadcast" to a local tag, we trick the browser into treating our tab as a media player rather than a background website.

### 2. The Infrasonic Heartbeat
Absolute silence is often optimized out by OS power management. We now play a continuous **20Hz sine wave** at 0.1% volume. This frequency is at the very bottom of human hearing, making it effectively silent, but it keeps the audio hardware "warm" and prevents the system from suspending the audio thread.

### 3. Aggressive Re-Sync
We leverage the \`visibilitychange\` and \`pageshow\` events. If the phone is unlocked and the JS engine detects a scheduling lag, it immediately "fast-forwards" the buffer to ensure the teacher and student personas stay in sync with the interactive transcript.

## Result
AIVoiceCast now offers a true "Spotify-like" experience. You can start a lecture on the bus, lock your phone, and keep learning without interruption.

*Happy Listening,*
*The AIVoiceCast Team*
`
};

export const SYSTEM_BLOG_POSTS = [ARCHITECTURE_BLOG_POST, BACKGROUND_AUDIO_BLOG_POST];
