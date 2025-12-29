
import React from 'react';

interface BrandLogoProps {
  className?: string;
  size?: number;
  variant?: 'full' | 'icon';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ className = '', size = 40, variant = 'icon' }) => {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      {/* Background Glow */}
      <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full"></div>
      
      {/* Main Icon Container */}
      <div className="relative w-full h-full bg-gradient-to-br from-indigo-600 via-indigo-500 to-purple-600 rounded-xl shadow-lg border border-white/20 overflow-hidden flex items-center justify-center p-2">
        <svg 
          viewBox="0 0 24 24" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg" 
          className="w-full h-full text-white"
        >
          {/* Stylized Microphone Body */}
          <rect x="9" y="4" width="6" height="11" rx="3" fill="currentColor" fillOpacity="0.9" />
          
          {/* AI Neural Pathways on Mic */}
          <path d="M12 6V9" stroke="white" strokeWidth="0.5" strokeLinecap="round" opacity="0.5" />
          <path d="M10.5 7.5H13.5" stroke="white" strokeWidth="0.5" strokeLinecap="round" opacity="0.5" />
          
          {/* Outer Ring / Stand */}
          <path d="M5 11C5 14.866 8.13401 18 12 18C15.866 18 19 14.866 19 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 18V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M9 21H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          
          {/* Dynamic Waveforms */}
          <path d="M2 11C2 11 3.5 8 6 8" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1 3" />
          <path d="M22 11C22 11 20.5 14 18 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1 3" />
        </svg>
        
        {/* Shine Effect */}
        <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/20 to-transparent skew-x-[-15deg] pointer-events-none"></div>
      </div>
    </div>
  );
};
