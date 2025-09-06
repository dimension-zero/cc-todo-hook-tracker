import React, { useState, useEffect } from 'react';
import './App.css';
import { SplashScreen } from './components/SplashScreen';
import { ProjectView } from './App.ProjectView';
import { GlobalView } from './App.GlobalView';

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

declare global {
  interface Window {
    electronAPI: {
      getTodos: () => Promise<Project[]>;
      saveTodos: (filePath: string, todos: Todo[]) => Promise<boolean>;
      deleteTodoFile: (filePath: string) => Promise<boolean>;
    };
  }
}

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSteps, setLoadingSteps] = useState<string[]>([]);
  const [loadingComplete, setLoadingComplete] = useState(false);
  const [viewMode, setViewMode] = useState<'project' | 'global'>('project');
  
  // Activity mode state for auto-selection
  const [activityMode, setActivityMode] = useState(false);
  const [lastGlobalMostRecentTime, setLastGlobalMostRecentTime] = useState<Date | null>(null);

  // Function to find and select the globally most recent session
  const selectMostRecentSession = (projects: Project[]) => {
    let mostRecentProject: Project | null = null;
    let mostRecentSession: Session | null = null;
    let mostRecentDate: Date | null = null;
    
    // Find the absolutely most recent session across all projects
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
    
    // Select the most recent session found
    if (mostRecentProject && mostRecentSession) {
      // Switch to project view and select the most recent session
      setViewMode('project');
      // The ProjectView component will handle the selection internally
    }
  };

  // Load todos data with smart refresh strategy
  useEffect(() => {
    loadTodos();
    
    // Smart refresh: Only poll when Activity mode is ON, and much less frequently
    // Hook system provides immediate updates for current session,
    // but polling catches updates from other sessions/instances
    let interval: NodeJS.Timeout | null = null;
    
    if (activityMode) {
      // Poll every 30 seconds when Activity mode is ON (much less aggressive)
      interval = setInterval(loadTodos, 30000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activityMode]); // Re-run when activityMode changes

  const loadTodos = async () => {
    try {
      // Initial loading step
      setLoadingSteps(['Fetching todo data...']);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const data = await window.electronAPI.getTodos();
      
      // Show found projects
      setLoadingSteps(prev => [...prev, `Found ${data.length} projects`]);
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Process projects with visible delays
      const deduplicatedData: Project[] = [];
      
      for (let i = 0; i < data.length; i++) {
        const project = data[i];
        const projectName = project.path?.split(/[\\/]/).pop() || 'Unknown';
        
        setLoadingSteps(prev => [...prev, `Processing: ${projectName}`]);
        
        // Deduplicate sessions within the project
        const processedProject = {
          ...project,
          sessions: project.sessions.reduce((unique: Session[], session) => {
            const existing = unique.find(s => s.id === session.id);
            if (existing) {
              // Merge todos and use latest modified date
              const allTodos = [...existing.todos, ...session.todos];
              const uniqueTodos = allTodos.filter((todo, index, self) => 
                index === self.findIndex(t => t.content === todo.content && t.status === todo.status)
              );
              existing.todos = uniqueTodos;
              existing.lastModified = new Date(Math.max(existing.lastModified.getTime(), session.lastModified.getTime()));
            } else {
              unique.push(session);
            }
            return unique;
          }, [])
        };
        
        deduplicatedData.push(processedProject);
        
        // Add a small delay for user visibility, but not too long
        // Faster for large numbers of projects
        const delay = data.length > 10 ? 50 : 150;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      setLoadingSteps(prev => [...prev, 'Deduplication complete']);
      await new Promise(resolve => setTimeout(resolve, 200));
      
      setProjects(deduplicatedData);
      
      // Activity mode: Auto-focus on the globally most recent session
      if (activityMode) {
        let globalMostRecentProject: Project | null = null;
        let globalMostRecentSession: Session | null = null;
        let globalMostRecentTime: Date | null = null;
        
        // Find the globally most recent session across all projects
        for (const project of deduplicatedData) {
          for (const session of project.sessions) {
            const sessionTime = new Date(session.lastModified);
            if (!globalMostRecentTime || sessionTime > globalMostRecentTime) {
              globalMostRecentTime = sessionTime;
              globalMostRecentProject = project;
              globalMostRecentSession = session;
            }
          }
        }
        
        // Auto-select if we found a more recent session than what we knew before
        if (globalMostRecentProject && globalMostRecentSession && globalMostRecentTime) {
          if (!lastGlobalMostRecentTime || globalMostRecentTime > lastGlobalMostRecentTime) {
            setLoadingSteps(prev => [...prev, `Selecting recent session: ${globalMostRecentSession.id.substring(0, 6)}`]);
            await new Promise(resolve => setTimeout(resolve, 300));
            // Switch to project view for auto-selection
            setViewMode('project');
          }
          
          // Always update our knowledge of the global most recent time
          setLastGlobalMostRecentTime(globalMostRecentTime);
        }
      }
      
      setLoadingSteps(prev => [...prev, 'Loading complete!']);
      setLoadingComplete(true);
      // Delay hiding splash screen slightly to show completion
      setTimeout(() => {
        setLoading(false);
      }, 500);
    } catch (error) {
      console.error('Failed to load todos:', error);
      setLoadingSteps(prev => [...prev, `Error: ${error}`]);
      setLoadingComplete(true);
      setTimeout(() => {
        setLoading(false);
      }, 1000);
    }
  };

  const handleGlobalTodoClick = (project: Project, session: Session, todoIndex: number) => {
    // Switch to project view
    setViewMode('project');
    // The ProjectView component will handle the project and session selection
  };

  if (loading) {
    return (
      <SplashScreen 
        loadingSteps={loadingSteps}
        isComplete={loadingComplete}
      />
    );
  }

  return (
    <div className="app">
      {/* View Mode Toggle - spans across both panes */}
      <div className="view-toggle-bar">
        <button
          className={`view-toggle-btn ${viewMode === 'project' ? 'active' : ''}`}
          onClick={() => setViewMode('project')}
          title="View individual project todos"
        >
          Project View
        </button>
        <button
          className={`view-toggle-btn ${viewMode === 'global' ? 'active' : ''}`}
          onClick={() => setViewMode('global')}
          title="View all active todos across projects"
        >
          Global View
        </button>
      </div>

      {/* Content area - either project view or global view */}
      {viewMode === 'global' ? (
        <GlobalView projects={projects} onTodoClick={handleGlobalTodoClick} />
      ) : (
        <ProjectView projects={projects} onLoadTodos={loadTodos} />
      )}
    </div>
  );
}

export default App;