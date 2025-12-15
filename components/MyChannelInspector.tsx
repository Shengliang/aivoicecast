
import React, { useState, useEffect } from 'react';
import { getUserChannels, deleteUserChannel, saveUserChannel } from '../utils/db';
import { Channel } from '../types';
import { ArrowLeft, RefreshCw, Trash2, HardDrive, Edit, Calendar } from 'lucide-react';

interface MyChannelInspectorProps {
  onBack: () => void;
}

export const MyChannelInspector: React.FC<MyChannelInspectorProps> = ({ onBack }) => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getUserChannels();
      // Sort by created time descending
      data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setChannels(data);
    } catch (e: any) {
      console.error(e);
      alert(`Failed to load local channels: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete local channel "${title}"? This cannot be undone.`)) return;
    try {
      await deleteUserChannel(id);
      await loadData();
    } catch (e) {
      alert("Failed to delete channel.");
    }
  };

  const handleEditDate = async (channel: Channel) => {
      // Create a default string in local time for the input
      const current = channel.createdAt ? new Date(channel.createdAt) : new Date();
      // Format YYYY-MM-DDTHH:mm for datetime-local input, roughly
      const pad = (n: number) => n < 10 ? '0' + n : n;
      const defaultVal = `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}T${pad(current.getHours())}:${pad(current.getMinutes())}`;
      
      const newVal = prompt("Enter Creation Date (YYYY-MM-DDTHH:mm):", defaultVal);
      if (newVal) {
          const timestamp = new Date(newVal).getTime();
          if (isNaN(timestamp)) {
              alert("Invalid date format.");
              return;
          }
          
          const updatedChannel = { ...channel, createdAt: timestamp };
          try {
              await saveUserChannel(updatedChannel);
              setChannels(prev => prev.map(c => c.id === channel.id ? updatedChannel : c).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
          } catch(e) {
              alert("Failed to update date.");
          }
      }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between">
           <div className="flex items-center space-x-4">
             <button onClick={onBack} className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700">
                <ArrowLeft size={20} />
             </button>
             <div>
                <h1 className="text-2xl font-bold flex items-center space-x-2">
                  <HardDrive className="text-purple-400" />
                  <span>My Channel Inspector</span>
                </h1>
                <p className="text-xs text-slate-500 mt-1">Live View of IndexedDB 'user_channels' (Local Storage)</p>
             </div>
           </div>
           <button onClick={loadData} className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 rounded-lg hover:bg-indigo-500">
             <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
             <span>Refresh</span>
           </button>
        </div>

        {/* Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
           <div className="overflow-x-auto">
             <table className="w-full text-left text-sm text-slate-400">
               <thead className="bg-slate-950 text-slate-200 uppercase text-xs font-bold">
                 <tr>
                   <th className="px-6 py-4">Title</th>
                   <th className="px-6 py-4">Visibility</th>
                   <th className="px-6 py-4">Created At</th>
                   <th className="px-6 py-4">ID</th>
                   <th className="px-6 py-4 text-right">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-800">
                 {channels.map((ch) => (
                   <tr key={ch.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4">
                         <div className="flex items-center space-x-3">
                            <img src={ch.imageUrl} alt="" className="w-8 h-8 rounded object-cover bg-slate-800"/>
                            <div className="flex flex-col">
                                <span className="font-bold text-white">{ch.title}</span>
                                <span className="text-xs text-slate-500">{ch.author}</span>
                            </div>
                         </div>
                      </td>
                      <td className="px-6 py-4">
                         <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border ${
                             ch.visibility === 'public' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-900' :
                             ch.visibility === 'group' ? 'bg-purple-900/30 text-purple-400 border-purple-900' :
                             'bg-slate-800 text-slate-400 border-slate-700'
                         }`}>
                             {ch.visibility || 'private'}
                         </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">
                         <div className="flex items-center gap-2">
                             <span className={!ch.createdAt ? "text-red-400 font-bold" : ""}>
                                 {ch.createdAt ? new Date(ch.createdAt).toLocaleString() : 'N/A'}
                             </span>
                             <button 
                                onClick={() => handleEditDate(ch)}
                                className="p-1 text-indigo-400 hover:text-white hover:bg-slate-700 rounded"
                                title="Edit Date"
                             >
                                 <Edit size={12} />
                             </button>
                         </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs truncate max-w-[100px]" title={ch.id}>
                         {ch.id}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                            onClick={() => handleDelete(ch.id, ch.title)}
                            className="text-slate-500 hover:text-red-400 transition-colors p-2 hover:bg-slate-800 rounded-full"
                            title="Delete Local Channel"
                        >
                            <Trash2 size={16} />
                        </button>
                      </td>
                   </tr>
                 ))}
                 {channels.length === 0 && (
                   <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-600 italic">
                         No local user channels found.
                      </td>
                   </tr>
                 )}
               </tbody>
             </table>
           </div>
        </div>
      </div>
    </div>
  );
};
