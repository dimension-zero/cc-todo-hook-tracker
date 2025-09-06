import React from 'react';
import { Session, Todo } from '../types';
import { getStatusSymbol } from '../utils/todoHelpers';
import { formatUKTime } from '../utils/dateHelpers';

interface TodoListProps {
  selectedSession: Session | null;
  selectedTabs: Set<string>;
  handleTabClick: (e: React.MouseEvent, session: Session) => void;
  isDirty: boolean;
  handleSave: () => void;
  handleCancel: () => void;
  spacingMode: number;
  filteredTodos: Todo[];
  displayTodos: Todo[];
  selectedIndices: Set<number>;
  dragOverIndex: number | null;
  setDragOverIndex: (index: number | null) => void;
  editingIndex: number | null;
  editingContent: string;
  setEditingContent: (content: string) => void;
  handleDragStart: (e: React.DragEvent, index: number) => void;
  handleDragOver: (e: React.DragEvent, index: number) => void;
  handleDrop: (e: React.DragEvent, index: number) => void;
  handleTodoClick: (e: React.MouseEvent, index: number) => void;
  startEdit: (index: number) => void;
  saveEdit: () => void;
  cancelEdit: () => void;
  handleDelete: (index: number) => void;
  isContiguousSelection: () => boolean;
}

export const TodoList: React.FC<TodoListProps> = ({
  selectedSession,
  selectedTabs,
  handleTabClick,
  isDirty,
  handleSave,
  handleCancel,
  spacingMode,
  filteredTodos,
  displayTodos,
  selectedIndices,
  dragOverIndex,
  setDragOverIndex,
  editingIndex,
  editingContent,
  setEditingContent,
  handleDragStart,
  handleDragOver,
  handleDrop,
  handleTodoClick,
  startEdit,
  saveEdit,
  cancelEdit,
  handleDelete,
  isContiguousSelection
}) => {
  if (!selectedSession) return null;

  return (
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
  );
};