
import { Chapter, GeneratedLecture } from '../types';

export const OFFLINE_CHANNEL_ID = 'offline-architecture-101';

export const OFFLINE_CURRICULUM: Chapter[] = [
  {
    id: 'ch-1',
    title: 'Frontend Architecture',
    subTopics: [
      { id: 'ch-1-sub-1', title: 'React 19 & Component Design' },
      { id: 'ch-1-sub-2', title: 'State Management with Hooks' },
      { id: 'ch-1-sub-3', title: 'Tailwind CSS & Responsive UI' }
    ]
  },
  {
    id: 'ch-2',
    title: 'Audio Engineering',
    subTopics: [
      { id: 'ch-2-sub-1', title: 'Web Audio API Basics' },
      { id: 'ch-2-sub-2', title: 'Real-time PCM Audio Streaming' },
      { id: 'ch-2-sub-3', title: 'Why IndexedDB for Audio Caching?' }
    ]
  },
  {
    id: 'ch-3',
    title: 'AI Integration',
    subTopics: [
      { id: 'ch-3-sub-1', title: 'Gemini Live API & WebSockets' },
      { id: 'ch-3-sub-2', title: 'Prompt Engineering for Personas' }
    ]
  },
  {
    id: 'ch-4',
    title: 'Data Portability',
    subTopics: [
      { id: 'ch-4-sub-1', title: 'Backing up to JSON' },
      { id: 'ch-4-sub-2', title: 'Binary Data Handling' }
    ]
  },
  {
    id: 'ch-5',
    title: 'Cloud Sync Architecture',
    subTopics: [
      { id: 'ch-5-sub-1', title: 'Incremental Sync Strategy' },
      { id: 'ch-5-sub-2', title: 'The Manifest System' }
    ]
  },
  {
    id: 'ch-6',
    title: 'Identity & Security',
    subTopics: [
      { id: 'ch-6-sub-1', title: 'Firebase Authentication Integration' },
      { id: 'ch-6-sub-2', title: 'Role-Based Access Control (RBAC)' }
    ]
  },
  {
    id: 'ch-7',
    title: 'Social Architecture',
    subTopics: [
      { id: 'ch-7-sub-1', title: 'The Public Registry (Firestore)' },
      { id: 'ch-7-sub-2', title: 'Invitation Notification System' }
    ]
  },
  {
    id: 'ch-8',
    title: 'Audio Resilience Strategy',
    subTopics: [
      { id: 'ch-8-sub-1', title: 'System Voice Fallback Pattern' },
      { id: 'ch-8-sub-2', title: 'Handling API Quota Limits' }
    ]
  },
  {
    id: 'ch-9',
    title: 'The Voice Engine',
    subTopics: [
      { id: 'ch-9-sub-1', title: 'Filtering Robotic Voices' },
      { id: 'ch-9-sub-2', title: 'Quality-Based Voice Selection' }
    ]
  },
  {
    id: 'ch-10',
    title: 'Mobile Optimization',
    subTopics: [
      { id: 'ch-10-sub-1', title: 'Adaptive Layouts & Zen Mode' },
      { id: 'ch-10-sub-2', title: 'Touch-First Interactions' },
      { id: 'ch-10-sub-3', title: 'PWA & Service Workers' }
    ]
  }
];

