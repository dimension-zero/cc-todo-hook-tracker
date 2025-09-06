import React from 'react';
import ClaudeLogo from '../../assets/ClaudeLogo.png';

interface ProgressOverlayProps {
  message: string;
  progress?: string;
  isVisible: boolean;
}

export const ProgressOverlay: React.FC<ProgressOverlayProps> = ({ message, progress, isVisible }) => {
  if (!isVisible) return null;

  return (
    <div className="progress-overlay">
      <div className="progress-content">
        <img 
          src={ClaudeLogo} 
          alt="Processing..." 
          className="progress-logo spinning"
        />
        <div className="progress-message">{message}</div>
        {progress && <div className="progress-detail">{progress}</div>}
      </div>
    </div>
  );
};