import React from 'react';

interface LogoProps {
  className?: string;
  fill?: string;
}

export const MonksLogo: React.FC<LogoProps> = ({ 
  className = "h-5", 
  fill = "currentColor" 
}) => {
  return (
    <svg 
      className={`shrink-0 ${className}`} 
      viewBox="0 0 520 120" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* .monks official brand wordmark */}
      {/* Dot . */}
      <circle cx="28" cy="80" r="14" fill={fill} />

      {/* m */}
      <path 
        d="M60 40 h18 v7 c4.2-5.5 10.8-8.5 19-8.5 8 0 13.8 3.2 16.8 8.5 4.8-5.5 11.8-8.5 20.2-8.5 13.5 0 21 8 21 23.5 V94 h-18 V65 c0-6.5-3.5-9.8-8.8-9.8-5.5 0-9.2 3.8-9.2 10.2 V94 h-18 V65 c0-6.5-3.5-9.8-8.8-9.8-5.5 0-9.2 3.8-9.2 10.2 V94 H60 V40 z" 
        fill={fill} 
      />

      {/* o */}
      <path 
        d="M164 67 c0-15.5 10.8-28.5 26.5-28.5 15.8 0 26.5 13 26.5 28.5 0 15.5-10.8 28.5-26.5 28.5 C174.8 95.5 164 82.5 164 67 z m35 0 c0-6.8-3.8-11.8-8.5-11.8 -4.8 0-8.5 5-8.5 11.8 0 6.8 3.8 11.8 8.5 11.8 4.7 0 8.5-5 8.5-11.8 z" 
        fill={fill} 
      />

      {/* n */}
      <path 
        d="M226 40 h18 v7 c4.8-5.5 11.8-8.5 20.2-8.5 13.5 0 21 8 21 23.5 V94 h-18 V65 c0-6.5-3.5-9.8-8.8-9.8-5.5 0-9.2 3.8-9.2 10.2 V94 h-18 V40 z" 
        fill={fill} 
      />

      {/* k */}
      <path 
        d="M296 16 h18 v35 l16.5-16 h22.5 l-21.5 20 23.5 39 h-22.5 l-15.5-26 -3 2.8 V94 h-18 V16 z" 
        fill={fill} 
      />

      {/* s */}
      <path 
        d="M362 79.5 l15-7 c3 4.2 7.8 7.2 13.5 7.2 4.8 0 7.8-2.2 7.8-5.2 0-3.5-3.8-4.8-11.2-6.5-11.8-2.8-19.5-6.8-19.5-18.2 0-11.8 9.8-20.8 24.5-20.8 11.2 0 19.2 4.5 24 11.8 l-13.8 8.2 c-3-3.8-6.8-5.8-11-5.8-4.5 0-6.8 2-6.8 4.5 0 3.2 3.5 4.2 10.8 5.8 12.8 2.8 20.2 7.2 20.2 18.5 0 12.5-10.2 21-25.5 21-12.8 0-21.8-5.2-26.5-14.5 z" 
        fill={fill} 
      />
    </svg>
  );
};

export const MonksTextLogo: React.FC<LogoProps> = ({ 
  className = "h-5", 
  fill = "currentColor" 
}) => {
  return <MonksLogo className={className} fill={fill} />;
};

