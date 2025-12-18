import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Channel, UserProfile, GeneratedLecture } from '../types';
import { Play, MessageSquare, Heart, Share2, Bookmark, Music, Plus, Pause, Loader2, Volume2, VolumeX, GraduationCap, ChevronRight, Mic, AlignLeft, BarChart3, User, AlertCircle, Zap, Radio, Square, Sparkles } from 'lucide-react';
import { ChannelCard } from './ChannelCard';
import { CreatorProfileModal } from './CreatorProfileModal';
import { followUser, unfollowUser } from '../services/firestoreService';
import { generateLectureScript } from '../services/lectureGenerator';
import { synthesizeSpeech } from '../services/tts';
import { getCachedLectureScript, cacheLectureScript } from '../utils/db';
import { SPOTLIGHT_DATA } from '../utils/spotlightContent';
import { OFFLINE_CHANNEL_ID, OFFLINE_CURRICULUM, OFFLINE_LECTURES } from '../utils/offlineContent';

let sharedAudioContext: AudioContext | null = null;
let globalStopPlayback: (() => void) | null = null;

const getSharedAudioContext = () => {
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
        sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return sharedAudioContext;
};

const MobileFeedCard = ({ 
    channel, isActive, onToggleLike, isLiked, isBookmarked, isFollowed, 
    onToggleBookmark, onToggleFollow, onShare, onComment, 
    onProfileClick, onChannelClick, onChannelFinish 
}: any) => {
    const [playbackState, setPlaybackState] = useState<'idle' | 'buffering' | 'playing' | 'error'>('idle');
    const [statusMessage, setStatusMessage] = useState('');
    const [transcript, setTranscript] = useState<{speaker: string, text: string} | null>(null);
    const [provider, setProvider] = useState<'system' | 'gemini' | 'openai'>(() => {
        return 'gemini'; // Defaulting to environment provider
    });
    const providerRef = useRef<'system' | 'gemini' | 'openai'>(provider); 
    const [trackIndex, setTrackIndex] = useState(-1); 
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const mountedRef = useRef(true);
    const playbackSessionRef = useRef(0); 
    const isActiveRef = useRef(isActive); 
    const preloadedScriptRef = useRef<Promise<GeneratedLecture | null> | null>(null);

    useEffect(() => { providerRef.current = provider; }, [provider]);
    useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

    const flatCurriculum = useMemo(() => {
        let chapters = channel.chapters;
        if (!chapters || chapters.length === 0) {
            if (channel.id === OFFLINE_CHANNEL_ID) chapters = OFFLINE_CURRICULUM;
            else if (SPOTLIGHT_DATA[channel.id]) chapters = SPOTLIGHT_DATA[channel.id].curriculum;
        }
        if (!chapters) return [];
        return chapters.flatMap((ch: any, cIdx: number) => 
            (ch.subTopics || []).map((sub: any, lIdx: number) => ({
                chapterIndex: cIdx, lessonIndex: lIdx, title: sub.title, id: sub.id, chapterTitle: ch.title
            }))
        );
    }, [channel]);

    const totalLessons = flatCurriculum.length;

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; stopAudio(); };
    }, []);

    const stopAudio = useCallback(() => {
        window.speechSynthesis.cancel();
        if (sourceRef.current) {
            try { sourceRef.current.stop(); } catch(e) {}
            sourceRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (isActive) {
            const introText = channel.welcomeMessage || channel.description || `Welcome to ${channel.title}.`;
            setTranscript({ speaker: 'Host', text: introText });
            setTrackIndex(-1); setStatusMessage("");
            const timer = setTimeout(() => { attemptAutoPlay(); }, 600); 
            return () => {
                clearTimeout(timer); playbackSessionRef.current++; stopAudio();
            };
        } else {
            stopAudio(); setPlaybackState('idle'); playbackSessionRef.current++;
            preloadedScriptRef.current = null;
        }
    }, [isActive, channel.id]);

    const attemptAutoPlay = async () => {
        if (playbackState === 'playing' || playbackState === 'buffering') return;
        if (globalStopPlayback && globalStopPlayback !== stopAudio) globalStopPlayback();
        globalStopPlayback = stopAudio;
        const ctx = getSharedAudioContext();
        if (ctx.state === 'suspended') { try { await ctx.resume(); } catch(e) {} }
        runTrackSequence(-1, ++playbackSessionRef.current);
    };

    const handleStop = (e: React.MouseEvent) => {
        e.stopPropagation(); stopAudio(); playbackSessionRef.current++; 
        setPlaybackState('idle'); setStatusMessage("Stopped"); setTrackIndex(-1);
    };

    const handleTogglePlay = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isActive) { onChannelClick(channel.id); if (globalStopPlayback) globalStopPlayback(); return; }
        if (playbackState === 'playing' || playbackState === 'buffering') { stopAudio(); playbackSessionRef.current++; setPlaybackState('idle'); setStatusMessage("Paused"); return; }
        if (globalStopPlayback && globalStopPlayback !== stopAudio) globalStopPlayback();
        globalStopPlayback = stopAudio;
        const ctx = getSharedAudioContext();
        if (ctx.state === 'suspended') { try { await ctx.resume(); } catch(e) {} }
        runTrackSequence(trackIndex >= totalLessons ? -1 : trackIndex, ++playbackSessionRef.current);
    };

    const toggleTtsMode = (e: React.MouseEvent) => {
        e.stopPropagation();
        let newMode: 'system' | 'gemini' | 'openai' = 'system';
        if (provider === 'gemini') newMode = 'openai';
        else if (provider === 'openai') newMode = 'system';
        else newMode = 'gemini';
        setProvider(newMode);
        if (playbackState === 'playing' || playbackState === 'buffering') {
            stopAudio(); playbackSessionRef.current++;
            setTimeout(() => { runTrackSequence(trackIndex === -1 ? -1 : trackIndex, ++playbackSessionRef.current); }, 100);
        }
    };

    const playAudioBuffer = (buffer: AudioBuffer, sessionId: number): Promise<void> => {
        return new Promise(async (resolve) => {
            if (!mountedRef.current || !isActiveRef.current || sessionId !== playbackSessionRef.current) { resolve(); return; }
            const ctx = getSharedAudioContext();
            const source = ctx.createBufferSource();
            source.buffer = buffer; source.connect(ctx.destination);
            sourceRef.current = source;
            source.onended = () => { sourceRef.current = null; resolve(); };
            source.start(0);
        });
    };

    const playSystemAudio = (text: string, voiceName: string, sessionId: number): Promise<void> => {
        return new Promise((resolve) => {
            if (!mountedRef.current || !isActiveRef.current || sessionId !== playbackSessionRef.current) { resolve(); return; }
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            const voices = window.speechSynthesis.getVoices();
            const v = voices.find(v => v.name.includes(voiceName)) || voices.find(v => v.lang.startsWith('en'));
            if (v) utterance.voice = v;
            utterance.rate = 1.1; 
            utterance.onend = () => resolve();
            utterance.onerror = () => resolve();
            window.speechSynthesis.speak(utterance);
        });
    };

    const runTrackSequence = async (startIndex: number, sessionId: number) => {
        setPlaybackState('playing');
        let currentIndex = startIndex;
        while (mountedRef.current && isActiveRef.current && sessionId === playbackSessionRef.current) {
            try {
                setTrackIndex(currentIndex); 
                let textParts: {speaker: string, text: string, voice: string}[] = [];
                let hostVoice = channel.voiceName || 'Puck';
                let studentVoice = 'Zephyr';

                if (currentIndex === -1) {
                    const introText = channel.welcomeMessage || channel.description || `Welcome to ${channel.title}.`;
                    setTranscript({ speaker: 'Host', text: introText });
                    setStatusMessage("Intro...");
                    textParts = [{ speaker: 'Host', text: introText, voice: hostVoice }];
                    if (flatCurriculum.length > 0) preloadedScriptRef.current = fetchLectureData(flatCurriculum[0]);
                } else {
                    if (currentIndex >= flatCurriculum.length) { setStatusMessage("Finished"); setPlaybackState('idle'); if (onChannelFinish) onChannelFinish(); break; }
                    const lessonMeta = flatCurriculum[currentIndex];
                    let lecture = null;
                    if (preloadedScriptRef.current) { setStatusMessage(`Loading...`); lecture = await preloadedScriptRef.current; preloadedScriptRef.current = null; }
                    else { setStatusMessage(`Generating...`); setPlaybackState('buffering'); lecture = await fetchLectureData(lessonMeta); }
                    if (sessionId !== playbackSessionRef.current) return;
                    if (!lecture || !lecture.sections || lecture.sections.length === 0) { currentIndex++; continue; }
                    setPlaybackState('playing');
                    setStatusMessage("Playing");
                    textParts = lecture.sections.map((s: any) => ({
                        speaker: s.speaker === 'Teacher' ? lecture.professorName : lecture.studentName,
                        text: s.text,
                        voice: s.speaker === 'Teacher' ? hostVoice : studentVoice
                    }));
                    if (currentIndex + 1 < flatCurriculum.length) preloadedScriptRef.current = fetchLectureData(flatCurriculum[currentIndex + 1]);
                }

                for (let i = 0; i < textParts.length; i++) {
                    if (sessionId !== playbackSessionRef.current) return;
                    const part = textParts[i];
                    setTranscript({ speaker: part.speaker, text: part.text });
                    if (providerRef.current === 'system') {
                        await playSystemAudio(part.text, part.voice, sessionId);
                    } else {
                        const audioResult = await synthesizeSpeech(part.text, part.voice, getSharedAudioContext());
                        if (sessionId !== playbackSessionRef.current) return;
                        if (audioResult && audioResult.buffer) { await playAudioBuffer(audioResult.buffer, sessionId); } 
                        else { await playSystemAudio(part.text, part.voice, sessionId); }
                    }
                    if (sessionId !== playbackSessionRef.current) return;
                    await new Promise(r => setTimeout(r, 200));
                }
                currentIndex++;
            } catch (e) { break; }
        }
    };

    const fetchLectureData = async (meta: any) => {
        if (OFFLINE_LECTURES[meta.title]) return OFFLINE_LECTURES[meta.title];
        if (SPOTLIGHT_DATA[channel.id]?.lectures?.[meta.title]) return SPOTLIGHT_DATA[channel.id].lectures[meta.title];
        const cacheKey = `lecture_${channel.id}_${meta.id}_en`;
        let data = await getCachedLectureScript(cacheKey);
        if (!data) {
            data = await generateLectureScript(meta.title, `Podcast: ${channel.title}. ${channel.description}`, 'en');
            if (data) await cacheLectureScript(cacheKey, data);
        }
        return data;
    };

    // Sanitize technical labels like gen-lang-client
    const getDisplaySpeaker = (speaker: string) => {
        if (speaker === 'Host' || speaker.includes('gen-lang-client') || speaker.startsWith('model')) {
            return channel.voiceName || 'Gemini';
        }
        return speaker;
    };

    return (
        <div className="h-full w-full snap-start relative flex flex-col justify-center bg-slate-900 border-b border-slate-800">
            <div className="absolute inset-0">
                <img src={channel.imageUrl} alt={channel.title} className="w-full h-full object-cover opacity-60" loading={isActive ? "eager" : "lazy"} />
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/90"></div>
                <div className="absolute top-20 right-4 z-30 flex flex-col items-end gap-2">
                    <button onClick={toggleTtsMode} className="backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 border text-xs font-bold shadow-lg transition-all bg-indigo-900/60 border-indigo-500/50 text-indigo-300">
                        {provider === 'openai' ? <Sparkles size={12} fill="currentColor"/> : provider === 'gemini' ? <Zap size={12} fill="currentColor"/> : <Radio size={12} />}
                        <span>{provider.toUpperCase()}</span>
                    </button>
                    {statusMessage && (
                        <div className="backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 border shadow-lg bg-black/60 border-white/10">
                            {playbackState === 'buffering' ? <Loader2 size={12} className="animate-spin text-indigo-400" /> : <Music size={12} className="text-slate-400" />}
                            <span className="text-[10px] font-bold text-white uppercase tracking-wider">{statusMessage}</span>
                        </div>
                    )}
                </div>
                {transcript && (
                    <div className="absolute top-1/2 left-4 right-16 -translate-y-1/2 pointer-events-none z-10">
                        <div className="bg-black/40 backdrop-blur-sm p-6 rounded-3xl border-l-4 border-indigo-500/50 shadow-2xl animate-fade-in-up">
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${transcript.speaker === 'Host' ? 'text-emerald-400' : 'text-indigo-400'}`}>{getDisplaySpeaker(transcript.speaker)}</span>
                            </div>
                            <p className="text-xl md:text-2xl text-white font-medium leading-relaxed drop-shadow-md">"{transcript.text}"</p>
                        </div>
                    </div>
                )}
            </div>
            {/* Action column and description omitted for brevity - same as original */}
            <div className="absolute right-2 bottom-40 flex flex-col items-center gap-6 z-30">
                <div className="relative mb-2 cursor-pointer" onClick={(e) => { e.stopPropagation(); onProfileClick(e, channel); }}>
                    <img src={channel.imageUrl} className="w-12 h-12 rounded-full border-2 object-cover" alt="Creator" />
                </div>
                <button onClick={(e) => onToggleLike(e, channel.id)} className="flex flex-col items-center gap-1"><Heart size={32} fill={isLiked ? "#ef4444" : "rgba(255,255,255,0.9)"} className={isLiked ? "text-red-500" : "text-white"} /><span className="text-white text-xs font-bold">{channel.likes}</span></button>
                <button onClick={(e) => onComment(e, channel)} className="flex flex-col items-center gap-1"><MessageSquare size={32} fill="white" className="text-white" /><span className="text-white text-xs font-bold">{channel.comments?.length || 0}</span></button>
                <button onClick={(e) => onShare(e, channel)} className="flex flex-col items-center gap-1"><Share2 size={32} fill="rgba(255,255,255,0.9)" className="text-white" /><span className="text-white text-xs font-bold">Share</span></button>
            </div>
            <div className="absolute left-0 bottom-0 w-full p-4 pb-6 bg-gradient-to-t from-black via-black/80 to-transparent z-30 pr-20">
                <div className="flex items-center gap-3 mb-2">
                    <button onClick={handleTogglePlay} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg ${playbackState === 'playing' ? 'bg-slate-800 text-indigo-400' : 'bg-white text-black'}`}>
                        {playbackState === 'buffering' ? <Loader2 size={20} className="animate-spin" /> : playbackState === 'playing' ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                    </button>
                    <div>
                        <div className="flex items-center gap-1.5 text-white font-bold text-lg"><span>@{channel.author}</span></div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Host</p>
                    </div>
                </div>
                <p className="text-white/80 text-sm mb-3 line-clamp-2">{channel.description}</p>
            </div>
        </div>
    );
};

// Fix: define missing PodcastFeedProps interface
interface PodcastFeedProps {
  channels: Channel[];
  onChannelClick: (id: string) => void;
  onStartLiveSession: (channel: Channel, context?: string, recording?: boolean) => void;
  userProfile: UserProfile | null;
  globalVoice: string;
  onRefresh?: () => void;
  onMessageCreator?: (channel: Channel) => void;
  t: any;
  currentUser: any;
  setChannelToEdit: (channel: Channel) => void;
  setIsSettingsModalOpen: (open: boolean) => void;
  onCommentClick?: (channel: Channel) => void;
  handleVote: (id: string, type: 'like' | 'dislike', e: React.MouseEvent) => void;
  filterMode?: 'foryou' | 'mine';
}

export const PodcastFeed: React.FC<PodcastFeedProps> = ({ 
  channels, onChannelClick, onStartLiveSession, userProfile, globalVoice, onRefresh, onMessageCreator,
  t, currentUser, setChannelToEdit, setIsSettingsModalOpen, onCommentClick, handleVote, filterMode = 'foryou'
}) => {
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : true);
  const [viewingCreator, setViewingCreator] = useState<Channel | null>(null);

  useEffect(() => {
      const handleResize = () => setIsDesktop(window.innerWidth >= 768);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const [likedChannels, setLikedChannels] = useState<Set<string>>(new Set());
  const [followedChannels, setFollowedChannels] = useState<Set<string>>(new Set());

  useEffect(() => {
      if (userProfile?.likedChannelIds) setLikedChannels(new Set(userProfile.likedChannelIds));
      if (userProfile?.following) {
          const followedOwners = new Set(userProfile.following);
          const channelIds = channels.filter(c => c.ownerId && followedOwners.has(c.ownerId)).map(c => c.id);
          setFollowedChannels(new Set(channelIds));
      }
  }, [userProfile, channels]);

  const recommendedChannels = useMemo(() => {
      if (filterMode === 'mine') return channels.filter(c => currentUser && c.ownerId === currentUser.uid);
      return channels;
  }, [channels, filterMode, currentUser]);

  useEffect(() => { if (!isDesktop && recommendedChannels.length > 0 && !activeChannelId) setActiveChannelId(recommendedChannels[0].id); }, [recommendedChannels, isDesktop]);

  const toggleLike = (e: React.MouseEvent, channelId: string) => { e.stopPropagation(); if (!currentUser) return alert("Sign in."); const newSet = new Set(likedChannels); if (newSet.has(channelId)) { newSet.delete(channelId); handleVote?.(channelId, 'dislike', e); } else { newSet.add(channelId); handleVote?.(channelId, 'like', e); } setLikedChannels(newSet); };
  const toggleFollow = async (e: React.MouseEvent, channelId: string, ownerId?: string) => { e.stopPropagation(); if (!currentUser || !ownerId) return; const newSet = new Set(followedChannels); if (newSet.has(channelId)) { newSet.delete(channelId); setFollowedChannels(newSet); try { await unfollowUser(currentUser.uid, ownerId); } catch(err) {} } else { newSet.add(channelId); setFollowedChannels(newSet); try { await followUser(currentUser.uid, ownerId); } catch(err) {} } };

  if (isDesktop) {
      return (
        <div className="h-full overflow-y-auto p-6 scrollbar-thin">
            <div className="max-w-7xl mx-auto">
                <h2 className="text-2xl font-bold text-white mb-6">Explore Podcasts</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {recommendedChannels.map(channel => (
                        <ChannelCard key={channel.id} channel={channel} handleChannelClick={onChannelClick} handleVote={handleVote || (() => {})} currentUser={currentUser} setChannelToEdit={setChannelToEdit || (() => {})} setIsSettingsModalOpen={setIsSettingsModalOpen || (() => {})} globalVoice={globalVoice} t={t || { host: 'Host' }} onCommentClick={onCommentClick || (() => {})} isLiked={userProfile?.likedChannelIds?.includes(channel.id)} onCreatorClick={(e) => { e.stopPropagation(); setViewingCreator(channel); }} />
                    ))}
                </div>
            </div>
        </div>
      );
  }

  return (
    <div className="h-[calc(100vh-64px)] w-full bg-black overflow-y-scroll snap-y snap-mandatory scroll-smooth relative">
        {recommendedChannels.map((channel) => (
            <div key={channel.id} data-id={channel.id} className="feed-card h-full w-full snap-start">
                <MobileFeedCard channel={channel} isActive={activeChannelId === channel.id} isLiked={likedChannels.has(channel.id)} isFollowed={followedChannels.has(channel.id) || (userProfile?.following?.includes(channel.ownerId || ''))} onToggleLike={toggleLike} onToggleFollow={toggleFollow} onProfileClick={(e: any, ch: any) => setViewingCreator(ch)} onChannelClick={onChannelClick} onChannelFinish={() => {}} />
            </div>
        ))}
    </div>
  );
};