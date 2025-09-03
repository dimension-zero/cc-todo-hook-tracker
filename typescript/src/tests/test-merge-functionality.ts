import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface Todo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface Session {
  id: string;
  todos: Todo[];
  lastModified: Date;
  filePath?: string;
}

interface Project {
  path: string;
  sessions: Session[];
  mostRecentTodoDate?: Date;
}

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

const projectsDir = path.join(os.homedir(), '.config-dir', 'projects');
const testProjectDir = path.join(projectsDir, 'C--test-project');

// Simulate the merge logic from the main app
function simulateMerge(sourceSession: Session, targetSession: Session): Todo[] {
  console.log('=== MERGE SIMULATION ===');
  console.log(`Source session: ${sourceSession.id} (${sourceSession.todos.length} todos)`);
  console.log(`Target session: ${targetSession.id} (${targetSession.todos.length} todos)`);
  
  const mergedTodos: Todo[] = [...targetSession.todos];
  const targetContents = new Set(targetSession.todos.map(t => t.content.toLowerCase()));
  
  console.log('\nTarget session todos:');
  targetSession.todos.forEach((todo, i) => {
    console.log(`  ${i+1}. [${todo.status}] ${todo.content}`);
  });
  
  console.log('\nSource session todos:');
  sourceSession.todos.forEach((todo, i) => {
    console.log(`  ${i+1}. [${todo.status}] ${todo.content}`);
  });
  
  console.log('\nMerge process:');
  
  for (const sourceTodo of sourceSession.todos) {
    const lowerContent = sourceTodo.content.toLowerCase();
    
    if (targetContents.has(lowerContent)) {
      console.log(`  ${YELLOW}SKIP${RESET}: "${sourceTodo.content}" (duplicate detected)`);
    } else {
      mergedTodos.push(sourceTodo);
      targetContents.add(lowerContent);
      console.log(`  ${GREEN}ADD${RESET}: "${sourceTodo.content}" [${sourceTodo.status}]`);
    }
  }
  
  console.log(`\nMerge result: ${mergedTodos.length} todos total`);
  console.log('Final merged todos:');
  mergedTodos.forEach((todo, i) => {
    console.log(`  ${i+1}. [${todo.status}] ${todo.content}`);
  });
  
  return mergedTodos;
}

// Load test sessions
async function loadTestSessions(): Promise<Session[]> {
  const sessions: Session[] = [];
  
  try {
    const files = fs.readdirSync(testProjectDir);
    console.log(`Found ${files.length} files in test project directory`);
    
    for (const file of files) {
      if (file.endsWith('.json') && file.includes('agent') && !file.includes('metadata')) {
        const filePath = path.join(testProjectDir, file);
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        try {
          const todos = JSON.parse(content);
          if (Array.isArray(todos)) {
            const sessionMatch = file.match(/^([^-]+)-/);
            const sessionId = sessionMatch ? sessionMatch[1] : 'unknown';
            
            sessions.push({
              id: sessionId,
              todos: todos,
              lastModified: stats.mtime,
              filePath: filePath
            });
            
            console.log(`Loaded session ${sessionId}: ${todos.length} todos`);
          }
        } catch (parseError) {
          console.error(`Failed to parse ${file}:`, parseError);
        }
      }
    }
  } catch (error) {
    console.error('Error loading test sessions:', error);
  }
  
  return sessions;
}

// Test the merge functionality
async function testMerge() {
  console.log('================================================================================');
  console.log('MERGE FUNCTIONALITY TEST');
  console.log('================================================================================');
  
  const sessions = await loadTestSessions();
  
  if (sessions.length < 2) {
    console.log(`${RED}ERROR${RESET}: Need at least 2 sessions to test merge. Found: ${sessions.length}`);
    return;
  }
  
  console.log(`${GREEN}✓${RESET} Found ${sessions.length} test sessions`);
  
  // Sort by modification time (older first, like the real merge logic)
  const sortedSessions = sessions.sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());
  const [sourceSession, targetSession] = sortedSessions;
  
  console.log(`\nMerging ${sourceSession.id} (older) INTO ${targetSession.id} (newer)`);
  
  // Perform the merge simulation
  const mergedTodos = simulateMerge(sourceSession, targetSession);
  
  // Verify results
  console.log('\n=== VERIFICATION ===');
  
  // Check for expected todos
  const expectedFromSource = sourceSession.todos.filter(sourceTodo => 
    !targetSession.todos.some(targetTodo => 
      targetTodo.content.toLowerCase() === sourceTodo.content.toLowerCase()
    )
  );
  
  const expectedTotal = targetSession.todos.length + expectedFromSource.length;
  
  if (mergedTodos.length === expectedTotal) {
    console.log(`${GREEN}✓${RESET} Correct todo count: ${mergedTodos.length} (expected ${expectedTotal})`);
  } else {
    console.log(`${RED}✗${RESET} Wrong todo count: ${mergedTodos.length} (expected ${expectedTotal})`);
  }
  
  // Check for duplicates
  const contents = mergedTodos.map(t => t.content.toLowerCase());
  const uniqueContents = new Set(contents);
  
  if (contents.length === uniqueContents.size) {
    console.log(`${GREEN}✓${RESET} No duplicates in merged result`);
  } else {
    console.log(`${RED}✗${RESET} Duplicates found in merged result`);
    const duplicates = contents.filter((content, index) => contents.indexOf(content) !== index);
    console.log('Duplicates:', duplicates);
  }
  
  // Check that all target todos are preserved
  const allTargetTodosPreserved = targetSession.todos.every(targetTodo =>
    mergedTodos.some(mergedTodo => 
      mergedTodo.content.toLowerCase() === targetTodo.content.toLowerCase() &&
      mergedTodo.status === targetTodo.status
    )
  );
  
  if (allTargetTodosPreserved) {
    console.log(`${GREEN}✓${RESET} All target session todos preserved`);
  } else {
    console.log(`${RED}✗${RESET} Some target session todos were lost`);
  }
  
  // Test what the file write operation would look like
  console.log('\n=== FILE WRITE TEST ===');
  const testOutputPath = path.join(testProjectDir, `merged-result-test.json`);
  
  try {
    fs.writeFileSync(testOutputPath, JSON.stringify(mergedTodos, null, 2));
    console.log(`${GREEN}✓${RESET} Successfully wrote merged result to: ${testOutputPath}`);
    
    // Verify we can read it back
    const readBack = JSON.parse(fs.readFileSync(testOutputPath, 'utf-8'));
    if (readBack.length === mergedTodos.length) {
      console.log(`${GREEN}✓${RESET} File write/read verification successful`);
    } else {
      console.log(`${RED}✗${RESET} File write/read verification failed`);
    }
    
    // Clean up test file
    fs.unlinkSync(testOutputPath);
    console.log(`${GREEN}✓${RESET} Test file cleaned up`);
    
  } catch (writeError) {
    console.log(`${RED}✗${RESET} File write test failed:`, writeError);
  }
  
  console.log('\n=== TEST SUMMARY ===');
  console.log(`Merge would combine ${sourceSession.todos.length} + ${targetSession.todos.length} todos`);
  console.log(`Result: ${mergedTodos.length} todos (${mergedTodos.length - targetSession.todos.length} added from source)`);
  console.log(`Duplicates avoided: ${sourceSession.todos.length - (mergedTodos.length - targetSession.todos.length)}`);
}

// Run the test
testMerge().catch(console.error);