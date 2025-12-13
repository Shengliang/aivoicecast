
import React from 'react';
import { ArrowLeft, Shield, Lock, Eye, Database } from 'lucide-react';

interface PrivacyPolicyProps {
  onBack: () => void;
}

export const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col animate-fade-in">
      {/* Header */}
      <div className="p-6 border-b border-slate-900 flex items-center gap-4 sticky top-0 bg-slate-950/90 backdrop-blur-md z-20">
        <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold tracking-widest uppercase text-slate-400 flex items-center gap-2">
            <Shield size={20} className="text-emerald-400"/> Privacy Policy
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-12 space-y-8 text-slate-300 leading-relaxed">
            <section>
                <h2 className="text-2xl font-bold text-white mb-4">1. Data Collection & Usage</h2>
                <p>
                    AIVoiceCast prioritizes your privacy. We minimize data collection and rely on client-side processing where possible.
                </p>
                <ul className="list-disc pl-5 mt-4 space-y-2">
                    <li><strong>Authentication:</strong> We use Google Firebase Authentication. We only store your email, display name, and photo URL to identify your account.</li>
                    <li><strong>Audio Data:</strong> Voice inputs processed via the Gemini Live API are transient. We do not store raw audio recordings of your live sessions unless you explicitly click "Record". Recorded meetings are stored in your private Cloud Storage bucket.</li>
                    <li><strong>Text Data:</strong> Chat messages, code files, and documents are stored in Google Firestore and Cloud Storage to provide sync functionality across devices.</li>
                </ul>
            </section>

            <section>
                <h2 className="text-2xl font-bold text-white mb-4">2. AI Processing</h2>
                <p>
                    This application uses <strong>Google Gemini API</strong> for generative capabilities.
                </p>
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 mt-4">
                    <p className="text-sm">
                        <span className="text-indigo-400 font-bold">Note:</span> Data sent to the AI (prompts, context, code snippets) falls under Google's API Data Privacy Policy. We do not use your data to train our own models.
                    </p>
                </div>
            </section>

            <section>
                <h2 className="text-2xl font-bold text-white mb-4">3. Local Storage</h2>
                <p>
                    To improve performance and reduce costs, we heavily utilize your browser's <strong>IndexedDB</strong>.
                </p>
                <ul className="list-disc pl-5 mt-4 space-y-2">
                    <li><strong>API Keys:</strong> Your Gemini API Key is stored locally in your browser. It is never sent to our servers, only directly to Google's API endpoints.</li>
                    <li><strong>Cached Content:</strong> Generated audio lectures and transcripts are cached locally to enable offline playback.</li>
                </ul>
            </section>

            <section>
                <h2 className="text-2xl font-bold text-white mb-4">4. User Rights</h2>
                <p>
                    You retain full ownership of the content you create (podcasts, code, documents). You can delete your account and all associated data at any time via the Settings menu.
                </p>
            </section>

            <section>
                <h2 className="text-2xl font-bold text-white mb-4">5. Contact</h2>
                <p>
                    For privacy concerns or data deletion requests, please contact us at <a href="mailto:privacy@aivoicecast.com" className="text-indigo-400 hover:underline">privacy@aivoicecast.com</a>.
                </p>
            </section>
            
            <div className="pt-8 border-t border-slate-800 text-center text-sm text-slate-500">
                Last Updated: May 2025
            </div>
        </div>
      </div>
    </div>
  );
};
