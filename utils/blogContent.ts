
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
  publishedAt: Date.now(),
  createdAt: Date.now(),
  likes: 999,
  commentCount: 0,
  tags: ['Engineering', 'Architecture', 'Open Source'],
  content: `
# 🛠️ Under the Hood: The Architecture of AIVoiceCast

Welcome to a technical deep dive into the AIVoiceCast platform. We believe in transparency and open learning, so we are sharing exactly how this application is built, the decisions behind our stack, and how our source code is organized.

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

## 2. Internal Implementation

### Frontend: React 19 & TypeScript
We use **React 19** to leverage the latest concurrent features.
*   **State Management**: We deliberately **avoided Redux**. Why?
    *   **Audio Latency**: The Live Studio relies on the Web Audio API. Audio processing happens in the main thread (ScriptProcessor) or AudioWorklet. Passing high-frequency audio data through Redux reducers would introduce unacceptable garbage collection pauses and latency.
    *   **Solution**: We use \`useRef\` for mutable, non-rendering state (like audio buffers and WebSocket connections) and \`useState/useContext\` for UI reactivity. This keeps the UI snappy even while processing 16kHz audio streams.
*   **Styling**: **Tailwind CSS** allows us to build a responsive, dark-mode-first UI without managing thousands of CSS files.

### Backend: Serverless (Firebase)
We use **Google Firebase** for a completely serverless architecture.
*   **Auth**: Handles Google & GitHub Sign-In.
*   **Firestore (NoSQL)**: Stores public channels, user profiles, chat messages, and whiteboard data. We chose NoSQL because the schema of an AI-generated "Lecture" varies wildly and evolves constantly. SQL migrations would have slowed us down.
*   **Storage**: Firebase Storage holds user avatars, code files, and meeting recordings.
*   **Security**: Firestore Security Rules (\`firestore.rules\`) enforce Role-Based Access Control (RBAC) at the database level.

### AI Engine: Gemini API
*   **Logic**: \`gemini-3-pro-preview\` handles complex reasoning (Curriculum generation, Code analysis).
*   **Speed**: \`gemini-2.5-flash\` handles high-volume tasks (Chat responses, summarization).
*   **Voice**: \`gemini-live\` enables the real-time, interruptible voice conversations via WebSocket.

### Data Strategy: Hybrid Sync
We use a unique **Hybrid Storage Model** to save costs and bandwidth.
*   **Text/Metadata**: Stored in **Firestore** (Cloud).
*   **Audio Blobs**: Stored in **IndexedDB** (Local Browser).
    *   *Why?* Generating neural audio is expensive and files are large (5-50MB). We cache every generated sentence locally. If you replay a lecture, it loads instantly from disk without hitting the API or costing money.

---

## 3. Alternative Solutions & Trade-offs

| Component | Our Choice | Alternative | Why We Chose Ours |
| :--- | :--- | :--- | :--- |
| **Framework** | **Vite (SPA)** | Next.js (SSR) | Our app relies heavily on browser APIs (Microphone, Screen Share, Web Audio) that don't run on the server. SSR adds complexity for little SEO gain in a gated app. |
| **Database** | **Firestore** | PostgreSQL | Real-time listeners (\`onSnapshot\`) are built-in to Firestore. Implementing live cursors and chat in SQL requires setting up a separate WebSocket server (e.g., Socket.io), adding maintenance overhead. |
| **Voice** | **Gemini Live** | OpenAI Realtime | Gemini offers a massive 2M token context window, allowing the AI to "remember" the entire history of a long coding session or podcast series. |

---

## 4. Source Code Layout (\`aivoicecast/\`)

If you are exploring the codebase, here is the map:

### \`components/\` (The View)
Contains all React UI components.
*   \`LiveSession.tsx\`: The heart of the voice engine. Handles WebSockets and AudioContext.
*   \`CodeStudio.tsx\`: The IDE logic, file tree, and Monaco Editor integration.
*   \`Whiteboard.tsx\`: The HTML5 Canvas logic for drawing and shape management.
*   \`Chat/\`: Components for the workplace messaging system.

### \`services/\` (The Controller)
Contains singleton logic for communicating with external APIs.
*   \`firestoreService.ts\`: All database CRUD operations.
*   \`authService.ts\`: Wrappers for Firebase Auth (Google/GitHub).
*   \`geminiLive.ts\`: The WebSocket client for the Gemini Live API.
*   \`tts.ts\`: Text-to-Speech synthesis and caching logic.

### \`utils/\` (The Model & Helpers)
*   \`db.ts\`: IndexedDB wrapper for local caching.
*   \`initialData.ts\`: Static content for the "Handcrafted" channels.
*   \`types.ts\`: TypeScript interfaces shared across the app.

---

We hope this gives you a clear picture of how AIVoiceCast is built. We designed it to be modular, scalable, and most importantly, **fun to hack on**.

*Happy Coding,*
*The AIVoiceCast Engineering Team*
`
};
