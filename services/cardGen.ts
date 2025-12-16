
import { GoogleGenAI } from '@google/genai';
import { AgentMemory } from '../types';
import { GEMINI_API_KEY } from './private_keys';

const getClient = () => {
    const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
    if (!apiKey) throw new Error("API Key is missing. Please set it in the Settings menu.");
    return new GoogleGenAI({ apiKey });
};

export async function generateCardMessage(memory: AgentMemory, tone: string = 'warm'): Promise<string> {
    try {
        const ai = getClient();
        const prompt = `
            Write a short, heartwarming ${memory.occasion} card message.
            Recipient: ${memory.recipientName}
            Sender: ${memory.senderName}
            Tone: ${tone}
            Theme: ${memory.theme}
            
            Return ONLY the message body text. Keep it under 50 words.
        `;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });
        
        return response.text?.trim() || "Wishing you joy and peace this season.";
    } catch (e: any) {
        console.error("Message gen failed", e);
        throw e;
    }
}

export async function generateCardImage(memory: AgentMemory, stylePrompt: string): Promise<string> {
    try {
        const ai = getClient();
        const prompt = `
            A high quality, festive holiday card cover art.
            Theme: ${memory.theme} (${memory.occasion}).
            Style: ${stylePrompt}.
            No text.
            Cinematic lighting, 8k resolution, magical atmosphere.
        `;
        
        // Using 'gemini-2.5-flash-image' as per instructions for standard image gen
        // Note: SDK usually returns base64. 
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: prompt }] }
        });
        
        // Find image part
        // The SDK response structure for images usually contains inlineData in parts
        // or we might need to use a specific helper if the SDK provides one. 
        // Based on "Generate Images" section in guidelines:
        // iterate parts.
        
        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
        }
        
        throw new Error("No image generated");
    } catch (e: any) {
        console.error("Image gen failed", e);
        throw e;
    }
}
