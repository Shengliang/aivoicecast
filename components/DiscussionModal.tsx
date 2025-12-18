
import React, { useState, useEffect } from 'react';
import { X, MessageCircle, FileText, Loader2, CornerDownRight, Edit2, Save, Sparkles, ExternalLink, Cloud } from 'lucide-react';
import { CommunityDiscussion } from '../types';
import { getDiscussionById, saveDiscussionDesignDoc, saveDiscussion } from '../services/firestoreService';
import { generateDesignDocFromTranscript } from '../services/lectureGenerator';
import { MarkdownView } from './MarkdownView';
import { createGoogleDoc } from '../services/googleDriveService';
import { connectGoogleDrive } from '../services/authService';

interface DiscussionModalProps {
  isOpen: boolean;
  onClose: () => void;
  discussionId: string;
  initialDiscussion?: CommunityDiscussion | null; // Optional prepopulated data
  currentUser?: any;
  language?: 'en' | 'zh';
  activeLectureTopic?: string; // Passed for context generation
}

export const DiscussionModal: React.FC<DiscussionModalProps> = ({ 
  isOpen, onClose, discussionId, initialDiscussion, currentUser, language = 'en', activeLectureTopic 
}) => {
  const [activeDiscussion, setActiveDiscussion] = useState<CommunityDiscussion | null>(initialDiscussion || null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'transcript' | 'doc'>('transcript');
  
  // Doc Editing State
  const [isEditingDoc, setIsEditingDoc] = useState(false);
  const [editedDocContent, setEditedDocContent] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [isSavingDoc, setIsSavingDoc] = useState(false);
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);

  // Google Doc Export State
  const [isExportingGDoc, setIsExportingGDoc] = useState(false);
  const [gDocUrl, setGDocUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setGDocUrl(null);
      if (!initialDiscussion || initialDiscussion.id !== discussionId) {
        setLoading(true);
        getDiscussionById(discussionId).then(data => {
          setActiveDiscussion(data);
          setLoading(false);
        }).catch(() => {
          setLoading(false);
        });
      } else {
        setActiveDiscussion(initialDiscussion);
      }
      
      // If manually created new doc (no transcript), default to doc view
      if (initialDiscussion && initialDiscussion.id === 'new' && initialDiscussion.isManual) {
          setViewMode('doc');
          setIsEditingDoc(true); // Auto-open editor
      } else {
          setViewMode('transcript');
          setIsEditingDoc(false);
      }
    }
  }, [isOpen, discussionId, initialDiscussion]);

  // Sync edit state when discussion changes
  useEffect(() => {
    if (activeDiscussion) {
      if (activeDiscussion.designDoc) setEditedDocContent(activeDiscussion.designDoc);
      setDocTitle(activeDiscussion.title || 'Untitled Document');
    }
  }, [activeDiscussion]);

  if (!isOpen) return null;

  const handleGenerateDoc = async () => {
      if (!activeDiscussion || !activeDiscussion.transcript) return;
      setIsGeneratingDoc(true);
      try {
          const dateStr = new Date().toLocaleDateString('en-US');
          const meta = {
              date: dateStr,
              topic: activeLectureTopic || "Discussion",
              segmentIndex: activeDiscussion.segmentIndex
          };

          const doc = await generateDesignDocFromTranscript(activeDiscussion.transcript, meta, language as 'en' | 'zh');
          if (doc) {
              await saveDiscussionDesignDoc(activeDiscussion.id, doc);
              // Update local state
              setActiveDiscussion({ ...activeDiscussion, designDoc: doc });
              setEditedDocContent(doc);
          } else {
              alert("Failed to generate document.");
          }
      } catch(e) {
          console.error(e);
          alert("Error generating document.");
      } finally {
          setIsGeneratingDoc(false);
      }
  };

  const handleSaveDoc = async () => {
    if (!activeDiscussion) return;
    setIsSavingDoc(true);
    try {
      if (activeDiscussion.id === 'new') {
          // Create new document
          const docToSave = {
              ...activeDiscussion,
              title: docTitle,
              designDoc: editedDocContent
          };
          // Remove temporary ID 'new' so it doesn't pollute data
          // @ts-ignore
          delete docToSave.id;
          
          const newId = await saveDiscussion(docToSave as CommunityDiscussion);
          setActiveDiscussion({ ...activeDiscussion, title: docTitle, designDoc: editedDocContent, id: newId });
      } else {
          // Update existing document
          await saveDiscussionDesignDoc(activeDiscussion.id, editedDocContent, docTitle);
          setActiveDiscussion({ ...activeDiscussion, title: docTitle, designDoc: editedDocContent });
      }
      setIsEditingDoc(false);
    } catch (e) {
      console.error(e);
      alert("Failed to save document.");
    } finally {
      setIsSavingDoc(false);
    }
  };

  const handleExportToGoogleDocs = async () => {
      if (!activeDiscussion || !editedDocContent) return;
      
      setIsExportingGDoc(true);
      try {
          // 1. Get OAuth Token (reusing Code Studio logic)
          // Note: In a production app, we'd check if we have a valid token in memory first.
          const token = await connectGoogleDrive();
          
          // 2. Create the Doc
          const url = await createGoogleDoc(token, docTitle || "AIVoiceCast Design Doc", editedDocContent);
          
          setGDocUrl(url);
          window.open(url, '_blank');
      } catch(e: any) {
          console.error("GDoc Export Failed", e);
          alert(`Failed to export to Google Docs: ${e.message}`);
      } finally {
          setIsExportingGDoc(false);
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh] animate-fade-in-up">
          <div className="p-4 border-b border-slate-800 bg-slate-900 rounded-t-2xl">
              <div className="flex justify-between items-center mb-4 gap-4">
                  <div className="flex items-center gap-2 flex-1">
                      <FileText size={20} className="text-emerald-400 shrink-0" />
                      <input 
                          type="text" 
                          value={docTitle} 
                          onChange={(e) => setDocTitle(e.target.value)}
                          className="bg-transparent border-b border-transparent hover:border-slate-600 focus:border-indigo-500 text-lg font-bold text-white focus:outline-none w-full transition-colors truncate"
                          placeholder="Document Title"
                      />
                  </div>
                  <div className="flex items-center gap-2">
                      {activeDiscussion?.designDoc && !isEditingDoc && (
                          <button 
                            /* Fix: changed handleExportToGoogleToDocs to handleExportToGoogleDocs */
                            onClick={handleExportToGoogleDocs}
                            disabled={isExportingGDoc}
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-600/30 rounded-lg text-xs font-bold transition-all"
                            title="Export to Google Docs"
                          >
                            {isExportingGDoc ? <Loader2 size={14} className="animate-spin"/> : <Cloud size={14} />}
                            <span className="hidden sm:inline">Google Doc</span>
                          </button>
                      )}
                      <button onClick={onClose} className="text-slate-400 hover:text-white p-2"><X size={20}/></button>
                  </div>
              </div>
              
              {/* Tabs - Hidden for Manual or New Documents (Clean UX) */}
              {(!activeDiscussion?.isManual && activeDiscussion?.id !== 'new') && (
                  <div className="flex space-x-2">
                      <button 
                          onClick={() => setViewMode('transcript')}
                          className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors flex items-center justify-center space-x-2 ${viewMode === 'transcript' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                          <MessageCircle size={16} />
                          <span>Transcript</span>
                      </button>
                      <button 
                          onClick={() => setViewMode('doc')}
                          className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors flex items-center justify-center space-x-2 ${viewMode === 'doc' ? 'bg-slate-800 text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                          <FileText size={16} />
                          <span>Design Document</span>
                      </button>
                  </div>
              )}
          </div>
          
          <div className="p-6 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-slate-700">
              {loading ? (
                  <div className="text-center py-12 text-slate-500">
                      <Loader2 size={32} className="animate-spin mx-auto mb-2"/>
                      <p>Loading...</p>
                  </div>
              ) : activeDiscussion ? (
                  <>
                      {viewMode === 'transcript' && !activeDiscussion.isManual ? (
                          <div className="space-y-4">
                              <div className="bg-slate-800/50 p-3 rounded-lg text-xs text-slate-400 mb-4 border border-slate-700 flex justify-between items-center">
                                  <span>Started by <span className="font-bold text-indigo-300">{activeDiscussion.userName}</span> on {new Date(activeDiscussion.createdAt).toLocaleDateString()}</span>
                                  {activeDiscussion.segmentIndex !== undefined && (
                                      <button 
                                          onClick={() => {
                                              onClose();
                                              const el = document.getElementById(`seg-${activeDiscussion.segmentIndex}`);
                                              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                          }}
                                          className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-bold"
                                      >
                                          <CornerDownRight size={14} />
                                          Jump to Segment
                                      </button>
                                  )}
                              </div>
                              {activeDiscussion.transcript && activeDiscussion.transcript.length > 0 ? activeDiscussion.transcript.map((item, idx) => (
                                  <div key={idx} className={`flex flex-col ${item.role === 'user' ? 'items-end' : 'items-start'}`}>
                                      <div className="flex items-center space-x-2 mb-1 px-1">
                                          <span className="text-[10px] text-slate-500 uppercase font-bold">{item.role === 'user' ? activeDiscussion.userName : 'AI Host'}</span>
                                      </div>
                                      <div className={`px-4 py-2 rounded-xl max-w-[90%] text-sm ${item.role === 'user' ? 'bg-indigo-900/30 text-indigo-100 rounded-tr-sm border border-indigo-500/30' : 'bg-slate-800 text-slate-300 rounded-tl-sm border border-slate-700'}`}>
                                          <p className="whitespace-pre-wrap">{item.text}</p>
                                      </div>
                                  </div>
                              )) : (
                                  <div className="text-center py-8 text-slate-500 italic">No transcript available.</div>
                              )}
                          </div>
                      ) : (
                          <div className="h-full flex flex-col">
                              {activeDiscussion.designDoc || isEditingDoc ? (
                                  <>
                                    <div className="flex justify-end mb-4 space-x-2 sticky top-0 z-10 bg-slate-900 pb-2">
                                        {isEditingDoc ? (
                                            <>
                                                <button onClick={() => setIsEditingDoc(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 rounded-lg">Cancel</button>
                                                <button onClick={handleSaveDoc} disabled={isSavingDoc} className="px-3 py-1.5 text-xs text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg flex items-center gap-1 font-bold">
                                                    {isSavingDoc ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Save
                                                </button>
                                            </>
                                        ) : (
                                            <div className="flex gap-2">
                                                {gDocUrl && (
                                                    <a href={gDocUrl} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-500/30 rounded-lg flex items-center gap-1 font-bold hover:bg-emerald-900/40">
                                                        <ExternalLink size={12}/> View on Google Docs
                                                    </a>
                                                )}
                                                <button onClick={() => setIsEditingDoc(true)} className="px-3 py-1.5 text-xs text-indigo-300 hover:text-white bg-slate-800 hover:bg-indigo-600 rounded-lg flex items-center gap-1 border border-slate-700 transition-colors">
                                                    <Edit2 size={12}/> Edit
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {isEditingDoc ? (
                                        <textarea 
                                            value={editedDocContent}
                                            onChange={e => setEditedDocContent(e.target.value)}
                                            className="w-full h-full min-h-[400px] bg-slate-950 p-4 rounded-lg border border-slate-700 font-mono text-sm text-slate-300 focus:outline-none focus:border-indigo-500 resize-none"
                                            placeholder="Write your document content here (Markdown supported)..."
                                        />
                                    ) : (
                                        <div className="prose prose-invert prose-sm max-w-none">
                                            <MarkdownView content={activeDiscussion.designDoc || ''} />
                                        </div>
                                    )}
                                  </>
                              ) : (
                                  <div className="flex flex-col items-center justify-center h-full space-y-4 p-8">
                                      <FileText size={48} className="text-slate-700" />
                                      <p className="text-slate-400 text-center text-sm max-w-xs">
                                          Convert this discussion into a formal design document with one click.
                                      </p>
                                      <button 
                                          onClick={handleGenerateDoc}
                                          disabled={isGeneratingDoc}
                                          className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-full shadow-lg transition-transform hover:scale-105 disabled:opacity-50 disabled:scale-100"
                                      >
                                          {isGeneratingDoc ? <Loader2 size={18} className="animate-spin"/> : <Sparkles size={18} />}
                                          <span>Generate Design Doc</span>
                                      </button>
                                  </div>
                              )}
                          </div>
                      )}
                  </>
              ) : (
                  <p className="text-center text-red-400">Discussion not found.</p>
              )}
          </div>
      </div>
    </div>
  );
};
