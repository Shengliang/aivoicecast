
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
        
        let prompt = '';
        if (memory.theme === 'chinese-poem') {
            prompt = `
                Write a traditional Chinese Poem (classical style, like Tang Dynasty Jueju).
                Topic/Occasion: ${memory.occasion}.
                Recipient: ${memory.recipientName || 'Friend'}.
                Sender: ${memory.senderName || 'Me'}.
                Theme details: ${memory.customThemePrompt || 'Nature, peace, friendship'}.
                
                Requirements:
                1. Use Simplified Chinese characters.
                2. Strict 4 lines.
                3. Either 5 or 7 characters per line.
                4. Return ONLY the poem text, formatted with line breaks. No English translation.
            `;
        } else {
            prompt = `
                Write a short, heartwarming ${memory.occasion} card message.
                Recipient: ${memory.recipientName}
                Sender: ${memory.senderName}
                Tone: ${tone}
                Theme: ${memory.theme}
                ${memory.customThemePrompt ? `Custom Detail: ${memory.customThemePrompt}` : ''}
                
                Return ONLY the message body text. Keep it under 50 words.
            `;
        }
        
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

export async function generateCardImage(
    memory: AgentMemory, 
    stylePrompt: string, 
    referenceImageBase64?: string, 
    refinementText?: string
): Promise<string> {
    try {
        const ai = getClient();
        
        // Include custom visual theme if provided
        const customContext = memory.customThemePrompt ? `Main Subject/Theme: ${memory.customThemePrompt}.` : '';
        const userRefinement = refinementText ? `IMPORTANT SPECIFIC DETAILS: ${refinementText}.` : '';

        let basePrompt = '';
        if (memory.theme === 'chinese-poem') {
             basePrompt = `
                Traditional Chinese Ink Wash Painting (Shui-mo hua).
                Minimalist, Zen, monochromatic with subtle red accents (plum blossoms or seal).
                Subject: ${memory.occasion}. ${customContext}. ${userRefinement}
                Use negative space effectively. Rice paper texture background.
                Art Direction: Masterpiece, brush strokes visible, poetic atmosphere.
             `;
        } else {
             basePrompt = `
                Generate a high quality, creative holiday card image.
                Occasion: ${memory.occasion}.
                General Style: ${memory.theme}.
                ${customContext}
                ${userRefinement}
                Specific Art Direction: ${stylePrompt}.
                Requirements: No text, 8k resolution, cinematic lighting, magical atmosphere.
                ${referenceImageBase64 ? 'Use the attached image as a visual reference for the character or composition.' : ''}
            `;
        }

        const parts: any[] = [{ text: basePrompt }];
        
        // Append image if provided
        if (referenceImageBase64) {
            // Remove header data:image/png;base64,
            const base64Data = referenceImageBase64.split(',')[1];
            // Determine mime type roughly or default to jpeg/png
            const mimeType = referenceImageBase64.substring(referenceImageBase64.indexOf(':') + 1, referenceImageBase64.indexOf(';'));
            
            parts.push({
                inlineData: {
                    mimeType: mimeType,
                    data: base64Data
                }
            });
        }

        // Using 'gemini-2.5-flash-image' as per instructions for standard image gen
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts }
        });
        
        // Find image part
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
