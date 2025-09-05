import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Todo, Session } from '../types';

// Mock data for testing
const createMockTodo = (content: string, status: 'pending' | 'in_progress' | 'completed' = 'pending'): Todo => ({
  content,
  status,
  activeForm: content,
  id: Math.random().toString(36).substr(2, 9),
  created: new Date()
});

const createMockSession = (id: string, todos: Todo[], date: Date = new Date()): Session => ({
  id,
  todos,
  lastModified: date,
  created: date,
  filePath: `~/.claude/todos/${id}-agent.json`
});

describe('Todo Merge Functionality', () => {
  describe('Duplicate Detection', () => {
    it('should identify exact duplicates', () => {
      const todo1 = createMockTodo('Write unit tests');
      const todo2 = createMockTodo('Write unit tests');
      
      expect(todo1.content.toLowerCase()).toBe(todo2.content.toLowerCase());
    });

    it('should identify case-insensitive duplicates', () => {
      const todo1 = createMockTodo('Write Unit Tests');
      const todo2 = createMockTodo('write unit tests');
      
      expect(todo1.content.toLowerCase()).toBe(todo2.content.toLowerCase());
    });

    it('should not identify different todos as duplicates', () => {
      const todo1 = createMockTodo('Write unit tests');
      const todo2 = createMockTodo('Write integration tests');
      
      expect(todo1.content.toLowerCase()).not.toBe(todo2.content.toLowerCase());
    });
  });

  describe('Merge Logic', () => {
    it('should merge two todo lists removing duplicates', () => {
      const targetTodos = [
        createMockTodo('Task 1'),
        createMockTodo('Task 2'),
        createMockTodo('Task 3')
      ];
      
      const sourceTodos = [
        createMockTodo('Task 2'), // Duplicate
        createMockTodo('Task 4'),
        createMockTodo('Task 5')
      ];
      
      // Simulate merge logic
      const mergedTodos: Todo[] = [...targetTodos];
      const targetContents = new Set(targetTodos.map(t => t.content.toLowerCase()));
      
      for (const sourceTodo of sourceTodos) {
        if (!targetContents.has(sourceTodo.content.toLowerCase())) {
          mergedTodos.push(sourceTodo);
        }
      }
      
      expect(mergedTodos.length).toBe(5);
      expect(mergedTodos.map(t => t.content)).toContain('Task 1');
      expect(mergedTodos.map(t => t.content)).toContain('Task 2');
      expect(mergedTodos.map(t => t.content)).toContain('Task 3');
      expect(mergedTodos.map(t => t.content)).toContain('Task 4');
      expect(mergedTodos.map(t => t.content)).toContain('Task 5');
    });

    it('should handle empty source list', () => {
      const targetTodos = [
        createMockTodo('Task 1'),
        createMockTodo('Task 2')
      ];
      
      const sourceTodos: Todo[] = [];
      
      const mergedTodos: Todo[] = [...targetTodos];
      const targetContents = new Set(targetTodos.map(t => t.content.toLowerCase()));
      
      for (const sourceTodo of sourceTodos) {
        if (!targetContents.has(sourceTodo.content.toLowerCase())) {
          mergedTodos.push(sourceTodo);
        }
      }
      
      expect(mergedTodos.length).toBe(2);
    });

    it('should handle empty target list', () => {
      const targetTodos: Todo[] = [];
      
      const sourceTodos = [
        createMockTodo('Task 1'),
        createMockTodo('Task 2')
      ];
      
      const mergedTodos: Todo[] = [...targetTodos];
      const targetContents = new Set(targetTodos.map(t => t.content.toLowerCase()));
      
      for (const sourceTodo of sourceTodos) {
        if (!targetContents.has(sourceTodo.content.toLowerCase())) {
          mergedTodos.push(sourceTodo);
        }
      }
      
      expect(mergedTodos.length).toBe(2);
    });

    it('should handle all duplicates', () => {
      const targetTodos = [
        createMockTodo('Task 1'),
        createMockTodo('Task 2')
      ];
      
      const sourceTodos = [
        createMockTodo('Task 1'),
        createMockTodo('Task 2')
      ];
      
      const mergedTodos: Todo[] = [...targetTodos];
      const targetContents = new Set(targetTodos.map(t => t.content.toLowerCase()));
      
      for (const sourceTodo of sourceTodos) {
        if (!targetContents.has(sourceTodo.content.toLowerCase())) {
          mergedTodos.push(sourceTodo);
        }
      }
      
      expect(mergedTodos.length).toBe(2);
    });
  });

  describe('Session Selection for Merge', () => {
    it('should identify older session as source', () => {
      const olderDate = new Date('2024-01-01');
      const newerDate = new Date('2024-01-15');
      
      const session1 = createMockSession('session1', [], newerDate);
      const session2 = createMockSession('session2', [], olderDate);
      
      const sessions = [session1, session2];
      const [older, newer] = sessions.sort((a, b) => 
        a.lastModified.getTime() - b.lastModified.getTime()
      );
      
      expect(older.id).toBe('session2');
      expect(newer.id).toBe('session1');
    });

    it('should handle sessions with same date', () => {
      const sameDate = new Date('2024-01-01');
      
      const session1 = createMockSession('session1', [], sameDate);
      const session2 = createMockSession('session2', [], sameDate);
      
      const sessions = [session1, session2];
      const [older, newer] = sessions.sort((a, b) => 
        a.lastModified.getTime() - b.lastModified.getTime()
      );
      
      // When dates are same, order is maintained
      expect(older.id).toBe('session1');
      expect(newer.id).toBe('session2');
    });
  });

  describe('Tab Multi-Selection', () => {
    it('should allow selecting exactly 2 tabs', () => {
      const selectedTabs = new Set<string>();
      
      // Add first tab
      selectedTabs.add('session1');
      expect(selectedTabs.size).toBe(1);
      
      // Add second tab
      selectedTabs.add('session2');
      expect(selectedTabs.size).toBe(2);
      
      // Should enable merge
      expect(selectedTabs.size === 2).toBe(true);
    });

    it('should not allow merge with 1 tab', () => {
      const selectedTabs = new Set<string>();
      selectedTabs.add('session1');
      
      expect(selectedTabs.size === 2).toBe(false);
    });

    it('should not allow merge with 3 tabs', () => {
      const selectedTabs = new Set<string>();
      selectedTabs.add('session1');
      selectedTabs.add('session2');
      selectedTabs.add('session3');
      
      expect(selectedTabs.size === 2).toBe(false);
    });

    it('should toggle tab selection', () => {
      const selectedTabs = new Set<string>();
      
      // Select tab
      if (selectedTabs.has('session1')) {
        selectedTabs.delete('session1');
      } else {
        selectedTabs.add('session1');
      }
      expect(selectedTabs.has('session1')).toBe(true);
      
      // Deselect tab
      if (selectedTabs.has('session1')) {
        selectedTabs.delete('session1');
      } else {
        selectedTabs.add('session1');
      }
      expect(selectedTabs.has('session1')).toBe(false);
    });
  });

  describe('Merge Preview Calculations', () => {
    it('should calculate correct merge statistics', () => {
      const targetTodos = [
        createMockTodo('Task 1'),
        createMockTodo('Task 2'),
        createMockTodo('Task 3')
      ];
      
      const sourceTodos = [
        createMockTodo('Task 2'), // Duplicate
        createMockTodo('Task 3'), // Duplicate
        createMockTodo('Task 4'),
        createMockTodo('Task 5')
      ];
      
      const duplicates = sourceTodos.filter(s => 
        targetTodos.some(t => 
          t.content.toLowerCase() === s.content.toLowerCase()
        )
      );
      
      const uniqueFromSource = sourceTodos.filter(s => 
        !targetTodos.some(t => 
          t.content.toLowerCase() === s.content.toLowerCase()
        )
      );
      
      expect(duplicates.length).toBe(2);
      expect(uniqueFromSource.length).toBe(2);
      expect(targetTodos.length + uniqueFromSource.length).toBe(5);
    });
  });

  describe('Status Conflict Resolution', () => {
    it('should keep target status for duplicate todos', () => {
      const targetTodos = [
        createMockTodo('Task 1', 'completed')
      ];
      
      const sourceTodos = [
        createMockTodo('Task 1', 'pending') // Same task, different status
      ];
      
      // Merge logic keeps target version
      const mergedTodos: Todo[] = [...targetTodos];
      const targetContents = new Set(targetTodos.map(t => t.content.toLowerCase()));
      
      for (const sourceTodo of sourceTodos) {
        if (!targetContents.has(sourceTodo.content.toLowerCase())) {
          mergedTodos.push(sourceTodo);
        }
      }
      
      expect(mergedTodos.length).toBe(1);
      expect(mergedTodos[0].status).toBe('completed');
    });
  });
});

