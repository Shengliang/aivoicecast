import React, { useState, useEffect, useRef } from 'react';
import { Copy, Check, Image as ImageIcon, Loader2, Code as CodeIcon, ExternalLink, Sigma, AlertCircle } from 'lucide-react';
import { encodePlantUML } from '../utils/plantuml';

interface MarkdownViewProps {
  content: string;
}

const LatexRenderer: React.FC<{ tex: string, displayMode?: boolean }> = ({ tex, displayMode = true }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const checkLibrary = () => {
            if ((window as any).katex) {
                if (isMounted) setIsReady(true);
            } else {
                setTimeout(checkLibrary, 50);
            }
        };
        checkLibrary();
        return () => { isMounted = false; };
    }, []);

    useEffect(() => {
        if (!isReady || !containerRef.current) return;
        try {
            containerRef.current.innerHTML = '';
            (window as any).katex.render(tex, containerRef.current, {
                throwOnError: true,
                displayMode: displayMode,
                trust: true,
                strict: false
            });
            setError(null);
        } catch (err: any) {
            setError(err.message || "LaTeX Error");
            if (containerRef.current) {
                containerRef.current.textContent = displayMode ? `$$\n${tex}\n$$` : `$${tex}$`;
            }
        }
    }, [tex, displayMode, isReady]);

    if (displayMode) {
        return (
            <div className="my-6 p-6 bg-slate-900/50 rounded-xl border border-slate-800 flex flex-col justify-center items-center overflow-x-auto shadow-inner relative group min-h-[80px]">
                {error && <div className="absolute top-2 right-2 text-red-500 opacity-50 group-hover:opacity-100" title={error}><AlertCircle size={14} /></div>}
                <div ref={containerRef} className="text-indigo-100 text-lg selection:bg-indigo-500/30 font-serif" />
            </div>
        );
    }

    return (
        <span className="inline-flex items-center group relative whitespace-nowrap px-1 font-serif italic text-indigo-300">
            <span ref={containerRef} />
            {error && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                    <div className="bg-red-900 text-red-100 text-[10px] p-2 rounded shadow-xl border border-red-700">{error}</div>
                </div>
            )}
        </span>
    );
};

