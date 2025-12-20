
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Channel, GeneratedLecture, Chapter, SubTopic, Attachment } from '../types';
import { ArrowLeft, BookOpen, FileText, Download, Loader2, ChevronDown, ChevronRight, ChevronLeft, Check, Printer, FileDown, Info } from 'lucide-react';
import { generateLectureScript } from '../services/lectureGenerator';
import { OFFLINE_CHANNEL_ID, OFFLINE_CURRICULUM, OFFLINE_LECTURES } from '../utils/offlineContent';
import { SPOTLIGHT_DATA } from '../utils/spotlightContent';
import { cacheLectureScript, getCachedLectureScript } from '../utils/db';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface PodcastDetailProps {
  channel: Channel;
  onBack: () => void;
  onStartLiveSession: (context?: string, lectureId?: string, recordingEnabled?: boolean, videoEnabled?: boolean, activeSegment?: { index: number, lectureId: string }, cameraEnabled?: boolean) => void;
  language: 'en' | 'zh';
  onEditChannel?: () => void; 
  onViewComments?: () => void;
  currentUser: any; 
}

const UI_TEXT = {
  en: {
    back: "Back",
    curriculum: "Curriculum",
    selectTopic: "Select a lesson to begin reading",
    generating: "Preparing Material...",
    genDesc: "Our AI is drafting the lecture script.",
    lectureTitle: "Lecture Script",
    downloadPdf: "Download PDF",
    downloadBook: "Download Book",
    exporting: "Generating PDF...",
    preparingBook: "Assembling Course Book...",
    prev: "Prev Lesson",
    next: "Next Lesson",
    noLesson: "No Lesson Selected",
    chooseChapter: "Choose a chapter and lesson from the menu."
  },
  zh: {
    back: "返回",
    curriculum: "课程大纲",
    selectTopic: "选择一个课程开始阅读",
    generating: "正在准备材料...",
    genDesc: "AI 正在编写讲座脚本。",
    lectureTitle: "讲座文稿",
    downloadPdf: "下载 PDF",
    downloadBook: "下载整本课程",
    exporting: "正在生成 PDF...",
    preparingBook: "正在汇编课程书籍...",
    prev: "上一节",
    next: "下一节",
    noLesson: "未选择课程",
    chooseChapter: "请从菜单中选择章节和课程。"
  }
};

