import { GoogleGenAI } from '@google/genai';
import { GeneratedLecture, SubTopic, TranscriptItem } from '../types';
import { incrementApiUsage, getUserProfile } from './firestoreService';
import { auth } from './firebaseConfig';
import { OPENAI_API_KEY } from './private_keys';

function safeJsonParse(text: string): any {
  try {
    let clean = text.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(json)?/i, '').replace(/```$/, '');
    }
    return JSON.parse(clean);
  } catch (e) {
    console.error("JSON Parse Error:", e, "Input:", text);
    return null;
  }
}

async function callOpenAI(
    systemPrompt: string, 
    userPrompt: string, 
    apiKey: string,
    model: string = 'gpt-4o'
): Promise<string | null> {
    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            const err = await response.json();
            console.error("OpenAI API Error:", err);
            return null;
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || null;
    } catch (e) {
        console.error("OpenAI Fetch Error:", e);
        return null;
    }
}

async function getAIProvider(): Promise<'gemini' | 'openai'> {
    let provider: 'gemini' | 'openai' = 'gemini';
    if (auth.currentUser) {
        try {
            const profile = await getUserProfile(auth.currentUser.uid);
            if (profile?.subscriptionTier === 'pro' && profile?.preferredAiProvider === 'openai') {
                provider = 'openai';
            }
        } catch (e) {
            console.warn("Failed to check user profile for AI provider preference", e);
        }
    }
    return provider;
}

export async function generateLectureScript(
  topic: string, 
  channelContext: string,
  language: 'en' | 'zh' = 'en',
  channelId?: string
): Promise<GeneratedLecture | null> {
  try {
    const provider = await getAIProvider();
    const openaiKey = localStorage.getItem('openai_api_key') || OPENAI_API_KEY || '';

    let activeProvider = provider;
    if (provider === 'openai' && !openaiKey) {
        activeProvider = 'gemini';
    }

    const langInstruction = language === 'zh' 
      ? 'Output Language: Simplified Chinese (Mandarin).' 
      : 'Output Language: English.';

    const systemPrompt = `You are an expert educational content creator. ${langInstruction}`;
    
    const userPrompt = `
      Topic: "${topic}"
      Context: "${channelContext}"
      
      Task:
      1. Identify a famous expert relevant to this topic.
      2. Identify a Student name.
      3. Create a natural, engaging dialogue between them (300-500 words).

      Return the result ONLY as a JSON object with this structure:
      {
        "professorName": "Name",
        "studentName": "Name",
        "sections": [
          {"speaker": "Teacher", "text": "..."},
          {"speaker": "Student", "text": "..."}
        ]
      }
    `;

    let text: string | null = null;

    if (activeProvider === 'openai') {
        text = await callOpenAI(systemPrompt, userPrompt, openaiKey);
    } else {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const modelName = (channelId === '1' || channelId === '2') ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
        
        const response = await ai.models.generateContent({
            model: modelName, 
            contents: `${systemPrompt}\n\n${userPrompt}`,
            config: { 
                responseMimeType: 'application/json',
                thinkingConfig: (modelName === 'gemini-3-pro-preview') ? { thinkingBudget: 4000 } : undefined
            }
        });
        text = response.text || null;
    }

    if (!text) return null;

    const parsed = safeJsonParse(text);
    if (!parsed) return null;
    
    if (auth.currentUser) incrementApiUsage(auth.currentUser.uid);

    return {
      topic,
      professorName: parsed.professorName || (language === 'zh' ? "教授" : "Professor"),
      studentName: parsed.studentName || (language === 'zh' ? "学生" : "Student"),
      sections: parsed.sections || []
    };
  } catch (error) {
    console.error("Failed to generate lecture:", error);
    return null;
  }
}

export async function generateBatchLectures(
  chapterTitle: string,
  subTopics: SubTopic[], 
  channelContext: string,
  language: 'en' | 'zh' = 'en'
): Promise<Record<string, GeneratedLecture> | null> {
  try {
    if (subTopics.length === 0) return {};

    const provider = await getAIProvider();
    const openaiKey = localStorage.getItem('openai_api_key') || OPENAI_API_KEY || '';

    let activeProvider = provider;
    if (provider === 'openai' && !openaiKey) activeProvider = 'gemini';

    const langInstruction = language === 'zh' 
      ? 'Output Language: Simplified Chinese.' 
      : 'Output Language: English.';

    const systemPrompt = `You are an expert educational content creator. ${langInstruction}`;
    
    const userPrompt = `
      Channel Context: "${channelContext}"
      Chapter Title: "${chapterTitle}"
      Sub-topics: ${JSON.stringify(subTopics.map(s => ({ id: s.id, title: s.title })))}

      Return the result as a JSON object:
      {
        "results": [
           {
             "id": "SUBTOPIC_ID",
             "lecture": {
                "professorName": "...",
                "studentName": "...",
                "sections": [ {"speaker": "Teacher", "text": "..."} ]
             }
           }
        ]
      }
    `;

    let text: string | null = null;

    if (activeProvider === 'openai') {
        text = await callOpenAI(systemPrompt, userPrompt, openaiKey);
    } else {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview', 
            contents: `${systemPrompt}\n\n${userPrompt}`,
            config: { responseMimeType: 'application/json' }
        });
        text = response.text || null;
    }

    if (!text) return null;

    const parsed = safeJsonParse(text);
    if (!parsed) return null;

    const resultMap: Record<string, GeneratedLecture> = {};
    if (parsed.results && Array.isArray(parsed.results)) {
      parsed.results.forEach((item: any) => {
        const original = subTopics.find(s => s.id === item.id);
        if (original && item.lecture) {
           resultMap[item.id] = {
             topic: original.title,
             professorName: item.lecture.professorName,
             studentName: item.lecture.studentName,
             sections: item.lecture.sections
           };
        }
      });
    }
    
    if (auth.currentUser) incrementApiUsage(auth.currentUser.uid);
    return resultMap;
  } catch (error) {
    console.error("Failed to generate batch lectures:", error);
    return null;
  }
}

export async function summarizeDiscussionAsSection(
  transcript: TranscriptItem[],
  currentLecture: GeneratedLecture,
  language: 'en' | 'zh'
): Promise<GeneratedLecture['sections'] | null> {
  try {
    const provider = await getAIProvider();
    const openaiKey = localStorage.getItem('openai_api_key') || OPENAI_API_KEY || '';

    let activeProvider = provider;
    if (provider === 'openai' && !openaiKey) activeProvider = 'gemini';

    const chatLog = transcript.map(t => `${t.role}: ${t.text}`).join('\n');
    const systemPrompt = `You are an editor summarizing a student-teacher Q&A. Output Language: ${language === 'zh' ? 'Chinese' : 'English'}`;
    const userPrompt = `
      Topic: "${currentLecture.topic}"
      Transcript: ${chatLog}
      Convert to JSON: { "sections": [ {"speaker": "Teacher", "text": "..."} ] }
    `;

    let text: string | null = null;
    if (activeProvider === 'openai') {
        text = await callOpenAI(systemPrompt, userPrompt, openaiKey);
    } else {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview', 
            contents: `${systemPrompt}\n\n${userPrompt}`,
            config: { responseMimeType: 'application/json' }
        });
        text = response.text || null;
    }

    if (!text) return null;
    if (auth.currentUser) incrementApiUsage(auth.currentUser.uid);

    const parsed = safeJsonParse(text);
    return parsed ? parsed.sections : null;
  } catch (error) {
    console.error("Summarization failed", error);
    return null;
  }
}

export async function generateDesignDocFromTranscript(
  transcript: TranscriptItem[],
  meta: {
    date: string;
    topic: string;
    segmentIndex?: number;
  },
  language: 'en' | 'zh' = 'en'
): Promise<string | null> {
  try {
    const provider = await getAIProvider();
    const openaiKey = localStorage.getItem('openai_api_key') || OPENAI_API_KEY || '';

    let activeProvider = provider;
    if (provider === 'openai' && !openaiKey) activeProvider = 'gemini';

    const chatLog = transcript.map(t => `${t.role.toUpperCase()}: ${t.text}`).join('\n');
    const systemPrompt = `You are a Senior Technical Writer. Output Language: ${language === 'zh' ? 'Chinese' : 'English'}`;
    const userPrompt = `
      Task: Convert to Formal Design Doc (Markdown).
      Date: "${meta.date}"
      Topic: "${meta.topic}"
      Transcript: ${chatLog}
    `;

    let text: string | null = null;
    if (activeProvider === 'openai') {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }] })
        });
        if(response.ok) {
            const data = await response.json();
            text = data.choices[0]?.message?.content || null;
        }
    } else {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview', 
            contents: `${systemPrompt}\n\n${userPrompt}`,
            config: { thinkingConfig: { thinkingBudget: 4000 } }
        });
        text = response.text || null;
    }

    if (auth.currentUser) incrementApiUsage(auth.currentUser.uid);
    return text;
  } catch (error) {
    console.error("Design Doc generation failed", error);
    return null;
  }
}