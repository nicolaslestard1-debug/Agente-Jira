import React from 'react';

interface SantanderLogoProps {
  className?: string;
  fill?: string;
}

export const SantanderFlameLogo: React.FC<SantanderLogoProps> = ({ 
  className = "w-6 h-6", 
  fill = "currentColor" 
}) => {
  return (
    <svg 
      className={className} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M50 16c-3.1 5.2-7.8 11.4-7.8 17.4 0 3.3 1.4 6.2 3.6 8.6-4.5-2.1-6.9-5.7-6.9-9.8 0-5.3 3.8-10.7 7.4-15.8C34.1 21.5 26.4 30.4 26.4 40.7c0 13.1 10.5 22.3 23.6 22.3 13.1 0 23.6-9.2 23.6-22.3 0-5.9-3.3-11.8-9.8-17.8-3.6 4.8-6.3 9.5-6.3 13.7 0 3.2 2.4 6.2 6 8.5-5.1 0-9.1-3.6-9.1-8.1 0-6.8 6.1-16.1 10.5-22-7.1-0.9-11.4-0.4-14.9 1z"
        fill={fill}
      />
      <ellipse cx="50" cy="63" rx="30" ry="15" fill={fill} />
    </svg>
  );
};

export const SantanderSquareLogo: React.FC<{ className?: string; roundedClass?: string }> = ({ 
  className = "w-8 h-8",
  roundedClass = "rounded-lg"
}) => {
  return (
    <div className={`bg-[#EC0000] flex items-center justify-center shrink-0 overflow-hidden ${roundedClass} ${className}`}>
      <img src="/santander-logo.svg" alt="Santander Logo" className="w-full h-full object-contain" />
    </div>
  );
};

export const SantanderFullLogo: React.FC<SantanderLogoProps> = ({ 
  className = "h-6", 
  fill = "currentColor" 
}) => {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <SantanderSquareLogo className="w-6 h-6" roundedClass="rounded-sm" />
      <span className="font-bold text-lg tracking-tight font-sans" style={{ color: fill }}>
        Santander
      </span>
    </div>
  );
};

