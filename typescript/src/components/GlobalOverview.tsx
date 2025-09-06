import React from 'react';
import { Todo, Session, Project } from '../types';

interface GlobalOverviewProps {
  projects: Project[];
  onTodoClick: (project: Project, session: Session, todoIndex: number) => void;
}

export const GlobalOverview: React.FC<GlobalOverviewProps> = ({ projects, onTodoClick }) => {
  // Get all projects with their current and next todos
  const getProjectData = () => {
    return projects.map(project => {
      const projectName = project.path?.split(/[\\/]/).pop() || 'Unknown Project';
      
      // Get all active todos from all sessions in this project
      const allActiveTodos: Array<{
        session: Session;
        todo: Todo;
        todoIndex: number;
      }> = [];

      project.sessions.forEach(session => {
        session.todos.forEach((todo, index) => {
          if (todo.status === 'in_progress' || todo.status === 'pending') {
            allActiveTodos.push({
              session,
              todo,
              todoIndex: index
            });
          }
        });
      });

      // Sort by status (in_progress first) and then by session last modified
      allActiveTodos.sort((a, b) => {
        if (a.todo.status !== b.todo.status) {
          return a.todo.status === 'in_progress' ? -1 : 1;
        }
        return b.session.lastModified.getTime() - a.session.lastModified.getTime();
      });

      // Current active tasks = all in_progress todos
      const currentTasks = allActiveTodos.filter(item => item.todo.status === 'in_progress');
      
      // Next tasks = pending todos (limited to show only a reasonable number)
      const nextTasks = allActiveTodos.filter(item => item.todo.status === 'pending').slice(0, 5);

      return {
        project,
        projectName,
        currentTasks,
        nextTasks,
        totalActiveTodos: allActiveTodos.length
      };
    }).filter(projectData => projectData.totalActiveTodos > 0); // Only show projects with active todos
  };

  const projectsData = getProjectData();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'in_progress': return '▶';
      case 'pending': return '○';
      default: return '?';
    }
  };

  if (projectsData.length === 0) {
    return (
      <div className="global-overview-fullscreen">
        <div className="global-empty-state">
          <h1>🎉 All Caught Up!</h1>
          <p>No active todos found across all projects</p>
        </div>
      </div>
    );
  }

  return (
    <div className="global-overview-fullscreen">
      <div className="global-header">
        <h1>🔥 Global Activity Overview</h1>
        <p>{projectsData.reduce((sum, p) => sum + p.totalActiveTodos, 0)} active todos across {projectsData.length} projects</p>
      </div>

      <div className="global-three-columns">
        {/* Column 1: Project Names */}
        <div className="column column-projects">
          <h2>Projects</h2>
          <div className="column-content">
            {projectsData.map(({ projectName, currentTasks, nextTasks }, index) => (
              <div key={index} className="project-row">
                <div className="project-name">📁 {projectName}</div>
                <div className="project-stats">
                  <span className="stat-current">{currentTasks.length} active</span>
                  <span className="stat-next">{nextTasks.length} pending</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Column 2: Current Active Tasks */}
        <div className="column column-current">
          <h2>Current Active Tasks</h2>
          <div className="column-content">
            {projectsData.map(({ project, projectName, currentTasks }, index) => (
              <div key={index} className="project-section">
                {currentTasks.length > 0 ? (
                  currentTasks.map((item, taskIndex) => (
                    <div
                      key={`${item.session.id}-${item.todoIndex}`}
                      className="task-item current-task"
                      onClick={() => onTodoClick(project, item.session, item.todoIndex)}
                    >
                      <div className="task-header">
                        <span className="task-status">▶</span>
                        <span className="task-project">{projectName}</span>
                      </div>
                      <div className="task-content">{item.todo.content}</div>
                      <div className="task-session">Session: {item.session.id.substring(0, 6)}</div>
                    </div>
                  ))
                ) : (
                  <div className="task-placeholder">No active tasks</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Column 3: Next Tasks */}
        <div className="column column-next">
          <h2>Next Tasks</h2>
          <div className="column-content">
            {projectsData.map(({ project, projectName, nextTasks }, index) => (
              <div key={index} className="project-section">
                {nextTasks.length > 0 ? (
                  nextTasks.map((item, taskIndex) => (
                    <div
                      key={`${item.session.id}-${item.todoIndex}`}
                      className="task-item next-task"
                      onClick={() => onTodoClick(project, item.session, item.todoIndex)}
                    >
                      <div className="task-header">
                        <span className="task-status">○</span>
                        <span className="task-project">{projectName}</span>
                      </div>
                      <div className="task-content">{item.todo.content}</div>
                      <div className="task-session">Session: {item.session.id.substring(0, 6)}</div>
                    </div>
                  ))
                ) : (
                  <div className="task-placeholder">No pending tasks</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};