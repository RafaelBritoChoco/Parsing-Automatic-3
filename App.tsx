
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { extractTextFast, extractImagesForDeepOCR } from './services/pdfExtractor';
import { createChunks, parseChunksFromFormattedText } from './services/chunkingService';
import { processTextWithPrompt, processBatchImagesOCR } from './services/geminiService';
import { translateTextFree } from './services/freeTranslationService';
import { restoreLayoutDeterministically } from './services/layoutRestorer';
import { detectLanguage } from './services/languageDetector';
import { AppState, ProcessingStage, Chunk, LanguageCode } from './types';
import { 
    PROMPT_CLEANING, PROMPT_STEP_1, PROMPT_STEP_2, PROMPT_STEP_3, 
    PROMPT_QUALITY_CHECK_CLEAN, PROMPT_QUALITY_CHECK_MACRO, PROMPT_QUALITY_CHECK_MICRO, 
    PROMPT_REPAIR_CLEAN, PROMPT_REPAIR_STRUCTURE 
} from './constants';
import ResultViewer from './components/ResultViewer';
import { StepCard } from './components/StepCard';
import { IconCheck, IconUpload, IconSearch, IconWand, IconArchive, IconTranslate, IconImport, IconPlay } from './components/Icons';
import * as FormatUtils from './services/formatUtils';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    files: [], mode: 'FAST', chunkingMode: 'AUTO', modelType: 'FLASH_2_0', 
    cleaningMode: 'DETERMINISTIC', targetChunkSize: 50000, chunks: [],
    stage: ProcessingStage.IDLE, progress: 0, error: null, totalTime: 0,
    apiCallCount: 0, auditReport: null, showTranslation: false,
    includeAnnexes: true, language: 'AUTO',
    autoRunTarget: null // Initialize as null
  });

  const [activeTab, setActiveTab] = useState<'RAW' | 'CLEAN' | 'MACRO' | 'MICRO' | 'FINAL'>('RAW');
  const [isEditing, setIsEditing] = useState(false);
  const [importTargetStep, setImportTargetStep] = useState<'CLEAN' | 'MACRO' | 'MICRO' | 'PATCH' | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  // Status Checkers
  const hasChunks = state.chunks.length > 0;
  const hasCleaned = hasChunks && state.chunks.some(c => c.cleanedText && c.cleanedText.trim().length > 0);
  const hasStep1 = hasChunks && state.chunks.some(c => c.step1Text && c.step1Text.trim().length > 0);
  const hasStep2 = hasChunks && state.chunks.some(c => c.step2Text && c.step2Text.trim().length > 0);
  const hasFinal = hasChunks && state.chunks.some(c => c.finalText && c.finalText.trim().length > 0);

  const incrementApiCount = useCallback(() => setState(prev => ({ ...prev, apiCallCount: prev.apiCallCount + 1 })), []);
  const updateChunk = (id: number, fields: Partial<Chunk>) => setState(prev => ({ ...prev, chunks: prev.chunks.map(c => c.id === id ? { ...c, ...fields } : c) }));

  // --- AUTO PIPELINE ORCHESTRATOR ---
  // This useEffect watches the stage. When IDLE, if there is an autoRunTarget, it triggers the next step.
  useEffect(() => {
    if (state.stage !== ProcessingStage.IDLE || !state.autoRunTarget || state.error || cancelRef.current) return;

    // Define the sequence order
    const sequence = ['RAW', 'CLEAN', 'MACRO', 'MICRO', 'FINAL'];
    const targetIndex = sequence.indexOf(state.autoRunTarget);

    const executeNext = async () => {
        if (!hasChunks) {
            console.log("[AutoRun] Starting Extraction...");
            await runExtraction();
        } 
        else if (!hasCleaned && targetIndex >= 1) {
            console.log("[AutoRun] Starting Cleaning...");
            await runStepOnAllChunks('CLEAN');
        }
        else if (!hasStep1 && targetIndex >= 2) {
            console.log("[AutoRun] Starting Macro...");
            await runStepOnAllChunks('MACRO');
        }
        else if (!hasStep2 && targetIndex >= 3) {
            console.log("[AutoRun] Starting Micro...");
            await runStepOnAllChunks('MICRO');
        }
        else if (!hasFinal && targetIndex >= 4) {
            console.log("[AutoRun] Starting Final Patch...");
            await runStepOnAllChunks('PATCH');
        }
        else {
            // Target reached or everything done
            console.log("[AutoRun] Pipeline Complete or Target Reached.");
            setState(s => ({ ...s, autoRunTarget: null }));
            // Alert user visually via tab switch (handled in runStep) or just finish
        }
    };

    // Use a small timeout to let state settle before triggering next async operation
    const timer = setTimeout(() => {
        executeNext();
    }, 500);

    return () => clearTimeout(timer);

  }, [state.stage, state.autoRunTarget, hasChunks, hasCleaned, hasStep1, hasStep2, hasFinal, state.error]);


  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setState(prev => ({ ...prev, files: Array.from(e.target.files!), chunks: [], stage: ProcessingStage.IDLE, error: null, apiCallCount: 0, auditReport: null, autoRunTarget: null }));
      setActiveTab('RAW');
    }
  };

  const handleCancel = () => {
    cancelRef.current = true;
    setState(prev => ({ ...prev, stage: ProcessingStage.IDLE, autoRunTarget: null, error: "Process cancelled by user.", chunks: prev.chunks.map(c => c.status === 'PROCESSING' ? { ...c, status: 'PENDING' } : c) }));
  };

  const triggerImport = (targetStep: 'CLEAN' | 'MACRO' | 'MICRO' | 'PATCH') => {
      setImportTargetStep(targetStep);
      setTimeout(() => importInputRef.current?.click(), 0);
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.[0] || !importTargetStep) return;
      const file = e.target.files[0]; e.target.value = '';
      try {
          const text = await file.text();
          let newChunks: Chunk[] = [];
          if (text.includes('--- CHUNK')) {
              newChunks = parseChunksFromFormattedText(text, file.name);
          } else {
              newChunks = createChunks(text, state.targetChunkSize, file.name, 0);
          }
          const BACKFILL = '[SKIPPED - DIRECT IMPORT]';
          let nextTab: any = 'RAW';
          const finalChunks: Chunk[] = newChunks.map(c => {
              const content = c.originalText;
              let update: Partial<Chunk> = {};
              switch(importTargetStep) {
                  case 'CLEAN': update = { originalText: content, cleanedText: '', step1Text: '', step2Text: '', finalText: '' }; nextTab = 'RAW'; break;
                  case 'MACRO': update = { originalText: BACKFILL, cleanedText: content, step1Text: '', step2Text: '', finalText: '' }; nextTab = 'CLEAN'; break;
                  case 'MICRO': update = { originalText: BACKFILL, cleanedText: BACKFILL, step1Text: content, step2Text: '', finalText: '' }; nextTab = 'MACRO'; break;
                  case 'PATCH': update = { originalText: BACKFILL, cleanedText: BACKFILL, step1Text: BACKFILL, step2Text: content, finalText: '' }; nextTab = 'MICRO'; break;
              }
              return { ...c, ...update, status: 'PENDING' as const };
          });
          setState(prev => ({ ...prev, chunks: finalChunks, stage: ProcessingStage.IDLE, files: [file] }));
          setActiveTab(nextTab);
          setImportTargetStep(null);
      } catch (err: any) { alert("Error importing: " + err.message); }
  };

  const getModelConfig = () => {
      const map: Record<string, string> = { FLASH_2_0: 'gemini-2.0-flash', FLASH: 'gemini-3-flash-preview', PRO: 'gemini-3-pro-preview', FLASH_THINKING: 'gemini-3-flash-preview' };
      return { 
          label: state.modelType === 'FLASH_THINKING' ? 'gemini-3-flash-preview (Think)' : map[state.modelType] || 'gemini-2.0-flash', 
          modelName: map[state.modelType] || 'gemini-2.0-flash', 
          thinkingBudget: state.modelType === 'FLASH_THINKING' ? 4096 : 0 
      };
  };

  const runExtraction = async () => {
    if (state.files.length === 0) return; cancelRef.current = false;
    setState(prev => ({ ...prev, stage: ProcessingStage.EXTRACTING, progress: 0, error: null, chunks: [] }));
    setActiveTab('RAW');
    const { modelName } = getModelConfig(); let allChunks: Chunk[] = [];
    let autoDetectedLang: LanguageCode = 'AUTO';

    try {
        for (let i = 0; i < state.files.length; i++) {
            if (cancelRef.current) throw new Error("Cancelled by user");
            const f = state.files[i];
            let txt = '';
            if (f.type === 'application/pdf') {
                txt = state.mode === 'FAST' ? await extractTextFast(f) : await processBatchImagesOCR(await extractImagesForDeepOCR(f), incrementApiCount, modelName);
            } else {
                 txt = await f.text(); 
            }
            
            if (i === 0 && state.language === 'AUTO') {
                const detected = detectLanguage(txt);
                if (detected !== 'AUTO') {
                    autoDetectedLang = detected;
                    console.log(`[AutoDetect] Language identified: ${detected}`);
                }
            }

            allChunks.push(...createChunks(txt, state.targetChunkSize, f.name, allChunks.length));
            setState(prev => ({ ...prev, chunks: [...allChunks], progress: ((i + 1) / state.files.length) * 100 }));
        }
        
        setState(prev => ({ 
            ...prev, 
            stage: ProcessingStage.IDLE, 
            progress: 100,
            language: autoDetectedLang !== 'AUTO' ? autoDetectedLang : prev.language 
        }));

    } catch (e: any) { setState(prev => ({ ...prev, stage: ProcessingStage.ERROR, error: e.message, autoRunTarget: null })); }
  };

  const runStepOnAllChunks = async (step: 'CLEAN' | 'MACRO' | 'MICRO' | 'PATCH') => {
      if (!hasChunks) return; cancelRef.current = false;
      const stageMap = { CLEAN: ProcessingStage.CLEANING, MACRO: ProcessingStage.STRUCTURING_MACRO, MICRO: ProcessingStage.STRUCTURING_MICRO, PATCH: ProcessingStage.PATCHING };
      const fieldMap = { CLEAN: 'cleanedText', MACRO: 'step1Text', MICRO: 'step2Text', PATCH: 'finalText' };
      const inputMap = { CLEAN: 'originalText', MACRO: 'cleanedText', MICRO: 'step1Text', PATCH: 'step2Text' };
      const nextTabMap: any = { CLEAN: 'CLEAN', MACRO: 'MACRO', MICRO: 'MICRO', PATCH: 'FINAL' };

      setState(prev => ({ ...prev, stage: stageMap[step], progress: 0 })); setActiveTab(nextTabMap[step]);
      const { modelName, thinkingBudget } = getModelConfig();
      
      let prevCtx = ""; 
      let curFile = ""; 
      let skipAnnex = false;
      let lastLevel = -1; // TRACKS HIERARCHY STATE: -1 indicates Start of File

      for (let i = 0; i < state.chunks.length; i++) {
          if (cancelRef.current) break;
          const c = state.chunks[i];
          if (c.fileName !== curFile) { 
              prevCtx = ""; 
              curFile = c.fileName; 
              skipAnnex = false; 
              lastLevel = -1; // Reset level on new file to -1
          }
          if (skipAnnex) { updateChunk(c.id, { [fieldMap[step]]: '', status: 'SKIPPED' }); continue; }
          updateChunk(c.id, { status: 'PROCESSING' });
          try {
              let input = c[inputMap[step] as keyof Chunk] as string || c.originalText;
              if (!input || input.includes('[SKIPPED')) { updateChunk(c.id, { status: 'FAILED' }); continue; }
              let prompt = '';
              if (step === 'CLEAN') prompt = PROMPT_CLEANING(state.language);
              else if (step === 'MACRO') prompt = PROMPT_STEP_1(prevCtx === "", state.language);
              else if (step === 'MICRO') prompt = PROMPT_STEP_2(prevCtx, state.language);
              else prompt = PROMPT_STEP_3(prevCtx, lastLevel); // PASS STATE

              let res = '';
              if (step === 'CLEAN' && state.cleaningMode === 'DETERMINISTIC') {
                   res = restoreLayoutDeterministically(input);
                   await new Promise(r => setTimeout(r, 50));
              } else {
                   res = await processTextWithPrompt(input, prompt, incrementApiCount, modelName, thinkingBudget);
              }

              if (step === 'MACRO' && !state.includeAnnexes && res.match(/{{level\d+}}\s*(ANNEX|APPENDIX|SCHEDULE|ATTACHMENT|ANNEXE|APÊNDICE)/i)) skipAnnex = true;
              
              updateChunk(c.id, { [fieldMap[step]]: res, status: 'COMPLETED' }); 
              prevCtx = res.slice(-1500);

              // UPDATE STATE FOR NEXT CHUNK (PATCH STEP ONLY)
              if (step === 'PATCH') {
                  const matches = res.match(/{{level(\d+)}}/g);
                  if (matches && matches.length > 0) {
                      const lastTag = matches[matches.length - 1];
                      const levelNum = parseInt(lastTag.replace(/\D/g, ''));
                      if (!isNaN(levelNum)) lastLevel = levelNum;
                  }
              }

          } catch (e) { 
              updateChunk(c.id, { status: 'FAILED' }); 
              setState(prev => ({ ...prev, stage: ProcessingStage.ERROR, error: "Error at chunk " + c.id, autoRunTarget: null })); 
              break; 
          }
          setState(prev => ({ ...prev, progress: ((i + 1) / state.chunks.length) * 100 }));
      }
      if (!cancelRef.current && state.stage !== ProcessingStage.ERROR) setState(prev => ({ ...prev, stage: ProcessingStage.IDLE }));
  };

  const runRepair = async () => {
    if (!hasChunks) return;
    const field = FormatUtils.getFieldForTab(activeTab); if (!field) return alert("Select a processed stage.");
    setState(prev => ({ ...prev, stage: ProcessingStage.REPAIRING, progress: 0, auditReport: null }));
    const { modelName } = getModelConfig();
    const prompt = activeTab === 'CLEAN' ? PROMPT_REPAIR_CLEAN : PROMPT_REPAIR_STRUCTURE;
    
    for (let i = 0; i < state.chunks.length; i++) {
        if (cancelRef.current) break;
        const chunk = state.chunks[i];
        if (!chunk[field]) continue;
        updateChunk(chunk.id, { status: 'PROCESSING' });
        try {
            const res = await processTextWithPrompt(chunk[field] as string, prompt, incrementApiCount, modelName);
            updateChunk(chunk.id, { [field]: res, status: 'COMPLETED' });
        } catch (e) { updateChunk(chunk.id, { status: 'FAILED' }); break; }
        setState(prev => ({ ...prev, progress: ((i + 1) / state.chunks.length) * 100 }));
    }
    setState(prev => ({ ...prev, stage: ProcessingStage.IDLE }));
  };

  const runTranslationVerifier = async () => {
      if (state.showTranslation) { setState(prev => ({ ...prev, showTranslation: false })); return; }
      if (!hasChunks) return;
      const field = FormatUtils.getFieldForTab(activeTab); if (!field || field === 'originalText') return alert("Verify processed text.");
      setState(prev => ({ ...prev, stage: ProcessingStage.TRANSLATING, progress: 0, showTranslation: true }));
      for (let i = 0; i < state.chunks.length; i++) {
          if (cancelRef.current) break;
          const c = state.chunks[i];
          if (!c[field]) continue;
          updateChunk(c.id, { status: 'PROCESSING' });
          try {
              const res = await translateTextFree(c[field] as string);
              updateChunk(c.id, { translatedText: res, status: 'COMPLETED' });
          } catch (e) { updateChunk(c.id, { status: 'FAILED' }); }
          setState(prev => ({ ...prev, progress: ((i + 1) / state.chunks.length) * 100 }));
      }
      setState(prev => ({ ...prev, stage: ProcessingStage.IDLE }));
  };

  const runQualityCheck = async () => {
    const txt = FormatUtils.getActiveTextClean(state.chunks, activeTab); if (!txt) return alert("No text.");
    setState(prev => ({ ...prev, stage: ProcessingStage.AUDITING, auditReport: null }));
    const prompt = activeTab === 'CLEAN' ? PROMPT_QUALITY_CHECK_CLEAN : activeTab === 'MACRO' ? PROMPT_QUALITY_CHECK_MACRO : PROMPT_QUALITY_CHECK_MICRO;
    try {
        const report = await processTextWithPrompt(txt.substring(0, 50000), prompt, incrementApiCount, getModelConfig().modelName);
        setState(prev => ({ ...prev, auditReport: report, stage: ProcessingStage.IDLE }));
    } catch (e: any) { setState(prev => ({ ...prev, stage: ProcessingStage.IDLE, error: e.message })); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-6 bg-slate-100 font-sans text-slate-800">
      <input type="file" ref={importInputRef} accept=".txt" className="hidden" onChange={handleImportFileChange} />
      <header className="w-full max-w-7xl mb-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
        <div><h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-600">Structural OCR v3.3 (Universal)</h1></div>
        <div className="flex gap-6 text-xs font-semibold text-slate-500 items-center">
             <div>FILES: <span className="text-indigo-600">{state.files.length}</span></div>
             <div>CHUNKS: <span className="text-indigo-600">{state.chunks.length}</span></div>
             <div>API CALLS: <span className="text-indigo-600">{state.apiCallCount}</span></div>
             <div className="flex items-center gap-1">MODEL: <span className="text-purple-700 font-mono bg-purple-50 px-2 py-0.5 rounded border border-purple-200">{getModelConfig().label}</span></div>
             <div className="flex items-center gap-2">
                 {state.error ? (<div className="text-red-600 font-bold bg-red-50 px-2 py-1 rounded border border-red-200">ERROR: {state.error.substring(0, 30)}...</div>) : (<>STATUS: <span className={`${state.stage === ProcessingStage.IDLE ? 'text-green-600' : 'text-amber-500 animate-pulse'}`}>{state.stage}</span></>)}
                 {state.stage !== ProcessingStage.IDLE && (<button onClick={handleCancel} className="bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded text-[10px] font-bold hover:bg-red-100 transition-colors">CANCEL</button>)}
             </div>
        </div>
      </header>
      <div className="w-full max-w-7xl bg-white rounded-xl shadow-lg border border-slate-200 p-6 mb-6">
        <div className="flex flex-wrap gap-4 mb-8 border-b border-slate-100 pb-6 items-center justify-between">
             <div className="relative">
                <input type="file" ref={fileInputRef} accept=".pdf, .txt, .html" multiple onChange={handleFileUpload} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg font-bold text-sm transition-colors border border-indigo-200 flex items-center gap-2"><IconUpload />{state.files.length === 0 ? "Select Documents" : `${state.files.length} Docs Selected`}</button>
             </div>
             
             {/* --- AUTO RUN CONTROLS --- */}
             <div className="flex-1 flex justify-center items-center gap-2">
                 {state.files.length > 0 && (
                     <div className="flex items-center gap-2 bg-gradient-to-r from-indigo-50 to-blue-50 p-1.5 rounded-lg border border-indigo-200 shadow-sm animate-fade-in">
                         <span className="text-[10px] font-bold text-indigo-800 pl-2 uppercase tracking-wide">⚡ Auto-Process:</span>
                         <div className="flex rounded overflow-hidden border border-indigo-200">
                            {['CLEAN', 'MACRO', 'MICRO', 'FINAL'].map((step, idx) => (
                                <button 
                                    key={step} 
                                    disabled={state.stage !== ProcessingStage.IDLE}
                                    onClick={() => setState(s => ({...s, autoRunTarget: step as any}))} 
                                    className={`px-3 py-1.5 text-[10px] font-bold uppercase transition-all ${state.autoRunTarget === step || (state.autoRunTarget && idx <= ['CLEAN', 'MACRO', 'MICRO', 'FINAL'].indexOf(state.autoRunTarget)) ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-400 hover:bg-indigo-50'}`}
                                >
                                    {step === 'FINAL' ? 'Patch (End)' : step}
                                </button>
                            ))}
                         </div>
                         {state.autoRunTarget && state.stage !== ProcessingStage.IDLE && (
                             <div className="text-[10px] text-indigo-600 font-bold animate-pulse px-2">Running to {state.autoRunTarget}...</div>
                         )}
                     </div>
                 )}
             </div>

             <div className="flex gap-4 items-center flex-wrap justify-end">
                 <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                     <span className="text-[10px] font-bold text-slate-500 pl-2">Target Language:</span>
                     <select 
                        value={state.language} 
                        onChange={(e) => setState(s => ({...s, language: e.target.value as LanguageCode}))}
                        className="text-[11px] font-bold uppercase bg-white border border-slate-300 rounded px-2 py-1 text-indigo-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
                     >
                        <option value="AUTO">🌍 AUTO (Universal)</option>
                        <option disabled>--- Americas/Europe ---</option>
                        <option value="EN">🇺🇸 English</option>
                        <option value="PT">🇧🇷 Portuguese</option>
                        <option value="ES">🇪🇸 Spanish</option>
                        <option value="FR">🇫🇷 French</option>
                        <option value="DE">🇩🇪 German</option>
                        <option value="IT">🇮🇹 Italian</option>
                        <option value="NL">🇳🇱 Dutch</option>
                        <option value="RU">🇷🇺 Russian</option>
                        <option disabled>--- Asia/MidEast ---</option>
                        <option value="ZH">🇨🇳 Chinese</option>
                        <option value="JA">🇯🇵 Japanese</option>
                        <option value="KO">🇰🇷 Korean</option>
                        <option value="VI">🇻🇳 Vietnamese</option>
                        <option value="AR">🇸🇦 Arabic</option>
                        <option value="HI">🇮🇳 Hindi</option>
                     </select>
                 </div>
                 <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200 flex gap-1"><button onClick={() => setState(s => ({...s, includeAnnexes: !s.includeAnnexes}))} className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-all ${state.includeAnnexes ? 'bg-white text-green-600 shadow-sm' : 'text-red-500'}`}>{state.includeAnnexes ? 'INCLUDE' : 'SKIP'}</button></div>
                 <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200 flex gap-1">
                     {['FLASH_2_0', 'FLASH', 'FLASH_THINKING', 'PRO'].map(m => <button key={m} onClick={() => setState(s => ({...s, modelType: m as any}))} className={`px-3 py-1 rounded text-[10px] font-bold font-mono transition-all ${state.modelType === m ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-400'}`}>{m.replace('FLASH_THINKING', 'THINK').replace('FLASH_2_0', '2.0').replace('FLASH', '3.0')}</button>)}
                 </div>
             </div>
        </div>
        <div className="grid grid-cols-5 gap-4">
            <StepCard step="1" title="Extract & Chunk" isActive={state.stage === ProcessingStage.EXTRACTING} isCompleted={hasChunks} isReady={true} onRun={runExtraction} runLabel={hasChunks ? 'Re-Run' : 'Start'} disabled={state.files.length === 0 || state.stage !== ProcessingStage.IDLE} dataLabel={!hasChunks ? <div className="text-slate-300">---</div> : undefined} buttonClass="bg-indigo-600 text-white hover:bg-indigo-700 shadow-md">
                <div className="flex bg-slate-100 rounded p-0.5 mb-2 w-full"><button onClick={() => setState(s => ({...s, mode: 'FAST'}))} className={`flex-1 text-[9px] font-bold py-1 rounded transition-colors ${state.mode === 'FAST' ? 'bg-white shadow text-blue-700' : 'text-slate-400 hover:text-slate-600'}`}>Native (Fast)</button><button onClick={() => setState(s => ({...s, mode: 'DEEP_OCR'}))} className={`flex-1 text-[9px] font-bold py-1 rounded transition-colors ${state.mode === 'DEEP_OCR' ? 'bg-white shadow text-indigo-700' : 'text-slate-400 hover:text-slate-600'}`}>OCR (Vision)</button></div>
            </StepCard>
            <StepCard step="2" title={state.cleaningMode === 'DETERMINISTIC' ? 'Safe Layout Fix' : 'Deep Cleaning'} isActive={state.stage === ProcessingStage.CLEANING} isCompleted={hasCleaned} isReady={hasChunks} onRun={() => runStepOnAllChunks('CLEAN')} onImport={() => triggerImport('CLEAN')} runLabel={`Run ${state.cleaningMode === 'DETERMINISTIC' ? 'Safe Clean' : 'AI Clean'}`} disabled={!hasChunks || state.stage !== ProcessingStage.IDLE} dataLabel={!hasChunks ? <span className="text-xs text-slate-300">No Data</span> : undefined}>
                <div className="flex bg-slate-100 rounded p-0.5 mb-2 w-full"><button onClick={() => setState(s => ({...s, cleaningMode: 'DETERMINISTIC'}))} className={`flex-1 text-[9px] font-bold py-1 rounded transition-colors ${state.cleaningMode === 'DETERMINISTIC' ? 'bg-white shadow text-teal-700' : 'text-slate-400 hover:text-slate-600'}`}>SAFE (Math)</button><button onClick={() => setState(s => ({...s, cleaningMode: 'AI'}))} className={`flex-1 text-[9px] font-bold py-1 rounded transition-colors ${state.cleaningMode === 'AI' ? 'bg-white shadow text-indigo-700' : 'text-slate-400 hover:text-slate-600'}`}>AI (Deep)</button></div>
            </StepCard>
            <StepCard step="3" title="Macro Struct" isActive={state.stage === ProcessingStage.STRUCTURING_MACRO} isCompleted={hasStep1} isReady={hasCleaned} onRun={() => runStepOnAllChunks('MACRO')} onImport={() => triggerImport('MACRO')} runLabel="Run Macro" disabled={!hasChunks || state.stage !== ProcessingStage.IDLE} />
            <StepCard step="4" title="Micro Struct" isActive={state.stage === ProcessingStage.STRUCTURING_MICRO} isCompleted={hasStep2} isReady={hasStep1} onRun={() => runStepOnAllChunks('MICRO')} onImport={() => triggerImport('MICRO')} runLabel="Run Micro" disabled={!hasChunks || state.stage !== ProcessingStage.IDLE} />
            <StepCard step="5" title="Final Patch" isActive={state.stage === ProcessingStage.PATCHING} isCompleted={hasFinal} isReady={hasStep2} onRun={() => runStepOnAllChunks('PATCH')} onImport={() => triggerImport('PATCH')} runLabel="Run Patch" disabled={!hasChunks || state.stage !== ProcessingStage.IDLE} />
        </div>
        {state.stage !== ProcessingStage.IDLE && !state.error && state.stage !== ProcessingStage.AUDITING && (<div className="mt-6"><div className="flex justify-between text-xs mb-1 font-bold text-indigo-600"><span>Processing...</span><span>{Math.round(state.progress)}%</span></div><div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden"><div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300" style={{width: `${state.progress}%`}}></div></div></div>)}
        {state.stage === ProcessingStage.ERROR && (<div className="mt-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"><strong className="font-bold">Process Paused! </strong><span className="block sm:inline">{state.error}</span><div className="mt-2"><button onClick={() => runStepOnAllChunks(importTargetStep || 'CLEAN' as any)} className="bg-red-600 text-white px-3 py-1 rounded text-xs font-bold mr-2 hover:bg-red-700">Retry Step</button></div></div>)}
      </div>
      {state.chunks.length > 0 && (
          <div className="w-full max-w-7xl flex gap-6">
              <div className="flex-1 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col">
                  <div className="flex justify-between items-center p-2 bg-slate-50 border-b border-slate-200">
                      <div className="flex gap-1">{['RAW', 'CLEAN', 'MACRO', 'MICRO', 'FINAL'].map(t => <button key={t} onClick={() => setActiveTab(t as any)} className={`px-4 py-2 text-xs font-bold rounded-md transition-colors ${activeTab === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>{t}</button>)}</div>
                      <div className="flex gap-2">
                          <button onClick={runTranslationVerifier} className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors flex items-center gap-1 ${state.showTranslation ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white border-slate-300 text-blue-600 hover:bg-blue-50'}`} disabled={state.stage !== ProcessingStage.IDLE || activeTab === 'RAW'}><IconTranslate />Verify (En)</button>
                          <button onClick={runQualityCheck} className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors flex items-center gap-1 ${state.stage === ProcessingStage.AUDITING ? 'bg-purple-100 text-purple-700 border-purple-300' : 'bg-white border-slate-300 text-purple-600 hover:bg-purple-50'}`} disabled={state.stage !== ProcessingStage.IDLE}><IconSearch />Check Quality</button>
                          <button onClick={() => setIsEditing(!isEditing)} className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors ${isEditing ? 'bg-yellow-100 border-yellow-300 text-yellow-800' : 'bg-white border-slate-300 text-slate-600'}`}>{isEditing ? 'Exit Edit' : 'Edit Text'}</button>
                          <button onClick={() => FormatUtils.downloadCurrentTab(state.chunks, activeTab)} className="bg-slate-800 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-slate-900 flex items-center gap-1"><IconArchive /> {state.files.length > 1 ? 'Download ZIP' : `Download ${activeTab}`}</button>
                      </div>
                  </div>
                  <div className="bg-slate-50 flex-1 relative"><ResultViewer key={activeTab} text={isEditing ? FormatUtils.getActiveTextWithDelimiters(state.chunks, activeTab) : FormatUtils.getActiveTextClean(state.chunks, activeTab)} translatedText={state.showTranslation ? FormatUtils.getTranslatedTextClean(state.chunks) : undefined} isEditing={isEditing} onTextChange={(val) => setState(prev => ({ ...prev, chunks: FormatUtils.parseGlobalChange(val, prev.chunks, activeTab) }))} /></div>
              </div>
              {state.auditReport && (<div className="w-80 bg-white rounded-xl shadow-lg border border-purple-200 flex flex-col overflow-hidden animate-fade-in-right"><div className="bg-purple-50 p-4 border-b border-purple-100 flex justify-between items-center"><h3 className="font-bold text-purple-800 flex items-center gap-2"><IconCheck /> Quality Report</h3><button onClick={() => setState(s => ({...s, auditReport: null}))} className="text-purple-400 hover:text-purple-600 text-lg">&times;</button></div><div className="p-4 overflow-y-auto text-sm text-slate-700 prose prose-sm prose-purple max-h-[400px]"><pre className="whitespace-pre-wrap font-sans text-sm">{state.auditReport}</pre></div><div className="p-4 bg-purple-50 border-t border-purple-100"><button onClick={runRepair} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded shadow-md flex items-center justify-center gap-2 transition-colors"><IconWand /> {activeTab === 'CLEAN' ? 'Auto-Fix Text' : 'Auto-Fix Structure'}</button><p className="text-[10px] text-purple-600 mt-2 text-center opacity-70">{activeTab === 'CLEAN' ? 'Fixes layout & typos (No Tags).' : 'Fixes broken syntax & tags.'}</p></div></div>)}
              {!state.auditReport && (<div className="w-64"><div className="bg-white p-4 rounded-xl shadow border border-slate-200"><h4 className="font-bold text-slate-500 text-xs mb-4">CHUNK STATUS</h4><div className="space-y-2">{state.chunks.map(c => (<div key={c.id} className="flex flex-col bg-slate-50 p-2 rounded border border-slate-100 text-xs gap-1"><div className="flex justify-between items-center"><span className="font-mono text-slate-400">#{c.id}</span><span className={`font-bold ${c.status === 'FAILED' ? 'text-red-600' : c.status === 'PROCESSING' ? 'text-amber-500' : c.status === 'COMPLETED' ? 'text-green-600' : c.status === 'SKIPPED' ? 'text-blue-400 italic' : 'text-slate-400'}`}>{c.status}</span></div><div className="text-[10px] text-slate-400 truncate" title={c.fileName}>{c.fileName}</div></div>))}</div></div></div>)}
          </div>
      )}
    </div>
  );
};

export default App;
