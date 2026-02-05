import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { PROMPT_OCR_VISION } from '../constants';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Increased default retries significantly for stability with slow models
async function retryOperation<T>(operation: () => Promise<T>, retries = 20, delay = 2000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    // Parse potentially nested error objects from Google GenAI SDK
    const innerError = error.error || error;
    const errorCode = innerError?.code || innerError?.status || error?.status;
    const errorMessage = (innerError?.message || error?.message || JSON.stringify(error)).toLowerCase();

    // Identify specific error types
    // "error code: 6" is a browser XHR timeout (common with Thinking models)
    // "503" / "504" are server overloads
    const isNetworkError = 
      errorMessage.includes('xhr error') || 
      errorMessage.includes('error code: 6') || 
      errorMessage.includes('fetch failed') ||
      errorMessage.includes('network error') ||
      errorMessage.includes('deadline exceeded');

    const isServerOverload = 
      errorCode === 500 || 
      errorCode === 503 ||
      errorMessage.includes('overloaded') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('internal error');

    // We classify almost everything as transient in this context because we prefer waiting over failing
    const isTransient = isNetworkError || isServerOverload || errorCode === 429;

    if (retries <= 0 || !isTransient) {
      console.error("Non-retriable or exhausted error:", error);
      throw error;
    }
    
    // Log intent to retry
    const errorType = isNetworkError ? "Network Timeout (Code 6)" : `Server Error (Code ${errorCode})`;
    console.warn(`[Gemini Service] ${errorType} detected. Retrying... (Attempts left: ${retries})`);
    
    // Custom Backoff Strategy:
    // For network timeouts (Code 6), we want to retry fairly quickly but give the network a breather.
    // For server overloads (503), we want to wait longer.
    let nextDelay = delay * 1.5;
    
    if (isNetworkError) {
        // If it was a timeout, wait at least 5 seconds before trying again
        nextDelay = Math.max(nextDelay, 5000); 
    }

    // Cap delay at 30 seconds to avoid looking frozen
    nextDelay = Math.min(nextDelay, 30000); 
    
    await wait(delay);
    
    return retryOperation(operation, retries - 1, nextDelay);
  }
}

// SHARED CONFIG: CRITICAL for OCR to prevent false positives in legal/medical docs
const SAFETY_SETTINGS = [
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

export const processTextWithPrompt = async (
  text: string, 
  systemInstruction: string,
  onApiCall?: () => void,
  modelName: string = 'gemini-2.0-flash',
  thinkingBudget: number = 0
): Promise<string> => {
  return retryOperation(async () => {
    if (onApiCall) onApiCall();
    
    // CRITICAL: New instance per request to avoid session state corruption in browser XHR
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const config: any = {
      systemInstruction: systemInstruction,
      temperature: 0.1, 
      safetySettings: SAFETY_SETTINGS,
    };

    // Add Thinking Config only if explicitly requested AND supported by the model logic
    if (thinkingBudget && thinkingBudget > 0) {
      config.thinkingConfig = { thinkingBudget };
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: text,
      config: config,
    });
    
    return response.text || '';
  });
};

/**
 * Processes a single image for OCR.
 */
export const processImageOCR = async (base64Image: string, onApiCall?: () => void): Promise<string> => {
  return retryOperation(async () => {
    if (onApiCall) onApiCall();

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: {
        parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
            { text: PROMPT_OCR_VISION }
        ]
      },
      config: {
          safetySettings: SAFETY_SETTINGS,
          temperature: 0.1
      }
    });
    
    const text = response.text || '';
    const parts = text.split('### Extracted Text');
    return parts.length > 1 ? parts[1].trim() : text;
  });
};

/**
 * Processes multiple images in a single API call to save quota and time.
 */
export const processBatchImagesOCR = async (
    base64Images: string[], 
    onApiCall?: () => void,
    modelName: string = 'gemini-2.0-flash'
): Promise<string> => {
  return retryOperation(async () => {
    if (onApiCall) onApiCall();

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Construct multipart content
    const parts: any[] = base64Images.map(b64 => ({
        inlineData: { mimeType: 'image/jpeg', data: b64 }
    }));
    
    // Add the prompt at the end ensuring strict order
    parts.push({ text: PROMPT_OCR_VISION + "\n\nIMPORTANT: Transcribe all pages provided in strict sequential order." });

    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
          safetySettings: SAFETY_SETTINGS,
          temperature: 0.1
      }
    });
    
    const text = response.text || '';
    const extractedParts = text.split('### Extracted Text');
    return extractedParts.length > 1 ? extractedParts[1].trim() : text;
  });
};