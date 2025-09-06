import React from 'react';
import { Session } from '../types';

interface MergeDialogProps {
  showMergeDialog: boolean;
  mergeTarget: Session | null;
  mergeSources: Session[];
  mergePreview: {
    totalTodos: number;
    duplicates: number;
    newTodos: number;
    steps: Array<{source: string; target: string; todos: number}>;
  } | null;
  performMerge: () => Promise<void>;
  setShowMergeDialog: (show: boolean) => void;
  setSelectedTabs: (tabs: Set<string>) => void;
  formatUKDate: (date: Date) => string;
  formatUKTime: (date: Date) => string;
}

export const MergeDialog: React.FC<MergeDialogProps> = ({
  showMergeDialog,
  mergeTarget,
  mergeSources,
  mergePreview,
  performMerge,
  setShowMergeDialog,
  setSelectedTabs,
  formatUKDate,
  formatUKTime
}) => {
  if (!showMergeDialog || !mergeTarget || mergeSources.length === 0) {
    return null;
  }

  return (
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
          
          <div className="merge-arrow">�</div>
          
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
                  Step {idx + 1}: Merge {step.source} � {step.target} 
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
  );
};