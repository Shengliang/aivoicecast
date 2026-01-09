import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Channel, Booking, TodoItem } from '../types';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Briefcase, Plus, Video, CheckCircle, X, Users, Loader2, Mic, Play, Mail, Sparkles, ArrowLeft, Monitor, Filter, LayoutGrid, List, Languages, CloudSun, Wind, BookOpen, CheckSquare, Square, Trash2, StopCircle, Download, FileText, Check, Podcast, RefreshCw, Globe, User, Info, GraduationCap } from 'lucide-react';
import { ChannelCard } from './ChannelCard';
import { getUserBookings, createBooking, updateBookingInvite, saveSavedWord, getSavedWordForUser } from '../services/firestoreService';
import { fetchLocalWeather, getWeatherDescription, WeatherData } from '../utils/weatherService';
import { getLunarDate, getDailyWord, getSeasonContext, DailyWord } from '../utils/lunarService';
import { GoogleGenAI } from '@google/genai';
import { synthesizeSpeech } from '../services/tts';

interface CalendarViewProps {
  channels: Channel[];
  handleChannelClick: (id: string) => void;
  handleVote: (id: string, type: 'like' | 'dislike', e: React.MouseEvent) => void;
  currentUser: any;
  setChannelToEdit: (channel: Channel) => void;
  setIsSettingsModalOpen: (open: boolean) => void;
  globalVoice: string;
  t: any;
  onCommentClick: (channel: Channel) => void;
  onStartLiveSession: (channel: Channel, context?: string, recordingEnabled?: boolean, bookingId?: string, videoEnabled?: boolean, cameraEnabled?: boolean) => void;
  onCreateChannel: (channel: Channel) => void;
  onSchedulePodcast: (date: Date) => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const TIME_SLOTS = [
  '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '19:00', '20:00'
];

const TARGET_LANGUAGES = [
  'Spanish', 'French', 'German', 'Chinese (Mandarin)', 'Japanese', 
  'Korean', 'Portuguese', 'Italian', 'Russian', 'Hindi'
];

// --- Date Utils ---
const getStartOfDay = (date: Date) => {
    const d = new Date(date);
    d.setHours(0,0,0,0);
    return d;
};

const getStartOfWeek = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay(); // 0 is Sunday
  const diff = d.getDate() - day; 
  const start = new Date(d.setDate(diff));
  start.setHours(0,0,0,0);
  return start;
};

const getEndOfWeek = (date: Date) => {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23,59,59,999);
  return end;
};

const getStartOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1);
};

const getEndOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
};

const isSameDate = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
};

