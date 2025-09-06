import React, { useState, useEffect } from 'react';
import './App.css';
import { BoidSystem } from './components/BoidSystem';
import { AnimatedBackground } from './components/AnimatedBackground';

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

type SpacingMode = 'wide' | 'normal' | 'compact';
type FilterState = {
  completed: boolean;
  in_progress: boolean;
  pending: boolean;
};

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

interface SingleProjectPaneProps {
  selectedProject: Project | null;
  selectedSession: Session | null;
  onSessionSelect: (session: Session) => void;
  onLoadTodos: () => Promise<void>;
}

export function SingleProjectPane({ 
  selectedProject, 
  selectedSession, 
  onSessionSelect,
  onLoadTodos 
}: SingleProjectPaneProps) {
  const [spacingMode, setSpacingMode] = useState<SpacingMode>('compact');
  const [filterState, setFilterState] = useState<FilterState>({
    completed: true,
    in_progress: true,
    pending: true
  });
  
  // Edit state management
  const [editedTodos, setEditedTodos] = useState<Todo[] | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState<string>('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  
  // Tab multi-select for merging
  const [selectedTabs, setSelectedTabs] = useState<Set<string>>(new Set());
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeSource, setMergeSource] = useState<Session | null>(null);
  const [mergeTarget, setMergeTarget] = useState<Session | null>(null);
  const [contextMenuTab, setContextMenuTab] = useState<string | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });

  // Click outside handler for context menus
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.context-menu')) {
        setShowContextMenu(false);
      }
    };
    
    if (showContextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showContextMenu]);
  
  // Keyboard event handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Escape key to clear selection
      if (e.key === 'Escape') {
        clearSelection();
        setShowContextMenu(false);
        return;
      }
      
      // Handle arrow keys for moving selected items
      if (selectedIndices.size > 0 && !editingIndex) {
        if (e.key === 'ArrowUp' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          moveSelectedItems('up');
        } else if (e.key === 'ArrowDown' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          moveSelectedItems('down');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndices, editingIndex]);

  // Click away handler for context menu
  useEffect(() => {
    const handleClickAway = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.context-menu')) {
        setShowContextMenu(false);
      }
    };

    if (showContextMenu) {
      document.addEventListener('click', handleClickAway);
      return () => document.removeEventListener('click', handleClickAway);
    }
  }, [showContextMenu]);

  // Tab selection for merging
  const handleTabClick = (e: React.MouseEvent, session: Session) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      e.preventDefault();
      // Toggle tab selection for merge (Ctrl/Cmd+click or Shift+click)
      setSelectedTabs(prev => {
        const newSet = new Set(prev);
        if (newSet.has(session.id)) {
          newSet.delete(session.id);
        } else {
          // Allow multiple selections for merge
          newSet.add(session.id);
        }
        return newSet;
      });
    } else {
      // Normal tab selection
      setSelectedTabs(new Set());
      onSessionSelect(session);
    }
  };

  const handleTabRightClick = (e: React.MouseEvent, session: Session) => {
    e.preventDefault();
    setContextMenuTab(session.id);
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const [mergeSources, setMergeSources] = useState<Session[]>([]);
  const [mergePreview, setMergePreview] = useState<{
    totalTodos: number;
    duplicates: number;
    newTodos: number;
    steps: Array<{source: string; target: string; todos: number}>;
  } | null>(null);

  const startMerge = () => {
    if (selectedTabs.size < 2) {
      console.error('Merge requires at least 2 selected tabs, got:', selectedTabs.size);
      return;
    }
    
    const tabArray = Array.from(selectedTabs);
    const sessions = selectedProject?.sessions.filter(s => 
      tabArray.includes(s.id)
    ) || [];
    
    console.log('Starting merge with tabs:', tabArray);
    console.log('Found sessions:', sessions.map(s => s.id));
    
    if (sessions.length >= 2) {
      // Sort by date - newest is target, all others are sources
      const sorted = sessions.sort((a, b) => 
        b.lastModified.getTime() - a.lastModified.getTime()
      );
      const target = sorted[0];
      const sources = sorted.slice(1);
      
      // Calculate merge preview
      const preview = calculateMergePreview(sources, target);
      
      setMergeTarget(target);
      setMergeSources(sources);
      setMergeSource(sources[0]); // For backward compatibility
      setMergePreview(preview);
      setShowMergeDialog(true);
    } else {
      console.error('Could not find enough sessions for merge. Found:', sessions.length);
    }
  };

  const calculateMergePreview = (sources: Session[], target: Session) => {
    let totalNewTodos = 0;
    let totalDuplicates = 0;
    const steps: Array<{source: string; target: string; todos: number}> = [];
    
    const targetContents = new Set(target.todos.map(t => t.content.toLowerCase()));
    const mergedContents = new Set(targetContents);
    
    for (const source of sources) {
      let stepNewTodos = 0;
      let stepDuplicates = 0;
      
      for (const todo of source.todos) {
        const lowerContent = todo.content.toLowerCase();
        if (mergedContents.has(lowerContent)) {
          stepDuplicates++;
        } else {
          stepNewTodos++;
          mergedContents.add(lowerContent);
        }
      }
      
      totalNewTodos += stepNewTodos;
      totalDuplicates += stepDuplicates;
      steps.push({
        source: source.id.substring(0, 8),
        target: target.id.substring(0, 8),
        todos: stepNewTodos
      });
    }
    
    return {
      totalTodos: target.todos.length + totalNewTodos,
      duplicates: totalDuplicates,
      newTodos: totalNewTodos,
      steps
    };
  };

  const performMerge = async () => {
    if (!mergeTarget || !mergeTarget.filePath || mergeSources.length === 0) return;
    
    try {
      // Start with target todos
      let mergedTodos: Todo[] = [...mergeTarget.todos];
      const mergedContents = new Set(mergeTarget.todos.map(t => t.content.toLowerCase()));
      
      // Track merge progress
      const mergeResults: Array<{source: string; success: boolean; todosAdded: number; error?: string}> = [];
      
      // Sequential merge - one source at a time
      for (const source of mergeSources) {
        if (!source.filePath) {
          mergeResults.push({
            source: source.id.substring(0, 8),
            success: false,
            todosAdded: 0,
            error: 'No file path'
          });
          continue;
        }
        
        try {
          // Save current state for rollback
          const beforeMerge = [...mergedTodos];
          let todosAdded = 0;
          
          // Add unique todos from this source
          for (const sourceTodo of source.todos) {
            if (!mergedContents.has(sourceTodo.content.toLowerCase())) {
              mergedTodos.push(sourceTodo);
              mergedContents.add(sourceTodo.content.toLowerCase());
              todosAdded++;
            }
          }
          
          // Verify the merge makes sense
          if (mergedTodos.length !== beforeMerge.length + todosAdded) {
            console.error(`Merge verification failed: expected ${beforeMerge.length + todosAdded} todos, got ${mergedTodos.length}`);
            alert('Merge operation failed verification. Please try again.');
            return;
          }
          
          // Save the updated todos to target
          await window.electronAPI.saveTodos(mergeTarget.filePath, mergedTodos);
          
          // Delete the source session only after successful save
          await window.electronAPI.deleteTodoFile(source.filePath);
          
          mergeResults.push({
            source: source.id.substring(0, 8),
            success: true,
            todosAdded
          });
          
        } catch (error) {
          // Rollback on error
          console.error(`Failed to merge session ${source.id}:`, error);
          mergeResults.push({
            source: source.id.substring(0, 8),
            success: false,
            todosAdded: 0,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          // Stop merging further sources on error
          break;
        }
      }
      
      // Log results
      console.log('Merge completed:', mergeResults);
      
      // Clear selections and reload
      setSelectedTabs(new Set());
      setShowMergeDialog(false);
      setMergeSource(null);
      setMergeSources([]);
      setMergeTarget(null);
      setMergePreview(null);
      
      // Reload data
      await onLoadTodos();
      
      // Select the target session
      onSessionSelect(mergeTarget);
      
      // Show summary if there were any failures
      const failures = mergeResults.filter(r => !r.success);
      if (failures.length > 0) {
        alert(`Merge partially completed. ${failures.length} session(s) failed to merge.`);
      }
      
    } catch (error) {
      console.error('Failed to perform merge:', error);
      alert('Merge failed. No changes were made.');
    }
  };

  const clearSelection = () => {
    setSelectedIndices(new Set());
    setLastSelectedIndex(null);
  };

  const moveSelectedItems = (direction: 'up' | 'down') => {
    if (selectedIndices.size === 0 || !editedTodos) return;
    
    // Check if selection is contiguous
    const sorted = Array.from(selectedIndices).sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + 1) return; // Non-contiguous, don't move
    }
    
    const firstIndex = sorted[0];
    const lastIndex = sorted[sorted.length - 1];
    
    if (direction === 'up' && firstIndex > 0) {
      const newTodos = [...editedTodos];
      const itemToMove = newTodos[firstIndex - 1];
      
      // Move all selected items up
      for (let i = firstIndex; i <= lastIndex; i++) {
        newTodos[i - 1] = newTodos[i];
      }
      newTodos[lastIndex] = itemToMove;
      
      // Update selection indices
      const newSelection = new Set(Array.from(selectedIndices).map(i => i - 1));
      setSelectedIndices(newSelection);
      setLastSelectedIndex((lastSelectedIndex || 0) - 1);
      
      setEditedTodos(newTodos);
      setIsDirty(true);
    } else if (direction === 'down' && lastIndex < editedTodos.length - 1) {
      const newTodos = [...editedTodos];
      const itemToMove = newTodos[lastIndex + 1];
      
      // Move all selected items down
      for (let i = lastIndex; i >= firstIndex; i--) {
        newTodos[i + 1] = newTodos[i];
      }
      newTodos[firstIndex] = itemToMove;
      
      // Update selection indices
      const newSelection = new Set(Array.from(selectedIndices).map(i => i + 1));
      setSelectedIndices(newSelection);
      setLastSelectedIndex((lastSelectedIndex || 0) + 1);
      
      setEditedTodos(newTodos);
      setIsDirty(true);
    }
  };

  const handleTodoClick = (e: React.MouseEvent, index: number) => {
    if (e.shiftKey && lastSelectedIndex !== null) {
      // Range selection
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const newSelection = new Set<number>();
      for (let i = start; i <= end; i++) {
        newSelection.add(i);
      }
      setSelectedIndices(newSelection);
      setLastSelectedIndex(index);
    } else if (e.ctrlKey || e.metaKey) {
      // Toggle selection
      const newSelection = new Set(selectedIndices);
      if (newSelection.has(index)) {
        newSelection.delete(index);
      } else {
        newSelection.add(index);
      }
      setSelectedIndices(newSelection);
      setLastSelectedIndex(index);
    } else {
      // Single selection
      setSelectedIndices(new Set([index]));
      setLastSelectedIndex(index);
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    // Initialize edited todos if not already
    if (!editedTodos && selectedSession) {
      setEditedTodos([...selectedSession.todos]);
    }
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== dropIndex && editedTodos) {
      const newTodos = [...editedTodos];
      const [movedTodo] = newTodos.splice(draggedIndex, 1);
      newTodos.splice(dropIndex, 0, movedTodo);
      setEditedTodos(newTodos);
      setIsDirty(true);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const startEdit = (index: number) => {
    if (!editedTodos && selectedSession) {
      setEditedTodos([...selectedSession.todos]);
    }
    setEditingIndex(index);
    setEditingContent(editedTodos ? editedTodos[index].content : selectedSession?.todos[index].content || '');
  };

  const saveEdit = () => {
    if (editingIndex !== null && editingContent.trim() && editedTodos) {
      const newTodos = [...editedTodos];
      newTodos[editingIndex] = { ...newTodos[editingIndex], content: editingContent.trim() };
      setEditedTodos(newTodos);
      setIsDirty(true);
      setEditingIndex(null);
      setEditingContent('');
    }
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingContent('');
  };

  const handleDelete = (index: number) => {
    if (!editedTodos && selectedSession) {
      setEditedTodos([...selectedSession.todos]);
    }
    if (editedTodos) {
      const newTodos = editedTodos.filter((_, i) => i !== index);
      setEditedTodos(newTodos);
      setIsDirty(true);
      clearSelection();
    }
  };

  const handleSave = async () => {
    if (!selectedSession || !editedTodos || !selectedSession.filePath) return;
    
    try {
      const success = await window.electronAPI.saveTodos(selectedSession.filePath, editedTodos);
      if (success) {
        setIsDirty(false);
        await onLoadTodos();
      }
    } catch (error) {
      console.error('Failed to save todos:', error);
    }
  };

  const handleCancel = () => {
    setEditedTodos(null);
    setIsDirty(false);
    clearSelection();
  };

  const handleDeleteEmptySessionsInProject = async () => {
    if (!selectedProject) return;
    
    // Find all empty sessions in current project
    const emptySessions = selectedProject.sessions.filter(s => s.todos.length === 0);
    
    if (emptySessions.length === 0) {
      alert('No empty sessions found in this project.');
      return;
    }
    
    // Ask for confirmation
    const confirmation = window.confirm(
      `Found ${emptySessions.length} empty session${emptySessions.length > 1 ? 's' : ''} in "${
        selectedProject.path.split(/[\\/]/).pop()
      }".\n\nDelete ${emptySessions.length > 1 ? 'them' : 'it'}?`
    );
    
    if (!confirmation) return;
    
    // Delete each empty session
    let deletedCount = 0;
    let failedCount = 0;
    
    for (const session of emptySessions) {
      if (session.filePath) {
        try {
          await window.electronAPI.deleteTodoFile(session.filePath);
          deletedCount++;
          console.log(`Deleted empty session: ${session.id}`);
        } catch (error) {
          console.error(`Failed to delete session ${session.id}:`, error);
          failedCount++;
        }
      }
    }
    
    // Show result
    if (failedCount > 0) {
      alert(`Deleted ${deletedCount} empty session(s). Failed to delete ${failedCount} session(s).`);
    } else if (deletedCount > 0) {
      console.log(`Successfully deleted ${deletedCount} empty session(s)`);
    }
    
    // Reload todos to reflect changes
    await onLoadTodos();
  };

  const handleDeleteSession = async () => {
    if (!selectedSession || !selectedSession.filePath) return;
    
    try {
      const success = await window.electronAPI.deleteTodoFile(selectedSession.filePath);
      if (success) {
        setShowDeleteConfirm(false);
        setEditedTodos(null);
        setIsDirty(false);
        await onLoadTodos();
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const getStatusSymbol = (status: string) => {
    switch (status) {
      case 'completed': return '✓';
      case 'in_progress': return '▶';
      case 'pending': return '○';
      default: return '?';
    }
  };

  const getStatusCounts = (session: Session) => {
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
  
  const getSessionTooltip = (session: Session, project: Project, isMultiSelected: boolean) => {
    const counts = getStatusCounts(session);
    const projectName = project.path ? project.path.split(/[\\/]/).pop() : 'Unknown Project';
    
    // Get the todo folder path
    const lastSlashIndex = Math.max(session.filePath.lastIndexOf('/'), session.filePath.lastIndexOf('\\'));
    const todoFolderPath = session.filePath.substring(0, lastSlashIndex);
    
    const tooltipLines = [
      `Project Name: ${projectName}`,
      `Project Path: ${project.path}`,
      `Todo Folder: ${todoFolderPath}`,
      `Session ID: ${session.id}`,
      `File: ${session.filePath.split(/[\\/]/).pop()}`,
      '',
      'Todo Summary:',
      `  ${counts.pending} Pending`,
      `  ${counts.in_progress} In Progress`,
      `  ${counts.completed} Completed`,
      `  Total: ${session.todos.length} todos`,
      '',
      `Last Modified: ${formatUKDate(session.lastModified)} ${formatUKTime(session.lastModified)}`
    ];
    
    // Add merge instruction
    if (isMultiSelected) {
      tooltipLines.push('', '✓ Selected for merge');
    } else {
      tooltipLines.push('', 'Shift+Click or Right-Click to select for merge');
    }
    
    return tooltipLines.join('\n');
  };

  const displayTodos = editedTodos || selectedSession?.todos || [];
  
  const filteredTodos = displayTodos.filter(todo => {
    switch (todo.status) {
      case 'completed':
        return filterState.completed;
      case 'in_progress':
        return filterState.in_progress;
      case 'pending':
        return filterState.pending;
      default:
        return true;
    }
  });

  const isContiguousSelection = () => {
    if (selectedIndices.size <= 1) return true;
    const sorted = Array.from(selectedIndices).sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + 1) return false;
    }
    return true;
  };

  if (!selectedProject) {
    return (
      <div className="main-content">
        <AnimatedBackground />
        <BoidSystem />
        <div className="no-project-selected">
          <h2>No Project Selected</h2>
          <p>Select a project from the sidebar to view its sessions and todos.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content">
      <AnimatedBackground />
      <BoidSystem />
      <div className="project-header">
        <h1>
          {selectedProject.path}
          {selectedSession && (
            <span className="todo-count-badge"> ({displayTodos ? displayTodos.length : 0})</span>
          )}
        </h1>
      </div>
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
      <div className="session-tabs">
        {selectedProject.sessions
          .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
          .map((session) => {
          const counts = getStatusCounts(session);
          const isSelected = selectedSession?.id === session.id;
          const isMultiSelected = selectedTabs.has(session.id);
          
          return (
            <div
              key={session.id}
              className={`session-tab ${isSelected ? 'active' : ''} ${isMultiSelected ? 'multi-selected' : ''}`}
              onClick={(e) => handleTabClick(e, session)}
              onContextMenu={(e) => handleTabRightClick(e, session)}
              title={getSessionTooltip(session, selectedProject, isMultiSelected)}
            >
              <div className="session-info">
                <div className="session-id">{session.id.substring(0, 6)}</div>
                <div className="session-date">
                  {formatUKDate(session.lastModified)} {formatUKTime(session.lastModified)}
                </div>
              </div>
            </div>
          );
        })}
        {selectedTabs.size === 2 && (
          <button className="merge-button" onClick={startMerge}>
            Merge Selected ({selectedTabs.size})
          </button>
        )}
      </div>
      
      {selectedSession && (
        <div 
          className={`session-content ${selectedTabs.has(selectedSession.id) ? 'multi-selected' : ''}`}
          onClick={(e) => {
            // Only handle shift-click or ctrl/cmd-click for merge selection
            // Ignore clicks on interactive elements
            const target = e.target as HTMLElement;
            if (target.closest('.todo-item') || target.closest('.edit-controls') || target.closest('.status-bar')) {
              return;
            }
            
            if (e.shiftKey || e.ctrlKey || e.metaKey) {
              e.preventDefault();
              e.stopPropagation();
              handleTabClick(e, selectedSession);
            }
          }}
          onContextMenu={(e) => {
            // Right-click also selects for merge
            // Ignore clicks on interactive elements
            const target = e.target as HTMLElement;
            if (target.closest('.todo-item') || target.closest('.edit-controls') || target.closest('.status-bar')) {
              return;
            }
            
            e.preventDefault();
            e.stopPropagation();
            handleTabClick({ ...e, shiftKey: true } as any, selectedSession);
          }}
          title=""
        >
          <div className="todos-container">
            {isDirty && (
              <div className="edit-controls">
                <button className="save-btn" onClick={handleSave}>Save</button>
                <button className="discard-btn" onClick={handleCancel}>Discard</button>
              </div>
            )}
            <div className={`todos-list padding-${spacingMode}`}>
              {filteredTodos.map((todo, index) => {
                const originalIndex = displayTodos.indexOf(todo);
                const isSelected = selectedIndices.has(originalIndex);
                const sequenceNumber = index + 1;
                
                return (
                  <div
                    key={`${todo.id || index}-${originalIndex}`}
                    className={`todo-item ${isSelected ? 'selected' : ''} ${
                      dragOverIndex === originalIndex ? 'drag-over' : ''
                    }`}
                    draggable={!editingIndex}
                    onDragStart={(e) => handleDragStart(e, originalIndex)}
                    onDragOver={(e) => handleDragOver(e, originalIndex)}
                    onDrop={(e) => handleDrop(e, originalIndex)}
                    onDragLeave={() => setDragOverIndex(null)}
                    onClick={(e) => handleTodoClick(e, originalIndex)}
                  >
                    <span className="todo-sequence">{sequenceNumber}.</span>
                    <span className={`status-icon ${todo.status}`}>
                      {getStatusSymbol(todo.status)}
                    </span>
                    {editingIndex === originalIndex ? (
                      <input
                        type="text"
                        className="todo-edit-input"
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        onBlur={saveEdit}
                        autoFocus
                      />
                    ) : (
                      <>
                        <span className="todo-content">
                          {todo.id && <span className="todo-id">[{todo.id.substring(0, 4)}] </span>}
                          {todo.content}
                        </span>
                        <div className="todo-actions">
                          <button 
                            className="edit-btn" 
                            onClick={(e) => {
                              e.stopPropagation();
                              startEdit(originalIndex);
                            }}
                          >
                            ✏️
                          </button>
                          <button 
                            className="delete-btn" 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(originalIndex);
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="status-bar">
              <div className="status-bar-left">
                {selectedIndices.size === 0 && displayTodos.length > 0 && (
                  <span>Click to select items • Shift+Click for range • Ctrl+Click for multi-select • Drag to reorder</span>
                )}
                {selectedIndices.size === 1 && (
                  <span>Click to select • Shift+Click for range • Ctrl+Click to multi-select • Drag to reorder • Ctrl+↑↓ to move</span>
                )}
                {selectedIndices.size > 1 && isContiguousSelection() && (
                  <span>{selectedIndices.size} items selected • Ctrl+↑↓ to move • Drag to reorder • Escape to clear</span>
                )}
                {selectedIndices.size > 1 && !isContiguousSelection() && (
                  <span>{selectedIndices.size} items selected (non-contiguous) • Select adjacent items to move • Escape to clear</span>
                )}
              </div>
              <div className="status-bar-right">
                <span className="activity-log">
                  {isDirty ? 'Modified •' : ''} 
                  {selectedSession ? `${selectedSession.todos.filter(t => t.status === 'completed').length}/${selectedSession.todos.length} completed` : 'No session'}
                  {selectedSession?.lastModified && ` • Updated: ${formatUKTime(selectedSession.lastModified)}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Merge Dialog */}
      {showMergeDialog && mergeTarget && mergeSources.length > 0 && (
        <div className="merge-dialog-overlay">
          <div className="merge-dialog">
            <h3>Merge {mergeSources.length + 1} Sessions</h3>
            
            <div className="merge-info">
              <div className="merge-sources">
                <h4>Sources ({mergeSources.length} sessions - will be deleted):</h4>
                {mergeSources.map((source, idx) => (
                  <div key={source.id} className="session-details">
                    <div>#{idx + 1}: {source.id.substring(0, 8)}</div>
                    <div>Todos: {source.todos.length}</div>
                    <div>Date: {formatUKDate(source.lastModified)} {formatUKTime(source.lastModified)}</div>
                  </div>
                ))}
              </div>
              
              <div className="merge-arrow">→</div>
              
              <div className="merge-target">
                <h4>Target (newest - will keep):</h4>
                <div className="session-details">
                  <div>Session: {mergeTarget.id.substring(0, 8)}</div>
                  <div>Todos: {mergeTarget.todos.length}</div>
                  <div>Date: {formatUKDate(mergeTarget.lastModified)} {formatUKTime(mergeTarget.lastModified)}</div>
                </div>
              </div>
            </div>
            
            {mergePreview && (
              <div className="merge-preview">
                <h4>Merge Plan (Sequential):</h4>
                <div className="merge-steps">
                  {mergePreview.steps.map((step, idx) => (
                    <div key={idx} className="merge-step">
                      Step {idx + 1}: Merge {step.source} → {step.target} 
                      <span className="step-detail">({step.todos} new todos)</span>
                    </div>
                  ))}
                </div>
              
                <div className="merge-stats">
                  <div className="stat">
                    <span className="stat-label">New todos to add:</span>
                    <span className="stat-value">{mergePreview.newTodos}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Duplicates (will skip):</span>
                    <span className="stat-value">{mergePreview.duplicates}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Final todo count:</span>
                    <span className="stat-value">{mergePreview.totalTodos}</span>
                  </div>
                </div>
              </div>
            )}
            
            <div className="merge-actions">
              <button className="confirm-btn" onClick={performMerge}>
                Merge and Delete {mergeSources.length} Source{mergeSources.length > 1 ? 's' : ''}
              </button>
              <button className="cancel-btn" onClick={() => {
                setShowMergeDialog(false);
                setSelectedTabs(new Set());
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Context Menu */}
      {showContextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenuPosition.x, top: contextMenuPosition.y }}
        >
          <div className="context-menu-item" onClick={() => {
            if (contextMenuTab) {
              navigator.clipboard.writeText(contextMenuTab);
              setShowContextMenu(false);
            }
          }}>
            Copy Session ID
          </div>
        </div>
      )}
    </div>
  );
}