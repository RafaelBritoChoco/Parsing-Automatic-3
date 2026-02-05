
import React, { useState, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import { extractTextFast, extractImagesForDeepOCR } from './services/pdfExtractor';
import { extractTextFromHtml } from './services/htmlExtractor';
import { createChunks, parseChunksFromFormattedText } from './services/chunkingService';
import { processTextWithPrompt, processBatchImagesOCR } from './services/geminiService';
import { translateTextFree } from './services/freeTranslationService';
import { restoreLayoutDeterministically } from './services/layoutRestorer';
import { AppState, ProcessingStage, Chunk } from './types';
import { 
    PROMPT_CLEANING, PROMPT_STEP_1, PROMPT_STEP_2, PROMPT_STEP_3, 
    PROMPT_QUALITY_CHECK_CLEAN, PROMPT_QUALITY_CHECK_MACRO, PROMPT_QUALITY_CHECK_MICRO, 
    PROMPT_REPAIR_CLEAN, PROMPT_REPAIR_STRUCTURE 
} from './constants';
import ResultViewer from './components/ResultViewer';
import { StepCard } from './components/StepCard';
import { IconCheck, IconUpload, IconSearch, IconWand, IconArchive, IconTranslate, IconImport, IconWarning } from './components/Icons';
import * as FormatUtils from './services/formatUtils';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    files: [], mode: 'FAST', chunkingMode: 'AUTO', modelType: 'FLASH_2_0', 
    cleaningMode: 'DETERMINISTIC', targetChunkSize: 50000, chunks: [],
    stage: ProcessingStage.IDLE, progress: 0, error: null, totalTime: 0,
    apiCallCount: 0, auditReport: null, showTranslation: false,
    includeAnnexes: true, language: 'EN'
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
  const hasTextFilesOnly = state.files.length > 0 && state.files.every(f => f.type === 'text/plain' || f.type === 'text/html');

  const incrementApiCount = useCallback(() => setState(prev => ({ ...prev, apiCallCount: prev.apiCallCount + 1 })), []);
  const updateChunk = (id: number, fields: Partial<Chunk>) => setState(prev => ({ ...prev, chunks: prev.chunks.map(c => c.id === id ? { ...c, ...fields } : c) }));

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setState(prev => ({ ...prev, files: Array.from(e.target.files!), chunks: [], stage: ProcessingStage.IDLE, error: null, apiCallCount: 0, auditReport: null }));
      setActiveTab('RAW');
    }
  };

  const handleCancel = () => {
    cancelRef.current = true;
    setState(prev => ({ ...prev, stage: ProcessingStage.IDLE }));
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
          const newChunks = text.includes('--- CHUNK') ? parseChunksFromFormattedText(text, file.name) : createChunks(text, state.targetChunkSize, file.name, 0);
          const BACKFILL = '[SKIPPED - DIRECT IMPORT]';
          const finalChunks: Chunk[] = newChunks.map(c => {
              let update: Partial<Chunk> = {};
              if (importTargetStep === 'CLEAN') update = { originalText: c.originalText, cleanedText: '', step1Text: '', step2Text: '', finalText: '' };
              if (importTargetStep === 'MACRO') update = { originalText: BACKFILL, cleanedText: c.originalText, step1Text: '', step2Text: '', finalText: '' };
              if (importTargetStep === 'MICRO') update = { originalText: BACKFILL, cleanedText: BACKFILL, step1Text: c.originalText, step2Text: '', finalText: '' };
              if (importTargetStep === 'PATCH') update = { originalText: BACKFILL, cleanedText: BACKFILL, step1Text: BACKFILL, step2Text: c.originalText, finalText: '' };
              return { ...c, ...update, status: 'PENDING' as const };
          });
          setState(prev => ({ ...prev, chunks: finalChunks, stage: ProcessingStage.IDLE, files: [file] }));
          setActiveTab(importTargetStep === 'CLEAN' ? 'RAW' : importTargetStep === 'MACRO' ? 'CLEAN' : importTargetStep === 'MICRO' ? 'MACRO' : 'MICRO');
          setImportTargetStep(null);
      } catch (err: any) { alert("Error importing: " + err.message); }
  };

  const getModelConfig = () => {
      const map: Record<string, string> = { FLASH_2_0: 'gemini-2.0-flash', FLASH: 'gemini-3-flash-preview', PRO: 'gemini-3-pro-preview', FLASH_THINKING: 'gemini-3-flash-preview' };
      return { 
          label: state.modelType === 'FLASH_THINKING' ? 'gemini-3-flash (Think)' : map[state.modelType] || 'gemini-2.0-flash', 
          modelName: map[state.modelType] || 'gemini-2.0-flash', 
          thinkingBudget: state.modelType === 'FLASH_THINKING' ? 4096 : 0 
      };
  };

  const runExtraction = async () => {
    if (state.files.length === 0) return; cancelRef.current = false;
    setState(prev => ({ ...prev, stage: ProcessingStage.EXTRACTING, progress: 0, error: null, chunks: [] }));
    setActiveTab('RAW');
    const { modelName } = getModelConfig(); let allChunks: Chunk[] = [];
    try {
        for (let i = 0; i < state.files.length; i++) {
            if (cancelRef.current) break;
            const f = state.files[i];
            let txt = f.type === 'application/pdf' && state.mode === 'DEEP_OCR' ? await processBatchImagesOCR(await extractImagesForDeepOCR(f), incrementApiCount, modelName) : await extractTextFast(f);
            allChunks.push(...createChunks(txt, state.targetChunkSize, f.name, allChunks.length));
            setState(prev => ({ ...prev, chunks: [...allChunks], progress: ((i + 1) / state.files.length) * 100 }));
        }
        setState(prev => ({ ...prev, stage: ProcessingStage.IDLE, progress: 100 }));
    } catch (e: any) { setState(prev => ({ ...prev, stage: ProcessingStage.ERROR, error: e.message })); }
  };

  const runStepOnAllChunks = async (step: 'CLEAN' | 'MACRO' | 'MICRO' | 'PATCH') => {
      if (!hasChunks) return; cancelRef.current = false;
      const stageMap = { CLEAN: ProcessingStage.CLEANING, MACRO: ProcessingStage.STRUCTURING_MACRO, MICRO: ProcessingStage.STRUCTURING_MICRO, PATCH: ProcessingStage.PATCHING };
      const fieldMap = { CLEAN: 'cleanedText', MACRO: 'step1Text', MICRO: 'step2Text', PATCH: 'finalText' };
      const inputMap = { CLEAN: 'originalText', MACRO: 'cleanedText', MICRO: 'step1Text', PATCH: 'step2Text' };
      setState(prev => ({ ...prev, stage: stageMap[step], progress: 0 })); setActiveTab(step === 'PATCH' ? 'FINAL' : step as any);
      
      const { modelName, thinkingBudget } = getModelConfig();
      let prevCtx = ""; let curFile = ""; let skipAnnex = false;

      for (let i = 0; i < state.chunks.length; i++) {
          if (cancelRef.current) break;
          const c = state.chunks[i];
          if (c.fileName !== curFile) { prevCtx = ""; curFile = c.fileName; skipAnnex = false; }
          if (skipAnnex) { updateChunk(c.id, { [fieldMap[step]]: '', status: 'SKIPPED' }); continue; }
          updateChunk(c.id, { status: 'PROCESSING' });
          try {
              let input = c[inputMap[step] as keyof Chunk] as string || c.originalText;
              if (!input || input.includes('[SKIPPED')) { updateChunk(c.id, { status: 'SKIPPED' }); continue; }
              let prompt = step === 'CLEAN' ? PROMPT_CLEANING(state.language) : step === 'MACRO' ? PROMPT_STEP_1(prevCtx === "", state.language) : step === 'MICRO' ? PROMPT_STEP_2(prevCtx, state.language) : PROMPT_STEP_3(prevCtx);
              let res = (step === 'CLEAN' && state.cleaningMode === 'DETERMINISTIC') ? restoreLayoutDeterministically(input) : await processTextWithPrompt(input, prompt, incrementApiCount, modelName, thinkingBudget);
              if (step === 'MACRO' && !state.includeAnnexes && res.match(/{{level\d+}}\s*(ANNEX|APPENDIX|SCHEDULE|ATTACHMENT|ANNEXE|APÊNDICE)/i)) skipAnnex = true;
              updateChunk(c.id, { [fieldMap[step]]: res, status: 'COMPLETED' }); prevCtx = res.slice(-1500);
          } catch (e) { updateChunk(c.id, { status: 'FAILED' }); }
          setState(prev => ({ ...prev, progress: ((i + 1) / state.chunks.length) * 100 }));
      }
      setState(prev => ({ ...prev, stage: ProcessingStage.IDLE }));
  };

  const runRepair = async () => {
    if (!hasChunks) return;
    const field = FormatUtils.getFieldForTab(activeTab); if (!field) return alert("Select a processed stage.");
    setState(prev => ({ ...prev, stage: ProcessingStage.REPAIRING, progress: 0, auditReport: null }));
    const { modelName } = getModelConfig();
    for (let i = 0; i < state.chunks.length; i++) {
        if (cancelRef.current) break;
        const chunk = state.chunks[i];
        if (!chunk[field]) { updateChunk(chunk.id, { status: 'SKIPPED' }); continue; }
        updateChunk(chunk.id, { status: 'PROCESSING' });
        try {
            const prompt = activeTab === 'CLEAN' ? PROMPT_REPAIR_CLEAN : PROMPT_REPAIR_STRUCTURE;
            const res = await processTextWithPrompt(chunk[field] as string, prompt, incrementApiCount, modelName);
            updateChunk(chunk.id, { [field]: res, status: 'COMPLETED' });
        } catch (e) { updateChunk(chunk.id, { status: 'FAILED' }); }
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

  const handleDownload = async () => {
      const field = FormatUtils.getFieldForTab(activeTab); if (!field) return;
      const zip = new JSZip(); const map = new Map<string, string>();
      state.chunks.forEach(c => map.set(c.fileName, (map.get(c.fileName) || '') + (c[field] || '') + '\n\n'));
      map.forEach((t, n) => zip.file(`${n}-${activeTab}.txt`, t));
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `OCR-${activeTab}.zip`; a.click();
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-6 bg-slate-100 font-sans text-slate-800">
      <input type="file" ref={importInputRef} accept=".txt" className="hidden" onChange={handleImportFileChange} />
      <header className="w-full max-w-7xl mb-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
        <div><h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-600">Structural OCR v3.3 (FTA)</h1></div>
        <div className="flex gap-6 text-xs font-semibold text-slate-500 items-center">
             <div>FILES: <span className="text-indigo-600">{state.files.length}</span></div>
             <div>CHUNKS: <span className="text-indigo-600">{state.chunks.length}</span></div>
             <div>API: <span className="text-indigo-600">{state.apiCallCount}</span></div>
             <div className="flex items-center gap-1">MODEL: <span className="text-purple-700 font-mono bg-purple-50 px-2 py-0.5 rounded border border-purple-200">{getModelConfig().label}</span></div>
             <div className="flex items-center gap-2">
                 {state.error ? (<div className="text-red-600 font-bold bg-red-50 px-2 py-1 rounded border border-red-200">ERROR: {state.error.substring(0, 30)}...</div>) : (<>STATUS: <span className={`${state.stage === ProcessingStage.IDLE ? 'text-green-600' : 'text-amber-500 animate-pulse'}`}>{state.stage}</span></>)}
                 {state.stage !== ProcessingStage.IDLE && (<button onClick={handleCancel} className="bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded text-[10px] font-bold hover:bg-red-100">CANCEL</button>)}
             </div>
        </div>
      </header>
      <div className="w-full max-w-7xl bg-white rounded-xl shadow-lg border border-slate-200 p-6 mb-6">
        <div className="flex flex-wrap gap-4 mb-8 border-b border-slate-100 pb-6 items-center justify-between">
             <div className="relative">
                <input type="file" ref={fileInputRef} accept=".pdf, .txt, .html" multiple onChange={handleFileUpload} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg font-bold text-sm transition-colors border border-indigo-200 flex items-center gap-2"><IconUpload />{state.files.length === 0 ? "Select Documents" : `${state.files.length} Docs Selected`}</button>
             </div>
             <div className="flex gap-4 items-center">
                 <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                     <span className="text-[10px] font-bold text-slate-500 pl-2">Lang:</span>
                     {['EN', 'FR', 'PT'].map(l => <button key={l} onClick={() => setState(s => ({...s, language: l as any}))} className={`px-3 py-1 rounded text-[10px] font-bold ${state.language === l ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-400'}`}>{l}</button>)}
                 </div>
                 <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200 flex gap-1"><button onClick={() => setState(s => ({...s, includeAnnexes: !s.includeAnnexes}))} className={`px-3 py-1 rounded text-[10px] font-bold ${state.includeAnnexes ? 'bg-white text-green-600 shadow-sm' : 'text-red-500'}`}>{state.includeAnnexes ? 'INC ANNEX' : 'SKIP ANNEX'}</button></div>
                 <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200 flex gap-1">
                     {['FLASH_2_0', 'FLASH', 'FLASH_THINKING', 'PRO'].map(m => <button key={m} onClick={() => setState(s => ({...s, modelType: m as any}))} className={`px-3 py-1 rounded text-[10px] font-bold ${state.modelType === m ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-400'}`}>{m.replace('FLASH_THINKING', 'THINK').replace('FLASH_2_0', '2.0').replace('FLASH', '3.0')}</button>)}
                 </div>
             </div>
        </div>
        <div className="grid grid-cols-5 gap-4">
            <StepCard step="1" title="Extract & Chunk" stage={state.stage} targetStage={ProcessingStage.EXTRACTING} hasData={hasChunks} onRun={runExtraction} runLabel={hasChunks ? 'Re-Run' : 'Start'} isRunDisabled={state.files.length === 0} />
            <StepCard step="2" title={state.cleaningMode === 'DETERMINISTIC' ? 'Safe Clean' : 'AI Clean'} stage={state.stage} targetStage={ProcessingStage.CLEANING} hasData={hasCleaned} hasPrerequisite={hasChunks} dataLabel={!hasChunks ? <span className="text-xs text-slate-300">No Data</span> : <span className="text-xs text-slate-500">Ready</span>} onRun={() => runStepOnAllChunks('CLEAN')} onImport={() => triggerImport('CLEAN')} runLabel={`Run ${state.cleaningMode === 'DETERMINISTIC' ? 'Safe' : 'AI'}`} isRunDisabled={!hasChunks}>
                <div className="flex bg-slate-100 rounded p-0.5 mb-2 w-full"><button onClick={() => setState(s => ({...s, cleaningMode: 'DETERMINISTIC'}))} className={`flex-1 text-[9px] font-bold py-1 rounded ${state.cleaningMode === 'DETERMINISTIC' ? 'bg-white shadow text-teal-700' : 'text-slate-400'}`}>SAFE</button><button onClick={() => setState(s => ({...s, cleaningMode: 'AI'}))} className={`flex-1 text-[9px] font-bold py-1 rounded ${state.cleaningMode === 'AI' ? 'bg-white shadow text-indigo-700' : 'text-slate-400'}`}>AI</button></div>
            </StepCard>
            <StepCard step="3" title="Macro Struct" stage={state.stage} targetStage={ProcessingStage.STRUCTURING_MACRO} hasData={hasStep1} hasPrerequisite={hasCleaned} dataLabel={!hasCleaned ? <IconWarning /> : <span className="text-xs text-slate-500">Ready</span>} onRun={() => runStepOnAllChunks('MACRO')} onImport={() => triggerImport('MACRO')} runLabel="Run Macro" isRunDisabled={!hasChunks} />
            <StepCard step="4" title="Micro Struct" stage={state.stage} targetStage={ProcessingStage.STRUCTURING_MICRO} hasData={hasStep2} hasPrerequisite={hasStep1} dataLabel={!hasStep1 ? <IconWarning /> : <span className="text-xs text-slate-500">Ready</span>} onRun={() => runStepOnAllChunks('MICRO')} onImport={() => triggerImport('MICRO')} runLabel="Run Micro" isRunDisabled={!hasChunks} />
            <StepCard step="5" title="Final Patch" stage={state.stage} targetStage={ProcessingStage.PATCHING} hasData={hasFinal} hasPrerequisite={hasStep2} dataLabel={!hasStep2 ? <IconWarning /> : <span className="text-xs text-slate-500">Ready</span>} onRun={() => runStepOnAllChunks('PATCH')} onImport={() => triggerImport('PATCH')} runLabel="Run Patch" isRunDisabled={!hasChunks} />
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
                          <button onClick={handleDownload} className="bg-slate-800 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-slate-900 flex items-center gap-1"><IconArchive /> {state.files.length > 1 ? 'Download ZIP' : `Download ${activeTab}`}</button>
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
