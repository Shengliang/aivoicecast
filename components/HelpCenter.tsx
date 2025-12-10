
import React, { useState } from 'react';
import { ArrowLeft, BookOpen, Shield, DollarSign, HelpCircle, ChevronDown, ChevronRight, Mail } from 'lucide-react';

interface HelpCenterProps {
  onBack: () => void;
}

export const HelpCenter: React.FC<HelpCenterProps> = ({ onBack }) => {
  const [activeCategory, setActiveCategory] = useState<'general' | 'mentorship' | 'payments'>('general');
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);

  const toggleFaq = (id: string) => {
    setOpenFaqId(openFaqId === id ? null : id);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <div className="p-4 border-b border-slate-900 flex items-center sticky top-0 bg-slate-950/90 backdrop-blur-md z-20">
        <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors mr-3">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-white">Help Center & Policies</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-4xl mx-auto w-full">
        
        {/* Categories */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
            <button 
                onClick={() => setActiveCategory('general')} 
                className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap flex items-center gap-2 transition-colors ${activeCategory === 'general' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}
            >
                <HelpCircle size={16}/> General
            </button>
            <button 
                onClick={() => setActiveCategory('mentorship')} 
                className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap flex items-center gap-2 transition-colors ${activeCategory === 'mentorship' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}
            >
                <BookOpen size={16}/> Mentorship
            </button>
            <button 
                onClick={() => setActiveCategory('payments')} 
                className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap flex items-center gap-2 transition-colors ${activeCategory === 'payments' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}
            >
                <DollarSign size={16}/> Payments & Fees
            </button>
        </div>

        {/* Content */}
        <div className="space-y-6">
            
            {activeCategory === 'general' && (
                <div className="space-y-4 animate-fade-in">
                    <h2 className="text-2xl font-bold text-white mb-4">Platform Basics</h2>
                    
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                        <h3 className="font-bold text-white mb-2">What is AIVoiceCast?</h3>
                        <p className="text-slate-400 text-sm leading-relaxed">
                            AIVoiceCast is an interactive learning platform that combines AI-generated audio courses with real-time mentorship. You can create podcasts on any topic, listen to them, and book sessions with human or AI mentors to dive deeper.
                        </p>
                    </div>

                    <FaqItem 
                        id="g1" 
                        question="Is the platform free?" 
                        answer="We offer a Free Tier that includes listening to public podcasts and basic AI generation. To access advanced features like Neural Voices, private groups, and unlimited generation, you can upgrade to the Pro plan." 
                        isOpen={openFaqId === 'g1'} 
                        onToggle={() => toggleFaq('g1')}
                    />
                    <FaqItem 
                        id="g2" 
                        question="How do I delete my account?" 
                        answer="You can request account deletion in the Settings menu under the 'General' tab. Please note this action is permanent and will remove all your podcasts and data." 
                        isOpen={openFaqId === 'g2'} 
                        onToggle={() => toggleFaq('g2')}
                    />
                </div>
            )}

            {activeCategory === 'mentorship' && (
                <div className="space-y-4 animate-fade-in">
                    <h2 className="text-2xl font-bold text-white mb-4">Mentorship Program</h2>
                    
                    <div className="bg-gradient-to-r from-indigo-900/30 to-purple-900/30 border border-indigo-500/30 rounded-xl p-6 mb-6">
                        <div className="flex items-start gap-3">
                            <Shield className="text-indigo-400 shrink-0 mt-1" size={24} />
                            <div>
                                <h3 className="font-bold text-white mb-1">Become a Verified Mentor</h3>
                                <p className="text-sm text-slate-300 leading-relaxed mb-3">
                                    Approved mentors receive a special badge, increased visibility in the directory, and the ability to charge for sessions.
                                </p>
                                <p className="text-xs text-indigo-300 font-bold uppercase">Requirements:</p>
                                <ul className="text-xs text-slate-400 list-disc pl-4 mt-1 space-y-1">
                                    <li>Complete profile with bio and expertise tags</li>
                                    <li>Upload resume for verification (via Career Center)</li>
                                    <li>Consistent community activity</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <FaqItem 
                        id="m1" 
                        question="How do I set my hourly rate?" 
                        answer="Once approved as a mentor, go to your Profile Settings. You will see an option to enable 'Paid Sessions' and set your hourly rate in USD. This rate will be displayed on your booking card." 
                        isOpen={openFaqId === 'm1'} 
                        onToggle={() => toggleFaq('m1')}
                    />
                    <FaqItem 
                        id="m2" 
                        question="What happens if a student misses a session?" 
                        answer="We have a 24-hour cancellation policy. If a student cancels less than 24 hours before the session, you (the mentor) will still receive a partial payout. If they no-show, you receive the full amount." 
                        isOpen={openFaqId === 'm2'} 
                        onToggle={() => toggleFaq('m2')}
                    />
                </div>
            )}

            {activeCategory === 'payments' && (
                <div className="space-y-4 animate-fade-in">
                    <h2 className="text-2xl font-bold text-white mb-4">Payments & Fees Policy</h2>
                    
                    {/* FEE BREAKDOWN CARD */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <div className="bg-slate-950/50 p-4 border-b border-slate-800">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <DollarSign size={18} className="text-emerald-400"/> Fee Structure
                            </h3>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <h4 className="text-sm font-bold text-slate-400 uppercase mb-2">For Mentors</h4>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg">
                                        <span className="text-sm text-white">Your Earnings</span>
                                        <span className="text-sm font-bold text-emerald-400">90%</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg">
                                        <span className="text-sm text-white">Platform Fee</span>
                                        <span className="text-sm font-bold text-slate-400">10%</span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2">
                                        Platform fees cover server costs, payment processing (Stripe), and marketing your profile to students.
                                    </p>
                                </div>
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-slate-400 uppercase mb-2">Payout Schedule</h4>
                                <ul className="space-y-2 text-sm text-slate-300">
                                    <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5"></div> Payouts are processed via Stripe Connect.</li>
                                    <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5"></div> Earnings are held in escrow for 48 hours after a session completes to ensure satisfaction.</li>
                                    <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5"></div> Transfers to your bank account occur weekly on Mondays.</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <FaqItem 
                        id="p1" 
                        question="How do I get paid?" 
                        answer="You must connect a valid bank account or debit card via the 'Settings > Billing > Connect Stripe' button. We do not store your banking information; it is handled securely by Stripe." 
                        isOpen={openFaqId === 'p1'} 
                        onToggle={() => toggleFaq('p1')}
                    />
                    <FaqItem 
                        id="p2" 
                        question="Refund Policy" 
                        answer="Students can request a refund if a mentor does not show up or if there are technical issues with the platform. Refund requests must be submitted within 24 hours of the session end time." 
                        isOpen={openFaqId === 'p2'} 
                        onToggle={() => toggleFaq('p2')}
                    />
                </div>
            )}

        </div>

        <div className="mt-12 pt-8 border-t border-slate-900 text-center text-slate-500 text-sm">
            <p className="mb-2">Still have questions?</p>
            <a href="mailto:support@aivoicecast.com" className="inline-flex items-center gap-2 text-indigo-400 hover:text-white transition-colors font-bold">
                <Mail size={16}/> Contact Support
            </a>
        </div>
      </div>
    </div>
  );
};

const FaqItem = ({ id, question, answer, isOpen, onToggle }: { id: string, question: string, answer: string, isOpen: boolean, onToggle: () => void }) => (
    <div className="border border-slate-800 rounded-xl bg-slate-900/50 overflow-hidden">
        <button 
            onClick={onToggle}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-800 transition-colors"
        >
            <span className="font-bold text-slate-200 text-sm">{question}</span>
            {isOpen ? <ChevronDown size={16} className="text-indigo-400"/> : <ChevronRight size={16} className="text-slate-500"/>}
        </button>
        {isOpen && (
            <div className="p-4 pt-0 text-sm text-slate-400 leading-relaxed border-t border-slate-800/50 bg-slate-900">
                <div className="pt-4">{answer}</div>
            </div>
        )}
    </div>
);
