
import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Briefcase, Upload, Loader2, CheckCircle, Heart, Users, FileText, X, Rocket, Shield, Search, Plus, MapPin, Building, Globe, ExternalLink, RefreshCw, User } from 'lucide-react';
import { auth } from '../services/firebaseConfig';
import { submitCareerApplication, uploadResumeToStorage, createJobPosting, getJobPostings, getAllCareerApplications } from '../services/firestoreService';
import { CareerApplication, JobPosting } from '../types';

interface CareerCenterProps {
  onBack: () => void;
  currentUser: any;
}

export const CareerCenter: React.FC<CareerCenterProps> = ({ onBack, currentUser }) => {
  const [activeTab, setActiveTab] = useState<'jobs' | 'talent' | 'mentor' | 'expert'>('jobs');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lists
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [applications, setApplications] = useState<CareerApplication[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Forms
  const [showPostJob, setShowPostJob] = useState(false);
  const [newJob, setNewJob] = useState<Partial<JobPosting>>({ type: 'full-time' });

  const [bio, setBio] = useState('');
  const [expertise, setExpertise] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      if (activeTab === 'jobs') loadJobs();
      if (activeTab === 'talent') loadTalent();
  }, [activeTab]);

  const loadJobs = async () => {
      setIsLoading(true);
      try {
          const data = await getJobPostings();
          setJobs(data);
      } catch (e) { console.error(e); } finally { setIsLoading(false); }
  };

  const loadTalent = async () => {
      setIsLoading(true);
      try {
          const data = await getAllCareerApplications();
          setApplications(data);
      } catch (e) { console.error(e); } finally { setIsLoading(false); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.type !== 'application/pdf') return alert("Only PDF files are allowed.");
      if (file.size > 300 * 1024) return alert("File size must be less than 300KB.");
      setResumeFile(file);
    }
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return alert("Please sign in to apply.");
    if (!resumeFile) return alert("Please upload your resume.");
    setIsLoading(true); setError(null);

    try {
      const resumeUrl = await uploadResumeToStorage(currentUser.uid, resumeFile);
      const application: CareerApplication = {
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Anonymous',
        userEmail: currentUser.email,
        userPhotoURL: currentUser.photoURL,
        role: activeTab as 'mentor' | 'expert',
        expertise: expertise.split(',').map(s => s.trim()).filter(Boolean),
        bio,
        resumeUrl,
        status: 'pending',
        createdAt: Date.now()
      };
      await submitCareerApplication(application);
      setIsSuccess(true);
    } catch (err: any) {
      setError("Application failed: " + (err.message || "Check permissions"));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePostJob = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentUser) return alert("Sign in to post a job.");
      if (!newJob.title || !newJob.company || !newJob.description) return alert("Fill required fields.");
      
      setIsLoading(true);
      try {
          const job: JobPosting = {
              title: newJob.title!,
              company: newJob.company!,
              location: newJob.location || 'Remote',
              type: newJob.type || 'full-time',
              description: newJob.description!,
              requirements: newJob.requirements,
              contactEmail: newJob.contactEmail || currentUser.email,
              postedBy: currentUser.uid,
              postedAt: Date.now()
          };
          await createJobPosting(job);
          setShowPostJob(false);
          setNewJob({ type: 'full-time' });
          loadJobs();
      } catch (e: any) {
          alert("Failed to post job: " + e.message);
      } finally {
          setIsLoading(false);
      }
  };

  const filteredTalent = applications.filter(app => 
      app.userName.toLowerCase().includes(searchQuery.toLowerCase()) || 
      app.expertise.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-900 flex items-center justify-between sticky top-0 bg-slate-950/90 backdrop-blur-md z-20">
        <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
            <ArrowLeft size={20} />
            </button>
            <h1 className="text-lg font-bold tracking-wider uppercase text-slate-400 hidden sm:block">Career Center</h1>
        </div>
        
        <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button onClick={() => setActiveTab('jobs')} className={`px-4 py-2 text-sm font-bold rounded transition-colors ${activeTab === 'jobs' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>Job Board</button>
            <button onClick={() => setActiveTab('talent')} className={`px-4 py-2 text-sm font-bold rounded transition-colors ${activeTab === 'talent' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>Talent Pool</button>
            <button onClick={() => setActiveTab('mentor')} className={`px-4 py-2 text-sm font-bold rounded transition-colors ${activeTab === 'mentor' || activeTab === 'expert' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>Apply</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-6xl mx-auto w-full">
          
          {/* JOBS TAB */}
          {activeTab === 'jobs' && (
              <div className="space-y-6 animate-fade-in">
                  <div className="flex justify-between items-center bg-gradient-to-r from-indigo-900/30 to-purple-900/30 p-6 rounded-xl border border-indigo-500/30">
                      <div>
                          <h2 className="text-2xl font-bold text-white mb-2">Find Your Next Role</h2>
                          <p className="text-slate-400 text-sm">Browse opportunities from the community.</p>
                      </div>
                      <button onClick={() => setShowPostJob(true)} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg shadow-lg transition-transform hover:scale-105">
                          <Plus size={18} /> Post a Job
                      </button>
                  </div>

                  {showPostJob && (
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl animate-fade-in-up">
                          <h3 className="text-lg font-bold text-white mb-4">Post a New Job</h3>
                          <form onSubmit={handlePostJob} className="space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <input type="text" placeholder="Job Title" required value={newJob.title || ''} onChange={e => setNewJob({...newJob, title: e.target.value})} className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-indigo-500"/>
                                  <input type="text" placeholder="Company Name" required value={newJob.company || ''} onChange={e => setNewJob({...newJob, company: e.target.value})} className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-indigo-500"/>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <input type="text" placeholder="Location (e.g. Remote, NYC)" value={newJob.location || ''} onChange={e => setNewJob({...newJob, location: e.target.value})} className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-indigo-500"/>
                                  <select value={newJob.type} onChange={e => setNewJob({...newJob, type: e.target.value as any})} className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-indigo-500">
                                      <option value="full-time">Full Time</option>
                                      <option value="part-time">Part Time</option>
                                      <option value="contract">Contract</option>
                                      <option value="freelance">Freelance</option>
                                  </select>
                              </div>
                              <textarea placeholder="Job Description..." required rows={4} value={newJob.description || ''} onChange={e => setNewJob({...newJob, description: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-indigo-500"/>
                              <div className="flex justify-end gap-3">
                                  <button type="button" onClick={() => setShowPostJob(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:text-white">Cancel</button>
                                  <button type="submit" disabled={isLoading} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 font-bold">{isLoading ? <Loader2 className="animate-spin"/> : "Post Job"}</button>
                              </div>
                          </form>
                      </div>
                  )}

                  <div className="grid grid-cols-1 gap-4">
                      {isLoading && !showPostJob ? (
                          <div className="py-12 text-center"><Loader2 className="animate-spin mx-auto text-indigo-400" size={32}/></div>
                      ) : jobs.length === 0 ? (
                          <div className="py-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">No jobs posted yet.</div>
                      ) : (
                          jobs.map(job => (
                              <div key={job.id} className="bg-slate-900 border border-slate-800 p-5 rounded-xl hover:border-indigo-500/50 transition-all group">
                                  <div className="flex justify-between items-start">
                                      <div>
                                          <h3 className="text-xl font-bold text-white group-hover:text-indigo-400 transition-colors">{job.title}</h3>
                                          <div className="flex items-center gap-3 text-sm text-slate-400 mt-1">
                                              <span className="flex items-center gap-1"><Building size={14}/> {job.company}</span>
                                              <span className="flex items-center gap-1"><MapPin size={14}/> {job.location}</span>
                                              <span className="bg-slate-800 px-2 py-0.5 rounded text-xs font-bold uppercase">{job.type}</span>
                                          </div>
                                      </div>
                                      <a href={`mailto:${job.contactEmail}`} className="px-4 py-2 bg-slate-800 hover:bg-white hover:text-slate-900 text-slate-300 rounded-lg text-sm font-bold transition-colors">Apply</a>
                                  </div>
                                  <p className="mt-4 text-sm text-slate-300 line-clamp-3">{job.description}</p>
                                  <div className="mt-4 text-xs text-slate-500">Posted {new Date(job.postedAt).toLocaleDateString()}</div>
                              </div>
                          ))
                      )}
                  </div>
              </div>
          )}

          {/* TALENT TAB */}
          {activeTab === 'talent' && (
              <div className="space-y-6 animate-fade-in">
                  <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
                      <div>
                          <h2 className="text-lg font-bold text-white">Community Talent Pool</h2>
                          <p className="text-xs text-slate-400">Search profiles and resumes.</p>
                      </div>
                      <div className="relative w-full md:w-96">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16}/>
                          <input type="text" placeholder="Search by name or skill..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-indigo-500"/>
                      </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {isLoading ? (
                          <div className="col-span-full py-12 text-center"><Loader2 className="animate-spin mx-auto text-indigo-400" size={32}/></div>
                      ) : filteredTalent.length === 0 ? (
                          <div className="col-span-full py-12 text-center text-slate-500">No profiles found.</div>
                      ) : (
                          filteredTalent.map(app => (
                              <div key={app.id} className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col gap-4 hover:border-emerald-500/50 transition-all relative overflow-hidden group">
                                  <div className="absolute top-0 right-0 p-16 bg-emerald-500/5 blur-3xl rounded-full group-hover:bg-emerald-500/10 transition-colors"></div>
                                  <div className="relative z-10">
                                      <div className="flex justify-between items-start">
                                          <div className="flex items-center gap-3">
                                              {app.userPhotoURL ? (
                                                  <img src={app.userPhotoURL} alt={app.userName} className="w-12 h-12 rounded-full object-cover border-2 border-slate-700" />
                                              ) : (
                                                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 border-2 border-slate-700">
                                                      <User size={24} />
                                                  </div>
                                              )}
                                              <div>
                                                  <h3 className="font-bold text-white text-lg">{app.userName}</h3>
                                                  <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider mt-1">{app.role}</p>
                                              </div>
                                          </div>
                                          {app.resumeUrl && (
                                              <a href={app.resumeUrl} target="_blank" rel="noopener noreferrer" className="p-2 bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-400 rounded-lg transition-colors" title="View Resume">
                                                  <FileText size={18}/>
                                              </a>
                                          )}
                                      </div>
                                      <p className="text-sm text-slate-400 mt-3 line-clamp-3">{app.bio}</p>
                                      <div className="flex flex-wrap gap-2 mt-4">
                                          {app.expertise.map(skill => (
                                              <span key={skill} className="text-[10px] bg-slate-950 border border-slate-700 px-2 py-1 rounded text-slate-300">#{skill}</span>
                                          ))}
                                      </div>
                                  </div>
                              </div>
                          ))
                      )}
                  </div>
              </div>
          )}

          {/* APPLICATION TAB (Original) */}
          {(activeTab === 'mentor' || activeTab === 'expert') && (
              <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
                  <div className="text-center space-y-4">
                      <h2 className="text-3xl font-bold text-white">Join the Network</h2>
                      <p className="text-slate-400">Apply to become a Mentor or Domain Expert.</p>
                  </div>

                  {isSuccess ? (
                      <div className="bg-emerald-900/20 border border-emerald-900/50 rounded-2xl p-8 text-center">
                          <CheckCircle size={48} className="mx-auto text-emerald-400 mb-4" />
                          <h3 className="text-xl font-bold text-white mb-2">Application Received!</h3>
                          <p className="text-slate-400">Our team will review your profile shortly.</p>
                          <button onClick={() => setIsSuccess(false)} className="mt-6 px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg">Submit Another</button>
                      </div>
                  ) : (
                      <form onSubmit={handleSubmitApplication} className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-6 shadow-xl">
                          <div className="flex p-1 bg-slate-950 rounded-xl border border-slate-800">
                              <button type="button" onClick={() => setActiveTab('mentor')} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'mentor' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>Become a Mentor</button>
                              <button type="button" onClick={() => setActiveTab('expert')} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'expert' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>Domain Expert</button>
                          </div>

                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Your Expertise</label>
                              <input required type="text" value={expertise} onChange={e => setExpertise(e.target.value)} placeholder="e.g. React, System Design, Career Coaching" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"/>
                          </div>

                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Short Bio</label>
                              <textarea required value={bio} onChange={e => setBio(e.target.value)} placeholder="Why do you want to join? How can you help others?" rows={4} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none"/>
                          </div>

                          <div onClick={() => fileInputRef.current?.click()} className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${resumeFile ? 'border-emerald-500 bg-emerald-900/10' : 'border-slate-700 hover:border-indigo-500 hover:bg-slate-800/50'}`}>
                              <input type="file" ref={fileInputRef} className="hidden" accept="application/pdf" onChange={handleFileChange} />
                              {resumeFile ? (
                                  <div className="text-center">
                                      <FileText size={32} className="mx-auto text-emerald-400 mb-2"/>
                                      <p className="text-sm font-bold text-white">{resumeFile.name}</p>
                                      <p className="text-xs text-emerald-400 mt-1">Ready to upload</p>
                                  </div>
                              ) : (
                                  <div className="text-center text-slate-400">
                                      <Upload size={32} className="mx-auto mb-2 opacity-50"/>
                                      <p className="text-sm font-bold">Upload Resume (PDF)</p>
                                      <p className="text-xs mt-1 opacity-50">Max 300KB</p>
                                  </div>
                              )}
                          </div>

                          {error && <div className="bg-red-900/20 text-red-300 p-3 rounded-lg text-sm text-center border border-red-900/50">{error}</div>}

                          <button type="submit" disabled={isLoading || !resumeFile} className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]">
                              {isLoading ? <Loader2 className="animate-spin"/> : <Shield size={18}/>}
                              <span>Submit Application</span>
                          </button>
                      </form>
                  )}
              </div>
          )}
      </div>
    </div>
  );
};
