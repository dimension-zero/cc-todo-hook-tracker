import fs from 'node:fs/promises';
import path from 'node:path';
import { Result, ResultUtils } from './Result.js';

export interface Todo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
  id?: string;
  created?: Date;
}

export class TodoManager {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  // Read todos from file
  async readTodos(): Promise<Result<Todo[]>> {
    try {
      const fileExists = await this.fileExists();
      if (!fileExists) {
        return ResultUtils.ok([]);
      }

      const content = await fs.readFile(this.filePath, 'utf-8');
      
      // Handle empty file
      if (!content.trim()) {
        return ResultUtils.ok([]);
      }

      const todos = JSON.parse(content);
      
      if (!Array.isArray(todos)) {
        return ResultUtils.fail('File does not contain a valid todo array');
      }

      // Validate each todo
      for (const todo of todos) {
        if (!this.isValidTodo(todo)) {
          return ResultUtils.fail('Invalid todo structure in file');
        }
      }

      return ResultUtils.ok(todos);
    } catch (error) {
      return ResultUtils.fail(
        `Failed to read todos: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  // Write todos to file
  async writeTodos(todos: Todo[]): Promise<Result<void>> {
    try {
      // Validate all todos before writing
      for (const todo of todos) {
        if (!this.isValidTodo(todo)) {
          return ResultUtils.fail('Invalid todo structure');
        }
      }

      // Ensure directory exists
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      // Write with proper formatting
      await fs.writeFile(this.filePath, JSON.stringify(todos, null, 2), 'utf-8');
      
      return ResultUtils.ok(undefined);
    } catch (error) {
      return ResultUtils.fail(
        `Failed to write todos: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  // Add a new todo
  async addTodo(todo: Todo): Promise<Result<Todo[]>> {
    const readResult = await this.readTodos();
    if (!ResultUtils.isSuccess(readResult)) {
      return readResult;
    }

    const todos = readResult.value;
    
    // Add created timestamp if not present
    const newTodo: Todo = {
      ...todo,
      created: todo.created || new Date(),
      id: todo.id || this.generateId()
    };

    todos.push(newTodo);

    const writeResult = await this.writeTodos(todos);
    if (!ResultUtils.isSuccess(writeResult)) {
      return ResultUtils.fail('Failed to save after adding todo');
    }

    return ResultUtils.ok(todos);
  }

  // Reorder todos
  async reorderTodos(fromIndex: number, toIndex: number): Promise<Result<Todo[]>> {
    const readResult = await this.readTodos();
    if (!ResultUtils.isSuccess(readResult)) {
      return readResult;
    }

    const todos = readResult.value;

    if (fromIndex < 0 || fromIndex >= todos.length) {
      return ResultUtils.fail(`Invalid fromIndex: ${fromIndex}`);
    }
    if (toIndex < 0 || toIndex >= todos.length) {
      return ResultUtils.fail(`Invalid toIndex: ${toIndex}`);
    }

    // Remove and reinsert
    const [movedTodo] = todos.splice(fromIndex, 1);
    todos.splice(toIndex, 0, movedTodo);

    const writeResult = await this.writeTodos(todos);
    if (!ResultUtils.isSuccess(writeResult)) {
      return ResultUtils.fail('Failed to save after reordering');
    }

    return ResultUtils.ok(todos);
  }

  // Rename a todo (update content)
  async renameTodo(index: number, newContent: string): Promise<Result<Todo[]>> {
    const readResult = await this.readTodos();
    if (!ResultUtils.isSuccess(readResult)) {
      return readResult;
    }

    const todos = readResult.value;

    if (index < 0 || index >= todos.length) {
      return ResultUtils.fail(`Invalid index: ${index}`);
    }

    if (!newContent || !newContent.trim()) {
      return ResultUtils.fail('Content cannot be empty');
    }

    todos[index] = {
      ...todos[index],
      content: newContent.trim()
    };

    const writeResult = await this.writeTodos(todos);
    if (!ResultUtils.isSuccess(writeResult)) {
      return ResultUtils.fail('Failed to save after renaming');
    }

    return ResultUtils.ok(todos);
  }

  // Delete a todo
  async deleteTodo(index: number): Promise<Result<Todo[]>> {
    const readResult = await this.readTodos();
    if (!ResultUtils.isSuccess(readResult)) {
      return readResult;
    }

    const todos = readResult.value;

    if (index < 0 || index >= todos.length) {
      return ResultUtils.fail(`Invalid index: ${index}`);
    }

    todos.splice(index, 1);

    const writeResult = await this.writeTodos(todos);
    if (!ResultUtils.isSuccess(writeResult)) {
      return ResultUtils.fail('Failed to save after deleting');
    }

    return ResultUtils.ok(todos);
  }

  // Delete the entire file
  async deleteFile(): Promise<Result<void>> {
    try {
      const exists = await this.fileExists();
      if (!exists) {
        return ResultUtils.ok(undefined);
      }

      await fs.unlink(this.filePath);
      return ResultUtils.ok(undefined);
    } catch (error) {
      return ResultUtils.fail(
        `Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  // Helper methods
  private async fileExists(): Promise<boolean> {
    try {
      await fs.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  private isValidTodo(todo: any): todo is Todo {
    return (
      todo &&
      typeof todo === 'object' &&
      typeof todo.content === 'string' &&
      ['pending', 'in_progress', 'completed'].includes(todo.status)
    );
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}