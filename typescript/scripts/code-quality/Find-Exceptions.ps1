# Find-Exceptions.ps1
# Traverses TypeScript files to find exception usage and suggests Result<T> pattern conversion

param(
    [string]$Path = ".",
    [switch]$Verbose,
    [string[]]$ExcludePaths = @("node_modules", ".git", "dist", "build")
)

Write-Host "Scanning for exceptions in TypeScript files..." -ForegroundColor Cyan
Write-Host "Path: $Path" -ForegroundColor Gray
Write-Host ""

$totalFiles = 0
$filesWithExceptions = 0
$throwStatements = 0
$tryCatchBlocks = 0
$nonResultMethods = 0
$returnErrStatements = 0
$manualResultObjects = 0

# Get all TypeScript files recursively
$tsFiles = Get-ChildItem -Path $Path -Filter "*.ts" -Recurse

foreach ($file in $tsFiles) {
    $totalFiles++
    $relativePath = $file.FullName -replace [regex]::Escape((Get-Location).Path + "\"), ""
    $content = Get-Content -Path $file.FullName -Raw
    $hasExceptions = $false
    
    # Find throw statements
    $throwMatches = [regex]::Matches($content, 'throw\s+new\s+\w+', 'IgnoreCase')
    if ($throwMatches.Count -gt 0) {
        if (-not $hasExceptions) {
            Write-Host "[FILE] $relativePath" -ForegroundColor Yellow
            $hasExceptions = $true
            $filesWithExceptions++
        }
        
        foreach ($match in $throwMatches) {
            $throwStatements++
            $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
            Write-Host "  X Line ${lineNumber}: $($match.Value.Trim())" -ForegroundColor Red
            Write-Host "     -> Convert to Result<T> pattern instead of throwing" -ForegroundColor Gray
        }
    }
    
    # Find try-catch blocks
    $tryCatchMatches = [regex]::Matches($content, 'try\s*\{[^}]*\}\s*catch', 'IgnoreCase,Singleline')
    if ($tryCatchMatches.Count -gt 0) {
        if (-not $hasExceptions) {
            Write-Host "[FILE] $relativePath" -ForegroundColor Yellow
            $hasExceptions = $true
            $filesWithExceptions++
        }
        
        foreach ($match in $tryCatchMatches) {
            $tryCatchBlocks++
            $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
            Write-Host "  ! Line ${lineNumber}: try-catch block found" -ForegroundColor DarkYellow
            Write-Host "     -> Review: If wrapping 3rd party code = OK, if handling our throws = convert to Result<T>" -ForegroundColor Gray
        }
    }
    
    # Find methods that should use Result<T> pattern but don't
    # Look for function/method signatures that could throw or fail but don't return Result<T>
    $methodMatches = [regex]::Matches($content, '(?:async\s+)?(?:function\s+|(?:private|public|protected)?\s*(?:async\s+)?)\w+\([^)]*\)\s*:\s*(?:Promise<(?!.*Result)[^>]+>|(?!.*Result|void)[A-Z]\w*(?:\[\])?)', 'IgnoreCase')
    foreach ($match in $methodMatches) {
        # Skip if it's a simple getter, setter, or utility that wouldn't fail
        $methodText = $match.Value
        if ($methodText -match 'get\s+\w+|set\s+\w+|\s*:\s*(string|number|boolean|Date)\s*$') {
            continue
        }
        
        # Look for error-prone patterns in method names or content around the method
        $startIndex = [Math]::Max(0, $match.Index - 100)
        $endIndex = [Math]::Min($content.Length - 1, $match.Index + $match.Length + 500)
        $contextContent = $content.Substring($startIndex, $endIndex - $startIndex)
        
        # Check if method contains error-prone operations
        if ($contextContent -match '(?:fetch|api|http|parse|validate|process|transform|convert|load|save|create|delete|update|error|fail|check)' -and 
            $contextContent -notmatch 'return\s+(?:Ok|Err)\(' -and 
            $methodText -notmatch ':\s*(?:void|Result|AsyncResult)') {
            
            if (-not $hasExceptions) {
                Write-Host "[FILE] $relativePath" -ForegroundColor Yellow
                $hasExceptions = $true
                $filesWithExceptions++
            }
            
            $nonResultMethods++
            $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
            Write-Host "  * Line ${lineNumber}: Method should use Result<T> pattern" -ForegroundColor Magenta
            Write-Host "     -> $($methodText.Trim())" -ForegroundColor Gray
            Write-Host "     -> Consider returning Result<T> or AsyncResult<T> for error handling" -ForegroundColor Gray
        }
    }
    
    # Find return Err(...) statements - but exclude legitimate helper functions
    $returnErrMatches = [regex]::Matches($content, 'return\s+Err\s*\([^)]+\)', 'IgnoreCase')
    if ($returnErrMatches.Count -gt 0) {
        # Check if this is in a legitimate helper function (safeAsync, safe, or functions returning AsyncResult<T>/Result<T>)
        $isHelperFunction = $content -match 'function\s+(safeAsync|safe)\s*<' -or 
                           $content -match ':\s*(Async)?Result<[^>]+>' -or 
                           $file.Name -eq 'result.ts'
        
        if (-not $isHelperFunction) {
            if (-not $hasExceptions) {
                Write-Host "[FILE] $relativePath" -ForegroundColor Yellow
                $hasExceptions = $true
                $filesWithExceptions++
            }
            
            foreach ($match in $returnErrMatches) {
                $returnErrStatements++
                $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
                Write-Host "  !! Line ${lineNumber}: return Err(...) found - REVIEW NEEDED!" -ForegroundColor DarkRed
                Write-Host "     -> $($match.Value.Trim())" -ForegroundColor Gray
                Write-Host "     -> Verify this function should return Result<T>, not throw or fail differently" -ForegroundColor Gray
            }
        }
    }
    
    # Find manual Result object construction - these bypass proper Result<T> helpers
    $manualResultMatches = [regex]::Matches($content, 'return\s+\{\s*success\s*:\s*(true|false)[^}]+\}', 'IgnoreCase')
    if ($manualResultMatches.Count -gt 0) {
        if (-not $hasExceptions) {
            Write-Host "[FILE] $relativePath" -ForegroundColor Yellow
            $hasExceptions = $true
            $filesWithExceptions++
        }
        
        foreach ($match in $manualResultMatches) {
            $manualResultObjects++
            $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
            Write-Host "  !!! Line ${lineNumber}: Manual Result object found - USE Ok()/Err() HELPERS!" -ForegroundColor Red
            Write-Host "     -> $($match.Value.Trim())" -ForegroundColor Gray
            Write-Host "     -> Use Ok(data) for success, Err(error) for failure" -ForegroundColor Gray
        }
    }
    
    if ($hasExceptions -and $Verbose) {
        Write-Host ""
    }
}

Write-Host ""
Write-Host "SUMMARY" -ForegroundColor Cyan
Write-Host "Files scanned: $totalFiles" -ForegroundColor White
Write-Host "Files with exceptions: $filesWithExceptions" -ForegroundColor Yellow
Write-Host "Throw statements: $throwStatements" -ForegroundColor Red
Write-Host "Try-catch blocks: $tryCatchBlocks" -ForegroundColor DarkYellow
Write-Host "Non-Result methods: $nonResultMethods" -ForegroundColor Magenta
Write-Host "Return Err statements: $returnErrStatements" -ForegroundColor DarkRed
Write-Host "Manual Result objects: $manualResultObjects" -ForegroundColor Red

Write-Host ""
Write-Host "RECOMMENDATIONS" -ForegroundColor Green
Write-Host "1. Replace 'throw new Error()' with Result<T, string> pattern"
Write-Host "2. Functions should return Result<T> or AsyncResult<T> using Ok()/Err() helpers"
Write-Host "3. Keep try-catch only for 3rd party library exception handling"  
Write-Host "4. Methods that can fail should return Result<T> or AsyncResult<T>"
Write-Host "5. Use Ok(data) and Err(error) helpers consistently"
Write-Host "6. Avoid manual { success: ... } objects - use helpers instead"
Write-Host "7. Chrome Extensions work better with explicit error handling"

Write-Host ""
Write-Host "Example Result<T> pattern:" -ForegroundColor Cyan
Write-Host @"
// WRONG - Throwing exceptions:
function parseData(input: string): Data {
  if (!input) throw new Error('Invalid input');
  return processInput(input);
}

// WRONG - Manual Result construction:
function parseData(input: string): Result<Data> {
  if (!input) return { success: false, error: 'Invalid input' };
  return { success: true, data: processInput(input) };
}

// CORRECT - Use Ok()/Err() helpers:
function parseData(input: string): Result<Data> {
  if (!input) return Err('Invalid input');
  return Ok(processInput(input));
}

// ALSO CORRECT - For functions that might throw:
function safeParseData(input: string): Result<Data> {
  if (!input) return Err('Invalid input');
  try {
    return Ok(processInput(input)); // processInput might throw
  } catch (error) {
    return Err(error instanceof Error ? error.message : String(error));
  }
}
"@ -ForegroundColor Gray