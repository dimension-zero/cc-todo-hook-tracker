import React from 'react';
import './App.css';
import { GlobalOverview } from './components/GlobalOverview';

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

interface GlobalViewProps {
  projects: Project[];
  onTodoClick: (project: Project, session: Session, todoIndex: number) => void;
}

export function GlobalView({ projects, onTodoClick }: GlobalViewProps) {
  return <GlobalOverview projects={projects} onTodoClick={onTodoClick} />;
}