import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Channel, Booking, TodoItem } from '../types';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Briefcase, Plus, Video, CheckCircle, X, Users, Loader2, Mic, Play, Mail, Sparkles, ArrowLeft, Monitor, Filter, LayoutGrid, List, Languages, CloudSun, Wind, BookOpen, CheckSquare, Square, Trash2, StopCircle, Download, FileText, Check, Podcast, RefreshCw } from 'lucide-react';
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
  }, [currentUser, isBookingModalOpen]);

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
              
              // SHORTENED PROMPT to prevent TTS Timeouts (30s limit)
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
              
              // Update state so we don't regenerate next time
              setExplanationText(script);

              // Save to Cloud immediately if user is logged in
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
          
          // Try Neural TTS first (uses IndexedDB cache for audio)
          const result = await synthesizeSpeech(script, 'Zephyr', ctx);
          
          if (result.buffer) {
              // High Quality Success
              const source = ctx.createBufferSource();
              source.buffer = result.buffer;
              source.connect(ctx.destination);
              source.onended = () => {
                  setIsPlayingDailyWord(false);
              };
              source.start(0);
              wordSourceRef.current = source;
          } else {
              // Fallback to System TTS on Error/Timeout/Quota
              console.warn("Neural TTS failed or timed out. Falling back to system voice.", result.errorMessage);
              
              const u = new SpeechSynthesisUtterance(script);
              
              // Attempt to pick a decent English voice
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

  // 1. Grid Indicators (Pre-filtered by ownership if needed)
  const eventsByDate = useMemo(() => {
    const map: Record<string, { channels: Channel[], bookings: Booking[], todos: TodoItem[] }> = {};
    
    channels.forEach(c => {
      // Check ownership filter for indicators
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

  // 2. Filtered Events based on View Mode AND Ownership
  const filteredData = useMemo(() => {
      let filteredChannels = [] as Channel[];
      let filteredBookings = [] as Booking[];
      let filteredTodos = [] as TodoItem[];

      const startDay = getStartOfDay(selectedDate);
      const startMonth = getStartOfMonth(displayDate); 
      const endMonth = getEndOfMonth(displayDate);

      const filterItem = (itemDate: Date, channel?: Channel) => {
          if (viewMode === 'day') {
              return isSameDate(itemDate, selectedDate);
          }
          else if (viewMode === 'week') {
              // 2 Weeks Range Logic: 1 week before + 1 week after selected date
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

      // Filter Channels
      filteredChannels = channels.filter(c => {
          if (!c.createdAt) return false;
          const itemDate = new Date(c.createdAt);
          
          // Timezone / Recency Check: Include if created within last hour regardless of strict date
          const isRecent = (Date.now() - c.createdAt) < 3600000; // 1 hour
          const dateMatch = filterItem(itemDate, c);
          
          if (filterScope === 'mine') {
              const isOwner = currentUser && c.ownerId === currentUser.uid;
              if (isOwner && isRecent) return true; // Always show recent creations
              return isOwner && dateMatch;
          }
          return dateMatch;
      });

      filteredBookings = bookings.filter(b => {
          const bDate = new Date(`${b.date}T${b.time}`);
          return filterItem(bDate);
      });
      filteredTodos = todos.filter(t => filterItem(new Date(t.date)));

      filteredChannels.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      filteredBookings.sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());

      return { channels: filteredChannels, bookings: filteredBookings, todos: filteredTodos };
  }, [channels, bookings, todos, selectedDate, displayDate, viewMode, filterScope, currentUser]);

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

  const