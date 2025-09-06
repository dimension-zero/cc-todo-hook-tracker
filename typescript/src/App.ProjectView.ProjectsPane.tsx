import React, { useState } from 'react';
import './App.css';

interface Todo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
  id?: string;
  created?: Date;
}

interface Session {
  id: string;
  todos: Todo[];
  lastModified: Date;
  created?: Date;
  filePath?: string;
}

interface Project {
  path: string;
  sessions: Session[];
  mostRecentTodoDate?: Date;
}

type SortMethod = 0 | 1 | 2; // 0=alphabetic, 1=recent, 2=todos

// Helper function to format dates in UK format: dd-MMM-yyyy
function formatUKDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

// Helper function to format time in UK format: HH:mm
function formatUKTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

interface ProjectsPaneProps {
  projects: Project[];
  selectedProject: Project | null;
  onSelectProject: (project: Project) => void;
  onProjectContextMenu?: (e: React.MouseEvent, project: Project) => void;
}

export function ProjectsPane({ projects, selectedProject, onSelectProject, onProjectContextMenu }: ProjectsPaneProps) {
  const [sortMethod, setSortMethod] = useState<SortMethod>(1); // recent
  const [showEmptyProjects, setShowEmptyProjects] = useState(false); // hide empty projects by default
  const [showFailedReconstructions, setShowFailedReconstructions] = useState(false); // hide failed path reconstructions by default
  const [activityMode, setActivityMode] = useState(false);

  const handleProjectClick = (project: Project) => {
    onSelectProject(project);
  };

  const handleProjectContextMenu = (e: React.MouseEvent, project: Project) => {
    if (onProjectContextMenu) {
      onProjectContextMenu(e, project);
    }
  };

  const getSortSymbol = (method: number) => {
    switch(method) {
      case 0: return 'AZ';
      case 1: return '⏱';
      case 2: return '#';
      default: return '';
    }
  };

  // Filter projects based on settings
  let filteredProjects = showEmptyProjects 
    ? projects 
    : projects.filter(p => p.sessions.some(s => s.todos.length > 0));
  
  // Further filter based on failed reconstructions
  if (!showFailedReconstructions) {
    filteredProjects = filteredProjects.filter(p => 
      p.path !== 'Unknown Project' && 
      p.path !== null && 
      p.path !== ''
    );
  }
  
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    switch(sortMethod) {
      case 0: // alphabetic
        return a.path.localeCompare(b.path);
      case 1: // recent
        const dateA = a.mostRecentTodoDate || new Date(0);
        const dateB = b.mostRecentTodoDate || new Date(0);
        return dateB.getTime() - dateA.getTime();
      case 2: // todos
        const countA = a.sessions.reduce((sum, s) => sum + s.todos.length, 0);
        const countB = b.sessions.reduce((sum, s) => sum + s.todos.length, 0);
        return countB - countA;
      default:
        return 0;
    }
  });

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-header-top">
          <h2>Projects ({sortedProjects.length})</h2>
          <div className="activity-toggle" title="Auto-select the most recent session when navigating projects">
            <label>
              <span>Activity</span>
              <input
                type="checkbox"
                checked={activityMode}
                onChange={(e) => setActivityMode(e.target.checked)}
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
          return (
            <div
              key={project.path}
              className={`project-item ${selectedProject === project ? 'selected' : ''} ${todoCount === 0 ? 'empty-project' : ''}`}
              onClick={() => handleProjectClick(project)}
              onContextMenu={(e) => handleProjectContextMenu(e, project)}
            >
              <div className="project-name">
                {project.path ? project.path.split(/[\\/]/).pop() : 'Unknown Project'}
                {todoCount === 0 && <span className="empty-badge"> (empty)</span>}
              </div>
              <div className="project-stats">
                {project.sessions.length} • {todoCount}
                {project.mostRecentTodoDate && (
                  <> • {formatUKDate(project.mostRecentTodoDate)} {formatUKTime(project.mostRecentTodoDate)}</>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}