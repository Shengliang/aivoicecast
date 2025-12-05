
import React, { useState, useMemo, useEffect } from 'react';
import { Channel, Booking, TodoItem } from '../types';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Briefcase, Plus, Video, CheckCircle, X, Users, Loader2, Mic, Play, Mail, Sparkles, ArrowLeft, Monitor, Filter, LayoutGrid, List, Languages, CloudSun, Wind, BookOpen, CheckSquare, Square, Trash2 } from 'lucide-react';
import { ChannelCard } from './ChannelCard';
import { getUserBookings, createBooking, updateBookingInvite } from '../services/firestoreService';
import { fetchLocalWeather, getWeatherDescription, WeatherData } from '../utils/weatherService';
import { getLunarDate, getDailyWord, getSeasonContext, DailyWord } from '../utils/lunarService';
import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from '../services/private_keys';

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
  onCreateChannel
}) => {
  const [displayDate, setDisplayDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [bookings, setBookings] = useState<Booking[]>([]);
  
  // Rich Context State
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [dailyWord, setDailyWord] = useState<DailyWord | null>(null);
  const [season, setSeason] = useState('');
  
  // TODO List State
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newTodo, setNewTodo] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);

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
  const [inviteEmail, setInviteEmail] = useState('');
  const [isBooking, setIsBooking] = useState(false);

  // Recorder Flow State
  const [meetingTitle, setMeetingTitle] = useState('');
  const [recorderMode, setRecorderMode] = useState<'interactive' | 'silent'>('interactive');
  const [targetLanguage, setTargetLanguage] = useState('Spanish');
  const [recordScreen, setRecordScreen] = useState(false);
  const [recordCamera, setRecordCamera] = useState(false);

  // Filter mentors
  const mentors = useMemo(() => channels.filter(c => c.likes > 20 || !Number.isNaN(Number(c.id)) === false), [channels]);

  // Load initial data
  useEffect(() => {
    if (currentUser) {
      getUserBookings(currentUser.uid, currentUser.email)
        .then(data => setBookings(data.filter(b => b.status !== 'cancelled' && b.status !== 'rejected')))
        .catch(console.error);
        
      // Load Todos from LocalStorage (Simulated DB for now)
      const savedTodos = localStorage.getItem(`todos_${currentUser.uid}`);
      if (savedTodos) setTodos(JSON.parse(savedTodos));
    } else {
        setBookings([]);
        setTodos([]);
    }
  }, [currentUser, isBookingModalOpen]);

  // Save Todos on change
  useEffect(() => {
      if (currentUser) {
          localStorage.setItem(`todos_${currentUser.uid}`, JSON.stringify(todos));
      }
  }, [todos, currentUser]);

  // Fetch Weather & Daily Content
  useEffect(() => {
    fetchLocalWeather().then(setWeather);
    setDailyWord(getDailyWord(new Date()));
    setSeason(getSeasonContext(new Date()));
  }, []);

  // Update Daily Word when selected date changes
  useEffect(() => {
      setDailyWord(getDailyWord(selectedDate));
      setSeason(getSeasonContext(selectedDate));
  }, [selectedDate]);

  const getDateKey = (date: Date | number | string) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };

  // 1. Grid Indicators
  const eventsByDate = useMemo(() => {
    const map: Record<string, { channels: Channel[], bookings: Booking[], todos: TodoItem[] }> = {};
    
    channels.forEach(c => {
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
  }, [channels, bookings, todos]);

  // 2. Filtered Events based on View Mode
  const filteredData = useMemo(() => {
      let filteredChannels = [] as Channel[];
      let filteredBookings = [] as Booking[];
      let filteredTodos = [] as TodoItem[];

      const startDay = getStartOfDay(selectedDate);
      const startWeek = getStartOfWeek(selectedDate);
      const endWeek = getEndOfWeek(selectedDate);
      const startMonth = getStartOfMonth(displayDate); 
      const endMonth = getEndOfMonth(displayDate);

      const filterItem = (itemDate: Date) => {
          if (viewMode === 'day') return isSameDate(itemDate, selectedDate);
          else if (viewMode === 'week') return itemDate >= startWeek && itemDate <= endWeek;
          else return itemDate >= startMonth && itemDate <= endMonth;
      };

      filteredChannels = channels.filter(c => c.createdAt && filterItem(new Date(c.createdAt)));
      filteredBookings = bookings.filter(b => {
          const bDate = new Date(`${b.date}T${b.time}`);
          return filterItem(bDate);
      });
      filteredTodos = todos.filter(t => filterItem(new Date(t.date)));

      filteredChannels.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      filteredBookings.sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());

      return { channels: filteredChannels, bookings: filteredBookings, todos: filteredTodos };
  }, [channels, bookings, todos, selectedDate, displayDate, viewMode]);

  // Pagination for Channels
  const paginatedChannels = useMemo(() => {
      if (viewMode === 'month') {
          const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
          return filteredData.channels.slice(startIndex, startIndex + ITEMS_PER_PAGE);
      }
      return filteredData.channels;
  }, [filteredData.channels, currentPage, viewMode]);

  const totalPages = Math.ceil(filteredData.channels.length / ITEMS_PER_PAGE);

  // Calendar Grid Setup
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

  const handleBookingDateSelect = (date: string) => {
      setBookDate(date);
  };

  // --- TODO Logic ---
  const handleAddTodo = () => {
      if (!newTodo.trim() || !currentUser) return;
      const todo: TodoItem = {
          id: crypto.randomUUID(),
          text: newTodo,
          isCompleted: false,
          date: selectedDate.toISOString() // Associate with selected day
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

  const handleAIPlan = async () => {
      if (!currentUser) return;
      const goal = prompt("What is your main goal for today? (e.g. Prepare for Google Interview)");
      if (!goal) return;

      setIsPlanning(true);
      try {
          const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY || process.env.API_KEY || '';
          if (!apiKey) throw new Error("API Key Required");
          const ai = new GoogleGenAI({ apiKey });
          
          const prompt = `
            You are a productivity expert.
            User Goal: "${goal}"
            Date: ${selectedDate.toDateString()}
            
            Create 3-5 specific, actionable TODO items for today to help the user achieve this goal.
            Return ONLY a JSON array of strings. Example: ["Review Graph Algorithms", "Mock Interview at 2pm"]
          `;
          
          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt,
              config: { responseMimeType: 'application/json' }
          });
          
          const items: string[] = JSON.parse(response.text || "[]");
          const newTodos = items.map(text => ({
              id: crypto.randomUUID(),
              text,
              isCompleted: false,
              date: selectedDate.toISOString()
          }));
          
          setTodos([...todos, ...newTodos]);
      } catch(e) {
          alert("AI Planning failed.");
      } finally {
          setIsPlanning(false);
      }
  };

  // --- Other Actions ---

  const handleBookSession = async () => {
    if (!currentUser) return;
    setIsBooking(true);
    try {
        const newBooking: Booking = {
            id: '',
            userId: currentUser.uid,
            mentorId: selectedMentor!.id,
            mentorName: selectedMentor!.title,
            mentorImage: selectedMentor!.imageUrl,
            date: bookDate,
            time: bookTime,
            topic: bookTopic,
            invitedEmail: inviteEmail.trim() || undefined,
            status: 'scheduled',
            createdAt: Date.now()
        };
        await createBooking(newBooking);
        alert("Session Booked!");
        setIsBookingModalOpen(false);
        setBookingStep('mentor');
        setSelectedMentor(null);
        setBookDate('');
        setBookTime('');
        setBookTopic('');
    } catch(e) {
        alert("Booking failed.");
    } finally {
        setIsBooking(false);
    }
  };

  const handleStartRecorder = async () => {
      if (!meetingTitle.trim()) return;
      const systemPrompt = recorderMode === 'silent' 
        ? `You are a professional interpreter. Translate to ${targetLanguage}.`
        : "You are a helpful meeting assistant.";

      const newChannel: Channel = {
          id: `meeting-${Date.now()}`,
          title: meetingTitle,
          description: `Meeting Recording: ${meetingTitle}`,
          author: currentUser?.displayName || 'User',
          ownerId: currentUser?.uid,
          visibility: 'private',
          voiceName: 'Zephyr',
          systemInstruction: systemPrompt,
          likes: 0, 
          dislikes: 0, 
          comments: [],
          tags: ['Meeting', 'Recording'],
          imageUrl: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=600&q=80',
          createdAt: Date.now()
      };

      setIsRecorderModalOpen(false);
      onStartLiveSession(newChannel, meetingTitle, true, undefined, recordScreen, recordCamera);
  };

  const getNextDays = () => {
      const d = [];
      for(let i=0; i<7; i++) {
          const date = new Date();
          date.setDate(date.getDate() + i);
          d.push(date.toISOString().split('T')[0]);
      }
      return d;
  };

  // Weather Icon Helper
  const WeatherDisplay = () => {
      if (!weather) return <div className="text-slate-500 text-xs flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> Weather</div>;
      const desc = getWeatherDescription(weather.weatherCode);
      return (
          <div className="flex items-center gap-2 bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-800/50">
              <span className="text-xl">{desc.icon}</span>
              <div className="flex flex-col">
                  <span className="text-xs font-bold text-blue-200">{weather.temperature}°C</span>
                  <span className="text-[10px] text-blue-300">{desc.label}</span>
              </div>
              <div className="h-6 w-px bg-blue-800/50 mx-1"></div>
              <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1"><Wind size={10}/> {weather.windSpeed}</span>
                  <span className="text-[10px] text-slate-500">km/h</span>
              </div>
          </div>
      );
  };

  return (
    <div className="space-y-8 animate-fade-in relative">
      
      {/* --- Daily Insight Hero --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Date Card */}
          <div className="lg:col-span-2 bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 border border-indigo-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-32 bg-indigo-500/10 blur-[80px] rounded-full group-hover:bg-indigo-500/20 transition-all"></div>
              
              <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div>
                      <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold uppercase tracking-wider">{season}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700 font-bold uppercase tracking-wider">{getLunarDate(selectedDate).zodiac} Year</span>
                      </div>
                      <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
                          {selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}
                      </h2>
                      <div className="flex items-baseline gap-3 mt-1">
                          <span className="text-2xl text-indigo-200">{selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</span>
                          <span className="text-lg text-slate-500 font-mono">
                              {getLunarDate(selectedDate).month} {getLunarDate(selectedDate).day} (Lunar)
                          </span>
                      </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-3">
                      <WeatherDisplay />
                      <div className="flex gap-2">
                          <button 
                             onClick={() => { setIsRecorderModalOpen(true); setRecordScreen(false); setRecordCamera(false); }}
                             className="p-2 bg-red-600 hover:bg-red-500 text-white rounded-lg shadow-lg shadow-red-900/20 transition-all hover:scale-105" title="Quick Record"
                          >
                              <Video size={20} />
                          </button>
                          <button 
                             onClick={() => setIsBookingModalOpen(true)}
                             className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-lg shadow-indigo-900/20 transition-all hover:scale-105" title="Book Session"
                          >
                              <Plus size={20} />
                          </button>
                      </div>
                  </div>
              </div>
          </div>

          {/* Word of the Day Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-center">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
              {dailyWord ? (
                  <>
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <BookOpen size={14} className="text-emerald-500"/> Daily Word
                      </h3>
                      <div className="flex justify-between items-baseline mb-1">
                          <span className="text-2xl font-bold text-white">{dailyWord.word}</span>
                          <span className="text-sm font-serif text-slate-500 italic">{dailyWord.pronunciation}</span>
                      </div>
                      <p className="text-xs text-slate-400 mb-4">{dailyWord.meaning}</p>
                      
                      <div className="mt-auto pt-4 border-t border-slate-800">
                          <div className="flex justify-between items-baseline">
                              <span className="text-lg font-bold text-emerald-400">{dailyWord.chinese}</span>
                              <span className="text-[10px] text-slate-500">{dailyWord.chineseMean}</span>
                          </div>
                      </div>
                  </>
              ) : (
                  <div className="text-center text-slate-500">
                      <Loader2 className="animate-spin mx-auto mb-2" />
                      Loading wisdom...
                  </div>
              )}
          </div>
      </div>

      {/* Calendar Grid Container */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col md:flex-row">
        
        {/* Sidebar Controls (Month Nav + Toggles) */}
        <div className="p-4 bg-slate-950/50 border-b md:border-b-0 md:border-r border-slate-800 md:w-64 flex flex-col gap-6">
            <div className="flex items-center justify-between bg-slate-900 p-2 rounded-xl border border-slate-800">
                <button onClick={() => navigateMonth(-1)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"><ChevronLeft size={18}/></button>
                <div className="text-sm font-bold text-white">{MONTHS[month]} {year}</div>
                <button onClick={() => navigateMonth(1)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"><ChevronRight size={18}/></button>
            </div>

            <div className="flex flex-col gap-2">
                <button onClick={() => setViewMode('day')} className={`p-2 text-xs font-bold rounded-lg text-left pl-4 transition-all ${viewMode === 'day' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-900'}`}>Daily Agenda</button>
                <button onClick={() => setViewMode('week')} className={`p-2 text-xs font-bold rounded-lg text-left pl-4 transition-all ${viewMode === 'week' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-900'}`}>Weekly Overview</button>
                <button onClick={() => setViewMode('month')} className={`p-2 text-xs font-bold rounded-lg text-left pl-4 transition-all ${viewMode === 'month' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-900'}`}>Monthly Grid</button>
            </div>

            {/* TODO LIST */}
            <div className="flex-1 overflow-y-auto mt-4 border-t border-slate-800 pt-4">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-slate-400 uppercase">Tasks for Selected Day</h4>
                    <button onClick={handleAIPlan} disabled={isPlanning} className="text-xs text-indigo-400 hover:text-white flex items-center gap-1">
                        {isPlanning ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>} Plan
                    </button>
                </div>
                
                <div className="space-y-2">
                    {filteredData.todos.map(todo => (
                        <div key={todo.id} className="flex items-center gap-2 text-sm text-slate-300 group">
                            <button onClick={() => toggleTodo(todo.id)}>
                                {todo.isCompleted ? <CheckSquare size={16} className="text-emerald-500"/> : <Square size={16} className="text-slate-600"/>}
                            </button>
                            <span className={`flex-1 truncate ${todo.isCompleted ? 'line-through text-slate-600' : ''}`}>{todo.text}</span>
                            <button onClick={() => deleteTodo(todo.id)} className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400"><Trash2 size={12}/></button>
                        </div>
                    ))}
                    <div className="flex items-center gap-2 mt-2">
                        <Plus size={16} className="text-slate-600"/>
                        <input 
                            type="text" 
                            value={newTodo}
                            onChange={(e) => setNewTodo(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddTodo()}
                            placeholder="Add task..." 
                            className="bg-transparent text-sm text-white placeholder-slate-600 outline-none w-full"
                        />
                    </div>
                </div>
            </div>
        </div>

        {/* Grid Area */}
        <div className="p-6 flex-1">
          <div className="grid grid-cols-7 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider py-2">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {days.map((date, idx) => {
              if (!date) return <div key={`empty-${idx}`} className="aspect-square bg-slate-900/20 rounded-xl border border-transparent"></div>;
              
              const dateKey = getDateKey(date);
              const data = eventsByDate[dateKey] || { channels: [], bookings: [], todos: [] };
              const hasChannels = data.channels.length > 0;
              const hasBookings = data.bookings.length > 0;
              const hasTodos = data.todos.length > 0;
              const isSelected = dateKey === getDateKey(selectedDate);
              const isToday = dateKey === getDateKey(new Date());
              const lunar = getLunarDate(date);

              return (
                <button
                  key={date.toString()}
                  onClick={() => {
                      setSelectedDate(date);
                      if (viewMode !== 'day') setViewMode('day');
                      if (date.getMonth() !== displayDate.getMonth()) setDisplayDate(new Date(date.getFullYear(), date.getMonth(), 1));
                  }}
                  className={`relative aspect-square rounded-xl border flex flex-col p-1.5 transition-all duration-200 group
                    ${isSelected 
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/25 scale-105 z-10' 
                      : 'bg-slate-800/30 border-slate-700/50 text-slate-400 hover:bg-slate-800 hover:border-slate-600'
                    }
                    ${isToday && !isSelected ? 'ring-1 ring-emerald-500/50 bg-emerald-900/10' : ''}
                  `}
                >
                  <div className="w-full flex justify-between items-start">
                      <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                        {date.getDate()}
                      </span>
                      {/* Weather Icon Placeholder for Today */}
                      {isToday && !isSelected && <span className="text-[10px]">☀️</span>}
                  </div>
                  
                  <div className="mt-auto w-full text-right">
                      <span className={`text-[9px] font-mono ${isSelected ? 'text-indigo-200' : 'text-slate-600'}`}>
                          {lunar.day}
                      </span>
                  </div>
                  
                  {/* Indicators */}
                  <div className="absolute bottom-1 left-1.5 flex gap-0.5">
                    {hasChannels && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-indigo-400'}`}></div>}
                    {hasBookings && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-purple-200' : 'bg-purple-500'}`}></div>}
                    {hasTodos && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-emerald-200' : 'bg-emerald-500'}`}></div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filtered Agenda Content */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
           <div className="flex items-center space-x-2">
                <Clock size={18} className="text-slate-500" />
                <h3 className="text-lg font-bold text-white">
                    {viewMode === 'day' && `Agenda: ${selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`}
                    {viewMode === 'week' && `Agenda: Week of ${getStartOfWeek(selectedDate).toLocaleDateString()}`}
                    {viewMode === 'month' && `Agenda: ${displayDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`}
                </h3>
           </div>
           
           {/* Pagination Controls for Month View */}
           {viewMode === 'month' && totalPages > 1 && (
               <div className="flex items-center gap-2">
                   <button 
                       onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                       disabled={currentPage === 1}
                       className="p-1 rounded bg-slate-800 text-slate-400 disabled:opacity-30 hover:text-white"
                   >
                       <ChevronLeft size={16}/>
                   </button>
                   <span className="text-xs text-slate-500 font-mono">Page {currentPage} / {totalPages}</span>
                   <button 
                       onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                       disabled={currentPage === totalPages}
                       className="p-1 rounded bg-slate-800 text-slate-400 disabled:opacity-30 hover:text-white"
                   >
                       <ChevronRight size={16}/>
                   </button>
               </div>
           )}
        </div>

        {/* Bookings List */}
        {filteredData.bookings.length > 0 && (
            <div className="space-y-4 animate-fade-in-up">
                <h4 className="text-sm font-bold text-purple-400 uppercase tracking-wider flex items-center space-x-2">
                    <Briefcase size={14} /> <span>Scheduled Meetings</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredData.bookings.map(booking => (
                        <div key={booking.id} className={`bg-slate-900 border ${booking.status === 'pending' ? 'border-amber-500/50' : 'border-slate-800'} p-4 rounded-xl flex items-center gap-4 hover:border-purple-500/30 transition-colors`}>
                            <div className="bg-slate-800 p-3 rounded-lg text-center min-w-[70px]">
                                <span className="block text-xl font-bold text-white">{booking.time}</span>
                                <span className="text-[10px] text-slate-400 uppercase">{new Date(booking.date).toLocaleDateString(undefined, {weekday:'short'})}</span>
                            </div>
                            <div className="flex-1">
                                <h5 className="font-bold text-white flex items-center gap-2">
                                    {booking.mentorName} 
                                    {booking.status === 'pending' && <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/50">Pending</span>}
                                </h5>
                                <p className="text-xs text-slate-400 line-clamp-1">{booking.topic}</p>
                                {viewMode !== 'day' && <p className="text-[10px] text-slate-500 mt-1">{booking.date}</p>}
                            </div>
                            <img src={booking.mentorImage} className="w-10 h-10 rounded-full border border-slate-700" />
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Channels List (Paginated if Month view) */}
        {paginatedChannels.length > 0 && (
          <div className="space-y-4 animate-fade-in-up">
             <h4 className="text-sm font-bold text-indigo-400 uppercase tracking-wider flex items-center space-x-2">
                <CalendarIcon size={14} /> <span>Created Podcasts {viewMode === 'month' && `(${filteredData.channels.length})`}</span>
             </h4>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                />
                ))}
             </div>
          </div>
        )}

        {filteredData.bookings.length === 0 && paginatedChannels.length === 0 && (
          <div className="py-12 flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-xl bg-slate-900/30">
             <CalendarIcon size={48} className="mb-4 opacity-20" />
             <p>No events found for this {viewMode}.</p>
          </div>
        )}
      </div>

      {/* --- Booking Modal --- */}
      {isBookingModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-fade-in-up">
                  <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/50 shrink-0">
                      <div className="flex items-center space-x-3">
                          {bookingStep === 'details' && <button onClick={() => setBookingStep('mentor')}><ArrowLeft size={20} className="text-slate-400 hover:text-white"/></button>}
                          <h2 className="text-xl font-bold text-white">Book a Session</h2>
                      </div>
                      <button onClick={() => setIsBookingModalOpen(false)}><X size={24} className="text-slate-400 hover:text-white"/></button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-6">
                      {bookingStep === 'mentor' ? (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              {mentors.map(m => (
                                  <div key={m.id} onClick={() => { setSelectedMentor(m); setBookingStep('details'); }} className="bg-slate-800 border border-slate-700 rounded-xl p-4 cursor-pointer hover:border-indigo-500 hover:bg-slate-700/50 transition-all group">
                                      <div className="flex items-center gap-3 mb-3">
                                          <img src={m.imageUrl} className="w-12 h-12 rounded-full object-cover border-2 border-slate-600 group-hover:border-indigo-500"/>
                                          <div>
                                              <h3 className="font-bold text-white line-clamp-1">{m.title}</h3>
                                              <p className="text-xs text-indigo-400 font-bold">{m.voiceName}</p>
                                          </div>
                                      </div>
                                      <p className="text-xs text-slate-400 line-clamp-2">{m.description}</p>
                                  </div>
                              ))}
                          </div>
                      ) : (
                          <div className="space-y-6 max-w-xl mx-auto">
                              <div className="flex items-center gap-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                  <img src={selectedMentor?.imageUrl} className="w-12 h-12 rounded-full"/>
                                  <div>
                                      <h3 className="font-bold text-white">{selectedMentor?.title}</h3>
                                      <p className="text-xs text-slate-400">Selected Mentor</p>
                                  </div>
                              </div>
                              
                              <div className="space-y-4">
                                  <div>
                                      <label className="text-xs font-bold text-slate-500 uppercase">Date</label>
                                      <div className="flex gap-2 overflow-x-auto pb-2 mt-1">
                                          {getNextDays().map(d => (
                                              <button key={d} onClick={() => handleBookingDateSelect(d)} className={`flex-shrink-0 px-4 py-2 rounded-lg border text-sm font-bold ${bookDate === d ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                                                  {new Date(d).toLocaleDateString('en-US', {weekday:'short', day:'numeric'})}
                                              </button>
                                          ))}
                                      </div>
                                  </div>
                                  <div>
                                      <label className="text-xs font-bold text-slate-500 uppercase">Time</label>
                                      <div className="grid grid-cols-5 gap-2 mt-1">
                                          {TIME_SLOTS.map(t => (
                                              <button key={t} onClick={() => setBookTime(t)} className={`py-1.5 rounded-lg border text-xs font-bold ${bookTime === t ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                                                  {t}
                                              </button>
                                          ))}
                                      </div>
                                  </div>
                                  <div>
                                      <label className="text-xs font-bold text-slate-500 uppercase">Topic</label>
                                      <textarea value={bookTopic} onChange={e => setBookTopic(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-indigo-500 mt-1" rows={3} placeholder="What do you want to discuss?"/>
                                  </div>
                                  <div>
                                      <label className="text-xs font-bold text-slate-500 uppercase">Invite Friend (Optional)</label>
                                      <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg p-2 mt-1">
                                          <Mail size={16} className="text-slate-400"/>
                                          <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="bg-transparent w-full text-sm text-white focus:outline-none" placeholder="colleague@email.com"/>
                                      </div>
                                  </div>
                              </div>
                              
                              <button 
                                  onClick={handleBookSession} 
                                  disabled={isBooking || !bookDate || !bookTime || !bookTopic}
                                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2"
                              >
                                  {isBooking ? <Loader2 className="animate-spin"/> : <CheckCircle/>}
                                  <span>Confirm Booking</span>
                              </button>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* --- Recorder Modal --- */}
      {isRecorderModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6 animate-fade-in-up">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2"><Video className="text-red-500"/> Start Recording</h3>
                      <button onClick={() => setIsRecorderModalOpen(false)}><X size={20} className="text-slate-400 hover:text-white"/></button>
                  </div>
                  
                  <div className="space-y-6">
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase">Meeting Title</label>
                          <input 
                              type="text" 
                              value={meetingTitle} 
                              onChange={e => setMeetingTitle(e.target.value)} 
                              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-red-500 mt-1"
                              placeholder="e.g., Weekly Team Sync"
                          />
                      </div>
                      
                      <div className="space-y-4">
                          <div>
                              <label className="text-xs font-bold text-slate-500 uppercase">AI Mode</label>
                              <div className="grid grid-cols-2 gap-3 mt-2">
                                  <button 
                                      onClick={() => setRecorderMode('interactive')}
                                      className={`p-3 rounded-xl border text-left transition-all ${recorderMode === 'interactive' ? 'bg-indigo-900/30 border-indigo-500 ring-1 ring-indigo-500' : 'bg-slate-800 border-slate-700 opacity-60'}`}
                                  >
                                      <div className="flex items-center gap-2 mb-1"><Sparkles size={16} className="text-indigo-400"/><span className="font-bold text-white text-sm">Interactive</span></div>
                                      <p className="text-[10px] text-slate-400">AI participates and answers questions.</p>
                                  </button>
                                  <button 
                                      onClick={() => setRecorderMode('silent')}
                                      className={`p-3 rounded-xl border text-left transition-all ${recorderMode === 'silent' ? 'bg-emerald-900/30 border-emerald-500 ring-1 ring-emerald-500' : 'bg-slate-800 border-slate-700 opacity-60'}`}
                                  >
                                      <div className="flex items-center gap-2 mb-1"><Mic size={16} className="text-emerald-400"/><span className="font-bold text-white text-sm">Silent Scribe</span></div>
                                      <p className="text-[10px] text-slate-400">AI translates and transcribes.</p>
                                  </button>
                              </div>
                          </div>

                          {/* Language Selection */}
                          {recorderMode === 'silent' && (
                              <div className="animate-fade-in">
                                  <label className="text-xs font-bold text-emerald-400 uppercase flex items-center gap-2">
                                      <Languages size={14}/> Translate To
                                  </label>
                                  <select 
                                      value={targetLanguage} 
                                      onChange={(e) => setTargetLanguage(e.target.value)}
                                      className="w-full bg-slate-800 border border-emerald-500/50 rounded-lg p-2.5 mt-1 text-sm text-white focus:outline-none"
                                  >
                                      {TARGET_LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                                  </select>
                                  <p className="text-[10px] text-slate-500 mt-1">AI will translate spoken words into {targetLanguage} in real-time.</p>
                              </div>
                          )}

                          {/* Screen Record Toggle */}
                          <div 
                              onClick={() => setRecordScreen(!recordScreen)}
                              className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${recordScreen ? 'bg-indigo-900/20 border-indigo-500/50' : 'bg-slate-800/30 border-slate-700 hover:bg-slate-800'}`}
                          >
                              <div className="flex items-center gap-3">
                                  <div className={`p-1.5 rounded-full ${recordScreen ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                                      <Monitor size={16} />
                                  </div>
                                  <div>
                                      <p className={`font-bold text-sm ${recordScreen ? 'text-indigo-400' : 'text-slate-400'}`}>Include Screen Share</p>
                                  </div>
                              </div>
                              <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${recordScreen ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-500'}`}>
                                  {recordScreen && <CheckCircle size={12} />}
                              </div>
                          </div>

                          {/* Camera Toggle */}
                          <div 
                              onClick={() => setRecordCamera(!recordCamera)}
                              className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${recordCamera ? 'bg-indigo-900/20 border-indigo-500/50' : 'bg-slate-800/30 border-slate-700 hover:bg-slate-800'}`}
                          >
                              <div className="flex items-center gap-3">
                                  <div className={`p-1.5 rounded-full ${recordCamera ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                                      <Video size={16} />
                                  </div>
                                  <div>
                                      <p className={`font-bold text-sm ${recordCamera ? 'text-indigo-400' : 'text-slate-400'}`}>Include Camera Video</p>
                                  </div>
                              </div>
                              <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${recordCamera ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-500'}`}>
                                  {recordCamera && <CheckCircle size={12} />}
                              </div>
                          </div>
                      </div>

                      <button 
                          onClick={handleStartRecorder}
                          disabled={!meetingTitle}
                          className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2"
                      >
                          <Video size={18} fill="currentColor"/>
                          <span>Start Meeting</span>
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};
