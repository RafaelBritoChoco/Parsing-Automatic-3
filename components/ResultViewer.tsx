
import React, { useState, useEffect } from 'react';

interface ResultViewerProps {
  text: string;
  translatedText?: string;
  isEditing: boolean;
  onTextChange: (newText: string) => void;
}

const ResultViewer: React.FC<ResultViewerProps> = ({ text, translatedText, isEditing, onTextChange }) => {
  const [localText, setLocalText] = useState(text);

  // Sync local text only when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setLocalText(text);
    }
  }, [isEditing]);

  // Handle local change and bubble up
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setLocalText(newVal);
    onTextChange(newVal);
  };

  if (!text && !isEditing) return <div className="text-gray-400 italic p-4">Waiting for results...</div>;

  // Render Editor Mode
  if (isEditing) {
    return (
      <div className="w-full">
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-xs text-yellow-800 font-bold flex justify-between items-center">
             <span>EDIT MODE ACTIVE</span>
             <span className="font-normal opacity-75">Changes saved automatically to current step</span>
        </div>
        <textarea
          className="w-full h-[650px] p-6 font-mono text-sm bg-white border border-slate-300 rounded-b-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed resize-none"
          value={localText}
          onChange={handleChange}
          spellCheck={false}
        />
      </div>
    );
  }

  // --- VIEWER LOGIC ---

  // Helper para identificar o estilo baseado no nível
  const getStyleForLevel = (level: number) => {
    switch (level) {
      case 0: return 'bg-black text-white font-bold border-b border-white';
      case 1: return 'bg-red-500 text-white font-bold';
      case 2: return 'bg-orange-400 text-black font-semibold';
      case 3: return 'bg-cyan-200 text-black';
      case 4: return 'bg-green-200 text-black';
      case 5: return 'bg-pink-300 text-black';
      case 6: return 'bg-purple-300 text-black';
      default: return 'bg-gray-200 text-black';
    }
  };

  // Helper to render inline content with highlights
  const renderContent = (content: string) => {
      const parts = content.split(/({{footnotenumber\s*\d+}}.*?{{-footnotenumber\s*\d+}})/g);
      return parts.map((part, i) => {
        if (part.match(/^{{footnotenumber\s*\d+}}/)) {
           return (
             <span key={i} className="inline-block bg-purple-100 text-purple-700 px-1 rounded mx-0.5 text-[10px] font-bold border border-purple-200 align-middle">
                {part}
             </span>
           );
        }
        return part;
      });
  };

  const renderLines = (contentString: string) => {
      const lines = contentString.split('\n');
      let activeLevel: number | null = null;

      return lines.map((line, idx) => {
        const trimmed = line.trim();
        
        // --- NEW: FILE SEPARATOR RENDERER ---
        if (trimmed.startsWith('<<<< FILE_START:')) {
            const fileNameMatch = line.match(/FILE_START: (.*?) >>>>/);
            const fileName = fileNameMatch ? fileNameMatch[1] : 'Unknown File';
            // Reset active level when file changes to avoid bleeding styles
            activeLevel = null;
            return (
                <div key={idx} className="mt-8 mb-4 pt-4 border-t-4 border-indigo-100 first:mt-0 first:pt-0 first:border-0">
                    <div className="bg-indigo-600 text-white px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide inline-flex items-center shadow-sm">
                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        FILE: {fileName}
                    </div>
                </div>
            );
        }

        if (!trimmed) return <div key={idx} className="h-4"></div>;

        if (trimmed.includes('{{text_level}}') || trimmed.includes('{{-text_level}}')) {
             if (trimmed === '{{text_level}}' || trimmed === '{{-text_level}}') {
                 return (
                     <div key={idx} className="w-fit bg-yellow-200 text-yellow-800 font-bold px-2 py-0.5 border-l-4 border-yellow-500 my-1">
                         {trimmed}
                     </div>
                 );
             }
        }

        const completeLevelMatch = line.match(/{{level\s*(\d+)}}(.*?){{-level\s*\1}}/);
        if (completeLevelMatch) {
            const level = parseInt(completeLevelMatch[1]);
            const content = completeLevelMatch[2];
            const styleClass = getStyleForLevel(level);
            return (
                <div key={idx} className="my-1 group">
                    <span className={`inline-block px-1 py-0.5 mr-1 text-xs select-none opacity-70 ${level > 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                        {`{{level${level}}`}
                    </span>
                    <span className={`${styleClass} px-2 py-0.5 rounded-sm inline-block w-full md:w-auto`}>
                        {renderContent(content)}
                    </span>
                    <span className={`inline-block px-1 py-0.5 ml-1 text-xs select-none opacity-70 ${level > 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                        {`{{-level${level}}`}
                    </span>
                </div>
            )
        }

        const startLevelMatch = line.match(/{{level\s*(\d+)}}(.*)/);
        if (startLevelMatch) {
             const level = parseInt(startLevelMatch[1]);
             activeLevel = level;
             const content = startLevelMatch[2];
             const styleClass = getStyleForLevel(level);
             return (
                <div key={idx} className="my-1">
                    <span className={`inline-block px-1 py-0.5 mr-1 text-xs select-none opacity-70 ${level > 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                        {`{{level${level}}`}
                    </span>
                    <span className={`${styleClass} px-2 py-0.5 rounded-sm`}>
                        {renderContent(content)}
                    </span>
                </div>
             );
        }

        const endLevelMatch = line.match(/(.*?){{-level\s*(\d+)}}/);
        if (endLevelMatch && activeLevel !== null) {
            const content = endLevelMatch[1];
            const level = parseInt(endLevelMatch[2]);
            const styleClass = getStyleForLevel(activeLevel);
            activeLevel = null;
            return (
                <div key={idx} className="my-1">
                    <span className={`${styleClass} px-2 py-0.5 rounded-sm`}>
                        {renderContent(content)}
                    </span>
                    <span className={`inline-block px-1 py-0.5 ml-1 text-xs select-none opacity-70 ${level > 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                        {`{{-level${level}}`}
                    </span>
                </div>
            );
        }

        if (activeLevel !== null) {
            const styleClass = getStyleForLevel(activeLevel);
            return (
                <div key={idx} className="my-1">
                    <span className={`${styleClass} px-2 py-0.5 rounded-sm`}>
                        {renderContent(line)}
                    </span>
                </div>
            );
        }

        if (line.match(/{{footnote\s*\d+/)) {
             return (
                 <div key={idx} className="mt-2">
                     <span className="inline-block text-xs bg-purple-50 text-purple-700 border border-purple-200 p-2 rounded">
                         {renderContent(line)}
                     </span>
                 </div>
             )
        }
        
        return (
            <div key={idx} className="bg-yellow-50 px-2 py-0.5 border-l-2 border-yellow-200 my-0.5 text-slate-700 break-words">
                {renderContent(line)}
            </div>
        );
      });
  };

  // --- SPLIT VIEW RENDER ---
  if (translatedText) {
      return (
          <div className="flex flex-row h-[700px] border border-slate-300 rounded-lg overflow-hidden bg-white">
              {/* LEFT: ORIGINAL */}
              <div className="flex-1 border-r border-slate-200 flex flex-col min-w-0">
                  <div className="bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 border-b border-slate-200 uppercase">Original</div>
                  <div className="flex-1 overflow-auto p-4 font-mono text-sm leading-relaxed">
                      {renderLines(text)}
                  </div>
              </div>
              
              {/* RIGHT: TRANSLATION */}
              <div className="flex-1 flex flex-col min-w-0 bg-blue-50/30">
                  <div className="bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-600 border-b border-indigo-100 uppercase">English Verification</div>
                  <div className="flex-1 overflow-auto p-4 font-mono text-sm leading-relaxed">
                      {renderLines(translatedText)}
                  </div>
              </div>
          </div>
      );
  }

  // --- SINGLE VIEW RENDER ---
  return (
    <div className="font-mono text-sm bg-white p-6 rounded-lg overflow-auto max-h-[700px] border border-slate-300 shadow-inner leading-relaxed">
      {renderLines(text)}
    </div>
  );
};

export default ResultViewer;
