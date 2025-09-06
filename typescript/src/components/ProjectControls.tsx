import React from 'react';

type SpacingMode = 'wide' | 'normal' | 'compact';
type FilterState = {
  completed: boolean;
  in_progress: boolean;
  pending: boolean;
};

interface Project {
  path: string;
  sessions: Array<{todos: Array<any>}>;
}

interface ProjectControlsProps {
  filterState: FilterState;
  setFilterState: React.Dispatch<React.SetStateAction<FilterState>>;
  spacingMode: SpacingMode;
  setSpacingMode: React.Dispatch<React.SetStateAction<SpacingMode>>;
  selectedTabs: Set<string>;
  startMerge: () => void;
  selectedProject: Project;
  handleDeleteEmptySessionsInProject: () => void;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  handleDeleteSession: () => void;
}

export const ProjectControls: React.FC<ProjectControlsProps> = ({
  filterState,
  setFilterState,
  spacingMode,
  setSpacingMode,
  selectedTabs,
  startMerge,
  selectedProject,
  handleDeleteEmptySessionsInProject,
  showDeleteConfirm,
  setShowDeleteConfirm,
  handleDeleteSession
}) => {
  return (
    <div className="control-bar">
      <div className="filter-controls">
        <label title="Toggle which todo statuses are visible">Filter:</label>
        <div className="filter-toggle">
          <button
            className={`filter-btn ${filterState.completed ? 'active' : ''}`}
            onClick={() => setFilterState(prev => ({ ...prev, completed: !prev.completed }))}
            title="Show/hide completed todos"
          >
            Done
          </button>
          <button
            className={`filter-btn ${filterState.in_progress ? 'active' : ''}`}
            onClick={() => setFilterState(prev => ({ ...prev, in_progress: !prev.in_progress }))}
            title="Show/hide in-progress todos"
          >
            Doing
          </button>
          <button
            className={`filter-btn ${filterState.pending ? 'active' : ''}`}
            onClick={() => setFilterState(prev => ({ ...prev, pending: !prev.pending }))}
            title="Show/hide pending todos"
          >
            Pending
          </button>
        </div>
      </div>
      
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
    </div>
  );
};