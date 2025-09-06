import React from 'react';
import { FilterControls } from './FilterControls';
import { SpacingControls } from './SpacingControls';
import { SessionControls } from './SessionControls';
import { SessionTabs } from './SessionTabs';
import { TodosContainer } from './TodosContainer';
import { Project, Session, Todo, SpacingMode, FilterState } from '../types';

interface ProjectViewProps {
  selectedProject: Project;
  selectedSession: Session | null;
  displayTodos: Todo[];
  filteredTodos: Todo[];
  filterState: FilterState;
  setFilterState: React.Dispatch<React.SetStateAction<FilterState>>;
  spacingMode: SpacingMode;
  setSpacingMode: React.Dispatch<React.SetStateAction<SpacingMode>>;
  selectedTabs: Set<string>;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  isDirty: boolean;
  editingIndex: number | null;
  editingContent: string;
  selectedIndices: Set<number>;
  dragOverIndex: number | null;
  startMerge: () => void;
  handleDeleteEmptySessionsInProject: () => void;
  handleDeleteSession: () => void;
  handleTabClick: (e: React.MouseEvent, session: Session) => void;
  handleTabRightClick: (e: React.MouseEvent, session: Session) => void;
  getSessionTooltip: (session: Session, project: Project, isMultiSelected: boolean) => string;
  handleSave: () => void;
  handleCancel: () => void;
  handleTodoClick: (e: React.MouseEvent, index: number) => void;
  handleDragStart: (e: React.DragEvent, index: number) => void;
  handleDragOver: (e: React.DragEvent, index: number) => void;
  handleDrop: (e: React.DragEvent, index: number) => void;
  setDragOverIndex: React.Dispatch<React.SetStateAction<number | null>>;
  startEdit: (index: number) => void;
  setEditingContent: React.Dispatch<React.SetStateAction<string>>;
  saveEdit: () => void;
  cancelEdit: () => void;
  handleDelete: (index: number) => void;
  getStatusSymbol: (status: string) => string;
  isContiguousSelection: () => boolean;
}

export const ProjectView: React.FC<ProjectViewProps> = ({
  selectedProject,
  selectedSession,
  displayTodos,
  filteredTodos,
  filterState,
  setFilterState,
  spacingMode,
  setSpacingMode,
  selectedTabs,
  showDeleteConfirm,
  setShowDeleteConfirm,
  isDirty,
  editingIndex,
  editingContent,
  selectedIndices,
  dragOverIndex,
  startMerge,
  handleDeleteEmptySessionsInProject,
  handleDeleteSession,
  handleTabClick,
  handleTabRightClick,
  getSessionTooltip,
  handleSave,
  handleCancel,
  handleTodoClick,
  handleDragStart,
  handleDragOver,
  handleDrop,
  setDragOverIndex,
  startEdit,
  setEditingContent,
  saveEdit,
  cancelEdit,
  handleDelete,
  getStatusSymbol,
  isContiguousSelection
}) => {
  return (
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
          <FilterControls 
            filterState={filterState}
            setFilterState={setFilterState}
          />
          
          <SpacingControls 
            spacingMode={spacingMode}
            setSpacingMode={setSpacingMode}
          />
          
          <SessionControls
            selectedProject={selectedProject}
            selectedTabs={selectedTabs}
            showDeleteConfirm={showDeleteConfirm}
            startMerge={startMerge}
            handleDeleteEmptySessionsInProject={handleDeleteEmptySessionsInProject}
            setShowDeleteConfirm={setShowDeleteConfirm}
            handleDeleteSession={handleDeleteSession}
          />
        </div>
        <SessionTabs
          selectedProject={selectedProject}
          selectedSession={selectedSession}
          selectedTabs={selectedTabs}
          handleTabClick={handleTabClick}
          handleTabRightClick={handleTabRightClick}
          getSessionTooltip={getSessionTooltip}
          startMerge={startMerge}
        />
        
        {selectedSession && (
          <TodosContainer
            selectedSession={selectedSession}
            displayTodos={displayTodos}
            filteredTodos={filteredTodos}
            spacingMode={spacingMode}
            isDirty={isDirty}
            editingIndex={editingIndex}
            editingContent={editingContent}
            selectedIndices={selectedIndices}
            dragOverIndex={dragOverIndex}
            selectedTabs={selectedTabs}
            handleSave={handleSave}
            handleCancel={handleCancel}
            handleTodoClick={handleTodoClick}
            handleDragStart={handleDragStart}
            handleDragOver={handleDragOver}
            handleDrop={handleDrop}
            setDragOverIndex={setDragOverIndex}
            startEdit={startEdit}
            setEditingContent={setEditingContent}
            saveEdit={saveEdit}
            cancelEdit={cancelEdit}
            handleDelete={handleDelete}
            getStatusSymbol={getStatusSymbol}
            handleTabClick={handleTabClick}
            isContiguousSelection={isContiguousSelection}
          />
        )}
    </>
  );
};