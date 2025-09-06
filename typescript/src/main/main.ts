import electron from 'electron';
const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = electron;
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import type { BrowserWindow as BrowserWindowType } from 'electron';
import { TodoManager } from '../utils/TodoManager.js';
import { ResultUtils } from '../utils/Result.js';

let mainWindow: BrowserWindowType | null = null;

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
      
      if (files.some((f: string) => f.startsWith(sessionId))) {
        return convertFlattenedPath(projDir);
      }
    }
  } catch (error) {
    console.error('Error finding project for session:', error);
  }
  
  return null;
}

// Result type for path reconstruction
interface PathReconstructionResult {
  path: string | null;
  flattenedDir?: string;
  reconstructionAttempt?: string;
  failureReason?: string;
}

// Get real project path from metadata or session files
async function getRealProjectPath(sessionId: string): Promise<PathReconstructionResult> {
  // console.log(`Looking for project path for session: ${sessionId}`);
  
  try {
    // First, check if there's a metadata file in the project directory
    const projectDirs = await fs.readdir(projectsDir);
    // console.log(`Found ${projectDirs.length} project directories`);
    
    // Look for a project directory containing this session
    let matchedProjDir: string | null = null;
    for (const projDir of projectDirs) {
      const projPath = path.join(projectsDir, projDir);
      const files = await fs.readdir(projPath);
      
      // Check if this project contains our session
      if (files.some((f: string) => f.startsWith(sessionId))) {
        matchedProjDir = projDir;
        break;
      }
    }
    
    if (!matchedProjDir) {
      // No project directory found for this session
      return {
        path: null,
        failureReason: 'No project directory found containing session files'
      };
    }
    
    // console.log(`Found session ${sessionId} in project dir: ${matchedProjDir}`);
    const projPath = path.join(projectsDir, matchedProjDir);
    const files = await fs.readdir(projPath);
    
    // Look for a metadata file
    const metadataPath = path.join(projPath, 'metadata.json');
    try {
      const metadata = await fs.readFile(metadataPath, 'utf-8');
      const data = JSON.parse(metadata);
      if (data.path) {
        return { path: data.path, flattenedDir: matchedProjDir };
      }
    } catch {
      // No metadata file, continue
    }
    
    // Try to read the actual path from a session file
    for (const file of files) {
      if (file.startsWith(sessionId) && file.endsWith('.json')) {
        try {
          const sessionPath = path.join(projPath, file);
          const sessionContent = await fs.readFile(sessionPath, 'utf-8');
          const sessionData = JSON.parse(sessionContent);
          if (sessionData.projectPath) {
            return { path: sessionData.projectPath, flattenedDir: matchedProjDir };
          }
        } catch {
          // Continue to next file
        }
      }
    }
    
    // Fallback: try to guess from the flattened directory name
    const reconstructedPath = guessPathFromFlattenedName(matchedProjDir);
    
    // Validate the path exists before returning
    if (reconstructedPath && validatePath(reconstructedPath)) {
      return { path: reconstructedPath, flattenedDir: matchedProjDir };
    } else {
      // console.error(`Failed to reconstruct valid path from: ${matchedProjDir}`);
      return {
        path: null,
        flattenedDir: matchedProjDir,
        reconstructionAttempt: reconstructedPath || 'Failed to generate path',
        failureReason: reconstructedPath ? 'Reconstructed path does not exist on filesystem' : 'Path reconstruction failed completely'
      };
    }
  } catch (error) {
    console.error('Error finding project path:', error);
    return {
      path: null,
      failureReason: `Error during path lookup: ${error}`
    };
  }
}

// Validate if a path exists on the filesystem
function validatePath(testPath: string): boolean {
  try {
    return fsSync.existsSync(testPath);
  } catch {
    return false;
  }
}

// List directory contents to find matching entries
function listDirectory(dirPath: string): string[] {
  try {
    return fsSync.readdirSync(dirPath);
  } catch (error) {
    // console.log(`Error listing ${dirPath}: ${error}`);
    return [];
  }
}