export const CalendarView: React.FC<CalendarViewProps> = ({
  channels,
  handleChannelClick,
  handleVote,
  currentUser,
  setChannelToEdit,
  setIsSettingsModalOpen,
  globalVoice,
  t,
  onCommentClick,
  onStartLiveSession,
  onCreateChannel,
  onSchedulePodcast
}) => {
  const [displayDate, setDisplayDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Rich Context State
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [dailyWord, setDailyWord] = useState<DailyWord | null>(null);
  const [season, setSeason] = useState('');
  
  // Daily Word Audio & Content State
  const [isPlayingDailyWord, setIsPlayingDailyWord] = useState(false);
  const [explanationText, setExplanationText] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const wordAudioCtxRef = useRef<AudioContext | null>(null);
  const wordSourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  // Todo & Filtering State
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newTodo, setNewTodo] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);
  
  // Filter Scope: 'all' (Everyone's channels) | 'mine' (My created channels)
  const [filterScope, setFilterScope] = useState<'all' | 'mine'>('all');

  // View State
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 6;

  // Modals
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isRecorderModalOpen, setIsRecorderModalOpen] = useState(false);

  // Booking Flow State
  const [bookingStep, setBookingStep] = useState<'mentor' | 'details'>('mentor');
  const [selectedMentor, setSelectedMentor] = useState<Channel | null>(null);
  const [bookDate, setBookDate] = useState('');
  const [bookTime, setBookTime] = useState('');
  const [bookTopic, setBookTopic] = useState('');
  const [inviteEmail, setInviteEmail] = useState(''); // Used for Guest in AI or Invitee in P2P
  const [isBooking, setIsBooking] = useState(false);

  // Recorder Flow State
  const [meetingTitle, setMeetingTitle] = useState('');
  const [recorderMode, setRecorderMode] = useState<'interactive' | 'silent'>('interactive');
  const [targetLanguage, setTargetLanguage] = useState('Spanish');
  const [recordScreen, setRecordScreen] = useState(false);
  const [recordCamera, setRecordCamera] = useState(false);

  // Filter mentors
  const mentors = useMemo(() => channels.filter(c => c.likes > 20 || !Number.isNaN(Number(c.id)) === false), [channels]);

  const loadData = async () => {
    setIsRefreshing(true);
    if (currentUser) {
      try {
        const data = await getUserBookings(currentUser.uid, currentUser.email);
        setBookings(data.filter(b => b.status !== 'cancelled' && b.status !== 'rejected'));
      } catch (error) {
        console.error("Failed to load bookings", error);
      }
    }
    // Simulate refresh delay for visual feedback
    setTimeout(() => setIsRefreshing(false), 600);
  };

  // Load initial data
  useEffect(() => {
    loadData();
    if (currentUser) {
      const savedTodos = localStorage.getItem(`todos_${currentUser.uid}`);
      if (savedTodos) setTodos(JSON.parse(savedTodos));
    } else {
        setBookings([]);
        setTodos([]);
    }
  }, [currentUser]);

  // Auto-Refresh on View or Filter Change
  useEffect(() => {
      loadData();
  }, [viewMode, filterScope]);

  // Save Todos on change
  useEffect(() => {
      if (currentUser) {
          localStorage.setItem(`todos_${currentUser.uid}`, JSON.stringify(todos));
      }
  }, [todos, currentUser]);

  const handleFetchWeather = async () => {
      setLoadingWeather(true);
      try {
          const data = await fetchLocalWeather();
          if (data) {
              setWeather(data);
          } else {
              alert("Could not fetch weather. Please enable location permissions.");
          }
      } catch (e) {
          console.error(e);
      } finally {
          setLoadingWeather(false);
      }
  };

  // Update Daily Word when selected date changes & Check Cached Explanation
  useEffect(() => {
      const newDailyWord = getDailyWord(selectedDate);
      setDailyWord(newDailyWord);
      setSeason(getSeasonContext(selectedDate));
      setExplanationText(null); 
      setIsSaved(false);

      if (currentUser && newDailyWord) {
          getSavedWordForUser(currentUser.uid, newDailyWord.word).then(saved => {
              if (saved && saved.explanation) {
                  setExplanationText(saved.explanation);
                  setIsSaved(true);
              }
          }).catch(e => console.error("Failed to check saved word", e));
      }
  }, [selectedDate, currentUser]);

  // Clean up audio on unmount
  useEffect(() => {
      return () => {
          if (wordAudioCtxRef.current) {
              try { wordAudioCtxRef.current.close(); } catch(e) {}
          }
          window.speechSynthesis.cancel();
      };
  }, []);

  const handlePlayDailyWord = async () => {
      // Toggle Off / Stop
      if (isPlayingDailyWord) {
          if (wordSourceRef.current) {
              try { wordSourceRef.current.stop(); } catch(e) {}
          }
          if (wordAudioCtxRef.current) {
              try { wordAudioCtxRef.current.close(); } catch(e) {}
              wordAudioCtxRef.current = null;
          }
          window.speechSynthesis.cancel();
          setIsPlayingDailyWord(false);
          return;
      }

      if (!dailyWord) return;
      setIsPlayingDailyWord(true); 

      try {
          // Initialize Audio Context
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          wordAudioCtxRef.current = ctx;

          // Check if we already have the explanation script
          let script = explanationText;

          // If not, generate it
          if (!script) {
              const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
              
              const prompt = `
                You are a bilingual English/Chinese teacher.
                Word: "${dailyWord.word}" (${dailyWord.chinese}).
                
                Create a concise audio lesson:
                1. Pronounce the word.
                2. Simple English definition.
                3. TWO short example sentences (English followed by Chinese translation).
                
                Output ONLY the text to be spoken. Keep it brief.
              `;

              const response = await ai.models.generateContent({
                  model: 'gemini-3-flash-preview',
                  contents: prompt
              });

              script = response.text;
              if (!script) throw new Error("No script generated");
              
              setExplanationText(script);

              if (currentUser) {
                  saveSavedWord(currentUser.uid, {
                      word: dailyWord.word,
                      chinese: dailyWord.chinese,
                      explanation: script,
                      date: selectedDate.toISOString(),
                      metadata: dailyWord
                  }).then(() => setIsSaved(true)).catch(e => console.warn("Auto-save failed", e));
              }
          }
          
          const result = await synthesizeSpeech(script!, 'Zephyr', ctx);
          
          if (result.buffer) {
              const source = ctx.createBufferSource();
              source.buffer = result.buffer;
              source.connect(ctx.destination);
              source.onended = () => {
                  setIsPlayingDailyWord(false);
              };
              source.start(0);
              wordSourceRef.current = source;
          } else {
              const u = new SpeechSynthesisUtterance(script!);
              const voices = window.speechSynthesis.getVoices();
              const preferred = voices.find(v => v.lang.includes('en') && (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Premium'))) || voices.find(v => v.lang.includes('en'));
              if (preferred) u.voice = preferred;
              u.onend = () => setIsPlayingDailyWord(false);
              window.speechSynthesis.speak(u);
          }
      } catch (e) {
          console.error("Daily word play failed", e);
          setIsPlayingDailyWord(false);
          alert("Audio generation failed. Please try again.");
      }
  };

  const handleDownloadWord = () => {
      if (!dailyWord || !explanationText) return;
      
      const content = `Word of the Day: ${dailyWord.word} (${dailyWord.chinese})\n` +
                      `Date: ${selectedDate.toLocaleDateString()}\n\n` +
                      `Definition: ${dailyWord.meaning}\n` + 
                      `-------------------\n` +
                      `Audio Transcript:\n${explanationText}`;
      
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `daily_word_${dailyWord.word}_${selectedDate.toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const getDateKey = (date: Date | number | string) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };

  const eventsByDate = useMemo(() => {
    const map: Record<string, { channels: Channel[], bookings: Booking[], todos: TodoItem[] }> = {};
    
    channels.forEach(c => {
      if (filterScope === 'mine' && currentUser && c.ownerId !== currentUser.uid) return;
      if (c.createdAt) {
        const key = getDateKey(c.createdAt);
        if (!map[key]) map[key] = { channels: [], bookings: [], todos: [] };
        map[key].channels.push(c);
      }
    });

    bookings.forEach(b => {
        const key = getDateKey(b.date + 'T' + b.time); 
        if (!map[key]) map[key] = { channels: [], bookings: [], todos: [] };
        map[key].bookings.push(b);
    });

    todos.forEach(t => {
        const key = getDateKey(new Date(t.date));
        if (!map[key]) map[key] = { channels: [], bookings: [], todos: [] };
        map[key].todos.push(t);
    });

    return map;
  }, [channels, bookings, todos, filterScope, currentUser]);

  const filteredData = useMemo(() => {
      const startMonth = getStartOfMonth(displayDate); 
      const endMonth = getEndOfMonth(displayDate);

      const filterItem = (itemDate: Date) => {
          if (viewMode === 'day') {
              return isSameDate(itemDate, selectedDate);
          }
          else if (viewMode === 'week') {
              const twoWeeksStart = new Date(selectedDate);
              twoWeeksStart.setDate(selectedDate.getDate() - 7);
              twoWeeksStart.setHours(0,0,0,0);
              const twoWeeksEnd = new Date(selectedDate);
              twoWeeksEnd.setDate(selectedDate.getDate() + 7);
              twoWeeksEnd.setHours(23,59,59,999);
              return itemDate >= twoWeeksStart && itemDate <= twoWeeksEnd;
          }
          else {
              return itemDate >= startMonth && itemDate <= endMonth;
          }
      };

      const filteredChannels = channels.filter(c => {
          if (!c.createdAt) return false;
          const itemDate = new Date(c.createdAt);
          const isRecent = (Date.now() - c.createdAt) < 3600000;
          const dateMatch = filterItem(itemDate);
          
          if (filterScope === 'mine') {
              const isOwner = currentUser && c.ownerId === currentUser.uid;
              if (isOwner && isRecent) return true;
              return isOwner && dateMatch;
          }
          return dateMatch;
      });

      const filteredBookings = bookings.filter(b => {
          const bDate = new Date(`${b.date}T${b.time}`);
          return filterItem(bDate);
      });
      const filteredTodos = todos.filter(t => filterItem(new Date(t.date)));

      filteredChannels.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      filteredBookings.sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());

      return { channels: filteredChannels, bookings: filteredBookings, todos: filteredTodos };
  }, [channels, bookings, todos, selectedDate, displayDate, viewMode, filterScope, currentUser]);

  const paginatedChannels = useMemo(() => {
      if (viewMode === 'month') {
          const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
          return filteredData.channels.slice(startIndex, startIndex + ITEMS_PER_PAGE);
      }
      return filteredData.channels;
  }, [filteredData.channels, currentPage, viewMode]);

  const totalPages = Math.ceil(filteredData.channels.length / ITEMS_PER_PAGE);

  const year = displayDate.getFullYear();
  const month = displayDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay(); 

  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));

  const navigateMonth = (direction: -1 | 1) => {
    setDisplayDate(new Date(year, month + direction, 1));
    setCurrentPage(1); 
  };

  const handleAddTodo = () => {
      if (!newTodo.trim() || !currentUser) return;
      const todo: TodoItem = {
          id: crypto.randomUUID(),
          text: newTodo,
          isCompleted: false,
          date: selectedDate.toISOString()
      };
      setTodos([...todos, todo]);
      setNewTodo('');
  };

  const toggleTodo = (id: string) => {
      setTodos(prev => prev.map(t => t.id === id ? { ...t, isCompleted: !t.isCompleted } : t));
  };

  const deleteTodo = (id: string) => {
      setTodos(prev => prev.filter(t => t.id !== id));
  };

  const handleStartBooking = (mentor: Channel) => {
      setSelectedMentor(mentor);
      setBookingStep('details');
      setBookDate(selectedDate.toISOString().split('T')[0]);
      setBookTime('13:00');
      setBookTopic('');
      setInviteEmail('');
      setIsBookingModalOpen(true);
  };

  const handleConfirmBooking = async () => {
      if (!currentUser || !selectedMentor) return;
      setIsBooking(true);
      try {
          const booking: Booking = {
              id: '',
              userId: currentUser.uid,
              hostName: currentUser.displayName || 'User',
              mentorId: selectedMentor.id,
              mentorName: selectedMentor.title,
              mentorImage: selectedMentor.imageUrl,
              date: bookDate,
              time: bookTime,
              topic: bookTopic || `Discussion about ${selectedMentor.title}`,
              invitedEmail: inviteEmail,
              status: 'scheduled',
              type: 'ai',
              createdAt: Date.now()
          };
          await createBooking(booking);
          loadData();
          setIsBookingModalOpen(false);
      } catch (e) {
          alert("Failed to book session.");
      } finally {
          setIsBooking(false);
      }
  };

  const handleStartRecorder = () => {
      if (!meetingTitle.trim()) return;
      const newChannel: Channel = {
          id: `meeting-${Date.now()}`,
          title: meetingTitle,
          description: `Meeting: ${meetingTitle}`,
          author: currentUser?.displayName || 'User',
          ownerId: currentUser?.uid,
          visibility: 'private',
          voiceName: 'Zephyr',
          systemInstruction: recorderMode === 'silent' 
            ? `Translate user speech to ${targetLanguage}.`
            : "Helpful meeting assistant.",
          likes: 0, dislikes: 0, comments: [], tags: ['Meeting'],
          imageUrl: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=600&q=80',
          createdAt: Date.now()
      };
      setIsRecorderModalOpen(false);
      onStartLiveSession(newChannel, meetingTitle, true, undefined, recordScreen, recordCamera);
  };

  const renderRichContext = () => {
    const lunar = getLunarDate(selectedDate);
    return (
        <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                    <CalendarIcon size={120} />
                </div>
                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-500/20">
                                {selectedDate.getDate()}
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-white">{MONTHS[selectedDate.getMonth()]} {selectedDate.getFullYear()}</h2>
                                <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">{selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}</p>
                            </div>
                        </div>
                        <button onClick={handleFetchWeather} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 transition-colors">
                            {loadingWeather ? <Loader2 size={16} className="animate-spin"/> : <CloudSun size={16}/>}
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-6">
                        <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Lunar Date</p>
                            <p className="text-sm text-indigo-300 font-bold">{lunar.month} {lunar.day}</p>
                            <p className="text-[10px] text-slate-600">Year of the {lunar.zodiac}</p>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Atmosphere</p>
                            {weather ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-lg">{getWeatherDescription(weather.weatherCode).icon}</span>
                                    <div>
                                        <p className="text-sm text-emerald-400 font-bold">{weather.temperature}°C</p>
                                        <p className="text-[10px] text-slate-500">{getWeatherDescription(weather.weatherCode).label}</p>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-slate-600 italic">No data</p>
                            )}
                        </div>
                    </div>

                    {dailyWord && (
                        <div className="bg-gradient-to-r from-indigo-900/40 to-purple-900/40 border border-indigo-500/30 rounded-xl p-4 group relative overflow-hidden">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Word of the Day</span>
                                <div className="flex gap-1">
                                    {explanationText && (
                                        <button onClick={handleDownloadWord} className="p-1.5 bg-slate-950/50 hover:bg-slate-950 rounded text-slate-400 hover:text-white transition-colors" title="Download Lesson Text">
                                            <FileText size={12}/>
                                        </button>
                                    )}
                                    <button 
                                        onClick={handlePlayDailyWord}
                                        className={`p-1.5 rounded-full transition-all ${isPlayingDailyWord ? 'bg-red-500 text-white animate-pulse' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
                                    >
                                        {isPlayingDailyWord ? <StopCircle size={14}/> : <Play size={14} fill="currentColor"/>}
                                    </button>
                                </div>
                            </div>
                            <h3 className="text-2xl font-black text-white">{dailyWord.word}</h3>
                            <p className="text-xs text-indigo-200 mt-1 mb-3">{dailyWord.pronunciation}</p>
                            <div className="space-y-2">
                                <p className="text-sm text-slate-300 leading-relaxed italic">"{dailyWord.meaning}"</p>
                                <div className="flex items-center gap-2 pt-2 border-t border-indigo-500/20">
                                    <span className="text-xs font-bold text-white bg-indigo-500/30 px-2 py-0.5 rounded">{dailyWord.chinese}</span>
                                    <span className="text-[10px] text-slate-400">{dailyWord.chineseMean}</span>
                                </div>
                            </div>
                            {isSaved && <div className="absolute bottom-1 right-2 text-[8px] font-bold text-emerald-400 opacity-50">SAVED TO CLOUD</div>}
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-widest"><CheckSquare size={16} className="text-emerald-500"/> Daily Planner</h3>
                    <button onClick={() => setIsPlanning(!isPlanning)} className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 transition-colors">
                        <Plus size={16}/>
                    </button>
                </div>
                
                {isPlanning && (
                    <div className="flex gap-2 mb-4 animate-fade-in-up">
                        <input 
                            type="text" 
                            placeholder="Add task..." 
                            value={newTodo}
                            onChange={e => setNewTodo(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAddTodo()}
                            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                        <button onClick={handleAddTodo} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold"><Check size={16}/></button>
                    </div>
                )}

                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-800">
                    {filteredData.todos.length === 0 ? (
                        <p className="text-xs text-slate-600 italic text-center py-4">No tasks for today.</p>
                    ) : filteredData.todos.map(todo => (
                        <div key={todo.id} className="flex items-center justify-between group bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
                            <div className="flex items-center gap-3">
                                <button onClick={() => toggleTodo(todo.id)} className={`transition-colors ${todo.isCompleted ? 'text-emerald-500' : 'text-slate-600 hover:text-white'}`}>
                                    {todo.isCompleted ? <CheckCircle size={16}/> : <Square size={16}/>}
                                </button>
                                <span className={`text-sm ${todo.isCompleted ? 'text-slate-600 line-through' : 'text-slate-300'}`}>{todo.text}</span>
                            </div>
                            <button onClick={() => deleteTodo(todo.id)} className="p-1 text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Trash2 size={14}/>
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 overflow-hidden relative">
      <div className="shrink-0 p-4 border-b border-slate-900 bg-slate-900/50 backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4 z-20">
        <div className="flex items-center gap-4">
            <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
                <CalendarIcon className="text-indigo-500" />
                <span>Knowledge Calendar</span>
            </h1>
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button onClick={() => setViewMode('day')} className={`px-3 py-1 text-xs font-bold rounded transition-colors ${viewMode === 'day' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Day</button>
                <button onClick={() => setViewMode('week')} className={`px-3 py-1 text-xs font-bold rounded transition-colors ${viewMode === 'week' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>2 Weeks</button>
                <button onClick={() => setViewMode('month')} className={`px-3 py-1 text-xs font-bold rounded transition-colors ${viewMode === 'month' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Month</button>
            </div>
        </div>

        <div className="flex items-center gap-3">
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button onClick={() => setFilterScope('all')} className={`p-1.5 rounded transition-all ${filterScope === 'all' ? 'bg-slate-800 text-indigo-400 shadow-md' : 'text-slate-600 hover:text-slate-300'}`} title="Show All Podcasts"><Globe size={16}/></button>
                <button onClick={() => setFilterScope('mine')} className={`p-1.5 rounded transition-all ${filterScope === 'mine' ? 'bg-slate-800 text-indigo-400 shadow-md' : 'text-slate-600 hover:text-slate-300'}`} title="Show Only My Podcasts"><User size={16}/></button>
            </div>
            
            <div className="w-px h-6 bg-slate-800"></div>

            <button onClick={() => setIsRecorderModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold shadow-md transition-transform hover:scale-105">
                <Video size={14} /> <span>Record Meeting</span>
            </button>
            <button onClick={() => onSchedulePodcast(selectedDate)} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-md transition-transform hover:scale-105">
                <Plus size={14} /> <span>Schedule</span>
            </button>
            <button onClick={loadData} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors">
                <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <aside className="hidden lg:flex w-80 shrink-0 border-r border-slate-900 overflow-y-auto p-4 flex-col gap-6 bg-slate-950/50">
            {renderRichContext()}
        </aside>

        <main className="flex-1 flex flex-col min-w-0 bg-slate-950">
          {viewMode === 'month' ? (
            <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <button onClick={() => navigateMonth(-1)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors"><ChevronLeft /></button>
                  <h2 className="text-2xl font-bold min-w-[200px] text-center">{MONTHS[month]} {year}</h2>
                  <button onClick={() => navigateMonth(1)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors"><ChevronRight /></button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-2 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} className="text-center text-[10px] font-black text-slate-600 uppercase tracking-widest py-2">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2 flex-1 min-h-0">
                {days.map((date, idx) => {
                  if (!date) return <div key={`empty-${idx}`} className="aspect-square"></div>;
                  const isSelected = isSameDate(date, selectedDate);
                  const isToday = isSameDate(date, new Date());
                  const key = getDateKey(date);
                  const dayEvents = eventsByDate[key];
                  
                  return (
                    <div 
                      key={key}
                      onClick={() => { setSelectedDate(date); setViewMode('day'); }}
                      className={`aspect-square rounded-xl p-2 cursor-pointer transition-all border relative group ${
                        isSelected ? 'bg-indigo-600 border-indigo-500 shadow-xl shadow-indigo-500/20 z-10' : 
                        isToday ? 'bg-slate-900 border-indigo-900/50 hover:border-indigo-500' :
                        'bg-slate-900/50 border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <span className={`text-sm font-bold ${isSelected ? 'text-white' : isToday ? 'text-indigo-400' : 'text-slate-500'}`}>{date.getDate()}</span>
                      
                      <div className="absolute bottom-2 left-2 right-2 flex justify-center gap-1">
                        {dayEvents?.channels.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-sm shadow-indigo-500/50"></div>}
                        {dayEvents?.bookings.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-500/50"></div>}
                        {dayEvents?.todos.some(t => !t.isCompleted) && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-sm shadow-amber-500/50"></div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="shrink-0 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-[0.2em] mb-1">
                            {viewMode === 'day' ? 'Daily Focus' : 'Next 14 Days'}
                        </div>
                        <h2 className="text-3xl font-black text-white">
                            {viewMode === 'day' ? selectedDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long' }) : 'Curriculum Roadmap'}
                        </h2>
                    </div>
                    {viewMode === 'day' && (
                        <div className="flex gap-2">
                             <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d); setDisplayDate(d); }} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"><ChevronLeft size={20}/></button>
                             <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d); setDisplayDate(d); }} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"><ChevronRight size={20}/></button>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto px-6 pb-20 scrollbar-thin scrollbar-thumb-slate-800">
                    <div className="max-w-5xl space-y-12">
                        {/* Bookings Section */}
                        {filteredData.bookings.length > 0 && (
                            <section>
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2 bg-emerald-900/30 rounded-lg text-emerald-400"><Clock size={20}/></div>
                                    <h3 className="text-xl font-bold text-white">Scheduled Sessions</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {filteredData.bookings.map(booking => (
                                        <div key={booking.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center gap-4 group hover:border-emerald-500/30 transition-all shadow-sm">
                                            <div className="shrink-0 w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center border border-slate-700 group-hover:bg-emerald-600 transition-colors">
                                                <Play size={20} className="text-emerald-400 group-hover:text-white" fill="currentColor"/>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-slate-200 line-clamp-1">{booking.topic}</h4>
                                                <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                                                    <span className="font-mono text-indigo-400">{booking.time}</span>
                                                    <span>•</span>
                                                    <span>with {booking.mentorName}</span>
                                                </p>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter ${booking.status === 'scheduled' ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'}`}>
                                                    {booking.status}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Podcasts Section */}
                        <section>
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-900/30 rounded-lg text-indigo-400"><Podcast size={20}/></div>
                                    <h3 className="text-xl font-bold text-white">{viewMode === 'day' ? 'Released Today' : 'Upcoming Curriculum'}</h3>
                                </div>
                                {viewMode === 'month' && filteredData.channels.length > ITEMS_PER_PAGE && (
                                    <div className="flex items-center gap-2">
                                        <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1.5 bg-slate-800 rounded-lg text-slate-400 disabled:opacity-20"><ChevronLeft size={16}/></button>
                                        <span className="text-xs font-bold text-slate-500">{currentPage} / {totalPages}</span>
                                        <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1.5 bg-slate-800 rounded-lg text-slate-400 disabled:opacity-20"><ChevronRight size={16}/></button>
                                    </div>
                                )}
                            </div>
                            
                            {paginatedChannels.length === 0 ? (
                                <div className="py-12 text-center text-slate-600 bg-slate-900/20 rounded-2xl border border-dashed border-slate-800">
                                    <Info className="mx-auto mb-2 opacity-20" size={32}/>
                                    <p>No episodes {viewMode === 'day' ? 'found for this date' : 'scheduled in this range'}.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {paginatedChannels.map(channel => (
                                        <ChannelCard 
                                          key={channel.id} 
                                          channel={channel} 
                                          handleChannelClick={handleChannelClick} 
                                          handleVote={handleVote} 
                                          currentUser={currentUser} 
                                          setChannelToEdit={setChannelToEdit} 
                                          setIsSettingsModalOpen={setIsSettingsModalOpen} 
                                          globalVoice={globalVoice} 
                                          t={t} 
                                          onCommentClick={onCommentClick} 
                                          isLiked={currentUser?.likedChannelIds?.includes(channel.id)} 
                                        />
                                    ))}
                                </div>
                            )}
                        </section>

                        {/* Mentors Recommendation Section */}
                        {viewMode === 'day' && (
                            <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8">
                                <div className="flex flex-col md:flex-row items-center gap-8">
                                    <div className="flex-1 space-y-4">
                                        <h3 className="text-2xl font-black text-white">1-on-1 Deep Dive</h3>
                                        <p className="text-slate-400 text-sm leading-relaxed">
                                            Need a more personalized session? You can book any of our top AI mentors for a dedicated discussion tailored to your learning goals.
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {mentors.slice(0, 3).map(m => (
                                                <button key={m.id} onClick={() => handleStartBooking(m)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-lg text-xs font-bold transition-all border border-slate-700">
                                                    <img src={m.imageUrl} className="w-5 h-5 rounded-full object-cover" />
                                                    <span>{m.title}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="w-32 h-32 bg-indigo-500/10 rounded-full flex items-center justify-center animate-pulse border-4 border-indigo-500/20">
                                        <GraduationCap size={64} className="text-indigo-400" />
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>
                </div>
            </div>
          )}
        </main>
      </div>

      {/* --- MODALS --- */}
      {isBookingModalOpen && selectedMentor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6 animate-fade-in-up">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2"><Briefcase className="text-indigo-400"/> Book AI Mentor</h3>
                      <button onClick={() => setIsBookingModalOpen(false)}><X size={20} className="text-slate-400 hover:text-white"/></button>
                  </div>
                  <div className="space-y-6">
                      <div className="flex items-center gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                          <img src={selectedMentor.imageUrl} className="w-10 h-10 rounded-lg object-cover" />
                          <div><p className="font-bold text-white text-sm">{selectedMentor.title}</p><p className="text-xs text-slate-500">Voice: {selectedMentor.voiceName}</p></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Date</label>
                              <input type="date" value={bookDate} onChange={e => setBookDate(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white"/>
                          </div>
                          <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Time</label>
                              <select value={bookTime} onChange={e => setBookTime(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white">
                                  {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                          </div>
                      </div>
                      <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Discussion Topic</label>
                          <textarea value={bookTopic} onChange={e => setBookTopic(e.target.value)} rows={3} placeholder="What do you want to learn?" className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs text-white outline-none focus:border-indigo-500 resize-none"/>
                      </div>
                      <button onClick={handleConfirmBooking} disabled={isBooking} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-transform hover:scale-105">
                          {isBooking ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle size={16}/>}
                          <span>Confirm Booking</span>
                      </button>
                  </div>
              </div>
          </div>
      )}

      {isRecorderModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6 animate-fade-in-up">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2"><Video className="text-red-500"/> Start Recording</h3>
                      <button onClick={() => setIsRecorderModalOpen(false)}><X size={20} className="text-slate-400 hover:text-white"/></button>
                  </div>
                  <div className="space-y-6">
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase">Meeting Title</label>
                          <input type="text" value={meetingTitle} onChange={e => setMeetingTitle(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-red-500 mt-1" placeholder="e.g., Weekly Team Sync"/>
                      </div>
                      <div className="space-y-4">
                          <div>
                              <label className="text-xs font-bold text-slate-500 uppercase">AI Mode</label>
                              <div className="grid grid-cols-2 gap-3 mt-2">
                                  <button onClick={() => setRecorderMode('interactive')} className={`p-3 rounded-xl border text-left transition-all ${recorderMode === 'interactive' ? 'bg-indigo-900/30 border-indigo-500 ring-1 ring-indigo-500' : 'bg-slate-800 border-slate-700 opacity-60'}`}>
                                      <div className="flex items-center gap-2 mb-1"><Sparkles size={16} className="text-indigo-400"/><span className="font-bold text-white text-sm">Interactive</span></div>
                                      <p className="text-[10px] text-slate-400">AI participates and answers questions.</p>
                                  </button>
                                  <button onClick={() => setRecorderMode('silent')} className={`p-3 rounded-xl border text-left transition-all ${recorderMode === 'silent' ? 'bg-emerald-900/30 border-emerald-500 ring-1 ring-emerald-500' : 'bg-slate-800 border-slate-700 opacity-60'}`}>
                                      <div className="flex items-center gap-2 mb-1"><Mic size={16} className="text-emerald-400"/><span className="font-bold text-white text-sm">Silent Scribe</span></div>
                                      <p className="text-[10px] text-slate-400">AI translates and transcribes.</p>
                                  </button>
                              </div>
                          </div>
                          {recorderMode === 'silent' && (
                              <div className="animate-fade-in">
                                  <label className="text-xs font-bold text-emerald-400 uppercase flex items-center gap-2"><Languages size={14}/> Translate To</label>
                                  <select value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)} className="w-full bg-slate-800 border border-emerald-500/50 rounded-lg p-2.5 mt-1 text-sm text-white focus:outline-none">
                                      {TARGET_LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                                  </select>
                              </div>
                          )}
                          <div onClick={() => setRecordScreen(!recordScreen)} className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${recordScreen ? 'bg-indigo-900/20 border-indigo-500/50' : 'bg-slate-800/30 border-slate-700 hover:bg-slate-800'}`}>
                              <div className="flex items-center gap-3"><div className={`p-1.5 rounded-full ${recordScreen ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-400'}`}><Monitor size={16} /></div><p className={`font-bold text-sm ${recordScreen ? 'text-indigo-400' : 'text-slate-400'}`}>Screen Share</p></div>
                              <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${recordScreen ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-500'}`}>{recordScreen && <Check size={12} />}</div>
                          </div>
                      </div>
                      <button onClick={handleStartRecorder} disabled={!meetingTitle} className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2"><Video size={18} fill="currentColor"/><span>Start Meeting</span></button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
