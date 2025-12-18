
import React, { useState, useEffect } from 'react';
import { CommunityDiscussion } from '../types';
import { getUserDesignDocs, saveDiscussionDesignDoc } from '../services/firestoreService';
import { FileText, Calendar, ArrowRight, Loader2, MessageSquare, Plus, Edit, ShieldCheck } from 'lucide-react';
import { auth } from '../services/firebaseConfig';
import { DiscussionModal } from './DiscussionModal';
import { APP_COMPARISON_DOC } from '../utils/docContent';

interface DocumentListProps {
  onBack?: () => void;
}

export const DocumentList: React.FC<DocumentListProps> = ({ onBack }) => {
  const [docs, setDocs] = useState<CommunityDiscussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  
  const currentUser = auth.currentUser;

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const loadData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const data = await getUserDesignDocs(currentUser.uid);
      // Pinned system doc for clarity
      setDocs([APP_COMPARISON_DOC, ...data.filter(d => d.id !== APP_COMPARISON_DOC.id)]);
    } catch (e) {
      console.error(e);
      setDocs([APP_COMPARISON_DOC]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = async () => {
      if (!currentUser) return;
      setSelectedDocId('new'); 
  };

  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500 bg-slate-900/30 rounded-xl border border-dashed border-slate-800">
        <p>Please sign in to view your documents.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="w-2 h-6 bg-emerald-500 rounded-full"></span>
          <span>My Design Docs</span>
        </h2>
        <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500 font-mono">{docs.length} docs</span>
            <button 
                onClick={handleCreateNew}
                className="flex items-center space-x-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors text-xs font-bold shadow-md shadow-emerald-500/20"
            >
                <Plus size={14} />
                <span>New Doc</span>
            </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center text-indigo-400">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {docs.map((doc) => {
            const isSystem = doc.id === 'system-doc-001';
            return (
              <div 
                key={doc.id} 
                onClick={() => setSelectedDocId(doc.id)}
                className={`bg-slate-900 border ${isSystem ? 'border-indigo-500/50 bg-indigo-900/10' : 'border-slate-800'} rounded-xl p-5 hover:border-emerald-500/50 hover:bg-slate-800/50 transition-all cursor-pointer group flex flex-col justify-between`}
              >
                <div>
                  <div className="flex items-start justify-between mb-3">
                     <div className={`p-2 rounded-lg ${isSystem ? 'bg-indigo-900/30 text-indigo-400' : 'bg-emerald-900/20 text-emerald-400'}`}>
                        {isSystem ? <ShieldCheck size={20}/> : <FileText size={20} />}
                     </div>
                     <span className="text-[10px] text-slate-500 font-mono bg-slate-950 px-2 py-1 rounded">
                        {isSystem ? 'PINNED' : new Date(doc.createdAt).toLocaleDateString()}
                     </span>
                  </div>
                  
                  <h3 className={`text-lg font-bold mb-1 line-clamp-1 group-hover:text-emerald-400 transition-colors ${isSystem ? 'text-indigo-100' : 'text-white'}`}>
                     {doc.title || "Untitled Document"}
                  </h3>
                  <p className="text-xs text-slate-400 mb-4 line-clamp-2">
                     {isSystem ? "Official distinction between platform pillars." : doc.isManual ? "Created in Editor" : `Linked to Lecture ID: ${doc.lectureId}`}
                  </p>
                </div>

                <div className="flex items-center justify-between border-t border-slate-800/50 pt-3 mt-2">
                   <div className="flex items-center gap-2 text-xs text-slate-500">
                      {isSystem ? (
                          <span className="text-indigo-400 font-bold uppercase tracking-widest text-[9px]">Platform Spec</span>
                      ) : doc.transcript && doc.transcript.length > 0 ? (
                          <><MessageSquare size={12} /><span>Transcript</span></>
                      ) : (
                          <><Edit size={12} /><span>Manual Entry</span></>
                      )}
                   </div>
                   <button className="text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs font-bold">
                      Read <ArrowRight size={12} />
                   </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedDocId && (
        <DiscussionModal 
           isOpen={true} 
           onClose={() => { setSelectedDocId(null); loadData(); }} 
           discussionId={selectedDocId} 
           currentUser={currentUser}
           initialDiscussion={selectedDocId === 'new' ? {
              id: 'new',
              lectureId: 'manual',
              channelId: 'manual',
              userId: currentUser.uid,
              userName: currentUser.displayName || 'User',
              transcript: [],
              createdAt: Date.now(),
              designDoc: "# New Document\n\n",
              isManual: true,
              title: "Untitled Document"
           } : (selectedDocId === APP_COMPARISON_DOC.id ? APP_COMPARISON_DOC : undefined)}
        />
      )}
    </div>
  );
};
