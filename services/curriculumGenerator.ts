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
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const langInstruction = language === 'zh' ? 'Output Simplified Chinese.' : 'Output English.';

    const prompt = `
      Create a 10-chapter path for: "${topic}". Context: ${context}. ${langInstruction}
      Return ONLY a JSON array: [ { "title": "...", "subTopics": [ { "title": "..." } ] } ]
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    const parsed = JSON.parse(response.text || "[]");
    if (auth.currentUser) incrementApiUsage(auth.currentUser.uid);

    return parsed.map((ch: any, cIdx: number) => ({
      id: `ch-${Date.now()}-${cIdx}`,
      title: ch.title,
      subTopics: ch.subTopics.map((sub: any, sIdx: number) => ({
        id: `sub-${Date.now()}-${cIdx}-${sIdx}`,
        title: sub.title
      }))
    }));
  } catch (error) {
    return null;
  }
}