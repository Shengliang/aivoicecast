import React, { useState, useRef } from 'react';
import { ArrowLeft, Briefcase, Upload, Loader2, CheckCircle, Heart, Users, FileText, X, Rocket, Shield } from 'lucide-react';
import { auth } from '../services/firebaseConfig';
import { submitCareerApplication, uploadResumeToStorage } from '../services/firestoreService';
import { CareerApplication } from '../types';

interface CareerCenterProps {
  onBack: () => void;
  currentUser: any;
}

export const CareerCenter: React.FC<CareerCenterProps> = ({ onBack, currentUser }) => {
  const [activeTab, setActiveTab] = useState<'mentor' | 'expert'>('mentor');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [bio, setBio] = useState('');
  const [expertise, setExpertise] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      
      // Validation: PDF Only
      if (file.type !== 'application/pdf') {
        alert("Only PDF files are allowed.");
        return;
      }
      
      // Validation: Size < 300KB
      if (file.size > 300 * 1024) {
        alert("File size must be less than 300KB.");
        return;
      }
      
      setResumeFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return alert("Please sign in to apply.");
    if (!resumeFile) return alert("Please upload your resume.");
    
    setIsLoading(true);
    setError(null);

    try {
      // 1. Upload Resume
      const resumeUrl = await uploadResumeToStorage(currentUser.uid, resumeFile);
      
      // 2. Submit Application
      const application: CareerApplication = {
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Anonymous',
        userEmail: currentUser.email,
        role: activeTab,
        expertise: expertise.split(',').map(s => s.trim()).filter(Boolean),
        bio,
        resumeUrl,
        status: 'pending',
        createdAt: Date.now()
      };

      await submitCareerApplication(application);
      setIsSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError("Application failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-slate-900 flex items-center gap-4 sticky top-0 bg-slate-950/90 backdrop-blur-md z-20">
        <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold tracking-widest uppercase text-slate-400">Career & Mentorship</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-12 space-y-16">
          
          {/* Hero Section */}
          <section className="text-center space-y-6 animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-900/30 border border-emerald-500/30 text-emerald-300 text-sm font-bold uppercase tracking-wider mb-4">
              <Users size={16} /> Community First
            </div>
            <h2 className="text-4xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 via-white to-slate-400 leading-tight">
              Grow. Share. Live.
            </h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
              We are evolving from a tool into an <span className="text-white font-bold">AI-Human Community</span>. 
              Our goal is to empower humanity in the AI era by connecting experts, mentors, and learners.
            </p>
          </section>

          {/* Value Props */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
                <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center mb-4"><Briefcase size={24}/></div>
                <h3 className="font-bold text-white text-lg">Career Growth</h3>
                <p className="text-sm text-slate-400 mt-2">Connect with domain experts who can guide your next career move.</p>
             </div>
             <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center mb-4"><Heart size={24}/></div>
                <h3 className="font-bold text-white text-lg">Give Back</h3>
                <p className="text-sm text-slate-400 mt-2">Share your knowledge. Mentoring strengthens your own understanding.</p>
             </div>
             <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
                <div className="w-12 h-12 bg-pink-500/20 text-pink-400 rounded-xl flex items-center justify-center mb-4"><Rocket size={24}/></div>
                <h3 className="font-bold text-white text-lg">Human Connection</h3>
                <p className="text-sm text-slate-400 mt-2">In an AI world, human empathy and lived experience are more valuable than ever.</p>
             </div>
          </div>

          {/* Application Form */}
          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
             {/* Decor */}
             <div className="absolute top-0 right-0 p-32 bg-emerald-600/5 blur-[100px] rounded-full pointer-events-none"></div>

             <div className="relative z-10">
                <div className="text-center mb-8">
                   <h3 className="text-2xl font-bold text-white">Join the Network</h3>
                   <p className="text-slate-400">Apply to become a Mentor or Domain Expert.</p>
                </div>

                {isSuccess ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-4 animate-fade-in">
                        <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center">
                            <CheckCircle size={40} />
                        </div>
                        <h4 className="text-2xl font-bold text-white">Application Received!</h4>
                        <p className="text-slate-400 text-center max-w-md">Thank you for stepping up to help the community. Our team will review your profile and resume shortly.</p>
                        <button onClick={() => setIsSuccess(false)} className="mt-4 px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg">Submit Another</button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="max-w-xl mx-auto space-y-6">
                        
                        {/* Role Selection */}
                        <div className="flex p-1 bg-slate-950 rounded-xl border border-slate-800">
                            <button type="button" onClick={() => setActiveTab('mentor')} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'mentor' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
                                Become a Mentor
                            </button>
                            <button type="button" onClick={() => setActiveTab('expert')} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'expert' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
                                Domain Expert
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Your Expertise (Comma Separated)</label>
                                <input 
                                    required
                                    type="text" 
                                    value={expertise}
                                    onChange={e => setExpertise(e.target.value)}
                                    placeholder="e.g. React, System Design, Career Coaching, Mental Health"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Short Bio & Motivation</label>
                                <textarea 
                                    required
                                    value={bio}
                                    onChange={e => setBio(e.target.value)}
                                    placeholder="Why do you want to join? How can you help others grow?"
                                    rows={4}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                                />
                            </div>

                            {/* Resume Upload */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Resume / CV (PDF Only, &lt;300KB)</label>
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all ${resumeFile ? 'border-emerald-500 bg-emerald-900/10' : 'border-slate-700 hover:border-indigo-500 hover:bg-slate-800/50'}`}
                                >
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        className="hidden" 
                                        accept="application/pdf"
                                        onChange={handleFileChange}
                                    />
                                    {resumeFile ? (
                                        <div className="text-center">
                                            <FileText size={32} className="mx-auto text-emerald-400 mb-2"/>
                                            <p className="text-sm font-bold text-white">{resumeFile.name}</p>
                                            <p className="text-xs text-emerald-400 mt-1">Ready to upload</p>
                                            <button 
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setResumeFile(null); }}
                                                className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="text-center text-slate-400">
                                            <Upload size={32} className="mx-auto mb-2 opacity-50"/>
                                            <p className="text-sm font-bold">Click to Upload Resume</p>
                                            <p className="text-xs mt-1 opacity-50">PDF format only. Max 300KB.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-900/20 text-red-300 p-3 rounded-lg text-sm text-center border border-red-900/50">
                                {error}
                            </div>
                        )}

                        <button 
                            type="submit"
                            disabled={isLoading || !resumeFile}
                            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]"
                        >
                            {isLoading ? <Loader2 className="animate-spin"/> : <Shield size={18}/>}
                            <span>Submit Application</span>
                        </button>
                        
                        <p className="text-center text-xs text-slate-500 mt-4">
                            By submitting, you agree to our community guidelines. Mentors are vetted to ensure safety and quality.
                        </p>
                    </form>
                )}
             </div>
          </section>

        </div>
      </div>
    </div>
  );
};