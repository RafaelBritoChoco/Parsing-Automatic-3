
export enum ProcessingStage {
  IDLE = 'IDLE',
  EXTRACTING = 'EXTRACTING',
  CHUNKING = 'CHUNKING',
  CLEANING = 'CLEANING',
  STRUCTURING_MACRO = 'STRUCTURING_MACRO', // Step 1
  STRUCTURING_MICRO = 'STRUCTURING_MICRO', // Step 2
  PATCHING = 'PATCHING', // Step 3
  REPAIRING = 'REPAIRING', // New Repair Stage
  TRANSLATING = 'TRANSLATING', // New Verification Stage
  AUDITING = 'AUDITING', // New Stage
  DONE = 'DONE',
  ERROR = 'ERROR'
}

export interface Chunk {
  id: number;
  fileName: string; // Associated file name
  originalText: string;
  cleanedText: string;
  step1Text: string; // Headlines
  step2Text: string; // Content
  finalText: string; // Patch/Final
  translatedText?: string; // New field for English verification
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  lastHeadlineLevel?: number; // Context for stateful patch
}

export type ModelType = 'FLASH_2_0' | 'FLASH' | 'FLASH_THINKING' | 'PRO';

// Supported Language Codes:
// AUTO: Detect
// EN: English, PT: Portuguese, ES: Spanish, FR: French, DE: German, IT: Italian
// NL: Dutch, RU: Russian, ZH: Chinese, JA: Japanese, KO: Korean, AR: Arabic
// VI: Vietnamese, HI: Hindi
export type LanguageCode = 'AUTO' | 'EN' | 'PT' | 'ES' | 'FR' | 'DE' | 'IT' | 'NL' | 'RU' | 'ZH' | 'JA' | 'KO' | 'AR' | 'VI' | 'HI';

export interface AppState {
  files: File[]; // Changed from single file to array
  mode: 'FAST' | 'DEEP_OCR';
  chunkingMode: 'AUTO' | 'MANUAL';
  modelType: ModelType; 
  cleaningMode: 'DETERMINISTIC' | 'AI'; 
  targetChunkSize: number; 
  chunks: Chunk[];
  stage: ProcessingStage;
  progress: number;
  error: string | null;
  totalTime: number;
  apiCallCount: number;
  auditReport: string | null; // New field for the Quality Check report
  showTranslation: boolean; // Toggle for split view
  includeAnnexes: boolean; // New toggle for Annex processing
  language: LanguageCode; // NEW: Universal Document Language
  autoRunTarget: 'CLEAN' | 'MACRO' | 'MICRO' | 'FINAL' | null; // NEW: Controls the auto-pipeline
}

export interface GemniConfig {
  model: string;
  temperature: number;
}
