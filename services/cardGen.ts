import { GoogleGenAI, Modality } from '@google/genai';
import { AgentMemory } from '../types';
import { base64ToBytes, pcmToWavBlobUrl } from '../utils/audioUtils';

export async function generateCardMessage(memory: AgentMemory, tone: string = 'warm'): Promise<string> {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Write a ${memory.occasion} card for ${memory.recipientName}.`
        });
        return response.text?.trim() || "Joy to you.";
    } catch (e) {
        throw e;
    }
}

export async function generateSongLyrics(memory: AgentMemory): Promise<string> {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Write song lyrics for ${memory.occasion}.`
        });
        return response.text?.trim() || "Happy days are here.";
    } catch (e) {
        throw e;
    }
}

export async function generateCardAudio(text: string, voiceName: string = 'Kore'): Promise<string> {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-tts',
            contents: [{ parts: [{ text }] }],
            config: {
                // Fix: use Modality enum from SDK
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName }
                    }
                }
            }
        });
        const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64) throw new Error("No audio");
        return pcmToWavBlobUrl(base64ToBytes(base64), 24000);
    } catch (e) {
        throw e;
    }
}

export async function generateCardImage(
    memory: AgentMemory, 
    stylePrompt: string, 
    referenceImageBase64?: string, 
    refinementText?: string,
    aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9' = '1:1'
): Promise<string> {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const parts: any[] = [{ text: `Holiday card art. Occasion: ${memory.occasion}.` }];
        if (referenceImageBase64) {
            parts.push({
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: referenceImageBase64.split(',')[1]
                }
            });
        }
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: { parts },
            config: {
                imageConfig: { aspectRatio, imageSize: "1K" }
            }
        });
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
        throw new Error("No image");
    } catch (e) {
        throw e;
    }
}