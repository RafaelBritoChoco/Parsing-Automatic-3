import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { PROMPT_OCR_VISION } from '../constants';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);

    promise.then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
};

// Increased default retries significantly for stability with slow models
async function retryOperation<T>(operation: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    // Parse potentially nested error objects from Google GenAI SDK
    const innerError = error.error || error;
    const errorCode = innerError?.code || innerError?.status || error?.status;
    const errorMessage = (innerError?.message || error?.message || JSON.stringify(error)).toLowerCase();

    // Identify specific error types
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
    const errorType = isNetworkError ? "Network Timeout" : errorCode === 429 ? "Rate Limit (429)" : `Server Error (Code ${errorCode})`;
    console.warn(`[Gemini Service] ${errorType} detected. Retrying in ${delay}ms... (Attempts left: ${retries})`);
    
    // Custom Backoff Strategy:
    let nextDelay = delay * 1.5;
    
    if (isNetworkError) {
        nextDelay = Math.max(nextDelay, 5000); 
    } else if (errorCode === 429) {
        nextDelay = Math.max(nextDelay, 4000); // Wait longer for rate limits
    }

    // Cap delay at 15 seconds to avoid looking frozen
    nextDelay = Math.min(nextDelay, 15000); 
    
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
  modelName: string = 'gemini-3.5-flash',
  thinkingBudget: number = 0,
  onProgress?: (text: string) => void
): Promise<string> => {
  return retryOperation(async () => {
    if (onApiCall) onApiCall();
    
    // CRITICAL: New instance per request to avoid session state corruption in browser XHR
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const config: any = {
      systemInstruction: systemInstruction,
      temperature: 0.1, 
      safetySettings: SAFETY_SETTINGS,
    };

    // Add Thinking Config only if explicitly requested AND supported by the model logic
    if (modelName.includes('gemini-3') || modelName.includes('gemini-3.5')) {
        // Gemini 3 series uses thinkingLevel, not thinkingBudget. 
        if (thinkingBudget && thinkingBudget > 0) {
            config.thinkingConfig = { thinkingLevel: 'HIGH' };
        } else if (modelName.includes('lite')) {
            config.thinkingConfig = { thinkingLevel: 'MINIMAL' };
        } else {
            config.thinkingConfig = { thinkingLevel: 'LOW' };
        }
    } else if (thinkingBudget && thinkingBudget > 0) {
        config.thinkingConfig = { thinkingBudget };
    }

    const chat = ai.chats.create({
      model: modelName,
      config: config,
    });

    let fullText = '';
    let isContinuing = false;
    let maxContinuations = 5; // Allow up to 5 continuations for massive chunks
    let continuations = 0;

    while (continuations < maxContinuations) {
        const message = isContinuing 
            ? `Your previous response was cut off due to length limits. CONTINUE EXACTLY FROM WHERE YOU LEFT OFF. DO NOT REPEAT TEXT. Do not add any introductory remarks. Just continue the text. The last words you wrote were: "${fullText.slice(-100)}"` 
            : text;

        const responseStream = await chat.sendMessageStream({ message });
        
        let chunkFinishReason = '';
        let lastProgressTime = 0;
        for await (const chunk of responseStream) {
            const c = chunk as any;
            if (c.text) {
                fullText += c.text;
                const now = Date.now();
                if (onProgress && (now - lastProgressTime > 100)) {
                    onProgress(fullText);
                    lastProgressTime = now;
                }
            }
            if (c.candidates && c.candidates.length > 0 && c.candidates[0].finishReason) {
                chunkFinishReason = c.candidates[0].finishReason;
            }
        }
        
        // Ensure final progress is sent
        if (onProgress) onProgress(fullText);

        if (chunkFinishReason === 'MAX_TOKENS') {
            isContinuing = true;
            continuations++;
            if (onApiCall) onApiCall(); // Count the extra API call for the continuation
            console.log(`[Gemini] Output truncated (MAX_TOKENS). Initiating continuation ${continuations}/${maxContinuations}...`);
        } else {
            break; // Finished successfully
        }
    }
    
    return fullText;
  });
};

/**
 * Processes a single image for OCR.
 */
export const processImageOCR = async (base64Image: string, onApiCall?: () => void): Promise<string> => {
  return retryOperation(async () => {
    if (onApiCall) onApiCall();

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
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
    modelName: string = 'gemini-3.5-flash'
): Promise<string> => {
  return retryOperation(async () => {
    if (onApiCall) onApiCall();

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Construct multipart content
    const parts: any[] = base64Images.map(b64 => ({
        inlineData: { mimeType: 'image/jpeg', data: b64 }
    }));
    
    // Add the prompt at the end ensuring strict order
    parts.push({ text: PROMPT_OCR_VISION + "\n\nIMPORTANT: Transcribe all pages provided in strict sequential order." });

    const response = await ai.models.generateContent({
      model: modelName,
      contents: parts,
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