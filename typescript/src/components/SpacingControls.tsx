import React from 'react';
import { SpacingMode } from '../types';

interface SpacingControlsProps {
  spacingMode: SpacingMode;
  setSpacingMode: React.Dispatch<React.SetStateAction<SpacingMode>>;
}

export const SpacingControls: React.FC<SpacingControlsProps> = ({
  spacingMode,
  setSpacingMode
}) => {
  return (
    <div className="padding-controls">
      <label className="spacing-label" title="Adjust the spacing between todo items">SPACING:</label>
      <div className="padding-buttons">
        <button
          className={`padding-btn spacing-cycle-btn active`}
          onClick={() => {
            const modes: SpacingMode[] = ['wide', 'normal', 'compact'];
            const currentIndex = modes.indexOf(spacingMode);
            const nextIndex = (currentIndex + 1) % modes.length;
            setSpacingMode(modes[nextIndex]);
          }}
          title="Click to cycle through spacing modes: Wide → Normal → Compact"
        >
          {spacingMode === 'wide' ? 'Wide' : spacingMode === 'normal' ? 'Normal' : 'Compact'}
        </button>
      </div>
    </div>
  );
};