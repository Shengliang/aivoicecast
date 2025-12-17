
import { Chapter, GeneratedLecture } from '../types';

export const OFFLINE_CHANNEL_ID = 'offline-architecture-101';

export const OFFLINE_CURRICULUM: Chapter[] = [
  {
    id: 'ch-1',
    title: 'Evolution of the Platform',
    subTopics: [
      { id: 'ch-1-sub-1', title: 'From Player to Operating System' },
      { id: 'ch-1-sub-2', title: 'The Unified App Suite Pattern' },
      { id: 'ch-1-sub-3', title: 'Context-Aware Layouts' }
    ]
  },
  {
    id: 'ch-2',
    title: 'Code Studio Architecture',
    subTopics: [
      { id: 'ch-2-sub-1', title: 'Virtual File Systems (VFS)' },
      { id: 'ch-2-sub-2', title: 'Lazy Loading GitHub Trees' },
      { id: 'ch-2-sub-3', title: 'Monaco Editor Integration' }
    ]
  },
  {
    id: 'ch-3',
    title: 'The Card Workshop',
    subTopics: [
      { id: 'ch-3-sub-1', title: 'HTML Canvas to PDF' },
      { id: 'ch-3-sub-2', title: 'Generative Art with Gemini' },
      { id: 'ch-3-sub-3', title: 'Packaging Assets with JSZip' }
    ]
  },
  {
    id: 'ch-4',
    title: 'Audio Engineering',
    subTopics: [
      { id: 'ch-4-sub-1', title: 'Web Audio API & Visualization' },
      { id: 'ch-4-sub-2', title: 'Real-time PCM Streaming' },
      { id: 'ch-4-sub-3', title: 'IndexedDB Audio Caching' }
    ]
  },
  {
    id: 'ch-5',
    title: 'Social & Career Graph',
    subTopics: [
      { id: 'ch-5-sub-1', title: 'RBAC with Firestore Rules' },
      { id: 'ch-5-sub-2', title: 'The Invite System Logic' },
      { id: 'ch-5-sub-3', title: 'Job Board Data Model' }
    ]
  },
  {
    id: 'ch-6',
    title: 'AI Integration Strategy',
    subTopics: [
      { id: 'ch-6-sub-1', title: 'Prompt Engineering for Personas' },
      { id: 'ch-6-sub-2', title: 'Function Calling in Live Mode' },
      { id: 'ch-6-sub-3', title: 'Multimodal Input (Screen/Cam)' }
    ]
  },
  {
    id: 'ch-7',
    title: 'Data Portability',
    subTopics: [
      { id: 'ch-7-sub-1', title: 'Incremental Cloud Sync' },
      { id: 'ch-7-sub-2', title: 'The Manifest System' },
      { id: 'ch-7-sub-3', title: 'JSON Export/Import' }
    ]
  },
  {
    id: 'ch-8',
    title: 'Workplace Chat',
    subTopics: [
      { id: 'ch-8-sub-1', title: 'Real-time Listeners (onSnapshot)' },
      { id: 'ch-8-sub-2', title: 'DM vs Group Logic' }
    ]
  }
];

