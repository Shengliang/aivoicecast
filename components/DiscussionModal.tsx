import React, { useState, useEffect } from 'react';
import { X, MessageCircle, FileText, Loader2, CornerDownRight, Edit2, Save, Sparkles, ExternalLink, Cloud, Trash2, RefreshCw, Info } from 'lucide-react';
import { CommunityDiscussion } from '../types';
import { getDiscussionById, saveDiscussionDesignDoc, saveDiscussion, deleteDiscussion } from '../services/firestoreService';
import { generateDesignDocFromTranscript } from '../services/lectureGenerator';
import { MarkdownView } from './MarkdownView';
import { connectGoogleDrive } from '../services/authService';
import { createGoogleDoc } from '../services/googleDriveService';

interface DiscussionModalProps {
  isOpen: boolean;
  onClose: () => void;
  discussionId: string;
  initialDiscussion?: CommunityDiscussion | null; // Optional prepopulated data
  currentUser?: any;
  language?: 'en' | 'zh';
  activeLectureTopic?: string; // Passed for context generation
  onDocumentDeleted?: () => void;
}

export const DiscussionModal: React.FC<DiscussionModalProps> = ({ 
  isOpen, onClose, discussionId, initialDiscussion, currentUser, language = 'en', activeLectureTopic, onDocumentDeleted
}) => {
  const [activeDiscussion, setActiveDiscussion] = useState<CommunityDiscussion | null>(initialDiscussion || null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'transcript' | 'doc'>('transcript');
  
  // Doc Editing State
  const [isEditingDoc, setIsEditingDoc] = useState(false);
  const [editedDocContent, setEditedDocContent] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [isSavingDoc, setIsSavingDoc] = useState(false);
  const [isDeletingDoc, setIsDeletingDoc] = useState(false);
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
          if (data) {
              setActiveDiscussion(data);
              setDocTitle(data.title || 'Untitled Document');
              setEditedDocContent(data.designDoc || '');
              
              // LOGIC: If no transcript exists, force 'doc' view so user sees content or editor
              const hasTranscript = data.transcript && data.transcript.length > 0;
              if (data.isManual || data.designDoc || !hasTranscript) {
                  setViewMode('doc');
                  // If it's completely empty, open editor by default
                  if (!data.designDoc && !hasTranscript) setIsEditingDoc(true);
              } else {
                  setViewMode('transcript');
              }
          }
          setLoading(false);
        }).catch(() => {
          setLoading(false);
        });
      } else {
        setActiveDiscussion(initialDiscussion);
        setDocTitle(initialDiscussion.title || 'Untitled Document');
        setEditedDocContent(initialDiscussion.designDoc || '');
        const hasTranscript = initialDiscussion.transcript && initialDiscussion.transcript.length > 0;
        if (initialDiscussion.id === 'new' || initialDiscussion.designDoc || !hasTranscript) {
            setViewMode('doc');
            if (initialDiscussion.id === 'new' || !initialDiscussion.designDoc) setIsEditingDoc(true);
        }
      }
    }
  }, [isOpen, discussionId, initialDiscussion]);

  if (!isOpen) return null;

  const handleGenerateDoc = async () => {
      if (!activeDiscussion || !activeDiscussion.transcript || activeDiscussion.transcript.length === 0) {
          alert("Cannot synthesize: The session transcript is empty.");
          return;
      }
      setIsGeneratingDoc(true);
      try {
          const dateStr = new Date().toLocaleDateString('en-US');
          const meta = {
              date: dateStr,
              topic: docTitle || activeLectureTopic || "Discussion",
              segmentIndex: activeDiscussion.segmentIndex
          };

          const doc = await generateDesignDocFromTranscript(activeDiscussion.transcript, meta, language as 'en' | 'zh');
          if (doc) {
              if (activeDiscussion.id !== 'new') {
                await saveDiscussionDesignDoc(activeDiscussion.id, doc, docTitle);
              }
              setActiveDiscussion({ ...activeDiscussion, designDoc: doc, title: docTitle });
              setEditedDocContent(doc);
              setViewMode('doc');
              setIsEditingDoc(false);
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
          const docToSave = {
              ...activeDiscussion,
              title: docTitle || 'Untitled Document',
              designDoc: editedDocContent
          };
          // @ts-ignore
          delete docToSave.id;
          
          const newId = await saveDiscussion(docToSave as CommunityDiscussion);
          setActiveDiscussion({ ...activeDiscussion, title: docTitle || 'Untitled Document', designDoc: editedDocContent, id: newId });
      } else {
          await saveDiscussionDesignDoc(activeDiscussion.id, editedDocContent, docTitle || 'Untitled Document');
          setActiveDiscussion({ ...activeDiscussion, title: docTitle || 'Untitled Document', designDoc: editedDocContent });
      }
      setIsEditingDoc(false);
    } catch (e) {
      console.error(e);
      alert("Failed to save document.");
    } finally {
      setIsSavingDoc(false);
    }
  };

  const handleDelete = async () => {
      if (!activeDiscussion || activeDiscussion.id === 'new' || activeDiscussion.id === 'system-doc-001') return;
      if (!confirm("Are you sure you want to delete this document?")) return;

      setIsDeletingDoc(true);
      try {
          await deleteDiscussion(activeDiscussion.id);
          if (onDocumentDeleted) onDocumentDeleted();
          onClose();
      } catch (e) {
          alert("Failed to delete document.");
      } finally {
          setIsDeletingDoc(false);
      }
  };

  const handleExportToGoogleDocs = async () => {
      if (!activeDiscussion || !editedDocContent) return;
      
      setIsExportingGDoc(true);
      try {
          const token = await connectGoogleDrive();
          const url = await createGoogleDoc(token, docTitle || "AIVoiceCast Spec", editedDocContent);
          setGDocUrl(url);
          window.open(url, '_blank');
      } catch(e: any) {
          console.error("GDoc Export Failed", e);
          alert(`Failed to export: ${e.message}`);
      } finally {
          setIsExportingGDoc(false);
      }
  };

  const isOwner = currentUser && activeDiscussion && (activeDiscussion.userId === currentUser.uid || currentUser.email === 'shengliang.song@gmail.com');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-fade-in-up">
          
          {/* Header */}
          <div className="p-4 border-b border-slate-800 bg-slate-900">
              <div className="flex justify-between items-center mb-4 gap-4">
                  <div className="flex items-center gap-2 flex-1">
                      <FileText size={20} className="text-emerald-400 shrink-0" />
                      <input 
                          type="text" 
                          value={docTitle} 
                          readOnly={!isOwner}
                          onChange={(e) => setDocTitle(e.target.value)}
                          className={`bg-transparent border-b border-transparent ${isOwner ? 'hover:border-slate-700 focus:border-indigo-500' : ''} text-lg font-bold text-white focus:outline-none w-full transition-colors truncate`}
                          placeholder="Document Title"
                      />
                  </div>
                  <div className="flex items-center gap-2">
                      {activeDiscussion?.designDoc && !isEditingDoc && (
                          <button 
                            onClick={handleExportToGoogleDocs}
                            disabled={isExportingGDoc}
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-600/30 rounded-lg text-xs font-bold transition-all"
                            title="Export to Google Docs"
                          >
                            {isExportingGDoc ? <Loader2 size={14} className="animate-spin"/> : <Cloud size={14} />}
                            <span className="hidden sm:inline">Export</span>
                          </button>
                      )}
                      <button onClick={onClose} className="text-slate-400 hover:text-white p-2"><X size={20}/></button>
                  </div>
              </div>
              
              {/* Tabs - Only show if transcript actually exists */}
              {(activeDiscussion?.transcript && activeDiscussion.transcript.length > 0 && activeDiscussion.id !== 'new') && (
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
                          <span>Specification</span>
                      </button>
                  </div>
              )}
          </div>
          
          <div className="p-6 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-slate-700 bg-slate-900">
              {loading ? (
                  <div className="text-center py-12 text-slate-500">
                      <Loader2 size={32} className="animate-spin mx-auto mb-2"/>
                      <p>Fetching document...</p>
                  </div>
              ) : activeDiscussion ? (
                  <>
                      {viewMode === 'transcript' ? (
                          <div className="space-y-4">
                              <div className="bg-slate-800/50 p-4 rounded-xl text-xs border border-slate-700 flex justify-between items-center">
                                  <div className="flex items-center gap-3">
                                      <div className="p-2 bg-emerald-900/30 rounded-full text-emerald-400"><Sparkles size={16}/></div>
                                      <div>
                                          <p className="font-bold text-slate-200">Session Context</p>
                                          <p className="text-slate-500">{activeDiscussion.userName} • {new Date(activeDiscussion.createdAt).toLocaleDateString()}</p>
                                      </div>
                                  </div>
                                  {isOwner && (
                                    <button 
                                        onClick={handleGenerateDoc}
                                        disabled={isGeneratingDoc}
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center gap-2 shadow-lg transition-all"
                                    >
                                        {isGeneratingDoc ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14} />}
                                        Synthesize
                                    </button>
                                  )}
                              </div>
                              <div className="space-y-4 pt-4">
                                  {activeDiscussion.transcript && activeDiscussion.transcript.length > 0 ? activeDiscussion.transcript.map((item, idx) => (
                                      <div key={idx} className={`flex flex-col ${item.role === 'user' ? 'items-end' : 'items-start'}`}>
                                          <span className="text-[10px] text-slate-500 uppercase font-bold mb-1 px-1">{item.role === 'user' ? activeDiscussion.userName : 'AI Host'}</span>
                                          <div className={`px-4 py-2 rounded-2xl max-w-[90%] text-sm ${item.role === 'user' ? 'bg-indigo-900/40 text-indigo-100 border border-indigo-500/20' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>
                                              <p className="whitespace-pre-wrap">{item.text}</p>
                                          </div>
                                      </div>
                                  )) : (
                                      <div className="text-center py-12 text-slate-600 flex flex-col items-center gap-2">
                                          {/* FIX: Info component now correctly imported from lucide-react */}
                                          <Info size={32} className="opacity-20"/>
                                          <p>This session has no transcript data.</p>
                                          {isOwner && <button onClick={() => setViewMode('doc')} className="text-indigo-400 hover:underline">Switch to Specification Editor</button>}
                                      </div>
                                  )}
                              </div>
                          </div>
                      ) : (
                          <div className="h-full flex flex-col min-h-[400px]">
                                <div className="flex justify-between items-center mb-6 sticky top-0 z-10 bg-slate-900 pb-2 border-b border-slate-800">
                                    <div className="flex gap-2">
                                        {isOwner && !isEditingDoc && activeDiscussion.id !== 'system-doc-001' && (
                                            <button 
                                                onClick={handleDelete}
                                                className="px-3 py-1.5 text-xs text-red-400 hover:text-white bg-red-900/10 hover:bg-red-600 rounded-lg flex items-center gap-1 transition-all border border-red-900/30"
                                            >
                                                <Trash2 size={14}/> <span>Delete</span>
                                            </button>
                                        )}
                                        {isOwner && activeDiscussion.transcript && activeDiscussion.transcript.length > 0 && (
                                            <button 
                                                onClick={handleGenerateDoc}
                                                disabled={isGeneratingDoc}
                                                className="px-3 py-1.5 text-xs text-indigo-300 bg-indigo-900/20 border border-indigo-500/30 rounded-lg flex items-center gap-1 hover:bg-indigo-600 hover:text-white transition-all"
                                            >
                                                <RefreshCw size={14} className={isGeneratingDoc ? 'animate-spin' : ''}/>
                                                <span>Re-Synthesize</span>
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex space-x-2">
                                        {isOwner && (
                                            isEditingDoc ? (
                                                <>
                                                    <button onClick={() => setIsEditingDoc(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 rounded-lg border border-slate-700">Cancel</button>
                                                    <button onClick={handleSaveDoc} disabled={isSavingDoc} className="px-4 py-1.5 text-xs text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg flex items-center gap-2 font-bold shadow-lg shadow-emerald-500/20">
                                                        {isSavingDoc ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Save Changes
                                                    </button>
                                                </>
                                            ) : (
                                                <button onClick={() => setIsEditingDoc(true)} className="px-4 py-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center gap-2 font-bold shadow-lg shadow-emerald-500/20">
                                                    <Edit2 size={14}/> Edit Content
                                                </button>
                                            )
                                        )}
                                    </div>
                                </div>

                                {isEditingDoc ? (
                                    <textarea 
                                        autoFocus
                                        value={editedDocContent}
                                        onChange={e => setEditedDocContent(e.target.value)}
                                        className="w-full flex-1 min-h-[500px] bg-slate-950 p-6 rounded-xl border border-slate-700 font-mono text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none leading-relaxed"
                                        placeholder="Start writing your technical specification here (Markdown supported)..."
                                    />
                                ) : (
                                    <div className="prose prose-invert prose-sm max-w-none bg-slate-900/50 p-6 rounded-xl border border-slate-800/50 min-h-[500px]">
                                        {editedDocContent ? (
                                            <MarkdownView content={editedDocContent} />
                                        ) : (
                                            <div className="h-full flex flex-col items-center justify-center text-slate-500 italic py-20">
                                                <FileText size={48} className="mb-4 opacity-10"/>
                                                <p>This document is currently empty.</p>
                                                {isOwner && <p className="text-xs mt-2 not-italic">Click "Edit Content" to start writing.</p>}
                                            </div>
                                        )}
                                    </div>
                                )}
                          </div>
                      )}
                  </>
              ) : (
                  <p className="text-center text-red-400">Document data missing.</p>
              )}
          </div>
      </div>
    </div>
  );
};
