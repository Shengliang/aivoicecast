import { GoogleGenAI } from '@google/genai';
import { GeneratedLecture, SubTopic, TranscriptItem } from '../types';
import { incrementApiUsage } from './firestoreService';
import { auth } from './firebaseConfig';

function safeJsonParse(text: string): any {
  try {
    let clean = text.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(json)?/i, '').replace(/```$/, '');
    }
    return JSON.parse(clean);
  } catch (e) {
    return null;
  }
}

export async function generateLectureScript(
  topic: string, 
  channelContext: string,
  language: 'en' | 'zh' = 'en',
  channelId?: string
): Promise<GeneratedLecture | null> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const modelName = 'gemini-3-flash-preview';
    const langInstruction = language === 'zh' ? 'Chinese.' : 'English.';

    const systemPrompt = `You are an educational creator. Output in ${langInstruction}`;
    const userPrompt = `Generate a dialogue script for topic "${topic}". Context: ${channelContext}. Return JSON: { "professorName": "...", "studentName": "...", "sections": [ {"speaker": "Teacher", "text": "..."} ] }`;

    const response = await ai.models.generateContent({
        model: modelName, 
        contents: `${systemPrompt}\n\n${userPrompt}`,
        config: { responseMimeType: 'application/json' }
    });

    const parsed = safeJsonParse(response.text || '');
    if (!parsed) return null;
    if (auth.currentUser) incrementApiUsage(auth.currentUser.uid);

    return {
      topic,
      professorName: parsed.professorName || "Professor",
      studentName: parsed.studentName || "Student",
      sections: parsed.sections || []
    };
  } catch (error) {
    return null;
  }
}

export async function summarizeDiscussionAsSection(
  transcript: TranscriptItem[],
  currentLecture: GeneratedLecture,
  language: 'en' | 'zh'
): Promise<GeneratedLecture['sections'] | null> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const chatLog = transcript.map(t => `${t.role}: ${t.text}`).join('\n');
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview', 
        contents: `Summarize this chat for a lecture: ${chatLog}`,
        config: { responseMimeType: 'application/json' }
    });
    const parsed = safeJsonParse(response.text || '');
    return parsed ? parsed.sections : null;
  } catch (error) {
    return null;
  }
}

export async function generateDesignDocFromTranscript(
  transcript: TranscriptItem[],
  meta: any,
  language: 'en' | 'zh' = 'en'
): Promise<string | null> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const chatLog = transcript.map(t => `${t.role}: ${t.text}`).join('\n');
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Create a formal design document from this chat: ${chatLog}`,
        config: { thinkingConfig: { thinkingBudget: 4000 } }
    });
    return response.text || null;
  } catch (error) {
    return null;
  }
}