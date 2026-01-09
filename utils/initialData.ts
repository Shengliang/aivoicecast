import { Channel, ChannelVisibility } from '../types';
import { OFFLINE_CHANNEL_ID } from './offlineContent';

export const VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];

// Use a fixed past date (Jan 15, 2024) to ensure initial data doesn't clutter the "Today" view in Calendar
const INITIAL_DATE = 1705276800000; 

export const CATEGORY_STYLES: Record<string, string> = {
  'Personal Finance & Wealth': 'luxury gold coins financial chart minimalist clean 4k',
  'Career, Productivity & Self-Improvement': 'modern office success motivation sunrise minimalist',
  'Technology & AI': 'futuristic cyberpunk glowing blue circuit board robot high tech',
  'Health, Fitness & Wellness': 'organic healthy food yoga nature sunlight bright fresh',
  'Relationships & Family': 'warm cozy home family dinner sunset emotional connection',
  'True Crime': 'detective noir dark moody mystery crime scene flashlight cinematic',
  'Politics, Society & Culture': 'newsroom capitol debate podium microphone crowd journalism',
  'Business & Entrepreneurship': 'skyscraper boardroom handshake startup rocket launch business',
  'Entertainment & Pop Culture': 'neon lights cinema concert stage spotlight colorful pop art',
  'Lifestyle, Travel & Hobbies': 'adventure travel backpack landscape camera coffee cozy'
};

export const TOPIC_CATEGORIES: Record<string, string[]> = {
  'Personal Finance & Wealth': [
    'Investing for beginners', 'Stock market insights', 'Real estate investing', 
    'Passive income strategies', 'Financial independence / FIRE movement', 
    'Cryptocurrency & blockchain', 'Side hustles', 'Retirement planning', 
    'Tax optimization', 'Budgeting & money management'
  ],
  'Career, Productivity & Self-Improvement': [
    'Career growth & leadership', 'Productivity hacks', 'Time management', 
    'Public speaking & communication', 'Mental models & decision-making', 
    'Negotiation skills', 'Goal-setting systems', 'Motivation & discipline', 
    'Creativity techniques', 'Work-life balance'
  ],
  'Technology & AI': [
    'Artificial intelligence explained', 'How to use AI tools', 'Future of jobs with AI', 
    'Tech news breakdown', 'Software engineering insights', 'Cybersecurity & privacy', 
    'Robotics & automation', 'Space tech', 'Biotechnology advances', 'Silicon Valley founder stories'
  ],
  'Health, Fitness & Wellness': [
    'Healthy eating & nutrition', 'Strength training', 'Weight loss science', 
    'Longevity research', 'Mental health & anxiety', 'Sleep optimization', 
    'Holistic health', 'Chronic pain management', 'Sports performance', 'Biohacking'
  ],
  'Relationships & Family': [
    'Marriage & long-term relationships', 'Dating tips', 'Parenting strategies', 
    'Conflict resolution', 'Emotional intelligence', 'Communication in relationships', 
    'Divorce recovery', 'Raising teens', 'Friendship building', 'Work-family dynamics'
  ],
  'True Crime': [
    'Unsolved mysteries', 'Famous criminal cases', 'Wrongful convictions', 
    'Serial killers', 'FBI case breakdowns', 'Forensic science explained', 
    'Courtroom drama', 'Criminal psychology', 'Cold cases', 'Missing person investigations'
  ],
  'Politics, Society & Culture': [
    'US political analysis', 'Geopolitics', 'Social issues explained', 
    'Media bias & news breakdown', 'American culture & history', 'Law & constitutional topics', 
    'Immigration stories', 'Generational differences', 'DEI / workplace culture', 'Religion & belief discussions'
  ],
  'Business & Entrepreneurship': [
    'Startup stories', 'Small business growth', 'Marketing strategy', 
    'E-commerce tactics', 'Venture capital & funding', 'Scaling companies', 
    'Branding', 'Leadership challenges', 'Remote work & future of work', 'Business failures & lessons'
  ],
  'Entertainment & Pop Culture': [
    'Movie & TV reviews', 'Celebrity interviews', 'Music analysis', 
    'Comedy conversations', 'Internet culture trends', 'TikTok & YouTube creator stories', 
    'eSports & gaming', 'Anime & fandom discussions', 'Sports news & commentary', 'Book discussions'
  ],
  'Lifestyle, Travel & Hobbies': [
    'US travel guides', 'International travel tips', 'Food exploration', 
    'Minimalism & decluttering', 'Home organization', 'Gardening', 
    'DIY projects', 'Pets & dog training', 'Photography & videography', 'Outdoor adventures & hiking'
  ]
};

