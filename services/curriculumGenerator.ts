
import { GoogleGenAI } from '@google/genai';
import { Chapter } from '../types';
import { incrementApiUsage } from './firestoreService';
import { auth } from './firebaseConfig';

export async function generateCurriculum(
  topic: string, 
  context: string,
  language: 'en' | 'zh' = 'en'
): Promise<Chapter[] | null> {
  try {
    // Initialize client inside function to pick up latest API Key
    const apiKey = localStorage.getItem('gemini_api_key') || process.env.API_KEY || '';
    if (!apiKey) return null;
    const ai = new GoogleGenAI({ apiKey });

    const langInstruction = language === 'zh' 
      ? 'Output Language: Simplified Chinese (Mandarin). Use professional academic terminology.' 
      : 'Output Language: English. Use specific, technical, and domain-appropriate terminology.';

    const prompt = `
      You are a distinguished university professor and subject matter expert.
      
      Task: Design a comprehensive, deep-dive course syllabus (curriculum) for a podcast series titled: "${topic}".
      Context/Description: "${context}"
      
      ${langInstruction}

      Requirements:
      1. Create 8-12 "Chapters" (Main Modules).
      2. For each Chapter, create 5-8 "Sub-topics" (Lectures).
      3. The titles MUST be specific, non-repetitive, and high-quality.
      4. AVOID generic titles like "Introduction to..." or "Conclusion" unless absolutely necessary.
      5. Use jargon and technical terms appropriate for the field (e.g., if Linux, use "Scheduler", "Memory Paging", "VFS").
      6. If the topic is broad (e.g., "History"), cover chronological eras or specific themes.
      
      Example Structure (for a Linux Kernel topic):
      - Chapter: "Process Management"
         - Sub: "The task_struct and Process Descriptor"
         - Sub: "CFS Scheduler Internals"
         - Sub: "Fork, Vfork, and Clone System Calls"

      Return the result ONLY as a JSON object with this structure:
      {
        "chapters": [
          {
            "title": "Chapter Title",
            "subTopics": [
              { "title": "Subtopic Title" },
              { "title": "Subtopic Title" }
            ]
          }
        ]
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', // Upgraded to Gemini 3.0 Pro
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text;
    if (!text) return null;

    const parsed = JSON.parse(text);
    
    // Track Usage
    if (auth.currentUser) {
       incrementApiUsage(auth.currentUser.uid);
    }
    
    // Map to application type and add IDs
    if (parsed && parsed.chapters && Array.isArray(parsed.chapters)) {
        return parsed.chapters.map((ch: any, cIdx: number) => ({
            id: `ch-${cIdx}`,
            title: ch.title,
            subTopics: ch.subTopics.map((sub: any, sIdx: number) => ({
                id: `ch-${cIdx}-sub-${sIdx}`,
                title: sub.title
            }))
        }));
    }
    
    return null;

  } catch (error) {
    console.error("Failed to generate curriculum:", error);
    return null;
  }
}