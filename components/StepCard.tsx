
import React from 'react';
import { IconCheck, IconSpinner, IconWarning, IconImport } from './Icons';

interface StepCardProps {
  step: string;
  title: string | React.ReactNode;
  isActive: boolean;
  isCompleted: boolean;
  isReady: boolean;
  dataLabel?: React.ReactNode;
  onRun: () => void;
  onImport?: () => void;
  runLabel: string;
  disabled: boolean;
  buttonClass?: string;
  children?: React.ReactNode;
}

export const StepCard: React.FC<StepCardProps> = ({
  step, title, isActive, isCompleted, isReady, dataLabel, onRun, onImport, runLabel, disabled, buttonClass, children
}) => {
  // Base container class matching original
  const containerClass = `relative p-4 rounded-lg border-2 flex flex-col items-center justify-between min-h-[140px] transition-all ${
    isActive 
      ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' 
      : isCompleted 
        ? 'border-green-400 bg-green-50' 
        : 'border-slate-200 bg-white'
  }`;

  // Button logic to match original conditional styling
  let btnClass = "w-full mt-2 py-1.5 rounded text-xs font-bold flex items-center justify-center ";
  if (disabled) {
    btnClass += 'bg-slate-100 text-slate-400 cursor-not-allowed'; // Step 1 disabled style
    if (step !== "1") btnClass = btnClass.replace('bg-slate-100', 'bg-slate-200'); // Other steps used slate-200 in original
  } else if (isActive) {
    btnClass += 'bg-indigo-100 text-indigo-700';
  } else if (buttonClass) {
    btnClass += buttonClass;
  } else {
    // Default for Step 2-5 when ready
    btnClass += 'bg-white border border-slate-300 text-slate-700 hover:border-indigo-500 hover:text-indigo-600';
  }

  return (
    <div className={containerClass}>
      <div className={onImport ? "flex w-full justify-between mb-2" : "text-xs font-bold text-slate-400 mb-2"}>
        {onImport ? (
          <>
            <div className="text-xs font-bold text-slate-400">STEP {step}</div>
            {!isActive && (
              <button onClick={() => onImport()} className="bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 px-1.5 py-0.5 rounded text-[10px] flex items-center">
                <IconImport /> Load Data
              </button>
            )}
          </>
        ) : (
          `STEP ${step}`
        )}
      </div>

      {children}

      <div className="font-bold text-sm text-center mb-2">{title}</div>

      <div className="flex-1 flex items-center justify-center">
        {isActive ? <IconSpinner /> : isCompleted ? <IconCheck /> : dataLabel ? dataLabel : (!isReady ? <IconWarning /> : <span className="text-xs text-slate-500">Ready</span>)}
      </div>

      <button onClick={onRun} disabled={disabled} className={btnClass}>
        {isActive ? 'Running...' : runLabel}
      </button>
    </div>
  );
};