const PlantUMLRenderer: React.FC<{ code: string }> = ({ code }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [showCode, setShowCode] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        encodePlantUML(code).then(encoded => {
            if (isMounted) {
                setUrl(`https://www.plantuml.com/plantuml/svg/${encoded}`);
                setLoading(false);
            }
        }).catch(() => { if (isMounted) setLoading(false); });
        return () => { isMounted = false; };
    }, [code]);

    return (
        <div className="my-6 border border-slate-700 rounded-xl overflow-hidden bg-slate-900 shadow-lg group">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-800/80 border-b border-slate-700">
                <div className="flex items-center gap-2"><ImageIcon size={14} className="text-pink-400" /><span className="text-xs font-bold text-slate-300 uppercase">Diagram</span></div>
                <div className="flex items-center gap-3">
                    <button onClick={() => setShowCode(!showCode)} className="text-[10px] font-bold text-slate-400 hover:text-white flex items-center gap-1">{showCode ? <ImageIcon size={12}/> : <CodeIcon size={12}/>}{showCode ? 'View Diagram' : 'View Source'}</button>
                    <button onClick={() => { if(url) { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } }} className="text-[10px] font-bold text-slate-400 hover:text-indigo-400 flex items-center gap-1">{copied ? <Check size={12} className="text-emerald-400"/> : <ExternalLink size={12}/>}{copied ? 'Copied' : 'SVG Link'}</button>
                </div>
            </div>
            <div className="p-6 bg-white/5 flex justify-center min-h-[100px] relative">
                {loading && <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-sm z-10"><Loader2 size={24} className="animate-spin text-indigo-400" /></div>}
                {showCode ? <pre className="w-full p-4 bg-slate-950 text-indigo-200 text-xs font-mono overflow-x-auto whitespace-pre">{code}</pre> : url && <img src={url} alt="PlantUML" className="max-w-full h-auto py-4 invert brightness-110 contrast-125 transition-transform duration-500 hover:scale-[1.01]" />}
            </div>
        </div>
    );
};

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const formatInline = (text: string): React.ReactNode[] => {
    if (!text) return [];
    // Enhanced split to handle bold (**), code (`), and math ($)
    const parts = text.split(/(\*\*.*?\*\*|`.*?`|\$[^\$]+?\$)/g);
    return parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} className="text-white font-semibold">{formatInline(p.slice(2, -2))}</strong>;
        if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="bg-slate-800 text-indigo-300 px-1 rounded font-mono text-[0.9em]">{p.slice(1, -1)}</code>;
        if (p.startsWith('$') && p.endsWith('$')) {
            const math = p.slice(1, -1).trim();
            return math ? <LatexRenderer key={i} tex={math} displayMode={false} /> : p;
        }
        return p;
    });
  };

  const renderContent = (text: string) => {
    if (!text) return null;
    
    // Normalize content
    const normalized = text.replace(/\r\n/g, '\n').trim();
    
    // Split by blocks: Code blocks (```), Math blocks ($$), and Text segments
    const blocks = normalized.split(/(```[\s\S]*?```|\$\$[\s\S]*?\$\$)/g);
    
    return blocks.map((block, bIdx) => {
      if (!block) return null;

      if (block.startsWith('```')) {
        const rawContent = block.replace(/^```\w*\n?/, '').replace(/```$/, '');
        const langMatch = block.match(/^```(\w+)/);
        const language = langMatch ? langMatch[1].toLowerCase() : 'code';
        
        if (language === 'plantuml' || language === 'puml') return <PlantUMLRenderer key={bIdx} code={rawContent} />;

        return (
          <div key={bIdx} className="my-5 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 shadow-lg">
             <div className="flex items-center justify-between px-4 py-2 bg-slate-800/80 border-b border-slate-700">
               <span className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest">{language}</span>
               <button onClick={() => { navigator.clipboard.writeText(rawContent); setCopiedIndex(bIdx); setTimeout(() => setCopiedIndex(null), 2000); }} className="flex items-center space-x-1 text-[10px] font-bold text-slate-500 hover:text-indigo-400 transition-colors uppercase">
                 {copiedIndex === bIdx ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                 <span>{copiedIndex === bIdx ? 'Copied' : 'Copy'}</span>
               </button>
             </div>
             <pre className="p-5 text-sm font-mono text-indigo-100 overflow-x-auto whitespace-pre leading-relaxed">{rawContent}</pre>
          </div>
        );
      } else if (block.startsWith('$$')) {
          const tex = block.slice(2, -2).trim();
          return tex ? <LatexRenderer key={bIdx} tex={tex} displayMode={true} /> : null;
      } else {
        // Text segment: Process line by line for lists, headers, tables
        const lines = block.split('\n');
        const rendered: React.ReactNode[] = [];
        let tableBuffer: string[] = [];

        const flushTable = () => {
            if (tableBuffer.length < 2) {
                tableBuffer.forEach((l, i) => rendered.push(<p key={`p-err-${bIdx}-${i}`} className="mb-4 text-slate-300 leading-relaxed">{formatInline(l)}</p>));
            } else {
                const headers = tableBuffer[0].split('|').filter(c => c.trim() !== '').map(c => c.trim());
                const rows = tableBuffer.slice(2).map(r => r.split('|').filter(c => c.trim() !== '').map(c => c.trim()));
                rendered.push(
                    <div key={`table-${bIdx}`} className="overflow-x-auto my-8 border border-slate-700 rounded-xl shadow-xl">
                        <table className="min-w-full text-sm text-left">
                            <thead className="bg-slate-800 text-xs uppercase font-bold text-slate-200">
                                <tr>{headers.map((h, i) => <th key={i} className="px-6 py-4 border-b border-slate-700">{formatInline(h)}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700 bg-slate-900/50">
                                {rows.map((row, rI) => (
                                    <tr key={rI} className="hover:bg-slate-800/30 transition-colors">
                                        {row.map((cell, cI) => <td key={cI} className="px-6 py-4 text-slate-300 leading-relaxed">{formatInline(cell)}</td>)}
                                        {Array.from({ length: Math.max(0, headers.length - row.length) }).map((_, i) => <td key={`e-${i}`} className="px-6 py-4"></td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            }
            tableBuffer = [];
        };

        lines.forEach((line, lIdx) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('|')) {
                tableBuffer.push(trimmed);
            } else {
                if (tableBuffer.length > 0) flushTable();
                if (!trimmed) {
                    if (lIdx > 0 && lines[lIdx-1].trim()) rendered.push(<div key={`sp-${lIdx}`} className="h-4" />);
                    return;
                }
                
                if (line.startsWith('# ')) rendered.push(<h1 key={lIdx} className="text-3xl font-bold text-white mt-10 mb-6 border-b border-slate-700 pb-3">{formatInline(line.substring(2))}</h1>);
                else if (line.startsWith('## ')) rendered.push(<h2 key={lIdx} className="text-2xl font-bold text-indigo-200 mt-8 mb-4">{formatInline(line.substring(3))}</h2>);
                else if (line.startsWith('### ')) rendered.push(<h3 key={lIdx} className="text-xl font-bold text-slate-200 mt-6 mb-3">{formatInline(line.substring(4))}</h3>);
                else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                    rendered.push(<li key={lIdx} className="ml-6 list-disc text-slate-300 my-2 pl-2 marker:text-indigo-500 leading-relaxed">{formatInline(trimmed.substring(2))}</li>);
                } else if (/^\d+\. /.test(trimmed)) {
                    const match = trimmed.match(/^\d+\. /);
                    rendered.push(<li key={lIdx} className="ml-6 list-decimal text-slate-300 my-2 pl-2 marker:text-indigo-500 marker:font-bold leading-relaxed">{formatInline(trimmed.substring(match![0].length))}</li>);
                } else {
                    rendered.push(<p key={lIdx} className="mb-4 text-slate-300 leading-relaxed last:mb-0">{formatInline(line)}</p>);
                }
            }
        });
        if (tableBuffer.length > 0) flushTable();
        return <div key={bIdx} className="markdown-text-block">{rendered}</div>;
      }
    });
  };

  return <div className="markdown-view prose prose-invert max-w-none">{renderContent(content)}</div>;
};
