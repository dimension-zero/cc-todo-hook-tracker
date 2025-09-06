import React from 'react';
import { Session } from '../types';
import { formatUKDate, formatUKTime } from '../utils/dateHelpers';
import { getStatusCounts } from '../utils/todoHelpers';

interface SessionTabsProps {
  selectedProject: { sessions: Session[] } | null;
  selectedSession: Session | null;
  selectedTabs: Set<string>;
  handleTabClick: (e: React.MouseEvent, session: Session) => void;
  handleTabRightClick: (e: React.MouseEvent, session: Session) => void;
  getSessionTooltip: (session: Session, project: any, isMultiSelected: boolean) => string;
  startMerge: () => void;
}

export const SessionTabs: React.FC<SessionTabsProps> = ({
  selectedProject,
  selectedSession,
  selectedTabs,
  handleTabClick,
  handleTabRightClick,
  getSessionTooltip,
  startMerge
}) => {
  if (!selectedProject) return null;

  return (
    <div className="session-tabs">
      {selectedProject.sessions
        .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
        .map((session) => {
        const counts = getStatusCounts(session);
        const isSelected = selectedSession?.id === session.id;
        const isMultiSelected = selectedTabs.has(session.id);
        
        return (
          <div
            key={session.id}
            className={`session-tab ${isSelected ? 'active' : ''} ${isMultiSelected ? 'multi-selected' : ''}`}
            onClick={(e) => handleTabClick(e, session)}
            onContextMenu={(e) => handleTabRightClick(e, session)}
            title={getSessionTooltip(session, selectedProject, isMultiSelected)}
          >
            <div className="session-info">
              <div className="session-id">{session.id.substring(0, 6)}</div>
              <div className="session-date">
                {formatUKDate(session.lastModified)} {formatUKTime(session.lastModified)}
              </div>
            </div>
          </div>
        );
      })}
      {selectedTabs.size === 2 && (
        <button className="merge-button" onClick={startMerge}>
          Merge Selected ({selectedTabs.size})
        </button>
      )}
    </div>
  );
};