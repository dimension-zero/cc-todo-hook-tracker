// Shared type definitions for the application

export interface Todo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
  id?: string;
  created?: Date;
}

export interface Session {
  id: string;
  name: string;
  todos: Todo[];
  lastModified: Date;
  metadata?: {
    projectName?: string;
    projectPath?: string;
    timestamp?: string;
  };
}

export interface Project {
  name: string;
  path: string;
  sessions: Session[];
  // For merge feature  
  tempSessions?: Session[];
}

export interface TodoData {
  projects: Project[];
}

// Sort methods for projects
export type SortMethod = 'time' | 'project';

// For result pattern
export type Result<T> = 
  | { success: true; value: T }
  | { success: false; error: string };