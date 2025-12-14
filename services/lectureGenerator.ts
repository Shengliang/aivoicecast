
import { GoogleGenAI } from '@google/genai';
import { GeneratedLecture, SubTopic, TranscriptItem } from '../types';
import { incrementApiUsage } from './firestoreService';
import { auth } from './firebaseConfig';
import { GEMINI_API_KEY } from './private_keys';

// Helper to safely parse JSON from AI response
function safeJsonParse(text: string): any {
  try {
    // Remove markdown code blocks if present
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

export async function generateLectureScript(
  topic: string, 
  channelContext: string,
  language: 'en' | 'zh' = 'en'
): Promise<GeneratedLecture | null> {
  try {
    // Initialize client inside function to pick up latest API Key
    const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
    if (!apiKey) {
      console.warn("API Key missing");
      return null;
    }
    const ai = new GoogleGenAI({ apiKey });

    const langInstruction = language === 'zh' 
      ? 'Output Language: Simplified Chinese (Mandarin). Ensure natural phrasing appropriate for Chinese speakers.' 
      : 'Output Language: English.';

    const prompt = `
      You are an expert educational content creator.
      Topic: "${topic}"
      Context: "${channelContext}"
      ${langInstruction}
      
      Task:
      1. Identify a famous expert, scientist, or historical figure relevant to this topic to act as the "Teacher" (e.g., Richard Feynman for Physics, Li Bai for Poetry).
      2. Identify a "Student" name.
      3. Create a natural, engaging dialogue between them.
         - NO "Hi Teacher" or robotic greetings. Jump straight into the intellectual discussion.
         - The Teacher explains concepts vividly.
         - The Student challenges ideas or asks for clarification.
         - Keep it around 300-500 words.

      Return the result ONLY as a JSON object with this structure:
      {
        "professorName": "Name of Professor",
        "studentName": "Name of Student",
        "sections": [
          {"speaker": "Teacher", "text": "..."},
          {"speaker": "Student", "text": "..."}
        ]
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // Optimized for speed
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text;
    if (!text) return null;

    const parsed = safeJsonParse(text);
    if (!parsed) return null;
    
    // Track Usage if logged in
    if (auth.currentUser) {
       incrementApiUsage(auth.currentUser.uid);
    }

    // Inject the topic back into the object for the UI
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
  subTopics: SubTopic[], // Must contain { id, title }
  channelContext: string,
  language: 'en' | 'zh' = 'en'
): Promise<Record<string, GeneratedLecture> | null> {
  try {
    if (subTopics.length === 0) return {};

    // Initialize client inside function to pick up latest API Key
    const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
    if (!apiKey) return null;
    const ai = new GoogleGenAI({ apiKey });

    const langInstruction = language === 'zh' 
      ? 'Output Language: Simplified Chinese (Mandarin).' 
      : 'Output Language: English.';

    // Construct a prompt that asks for multiple lectures at once
    const prompt = `
      You are an expert educational content creator.
      Channel Context: "${channelContext}"
      Chapter Title: "${chapterTitle}"
      ${langInstruction}

      Task: Generate a short educational dialogue (lecture) for EACH of the following sub-topics.
      
      Sub-topics to generate:
      ${JSON.stringify(subTopics.map(s => ({ id: s.id, title: s.title })))}

      For EACH sub-topic:
      1. Assign a Teacher (Famous Expert) and Student persona appropriate for the topic.
      2. Write a 300-400 word dialogue.
      3. Maintain high educational value.

      Return the result as a single JSON object where the keys are the "id" of the sub-topic, and the value is the lecture object.
      
      Structure:
      {
        "results": [
           {
             "id": "SUBTOPIC_ID_FROM_INPUT",
             "lecture": {
                "professorName": "...",
                "studentName": "...",
                "sections": [ {"speaker": "Teacher", "text": "..."} ]
             }
           }
        ]
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // Optimized for speed
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text;
    if (!text) return null;

    const parsed = safeJsonParse(text);
    if (!parsed) return null;

    const resultMap: Record<string, GeneratedLecture> = {};

    if (parsed.results && Array.isArray(parsed.results)) {
      parsed.results.forEach((item: any) => {
        // Find the original title to inject
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
    
    // Track Usage if logged in (counts as 1 batch call)
    if (auth.currentUser) {
       incrementApiUsage(auth.currentUser.uid);
    }

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
    const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
    if (!apiKey) return null;
    const ai = new GoogleGenAI({ apiKey });

    const chatLog = transcript.map(t => `${t.role}: ${t.text}`).join('\n');
    const langInstruction = language === 'zh' ? 'Output Chinese' : 'Output English';

    const prompt = `
      You are an editor summarazing a student-teacher Q&A session.
      Original Topic: "${currentLecture.topic}"
      
      Chat Transcript:
      ${chatLog}
      
      Task:
      Convert this loose Q&A transcript into a formal "Advanced Q&A" segment for the lecture script.
      - Keep the "Teacher" (${currentLecture.professorName}) and "Student" (${currentLecture.studentName}) personas.
      - Summarize the key insights from the chat.
      - Format it as a dialogue (sections).
      - Add a section header like "--- Discussion Summary ---" at the start.
      
      ${langInstruction}

      Return JSON:
      {
        "sections": [ {"speaker": "Teacher", "text": "..."} ]
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // Optimized for speed
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    const text = response.text;
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
    const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
    if (!apiKey) return null;
    const ai = new GoogleGenAI({ apiKey });

    const chatLog = transcript.map(t => `${t.role.toUpperCase()}: ${t.text}`).join('\n');
    const langInstruction = language === 'zh' ? 'Output Language: Chinese.' : 'Output Language: English.';

    const prompt = `
      You are a Senior Technical Writer.
      Task: Convert the following casual discussion transcript into a Formal Design Document (Markdown).
      
      CRITICAL: Use the exact date provided in the metadata. Do not generate a fake date.
      
      Metadata:
      - Date: "${meta.date}"
      - Topic: "${meta.topic}"
      ${meta.segmentIndex !== undefined ? `- Original Segment Reference ID: seg-${meta.segmentIndex}` : ''}

      Transcript:
      ${chatLog}
      
      ${langInstruction}
      
      Structure the output clearly with the following sections (use Markdown headers):
      # Design Document: ${meta.topic}
      **Date:** ${meta.date}
      ${meta.segmentIndex !== undefined ? `**Reference:** Linked to [Lecture Segment #${meta.segmentIndex + 1}](#seg-${meta.segmentIndex})` : ''}
      
      # Executive Summary
      Brief overview of the discussion goals and outcomes.
      
      # Key Requirements & Constraints
      Bullet points of what was decided or constrained.
      
      # Proposed Solution / Architecture
      Detailed explanation of the solution discussed. If technical, include code snippets or system diagrams (text-based).
      
      # Q&A / Clarifications
      Important questions asked and the answers provided.
      
      # Action Items / Next Steps
      List of tasks derived from the conversation.
      
      Note: Remove filler words and conversational fluff. Make it professional.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt
    });

    if (auth.currentUser) incrementApiUsage(auth.currentUser.uid);

    return response.text || null;
  } catch (error) {
    console.error("Design Doc generation failed", error);
    return null;
  }
}
