import React, { useState, useEffect, useRef } from 'react';
import { Channel, Group, Chapter, SubTopic } from '../types';
import { getUserGroups } from '../services/firestoreService';
import { auth } from '../services/firebaseConfig';
import { modifyCurriculumWithAI } from '../services/channelGenerator';
import { X, Lock, Globe, Users, Save, Loader2, Trash2, BookOpen, Plus, LayoutList, Mic, MicOff, Sparkles } from 'lucide-react';

interface ChannelSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: Channel;
  onUpdate: (updatedChannel: Channel) => void;
  onDelete?: () => void;
}

const UI_VOICE_LIST = [
    { id: 'Puck', label: 'Puck' },
    { id: 'Charon', label: 'Charon' },
    { id: 'Kore', label: 'Kore' },
    { id: 'Fenrir', label: 'Fenrir' },
    { id: 'Zephyr', label: 'Zephyr' },
    { id: 'gen-lang-client-0648937375', label: 'Software Interview' },
    { id: 'gen-lang-client-0375218270', label: 'Linux Kernel' }
];

export const ChannelSettingsModal: React.FC<ChannelSettingsModalProps> = ({ isOpen, onClose, channel, onUpdate, onDelete }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'curriculum'>('general');
  const [title, setTitle] = useState(channel.title);
  const [description, setDescription] = useState(channel.description);
  const [visibility, setVisibility] = useState<'private' | 'public' | 'group'>(channel.visibility || 'private');
  const [selectedGroupId, setSelectedGroupId] = useState(channel.groupId || '');
  const [voiceName, setVoiceName] = useState(channel.voiceName);
  const [chapters, setChapters] = useState<Chapter[]>(channel.chapters || []);
  const [userGroups, setUserGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [activeVoiceField, setActiveVoiceField] = useState<'title' | 'desc' | 'curriculum' | null>(null);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const recognitionRef = useRef<any>(null);

  const currentUser = auth.currentUser;

  useEffect(() => {
    if (isOpen && currentUser && visibility === 'group') {
      setLoadingGroups(true);
      getUserGroups(currentUser.uid).then(groups => {
        setUserGroups(groups);
        if (!selectedGroupId && groups.length > 0) setSelectedGroupId(groups[0].id);
        setLoadingGroups(false);
      });
    }
  }, [isOpen, visibility, currentUser, selectedGroupId]);

  useEffect(() => {
    if (isOpen && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (activeVoiceField === 'title') setTitle(transcript);
        else if (activeVoiceField === 'desc') setDescription(prev => prev ? prev + ' ' + transcript : transcript);
        else if (activeVoiceField === 'curriculum') await handleAIModification(transcript);
        setIsListening(false);
        setActiveVoiceField(null);
      };
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, [isOpen, activeVoiceField, chapters]);

  const handleAIModification = async (prompt: string) => {
      setIsAIProcessing(true);
      const newChapters = await modifyCurriculumWithAI(chapters, prompt, 'en');
      if (newChapters) setChapters(newChapters);
      setIsAIProcessing(false);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setIsSaving(true);
    await onUpdate({ ...channel, title, description, visibility, voiceName, groupId: visibility === 'group' ? selectedGroupId : undefined, chapters });
    setIsSaving(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900 shrink-0">
          <h2 className="text-lg font-bold text-white">Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={20} /></button>
        </div>
        <div className="flex border-b border-slate-800 shrink-0">
            <button onClick={() => setActiveTab('general')} className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 ${activeTab === 'general' ? 'bg-slate-800 text-white border-b-2 border-indigo-500' : 'text-slate-500'}`}><LayoutList size={16}/><span>General</span></button>
            <button onClick={() => setActiveTab('curriculum')} className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 ${activeTab === 'curriculum' ? 'bg-slate-800 text-white border-b-2 border-indigo-500' : 'text-slate-500'}`}><BookOpen size={16}/><span>Curriculum</span></button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'general' ? (
            <div className="space-y-6">
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Title</label>
                        <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"/>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
                        <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none resize-none"/>
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Voice Personality</label>
                    <div className="grid grid-cols-3 gap-2">
                        {UI_VOICE_LIST.map(v => (
                            <button key={v.id} onClick={() => setVoiceName(v.id)} className={`py-2 px-1 rounded-lg text-[10px] font-bold border transition-all ${voiceName === v.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                                {v.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="space-y-3 pt-4 border-t border-slate-800">
                    <label className="block text-xs font-bold text-slate-500 uppercase">Visibility</label>
                    <div className="grid grid-cols-3 gap-2">
                        <button onClick={() => setVisibility('private')} className={`py-2 rounded-lg text-xs font-medium flex flex-col items-center gap-1 border transition-all ${visibility === 'private' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}><Lock size={16} /><span>Private</span></button>
                        <button onClick={() => setVisibility('public')} className={`py-2 rounded-lg text-xs font-medium flex flex-col items-center gap-1 border transition-all ${visibility === 'public' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}><Globe size={16} /><span>Public</span></button>
                    </div>
                </div>
            </div>
          ) : (
            <div className="space-y-6">
                <div className="flex justify-between items-center mb-4">
                    <p className="text-sm text-slate-400">Edit course structure.</p>
                    <button onClick={() => setChapters([...chapters, { id: `ch-${Date.now()}`, title: `Chapter ${chapters.length + 1}`, subTopics: [] }])} className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-xs font-bold rounded-lg border border-slate-700"><Plus size={14} /><span>Add Chapter</span></button>
                </div>
                <div className="space-y-4">
                    {chapters.map((chapter, cIdx) => (
                        <div key={chapter.id} className="bg-slate-800/30 border border-slate-700 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-3">
                                <input type="text" value={chapter.title} onChange={(e) => { const n = [...chapters]; n[cIdx].title = e.target.value; setChapters(n); }} className="flex-1 bg-transparent border-b border-slate-600 text-sm font-bold text-white outline-none"/>
                                <button onClick={() => setChapters(chapters.filter((_, i) => i !== cIdx))} className="text-slate-500 hover:text-red-400"><Trash2 size={16}/></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
          )}
        </div>
        <div className="p-5 border-t border-slate-800 bg-slate-900 shrink-0 flex justify-end gap-3">
             <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400">Cancel</button>
             <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg shadow-lg flex items-center gap-2">
               {isSaving && <Loader2 size={14} className="animate-spin" />}<span>Save</span>
             </button>
        </div>
      </div>
    </div>
  );
};