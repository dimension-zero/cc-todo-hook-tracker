import React, { useState, useEffect } from 'react';
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

declare global {
  interface Window {
    electronAPI: {
      getTodos: () => Promise<Project[]>;
      saveTodos: (filePath: string, todos: Todo[]) => Promise<boolean>;
      deleteTodoFile: (filePath: string) => Promise<boolean>;
    };
  }
}

type SortMethod = 0 | 1 | 2; // 0=alphabetic, 1=recent, 2=todos
type PaddingMode = 0 | 1 | 2; // 0=normal, 1=compact, 2=none
type FilterMode = 'all' | 'pending' | 'active'; // all=all todos, pending=in_progress+pending, active=in_progress only

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

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortMethod, setSortMethod] = useState<SortMethod>(1); // recent
  const [paddingMode, setPaddingMode] = useState<PaddingMode>(2); // none
  const [filterMode, setFilterMode] = useState<FilterMode>('all'); // show all
  const [showEmptyProjects, setShowEmptyProjects] = useState(false); // hide empty projects by default
  const [showFailedReconstructions, setShowFailedReconstructions] = useState(false); // hide failed path reconstructions by default
  
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
  
  // Session selection memory per project
  const [projectSessionMap, setProjectSessionMap] = useState<Map<string, string>>(new Map());
  
  // Tab multi-select for merging
  const [selectedTabs, setSelectedTabs] = useState<Set<string>>(new Set());
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeSource, setMergeSource] = useState<Session | null>(null);
  const [mergeTarget, setMergeTarget] = useState<Session | null>(null);
  const [contextMenuTab, setContextMenuTab] = useState<string | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  
  // Project context menu state
  const [projectContextMenu, setProjectContextMenu] = useState<Project | null>(null);
  const [showProjectContextMenu, setShowProjectContextMenu] = useState(false);
  const [projectContextMenuPosition, setProjectContextMenuPosition] = useState({ x: 0, y: 0 });
  
  // Resizable panes state
  const [leftPaneWidth, setLeftPaneWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);
  
  // Activity mode state
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
      setSelectedProject(mostRecentProject);
      setSelectedSession(mostRecentSession);
      
      // If there are todos, select the first in-progress or pending one
      const activeTodo = mostRecentSession.todos.findIndex(t => 
        t.status === 'in_progress' || t.status === 'pending'
      );
      if (activeTodo >= 0) {
        setSelectedIndices(new Set([activeTodo]));
        setLastSelectedIndex(activeTodo);
      } else {
        // Clear selection if no active todos
        setSelectedIndices(new Set());
        setLastSelectedIndex(null);
      }
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

  // Click outside handler for context menus
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.context-menu')) {
        setShowContextMenu(false);
        setShowProjectContextMenu(false);
      }
    };
    
    if (showContextMenu || showProjectContextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showContextMenu, showProjectContextMenu]);
  
  // Keyboard event handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Escape key to clear selection
      if (e.key === 'Escape') {
        clearSelection();
        setShowContextMenu(false);
        setShowProjectContextMenu(false);
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

  const loadTodos = async () => {
    try {
      const data = await window.electronAPI.getTodos();
      
      // Deduplicate sessions within each project  
      const deduplicatedData = data.map(project => ({
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
      }));
      
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
            setSelectedProject(globalMostRecentProject);
            setSelectedSession(globalMostRecentSession);
            
            // If there are todos, select the first in-progress or pending one
            const activeTodo = globalMostRecentSession.todos.findIndex(t => 
              t.status === 'in_progress' || t.status === 'pending'
            );
            if (activeTodo >= 0) {
              setSelectedIndices(new Set([activeTodo]));
              setLastSelectedIndex(activeTodo);
            } else {
              setSelectedIndices(new Set());
              setLastSelectedIndex(null);
            }
          }
          
          // Always update our knowledge of the global most recent time
          setLastGlobalMostRecentTime(globalMostRecentTime);
        }
      }
      
      // Standard project selection update (when not in activity mode or no auto-focus occurred)
      if (!activityMode && selectedProject) {
        const updated = deduplicatedData.find(p => p.path === selectedProject.path);
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
      
      setLoading(false);
    } catch (error) {
      console.error('Failed to load todos:', error);
      setLoading(false);
    }
  };

  const selectProject = (project: Project) => {
    // Cancel any edits when switching projects
    if (isDirty) {
      handleCancel();
    }
    
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
    // Cancel any edits when switching sessions
    if (isDirty) {
      handleCancel();
    }
    setSelectedSession(session);
    setEditedTodos(null);
    setIsDirty(false);
    clearSelection();
    
    // Remember this session selection for the current project
    if (selectedProject) {
      setProjectSessionMap(prev => {
        const newMap = new Map(prev);
        newMap.set(selectedProject.path, session.id);
        return newMap;
      });
    }
  };

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
      selectSession(session);
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
      await loadTodos();
      
      // Select the target session
      selectSession(mergeTarget);
      
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
        loadTodos();
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
    await loadTodos();
  };

  const handleDeleteSession = async () => {
    if (!selectedSession || !selectedSession.filePath) return;
    
    try {
      const success = await window.electronAPI.deleteTodoFile(selectedSession.filePath);
      if (success) {
        setShowDeleteConfirm(false);
        setSelectedSession(null);
        setEditedTodos(null);
        setIsDirty(false);
        loadTodos();
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
  
  const handleProjectContextMenu = (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();
    setProjectContextMenu(project);
    setShowProjectContextMenu(true);
    setProjectContextMenuPosition({ x: e.clientX, y: e.clientY });
  };
  
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      console.log('Copied to clipboard:', text);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  const handleProjectCopyName = () => {
    if (projectContextMenu) {
      const projectName = projectContextMenu.path ? projectContextMenu.path.split(/[\\/]/).pop() : 'Unknown Project';
      copyToClipboard(projectName || '');
      setShowProjectContextMenu(false);
    }
  };
  
  const handleProjectCopyCodePath = () => {
    if (projectContextMenu) {
      copyToClipboard(projectContextMenu.path);
      setShowProjectContextMenu(false);
    }
  };
  
  const handleProjectCopyTodoPath = () => {
    if (projectContextMenu && projectContextMenu.sessions.length > 0) {
      // Get the todo folder path from the first session's file path
      const firstSessionPath = projectContextMenu.sessions[0].filePath;
      const lastSlashIndex = Math.max(firstSessionPath.lastIndexOf('/'), firstSessionPath.lastIndexOf('\\'));
      const todoFolderPath = firstSessionPath.substring(0, lastSlashIndex);
      copyToClipboard(todoFolderPath);
      setShowProjectContextMenu(false);
    }
  };

  const handleDeleteEmptySessions = async () => {
    if (!projectContextMenu) return;
    
    // Find all empty sessions in this project
    const emptySessions = projectContextMenu.sessions.filter(s => s.todos.length === 0);
    
    if (emptySessions.length === 0) {
      alert('No empty sessions found in this project.');
      setShowProjectContextMenu(false);
      return;
    }
    
    // Ask for confirmation
    const confirmation = window.confirm(
      `Found ${emptySessions.length} empty session${emptySessions.length > 1 ? 's' : ''} in "${
        projectContextMenu.path.split(/[\\/]/).pop()
      }".\n\nDelete ${emptySessions.length > 1 ? 'them' : 'it'}?`
    );
    
    if (!confirmation) {
      setShowProjectContextMenu(false);
      return;
    }
    
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
    
    // Close menu and reload
    setShowProjectContextMenu(false);
    
    // Show result
    if (failedCount > 0) {
      alert(`Deleted ${deletedCount} empty session(s). Failed to delete ${failedCount} session(s).`);
    } else if (deletedCount > 0) {
      console.log(`Successfully deleted ${deletedCount} empty session(s)`);
    }
    
    // Reload todos to reflect changes
    await loadTodos();
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
  
  const getSessionTooltip = (session: Session, project: Project) => {
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
    
    return tooltipLines.join('\n');
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

  const displayTodos = editedTodos || selectedSession?.todos || [];
  
  const filteredTodos = displayTodos.filter(todo => {
    switch (filterMode) {
      case 'pending':
        return todo.status === 'pending' || todo.status === 'in_progress';
      case 'active':
        return todo.status === 'in_progress';
      case 'all':
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

  const getSortSymbol = (method: number) => {
    switch(method) {
      case 0: return 'AZ';
      case 1: return '⏱';
      case 2: return '#';
      default: return '';
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="app">
      {/* Sidebar with projects */}
      <div className="sidebar" style={{ width: leftPaneWidth }}>
        <div className="sidebar-header">
          <div className="sidebar-header-top">
            <h2>Projects ({sortedProjects.length})</h2>
            <div className="activity-toggle">
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
                  title={method === 0 ? 'Sort alphabetically' : method === 1 ? 'Sort by recent' : 'Sort by todo count'}
                >
                  {getSortSymbol(method)}
                </button>
              ))}
            </div>
            <div className="show-empty-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={showEmptyProjects}
                  onChange={(e) => setShowEmptyProjects(e.target.checked)}
                />
                <span>Show empty</span>
              </label>
            </div>
            <div className="show-empty-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={showFailedReconstructions}
                  onChange={(e) => setShowFailedReconstructions(e.target.checked)}
                />
                <span>Show failed paths</span>
              </label>
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
      
      <div 
        className="divider" 
        onMouseDown={() => setIsResizing(true)}
      />
      
      <div className="main-content">
        {selectedProject && (
          <>
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
                <label>Filter:</label>
                <div className="filter-toggle">
                  <button
                    className={`filter-btn ${filterMode === 'all' ? 'active' : ''}`}
                    onClick={() => setFilterMode('all')}
                  >
                    All
                  </button>
                  <button
                    className={`filter-btn ${filterMode === 'pending' ? 'active' : ''}`}
                    onClick={() => setFilterMode('pending')}
                  >
                    Active
                  </button>
                  <button
                    className={`filter-btn ${filterMode === 'active' ? 'active' : ''}`}
                    onClick={() => setFilterMode('active')}
                  >
                    In Progress
                  </button>
                </div>
              </div>
              
              <div className="padding-controls">
                <label className="spacing-label">SPACING:</label>
                <div className="padding-buttons">
                  {[0, 1, 2].map(mode => (
                    <button
                      key={mode}
                      className={`padding-btn ${paddingMode === mode ? 'active' : ''}`}
                      onClick={() => setPaddingMode(mode as PaddingMode)}
                    >
                      {mode === 0 ? 'Normal' : mode === 1 ? 'Compact' : 'None'}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="delete-all-controls">
                {selectedTabs.size >= 2 && (
                  <button className="merge-btn" onClick={startMerge}>
                    Merge {selectedTabs.size} Sessions
                  </button>
                )}
                {selectedProject.sessions.some(s => s.todos.length === 0) && (
                  <button className="delete-empty-btn" onClick={handleDeleteEmptySessionsInProject}>
                    Delete Empty ({selectedProject.sessions.filter(s => s.todos.length === 0).length})
                  </button>
                )}
                {!showDeleteConfirm ? (
                  <button className="delete-all-btn" onClick={() => setShowDeleteConfirm(true)}>
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
                    title={getSessionTooltip(session, selectedProject)}
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
                title={`${selectedTabs.has(selectedSession.id) ? 'Selected for merge • ' : ''}Shift+Click or Right-Click to select for merge`}
              >
                <div className="todos-container">
                  {isDirty && (
                    <div className="edit-controls">
                      <button className="save-btn" onClick={handleSave}>Save</button>
                      <button className="discard-btn" onClick={handleCancel}>Discard</button>
                    </div>
                  )}
                  <div className={`todos-list padding-${paddingMode === 0 ? 'normal' : paddingMode === 1 ? 'compact' : 'none'}`}>
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
                </div>
              </div>
            )}
          </>
        )}
      </div>
      
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
      
      {/* Project Context Menu */}
      {showProjectContextMenu && (
        <div
          className="context-menu"
          style={{ left: projectContextMenuPosition.x, top: projectContextMenuPosition.y }}
          onMouseLeave={() => setShowProjectContextMenu(false)}
        >
          <div className="context-menu-item" onClick={handleProjectCopyName}>
            Copy Project Name
          </div>
          <div className="context-menu-item" onClick={handleProjectCopyCodePath}>
            Copy Project Code Path
          </div>
          <div className="context-menu-item" onClick={handleProjectCopyTodoPath}>
            Copy Todo Folder Path
          </div>
          <div className="context-menu-divider" />
          <div className="context-menu-item context-menu-danger" onClick={handleDeleteEmptySessions}>
            Delete Empty Todo Sessions
          </div>
        </div>
      )}
    </div>
  );
}

export default App;