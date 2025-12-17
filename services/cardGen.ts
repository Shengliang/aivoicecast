
import { GoogleGenAI } from '@google/genai';
import { AgentMemory } from '../types';
import { GEMINI_API_KEY } from './private_keys';
import { base64ToBytes, pcmToWavBlobUrl } from '../utils/audioUtils';

const getClient = () => {
    const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
    if (!apiKey) throw new Error("API Key is missing. Please set it in the Settings menu.");
    return new GoogleGenAI({ apiKey });
};

export async function generateCardMessage(memory: AgentMemory, tone: string = 'warm'): Promise<string> {
    try {
        const ai = getClient();
        
        let prompt = '';
        
        // Detect if the user has entered specific text they want to refine/use
        // We exclude the default placeholder to avoid confusing the model
        const defaultMsg = 'Wishing you a season filled with warmth, comfort, and good cheer.';
        const hasCustomDraft = memory.cardMessage && memory.cardMessage.trim() !== defaultMsg && memory.cardMessage.length > 5;
        
        const contextDraft = hasCustomDraft 
            ? `The user has provided this specific draft/context: "${memory.cardMessage}". Your goal is to ENHANCE this specific message. Do NOT replace it with generic holiday greetings. Keep all specific names, dates, and achievements mentioned.` 
            : '';

        if (memory.theme === 'chinese-poem') {
            prompt = `
                Write a traditional Chinese Poem (classical style, like Tang Dynasty Jueju).
                Topic/Occasion: ${memory.occasion}.
                Recipient: ${memory.recipientName || 'Friend'}.
                Sender: ${memory.senderName || 'Me'}.
                Theme/Context: ${memory.customThemePrompt || 'Nature, peace, friendship'}.
                ${contextDraft}
                
                Requirements:
                1. Use Simplified Chinese characters.
                2. Strict 4 lines.
                3. Either 5 or 7 characters per line.
                4. Return ONLY the poem text, formatted with line breaks. No English translation.
            `;
        } else {
            prompt = `
                Write a heartwarming ${memory.occasion} card message.
                Recipient: ${memory.recipientName}
                Sender: ${memory.senderName}
                Tone: ${tone}
                Theme: ${memory.theme}
                ${memory.customThemePrompt ? `IMPORTANT - Include this specific detail/context: "${memory.customThemePrompt}"` : ''}
                ${contextDraft}
                
                Requirements:
                1. If specific details are provided (jobs, names, specific news), you MUST mention them explicitly.
                2. Length: Approximately 80-120 words. (The user wants a substantial message, not a one-liner).
                3. Return ONLY the message body text.
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

export async function generateSongLyrics(memory: AgentMemory): Promise<string> {
    try {
        const ai = getClient();
        
        // Incorporate specific user message context if available
        const defaultMsg = 'Wishing you a season filled with warmth, comfort, and good cheer.';
        const messageContext = memory.cardMessage && memory.cardMessage.trim() !== defaultMsg
            ? `Context from card message: "${memory.cardMessage}"` 
            : '';
            
        // Explicitly include custom theme details for the song
        const themeDetails = memory.customThemePrompt 
            ? `Specific details/topics to include in lyrics: "${memory.customThemePrompt}"` 
            : '';

        const prompt = `
            Write a rhyming song or poem for a greeting card.
            Occasion: ${memory.occasion}
            To: ${memory.recipientName}
            From: ${memory.senderName}
            Theme: ${memory.theme}
            ${themeDetails}
            ${messageContext}
            
            Requirements:
            1. Style: Musical, rhythmic, catchy.
            2. MUST mention the specific details provided above (e.g. names, pets, hobbies, specific news like job offers) if any.
            3. Length: 2 Verses and a Chorus (approx 8-12 lines). The user wants a substantial song.
            4. Return ONLY the lyrics.
        `;
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });
        return response.text?.trim() || "Happy holidays to you, may your dreams come true.";
    } catch (e: any) {
        console.error("Lyrics gen failed", e);
        throw e;
    }
}

export async function generateCardAudio(text: string, voiceName: string = 'Kore'): Promise<string> {
    try {
        const ai = getClient();
        // Using TTS model for audio generation
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-tts',
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: ['AUDIO'] as any,
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName }
                    }
                }
            }
        });
        
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) throw new Error("No audio generated");
        
        // Convert Base64 PCM to a WAV Blob URL so it plays in standard Audio elements
        const pcmBytes = base64ToBytes(base64Audio);
        const wavUrl = pcmToWavBlobUrl(pcmBytes, 24000); // 24kHz is standard for this model
        
        return wavUrl;
    } catch (e: any) {
        console.error("Audio gen failed", e);
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
