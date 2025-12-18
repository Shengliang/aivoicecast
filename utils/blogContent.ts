
import { BlogPost } from '../types';

export const ARCHITECTURE_BLOG_POST: BlogPost = {
  id: 'arch-deep-dive-v1',
  blogId: 'system-blog',
  authorId: 'system',
  authorName: 'AIVoiceCast Engineering',
  authorImage: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=200&q=80',
  title: 'Under the Hood: The Architecture of AIVoiceCast',
  excerpt: 'A technical deep dive into how we built the world\'s first generative audio knowledge community. Learn about our React 19 frontend, Firebase backend, Gemini AI integration, and zero-config indexing strategies.',
  status: 'published',
  publishedAt: 1766016000000, // Dec 18, 2025
  createdAt: 1766016000000,
  likes: 1024,
  commentCount: 0,
  tags: ['Engineering', 'Architecture', 'Firebase', 'Optimization'],
  // FIX: Escaped all backticks within the template literal to prevent syntax errors and premature string termination
  content: `
# 🛠️ Under the Hood: The Architecture of AIVoiceCast

Welcome to a technical deep dive into the AIVoiceCast platform. Updated as of **December 18, 2025**, this post covers our core stack and our latest optimizations for scaling without infrastructure friction.

---

## 1. Feature Overview

AIVoiceCast supports **6 Core Pillars** of functionality, all integrated into a Single Page Application (SPA):

1.  **🎙️ Generative Podcasts**: Creates curriculums, scripts, and audio on-demand using LLMs.
2.  **⚡ Live Studio**: Real-time voice-to-voice interaction with AI personas using WebSockets.
3.  **💻 Code Studio**: A full cloud IDE with file management (Firebase/Drive/GitHub) and multi-user collaborative editing.
4.  **🎨 Whiteboard**: An infinite canvas for systems design diagrams, shareable in real-time.
5.  **💬 Workplace Chat**: A Slack-like messaging system for teams and groups.
6.  **💼 Career Center**: A job board and talent pool for connecting members.

---

## 2. Latest Optimization: Zero-Config Indexing

One of the biggest challenges with Firestore is the requirement for **Composite Indexes** when mixing \`where\` and \`orderBy\` clauses across different fields. This can block new users from deploying their own instances if they haven't manually set up indexes in the Firebase Console.

### The Solution: Hybrid Local Filtering
In our latest update (v3.82), we moved the filtering logic for "published" status from the database layer to the application layer.
*   **Database Query**: \`db.collection('blog_posts').orderBy('createdAt', 'desc').limit(50)\`
*   **Local Filter**: \`data.filter(p => p.status === 'published')\`

By doing this, we maintain high performance (fetching only the most recent 50 posts) while ensuring the app works perfectly on any fresh Firebase project without requiring a single manual index.

---

## 3. Internal Implementation

### Frontend: React 19 & TypeScript
We use **React 19** to leverage the latest concurrent features.
*   **State Management**: We deliberately **avoided Redux**. Mutable, high-frequency data (like audio buffers) stays in \`useRef\` to avoid React render cycle overhead.
*   **Styling**: **Tailwind CSS** allows for a responsive, dark-mode-first UI with zero CSS maintenance.

### Backend: Serverless (Firebase)
*   **Auth**: Handles Google & GitHub Sign-In.
*   **Firestore**: Stores metadata and social state.
*   **Storage**: Holds user avatars, code files, and meeting recordings.
*   **Security**: \`firestore.rules\` enforce strict RBAC, ensuring only owners can edit their content.

### AI Engine: Gemini API
*   **Logic**: \`gemini-3-pro-preview\` for complex reasoning.
*   **Speed**: \`gemini-3-flash-preview\` for real-time interactions.
*   **Audio**: \`gemini-2.5-flash-preview-tts\` for high-fidelity neural voices.

---

## 4. Data Strategy: Hybrid Sync
We save costs and bandwidth with a dual-layer approach:
1.  **Text/Metadata**: Stored in **Firestore** (Cloud) for global availability.
2.  **Audio Blobs**: Stored in **IndexedDB** (Local Browser). 
    *   *Result:* Replaying a lecture is instantaneous and costs $0 in API fees.

---

## 5. Summary Table

| Component | Our Choice | Alternative | Why We Chose Ours |
| :--- | :--- | :--- | :--- |
| **Framework** | **Vite (SPA)** | Next.js (SSR) | Better support for browser-only APIs like Web Audio/Mic. |
| **Database** | **Firestore** | PostgreSQL | Built-in \`onSnapshot\` for real-time collaborative editing. |

*Happy Coding,*
*The AIVoiceCast Engineering Team*
`
};