describe('Session Memory Feature', () => {
  it('should remember session selection per project', () => {
    const projectSessionMap = new Map<string, string>();
    
    // Save session for project 1
    projectSessionMap.set('project1', 'session1');
    expect(projectSessionMap.get('project1')).toBe('session1');
    
    // Save different session for project 2
    projectSessionMap.set('project2', 'session2');
    expect(projectSessionMap.get('project2')).toBe('session2');
    
    // Original selection still preserved
    expect(projectSessionMap.get('project1')).toBe('session1');
  });

  it('should update session selection when changed', () => {
    const projectSessionMap = new Map<string, string>();
    
    projectSessionMap.set('project1', 'session1');
    projectSessionMap.set('project1', 'session2'); // Update
    
    expect(projectSessionMap.get('project1')).toBe('session2');
  });

  it('should return undefined for unknown project', () => {
    const projectSessionMap = new Map<string, string>();
    
    expect(projectSessionMap.get('unknown')).toBeUndefined();
  });
});

describe('Context Menu Actions', () => {
  describe('Copy Session ID', () => {
    it('should copy session ID to clipboard', async () => {
      const mockClipboard = {
        writeText: jest.fn()
      };
      
      Object.assign(navigator, {
        clipboard: mockClipboard
      });
      
      const sessionId = 'abc12345';
      await navigator.clipboard.writeText(sessionId);
      
      expect(mockClipboard.writeText).toHaveBeenCalledWith(sessionId);
    });
  });

  describe('Merge Mode Selection', () => {
    it('should start merge mode with one tab selected', () => {
      const selectedTabs = new Set<string>();
      const contextMenuTab = 'session1';
      
      // Start merge mode from context menu
      selectedTabs.add(contextMenuTab);
      
      expect(selectedTabs.size).toBe(1);
      expect(selectedTabs.has('session1')).toBe(true);
    });
  });
});