import React, { useState, useEffect, useRef } from 'react';
import { ChatChannel, RealTimeMessage, Group, UserProfile } from '../types';
import { sendMessage, subscribeToMessages, getUserGroups, getAllUsers, createOrGetDMChannel, getUserDMChannels, getUniqueGroupMembers, deleteMessage } from '../services/firestoreService';
import { auth } from '../services/firebaseConfig';
import { Send, Hash, Lock, User, Plus, Search, MessageSquare, MoreVertical, Paperclip, Loader2, ArrowLeft, Menu, Users, Briefcase, Reply, Trash2, X } from 'lucide-react';

interface WorkplaceChatProps {
  onBack: () => void;
  currentUser: any;
}

export const WorkplaceChat: React.FC<WorkplaceChatProps> = ({ onBack, currentUser }) => {
  const [activeChannelId, setActiveChannelId] = useState<string>('general');
  const [activeChannelType, setActiveChannelType] = useState<'public' | 'group' | 'dm'>('public');
  const [activeChannelName, setActiveChannelName] = useState<string>('General');
  
  const [messages, setMessages] = useState<RealTimeMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  
  const [groups, setGroups] = useState<Group[]>([]);
  const [dms, setDms] = useState<ChatChannel[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [coworkers, setCoworkers] = useState<UserProfile[]>([]);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  
  const [replyingTo, setReplyingTo] = useState<RealTimeMessage | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load initial sidebar data
    if (currentUser) {
      getUserGroups(currentUser.uid).then(setGroups);
      getUserDMChannels().then(setDms);
      getAllUsers().then(users => setAllUsers(users.filter(u => u.uid !== currentUser.uid)));
      getUniqueGroupMembers(currentUser.uid).then(setCoworkers);
    }
  }, [currentUser]);

  useEffect(() => {
    // Determine collection path based on channel type
    let collectionPath;
    if (activeChannelType === 'group') {
        collectionPath = `groups/${activeChannelId}/messages`;
    } else {
        collectionPath = `chat_channels/${activeChannelId}/messages`;
    }

    const unsubscribe = subscribeToMessages(activeChannelId, (msgs) => {
        setMessages(msgs);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }, collectionPath);

    return () => unsubscribe();
  }, [activeChannelId, activeChannelType]);

  // Reset reply state when changing channels
  useEffect(() => {
      setReplyingTo(null);
  }, [activeChannelId]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim()) return;

    let collectionPath;
    if (activeChannelType === 'group') {
        collectionPath = `groups/${activeChannelId}/messages`;
    } else {
        collectionPath = `chat_channels/${activeChannelId}/messages`;
    }

    try {
        let replyData = undefined;
        if (replyingTo) {
            replyData = {
                id: replyingTo.id,
                text: replyingTo.text,
                senderName: replyingTo.senderName
            };
        }

        await sendMessage(activeChannelId, newMessage, collectionPath, replyData);
        setNewMessage('');
        setReplyingTo(null);
    } catch (error) {
        console.error("Send failed", error);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
      if (!confirm("Delete this message?")) return;
      
      let collectionPath;
      if (activeChannelType === 'group') {
          collectionPath = `groups/${activeChannelId}/messages`;
      } else {
          collectionPath = `chat_channels/${activeChannelId}/messages`;
      }

      try {
          await deleteMessage(activeChannelId, msgId, collectionPath);
      } catch (error) {
          console.error("Delete failed", error);
          alert("Failed to delete message.");
      }
  };

  const handleStartDM = async (otherUserId: string, otherUserName: string) => {
      try {
          const channelId = await createOrGetDMChannel(otherUserId);
          // Refresh DM list
          const updatedDMs = await getUserDMChannels();
          setDms(updatedDMs);
          
          setActiveChannelId(channelId);
          setActiveChannelName(otherUserName);
          setActiveChannelType('dm');
          setIsSearchingUsers(false);
          if (window.innerWidth < 768) setIsSidebarOpen(false);
      } catch (error) {
          console.error("DM creation failed", error);
      }
  };

  const filteredUsers = allUsers.filter(u => 
      u.displayName.toLowerCase().includes(userSearchQuery.toLowerCase()) || 
      u.email.toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      
      {/* Sidebar */}
      <div className={`${isSidebarOpen ? 'w-64' : 'w-0'} bg-slate-900 border-r border-slate-800 flex-shrink-0 transition-all duration-300 flex flex-col overflow-hidden`}>
          <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
              <h2 className="font-bold text-lg text-white flex items-center gap-2">
                  <MessageSquare className="text-indigo-400" size={20} />
                  Workspace
              </h2>
              <button onClick={onBack} className="p-1 hover:bg-slate-800 rounded text-slate-400">
                  <ArrowLeft size={18} />
              </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-6">
              
              {/* Public Channels */}
              <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-2">Channels</h3>
                  <div className="space-y-0.5">
                      <button 
                          onClick={() => { setActiveChannelId('general'); setActiveChannelType('public'); setActiveChannelName('General'); if(window.innerWidth < 768) setIsSidebarOpen(false); }}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm ${activeChannelId === 'general' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                      >
                          <Hash size={16} /> general
                      </button>
                      <button 
                          onClick={() => { setActiveChannelId('announcements'); setActiveChannelType('public'); setActiveChannelName('Announcements'); if(window.innerWidth < 768) setIsSidebarOpen(false); }}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm ${activeChannelId === 'announcements' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                      >
                          <Hash size={16} /> announcements
                      </button>
                  </div>
              </div>

              {/* Teams (Groups) */}
              <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-2 flex justify-between items-center">
                      Teams
                  </h3>
                  <div className="space-y-0.5">
                      {groups.length === 0 && <p className="text-xs text-slate-600 px-2 italic">No groups joined</p>}
                      {groups.map(group => (
                          <button 
                              key={group.id}
                              onClick={() => { setActiveChannelId(group.id); setActiveChannelType('group'); setActiveChannelName(group.name); if(window.innerWidth < 768) setIsSidebarOpen(false); }}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm ${activeChannelId === group.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                          >
                              <Lock size={14} /> {group.name}
                          </button>
                      ))}
                  </div>
              </div>

              {/* Coworkers / Group Members */}
              {coworkers.length > 0 && (
                  <div>
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-2 flex justify-between items-center">
                          Team Members
                      </h3>
                      <div className="space-y-0.5">
                          {coworkers.map(member => (
                              <button 
                                  key={member.uid}
                                  onClick={() => handleStartDM(member.uid, member.displayName)}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-slate-400 hover:bg-slate-800 hover:text-white group"
                              >
                                  <div className={`w-2 h-2 rounded-full ${member.lastLogin ? 'bg-emerald-500' : 'bg-slate-600'}`}></div>
                                  <span className="truncate">{member.displayName}</span>
                              </button>
                          ))}
                      </div>
                  </div>
              )}

              {/* Direct Messages */}
              <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-2 flex justify-between items-center">
                      Direct Messages
                      <button onClick={() => setIsSearchingUsers(!isSearchingUsers)} className="hover:text-white"><Plus size={14}/></button>
                  </h3>
                  
                  {isSearchingUsers && (
                      <div className="mb-2 px-2">
                          <div className="relative">
                              <input 
                                  autoFocus
                                  type="text" 
                                  placeholder="Find user..." 
                                  value={userSearchQuery}
                                  onChange={e => setUserSearchQuery(e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none"
                              />
                              <div className="absolute top-full left-0 w-full bg-slate-800 border border-slate-700 rounded mt-1 max-h-40 overflow-y-auto z-20">
                                  {filteredUsers.map(u => (
                                      <button 
                                          key={u.uid} 
                                          onClick={() => handleStartDM(u.uid, u.displayName)}
                                          className="w-full text-left px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white flex items-center gap-2"
                                      >
                                          <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center text-[8px] font-bold">{u.displayName[0]}</div>
                                          {u.displayName}
                                      </button>
                                  ))}
                              </div>
                          </div>
                      </div>
                  )}

                  <div className="space-y-0.5">
                      {dms.map(dm => (
                          <button 
                              key={dm.id}
                              onClick={() => { setActiveChannelId(dm.id); setActiveChannelType('dm'); setActiveChannelName(dm.name.replace(currentUser?.displayName || '', '').replace('&', '').trim() || 'DM'); if(window.innerWidth < 768) setIsSidebarOpen(false); }}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm ${activeChannelId === dm.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                          >
                              <User size={14} />
                              <span className="truncate">{dm.name.replace(currentUser?.displayName || '', '').replace('&', '').trim() || 'Chat'}</span>
                          </button>
                      ))}
                  </div>
              </div>
          </div>
          
          {/* User Profile Footer */}
          {currentUser && (
              <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold">
                      {currentUser.photoURL ? <img src={currentUser.photoURL} className="w-full h-full rounded-full"/> : currentUser.displayName?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{currentUser.displayName}</p>
                      <p className="text-xs text-slate-500 truncate">Online</p>
                  </div>
              </div>
          )}
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
          
          {/* Channel Header */}
          <div className="h-14 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900/50">
              <div className="flex items-center gap-3">
                  <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-400 hover:text-white md:hidden">
                      <Menu size={20} />
                  </button>
                  <h3 className="font-bold text-white flex items-center gap-2">
                      {activeChannelType === 'public' && <Hash size={18} className="text-slate-400"/>}
                      {activeChannelType === 'group' && <Lock size={18} className="text-slate-400"/>}
                      {activeChannelType === 'dm' && <User size={18} className="text-slate-400"/>}
                      {activeChannelName}
                  </h3>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                  <Search size={18} className="hover:text-white cursor-pointer"/>
                  <MoreVertical size={18} className="hover:text-white cursor-pointer"/>
              </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500">
                      <MessageSquare size={48} className="mb-4 opacity-20"/>
                      <p>No messages yet. Start the conversation!</p>
                  </div>
              ) : (
                  messages.map((msg, i) => {
                      const isMe = msg.senderId === currentUser?.uid;
                      const showHeader = i === 0 || messages[i-1].senderId !== msg.senderId || (msg.timestamp?.toMillis() - messages[i-1].timestamp?.toMillis() > 300000);
                      
                      return (
                          <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group mb-2 relative`}>
                              
                              {/* Actions (Reply, Delete) */}
                              <div className={`absolute top-0 ${isMe ? 'left-0 -translate-x-full pr-2' : 'right-0 translate-x-full pl-2'} opacity-0 group-hover:opacity-100 flex items-center gap-1 h-full transition-opacity`}>
                                <button onClick={() => setReplyingTo(msg)} className="p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white border border-slate-700 hover:bg-slate-700" title="Reply">
                                    <Reply size={12}/>
                                </button>
                                {isMe && (
                                    <button onClick={() => handleDeleteMessage(msg.id)} className="p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-red-400 border border-slate-700 hover:bg-slate-700" title="Delete">
                                        <Trash2 size={12}/>
                                    </button>
                                )}
                              </div>

                              <div className={`flex flex-col max-w-[80%] ${isMe ? 'items-end' : 'items-start'}`}>
                                  {showHeader && (
                                      <div className="flex items-baseline gap-2 mb-1">
                                          {!isMe && <span className="text-xs font-bold text-slate-300">{msg.senderName}</span>}
                                          <span className="text-[10px] text-slate-500">
                                              {msg.timestamp?.toMillis ? new Date(msg.timestamp.toMillis()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                                          </span>
                                      </div>
                                  )}
                                  
                                  <div className={`px-4 py-2 rounded-2xl text-sm leading-relaxed relative ${isMe ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-200 rounded-tl-sm'}`}>
                                      {/* Reply Quote Block */}
                                      {msg.replyTo && (
                                          <div className="mb-2 pl-2 border-l-2 border-white/30 text-xs opacity-70 bg-black/10 p-1 rounded-r">
                                              <p className="font-bold mb-0.5">{msg.replyTo.senderName}</p>
                                              <p className="truncate line-clamp-1">{msg.replyTo.text}</p>
                                          </div>
                                      )}
                                      {msg.text}
                                  </div>
                              </div>
                          </div>
                      );
                  })
              )}
              <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-slate-900 border-t border-slate-800">
              
              {/* Reply Banner */}
              {replyingTo && (
                  <div className="flex justify-between items-center bg-slate-800 p-2 rounded-t-lg border-x border-t border-slate-700 text-xs mb-2">
                      <div className="flex items-center gap-2 overflow-hidden">
                          <Reply size={14} className="text-indigo-400 shrink-0" />
                          <div className="truncate">
                              <span className="font-bold text-indigo-300">Replying to {replyingTo.senderName}: </span>
                              <span className="text-slate-400">{replyingTo.text}</span>
                          </div>
                      </div>
                      <button onClick={() => setReplyingTo(null)} className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700">
                          <X size={14} />
                      </button>
                  </div>
              )}

              <form onSubmit={handleSendMessage} className="bg-slate-800 border border-slate-700 rounded-xl flex items-center p-2 gap-2 relative z-10">
                  <button type="button" className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
                      <Plus size={20} />
                  </button>
                  <input 
                      type="text" 
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      placeholder={`Message #${activeChannelName}`}
                      className="flex-1 bg-transparent text-white outline-none placeholder-slate-500"
                  />
                  <button type="submit" disabled={!newMessage.trim()} className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                      <Send size={18} />
                  </button>
              </form>
          </div>

      </div>
    </div>
  );
};