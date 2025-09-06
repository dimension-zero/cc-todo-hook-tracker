import React, { useState, useEffect } from 'react';
import './App.css';
import { ProjectsPane } from './App.ProjectView.ProjectsPane';
import { SingleProjectPane } from './App.ProjectView.SingleProjectPane';

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

interface ProjectViewProps {
  projects: Project[];
  onLoadTodos: () => Promise<void>;
}

export function ProjectView({ projects, onLoadTodos }: ProjectViewProps) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [projectSessionMap, setProjectSessionMap] = useState<Map<string, string>>(new Map());
  const [leftPaneWidth, setLeftPaneWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);

  // Mouse move and up handlers for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      if (newWidth >= 200 && newWidth <= 400) {
        setLeftPaneWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Auto-select most recent project and session on initial load
  useEffect(() => {
    if (!selectedProject && projects.length > 0) {
      let mostRecentProject: Project | null = null;
      let mostRecentSession: Session | null = null;
      let mostRecentDate: Date | null = null;
      
      // Find the project with the most recently modified session
      for (const project of projects) {
        for (const session of project.sessions) {
          const sessionDate = new Date(session.lastModified);
          if (!mostRecentDate || sessionDate > mostRecentDate) {
            mostRecentDate = sessionDate;
            mostRecentProject = project;
            mostRecentSession = session;
          }
        }
      }
      
      // Select the most recent project and session found
      if (mostRecentProject && mostRecentSession) {
        setSelectedProject(mostRecentProject);
        setSelectedSession(mostRecentSession);
      }
    }
  }, [projects, selectedProject]);

  // Update selectedProject when projects change
  useEffect(() => {
    if (selectedProject) {
      const updated = projects.find(p => p.path === selectedProject.path);
      if (updated) {
        setSelectedProject(updated);
        // Update selected session if it exists
        if (selectedSession) {
          const updatedSession = updated.sessions.find(s => s.id === selectedSession.id);
          if (updatedSession) {
            setSelectedSession(updatedSession);
          }
        }
      }
    }
  }, [projects, selectedProject, selectedSession]);

  const selectProject = (project: Project) => {
    // Save current session selection before switching
    if (selectedProject && selectedSession) {
      setProjectSessionMap(prev => {
        const newMap = new Map(prev);
        newMap.set(selectedProject.path, selectedSession.id);
        return newMap;
      });
    }
    
    setSelectedProject(project);
    
    // Check if we have a previously selected session for this project
    const rememberedSessionId = projectSessionMap.get(project.path);
    if (rememberedSessionId) {
      const rememberedSession = project.sessions.find(s => s.id === rememberedSessionId);
      if (rememberedSession) {
        setSelectedSession(rememberedSession);
        return;
      }
    }
    
    // Otherwise, select the most recently updated session
    if (project.sessions.length > 0) {
      const mostRecent = [...project.sessions].sort((a, b) => 
        b.lastModified.getTime() - a.lastModified.getTime()
      )[0];
      setSelectedSession(mostRecent);
    } else {
      setSelectedSession(null);
    }
  };
  
  const selectSession = (session: Session) => {
    setSelectedSession(session);
    
    // Remember this session selection for the current project
    if (selectedProject) {
      setProjectSessionMap(prev => {
        const newMap = new Map(prev);
        newMap.set(selectedProject.path, session.id);
        return newMap;
      });
    }
  };

  const handleProjectContextMenu = (e: React.MouseEvent, project: Project) => {
    // Pass through to projects pane - could implement if needed
    e.preventDefault();
  };

  return (
    <div className="app-main">
      {/* Projects Pane (Left) */}
      <div className="sidebar" style={{ width: leftPaneWidth }}>
        <ProjectsPane
          projects={projects}
          selectedProject={selectedProject}
          onSelectProject={selectProject}
          onProjectContextMenu={handleProjectContextMenu}
        />
      </div>
      
      {/* Resizable Divider */}
      <div 
        className="divider" 
        onMouseDown={() => setIsResizing(true)}
      />
      
      {/* Single Project Pane (Right) */}
      <SingleProjectPane
        selectedProject={selectedProject}
        selectedSession={selectedSession}
        onSessionSelect={selectSession}
        onLoadTodos={onLoadTodos}
      />
    </div>
  );
}