export const HANDCRAFTED_CHANNELS: Channel[] = [
  {
    id: OFFLINE_CHANNEL_ID,
    title: 'AIVoiceCast',
    description: 'The self-documenting guide to the AIVoiceCast platform. Learn how we built the new Application Suite: Code Studio, Card Workshop, Career Center, and the underlying AI architecture.',
    author: 'Self-Documenting',
    voiceName: 'Puck',
    systemInstruction: 'You are the lead architect of AIVoiceCast. You explain the technical implementation of the platform, focusing on the new "Application Suite" architecture, the Card Workshop (HTML5 Canvas/PDF), and the Code Studio (Virtual File Systems).',
    likes: 9999,
    dislikes: 0,
    comments: [],
    tags: ['Architecture', 'React', 'Canvas', 'GenAI'],
    imageUrl: 'https://image.pollinations.ai/prompt/futuristic%20AI%20interface%20holographic%20dashboard%20glowing%20nodes%20dark%20cyberpunk%208k?width=600&height=400&nologo=true',
    welcomeMessage: "Welcome. This platform is a testament to the power of Google AI Studio, Gemini 3, and OpenAI APIs. We have evolved beyond a simple player into a comprehensive Knowledge OS—ready to generate, teach, and build alongside you.",
    starterPrompts: [
      "How does the Card Workshop generate PDFs?",
      "Explain the Virtual File System in Code Studio",
      "Architecture of the new Application Suite",
      "How do AI Agents interact with the Canvas?"
    ],
    createdAt: INITIAL_DATE
  },
  {
    id: '1',
    title: 'Software Interview Masterclass',
    description: 'Practice your technical coding interview skills with a world-class senior engineer persona.',
    author: 'Neural Prism',
    voiceName: 'gen-lang-client-0648937375',
    systemInstruction: 'You are a senior software engineer conducting a difficult mock interview. Your tone is professional and rigorous. You have a special interest in distributed systems and performance optimization.',
    likes: 342,
    dislikes: 12,
    comments: [],
    tags: ['Tech', 'Career', 'Interview'],
    imageUrl: 'https://image.pollinations.ai/prompt/coding%20interview%20computer%20screen%20cyberpunk%20tech%20office?width=600&height=400&nologo=true',
    welcomeMessage: "Welcome. I am ready to test your knowledge on algorithms and system design. Shall we begin?",
    starterPrompts: [
      "Ask me a hard Graph problem",
      "Mock system design for a chat app",
      "Explain time complexity of Merge Sort"
    ],
    createdAt: INITIAL_DATE
  },
  {
    id: '2',
    title: 'Linux Kernel Deep Dive',
    description: 'Audit the core of the OS. Memory safety, scheduler internals, and hardware interfaces.',
    author: 'Neural Prism',
    voiceName: 'gen-lang-client-0375218270',
    systemInstruction: 'You are an OS internals expert. You speak with technical precision about the Linux kernel. No tolerance for sloppy abstractions. If technical client IDs appear, focus on the engineering-level discussion.',
    likes: 891,
    dislikes: 5,
    comments: [],
    tags: ['Systems', 'Kernel', 'Engineering'],
    imageUrl: 'https://image.pollinations.ai/prompt/linux%20penguin%20server%20room%20matrix%20code%20green?width=600&height=400&nologo=true',
    welcomeMessage: "Subsystem audit initialized. What shall we explore today?",
    starterPrompts: [
      "How does the CFS scheduler work?",
      "Explain RCU synchronization",
      "Kernel memory management basics"
    ],
    createdAt: INITIAL_DATE
  },
  {
    id: 'default-gem',
    title: 'Default Gem',
    description: 'The standard AIVoiceCast general assistant. Helpful, creative, and always ready to chat.',
    author: 'Gemini Standard',
    voiceName: 'Zephyr',
    systemInstruction: 'You are Default Gem, the helpful and creative AI assistant for AIVoiceCast. You can help with general knowledge, brainstorming, or just casual conversation. Your goal is to be the perfect companion for the platform.',
    likes: 1500,
    dislikes: 1,
    comments: [],
    tags: ['General', 'Assistant', 'AIVoiceCast'],
    imageUrl: 'https://image.pollinations.ai/prompt/glowing%20indigo%20gemstone%20abstract%20digital%20art%208k?width=600&height=400&nologo=true',
    welcomeMessage: "Hello! I'm Default Gem. How can I help you today?",
    starterPrompts: [
      "Tell me a fun fact",
      "Help me brainstorm a project",
      "Explain how AIVoiceCast works",
      "What can you do?"
    ],
    createdAt: INITIAL_DATE
  }
];
