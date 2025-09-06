export interface Todo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
  id?: string;
  created?: Date;
}

export interface Session {
  id: string;
  todos: Todo[];
  lastModified: Date;
  created?: Date;
  filePath?: string;
}

export interface Project {
  path: string;
  sessions: Session[];
  mostRecentTodoDate?: Date;
}

export type SortMethod = 0 | 1 | 2; // 0=alphabetic, 1=recent, 2=todos
export type SpacingMode = 'wide' | 'normal' | 'compact';
export type FilterState = {
  completed: boolean;
  in_progress: boolean;
  pending: boolean;
};

declare global {
  interface Window {
    electronAPI: {
      getTodos: () => Promise<Project[]>;
      saveTodos: (filePath: string, todos: Todo[]) => Promise<boolean>;
      deleteTodoFile: (filePath: string) => Promise<boolean>;
    };
  }
}