// Map of "Topic Title" -> GeneratedLecture
export const OFFLINE_LECTURES: Record<string, GeneratedLecture> = {
  "Why IndexedDB for Audio Caching?": {
    topic: "Why IndexedDB for Audio Caching?",
    professorName: "Dr. Cache",
    studentName: "Junior Dev",
    sections: [
      {
        speaker: "Teacher",
        text: "Today we are discussing a critical component of the AIVoiceCast architecture: data persistence. Specifically, why we moved from LocalStorage to IndexedDB."
      },
      {
        speaker: "Student",
        text: "I thought LocalStorage was the standard? It's easy to use. Just setItem and getItem."
      },
      {
        speaker: "Teacher",
        text: "It is simple, yes. But it has a fatal flaw for multimedia applications: the 5 Megabyte quota. A single high-quality podcast audio file can easily exceed that."
      },
      {
        speaker: "Teacher",
        text: "IndexedDB, on the other hand, is a NoSQL transactional database built into the browser. It allows us to store Blobs and ArrayBuffers directly. The quota is determined by your hard drive space, often allowing gigabytes of storage."
      },
      {
        speaker: "Student",
        text: "So that's how the app works offline? It saves the generated audio chunks there?"
      },
      {
        speaker: "Teacher",
        text: "Precisely. When we synthesize speech via Gemini, we save the resulting ArrayBuffer into an Object Store keyed by the text hash. Next time you play that paragraph, we stream it from disk instantly. Zero API latency, zero cost."
      }
    ]
  },
  "React 19 & Component Design": {
    topic: "React 19 & Component Design",
    professorName: "Dr. React",
    studentName: "Frontend Fan",
    sections: [
      {
        speaker: "Teacher",
        text: "Let's dissect the view layer. We are using React 19 features, specifically the new Hook patterns for handling async state transitions."
      },
      {
        speaker: "Student",
        text: "Is that why the UI feels so snappy even when the AI is thinking?"
      },
      {
        speaker: "Teacher",
        text: "Yes. By utilizing 'useMemo' for expensive calculations like the Audio Visualizer FFT data, and 'useRef' for mutable WebSocket connections that shouldn't trigger re-renders, we keep the main thread unblocked."
      }
    ]
  },
  "Web Audio API Basics": {
    topic: "Web Audio API Basics",
    professorName: "Prof. Hertz",
    studentName: "Audio Newbie",
    sections: [
      {
        speaker: "Teacher",
        text: "The Web Audio API is a powerful system for controlling audio on the web. It involves an 'AudioContext' which acts as a graph container."
      },
      {
        speaker: "Student",
        text: "Graph? Like nodes?"
      },
      {
        speaker: "Teacher",
        text: "Exactly. We create Source Nodes (the raw PCM data from Gemini), connect them to Gain Nodes (volume control), and finally to the Destination Node (your speakers). This allows us to visualize the waveform in real-time before it even hits your ears."
      }
    ]
  },
  "Real-time PCM Audio Streaming": {
    topic: "Real-time PCM Audio Streaming",
    professorName: "Prof. Stream",
    studentName: "Socket User",
    sections: [
      {
        speaker: "Teacher",
        text: "Gemini Live doesn't send MP3 files. It sends raw PCM (Pulse Code Modulation) data over a WebSocket. This is uncompressed audio."
      },
      {
        speaker: "Student",
        text: "Why uncompressed? Wouldn't that be slow?"
      },
      {
        speaker: "Teacher",
        text: "It uses more bandwidth, but the latency is near zero. We don't have to wait to decode a full MP3 frame. We can play the bytes the millisecond they arrive. This is crucial for conversational AI."
      }
    ]
  },
  "Gemini Live API & WebSockets": {
    topic: "Gemini Live API & WebSockets",
    professorName: "AI Architect",
    studentName: "Curious Coder",
    sections: [
      {
        speaker: "Teacher",
        text: "The heart of this app is the 'GeminiLiveService'. It maintains a persistent WebSocket connection to Google's servers."
      },
      {
        speaker: "Student",
        text: "How do we handle the user's microphone?"
      },
      {
        speaker: "Teacher",
        text: "We use a ScriptProcessorNode to grab raw audio buffers from the microphone input, downsample them to 16kHz (which is what the model expects), and stream them instantly to the socket."
      }
    ]
  },
  "Prompt Engineering for Personas": {
    topic: "Prompt Engineering for Personas",
    professorName: "Prompt Engineer",
    studentName: "Writer",
    sections: [
      {
        speaker: "Teacher",
        text: "Notice how the Linux Kernel bot sounds different from the Poetry bot? That is System Instruction Engineering."
      },
      {
        speaker: "Student",
        text: "Is it just changing the voice?"
      },
      {
        speaker: "Teacher",
        text: "No, the voice is just audio. The *personality* comes from the text context we send on connection: 'You are a strict senior engineer'. This conditions the LLM's latent space to predict tokens that match that persona."
      }
    ]
  },
  "State Management with Hooks": {
      topic: "State Management with Hooks",
      professorName: "Dr. Hooks",
      studentName: "State User",
      sections: [
          { speaker: "Teacher", text: "We avoid Redux in this app to keep the bundle size small. Instead, we lift state up to the App component and pass it down via props, or use local state for isolated features like the Visualizer." },
          { speaker: "Student", text: "What about the global voice setting?" },
          { speaker: "Teacher", text: "That is a perfect candidate for lifted state. It lives in App.tsx and is injected into every channel object before rendering." }
      ]
  },
  "Tailwind CSS & Responsive UI": {
      topic: "Tailwind CSS & Responsive UI",
      professorName: "Designer",
      studentName: "CSS Fan",
      sections: [
          { speaker: "Teacher", text: "The UI uses Tailwind for utility-first styling. This allows us to rapidly prototype dark mode interfaces without writing custom CSS files." },
          { speaker: "Student", text: "I noticed the glassmorphism effects." },
          { speaker: "Teacher", text: "Yes, using 'backdrop-blur' and semi-transparent background colors gives the app a modern, native feel on the web." }
      ]
  },
  "Backing up to JSON": {
    topic: "Backing up to JSON",
    professorName: "Dr. Backup",
    studentName: "Admin",
    sections: [
      { speaker: "Teacher", text: "Since IndexedDB is stuck in the browser, we need a way to get data out. We solve this by iterating through the database, converting binary AudioBuffers to Base64 strings, and dumping everything into a massive JSON object." },
      { speaker: "Student", text: "Base64 makes the file larger though, right?" },
      { speaker: "Teacher", text: "Yes, about 33% larger. But it makes the backup portable and easy to send via email or save to a hard drive." }
    ]
  },
  "Binary Data Handling": {
    topic: "Binary Data Handling",
    professorName: "Bitwise",
    studentName: "Byte",
    sections: [
      { speaker: "Teacher", text: "When restoring, we read the JSON, strip the Base64 headers, and convert the strings back into Uint8Arrays before writing them back to IndexedDB." },
      { speaker: "Student", text: "Does this block the UI?" },
      { speaker: "Teacher", text: "For large backups, it can. That's why we use async/await loops to ensure the browser doesn't freeze completely while processing hundreds of megabytes of audio." }
    ]
  },
  "Incremental Sync Strategy": {
    topic: "Incremental Sync Strategy",
    professorName: "Cloud Architect",
    studentName: "DevOps",
    sections: [
      { speaker: "Teacher", text: "Early versions of this app uploaded the entire 100MB database every time you clicked Sync. This was inefficient." },
      { speaker: "Student", text: "How did we fix it?" },
      { speaker: "Teacher", text: "We implemented an Incremental Strategy. Now, we generate SHA-256 hashes of every audio file. We check a 'manifest.json' in the cloud to see which hashes already exist. We ONLY upload the new files." },
      { speaker: "Student", text: "That sounds like Git." },
      { speaker: "Teacher", text: "Exactly. It's a content-addressable storage pattern. It reduces a 100MB upload to just a few kilobytes if nothing changed." }
    ]
  },
  "The Manifest System": {
    topic: "The Manifest System",
    professorName: "System Design",
    studentName: "Architect",
    sections: [
      { speaker: "Teacher", text: "The Manifest is a simple JSON file stored in the user's cloud bucket. It maps 'Cache Keys' (Text Content) to 'Content Hashes' (SHA-256 of the audio)." },
      { speaker: "Student", text: "Why map them? Why not just name the file by the text?" },
      { speaker: "Teacher", text: "Filenames have length limits, and text can be thousands of characters. Hashing ensures a constant 64-character filename. The manifest acts as the index pointer." }
    ]
  },
  "Firebase Authentication Integration": {
    topic: "Firebase Authentication Integration",
    professorName: "Auth Expert",
    studentName: "Security",
    sections: [
      { speaker: "Teacher", text: "We use Firebase Auth to manage identity. When you click 'Sign In', we trigger the Google OAuth provider." },
      { speaker: "Student", text: "Does this handle the session too?" },
      { speaker: "Teacher", text: "Yes. Firebase manages the JWT tokens and refresh cycles automatically. We use an 'onAuthStateChanged' listener in React to update the UI instantly when login state changes." }
    ]
  },
  "Role-Based Access Control (RBAC)": {
    topic: "Role-Based Access Control (RBAC)",
    professorName: "Security Lead",
    studentName: "Auth User",
    sections: [
      { speaker: "Teacher", text: "We now have three user tiers: Guest, Member, and Owner. Guests can only view Public content. Members can create and share. Owners have full control." },
      { speaker: "Student", text: "How is this enforced?" },
      { speaker: "Teacher", text: "We use Firebase Auth to establish identity. The frontend UI conditionally renders buttons (like 'Edit' or 'Sync') based on the 'currentUser' object. On the backend (Firestore), we use security rules to ensure only the 'ownerId' can write to a channel document." }
    ]
  },
  "The Public Registry (Firestore)": {
    topic: "The Public Registry (Firestore)",
    professorName: "Database Admin",
    studentName: "Social Dev",
    sections: [
      { speaker: "Teacher", text: "We use a hybrid storage model. Private backups live in Cloud Storage Blobs. But for sharing, we need a queryable database." },
      { speaker: "Student", text: "So where do Public podcasts go?" },
      { speaker: "Teacher", text: "They go into the 'channels' collection in Firestore. This acts as a Global Registry or Index." },
      { speaker: "Student", text: "Why is that better than a JSON file?" },
      { speaker: "Teacher", text: "Performance and Concurrency. If we had one big 'public_index.json', every user would overwrite each other's changes. Firestore allows thousands of users to add channels simultaneously without conflict. It also lets us query 'where visibility == public' instantly." }
    ]
  },
  "Invitation Notification System": {
    topic: "Invitation Notification System",
    professorName: "UX Designer",
    studentName: "Product Manager",
    sections: [
      { speaker: "Teacher", text: "Sending invites is tricky in a serverless app. We don't have an SMTP server to send emails." },
      { speaker: "Student", text: "So how do users know they are invited?" },
      { speaker: "Teacher", text: "We use an 'In-App Notification' pattern. When you invite 'bob@gmail.com', we create an 'Invitation' document in Firestore. When Bob logs in, his app queries for any pending invitations matching his email and shows a red badge on the bell icon." }
    ]
  },
  "System Voice Fallback Pattern": {
    topic: "System Voice Fallback Pattern",
    professorName: "Site Reliability Engineer",
    studentName: "QA Tester",
    sections: [
      { speaker: "Teacher", text: "What happens when the Gemini API quota is exceeded? Or the user has no API key?" },
      { speaker: "Student", text: "The app crashes?" },
      { speaker: "Teacher", text: "It used to. Now we implement a 'Circuit Breaker' pattern in the Player. If the API returns a null buffer, we catch it, prompt the user, and switch the entire playback engine to 'window.speechSynthesis'." },
      { speaker: "Student", text: "So it continues playing but with a robot voice?" },
      { speaker: "Teacher", text: "Correct. It's a degraded experience, but it's infinitely better than silence. This ensures 'High Availability' for the content." }
    ]
  },
  "Handling API Quota Limits": {
    topic: "Handling API Quota Limits",
    professorName: "SRE",
    studentName: "Junior",
    sections: [
      { speaker: "Teacher", text: "The Gemini API often returns a 429 Too Many Requests error if you generate too many audio clips at once." },
      { speaker: "Student", text: "How do we handle that during a lecture?" },
      { speaker: "Teacher", text: "The Player loop catches this error. Instead of stopping, it marks the 'useSystemVoice' flag as true and immediately retries the current paragraph using the browser's TTS engine. The user sees a confirmation dialog, but the playback stream is saved." }
    ]
  },
  "Filtering Robotic Voices": {
    topic: "Filtering Robotic Voices",
    professorName: "Audio Engineer",
    studentName: "Listener",
    sections: [
      { speaker: "Teacher", text: "Browser TTS engines are messy. They often include debug voices or novelty sounds like 'Bells' or 'Cellos'." },
      { speaker: "Student", text: "I heard 'Fred' on my Mac once. It was terrifying." },
      { speaker: "Teacher", text: "Exactly. To fix this, we implemented a 'Voice Sieve'. We fetch all available voices and run them against a Blocklist (Fred, Trinoids, Albert). Then we score the remaining ones based on keywords like 'Enhanced', 'Premium', or 'Google'." },
      { speaker: "Teacher", text: "This ensures that when we fallback to system audio, we pick the most human-sounding voice available on your specific device." }
    ]
  },
  "Quality-Based Voice Selection": {
    topic: "Quality-Based Voice Selection",
    professorName: "Algorithmic Design",
    studentName: "User",
    sections: [
      { speaker: "Teacher", text: "We don't just pick random system voices. We assign them roles." },
      { speaker: "Student", text: "Roles? Like teacher and student?" },
      { speaker: "Teacher", text: "Yes. We scan the available voice list. We try to assign the first high-quality voice to the Teacher, and a different high-quality voice to the Student. This makes the conversation easier to follow, even without the Neural AI voices." }
    ]
  },
  "Adaptive Layouts & Zen Mode": {
    topic: "Adaptive Layouts & Zen Mode",
    professorName: "Mobile Lead",
    studentName: "App Dev",
    sections: [
      { speaker: "Teacher", text: "Adapting a desktop-class IDE for mobile requires aggressive UI virtualization. We can't just shrink everything." },
      { speaker: "Student", text: "So what is the strategy?" },
      { speaker: "Teacher", text: "We use a 'Context-Aware' layout engine. When the viewport drops below 768px, the Code Studio automatically collapses the file tree and chat into slide-over panels. We also introduced 'Zen Mode'." },
      { speaker: "Student", text: "What does Zen Mode do?" },
      { speaker: "Teacher", text: "It enters fullscreen and hides all chrome—navbars, status bars, and tools. It gives 100% of the screen pixels to the active document or canvas. This turns a cramped phone screen into a focused workstation." }
    ]
  }
};