export const PodcastDetail: React.FC<PodcastDetailProps> = ({ channel, onBack, language, currentUser }) => {
  const t = UI_TEXT[language];
  const [activeLecture, setActiveLecture] = useState<GeneratedLecture | null>(null);
  const [isLoadingLecture, setIsLoadingLecture] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingBook, setIsExportingBook] = useState(false);
  const [bookLectures, setBookLectures] = useState<GeneratedLecture[]>([]);
  
  const [chapters, setChapters] = useState<Chapter[]>(() => {
    if (channel.chapters && channel.chapters.length > 0) return channel.chapters;
    if (channel.id === OFFLINE_CHANNEL_ID) return OFFLINE_CURRICULUM;
    if (SPOTLIGHT_DATA[channel.id]) return SPOTLIGHT_DATA[channel.id].curriculum;
    return [];
  });
  
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);
  const [activeSubTopicId, setActiveSubTopicId] = useState<string | null>(null);
  
  const lectureContentRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

  const flatCurriculum = useMemo(() => {
    return chapters.flatMap((ch) => 
        (ch.subTopics || []).map((sub) => ({
            id: sub.id,
            title: sub.title
        }))
    );
  }, [chapters]);

  const currentLectureIndex = useMemo(() => {
    return flatCurriculum.findIndex(t => t.id === activeSubTopicId);
  }, [flatCurriculum, activeSubTopicId]);

  useEffect(() => {
      mountedRef.current = true;
      return () => { mountedRef.current = false; };
  }, []);

  const handleTopicClick = async (topicTitle: string, subTopicId?: string) => {
    setActiveSubTopicId(subTopicId || null);
    setActiveLecture(null);
    setIsLoadingLecture(true);
    
    try {
        if (OFFLINE_LECTURES[topicTitle]) { 
            setActiveLecture(OFFLINE_LECTURES[topicTitle]); 
            return; 
        }
        const cacheKey = `lecture_${channel.id}_${subTopicId}_${language}`;
        const cached = await getCachedLectureScript(cacheKey);
        if (cached) { 
            setActiveLecture(cached); 
            return; 
        }
        
        const script = await generateLectureScript(topicTitle, channel.description, language);
        if (script && mountedRef.current) {
          setActiveLecture(script);
          await cacheLectureScript(cacheKey, script);
        }
    } catch (e: any) { 
        console.error(e); 
    } finally { 
        if (mountedRef.current) setIsLoadingLecture(false); 
    }
  };

  const handleExportPDF = async () => {
      if (!activeLecture || !lectureContentRef.current) return;
      
      setIsExporting(true);
      try {
          const element = lectureContentRef.current;
          const canvas = await html2canvas(element, {
              scale: 2,
              useCORS: true,
              backgroundColor: '#ffffff'
          });
          
          const imgData = canvas.toDataURL('image/jpeg', 1.0);
          const pdf = new jsPDF({
              orientation: 'portrait',
              unit: 'px',
              format: 'a4'
          });
          
          const imgProps = pdf.getImageProperties(imgData);
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
          
          pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
          pdf.save(`${activeLecture.topic.replace(/\s+/g, '_')}.pdf`);
      } catch (e) {
          console.error("PDF Export failed", e);
          alert("Failed to generate PDF.");
      } finally {
          setIsExporting(false);
      }
  };

  const handleDownloadFullBook = async () => {
      if (flatCurriculum.length === 0) return;
      setIsExportingBook(true);
      setBookLectures([]);

      try {
          const allLectures: GeneratedLecture[] = [];
          
          for (const item of flatCurriculum) {
              let lecture: GeneratedLecture | null = null;
              
              // 1. Try static
              if (OFFLINE_LECTURES[item.title]) {
                  lecture = OFFLINE_LECTURES[item.title];
              } else if (SPOTLIGHT_DATA[channel.id]?.lectures?.[item.title]) {
                  lecture = SPOTLIGHT_DATA[channel.id].lectures[item.title];
              } else {
                  // 2. Try cache
                  const cacheKey = `lecture_${channel.id}_${item.id}_${language}`;
                  lecture = await getCachedLectureScript(cacheKey);
                  
                  // 3. Generate if missing
                  if (!lecture) {
                      lecture = await generateLectureScript(item.title, channel.description, language);
                      if (lecture) await cacheLectureScript(cacheKey, lecture);
                  }
              }
              
              if (lecture) allLectures.push(lecture);
          }

          setBookLectures(allLectures);
          
          // Wait for render
          await new Promise(r => setTimeout(r, 1500));

          const pdf = new jsPDF({
              orientation: 'portrait',
              unit: 'px',
              format: 'a4'
          });

          for (let i = 0; i < allLectures.length; i++) {
              const el = document.getElementById(`book-lecture-${i}`);
              if (el) {
                  const canvas = await html2canvas(el, {
                      scale: 2,
                      useCORS: true,
                      backgroundColor: '#ffffff'
                  });
                  const imgData = canvas.toDataURL('image/jpeg', 0.95);
                  const imgProps = pdf.getImageProperties(imgData);
                  const pdfWidth = pdf.internal.pageSize.getWidth();
                  const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
                  
                  if (i > 0) pdf.addPage();
                  pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
              }
          }

          pdf.save(`${channel.title.replace(/\s+/g, '_')}_Complete_Course.pdf`);
      } catch (e) {
          console.error("Full book export failed", e);
          alert("Failed to assemble the full course book.");
      } finally {
          setIsExportingBook(false);
          setBookLectures([]);
      }
  };

  const handlePrevLesson = () => { 
    if (currentLectureIndex > 0) { 
      const prev = flatCurriculum[currentLectureIndex - 1]; 
      handleTopicClick(prev.title, prev.id); 
    } 
  };

  const handleNextLesson = () => { 
    if (currentLectureIndex !== -1 && currentLectureIndex < flatCurriculum.length - 1) { 
      const next = flatCurriculum[currentLectureIndex + 1]; 
      handleTopicClick(next.title, next.id); 
    } 
  };

  return (
    <div className="h-full bg-slate-950 text-slate-100 flex flex-col relative overflow-y-auto pb-24">
      {/* Hero Section */}
      <div className="relative h-48 md:h-64 w-full shrink-0">
        <div className="absolute inset-0">
            <img src={channel.imageUrl} alt={channel.title} className="w-full h-full object-cover opacity-40"/>
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />
        </div>
        <div className="absolute top-4 left-4 z-20">
            <button onClick={onBack} className="flex items-center space-x-2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full hover:bg-white/10 transition-colors border border-white/10 text-sm font-medium">
                <ArrowLeft size={16} />
                <span>{t.back}</span>
            </button>
        </div>
        <div className="absolute bottom-0 left-0 w-full p-6 md:p-8 max-w-7xl mx-auto">
           <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{channel.title}</h1>
           <p className="text-sm md:text-base text-slate-300 max-w-2xl line-clamp-2">{channel.description}</p>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 grid grid-cols-12 gap-8">
        {/* Sidebar Curriculum */}
        <div className="col-span-12 lg:col-span-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-800 bg-slate-800/50 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <BookOpen size={16} className="text-indigo-400" />
                        {t.curriculum}
                    </h3>
                    <button 
                        onClick={handleDownloadFullBook}
                        disabled={isExportingBook}
                        className="text-[10px] font-bold text-indigo-400 hover:text-white flex items-center gap-1 transition-colors px-2 py-1 bg-indigo-500/10 rounded-md border border-indigo-500/20"
                        title="Download all lessons as one PDF book"
                    >
                        {isExportingBook ? <Loader2 size={10} className="animate-spin"/> : <Download size={10}/>}
                        {isExportingBook ? t.exporting : t.downloadPdf}
                    </button>
                </div>
                <div className="divide-y divide-slate-800">
                    {chapters.map((ch) => (
                        <div key={ch.id}>
                            <button 
                                onClick={() => setExpandedChapterId(expandedChapterId === ch.id ? null : ch.id)} 
                                className="w-full flex items-center justify-between p-4 hover:bg-slate-800 transition-colors text-left"
                            >
                                <span className="font-semibold text-sm text-slate-200">{ch.title}</span>
                                {expandedChapterId === ch.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                            {expandedChapterId === ch.id && (
                                <div className="bg-slate-950/50 py-1">
                                    {ch.subTopics.map((sub) => (
                                        <button 
                                            key={sub.id} 
                                            onClick={() => handleTopicClick(sub.title, sub.id)} 
                                            className={`w-full flex items-start space-x-3 px-6 py-3 text-left transition-colors ${activeSubTopicId === sub.id ? 'bg-indigo-900/30 border-l-4 border-indigo-500' : 'hover:bg-slate-800'}`}
                                        >
                                            <span className={`text-sm ${activeSubTopicId === sub.id ? 'text-indigo-200 font-bold' : 'text-slate-400'}`}>
                                                {sub.title}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* Content Area */}
        <div className="col-span-12 lg:col-span-8">
          {isLoadingLecture ? (
             <div className="h-64 flex flex-col items-center justify-center p-12 text-center bg-slate-900/50 rounded-2xl border border-slate-800 animate-pulse">
                <Loader2 size={40} className="text-indigo-500 animate-spin mb-4" />
                <h3 className="text-lg font-bold text-white">{t.generating}</h3>
                <p className="text-slate-400 text-sm mt-1">{t.genDesc}</p>
             </div>
          ) : activeLecture ? (
            <div className="space-y-6">
                {/* Static Toolbar */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-white">{activeLecture.topic}</h2>
                        <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mt-1">{t.lectureTitle}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={handleExportPDF} 
                            disabled={isExporting}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-lg text-sm font-bold shadow-lg transition-all"
                        >
                            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                            <span>{isExporting ? t.exporting : t.downloadPdf}</span>
                        </button>
                    </div>
                </div>

                {/* Readable Content */}
                <div 
                    ref={lectureContentRef}
                    className="bg-white rounded-2xl p-8 md:p-12 shadow-2xl text-slate-900 space-y-8"
                >
                    <div className="border-b border-slate-200 pb-6 mb-8">
                        <h1 className="text-3xl font-black text-slate-900 mb-2">{activeLecture.topic}</h1>
                        <div className="flex gap-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
                            <span>Speaker A: {activeLecture.professorName}</span>
                            <span>•</span>
                            <span>Speaker B: {activeLecture.studentName}</span>
                        </div>
                    </div>

                    <div className="space-y-10">
                        {activeLecture.sections.map((section, idx) => (
                            <div key={idx} className="flex gap-6">
                                <div className="shrink-0 w-12 flex flex-col items-center">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[10px] font-black border-2 ${section.speaker === 'Teacher' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                        {section.speaker === 'Teacher' ? 'PRO' : 'STU'}
                                    </div>
                                    <div className="w-0.5 flex-1 bg-slate-100 mt-2"></div>
                                </div>
                                <div className="flex-1 pb-4">
                                    <p className="text-[10px] font-black text-slate-400 uppercase mb-2">
                                        {section.speaker === 'Teacher' ? activeLecture.professorName : activeLecture.studentName}
                                    </p>
                                    <p className="text-lg leading-relaxed font-serif text-slate-800">
                                        {section.text}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <div className="pt-12 border-t border-slate-100 flex justify-between items-center opacity-50">
                        <span className="text-[10px] font-bold text-slate-400">GENERATED BY AIVOICECAST</span>
                        <span className="text-[10px] font-bold text-slate-400">{new Date().toLocaleDateString()}</span>
                    </div>
                </div>

                {/* Footer Navigation */}
                <div className="flex justify-between items-center py-4 px-2">
                    <button 
                        onClick={handlePrevLesson} 
                        disabled={currentLectureIndex <= 0} 
                        className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white disabled:opacity-20 transition-colors"
                    >
                        <ChevronLeft size={20} />
                        {t.prev}
                    </button>
                    <button 
                        onClick={handleNextLesson} 
                        disabled={currentLectureIndex === -1 || currentLectureIndex >= flatCurriculum.length - 1} 
                        className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white disabled:opacity-20 transition-colors"
                    >
                        {t.next}
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
                <Info size={32} className="mb-2 opacity-20" />
                <h3 className="text-lg font-bold text-slate-400">{t.selectTopic}</h3>
                <p className="text-xs text-slate-600 mt-1">{t.chooseChapter}</p>
            </div>
          )}
        </div>
      </main>

      {/* Hidden container for full book PDF assembly */}
      {(isExportingBook && bookLectures.length > 0) && (
          <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '595px' }}>
              <div className="bg-white p-12 text-center" id="book-lecture-cover">
                  <h1 className="text-4xl font-black text-slate-900 mt-40">{channel.title}</h1>
                  <p className="text-xl text-slate-600 mt-4">Complete Course Transcript</p>
                  <p className="text-sm text-slate-400 mt-80 uppercase tracking-widest font-bold">AIVoiceCast Platform</p>
              </div>
              {bookLectures.map((lec, lIdx) => (
                  <div key={lIdx} id={`book-lecture-${lIdx}`} className="bg-white p-10 min-h-[842px] flex flex-col">
                      <div className="border-b-2 border-slate-100 pb-4 mb-8">
                          <h2 className="text-2xl font-black text-slate-900">Lesson {lIdx + 1}: {lec.topic}</h2>
                      </div>
                      <div className="space-y-8 flex-1">
                          {lec.sections.map((sec, sIdx) => (
                              <div key={sIdx} className="flex gap-4">
                                  <div className="shrink-0 w-10 text-[8px] font-bold text-slate-400 uppercase py-1">
                                      {sec.speaker === 'Teacher' ? lec.professorName : lec.studentName}
                                  </div>
                                  <div className="flex-1">
                                      <p className="text-base font-serif text-slate-800 leading-relaxed">{sec.text}</p>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              ))}
          </div>
      )}
    </div>
  );
};
