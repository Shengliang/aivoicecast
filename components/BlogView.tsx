
import React, { useState, useEffect } from 'react';
import { Blog, BlogPost, Comment } from '../types';
import { ensureUserBlog, getCommunityPosts, getUserPosts, createBlogPost, updateBlogPost, deleteBlogPost, updateBlogSettings, addPostComment, getBlogPost } from '../services/firestoreService';
import { auth } from '../services/firebaseConfig';
import { Edit3, Plus, Trash2, Globe, User, MessageSquare, Loader2, ArrowLeft, Save, Image as ImageIcon, Search, LayoutList, PenTool, Rss, X, Pin } from 'lucide-react';
import { MarkdownView } from './MarkdownView';
import { CommentsModal } from './CommentsModal';

interface BlogViewProps {
  currentUser: any;
  onBack?: () => void;
}

export const BlogView: React.FC<BlogViewProps> = ({ currentUser, onBack }) => {
  const [activeTab, setActiveTab] = useState<'feed' | 'my_blog' | 'editor' | 'post_detail'>('feed');
  const [loading, setLoading] = useState(false);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  
  // My Blog State
  const [myBlog, setMyBlog] = useState<Blog | null>(null);
  const [myPosts, setMyPosts] = useState<BlogPost[]>([]);
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [blogTitle, setBlogTitle] = useState('');
  const [blogDesc, setBlogDesc] = useState('');

  // Editor State
  const [editingPost, setEditingPost] = useState<Partial<BlogPost>>({ title: '', content: '', tags: [] });
  const [tagInput, setTagInput] = useState('');

  // Detail View State
  const [activePost, setActivePost] = useState<BlogPost | null>(null);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);

  // Load Feed on Mount
  useEffect(() => {
    if (activeTab === 'feed') {
      loadFeed();
    } else if (activeTab === 'my_blog' && currentUser) {
      loadMyBlog();
    }
  }, [activeTab, currentUser]);

  const loadFeed = async () => {
    setLoading(true);
    try {
      const data = await getCommunityPosts();
      setPosts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadMyBlog = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const blog = await ensureUserBlog(currentUser);
      setMyBlog(blog);
      setBlogTitle(blog.title);
      setBlogDesc(blog.description);
      
      const userPosts = await getUserPosts(blog.id);
      setMyPosts(userPosts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!myBlog) return;
    try {
      await updateBlogSettings(myBlog.id, { title: blogTitle, description: blogDesc });
      setMyBlog({ ...myBlog, title: blogTitle, description: blogDesc });
      setIsEditingSettings(false);
    } catch(e) {
      alert("Failed to save settings");
    }
  };

  const handleCreatePost = () => {
    setEditingPost({ title: '', content: '', tags: [], status: 'draft' });
    setActiveTab('editor');
  };

  const handleEditPost = (post: BlogPost) => {
    setEditingPost(post);
    setActiveTab('editor');
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm("Are you sure you want to delete this post?")) return;
    try {
      await deleteBlogPost(postId);
      setMyPosts(prev => prev.filter(p => p.id !== postId));
    } catch(e) {
      alert("Failed to delete post");
    }
  };

  const handleSavePost = async () => {
    if (!myBlog || !currentUser || !editingPost.title || !editingPost.content) {
        alert("Please fill in title and content.");
        return;
    }
    
    setLoading(true);
    try {
        const postData: any = {
            ...editingPost,
            blogId: myBlog.id,
            authorId: currentUser.uid,
            authorName: currentUser.displayName || 'Anonymous',
            authorImage: currentUser.photoURL || '',
            excerpt: editingPost.content?.substring(0, 150) + '...',
            publishedAt: editingPost.status === 'published' ? Date.now() : undefined,
            createdAt: editingPost.createdAt || Date.now(),
            likes: editingPost.likes || 0,
            commentCount: editingPost.commentCount || 0
        };

        if (editingPost.id) {
            await updateBlogPost(editingPost.id, postData);
        } else {
            await createBlogPost(postData);
        }
        
        setActiveTab('my_blog');
        loadMyBlog(); // Refresh list
    } catch(e) {
        console.error(e);
        alert("Failed to save post.");
    } finally {
        setLoading(false);
    }
  };

  const handleViewPost = (post: BlogPost) => {
      setActivePost(post);
      setActiveTab('post_detail');
  };

  const handleAddComment = async (text: string, attachments: any[]) => {
      if (!activePost || !currentUser) return;
      
      const newComment: Comment = {
          id: crypto.randomUUID(),
          userId: currentUser.uid,
          user: currentUser.displayName || 'Anonymous',
          text,
          timestamp: Date.now(),
          attachments
      };
      
      try {
          await addPostComment(activePost.id, newComment);
          // Optimistic update
          const updatedPost = { 
              ...activePost, 
              comments: [...(activePost.comments || []), newComment],
              commentCount: (activePost.commentCount || 0) + 1
          };
          setActivePost(updatedPost);
          
          // Also update in lists
          setPosts(prev => prev.map(p => p.id === activePost.id ? updatedPost : p));
          setMyPosts(prev => prev.map(p => p.id === activePost.id ? updatedPost : p));
          
      } catch(e) {
          alert("Failed to post comment.");
      }
  };

  // --- RENDERERS ---

  const renderPostCard = (post: BlogPost, isOwner = false) => {
      const isPinned = post.id === 'arch-deep-dive-v1';
      
      return (
      <div key={post.id} className={`bg-slate-900 border ${isPinned ? 'border-indigo-500 shadow-lg shadow-indigo-500/10' : 'border-slate-800'} rounded-xl p-5 hover:border-indigo-500/30 transition-all flex flex-col gap-3 group relative`}>
          {isPinned && (
              <div className="absolute top-0 right-0 p-2">
                  <span className="bg-indigo-600 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded flex items-center gap-1 shadow-md">
                      <Pin size={10} fill="currentColor" /> Pinned
                  </span>
              </div>
          )}
          
          <div className="flex justify-between items-start">
              <div>
                  <h3 onClick={() => handleViewPost(post)} className={`text-lg font-bold hover:text-indigo-400 cursor-pointer transition-colors line-clamp-1 ${isPinned ? 'text-indigo-100' : 'text-white'}`}>{post.title}</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                      <span>By {post.authorName}</span>
                      <span>•</span>
                      <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                      {post.status === 'draft' && <span className="bg-amber-900/30 text-amber-400 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold">Draft</span>}
                  </div>
              </div>
              {isOwner && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEditPost(post)} className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white"><Edit3 size={14}/></button>
                      <button onClick={() => handleDeletePost(post.id)} className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400"><Trash2 size={14}/></button>
                  </div>
              )}
          </div>
          
          <p className="text-sm text-slate-400 line-clamp-2">{post.excerpt}</p>
          
          <div className="flex items-center justify-between mt-auto pt-2">
              <div className="flex gap-2">
                  {post.tags?.map(t => <span key={t} className="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-400 border border-slate-700">#{t}</span>)}
              </div>
              <button onClick={() => handleViewPost(post)} className="flex items-center gap-1 text-xs text-indigo-400 font-bold hover:text-white transition-colors">
                  Read More
              </button>
          </div>
      </div>
      );
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100">
        
        {/* Header Navigation */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900 sticky top-0 z-10">
            <div className="flex items-center gap-4">
                {activeTab !== 'feed' && activeTab !== 'my_blog' && (
                    <button onClick={() => setActiveTab('feed')} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white">
                        <ArrowLeft size={20} />
                    </button>
                )}
                <h1 className="text-xl font-bold flex items-center gap-2">
                    <Rss className="text-indigo-400"/>
                    <span>{activeTab === 'my_blog' ? 'My Blog' : activeTab === 'editor' ? 'Editor' : 'Community Blog'}</span>
                </h1>
            </div>
            
            <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                <button onClick={() => setActiveTab('feed')} className={`px-4 py-2 text-sm font-bold rounded transition-colors ${activeTab === 'feed' || activeTab === 'post_detail' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                    Feed
                </button>
                <button onClick={() => currentUser ? setActiveTab('my_blog') : alert("Sign in to view your blog")} className={`px-4 py-2 text-sm font-bold rounded transition-colors ${activeTab === 'my_blog' || activeTab === 'editor' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                    My Blog
                </button>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto w-full">
            
            {activeTab === 'feed' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2"><Globe size={18} className="text-emerald-400"/> Latest Posts</h2>
                        <div className="relative">
                            <input type="text" placeholder="Search topics..." className="bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-4 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500 w-64"/>
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"/>
                        </div>
                    </div>
                    
                    {loading ? (
                        <div className="py-12 text-center"><Loader2 className="animate-spin mx-auto text-indigo-400" size={32}/></div>
                    ) : posts.length === 0 ? (
                        <div className="py-12 text-center text-slate-500 italic">No posts yet. Be the first to write one!</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {posts.map(post => renderPostCard(post, currentUser && post.authorId === currentUser.uid))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'my_blog' && (
                <div className="space-y-8 animate-fade-in">
                    {/* Blog Header / Settings */}
                    <div className="bg-gradient-to-r from-indigo-900/30 to-purple-900/30 border border-indigo-500/30 rounded-xl p-6">
                        <div className="flex justify-between items-start">
                            {isEditingSettings ? (
                                <div className="space-y-3 w-full">
                                    <input 
                                        type="text" 
                                        value={blogTitle} 
                                        onChange={e => setBlogTitle(e.target.value)} 
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white font-bold"
                                        placeholder="Blog Title"
                                    />
                                    <textarea 
                                        value={blogDesc} 
                                        onChange={e => setBlogDesc(e.target.value)} 
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white resize-none"
                                        placeholder="Blog Description"
                                        rows={2}
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={handleSaveSettings} className="px-4 py-1.5 bg-indigo-600 text-white rounded text-xs font-bold">Save</button>
                                        <button onClick={() => setIsEditingSettings(false)} className="px-4 py-1.5 bg-slate-800 text-slate-300 rounded text-xs font-bold">Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <h2 className="text-2xl font-bold text-white">{myBlog?.title}</h2>
                                    <p className="text-slate-400 mt-1">{myBlog?.description}</p>
                                </div>
                            )}
                            
                            {!isEditingSettings && (
                                <button onClick={() => setIsEditingSettings(true)} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white">
                                    <Edit3 size={16}/>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2"><LayoutList size={18}/> My Posts</h3>
                        <button onClick={handleCreatePost} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-sm shadow-lg transition-transform hover:scale-105">
                            <Plus size={16}/> New Post
                        </button>
                    </div>

                    {/* Posts Grid */}
                    {loading ? (
                        <div className="py-12 text-center"><Loader2 className="animate-spin mx-auto text-indigo-400" size={32}/></div>
                    ) : myPosts.length === 0 ? (
                        <div className="py-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
                            You haven't written anything yet. Click "New Post" to start your journey.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {myPosts.map(post => renderPostCard(post, true))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'editor' && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6 shadow-xl animate-fade-in-up h-full flex flex-col">
                    <div className="space-y-4">
                        <input 
                            type="text" 
                            value={editingPost.title} 
                            onChange={e => setEditingPost({...editingPost, title: e.target.value})}
                            className="w-full bg-transparent text-3xl font-bold text-white placeholder-slate-600 outline-none border-b border-slate-800 pb-2 focus:border-indigo-500 transition-colors"
                            placeholder="Enter Title..."
                        />
                        
                        <div className="flex items-center gap-4">
                            <select 
                                value={editingPost.status} 
                                onChange={e => setEditingPost({...editingPost, status: e.target.value as any})}
                                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white outline-none"
                            >
                                <option value="draft">Draft</option>
                                <option value="published">Published</option>
                            </select>
                            
                            <div className="flex items-center gap-2 flex-1">
                                <input 
                                    type="text" 
                                    value={tagInput}
                                    onChange={e => setTagInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && tagInput.trim()) {
                                            setEditingPost(prev => ({ ...prev, tags: [...(prev.tags || []), tagInput.trim()] }));
                                            setTagInput('');
                                        }
                                    }}
                                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white outline-none w-full"
                                    placeholder="Add tags (Enter to add)"
                                />
                            </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                            {editingPost.tags?.map((t, i) => (
                                <span key={i} className="text-xs bg-indigo-900/30 text-indigo-300 px-2 py-1 rounded flex items-center gap-1 border border-indigo-500/30">
                                    #{t} <button onClick={() => setEditingPost(prev => ({...prev, tags: prev.tags?.filter((_, idx) => idx !== i)}))}><X size={10}/></button>
                                </span>
                            ))}
                        </div>
                    </div>

                    <textarea 
                        value={editingPost.content}
                        onChange={e => setEditingPost({...editingPost, content: e.target.value})}
                        className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-300 font-mono text-sm leading-relaxed outline-none focus:border-indigo-500 resize-none"
                        placeholder="Write your story in Markdown..."
                    />

                    <div className="flex justify-end pt-2">
                        <button 
                            onClick={handleSavePost}
                            disabled={loading}
                            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg transition-transform hover:scale-105 disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
                            <span>{editingPost.id ? "Update Post" : "Publish Post"}</span>
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'post_detail' && activePost && (
                <div className="space-y-8 animate-fade-in">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl">
                        <div className="border-b border-slate-800 pb-6 mb-6">
                            <h1 className="text-4xl font-bold text-white mb-4">{activePost.title}</h1>
                            <div className="flex items-center justify-between text-sm text-slate-400">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-indigo-900/50 flex items-center justify-center text-indigo-300 font-bold border border-indigo-500/30">
                                            {activePost.authorName.charAt(0)}
                                        </div>
                                        <span>{activePost.authorName}</span>
                                    </div>
                                    <span>{new Date(activePost.createdAt).toLocaleDateString()}</span>
                                </div>
                                <div className="flex gap-2">
                                    {activePost.tags.map(t => <span key={t} className="bg-slate-800 px-2 py-1 rounded text-xs">#{t}</span>)}
                                </div>
                            </div>
                        </div>
                        
                        <div className="prose prose-invert prose-lg max-w-none">
                            <MarkdownView content={activePost.content} />
                        </div>
                        
                        <div className="mt-12 pt-6 border-t border-slate-800 flex items-center justify-between">
                            <button className="flex items-center gap-2 text-slate-400 hover:text-indigo-400 transition-colors">
                                <MessageSquare size={20}/>
                                <span>{activePost.comments?.length || 0} Comments</span>
                            </button>
                            {currentUser && (
                                <button 
                                    onClick={() => setIsCommentsOpen(true)}
                                    className="px-4 py-2 bg-slate-800 hover:bg-indigo-600 text-white rounded-lg text-sm font-bold transition-colors"
                                >
                                    Write a Comment
                                </button>
                            )}
                        </div>
                    </div>
                    
                    {/* Inline Comments Section could go here, but using Modal for consistency with rest of app */}
                    {isCommentsOpen && (
                        <CommentsModal 
                            isOpen={true}
                            onClose={() => setIsCommentsOpen(false)}
                            channel={{ ...activePost, comments: activePost.comments || [] } as any} // duck type adapter
                            onAddComment={handleAddComment}
                            currentUser={currentUser}
                        />
                    )}
                </div>
            )}

        </div>
    </div>
  );
};
