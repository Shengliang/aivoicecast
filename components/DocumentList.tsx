
import React, { useState, useEffect } from 'react';
import { CommunityDiscussion } from '../types';
import { getUserDesignDocs, saveDiscussionDesignDoc } from '../services/firestoreService';
import { FileText, Calendar, ArrowRight, Loader2, MessageSquare, Plus, Edit } from 'lucide-react';
import { auth } from '../services/firebaseConfig';
import { DiscussionModal } from './DiscussionModal';

interface DocumentListProps {
  onBack?: () => void;
}

export const DocumentList: React.FC<DocumentListProps> = ({ onBack }) => {
  const [docs, setDocs] = useState<CommunityDiscussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  
  // State for creating a NEW blank document
  const [isCreating, setIsCreating] = useState(false);
  
  const currentUser = auth.currentUser;

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const loadData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const data = await getUserDesignDocs(currentUser.uid);
      setDocs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = async () => {
      if (!currentUser) return;
      const newDoc: CommunityDiscussion = {
          id: crypto.randomUUID(), // Temp ID for modal, or use empty
          lectureId: 'manual',
          channelId: 'manual',
          userId: currentUser.uid,
          userName: currentUser.displayName || 'User',
          transcript: [],
          createdAt: Date.now(),
          designDoc: "# New Document\n\nStart typing here...",
          isManual: true,
          title: "Untitled Document"
      };
      
      // We pass this object to the modal as "initialDiscussion"
      // The modal will save it to Firestore upon first save
      setSelectedDocId('new'); 
      // Hack: we need to pass the object to the modal via a prop or state
      // For now, we will handle "new" specially in the list or modify the modal logic.
      // Better approach: Mock the modal opening with this object
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
      ) : docs.length === 0 ? (
        <div className="py-12 text-center text-slate-500 bg-slate-900/30 rounded-xl border border-dashed border-slate-800">
          <p>No documents found.</p>
          <p className="text-xs mt-2">Generate them from transcripts or create one from scratch.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {docs.map((doc) => (
            <div 
              key={doc.id} 
              onClick={() => setSelectedDocId(doc.id)}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-emerald-500/50 hover:bg-slate-800/50 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                   <div className="p-2 bg-emerald-900/20 text-emerald-400 rounded-lg">
                      <FileText size={20} />
                   </div>
                   <span className="text-[10px] text-slate-500 font-mono bg-slate-950 px-2 py-1 rounded">
                      {new Date(doc.createdAt).toLocaleDateString()}
                   </span>
                </div>
                
                {/* Try to extract a title from the doc content if possible, else fall back to ID/Generic */}
                <h3 className="text-lg font-bold text-white mb-1 line-clamp-1 group-hover:text-emerald-400 transition-colors">
                   {doc.title || doc.designDoc?.split('\n')[0].replace('#', '').trim() || "Untitled Document"}
                </h3>
                <p className="text-xs text-slate-400 mb-4 line-clamp-2">
                   {doc.isManual ? "Created in Editor" : `Linked to Lecture ID: ${doc.lectureId}`}
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-slate-800/50 pt-3 mt-2">
                 <div className="flex items-center gap-2 text-xs text-slate-500">
                    {doc.transcript && doc.transcript.length > 0 ? (
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
          ))}
        </div>
      )}

      {selectedDocId && (
        <DiscussionModal 
           isOpen={true} 
           onClose={() => { setSelectedDocId(null); loadData(); }} // Reload data on close to reflect edits
           discussionId={selectedDocId} 
           currentUser={currentUser}
           initialDiscussion={selectedDocId === 'new' ? {
              id: 'new', // Placeholder, will be replaced on save
              lectureId: 'manual',
              channelId: 'manual',
              userId: currentUser.uid,
              userName: currentUser.displayName || 'User',
              transcript: [],
              createdAt: Date.now(),
              designDoc: "# New Document\n\n",
              isManual: true,
              title: "Untitled Document"
           } : undefined}
        />
      )}
    </div>
  );
};
