import React from 'react';

interface ContextMenusProps {
  // Session context menu
  showContextMenu: boolean;
  contextMenuPosition: { x: number; y: number };
  contextMenuTab: string | null;
  setShowContextMenu: (show: boolean) => void;
  
  // Project context menu
  showProjectContextMenu: boolean;
  projectContextMenuPosition: { x: number; y: number };
  setShowProjectContextMenu: (show: boolean) => void;
  handleProjectCopyName: () => void;
  handleProjectCopyCodePath: () => void;
  handleProjectCopyTodoPath: () => void;
  handleDeleteEmptySessions: () => Promise<void>;
}

export const ContextMenus: React.FC<ContextMenusProps> = ({
  showContextMenu,
  contextMenuPosition,
  contextMenuTab,
  setShowContextMenu,
  showProjectContextMenu,
  projectContextMenuPosition,
  setShowProjectContextMenu,
  handleProjectCopyName,
  handleProjectCopyCodePath,
  handleProjectCopyTodoPath,
  handleDeleteEmptySessions
}) => {
  return (
    <>
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
    </>
  );
};