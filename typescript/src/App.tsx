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
  
  // Resizable panes state
  const [leftPaneWidth, setLeftPaneWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);

  // Load todos data
  useEffect(() => {
    loadTodos();
    // Refresh every 5 seconds
    const interval = setInterval(loadTodos, 5000);
    return () => clearInterval(interval);
  }, []);

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
      
      // If a project was selected, update it
      if (selectedProject) {
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
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      // Toggle tab selection for merge
      setSelectedTabs(prev => {
        const newSet = new Set(prev);
        if (newSet.has(session.id)) {
          newSet.delete(session.id);
        } else {
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

  const startMerge = () => {
    if (selectedTabs.size !== 2) return;
    
    const tabArray = Array.from(selectedTabs);
    const sessions = selectedProject?.sessions.filter(s => 
      tabArray.includes(s.id)
    ) || [];
    
    if (sessions.length === 2) {
      // Older is source (will be deleted), newer is target (will be kept)
      const [older, newer] = sessions.sort((a, b) => 
        a.lastModified.getTime() - b.lastModified.getTime()
      );
      setMergeSource(older);
      setMergeTarget(newer);
      setShowMergeDialog(true);
    }
  };

  const performMerge = async () => {
    if (!mergeSource || !mergeTarget || !mergeSource.filePath || !mergeTarget.filePath) return;
    
    try {
      // Merge todos - newer status wins for duplicates
      const mergedTodos: Todo[] = [...mergeTarget.todos];
      const targetContents = new Set(mergeTarget.todos.map(t => t.content.toLowerCase()));
      
      // Add unique todos from source
      for (const sourceTodo of mergeSource.todos) {
        if (!targetContents.has(sourceTodo.content.toLowerCase())) {
          mergedTodos.push(sourceTodo);
        }
      }
      
      // Save merged todos
      await window.electronAPI.saveTodos(mergeTarget.filePath, mergedTodos);
      
      // Delete source session
      await window.electronAPI.deleteTodoFile(mergeSource.filePath);
      
      // Clear selections and reload
      setSelectedTabs(new Set());
      setShowMergeDialog(false);
      setMergeSource(null);
      setMergeTarget(null);
      
      // Reload data
      await loadTodos();
      
      // Select the target session
      selectSession(mergeTarget);
    } catch (error) {
      console.error('Failed to merge sessions:', error);
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

  const sortedProjects = [...projects].sort((a, b) => {
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
          <h2>Projects</h2>
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
        </div>
        <div className="sidebar-projects">
          {sortedProjects.map((project) => {
            const todoCount = project.sessions.reduce((sum, s) => sum + s.todos.length, 0);
            return (
              <div
                key={project.path}
                className={`project-item ${selectedProject === project ? 'selected' : ''}`}
                onClick={() => selectProject(project)}
              >
                <div className="project-name">{project.path || 'Unknown Project'}</div>
                <div className="project-stats">
                  {todoCount} todos • {project.sessions.length} sessions
                  {project.mostRecentTodoDate && (
                    <div className="project-date">
                      {formatUKDate(project.mostRecentTodoDate)}
                    </div>
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
            <div className="session-tabs">
              {selectedProject.sessions.map((session) => {
                const counts = getStatusCounts(session);
                const isSelected = selectedSession?.id === session.id;
                const isMultiSelected = selectedTabs.has(session.id);
                
                return (
                  <div
                    key={session.id}
                    className={`session-tab ${isSelected ? 'active' : ''} ${isMultiSelected ? 'multi-selected' : ''}`}
                    onClick={(e) => handleTabClick(e, session)}
                    onContextMenu={(e) => handleTabRightClick(e, session)}
                  >
                    <div className="session-info">
                      <span className="session-id">{session.id.substring(0, 8)}</span>
                      <span className="todo-count">
                        <span className="pending">{counts.pending}p</span>
                        <span className="in-progress">{counts.in_progress}i</span>
                        <span className="completed">{counts.completed}c</span>
                      </span>
                      <span className="session-date">
                        {formatUKDate(session.lastModified)} {formatUKTime(session.lastModified)}
                      </span>
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
              <div className="session-content">
                <div className="control-bar">
                  <div className="filter-controls">
                    <label>Filter:</label>
                    <select 
                      value={filterMode} 
                      onChange={(e) => setFilterMode(e.target.value as FilterMode)}
                    >
                      <option value="all">All</option>
                      <option value="pending">Pending + Active</option>
                      <option value="active">Active Only</option>
                    </select>
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
                
                <div className="todos-container">
                  <div className="todos-header">
                    <h2>Todos ({displayTodos.length})</h2>
                    {isDirty && (
                      <div className="edit-controls">
                        <button className="save-btn" onClick={handleSave}>Save</button>
                        <button className="discard-btn" onClick={handleCancel}>Discard</button>
                      </div>
                    )}
                  </div>
                  <div className={`todos-list padding-${paddingMode === 0 ? 'normal' : paddingMode === 1 ? 'compact' : 'none'}`}>
                    {filteredTodos.map((todo, index) => {
                      const originalIndex = displayTodos.indexOf(todo);
                      const isSelected = selectedIndices.has(originalIndex);
                      
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
      {showMergeDialog && mergeSource && mergeTarget && (
        <div className="merge-dialog-overlay">
          <div className="merge-dialog">
            <h3>Merge Sessions</h3>
            
            <div className="merge-info">
              <div className="merge-source">
                <h4>Source (will be deleted):</h4>
                <div className="session-details">
                  <div>Session: {mergeSource.id.substring(0, 8)}</div>
                  <div>Todos: {mergeSource.todos.length}</div>
                  <div>Date: {formatUKDate(mergeSource.lastModified)} {formatUKTime(mergeSource.lastModified)}</div>
                </div>
              </div>
              
              <div className="merge-arrow">→</div>
              
              <div className="merge-target">
                <h4>Target (will receive todos):</h4>
                <div className="session-details">
                  <div>Session: {mergeTarget.id.substring(0, 8)}</div>
                  <div>Todos: {mergeTarget.todos.length}</div>
                  <div>Date: {formatUKDate(mergeTarget.lastModified)} {formatUKTime(mergeTarget.lastModified)}</div>
                </div>
              </div>
            </div>
            
            <div className="merge-stats">
              <div className="stat">
                <span className="stat-label">Unique todos to merge:</span>
                <span className="stat-value">
                  {mergeSource.todos.filter(s => 
                    !mergeTarget.todos.some(t => 
                      t.content.toLowerCase() === s.content.toLowerCase()
                    )
                  ).length}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Duplicates (will skip):</span>
                <span className="stat-value">
                  {mergeSource.todos.filter(s => 
                    mergeTarget.todos.some(t => 
                      t.content.toLowerCase() === s.content.toLowerCase()
                    )
                  ).length}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Final todo count:</span>
                <span className="stat-value">
                  {mergeTarget.todos.length + mergeSource.todos.filter(s => 
                    !mergeTarget.todos.some(t => 
                      t.content.toLowerCase() === s.content.toLowerCase()
                    )
                  ).length}
                </span>
              </div>
            </div>
            
            <div className="merge-actions">
              <button className="confirm-btn" onClick={performMerge}>
                Merge and Delete Source
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
          <div className="context-menu-item" onClick={() => {
            if (contextMenuTab) {
              setSelectedTabs(new Set([contextMenuTab]));
              setShowContextMenu(false);
            }
          }}>
            Start Merge Mode
          </div>
        </div>
      )}
    </div>
  );
}

export default App;