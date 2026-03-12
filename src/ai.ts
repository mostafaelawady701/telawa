import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function analyzeRecitation(base64Audio: string, mimeType: string) {
  try {
    // Remove the data URL prefix (e.g., "data:audio/webm;base64,")
    const base64Data = base64Audio.split(',')[1];
    
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType || 'audio/webm',
              }
            },
            {
              text: "Analyze this Quran recitation. Provide feedback on the Tajweed, pronunciation (Makharij), and overall quality. Be encouraging but point out specific areas for improvement. Respond in Arabic."
            }
          ]
        }
      ],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
      }
    });
    
    return response.text;
  } catch (error) {
    console.error("Error analyzing recitation:", error);
    throw error;
  }
}