// Map of "Topic Title" -> GeneratedLecture
export const OFFLINE_LECTURES: Record<string, GeneratedLecture> = {
  "From Player to Operating System": {
    topic: "From Player to Operating System",
    professorName: "Lead Architect",
    studentName: "Developer",
    sections: [
      {
        speaker: "Teacher",
        text: "In v1, AIVoiceCast was just a list of audio tracks. In v3, it is an Operating System for knowledge work. We introduced the concept of 'App Suites'."
      },
      {
        speaker: "Student",
        text: "What does that mean technically? Is it still a React app?"
      },
      {
        speaker: "Teacher",
        text: "Yes, but we shifted from a simple Router to a `ViewState` manager. The App component now acts as a window manager. It switches context between the Podcast Player, Code Studio, and Card Workshop without reloading the page."
      },
      {
        speaker: "Student",
        text: "Why not use routes like /code or /podcast?"
      },
      {
        speaker: "Teacher",
        text: "We do update the URL, but keeping state in memory allows for instant transitions. You can be listening to a podcast about Python while coding in Python in the Code Studio. The audio player component remains mounted at the root level, preserving the playback session."
      }
    ]
  },
  "Virtual File Systems (VFS)": {
    topic: "Virtual File Systems (VFS)",
    professorName: "Systems Engineer",
    studentName: "Junior Dev",
    sections: [
      {
        speaker: "Teacher",
        text: "The Code Studio needs to handle files from three completely different sources: GitHub, Google Drive, and our internal Private Cloud. We solved this with an abstract Virtual File System (VFS)."
      },
      {
        speaker: "Student",
        text: "So the editor doesn't know where the file comes from?"
      },
      {
        speaker: "Teacher",
        text: "Exactly. We normalize everything into a `CodeFile` interface. It has a `content` string, a `path`, and a `sha` checksum. When you click 'Save', the VFS checks the active tab (Drive/GitHub/Cloud) and dispatches the write operation to the correct API service."
      }
    ]
  },
  "HTML Canvas to PDF": {
    topic: "HTML Canvas to PDF",
    professorName: "Frontend Lead",
    studentName: "UI Designer",
    sections: [
      {
        speaker: "Teacher",
        text: "The Card Workshop lets users design holiday cards. But printing web pages is notoriously difficult. CSS doesn't always translate to paper."
      },
      {
        speaker: "Student",
        text: "So how do we get a high-quality PDF?"
      },
      {
        speaker: "Teacher",
        text: "We use a technique called Rasterization. We take the DOM element of the card, use `html2canvas` to paint it pixel-by-pixel onto a hidden HTML5 Canvas at 2x or 3x resolution (for print quality), and then convert that canvas into an image."
      },
      {
        speaker: "Student",
        text: "And then just put the image in a PDF?"
      },
      {
        speaker: "Teacher",
        text: "Yes, using `jsPDF`. This ensures that fonts, gradients, and even complex CSS filters look exactly the same in the PDF as they do on the screen. It's 'What You See Is What You Get' in the truest sense."
      }
    ]
  },
  "IndexedDB Audio Caching": {
    topic: "IndexedDB Audio Caching",
    professorName: "Dr. Cache",
    studentName: "Junior Dev",
    sections: [
      {
        speaker: "Teacher",
        text: "A critical component of our architecture is data persistence. Specifically, why we moved from LocalStorage to IndexedDB."
      },
      {
        speaker: "Student",
        text: "I thought LocalStorage was easier?"
      },
      {
        speaker: "Teacher",
        text: "It is simple, but it has a fatal flaw for multimedia: the 5MB quota. A single high-quality podcast audio file can exceed that. IndexedDB allows us to store Blobs and ArrayBuffers directly, with quotas often in the Gigabytes."
      },
      {
        speaker: "Teacher",
        text: "When we synthesize speech via Gemini, we save the resulting ArrayBuffer into an Object Store keyed by the text hash. Next time you play that paragraph, we stream it from disk instantly. Zero API latency, zero cost."
      }
    ]
  },
  "Incremental Cloud Sync": {
    topic: "Incremental Cloud Sync",
    professorName: "Cloud Architect",
    studentName: "DevOps",
    sections: [
      { speaker: "Teacher", text: "Early versions uploaded the entire 100MB database every time you clicked Sync. This was inefficient." },
      { speaker: "Student", text: "How did we fix it?" },
      { speaker: "Teacher", text: "We implemented an Incremental Strategy. We generate SHA-256 hashes of every audio file. We check a 'manifest.json' in the cloud to see which hashes already exist. We ONLY upload the new files." },
      { speaker: "Student", text: "Like Git?" },
      { speaker: "Teacher", text: "Exactly. It's a content-addressable storage pattern. It reduces a 100MB upload to just a few kilobytes if nothing changed." }
    ]
  },
  "RBAC with Firestore Rules": {
    topic: "RBAC with Firestore Rules",
    professorName: "Security Lead",
    studentName: "Auth User",
    sections: [
      { speaker: "Teacher", text: "We have three user tiers: Guest, Member, and Owner. Guests can only view Public content. Members can create. Owners have full control." },
      { speaker: "Student", text: "How is this enforced?" },
      { speaker: "Teacher", text: "We use Firestore Security Rules. We check `request.auth.uid` against the document's `ownerId` field. For public channels, we allow read access to everyone (`allow read: if true`), but write access is strictly limited to the owner or admins." }
    ]
  },
  "Function Calling in Live Mode": {
    topic: "Function Calling in Live Mode",
    professorName: "AI Engineer",
    studentName: "Bot Dev",
    sections: [
      { speaker: "Teacher", text: "In the Holiday Card Workshop, the user talks to 'Elf'. But Elf isn't just a chatbot; Elf can actually change the React state." },
      { speaker: "Student", text: "How does the voice connect to React state?" },
      { speaker: "Teacher", text: "We define a tool called `update_card` in the Live API config. When the user says 'Change the theme to festive', the model outputs a `toolCall` message. Our client intercepts this, parses the arguments, and calls `setMemory({...})` to update the UI instantly." }
    ]
  }
};
