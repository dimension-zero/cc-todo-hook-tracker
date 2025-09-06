import React from 'react';
import { FilterState } from '../types';

interface FilterControlsProps {
  filterState: FilterState;
  setFilterState: React.Dispatch<React.SetStateAction<FilterState>>;
}

export const FilterControls: React.FC<FilterControlsProps> = ({
  filterState,
  setFilterState
}) => {
  return (
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
  );
};