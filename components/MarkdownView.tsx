
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
        // Text processing
        // Handle Headers (#), Bold (**), Bullet points (-)
        return part.split('\n').map((line, lineIdx) => {
            if (!line.trim()) return <div key={`${index}-${lineIdx}`} className="h-2" />; // Spacer
            
            if (line.startsWith('# ')) return <h1 key={`${index}-${lineIdx}`} className="text-2xl font-bold text-white mt-6 mb-3 border-b border-slate-700 pb-2">{line.substring(2)}</h1>;
            if (line.startsWith('## ')) return <h2 key={`${index}-${lineIdx}`} className="text-xl font-bold text-indigo-200 mt-5 mb-2">{line.substring(3)}</h2>;
            if (line.startsWith('### ')) return <h3 key={`${index}-${lineIdx}`} className="text-lg font-bold text-slate-200 mt-4 mb-2">{line.substring(4)}</h3>;
            
            if (line.trim().startsWith('- ')) {
                const content = line.trim().substring(2);
                const parts = content.split(/(\*\*.*?\*\*)/g);
                return (
                    <li key={`${index}-${lineIdx}`} className="ml-4 list-disc text-slate-300 my-1 pl-1 marker:text-indigo-500">
                        {parts.map((p, i) => p.startsWith('**') ? <strong key={i} className="text-white font-semibold">{p.slice(2, -2)}</strong> : p)}
                    </li>
                );
            }

            // Standard Paragraph with bold support
            const parts = line.split(/(\*\*.*?\*\*)/g);
            return (
                <p key={`${index}-${lineIdx}`} className="mb-2 text-slate-300 leading-relaxed text-sm">
                    {parts.map((p, i) => p.startsWith('**') ? <strong key={i} className="text-white font-semibold">{p.slice(2, -2)}</strong> : p)}
                </p>
            );
        });
      }
    });
  };

  return <div className="markdown-view">{renderContent(content)}</div>;
};
