import React, { useState, useEffect, useRef } from 'react';
import { Copy, Check, Image as ImageIcon, Loader2, Code as CodeIcon, ExternalLink, Sigma, AlertCircle } from 'lucide-react';
import { encodePlantUML } from '../utils/plantuml';

interface MarkdownViewProps {
  content: string;
}

const LatexRenderer: React.FC<{ tex: string, displayMode?: boolean }> = ({ tex, displayMode = true }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        let timer: any;
        
        const renderMath = () => {
            if (!containerRef.current || !isMounted) return;

            // KaTeX strictly requires Standards Mode (CSS1Compat).
            // Quirks Mode (BackCompat) happens if the <!DOCTYPE html> is missing or malformed.
            if (document.compatMode === 'BackCompat') {
                setError("Quirks Mode detected. Ensure index.html starts with <!DOCTYPE html> on line 1.");
                containerRef.current.innerHTML = `<div class="p-2 border border-red-900/50 bg-red-950/20 text-red-200 text-[10px] font-mono leading-tight">
                    <p class="font-bold mb-1">KaTeX Error: Browser in Quirks Mode</p>
                    <p>Mathematics cannot render in Quirks Mode. Fix index.html by removing all whitespace before DOCTYPE.</p>
                </div>`;
                return;
            }

            if ((window as any).katex) {
                try {
                    (window as any).katex.render(tex, containerRef.current, {
                        throwOnError: true,
                        displayMode: displayMode,
                        trust: true
                    });
                    setError(null);
                } catch (err: any) {
                    console.error("KaTeX render error:", err);
                    setError(err.message || "Invalid LaTeX syntax");
                    if (containerRef.current) {
                        // Fallback to raw text if syntax is bad
                        containerRef.current.textContent = displayMode ? `$$\n${tex}\n$$` : `$${tex}$`;
                    }
                }
            } else {
                timer = setTimeout(renderMath, 100);
            }
        };

        renderMath();
        return () => {
            isMounted = false;
            if (timer) clearTimeout(timer);
        };
    }, [tex, displayMode]);

    if (displayMode) {
        return (
            <div className="my-6 p-6 bg-slate-900/50 rounded-xl border border-slate-800 flex flex-col justify-center items-center overflow-x-auto shadow-inner relative group min-h-[80px]">
                {error && (
                    <div className="absolute top-2 right-2 text-red-500 opacity-50 group-hover:opacity-100 transition-opacity cursor-help" title={error}>
                        <AlertCircle size={14} />
                    </div>
                )}
                <div ref={containerRef} className="text-indigo-100 text-lg selection:bg-indigo-500/30 font-serif">
                    {!((window as any).katex) && <code className="text-xs text-slate-500 font-mono">$$\n{tex}\n$$</code>}
                </div>
            </div>
        );
    }

    return (
        <span className="inline-flex items-center group relative">
            <span ref={containerRef} className="inline-block px-1 font-serif italic text-indigo-300">
                {!((window as any).katex) && `$${tex}$`}
            </span>
            {error && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                    <div className="bg-red-900 text-red-100 text-[10px] p-2 rounded shadow-xl whitespace-nowrap border border-red-700">
                        {error}
                    </div>
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
        }).catch(err => {
            console.error("PlantUML encoding failed", err);
            if (isMounted) setLoading(false);
        });
        return () => { isMounted = false; };
    }, [code]);

    const handleCopyUrl = () => {
        if (url) {
            navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="my-6 border border-slate-700 rounded-xl overflow-hidden bg-slate-900 shadow-lg group">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-800/80 border-b border-slate-700">
                <div className="flex items-center gap-2">
                    <ImageIcon size={14} className="text-pink-400" />
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">System Diagram</span>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setShowCode(!showCode)}
                        className="text-[10px] font-bold text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
                    >
                        {showCode ? <ImageIcon size={12}/> : <CodeIcon size={12}/>}
                        {showCode ? 'View Diagram' : 'View Source'}
                    </button>
                    <button 
                        onClick={handleCopyUrl}
                        className="text-[10px] font-bold text-slate-400 hover:text-indigo-400 flex items-center gap-1 transition-colors"
                    >
                        {copied ? <Check size={12} className="text-emerald-400"/> : <ExternalLink size={12}/>}
                        {copied ? 'Copied' : 'Copy SVG Link'}
                    </button>
                </div>
            </div>

            <div className="p-6 bg-white/5 flex justify-center min-h-[100px] relative">
                {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-sm z-10 text-white gap-2">
                        <Loader2 size={24} className="animate-spin text-indigo-400" />
                        <span className="text-[10px] font-bold uppercase">Rendering Diagram...</span>
                    </div>
                )}
                
                {showCode ? (
                    <pre className="w-full p-4 bg-slate-950 text-indigo-200 text-xs font-mono overflow-x-auto whitespace-pre">
                        {code}
                    </pre>
                ) : url ? (
                    <img 
                        src={url} 
                        alt="PlantUML Diagram" 
                        className="max-w-full h-auto py-4 invert brightness-110 contrast-125 transition-transform duration-500 hover:scale-[1.02]"
                        onLoad={() => setLoading(false)}
                    />
                ) : !loading && (
                    <div className="p-8 text-slate-400 text-sm italic">Failed to load diagram.</div>
                )}
            </div>
        </div>
    );
};

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content }) => {
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const formatInline = (text: string) => {
    // Priority split by **bold** or $inline math$
    const parts = text.split(/(\*\*.*?\*\*|\$.*?\$)/g);
    
    return parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
            return <strong key={i} className="text-white font-semibold">{p.slice(2, -2)}</strong>;
        }
        if (p.startsWith('$') && p.endsWith('$')) {
            const math = p.slice(1, -1).trim();
            if (!math) return p;
            return <LatexRenderer key={i} tex={math} displayMode={false} />;
        }
        return p;
    });
  };

  const renderContent = (text: string) => {
    // First split by Blocks (Code Blocks and LaTeX Blocks)
    const parts = text.split(/(```[\s\S]*?```|\$\$[\s\S]*?\$\$)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('```')) {
        const content = part.replace(/^```\w*\n?/, '').replace(/```$/, '');
        const langMatch = part.match(/^```(\w+)/);
        const language = langMatch ? langMatch[1].toLowerCase() : 'code';
        
        if (language === 'plantuml' || language === 'puml') {
            return <PlantUMLRenderer key={index} code={content} />;
        }

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
      } else if (part.startsWith('$$')) {
          const tex = part.slice(2, -2).trim();
          if (!tex) return null;
          return <LatexRenderer key={index} tex={tex} />;
      } else {
        const lines = part.split('\n');
        const renderedElements: React.ReactNode[] = [];
        let tableBuffer: string[] = [];

        const processTableBuffer = () => {
            if (tableBuffer.length < 2) {
                tableBuffer.forEach((line, i) => {
                    renderedElements.push(<p key={`tbl-fail-${index}-${renderedElements.length}-${i}`} className="mb-2 text-slate-300">{formatInline(line)}</p>);
                });
            } else {
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
            if (trimmed.startsWith('|')) {
                tableBuffer.push(trimmed);
            } else {
                if (tableBuffer.length > 0) processTableBuffer();
                if (!trimmed) {
                    renderedElements.push(<div key={`${index}-${lineIdx}`} className="h-2" />);
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
        
        if (tableBuffer.length > 0) processTableBuffer();
        return <React.Fragment key={index}>{renderedElements}</React.Fragment>;
      }
    });
  };

  return <div className="markdown-view">{renderContent(content)}</div>;
};