// Build path incrementally with greedy matching against actual filesystem
function buildAndValidatePath(flatParts: string[], isWindows: boolean): string | null {
  const pathSep = isWindows ? '\\' : '/';
  let currentPath = isWindows ? `${flatParts[0]}:\\` : '/';
  let consumedParts = isWindows ? 1 : 0;
  
  // console.log(`Starting path reconstruction with parts: [${flatParts.join(', ')}]`);
  
  while (consumedParts < flatParts.length) {
    const remainingParts = flatParts.slice(consumedParts);
    // console.log(`Current path: ${currentPath}`);
    // console.log(`Remaining parts: [${remainingParts.join(', ')}]`);
    
    // List what's actually in the current directory
    const dirContents = listDirectory(currentPath);
    // console.log(`Directory contents: [${dirContents.slice(0, 10).join(', ')}${dirContents.length > 10 ? '...' : ''}]`);
    
    if (dirContents.length === 0) {
      // console.log(`Cannot list directory ${currentPath}, stopping`);
      break;
    }
    
    // Try to find the best match for the remaining parts
    let bestMatch = null;
    let bestMatchLength = 0;
    
    // Try increasingly longer combinations of the remaining parts
    for (let numParts = Math.min(remainingParts.length, 5); numParts >= 1; numParts--) {
      const testParts = remainingParts.slice(0, numParts);
      
      // Build possible directory names from these parts
      const candidates = [];
      
      // Try as-is (parts joined with hyphens)
      candidates.push(testParts.join('-'));
      
      // Try with dots between parts (for usernames like first.last)
      if (numParts === 2) {
        candidates.push(testParts.join('.'));
      }
      
      // Try with dot prefix (hidden directories)
      if (numParts === 1) {
        candidates.push('.' + testParts[0]);
      }
      
      // Check each candidate against actual directory contents
      for (const candidate of candidates) {
        // Look for exact match
        if (dirContents.includes(candidate)) {
          // console.log(`Found exact match: "${candidate}" (consuming ${numParts} parts)`);
          bestMatch = candidate;
          bestMatchLength = numParts;
          break;
        }
        
        // Also check for directories that start with our candidate
        // This handles cases where the flattened name is abbreviated
        for (const dirEntry of dirContents) {
          if (dirEntry.toLowerCase().startsWith(candidate.toLowerCase())) {
            // console.log(`Found prefix match: "${dirEntry}" starts with "${candidate}" (consuming ${numParts} parts)`);
            bestMatch = dirEntry;
            bestMatchLength = numParts;
            break;
          }
        }
        
        if (bestMatch) break;
      }
      
      if (bestMatch) break;
    }
    
    if (bestMatch) {
      // Found a match, add it to the path
      currentPath = currentPath + bestMatch;
      consumedParts += bestMatchLength;
      // console.log(`✓ Added "${bestMatch}" to path, new path: ${currentPath}`);
    } else {
      // No match found, try adding the part as-is (might be a new directory)
      const part = remainingParts[0];
      currentPath = currentPath + part;
      consumedParts += 1;
      // console.log(`✗ No match found for "${part}", adding as-is`);
    }
    
    // Add path separator for next iteration unless we're done
    if (consumedParts < flatParts.length) {
      currentPath = currentPath + pathSep;
    }
  }
  
  // console.log(`Final reconstructed path: ${currentPath}`);
  return currentPath;
}

