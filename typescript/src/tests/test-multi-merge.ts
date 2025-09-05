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

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

// Simulate multi-session merge
function simulateMultiMerge(sources: Session[], target: Session): {
  finalTodos: Todo[];
  steps: Array<{source: string; todosAdded: number; duplicates: number}>;
  totalNew: number;
  totalDuplicates: number;
} {
  console.log('=== MULTI-SESSION MERGE SIMULATION ===');
  console.log(`Target: ${target.id} (${target.todos.length} todos)`);
  console.log(`Sources: ${sources.length} sessions to merge`);
  
  let mergedTodos: Todo[] = [...target.todos];
  const mergedContents = new Set(target.todos.map(t => t.content.toLowerCase()));
  const steps: Array<{source: string; todosAdded: number; duplicates: number}> = [];
  let totalNew = 0;
  let totalDuplicates = 0;
  
  // Sequential merge
  for (const source of sources) {
    console.log(`\n${BLUE}Step ${steps.length + 1}:${RESET} Merging ${source.id} (${source.todos.length} todos)`);
    
    let todosAdded = 0;
    let duplicates = 0;
    
    for (const todo of source.todos) {
      const lowerContent = todo.content.toLowerCase();
      if (mergedContents.has(lowerContent)) {
        duplicates++;
        console.log(`  ${YELLOW}SKIP${RESET}: "${todo.content}" (duplicate)`);
      } else {
        mergedTodos.push(todo);
        mergedContents.add(lowerContent);
        todosAdded++;
        console.log(`  ${GREEN}ADD${RESET}: "${todo.content}" [${todo.status}]`);
      }
    }
    
    steps.push({
      source: source.id,
      todosAdded,
      duplicates
    });
    
    totalNew += todosAdded;
    totalDuplicates += duplicates;
    
    console.log(`  Result: ${todosAdded} added, ${duplicates} skipped`);
    console.log(`  Running total: ${mergedTodos.length} todos`);
  }
  
  return {
    finalTodos: mergedTodos,
    steps,
    totalNew,
    totalDuplicates
  };
}

// Create test sessions
function createTestSessions(): Session[] {
  const sessions: Session[] = [
    {
      id: 'session-1-oldest',
      todos: [
        { content: 'Common task 1', status: 'pending' },
        { content: 'Unique to session 1', status: 'pending' },
        { content: 'Another unique 1', status: 'completed' }
      ],
      lastModified: new Date('2024-01-01T10:00:00')
    },
    {
      id: 'session-2-middle',
      todos: [
        { content: 'Common task 1', status: 'in_progress' }, // Duplicate
        { content: 'Unique to session 2', status: 'pending' },
        { content: 'Session 2 special', status: 'pending' },
        { content: 'Common task 2', status: 'pending' }
      ],
      lastModified: new Date('2024-01-02T10:00:00')
    },
    {
      id: 'session-3-newer',
      todos: [
        { content: 'Common task 2', status: 'completed' }, // Duplicate
        { content: 'Unique to session 3', status: 'pending' },
        { content: 'Session 3 task A', status: 'pending' },
        { content: 'Session 3 task B', status: 'in_progress' }
      ],
      lastModified: new Date('2024-01-03T10:00:00')
    },
    {
      id: 'session-4-newest',
      todos: [
        { content: 'Target session task 1', status: 'pending' },
        { content: 'Target session task 2', status: 'completed' },
        { content: 'Common task 1', status: 'completed' } // Duplicate
      ],
      lastModified: new Date('2024-01-04T10:00:00')
    }
  ];
  
  return sessions;
}

// Test scenarios
async function runTests() {
  console.log('================================================================================');
  console.log('MULTI-SESSION MERGE TESTS');
  console.log('================================================================================\n');
  
  const sessions = createTestSessions();
  
  // Test 1: Merge 3 sessions into 1
  console.log('TEST 1: Merge 3 sessions into newest');
  console.log('---------------------------------------');
  
  const sorted = sessions.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  const target = sorted[0];
  const sources = sorted.slice(1);
  
  const result = simulateMultiMerge(sources, target);
  
  console.log('\n=== MERGE SUMMARY ===');
  console.log(`Initial target todos: ${target.todos.length}`);
  console.log(`Total source sessions: ${sources.length}`);
  console.log(`Total new todos added: ${result.totalNew}`);
  console.log(`Total duplicates skipped: ${result.totalDuplicates}`);
  console.log(`Final todo count: ${result.finalTodos.length}`);
  
  // Verify
  console.log('\n=== VERIFICATION ===');
  
  // Check final count
  const expectedCount = target.todos.length + result.totalNew;
  if (result.finalTodos.length === expectedCount) {
    console.log(`${GREEN}✓${RESET} Todo count correct: ${result.finalTodos.length}`);
  } else {
    console.log(`${RED}✗${RESET} Todo count mismatch: got ${result.finalTodos.length}, expected ${expectedCount}`);
  }
  
  // Check for duplicates
  const contents = result.finalTodos.map(t => t.content.toLowerCase());
  const uniqueContents = new Set(contents);
  if (contents.length === uniqueContents.size) {
    console.log(`${GREEN}✓${RESET} No duplicates in final result`);
  } else {
    console.log(`${RED}✗${RESET} Duplicates found in final result`);
  }
  
  // Test 2: Edge case - empty sources
  console.log('\n\nTEST 2: Merge with empty source');
  console.log('--------------------------------');
  
  const emptySource: Session = {
    id: 'empty-session',
    todos: [],
    lastModified: new Date('2024-01-01T10:00:00')
  };
  
  const result2 = simulateMultiMerge([emptySource], target);
  
  if (result2.finalTodos.length === target.todos.length) {
    console.log(`${GREEN}✓${RESET} Empty source handled correctly`);
  } else {
    console.log(`${RED}✗${RESET} Empty source changed todo count unexpectedly`);
  }
  
  // Test 3: All duplicates
  console.log('\n\nTEST 3: Merge with all duplicates');
  console.log('----------------------------------');
  
  const duplicateSource: Session = {
    id: 'duplicate-session',
    todos: [...target.todos],
    lastModified: new Date('2024-01-01T10:00:00')
  };
  
  const result3 = simulateMultiMerge([duplicateSource], target);
  
  if (result3.totalNew === 0 && result3.totalDuplicates === duplicateSource.todos.length) {
    console.log(`${GREEN}✓${RESET} All duplicates correctly skipped`);
  } else {
    console.log(`${RED}✗${RESET} Duplicate handling failed`);
  }
  
  console.log('\n=== ALL TESTS COMPLETE ===');
}

// Run tests
runTests().catch(console.error);