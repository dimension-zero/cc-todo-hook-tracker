import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;

// Paths to Claude directories
const claudeDir = path.join(os.homedir(), '.claude');
const todosDir = path.join(claudeDir, 'todos');
const projectsDir = path.join(claudeDir, 'projects');
const logsDir = path.join(claudeDir, 'logs');

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

// Convert flattened path back to real path - BEST EFFORT
// Claude flattens paths inconsistently, making it impossible to perfectly reverse
// For display purposes, we'll make a best guess
function convertFlattenedPath(flatPath: string): string {
  // Don't try to convert - just return the flattened path
  // The actual project path should come from metadata, not from directory names
  return flatPath;
}

// Find project path for a session ID
async function findProjectForSession(sessionId: string): Promise<string | null> {
  try {
    const projectDirs = await fs.readdir(projectsDir);
    
    for (const projDir of projectDirs) {
      const projPath = path.join(projectsDir, projDir);
      const files = await fs.readdir(projPath);
      
      if (files.some(f => f.startsWith(sessionId))) {
        return convertFlattenedPath(projDir);
      }
    }
  } catch (error) {
    console.error('Error finding project for session:', error);
  }
  
  return null;
}

// Get real project path from metadata or session files
async function getRealProjectPath(sessionId: string): Promise<string | null> {
  console.log(`Looking for project path for session: ${sessionId}`);
  
  try {
    // First, check if there's a metadata file in the project directory
    const projectDirs = await fs.readdir(projectsDir);
    console.log(`Found ${projectDirs.length} project directories`);
    
    for (const projDir of projectDirs) {
      const projPath = path.join(projectsDir, projDir);
      const files = await fs.readdir(projPath);
      
      // Check if this project contains our session
      if (files.some(f => f.startsWith(sessionId))) {
        console.log(`Found session ${sessionId} in project dir: ${projDir}`);
        // Look for a metadata file
        const metadataPath = path.join(projPath, 'metadata.json');
        try {
          const metadata = await fs.readFile(metadataPath, 'utf-8');
          const data = JSON.parse(metadata);
          if (data.path) {
            return data.path;
          }
        } catch {
          // No metadata file, try to read from session file
        }
        
        // Try to read the actual path from a session file
        for (const file of files) {
          if (file.startsWith(sessionId) && file.endsWith('.json')) {
            try {
              const sessionPath = path.join(projPath, file);
              const sessionContent = await fs.readFile(sessionPath, 'utf-8');
              const sessionData = JSON.parse(sessionContent);
              if (sessionData.projectPath) {
                return sessionData.projectPath;
              }
            } catch {
              // Continue to next file
            }
          }
        }
        
        // Fallback: try to guess from the flattened directory name
        // This won't work perfectly for paths with hyphens
        return guessPathFromFlattenedName(projDir);
      }
    }
  } catch (error) {
    console.error('Error finding project path:', error);
  }
  
  return null;
}

// Best-effort conversion of flattened path
function guessPathFromFlattenedName(flatPath: string): string {
  const isWindows = process.platform === 'win32';
  const pathSep = isWindows ? '\\' : '/';
  
  console.log(`Guessing path from flattened name: ${flatPath}`);
  
  // First check if we have metadata for this project
  try {
    const metadataPath = path.join(projectsDir, flatPath, 'metadata.json');
    if (require('fs').existsSync(metadataPath)) {
      const metadata = require('fs').readFileSync(metadataPath, 'utf-8');
      const data = JSON.parse(metadata);
      if (data.path) {
        console.log(`Found metadata path: ${data.path}`);
        return data.path;
      }
    }
  } catch (error) {
    // No metadata, continue with guessing
  }
  
  // Windows path with drive letter (e.g., C--Users-john-smith-Source-repos-my-project)
  const windowsMatch = flatPath.match(/^([A-Z])--(.+)$/);
  if (windowsMatch) {
    const [, driveLetter, restOfPath] = windowsMatch;
    
    // Try to intelligently reconstruct the path
    // Common patterns: usernames often have dots instead of hyphens
    let pathParts = restOfPath.split('-');
    let reconstructed = [];
    
    // Process path parts
    let i = 0;
    while (i < pathParts.length) {
      const part = pathParts[i];
      
      // Check if this looks like it might be part of a username (e.g., first-last)
      if (i === 1 && pathParts[0] === 'Users' && i + 1 < pathParts.length) {
        // Check if next part looks like it could be a last name
        const nextPart = pathParts[i + 1];
        if (nextPart && /^[a-z]+$/i.test(part) && /^[a-z]+$/i.test(nextPart)) {
          // Likely a firstname.lastname pattern
          reconstructed.push(`${part}.${nextPart}`);
          i += 2;
          continue;
        }
      }
      
      // Check for known hyphenated directory names by looking for patterns
      // If we see common path segments followed by something with hyphens
      if (part === 'DT' && i + 1 < pathParts.length) {
        // The next parts might be a hyphenated project name
        // Collect all remaining parts as they might form the project name
        const remainingParts = pathParts.slice(i + 1);
        reconstructed.push(part);
        reconstructed.push(remainingParts.join('-'));
        break;
      }
      
      reconstructed.push(part);
      i++;
    }
    
    const converted = `${driveLetter}:${pathSep}${reconstructed.join(pathSep)}`;
    console.log(`Converted to: ${converted}`);
    return converted;
  }
  
  // Unix absolute path
  if (flatPath.startsWith('-')) {
    return '/' + flatPath.slice(1).replace(/-/g, '/');
  }
  
  // Return as-is if we can't figure it out
  console.log(`Could not convert, returning as-is: ${flatPath}`);
  return flatPath;
}

