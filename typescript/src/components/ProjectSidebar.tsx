import React from 'react';
import { Project, SortMethod } from '../types';
import { formatUKDate, formatUKTime } from '../utils/dateHelpers';
import { getSortSymbol } from '../utils/todoHelpers';

interface ProjectSidebarProps {
  leftPaneWidth: number;
  sortedProjects: Project[];
  sortMethod: SortMethod;
  setSortMethod: (method: SortMethod) => void;
  activityMode: boolean;
  setActivityMode: (mode: boolean) => void;
  projects: Project[];
  selectMostRecentSession: (projects: Project[]) => void;
  showEmptyProjects: boolean;
  setShowEmptyProjects: (show: boolean) => void;
  showFailedReconstructions: boolean;
  setShowFailedReconstructions: (show: boolean) => void;
  selectedProject: Project | null;
  selectProject: (project: Project) => void;
  handleProjectContextMenu: (e: React.MouseEvent, project: Project) => void;
}

export const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  leftPaneWidth,
  sortedProjects,
  sortMethod,
  setSortMethod,
  activityMode,
  setActivityMode,
  projects,
  selectMostRecentSession,
  showEmptyProjects,
  setShowEmptyProjects,
  showFailedReconstructions,
  setShowFailedReconstructions,
  selectedProject,
  selectProject,
  handleProjectContextMenu
}) => {
  return (
    <div className="sidebar" style={{ width: leftPaneWidth }}>
      <div className="sidebar-header">
        <div className="sidebar-header-top">
          <h2>Projects ({sortedProjects.length})</h2>
          <div className="activity-toggle" title="Auto-select the most recent session when navigating projects">
            <label>
              <span>Activity</span>
              <input
                type="checkbox"
                checked={activityMode}
                onChange={(e) => {
                  const newActivityMode = e.target.checked;
                  setActivityMode(newActivityMode);
                  
                  // When Activity mode is turned ON, immediately find and select most recent session
                  if (newActivityMode && projects.length > 0) {
                    selectMostRecentSession(projects);
                  }
                }}
              />
            </label>
          </div>
        </div>
        <div className="sidebar-controls">
          <div className="sort-controls">
            {[0, 1, 2].map(method => (
              <button
                key={method}
                className={`sort-button ${sortMethod === method ? 'active' : ''}`}
                onClick={() => setSortMethod(method as SortMethod)}
                title={method === 0 ? 'Sort projects alphabetically by name' : method === 1 ? 'Sort projects by most recent activity' : 'Sort projects by number of todos'}
              >
                {getSortSymbol(method)}
              </button>
            ))}
          </div>
          <div className="filter-toggles">
            <button
              className={`filter-toggle ${showEmptyProjects ? 'active' : ''}`}
              onClick={() => setShowEmptyProjects(!showEmptyProjects)}
              title="Show/hide projects with no todos"
            >
              Empty
            </button>
            <button
              className={`filter-toggle ${showFailedReconstructions ? 'active' : ''}`}
              onClick={() => setShowFailedReconstructions(!showFailedReconstructions)}
              title="Show/hide projects with invalid file paths"
            >
              Failed
            </button>
          </div>
        </div>
      </div>
      <div className="sidebar-projects">
        {sortedProjects.map((project) => {
          const todoCount = project.sessions.reduce((sum, s) => sum + s.todos.length, 0);
          const hasActiveTodos = project.sessions.some(s => s.todos.some(t => t.status !== 'completed'));
          return (
            <div
              key={project.path}
              className={`project-item ${selectedProject === project ? 'selected' : ''} ${todoCount === 0 ? 'empty-project' : ''}`}
              onClick={() => selectProject(project)}
              onContextMenu={(e) => handleProjectContextMenu(e, project)}
            >
              <div className="project-name">
                {project.path ? project.path.split(/[\\/]/).pop() : 'Unknown Project'}
                {todoCount === 0 && <span className="empty-badge"> (empty)</span>}
              </div>
              <div className="project-stats">
                {project.sessions.length} " {todoCount}
                {project.mostRecentTodoDate && (
                  <> " {formatUKDate(project.mostRecentTodoDate)} {formatUKTime(project.mostRecentTodoDate)}</>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};