// Best-effort conversion of flattened path
function guessPathFromFlattenedName(flatPath: string): string {
  const isWindows = process.platform === 'win32';
  const pathSep = isWindows ? '\\' : '/';
  
  // console.log(`\n${'='.repeat(60)}`);
  // console.log(`Reconstructing path from: ${flatPath}`);
  // console.log('='.repeat(60));
  
  // First check if we have metadata for this project
  try {
    const metadataPath = path.join(projectsDir, flatPath, 'metadata.json');
    if (fsSync.existsSync(metadataPath)) {
      const metadata = fsSync.readFileSync(metadataPath, 'utf-8');
      const data = JSON.parse(metadata);
      if (data.path) {
        // console.log(`✓ Found cached metadata: ${data.path}`);
        return data.path;
      }
    }
  } catch (error) {
    // No metadata, continue with reconstruction
  }
  
  // Windows path with drive letter (e.g., C--Users-mathew-burkitt-Source-repos-DT-cc-todo-hook-tracker)
  const windowsMatch = flatPath.match(/^([A-Z])--(.+)$/);
  if (windowsMatch) {
    const [, driveLetter, restOfPath] = windowsMatch;
    
    // console.log(`Drive letter: ${driveLetter}`);
    // console.log(`Rest of path: ${restOfPath}`);
    
    // Split on single dashes, but preserve empty parts (which indicate dots)
    const rawParts = restOfPath.split('-');
    
    // Process parts to handle double dashes (empty parts mean next part should have dot)
    let flatParts = [];
    for (let i = 0; i < rawParts.length; i++) {
      if (rawParts[i] === '' && i + 1 < rawParts.length) {
        // Empty part from double dash - next part should have dot prefix
        flatParts.push('.' + rawParts[i + 1]);
        i++; // Skip the next part as we've consumed it
      } else if (rawParts[i] !== '') {
        flatParts.push(rawParts[i]);
      }
    }
    
    // console.log(`Flattened parts: [${flatParts.join(', ')}]`);
    
    // Build path with greedy filesystem validation
    const allParts = [driveLetter, ...flatParts];
    const validatedPath = buildAndValidatePath(allParts, true);
    
    if (validatedPath && validatePath(validatedPath)) {
      // console.log(`✓ Successfully validated: ${validatedPath}`);
      return validatedPath;
    } else {
      // console.log(`✗ Could not validate path, returning best guess: ${validatedPath || flatPath}`);
      return validatedPath || flatPath;
    }
  }
  
  // Unix absolute path
  if (flatPath.startsWith('-')) {
    const unixParts = flatPath.slice(1).split('-');
    const validatedPath = buildAndValidatePath(unixParts, false);
    return validatedPath || ('/' + flatPath.slice(1).replace(/-/g, '/'));
  }
  
  // Return as-is if we can't figure it out
  // console.log(`✗ Unknown path format: ${flatPath}`);
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
  const logPath = path.join(process.cwd(), 'project.load.log');
  const logEntries: string[] = [];
  const timestamp = new Date().toISOString();
  
  logEntries.push(`=== Project Load Log - ${timestamp} ===`);
  logEntries.push(`Working Directory: ${process.cwd()}`);
  logEntries.push(`Projects Directory: ${projectsDir}`);
  logEntries.push('');
  
  // First, validate all project directories can be reconstructed
  try {
    const projectDirsList = await fs.readdir(projectsDir);
    logEntries.push(`Found ${projectDirsList.length} flattened project directories:`);
    logEntries.push('');
    
    for (const flatDir of projectDirsList) {
      const reconstructed = guessPathFromFlattenedName(flatDir);
      const exists = validatePath(reconstructed);
      if (exists) {
        logEntries.push(`\u2713 ${flatDir} -> ${reconstructed}`);
      } else {
        logEntries.push(`\u2717 ${flatDir} -> ${reconstructed} [DOES NOT EXIST]`);
      }
    }
    logEntries.push('');
    logEntries.push('--- Session Processing ---');
    logEntries.push('');
  } catch (error) {
    logEntries.push(`Error scanning project directories: ${error}`);
  }
  
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
                  // console.log(`Found project path in todo file: ${projectPath}`);
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
          const result = await getRealProjectPath(fullSessionId);
          if (result.path && result.path !== 'Unknown Project') {
            projectPath = result.path;
            logEntries.push(`✓ SUCCESS: Session ${sessionId} -> ${result.path}`);
            // Save metadata for future use if we found the path
            if (result.flattenedDir) {
              await saveProjectMetadata(result.flattenedDir, result.path);
            }
          } else {
            projectPath = 'Unknown Project';
            // Detailed failure logging
            let failureDetails = `✗ FAILED: Session ${sessionId}`;
            if (result.flattenedDir) {
              failureDetails += `\n    Flattened dir: ${result.flattenedDir}`;
            }
            if (result.reconstructionAttempt) {
              failureDetails += `\n    Attempted path: ${result.reconstructionAttempt}`;
            }
            if (result.failureReason) {
              failureDetails += `\n    Reason: ${result.failureReason}`;
            }
            logEntries.push(failureDetails);
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
          // console.log('Using current working directory:', projectPath);
        }
        
        // console.log(`Current session project path: ${projectPath}`);
        
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
  
  // Write log file
  try {
    logEntries.push('');
    logEntries.push(`=== Summary ===`);
    logEntries.push(`Total projects: ${projects.size}`);
    logEntries.push(`Successful reconstructions: ${logEntries.filter(l => l.includes('✓ SUCCESS')).length}`);
    logEntries.push(`Failed reconstructions: ${logEntries.filter(l => l.includes('✗ FAILED')).length}`);
    
    await fs.writeFile(logPath, logEntries.join('\n'), 'utf-8');
    // console.log(`Project load log written to: ${logPath}`);
  } catch (error) {
    console.error('Failed to write project load log:', error);
  }
  
  return Array.from(projects.values());
}