// Create or update project metadata
async function saveProjectMetadata(flattenedPath: string, realPath: string): Promise<void> {
  try {
    const metadataPath = path.join(projectsDir, flattenedPath, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify({ path: realPath }, null, 2));
  } catch (error) {
    // Ignore errors - metadata is best-effort
  }
}

// Load all todos data
async function loadTodosData(): Promise<Project[]> {
  const projects = new Map<string, Project>();
  
  try {
    // Read all todo files
    const todoFiles = await fs.readdir(todosDir);
    
    for (const file of todoFiles) {
      if (!file.endsWith('.json')) continue;
      
      try {
        const filePath = path.join(todosDir, file);
        const stats = await fs.stat(filePath);
        
        const content = await fs.readFile(filePath, 'utf-8');
        const todos = JSON.parse(content);
        
        // Include empty sessions too - they might have completed todos
        if (!Array.isArray(todos)) continue;
        
        // Extract session ID
        const sessionMatch = file.match(/^([a-f0-9-]+)-agent/);
        const fullSessionId = sessionMatch ? sessionMatch[1] : 'unknown';
        const sessionId = fullSessionId.substring(0, 8);
        
        // Try to get project path from the todo file itself first
        let projectPath = 'Unknown Project';
        
        // Check if the todo file contains project information
        // Some newer Claude sessions might store this
        if (typeof content === 'string') {
          try {
            // Try parsing the raw content to see if there's metadata
            const lines = content.split('\n');
            for (const line of lines.slice(0, 5)) { // Check first few lines
              if (line.includes('project_path') || line.includes('projectPath')) {
                const match = line.match(/"project_path"\s*:\s*"([^"]+)"|"projectPath"\s*:\s*"([^"]+)"/);
                if (match) {
                  projectPath = match[1] || match[2];
                  console.log(`Found project path in todo file: ${projectPath}`);
                  break;
                }
              }
            }
          } catch {
            // Ignore parsing errors
          }
        }
        
        // If we didn't find it in the file, try the project directories
        if (projectPath === 'Unknown Project') {
          const realPath = await getRealProjectPath(fullSessionId);
          if (realPath) {
            projectPath = realPath;
            // Save metadata for future use if we found the path
            const projDirs = await fs.readdir(projectsDir);
            for (const dir of projDirs) {
              if (fullSessionId.includes(dir.substring(0, 8))) {
                await saveProjectMetadata(dir, realPath);
                break;
              }
            }
          } else {
            projectPath = 'Unknown Project';
          }
        }
        
        // Get or create project
        if (!projects.has(projectPath)) {
          projects.set(projectPath, {
            path: projectPath,
            sessions: [],
            mostRecentTodoDate: stats.mtime
          });
        }
        
        const project = projects.get(projectPath)!;
        
        // Track most recent todo date for the project
        if (!project.mostRecentTodoDate || stats.mtime > project.mostRecentTodoDate) {
          project.mostRecentTodoDate = stats.mtime;
        }
        
        project.sessions.push({
          id: sessionId,
          todos: todos,
          lastModified: stats.mtime,
          filePath: filePath
        });
        
      } catch (error) {
        console.error(`Error reading ${file}:`, error);
      }
    }
    
    // Also check current_todos.json
    try {
      const currentTodosPath = path.join(logsDir, 'current_todos.json');
      const content = await fs.readFile(currentTodosPath, 'utf-8');
      const data = JSON.parse(content);
      
      if (data.todos && Array.isArray(data.todos)) {
        const sessionId = data.session_id ? data.session_id.substring(0, 8) : 'current';
        // Use the project path from the file if available
        let projectPath = data.project_path || data.projectPath;
        
        // If no project path, use the current working directory
        if (!projectPath) {
          const cwd = process.cwd();
          projectPath = cwd;
          console.log('Using current working directory:', projectPath);
        }
        
        console.log(`Current session project path: ${projectPath}`);
        
        if (!projects.has(projectPath)) {
          projects.set(projectPath, {
            path: projectPath,
            sessions: [],
            mostRecentTodoDate: new Date()
          });
        }
        
        const project = projects.get(projectPath)!;
        const currentDate = new Date();
        
        // Track most recent todo date for the project
        if (!project.mostRecentTodoDate || currentDate > project.mostRecentTodoDate) {
          project.mostRecentTodoDate = currentDate;
        }
        
        project.sessions.push({
          id: sessionId,
          todos: data.todos,
          lastModified: currentDate
        });
      }
    } catch (error) {
      // Current todos file might not exist
    }
    
  } catch (error) {
    console.error('Error loading todos:', error);
  }
  
  return Array.from(projects.values());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1d21',
    icon: path.join(__dirname, '../../assets/icon.png')
  });

  // In development, load from Vite dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built files
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Handle IPC requests for todos data
  ipcMain.handle('get-todos', async () => {
    return await loadTodosData();
  });
  
  // Handle save todos request using TodoManager
  ipcMain.handle('save-todos', async (event, filePath: string, todos: Todo[]) => {
    const { TodoManager } = await import('../utils/TodoManager.js');
    const { ResultUtils } = await import('../utils/Result.js');
    
    const manager = new TodoManager(filePath);
    const result = await manager.writeTodos(todos);
    
    if (ResultUtils.isSuccess(result)) {
      return true;
    } else {
      console.error('Error saving todos:', result.error);
      return false;
    }
  });
  
  // Handle delete todo file request using TodoManager
  ipcMain.handle('delete-todo-file', async (event, filePath: string) => {
    const { TodoManager } = await import('../utils/TodoManager.js');
    const { ResultUtils } = await import('../utils/Result.js');
    
    const manager = new TodoManager(filePath);
    const result = await manager.deleteFile();
    
    if (ResultUtils.isSuccess(result)) {
      return true;
    } else {
      console.error('Error deleting todo file:', result.error);
      return false;
    }
  });
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});