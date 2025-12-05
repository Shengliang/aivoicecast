import { GoogleGenAI } from '@google/genai';
import { Channel, Chapter } from '../types';
import { incrementApiUsage } from './firestoreService';
import { auth } from './firebaseConfig';
import { generateLectureScript } from './lectureGenerator';
import { cacheLectureScript } from '../utils/db';
import { GEMINI_API_KEY } from './private_keys';

const VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];

export async function generateChannelFromPrompt(
  userPrompt: string, 
  currentUser: any,
  language: 'en' | 'zh' = 'en'
): Promise<Channel | null> {
  try {
    const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
    if (!apiKey) throw new Error("API Key missing");
    const ai = new GoogleGenAI({ apiKey });

    const langInstruction = language === 'zh' 
      ? 'Output Language: Simplified Chinese (Mandarin) for all content.' 
      : 'Output Language: English.';

    const prompt = `
      You are a creative Podcast Producer AI.
      User Request: "${userPrompt}"
      ${langInstruction}

      Task: 
      1. Create a complete concept for a podcast channel based on the user's request.
      2. Generate a catchy Title and engaging Description.
      3. Define a "System Instruction" for the AI Host. It should define a specific persona (e.g., "You are an excited historian...").
      4. Select the best Voice Personality from this list: ${VOICES.join(', ')}.
      5. Generate 3-5 Tags.
      6. Create a "Welcome Message" for the live session.
      7. Create 4 "Starter Prompts" for the live session.
      8. Design a "Curriculum" with 3-5 Chapters, each having 3-5 Sub-topics.

      Return ONLY a raw JSON object with this structure:
      {
        "title": "...",
        "description": "...",
        "voiceName": "...",
        "systemInstruction": "...",
        "tags": ["..."],
        "welcomeMessage": "...",
        "starterPrompts": ["..."],
        "chapters": [
          {
            "title": "Chapter Title",
            "subTopics": [ {"title": "Subtopic Title"} ]
          }
        ],
        "imagePrompt": "A description of the podcast cover art visual style"
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    const text = response.text;
    if (!text) return null;

    const parsed = JSON.parse(text);
    const channelId = crypto.randomUUID();
    
    // Track Usage
    if (auth.currentUser) {
       incrementApiUsage(auth.currentUser.uid);
    }

    // Map AI output to Channel interface
    const newChannel: Channel = {
      id: channelId,
      title: parsed.title,
      description: parsed.description,
      author: currentUser?.displayName || 'Anonymous Creator',
      ownerId: currentUser?.uid,
      visibility: 'private', // Default to private
      voiceName: parsed.voiceName,
      systemInstruction: parsed.systemInstruction,
      likes: 0,
      dislikes: 0,
      comments: [],
      tags: parsed.tags || ['AI', 'Generated'],
      // Generate dynamic image URL
      imageUrl: `https://image.pollinations.ai/prompt/${encodeURIComponent(parsed.imagePrompt || parsed.title)}?width=600&height=400&nologo=true`,
      welcomeMessage: parsed.welcomeMessage,
      starterPrompts: parsed.starterPrompts,
      // Map chapters to include IDs
      chapters: parsed.chapters?.map((ch: any, cIdx: number) => ({
        id: `ch-${channelId}-${cIdx}`,
        title: ch.title,
        subTopics: ch.subTopics?.map((sub: any, sIdx: number) => ({
           id: `sub-${channelId}-${cIdx}-${sIdx}`,
           title: sub.title
        })) || []
      })) || []
    };

    // --- Auto-Generate First Lecture Content (Text Only) ---
    // This ensures that when the user clicks the card, the first lesson is ready to read/play immediately.
    if (newChannel.chapters.length > 0 && newChannel.chapters[0].subTopics.length > 0) {
        const firstTopic = newChannel.chapters[0].subTopics[0];
        console.log("Auto-generating first lecture script:", firstTopic.title);
        
        // Generate in background (don't await strictly if we want UI to be faster, 
        // but here we await to ensure it's ready for the 'Publish' click)
        const lecture = await generateLectureScript(firstTopic.title, newChannel.description, language);
        
        if (lecture) {
            const cacheKey = `lecture_${channelId}_${firstTopic.id}_${language}`;
            await cacheLectureScript(cacheKey, lecture);
        }
    }

    return newChannel;

  } catch (error) {
    console.error("Channel Generation Failed:", error);
    return null;
  }
}