function showHelp() {
  const helpContent = `
ClaudeToDo Help

WHAT THIS DOES
Monitor todo lists from Claude Code sessions. View todos by project. Track progress.

INTERFACE
• Left pane: Projects (folders where you used Claude Code)
• Right pane: Sessions (Claude conversations) and their todos
• Status icons: ● pending, ◐ in progress, ● completed

NAVIGATION  
• Click projects to switch between them
• Click sessions to view their todos
• Most recent project/session loads automatically

CONTROLS
• Edit todos: Double-click any todo text
• Move todos: Drag and drop to reorder
• Select multiple: Ctrl/Cmd+click, Shift+click for ranges
• Delete todos: Select and press Delete key
• Keyboard shortcuts work as expected

SORTING & FILTERING
• Sort projects: Alphabetical, by recent activity, by todo count
• Filter todos: Show all, pending only, or active only
• Adjust spacing: Normal, compact, or minimal padding

SESSION MANAGEMENT
• Merge sessions: Ctrl/Cmd+click multiple tabs, right-click → Merge
• Delete sessions: Right-click tab → Delete
• Failed reconstructions show when session files can't be found

ACTIVITY MODE
• Toggle Activity Mode button for live updates
• Auto-focuses newest session changes
• Polls for updates when enabled

TECHNICAL
• Data source: ~/.claude/todos/ folder (Claude Code session files)
• Project mapping: Attempts to match sessions to project directories
• File operations: Read-only monitoring, safe to delete files externally

That's it. No features you don't need.`;

  dialog.showMessageBox(mainWindow!, {
    type: 'info',
    title: 'ClaudeToDo Help',
    message: 'ClaudeToDo Help',
    detail: helpContent,
    buttons: ['Close'],
    defaultId: 0
  });
}

function setupMenu() {
  const isMac = process.platform === 'darwin';
  
  const template: Electron.MenuItemConstructorOptions[] = [
    // macOS app menu
    ...(isMac ? [{
      label: app.getName(),
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    }] : []),
    
    // File menu (minimal)
    {
      label: 'File',
      submenu: [
        {
          label: 'Refresh Projects',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow?.webContents.reload();
          }
        },
        { type: 'separator' as const },
        isMac ? { role: 'close' as const } : { role: 'quit' as const }
      ]
    },
    
    // Edit menu (essential only)
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const }
      ]
    },
    
    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const }
      ]
    },
    
    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
          { type: 'separator' as const },
          { role: 'window' as const }
        ] : [
          { role: 'close' as const }
        ])
      ]
    },
    
    // Help menu
    {
      role: 'help',
      submenu: [
        {
          label: 'ClaudeToDo Help',
          accelerator: 'F1',
          click: showHelp
        },
        { type: 'separator' as const },
        {
          label: 'Claude Code',
          click: () => {
            shell.openExternal('https://claude.ai/code');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'ClaudeToDo - Session Monitor',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    // Remove hiddenInset to show normal title bar
    // titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1d21',
    icon: path.join(__dirname, '../../assets/icon.png')
  });

  // In development, load from Vite dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow!.loadURL('http://localhost:5173');
    mainWindow!.webContents.openDevTools();
  } else {
    // In production, load the built files
    mainWindow!.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow!.on('closed', () => {
    mainWindow = null;
  });
  
  // Set up streamlined application menu
  setupMenu();
}

app.whenReady().then(() => {
  // Handle IPC requests for todos data
  ipcMain.handle('get-todos', async () => {
    console.log('[IPC] get-todos called');
    const result = await loadTodosData();
    console.log('[IPC] Returning', result.length, 'projects');
    return result;
  });
  
  // Handle save todos request using TodoManager
  ipcMain.handle('save-todos', async (event: any, filePath: string, todos: Todo[]) => {
    // Using imported TodoManager and ResultUtils
    
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
  ipcMain.handle('delete-todo-file', async (event: any, filePath: string) => {
    // Using imported TodoManager and ResultUtils
    
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