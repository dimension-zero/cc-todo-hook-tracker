import { Session, Project } from '../types';

export const getStatusSymbol = (status: string) => {
  switch (status) {
    case 'completed': return '';
    case 'in_progress': return '�';
    case 'pending': return '�';
    default: return '?';
  }
};

export const getStatusCounts = (session: Session) => {
  const counts = session.todos.reduce((acc, todo) => {
    acc[todo.status] = (acc[todo.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return {
    pending: counts.pending || 0,
    in_progress: counts.in_progress || 0,
    completed: counts.completed || 0
  };
};

export const getSortSymbol = (method: number) => {
  switch(method) {
    case 0: return 'AZ';
    case 1: return '⏱';
    case 2: return '#';
    default: return '';
  }
};

export const getSessionTooltip = (session: Session, project: Project, isMultiSelected: boolean) => {
  const counts = getStatusCounts(session);
  const projectName = project.path ? project.path.split(/[\\/]/).pop() : 'Unknown Project';
  
  // Get earliest and latest todo dates
  let earliestDate: Date | null = null;
  let latestDate: Date | null = null;
  
  session.todos.forEach(todo => {
    // Note: todos don't have individual dates, so we use session date
    // In a real scenario, each todo might have its own creation/update date
  });
  
  // Get the todo folder path
  const lastSlashIndex = Math.max(session.filePath.lastIndexOf('/'), session.filePath.lastIndexOf('\\'));
  const todoFolderPath = session.filePath.substring(0, lastSlashIndex);
  
  return `Project: ${projectName}
Session: ${session.id}
Created: ${session.created ? new Date(session.created).toLocaleString('en-GB') : 'Unknown'}
Last Modified: ${new Date(session.lastModified).toLocaleString('en-GB')}

Todos:
- Pending: ${counts.pending}
- In Progress: ${counts.in_progress}  
- Completed: ${counts.completed}
Total: ${session.todos.length}

File Path: ${session.filePath}
Todo Folder: ${todoFolderPath}

${isMultiSelected ? '✅ Selected for merge' : 'Right-click to select for merge'}`;
};