
import React from 'react';
import { ProcessingStage } from '../types';
import { IconCheck, IconSpinner, IconWarning, IconImport } from './Icons';

interface StepCardProps {
  step: string;
  title: string;
  stage: ProcessingStage; // The active stage of the app
  targetStage: ProcessingStage; // The stage this card represents
  hasData: boolean; // Is done/ready
  hasPrerequisite?: boolean; // For warning icon (optional, default true)
  dataLabel?: React.ReactNode; // Optional custom label for data status
  onRun: () => void;
  onImport?: () => void;
  runLabel?: string;
  isRunDisabled?: boolean;
  children?: React.ReactNode;
}

export const StepCard: React.FC<StepCardProps> = ({ 
  step, title, stage, targetStage, hasData, hasPrerequisite = true, 
  dataLabel, onRun, onImport, runLabel, isRunDisabled, children 
}) => {
  const isActive = stage === targetStage;
  const isIdle = stage === ProcessingStage.IDLE;
  
  // Exact class logic from original App.tsx
  const borderClass = isActive 
    ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' 
    : hasData 
      ? 'border-green-400 bg-green-50' 
      : 'border-slate-200 bg-white';

  const btnClass = isRunDisabled 
    ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
    : isActive 
      ? 'bg-indigo-100 text-indigo-700' 
      : hasData 
         // Logic for "Re-Run" usually or "Start" if step 1
         ? 'bg-white border border-slate-300 text-slate-700 hover:border-indigo-500 hover:text-indigo-600'
         // Default primary if Step 1 and not done
         : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md'; 

  // Override for Step 1 specific primary style if provided manually or detected
  const finalBtnClass = (step === "1" && !isActive && !isRunDisabled) 
      ? (hasData ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md') 
      : btnClass;

  return (
    <div className={`relative p-4 rounded-lg border-2 flex flex-col items-center justify-between min-h-[140px] transition-all ${borderClass}`}>
      <div className={onImport ? "flex w-full justify-between mb-2" : "text-xs font-bold text-slate-400 mb-2"}>
        <div className="text-xs font-bold text-slate-400">{onImport ? `STEP ${step}` : `STEP ${step}`}</div>
        {onImport && isIdle && (
          <button onClick={(e) => { e.stopPropagation(); onImport(); }} className="bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 px-1.5 py-0.5 rounded text-[10px] flex items-center">
            <IconImport /> Load Data
          </button>
        )}
      </div>
      
      {children}
      
      <div className="font-bold text-sm text-center mb-2">{title}</div>
      
      <div className="flex-1 flex items-center justify-center">
        {isActive ? <IconSpinner /> : hasData ? <IconCheck /> : !hasPrerequisite ? <IconWarning /> : dataLabel || <div className="text-slate-300">---</div>}
      </div>
      
      <button 
        onClick={onRun} 
        disabled={isRunDisabled} 
        className={`w-full mt-2 py-1.5 rounded text-xs font-bold flex items-center justify-center ${step === "1" ? finalBtnClass : btnClass}`}
      >
        {isActive ? 'Running...' : runLabel || (hasData ? `Run ${title}` : `Run ${title}`)}
      </button>
    </div>
  );
};
