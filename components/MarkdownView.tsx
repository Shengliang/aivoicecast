
import React from 'react';
import { Copy, Check } from 'lucide-react';

interface MarkdownViewProps {
  content: string;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content }) => {
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Helper to parse bold text (**text**)
  const formatInline = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((p, i) => 
        p.startsWith('**') 
        ? <strong key={i} className="text-white font-semibold">{p.slice(2, -2)}</strong> 
        : p
    );
  };

  const renderContent = (text: string) => {
    // Split by code blocks first
    const parts = text.split(/(```[\s\S]*?```)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('```')) {
        // Code Block
        const content = part.replace(/^```\w*\n?/, '').replace(/```$/, '');
        const langMatch = part.match(/^```(\w+)/);
        const language = langMatch ? langMatch[1] : 'Code';
        
        return (
          <div key={index} className="my-4 rounded-lg overflow-hidden border border-slate-700 bg-slate-950 shadow-sm">
             <div className="flex items-center justify-between px-4 py-2 bg-slate-800/80 border-b border-slate-700">
               <span className="text-xs font-mono text-slate-400 lowercase">{language}</span>
               <button 
                 onClick={() => handleCopy(content, index)} 
                 className="flex items-center space-x-1 text-xs text-slate-500 hover:text-indigo-400 transition-colors"
               >
                 {copiedIndex === index ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                 <span>{copiedIndex === index ? 'Copied' : 'Copy'}</span>
               </button>
             </div>
             <pre className="p-4 text-sm font-mono text-indigo-100 overflow-x-auto whitespace-pre-wrap">{content}</pre>
          </div>
        );
      } else {
        const lines = part.split('\n');
        const renderedElements: React.ReactNode[] = [];
        let tableBuffer: string[] = [];

        const processTableBuffer = () => {
            if (tableBuffer.length < 2) {
                // Not enough lines for a table, dump as text
                tableBuffer.forEach((line, i) => {
                    renderedElements.push(<p key={`tbl-fail-${index}-${renderedElements.length}-${i}`} className="mb-2 text-slate-300">{formatInline(line)}</p>);
                });
            } else {
                // Render Table
                // Row 0 is headers
                // Row 1 is separator |---|---| (ignore)
                // Row 2+ are body
                const headers = tableBuffer[0].split('|').filter(c => c.trim() !== '').map(c => c.trim());
                const bodyRows = tableBuffer.slice(2).map(row => row.split('|').filter(c => c.trim() !== '').map(c => c.trim()));
                
                renderedElements.push(
                    <div key={`tbl-${index}-${renderedElements.length}`} className="overflow-x-auto my-6 border border-slate-700 rounded-lg shadow-sm">
                        <table className="min-w-full text-sm text-left text-slate-300">
                            <thead className="bg-slate-800 text-xs uppercase font-bold text-slate-200">
                                <tr>
                                    {headers.map((h, i) => <th key={i} className="px-6 py-3 border-b border-slate-700 whitespace-nowrap">{formatInline(h)}</th>)}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700 bg-slate-900">
                                {bodyRows.map((row, rI) => (
                                    <tr key={rI} className="hover:bg-slate-800/50 transition-colors">
                                        {row.map((cell, cI) => (
                                            <td key={cI} className="px-6 py-4 align-top leading-relaxed">{formatInline(cell)}</td>
                                        ))}
                                        {/* Handle row with fewer cells than headers */}
                                        {Array.from({ length: Math.max(0, headers.length - row.length) }).map((_, i) => <td key={`empty-${i}`} className="px-6 py-4"></td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            }
            tableBuffer = [];
        };

        lines.forEach((line, lineIdx) => {
            const trimmed = line.trim();
            
            // Check for Table Row (lines starting with |)
            if (trimmed.startsWith('|')) {
                tableBuffer.push(trimmed);
            } else {
                // Flush Table if exists
                if (tableBuffer.length > 0) processTableBuffer();

                if (!trimmed) {
                    renderedElements.push(<div key={`${index}-${lineIdx}`} className="h-2" />); // Spacer
                    return;
                }

                if (line.startsWith('# ')) {
                    renderedElements.push(<h1 key={`${index}-${lineIdx}`} className="text-2xl font-bold text-white mt-6 mb-3 border-b border-slate-700 pb-2">{formatInline(line.substring(2))}</h1>);
                } else if (line.startsWith('## ')) {
                    renderedElements.push(<h2 key={`${index}-${lineIdx}`} className="text-xl font-bold text-indigo-200 mt-5 mb-2">{formatInline(line.substring(3))}</h2>);
                } else if (line.startsWith('### ')) {
                    renderedElements.push(<h3 key={`${index}-${lineIdx}`} className="text-lg font-bold text-slate-200 mt-4 mb-2">{formatInline(line.substring(4))}</h3>);
                } else if (trimmed.startsWith('- ')) {
                    const content = trimmed.substring(2);
                    renderedElements.push(
                        <li key={`${index}-${lineIdx}`} className="ml-4 list-disc text-slate-300 my-1 pl-1 marker:text-indigo-500">
                            {formatInline(content)}
                        </li>
                    );
                } else {
                    renderedElements.push(
                        <p key={`${index}-${lineIdx}`} className="mb-2 text-slate-300 leading-relaxed text-sm">
                            {formatInline(line)}
                        </p>
                    );
                }
            }
        });
        
        // Flush remaining table buffer at end of block
        if (tableBuffer.length > 0) processTableBuffer();

        return <React.Fragment key={index}>{renderedElements}</React.Fragment>;
      }
    });
  };

  return <div className="markdown-view">{renderContent(content)}</div>;
};
