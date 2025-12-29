
import React from 'react';

interface BrandLogoProps {
  className?: string;
  size?: number;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ className = '', size = 40 }) => {
  return (
    <div className={`relative flex items-center justify-center select-none ${className}`} style={{ width: size, height: size }}>
      {/* Dynamic Glow Background */}
      <div className="absolute inset-0 bg-indigo-500/40 blur-[20px] rounded-2xl animate-pulse"></div>
      
      {/* Main Glassmorphic Icon Container */}
      <div className="relative w-full h-full bg-slate-900 rounded-[22.5%] shadow-2xl border border-white/20 overflow-hidden flex items-center justify-center p-[15%]">
        
        {/* Layered Gradient Base */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 opacity-90"></div>
        
        {/* Abstract "Platform Hub" Pattern (Subtle grid) */}
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '15% 15%' }}></div>

        {/* Central Metaphor: A combined Soundwave + Neural Hub + Multi-app symbol */}
        <svg 
          viewBox="0 0 24 24" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg" 
          className="w-full h-full text-white relative z-10 filter drop-shadow-md"
        >
          {/* Main Sound Wave / Voice Core */}
          <path 
            d="M12 3V21M7 8V16M17 8V16M2 11V13M22 11V13" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            className="animate-pulse"
          />
          
          {/* Interconnecting "Platform" Nodes */}
          <circle cx="12" cy="12" r="2" fill="white" />
          
          {/* Subtle metaphoric paths to apps */}
          <path d="M12 12L17 5" stroke="white" strokeWidth="0.5" strokeDasharray="1 1" opacity="0.6" />
          <path d="M12 12L19 12" stroke="white" strokeWidth="0.5" strokeDasharray="1 1" opacity="0.6" />
          <path d="M12 12L17 19" stroke="white" strokeWidth="0.5" strokeDasharray="1 1" opacity="0.6" />
          <path d="M12 12L7 19" stroke="white" strokeWidth="0.5" strokeDasharray="1 1" opacity="0.6" />
          <path d="M12 12L5 12" stroke="white" strokeWidth="0.5" strokeDasharray="1 1" opacity="0.6" />
          <path d="M12 12L7 5" stroke="white" strokeWidth="0.5" strokeDasharray="1 1" opacity="0.6" />
        </svg>
        
        {/* Premium Gloss / Shine Overlay */}
        <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/30 to-transparent skew-x-[-25deg] translate-x-[-10%] pointer-events-none"></div>
        
        {/* App Category Accents (Subtle dots representing Whiteboard, Code, Docs, Chat) */}
        <div className="absolute top-2 left-2 w-1 h-1 bg-blue-300 rounded-full shadow-[0_0_5px_rgba(147,197,253,0.8)]"></div>
        <div className="absolute top-2 right-2 w-1 h-1 bg-pink-300 rounded-full shadow-[0_0_5px_rgba(249,168,212,0.8)]"></div>
        <div className="absolute bottom-2 left-2 w-1 h-1 bg-emerald-300 rounded-full shadow-[0_0_5px_rgba(110,231,183,0.8)]"></div>
        <div className="absolute bottom-2 right-2 w-1 h-1 bg-amber-300 rounded-full shadow-[0_0_5px_rgba(252,211,77,0.8)]"></div>
      </div>
    </div>
  );
};