export async function modifyCurriculumWithAI(
  currentChapters: Chapter[],
  userPrompt: string,
  language: 'en' | 'zh' = 'en'
): Promise<Chapter[] | null> {
  try {
    const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
    if (!apiKey) throw new Error("API Key missing");
    const ai = new GoogleGenAI({ apiKey });

    const langInstruction = language === 'zh' ? 'Output Language: Chinese.' : 'Output Language: English.';

    const prompt = `
      You are a Curriculum Editor AI.
      User Instruction: "${userPrompt}"
      
      Current Curriculum JSON:
      ${JSON.stringify(currentChapters.map(c => ({ title: c.title, subTopics: c.subTopics.map(s => s.title) })))}

      ${langInstruction}

      Task:
      1. Modify the curriculum structure based strictly on the User Instruction.
      2. You can ADD chapters, REMOVE chapters, ADD lessons (sub-topics), or RENAME items.
      3. Keep the structure logical.
      4. If the user asks to "Add a chapter about X", create it with 3-4 relevant sub-topics.

      Return ONLY the new JSON structure:
      {
        "chapters": [
          {
            "title": "...",
            "subTopics": [ "..." ]
          }
        ]
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    const text = response.text;
    if (!text) return null;
    
    // Track Usage
    if (auth.currentUser) {
       incrementApiUsage(auth.currentUser.uid);
    }
    
    const parsed = JSON.parse(text);
    
    if (parsed && parsed.chapters && Array.isArray(parsed.chapters)) {
        // Remap to ensure IDs are present (using timestamps to avoid collisions during edits)
        const timestamp = Date.now();
        return parsed.chapters.map((ch: any, cIdx: number) => ({
            id: `ch-edit-${timestamp}-${cIdx}`,
            title: ch.title,
            subTopics: Array.isArray(ch.subTopics) 
              ? ch.subTopics.map((subTitle: string, sIdx: number) => ({
                  id: `sub-edit-${timestamp}-${cIdx}-${sIdx}`,
                  title: subTitle
                }))
              : []
        }));
    }
    return null;

  } catch (error) {
    console.error("Curriculum Modification Failed", error);
    return null;
  }
}

export async function generateChannelFromDocument(
  documentText: string,
  currentUser: any,
  language: 'en' | 'zh' = 'en'
): Promise<Channel | null> {
  try {
    const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
    if (!apiKey) throw new Error("API Key missing");
    const ai = new GoogleGenAI({ apiKey });

    const langInstruction = language === 'zh' 
      ? 'Output Language: Simplified Chinese (Mandarin).' 
      : 'Output Language: English.';

    // Safely truncate text to avoid context limit issues (approx 30k chars is plenty for metadata + structure)
    const safeText = documentText.substring(0, 30000);

    const prompt = `
      You are a Podcast Producer.
      Analyze the following document and convert it into a Podcast Channel structure.
      
      Document:
      "${safeText}"

      ${langInstruction}

      Task:
      1. Extract a suitable Title and Description for the Podcast Channel based on the document.
      2. Define a System Instruction and Voice Name (Select one: Puck, Charon, Kore, Fenrir, Zephyr).
      3. Structure the content into a Curriculum (Chapters and Subtopics).
         - If the document has explicit Chapters (e.g., "Chapter 1"), use them.
         - If it's a single long text with sections, group them logically.
         - SubTopic titles should be descriptive (e.g. "The Problem Space", "CRDT Architecture").
      4. Generate Tags, Welcome Message, and Starter Prompts.
      5. Generate an image prompt for the cover art.

      Return ONLY a raw JSON object with this structure:
      {
        "title": "...",
        "description": "...",
        "voiceName": "...",
        "systemInstruction": "...",
        "tags": ["..."],
        "welcomeMessage": "...",
        "starterPrompts": ["..."],
        "chapters": [
          {
            "title": "Chapter Title",
            "subTopics": [ {"title": "Subtopic Title"} ]
          }
        ],
        "imagePrompt": "..."
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    const text = response.text;
    if (!text) return null;

    const parsed = JSON.parse(text);
    const channelId = crypto.randomUUID();
    
    if (auth.currentUser) {
       incrementApiUsage(auth.currentUser.uid);
    }

    const newChannel: Channel = {
      id: channelId,
      title: parsed.title,
      description: parsed.description,
      author: currentUser?.displayName || 'Anonymous Creator',
      ownerId: currentUser?.uid,
      visibility: 'private',
      voiceName: parsed.voiceName,
      systemInstruction: parsed.systemInstruction,
      likes: 0,
      dislikes: 0,
      comments: [],
      tags: parsed.tags || ['Document', 'AI'],
      imageUrl: `https://image.pollinations.ai/prompt/${encodeURIComponent(parsed.imagePrompt || parsed.title)}?width=600&height=400&nologo=true`,
      welcomeMessage: parsed.welcomeMessage,
      starterPrompts: parsed.starterPrompts,
      chapters: parsed.chapters?.map((ch: any, cIdx: number) => ({
        id: `ch-${channelId}-${cIdx}`,
        title: ch.title,
        subTopics: ch.subTopics?.map((sub: any, sIdx: number) => ({
           id: `sub-${channelId}-${cIdx}-${sIdx}`,
           title: sub.title
        })) || []
      })) || []
    };

    return newChannel;

  } catch (error) {
    console.error("Document Import Failed:", error);
    return null;
  }
}
