import React from 'react';
import { Project } from '../types';

interface SessionControlsProps {
  selectedProject: Project;
  selectedTabs: Set<string>;
  showDeleteConfirm: boolean;
  startMerge: () => void;
  handleDeleteEmptySessionsInProject: () => void;
  setShowDeleteConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  handleDeleteSession: () => void;
}

export const SessionControls: React.FC<SessionControlsProps> = ({
  selectedProject,
  selectedTabs,
  showDeleteConfirm,
  startMerge,
  handleDeleteEmptySessionsInProject,
  setShowDeleteConfirm,
  handleDeleteSession
}) => {
  return (
    <div className="delete-all-controls">
      {selectedTabs.size >= 2 && (
        <button className="merge-btn" onClick={startMerge}>
          Merge {selectedTabs.size} Sessions
        </button>
      )}
      {selectedProject.sessions.some(s => s.todos.length === 0) && (
        <button 
          className="delete-empty-btn" 
          onClick={handleDeleteEmptySessionsInProject}
          title={`Delete all ${selectedProject.sessions.filter(s => s.todos.length === 0).length} empty session(s) in this project`}
        >
          Delete Empty ({selectedProject.sessions.filter(s => s.todos.length === 0).length})
        </button>
      )}
      {!showDeleteConfirm ? (
        <button 
          className="delete-all-btn" 
          onClick={() => setShowDeleteConfirm(true)}
          title="Delete the currently selected session"
        >
          Delete Session
        </button>
      ) : (
        <div className="delete-confirm">
          <span>Delete this session?</span>
          <button className="confirm-yes" onClick={handleDeleteSession}>Yes</button>
          <button className="confirm-no" onClick={() => setShowDeleteConfirm(false)}>No</button>
        </div>
      )}
    </div>
  );
};