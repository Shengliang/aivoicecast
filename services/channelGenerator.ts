import { GoogleGenAI } from '@google/genai';
import { Channel, Chapter } from '../types';
import { incrementApiUsage, getUserProfile } from './firestoreService';
import { auth } from './firebaseConfig';

export async function generateChannelFromPrompt(
  userPrompt: string, 
  currentUser: any,
  language: 'en' | 'zh' = 'en'
): Promise<Channel | null> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const userRequest = `Request: "${userPrompt}". Create a podcast concept. Return JSON: { "title": "...", "description": "...", "voiceName": "Puck", "systemInstruction": "...", "tags": [], "welcomeMessage": "...", "starterPrompts": [], "chapters": [], "imagePrompt": "..." }`;

    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: userRequest,
        config: { responseMimeType: 'application/json' }
    });

    const parsed = JSON.parse(response.text || '{}');
    const channelId = crypto.randomUUID();
    
    return {
      id: channelId,
      title: parsed.title,
      description: parsed.description,
      author: currentUser?.displayName || 'Anonymous',
      ownerId: currentUser?.uid,
      visibility: 'private',
      voiceName: parsed.voiceName || 'Puck',
      systemInstruction: parsed.systemInstruction,
      likes: 0, dislikes: 0, comments: [],
      tags: parsed.tags || ['AI'],
      imageUrl: `https://image.pollinations.ai/prompt/${encodeURIComponent(parsed.imagePrompt || parsed.title)}?width=600&height=400&nologo=true`,
      welcomeMessage: parsed.welcomeMessage,
      starterPrompts: parsed.starterPrompts,
      createdAt: Date.now(),
      chapters: []
    };
  } catch (error) {
    return null;
  }
}

export async function modifyCurriculumWithAI(
  currentChapters: Chapter[],
  userPrompt: string,
  language: 'en' | 'zh' = 'en'
): Promise<Chapter[] | null> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Modify this curriculum based on "${userPrompt}": ${JSON.stringify(currentChapters)}`,
        config: { responseMimeType: 'application/json' }
    });
    const parsed = JSON.parse(response.text || '{}');
    return parsed.chapters || null;
  } catch (error) {
    return null;
  }
}

export async function generateChannelFromDocument(
  documentText: string,
  currentUser: any,
  language: 'en' | 'zh' = 'en'
): Promise<Channel | null> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Summarize this doc as a podcast: ${documentText.substring(0, 5000)}`,
        config: { responseMimeType: 'application/json' }
    });
    const parsed = JSON.parse(response.text || '{}');
    return { ...parsed, id: crypto.randomUUID(), author: currentUser?.displayName, ownerId: currentUser?.uid, createdAt: Date.now() };
  } catch (error) {
    return null;
  }
}