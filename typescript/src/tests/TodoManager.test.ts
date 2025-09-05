import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { TodoManager, Todo } from '../utils/TodoManager';
import { ResultUtils } from '../utils/Result';

describe('TodoManager E2E Test Suite', () => {
  let testDir: string;
  let testFilePath: string;
  let todoManager: TodoManager;

  // Create a unique test directory for each test run
  beforeAll(async () => {
    testDir = path.join(os.tmpdir(), `todo-test-${Date.now()}`);
    testFilePath = path.join(testDir, 'test-todos.json');
    await fs.mkdir(testDir, { recursive: true });
  });

  // Clean up after all tests
  afterAll(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up test directory:', error);
    }
  });

  beforeEach(() => {
    todoManager = new TodoManager(testFilePath);
  });

  describe('1. Create test-only Todo list', () => {
    test('should create an empty todo list file', async () => {
      const result = await todoManager.writeTodos([]);
      
      expect(ResultUtils.isSuccess(result)).toBe(true);
      
      // Verify file exists
      const fileExists = await fs.access(testFilePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
      
      // Verify content
      const content = await fs.readFile(testFilePath, 'utf-8');
      expect(JSON.parse(content)).toEqual([]);
    });

    test('should handle reading from non-existent file', async () => {
      const nonExistentPath = path.join(testDir, 'non-existent.json');
      const manager = new TodoManager(nonExistentPath);
      
      const result = await manager.readTodos();
      
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('2. Add Todos', () => {
    beforeEach(async () => {
      await todoManager.writeTodos([]);
    });

    test('should add a single todo', async () => {
      const newTodo: Todo = {
        content: 'Test todo item',
        status: 'pending'
      };

      const result = await todoManager.addTodo(newTodo);
      
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].content).toBe('Test todo item');
        expect(result.value[0].status).toBe('pending');
        expect(result.value[0].id).toBeDefined();
        expect(result.value[0].created).toBeDefined();
      }
    });

    test('should add multiple todos', async () => {
      const todos: Todo[] = [
        { content: 'First todo', status: 'pending' },
        { content: 'Second todo', status: 'in_progress' },
        { content: 'Third todo', status: 'completed' }
      ];

      for (const todo of todos) {
        const result = await todoManager.addTodo(todo);
        expect(ResultUtils.isSuccess(result)).toBe(true);
      }

      const readResult = await todoManager.readTodos();
      expect(ResultUtils.isSuccess(readResult)).toBe(true);
      if (ResultUtils.isSuccess(readResult)) {
        expect(readResult.value).toHaveLength(3);
        expect(readResult.value.map(t => t.content)).toEqual([
          'First todo',
          'Second todo',
          'Third todo'
        ]);
      }
    });

    test('should preserve activeForm field', async () => {
      const todo: Todo = {
        content: 'Active todo',
        status: 'in_progress',
        activeForm: 'Currently working on this'
      };

      const result = await todoManager.addTodo(todo);
      
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.value[0].activeForm).toBe('Currently working on this');
      }
    });
  });

  describe('3. Reorder Todos', () => {
    beforeEach(async () => {
      const todos: Todo[] = [
        { content: 'Todo 1', status: 'pending' },
        { content: 'Todo 2', status: 'pending' },
        { content: 'Todo 3', status: 'pending' },
        { content: 'Todo 4', status: 'pending' }
      ];
      await todoManager.writeTodos(todos);
    });

    test('should reorder todo from beginning to end', async () => {
      const result = await todoManager.reorderTodos(0, 3);
      
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.value.map(t => t.content)).toEqual([
          'Todo 2',
          'Todo 3',
          'Todo 4',
          'Todo 1'
        ]);
      }
    });

    test('should reorder todo from end to beginning', async () => {
      const result = await todoManager.reorderTodos(3, 0);
      
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.value.map(t => t.content)).toEqual([
          'Todo 4',
          'Todo 1',
          'Todo 2',
          'Todo 3'
        ]);
      }
    });

    test('should reorder adjacent todos', async () => {
      const result = await todoManager.reorderTodos(1, 2);
      
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.value.map(t => t.content)).toEqual([
          'Todo 1',
          'Todo 3',
          'Todo 2',
          'Todo 4'
        ]);
      }
    });

    test('should fail with invalid indices', async () => {
      const result1 = await todoManager.reorderTodos(-1, 2);
      expect(ResultUtils.isFailure(result1)).toBe(true);
      
      const result2 = await todoManager.reorderTodos(0, 10);
      expect(ResultUtils.isFailure(result2)).toBe(true);
    });

    test('should persist reordering to file', async () => {
      await todoManager.reorderTodos(0, 2);
      
      // Create new manager to read from file
      const newManager = new TodoManager(testFilePath);
      const result = await newManager.readTodos();
      
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.value.map(t => t.content)).toEqual([
          'Todo 2',
          'Todo 3',
          'Todo 1',
          'Todo 4'
        ]);
      }
    });
  });

  describe('4. Rename Todos', () => {
    beforeEach(async () => {
      const todos: Todo[] = [
        { content: 'Original 1', status: 'pending' },
        { content: 'Original 2', status: 'in_progress' },
        { content: 'Original 3', status: 'completed' }
      ];
      await todoManager.writeTodos(todos);
    });

    test('should rename a todo', async () => {
      const result = await todoManager.renameTodo(1, 'Renamed todo');
      
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.value[1].content).toBe('Renamed todo');
        expect(result.value[1].status).toBe('in_progress'); // Status preserved
      }
    });

    test('should trim whitespace from new content', async () => {
      const result = await todoManager.renameTodo(0, '  Trimmed content  ');
      
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.value[0].content).toBe('Trimmed content');
      }
    });

    test('should fail with empty content', async () => {
      const result = await todoManager.renameTodo(0, '');
      expect(ResultUtils.isFailure(result)).toBe(true);
      
      const result2 = await todoManager.renameTodo(0, '   ');
      expect(ResultUtils.isFailure(result2)).toBe(true);
    });

    test('should fail with invalid index', async () => {
      const result = await todoManager.renameTodo(10, 'New name');
      expect(ResultUtils.isFailure(result)).toBe(true);
    });

    test('should persist renaming to file', async () => {
      await todoManager.renameTodo(2, 'Persisted rename');
      
      const newManager = new TodoManager(testFilePath);
      const result = await newManager.readTodos();
      
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.value[2].content).toBe('Persisted rename');
      }
    });
  });

  describe('5. Delete Todos', () => {
    beforeEach(async () => {
      const todos: Todo[] = [
        { content: 'Todo 1', status: 'pending' },
        { content: 'Todo 2', status: 'pending' },
        { content: 'Todo 3', status: 'pending' },
        { content: 'Todo 4', status: 'pending' }
      ];
      await todoManager.writeTodos(todos);
    });

    test('should delete a todo from the middle', async () => {
      const result = await todoManager.deleteTodo(1);
      
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.value).toHaveLength(3);
        expect(result.value.map(t => t.content)).toEqual([
          'Todo 1',
          'Todo 3',
          'Todo 4'
        ]);
      }
    });

    test('should delete the first todo', async () => {
      const result = await todoManager.deleteTodo(0);
      
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.value).toHaveLength(3);
        expect(result.value[0].content).toBe('Todo 2');
      }
    });

    test('should delete the last todo', async () => {
      const result = await todoManager.deleteTodo(3);
      
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.value).toHaveLength(3);
        expect(result.value[result.value.length - 1].content).toBe('Todo 3');
      }
    });

    test('should handle deleting all todos', async () => {
      for (let i = 3; i >= 0; i--) {
        const result = await todoManager.deleteTodo(i);
        expect(ResultUtils.isSuccess(result)).toBe(true);
      }
      
      const readResult = await todoManager.readTodos();
      expect(ResultUtils.isSuccess(readResult)).toBe(true);
      if (ResultUtils.isSuccess(readResult)) {
        expect(readResult.value).toHaveLength(0);
      }
    });

    test('should fail with invalid index', async () => {
      const result = await todoManager.deleteTodo(-1);
      expect(ResultUtils.isFailure(result)).toBe(true);
      
      const result2 = await todoManager.deleteTodo(10);
      expect(ResultUtils.isFailure(result2)).toBe(true);
    });

    test('should persist deletion to file', async () => {
      await todoManager.deleteTodo(0);
      await todoManager.deleteTodo(0);
      
      const newManager = new TodoManager(testFilePath);
      const result = await newManager.readTodos();
      
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.value).toHaveLength(2);
        expect(result.value.map(t => t.content)).toEqual(['Todo 3', 'Todo 4']);
      }
    });
  });

  describe('6. Delete test-only Todo list file', () => {
    test('should delete the todo file', async () => {
      // First ensure file exists
      await todoManager.writeTodos([{ content: 'To be deleted', status: 'pending' }]);
      
      const result = await todoManager.deleteFile();
      
      expect(ResultUtils.isSuccess(result)).toBe(true);
      
      // Verify file no longer exists
      const fileExists = await fs.access(testFilePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(false);
    });

    test('should handle deleting non-existent file', async () => {
      const nonExistentPath = path.join(testDir, 'does-not-exist.json');
      const manager = new TodoManager(nonExistentPath);
      
      const result = await manager.deleteFile();
      
      expect(ResultUtils.isSuccess(result)).toBe(true);
    });
  });

  describe('7. Complex E2E workflow', () => {
    test('should handle a complete workflow', async () => {
      // Start fresh
      await todoManager.writeTodos([]);
      
      // Add todos
      const todo1 = await todoManager.addTodo({ content: 'Plan project', status: 'completed' });
      expect(ResultUtils.isSuccess(todo1)).toBe(true);
      
      const todo2 = await todoManager.addTodo({ content: 'Write code', status: 'in_progress' });
      expect(ResultUtils.isSuccess(todo2)).toBe(true);
      
      const todo3 = await todoManager.addTodo({ content: 'Test code', status: 'pending' });
      expect(ResultUtils.isSuccess(todo3)).toBe(true);
      
      const todo4 = await todoManager.addTodo({ content: 'Deploy', status: 'pending' });
      expect(ResultUtils.isSuccess(todo4)).toBe(true);
      
      // Reorder: Move "Test code" before "Write code"
      const reorder1 = await todoManager.reorderTodos(2, 1);
      expect(ResultUtils.isSuccess(reorder1)).toBe(true);
      
      // Rename: Update "Write code" to "Implement features"
      const rename1 = await todoManager.renameTodo(2, 'Implement features');
      expect(ResultUtils.isSuccess(rename1)).toBe(true);
      
      // Delete: Remove "Deploy" as it's not needed yet
      const delete1 = await todoManager.deleteTodo(3);
      expect(ResultUtils.isSuccess(delete1)).toBe(true);
      
      // Verify final state
      const finalResult = await todoManager.readTodos();
      expect(ResultUtils.isSuccess(finalResult)).toBe(true);
      
      if (ResultUtils.isSuccess(finalResult)) {
        expect(finalResult.value).toHaveLength(3);
        expect(finalResult.value.map(t => t.content)).toEqual([
          'Plan project',
          'Test code',
          'Implement features'
        ]);
        expect(finalResult.value.map(t => t.status)).toEqual([
          'completed',
          'pending',
          'in_progress'
        ]);
      }
      
      // Clean up
      const deleteResult = await todoManager.deleteFile();
      expect(ResultUtils.isSuccess(deleteResult)).toBe(true);
    });
  });

  describe('8. Error handling and validation', () => {
    test('should handle corrupted JSON file', async () => {
      await fs.writeFile(testFilePath, 'not valid json', 'utf-8');
      
      const result = await todoManager.readTodos();
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error).toContain('Failed to read todos');
      }
    });

    test('should handle non-array JSON', async () => {
      await fs.writeFile(testFilePath, '{"not": "an array"}', 'utf-8');
      
      const result = await todoManager.readTodos();
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error).toContain('valid todo array');
      }
    });

    test('should handle invalid todo structure', async () => {
      await fs.writeFile(testFilePath, '[{"invalid": "structure"}]', 'utf-8');
      
      const result = await todoManager.readTodos();
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error).toContain('Invalid todo structure');
      }
    });
  });
});