
# AIVoiceCast Platform

**Version:** 3.38.0

A decentralized, interactive podcast platform powered by AI. Users can generate curriculum-based podcasts, listen to AI-synthesized lectures, and engage in real-time voice conversations with AI personas.

---

## ⚠️ Important: Setup & Security

To prevent accidental leakage of sensitive API keys (like Firebase configuration), this project uses a strict **"Private Keys File"** pattern.

### 1. `services/private_keys.ts`
The file `services/private_keys.ts` is intentionally **excluded** from the Git repository (via `.gitignore`) because it contains sensitive credentials.

**Action Required**: If you clone this repository, the app will fail to compile or connect to Firebase until you create this file manually.

**Steps**:
1.  Navigate to the `services/` directory.
2.  Create a new file named `private_keys.ts`.
3.  Paste your Firebase configuration (and optionally your Gemini API Key) into it using the following format:

```typescript
// services/private_keys.ts
// PRIVATE KEYS - DO NOT COMMIT TO GITHUB
// This file is ignored by .gitignore to prevent leaking secrets.

// 1. Firebase Configuration (Required)
export const firebaseKeys = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "your-app.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:12345:web:abcdef",
  measurementId: "G-XYZ123"
};

// 2. Google Gemini API Key (Optional)
// If you leave this empty, users must enter their own key via the UI (Settings -> Set API Key).
// If you populate this, it will be used as the default key for all users.
export const GEMINI_API_KEY = ""; 
```

### 2. Gemini API Key Strategy
The app looks for the Gemini API key in the following order:
1.  **Local Storage** (`gemini_api_key`): User-entered key via the UI. This overrides everything.
2.  **Private Keys File** (`GEMINI_API_KEY`): Hardcoded fallback for deployments where you want to provide the key.
3.  **Process Env** (`process.env.API_KEY`): Build-time environment variable.

---

## 🏛️ System Architecture

AIVoiceCast uses a **Client-Heavy, Serverless** architecture. Most logic runs directly in the browser to reduce latency and cost.

### Core Stack
*   **Frontend**: React 19 (Hooks, Functional Components).
*   **AI Engine**: Google Gemini API (`gemini-3-pro-preview` for logic, `gemini-2.5-flash` for speed, `gemini-live` for voice).
*   **Backend**: Firebase (Firestore, Auth, Storage).
*   **Local Cache**: IndexedDB (via native API).

### Data Flow & Design Decisions

#### 1. Hybrid Storage Strategy
We use a dual-layer storage system to balance cost, speed, and privacy.

*   **Public Layer (Firestore)**:
    *   Stores `channels` that are marked "Public".
    *   Acts as a global registry for discovery.
    *   Handles `invitations` and `bookings` for social features.
*   **Private Layer (IndexedDB)**:
    *   Stores `lecture scripts` and generated `audio blobs`.
    *   **Why?**: Audio files are large. Storing 100MB of generated audio in the cloud for every user is expensive and slow. IndexedDB allows gigabytes of storage client-side with zero latency.
*   **Cloud Backup (Firebase Storage)**:
    *   Users can "Sync" their local IndexedDB to the cloud.
    *   Uses an **Incremental Sync** strategy (hashing audio files) to only upload changed content.

#### 2. AI Content Generation Pipeline
The app generates podcasts in three stages:
1.  **Curriculum Design**: `gemini-3-pro-preview` generates a JSON structure of Chapters and Subtopics based on the user's prompt.
2.  **Script Writing**: `gemini-2.5-flash` generates a dialogue script (Teacher/Student) for a specific subtopic.
3.  **Audio Synthesis**: The script is converted to audio.
    *   **Primary**: Gemini Neural Audio (high quality, quota limited).
    *   **Fallback**: Web Speech API (System voices) used as a "Circuit Breaker" if the API fails or quota is exceeded.

#### 3. Real-Time Live Studio
The "Live Studio" allows users to talk to the AI host.
*   **Protocol**: WebSockets (via `@google/genai` SDK).
*   **Audio Pipeline**: 
    *   Microphone -> AudioContext -> ScriptProcessor -> PCM Downsampling (16kHz) -> WebSocket.
    *   WebSocket -> PCM Chunk -> AudioContext -> BufferSource -> Speakers.
*   **Context Injection**: The app injects the current channel's "System Instruction" and "Conversation History" into the session handshake to ensure the AI stays in character.

#### 4. Offline Capability
The entire "Player" and "Reader" experience works offline once content is generated.
*   We cache `GeneratedLecture` objects (text) and `AudioBuffers` (binary) in IndexedDB.
*   On load, the app checks IndexedDB before making any network requests.

---

## 🧩 Key Features

1.  **Curriculum Generator**: Turns any topic (e.g., "Quantum Physics") into a structured 10-chapter course.
2.  **Lecture Player**: Plays dual-speaker dialogues with synchronized text highlighting.
3.  **Live Studio**: Real-time voice conversation with the AI host, including screen sharing capabilities.
4.  **Mentorship Booking**: P2P or AI-based scheduling system.
5.  **Design Doc Generator**: Converts casual voice conversations into formal Markdown technical documents.
6.  **Group Management**: Collaborative spaces with role-based access (Owner/Member).

---

## 🛠️ Development

### Prerequisites
*   Node.js & npm (if running locally)
*   Firebase Project (Blaze plan recommended for Cloud Functions, though app is mostly client-side)
*   Google AI Studio API Key

### Build
The project uses standard React scripts (or Vite depending on setup).
`npm run build`

### Deployment
Designed for static hosting (Vercel, Netlify, Firebase Hosting).
Ensure the `firebaseKeys` are correctly configured in `services/private_keys.ts` before building.
