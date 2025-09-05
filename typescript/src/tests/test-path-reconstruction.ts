#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Colors for output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

const projectsDir = path.join(os.homedir(), '.config-dir', 'projects');

// Validate if a path exists on the filesystem
function validatePath(testPath: string): boolean {
  try {
    return fs.existsSync(testPath);
  } catch {
    return false;
  }
}

// List directory contents to find matching entries
function listDirectory(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath);
  } catch {
    return [];
  }
}

// Build path incrementally with greedy matching against actual filesystem
function buildAndValidatePath(flatParts: string[], isWindows: boolean): string | null {
  const pathSep = isWindows ? '\\' : '/';
  let currentPath = isWindows ? `${flatParts[0]}:` : '';
  let consumedParts = isWindows ? 1 : 0;
  
  console.log(`  Starting with parts: [${flatParts.join(', ')}]`);
  
  while (consumedParts < flatParts.length) {
    const remainingParts = flatParts.slice(consumedParts);
    console.log(`  At: ${currentPath || '[root]'}, Remaining: [${remainingParts.join(', ')}]`);
    
    // List what's actually in the current directory
    const dirContents = listDirectory(currentPath || '/');
    if (dirContents.length === 0) {
      console.log(`  Cannot list directory, stopping`);
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
          console.log(`  ✓ Found: "${candidate}" (${numParts} parts)`);
          bestMatch = candidate;
          bestMatchLength = numParts;
          break;
        }
        
        // Also check for directories that start with our candidate
        for (const dirEntry of dirContents) {
          if (dirEntry.toLowerCase().startsWith(candidate.toLowerCase())) {
            console.log(`  ✓ Prefix match: "${dirEntry}" starts with "${candidate}"`);
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
      currentPath = currentPath + (currentPath ? pathSep : '') + bestMatch;
      consumedParts += bestMatchLength;
    } else {
      // No match found, add as-is
      const part = remainingParts[0];
      currentPath = currentPath + (currentPath ? pathSep : '') + part;
      consumedParts += 1;
      console.log(`  ✗ No match for "${part}", adding as-is`);
    }
  }
  
  return currentPath;
}

// Best-effort conversion of flattened path
function guessPathFromFlattenedName(flatPath: string): string {
  const isWindows = process.platform === 'win32';
  const pathSep = isWindows ? '\\' : '/';
  
  console.log(`\nTesting: ${flatPath}`);
  
  // First check if we have metadata for this project
  try {
    const metadataPath = path.join(projectsDir, flatPath, 'metadata.json');
    if (fs.existsSync(metadataPath)) {
      const metadata = fs.readFileSync(metadataPath, 'utf-8');
      const data = JSON.parse(metadata);
      if (data.path) {
        console.log(`  Cached metadata: ${data.path}`);
        return data.path;
      }
    }
  } catch (error) {
    // No metadata, continue with reconstruction
  }
  
  // Windows path with drive letter
  const windowsMatch = flatPath.match(/^([A-Z])--(.+)$/);
  if (windowsMatch) {
    const [, driveLetter, restOfPath] = windowsMatch;
    
    // Split on single dashes, preserving empty parts (which indicate dots)
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
    
    // Build path with greedy filesystem validation
    const allParts = [driveLetter, ...flatParts];
    const validatedPath = buildAndValidatePath(allParts, true);
    
    if (validatedPath && validatePath(validatedPath)) {
      console.log(`  ${GREEN}✓ Successfully validated: ${validatedPath}${RESET}`);
      return validatedPath;
    } else {
      console.log(`  ${YELLOW}⚠ Could not fully validate: ${validatedPath || flatPath}${RESET}`);
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
  console.log(`  ${RED}✗ Unknown format: ${flatPath}${RESET}`);
  return flatPath;
}

// Main test function
function runTests() {
  console.log('='.repeat(80));
  console.log('PATH RECONSTRUCTION VALIDATION TEST');
  console.log('='.repeat(80));
  
  if (!fs.existsSync(projectsDir)) {
    console.log(`${RED}Error: Projects directory not found at ${projectsDir}${RESET}`);
    return;
  }
  
  const projects = fs.readdirSync(projectsDir);
  console.log(`Found ${projects.length} project directories to test\n`);
  
  let successCount = 0;
  let failureCount = 0;
  const results: { dir: string, path: string, exists: boolean }[] = [];
  
  for (const projectDir of projects) {
    const reconstructed = guessPathFromFlattenedName(projectDir);
    const exists = validatePath(reconstructed);
    
    results.push({ dir: projectDir, path: reconstructed, exists });
    
    if (exists) {
      successCount++;
      console.log(`  ${GREEN}✓ PATH EXISTS${RESET}\n`);
    } else {
      failureCount++;
      console.log(`  ${RED}✗ PATH DOES NOT EXIST${RESET}\n`);
    }
  }
  
  // Summary
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`${GREEN}Successes: ${successCount}${RESET}`);
  console.log(`${RED}Failures: ${failureCount}${RESET}`);
  console.log(`Total: ${projects.length}`);
  console.log(`Success rate: ${((successCount / projects.length) * 100).toFixed(1)}%\n`);
  
  if (failureCount > 0) {
    console.log('Failed reconstructions:');
    results.filter(r => !r.exists).forEach(r => {
      console.log(`  ${RED}${r.dir} → ${r.path}${RESET}`);
    });
  }
  
  // Specific test for hidden directory handling
  console.log('\n' + '='.repeat(80));
  console.log('SPECIFIC TEST: Hidden directory handling');
  console.log('='.repeat(80));
  
  // Find a test case that represents a hidden directory pattern
  const hiddenDirTestCase = projects.find(p => p.includes('--') && p.endsWith('config') || p.endsWith('data') || p.includes('dot'));
  if (hiddenDirTestCase) {
    const result = guessPathFromFlattenedName(hiddenDirTestCase);
    console.log(`Input: ${hiddenDirTestCase}`);
    console.log(`Reconstructed: ${result}`);
    console.log(`Exists: ${validatePath(result) ? GREEN + '✓' : RED + '✗'}${RESET}`);
  } else {
    console.log(`${YELLOW}No suitable test case found for hidden directory patterns${RESET}`);
  }
}

// Run the tests
runTests();