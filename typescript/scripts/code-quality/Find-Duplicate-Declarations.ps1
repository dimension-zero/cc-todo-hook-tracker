# Find-Duplicate-Declarations.ps1
# Scans TypeScript codebase for duplicate class and method declarations across different files
# Only checks top-level and class-level declarations, not code inside method bodies
# Lists duplicates in descending order of duplication count

param(
    [string]$Path = ".\src",
    [switch]$IncludeTests = $false,
    [switch]$Verbose = $false,
    [switch]$Help = $false,
    [Alias("?")]
    [switch]$QuestionMark = $false
)

# Check for help flags
if ($Help -or $QuestionMark -or $args -contains "-?" -or $args -contains "--?" -or $args -contains "--help") {
    Write-Host ""
    Write-Host "Find-Duplicate-Declarations.ps1" -ForegroundColor Cyan
    Write-Host "================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "DESCRIPTION:" -ForegroundColor Yellow
    Write-Host "  Scans TypeScript codebase for duplicate class, interface, and method declarations across files."
    Write-Host "  Only checks top-level and class-level declarations, not code inside method bodies."
    Write-Host ""
    Write-Host "USAGE:" -ForegroundColor Yellow
    Write-Host "  .\Find-Duplicate-Declarations.ps1 [OPTIONS]"
    Write-Host ""
    Write-Host "OPTIONS:" -ForegroundColor Yellow
    Write-Host "  -Path <string>      Path to scan (default: .\src)"
    Write-Host "  -IncludeTests       Include test files in scan"
    Write-Host "  -Verbose            Show detailed output and save JSON report"
    Write-Host "  -Help, -?           Show this help message"
    Write-Host ""
    Write-Host "EXAMPLES:" -ForegroundColor Yellow
    Write-Host "  .\Find-Duplicate-Declarations.ps1"
    Write-Host "  .\Find-Duplicate-Declarations.ps1 -Path .\src -Verbose"
    Write-Host "  .\Find-Duplicate-Declarations.ps1 -IncludeTests"
    Write-Host ""
    Write-Host "NOTES:" -ForegroundColor Yellow
    Write-Host "  - Ignores node_modules, dist, and build directories"
    Write-Host "  - Skips common method names like constructor, render, etc."
    Write-Host "  - Only reports duplicates that appear in different files"
    Write-Host ""
    exit 0
}

Write-Host "=== TypeScript Duplicate Declaration Finder ===" -ForegroundColor Cyan
Write-Host "Scanning path: $Path" -ForegroundColor Gray
Write-Host "Focus: Class, interface, and method declarations only" -ForegroundColor Gray

# Initialize hashtable to store declarations
$declarations = @{}

# Track if we're inside a class or method body
$classStack = New-Object System.Collections.Stack
$braceDepth = 0
$inMethodBody = $false

# Define regex patterns for TypeScript declarations (top-level and class-level only)
$patterns = @{
    Class = @{
        Pattern = '^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)'
        Type = "Class"
        IsTopLevel = $true
    }
    Interface = @{
        Pattern = '^\s*(?:export\s+)?interface\s+(\w+)'
        Type = "Interface"
        IsTopLevel = $true
    }
    ClassMethod = @{
        # Matches class methods (public/private/protected/static)
        Pattern = '^\s+(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::|{)'
        Type = "Class Method"
        IsTopLevel = $false
    }
    TopLevelFunction = @{
        Pattern = '^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)'
        Type = "Function"
        IsTopLevel = $true
    }
    TopLevelArrowFunction = @{
        Pattern = '^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::|=>)'
        Type = "Arrow Function"
        IsTopLevel = $true
    }
}

# Get all TypeScript files
$searchPattern = if ($IncludeTests) { "*.ts" } else { "*.ts" }
$files = Get-ChildItem -Path $Path -Recurse -Filter $searchPattern | Where-Object {
    $_.FullName -notmatch "node_modules" -and
    $_.FullName -notmatch "dist" -and
    $_.FullName -notmatch "build" -and
    ($IncludeTests -or $_.Name -notmatch "\.test\.ts$" -and $_.Name -notmatch "\.spec\.ts$")
}

Write-Host "Found $($files.Count) TypeScript files to analyze" -ForegroundColor Gray
Write-Host ""

# Process each file
foreach ($file in $files) {
    $relativePath = $file.FullName.Replace((Get-Location).Path + "\", "").Replace("\", "/")
    
    if ($Verbose) {
        Write-Host "Scanning: $relativePath" -ForegroundColor DarkGray
    }
    
    $content = Get-Content $file.FullName -Raw
    $lines = $content -split "`n"
    
    # Reset state for each file
    $classStack.Clear()
    $braceDepth = 0
    $inMethodBody = $false
    $currentClass = $null
    
    for ($lineNum = 0; $lineNum -lt $lines.Count; $lineNum++) {
        $line = $lines[$lineNum]
        
        # Skip comments and strings
        if ($line -match '^\s*//|^\s*/\*|\*/') {
            continue
        }
        
        # Count braces to track scope depth
        $openBraces = ([regex]::Matches($line, '\{').Count)
        $closeBraces = ([regex]::Matches($line, '\}').Count)
        $previousBraceDepth = $braceDepth
        $braceDepth += $openBraces - $closeBraces
        
        # Check if we're entering or leaving a class
        if ($line -match $patterns.Class.Pattern) {
            $currentClass = $matches[1]
            $classStack.Push($currentClass)
        }
        
        # If brace depth returns to class level or top level, we're out of method body
        if ($braceDepth -le $classStack.Count) {
            $inMethodBody = $false
        }
        
        # Skip if we're inside a method body (depth > class depth + 1)
        if ($inMethodBody) {
            continue
        }
        
        # Check each pattern
        foreach ($patternKey in $patterns.Keys) {
            $pattern = $patterns[$patternKey]
            
            # Skip class-level patterns if we're not in a class
            if (-not $pattern.IsTopLevel -and $classStack.Count -eq 0) {
                continue
            }
            
            # Skip top-level patterns if we're inside a class
            if ($pattern.IsTopLevel -and $classStack.Count -gt 0) {
                continue
            }
            
            if ($line -match $pattern.Pattern) {
                $name = $matches[1]
                
                # Skip common method names that are expected to be duplicated
                $skipMethods = @('constructor', 'render', 'componentDidMount', 'componentWillUnmount', 
                                'ngOnInit', 'ngOnDestroy', 'toString', 'valueOf', 'toJSON',
                                'update', 'init', 'dispose', 'destroy', 'setup', 'teardown')
                
                if ($patternKey -match 'Method' -and $name -in $skipMethods) {
                    continue
                }
                
                # If this is a method and it opens a brace, mark that we're entering a method body
                if ($patternKey -match 'Method' -and $line -match '\{') {
                    $inMethodBody = $true
                }
                
                # Create unique key for this declaration
                $contextKey = if ($currentClass -and -not $pattern.IsTopLevel) { 
                    "$currentClass.$name"
                } else { 
                    $name 
                }
                $key = "$contextKey|$($pattern.Type)"
                
                if (-not $declarations.ContainsKey($key)) {
                    $declarations[$key] = @()
                }
                
                # Add location information
                $declarations[$key] += [PSCustomObject]@{
                    File = $relativePath
                    Line = $lineNum + 1
                    Type = $pattern.Type
                    Name = $name
                    FullName = $contextKey
                    Context = $line.Trim()
                }
            }
        }
        
        # Pop class from stack when we exit its scope
        if ($classStack.Count -gt 0 -and $braceDepth -lt $classStack.Count) {
            $classStack.Pop()
            $currentClass = if ($classStack.Count -gt 0) { $classStack.Peek() } else { $null }
        }
    }
}

# Find duplicates (declarations that appear in multiple files)
$duplicates = @{}

foreach ($key in $declarations.Keys) {
    $locations = $declarations[$key]
    
    # Group by file to find cross-file duplicates
    $fileGroups = $locations | Group-Object -Property File
    
    if ($fileGroups.Count -gt 1) {
        $duplicates[$key] = $locations
    }
}

# Sort duplicates by count (descending)
$sortedDuplicates = $duplicates.GetEnumerator() | Sort-Object { $_.Value.Count } -Descending

# Display results
if ($sortedDuplicates.Count -eq 0) {
    Write-Host "No duplicate class, interface, or method declarations found across different files!" -ForegroundColor Green
} else {
    Write-Host "Found $($sortedDuplicates.Count) duplicate declarations:" -ForegroundColor Yellow
    Write-Host ""
    
    $totalInstances = 0
    
    foreach ($duplicate in $sortedDuplicates) {
        $parts = $duplicate.Key -split '\|'
        $fullName = $parts[0]
        $type = $parts[1]
        $locations = $duplicate.Value
        $fileCount = ($locations | Select-Object -ExpandProperty File -Unique).Count
        
        $totalInstances += $locations.Count
        
        Write-Host "=============================================================" -ForegroundColor DarkGray
        Write-Host "$type " -ForegroundColor Cyan -NoNewline
        Write-Host "'$fullName'" -ForegroundColor Yellow -NoNewline
        Write-Host " - Found in " -NoNewline
        Write-Host "$fileCount files" -ForegroundColor Magenta -NoNewline
        Write-Host " (" -NoNewline
        Write-Host "$($locations.Count) instances" -ForegroundColor Red -NoNewline
        Write-Host ")"
        Write-Host ""
        
        # Group locations by file for better display
        $fileGroups = $locations | Group-Object -Property File
        
        foreach ($fileGroup in $fileGroups) {
            Write-Host "  File: $($fileGroup.Name)" -ForegroundColor White
            
            foreach ($location in $fileGroup.Group) {
                Write-Host "     Line $($location.Line): " -ForegroundColor Gray -NoNewline
                
                # Truncate long context lines
                $context = $location.Context
                if ($context.Length -gt 80) {
                    $context = $context.Substring(0, 77) + "..."
                }
                Write-Host $context -ForegroundColor DarkGray
            }
        }
        Write-Host ""
    }
    
    Write-Host "=============================================================" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Summary:" -ForegroundColor Cyan
    Write-Host "  - Total duplicate declarations: $($sortedDuplicates.Count)" -ForegroundColor White
    Write-Host "  - Total instances: $totalInstances" -ForegroundColor White
    Write-Host "  - Files scanned: $($files.Count)" -ForegroundColor White
    
    # Show top offenders
    if ($sortedDuplicates.Count -gt 0) {
        Write-Host ""
        Write-Host "Top 5 Most Duplicated:" -ForegroundColor Yellow
        
        $top5 = $sortedDuplicates | Select-Object -First 5
        $rank = 1
        
        foreach ($duplicate in $top5) {
            $parts = $duplicate.Key -split '\|'
            $fullName = $parts[0]
            $type = $parts[1]
            $count = $duplicate.Value.Count
            
            Write-Host "  $rank. " -NoNewline -ForegroundColor Gray
            Write-Host "$fullName " -NoNewline -ForegroundColor Cyan
            Write-Host "($type) " -NoNewline -ForegroundColor Gray
            Write-Host "- $count instances" -ForegroundColor Magenta
            
            $rank++
        }
    }
}

Write-Host ""
Write-Host "Scan complete!" -ForegroundColor Green

# Optional: Export to JSON for further analysis
if ($Verbose -and $duplicates.Count -gt 0) {
    $jsonPath = ".\duplicate-declarations-report.json"
    $report = @{
        ScanDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Path = $Path
        FilesScanned = $files.Count
        DuplicatesFound = $sortedDuplicates.Count
        FocusArea = "Class, interface, and method declarations only"
        Duplicates = @()
    }
    
    foreach ($duplicate in $sortedDuplicates) {
        $parts = $duplicate.Key -split '\|'
        $report.Duplicates += @{
            FullName = $parts[0]
            Type = $parts[1]
            FileCount = ($duplicate.Value | Select-Object -ExpandProperty File -Unique).Count
            InstanceCount = $duplicate.Value.Count
            Locations = $duplicate.Value | ForEach-Object {
                @{
                    File = $_.File
                    Line = $_.Line
                    Context = $_.Context
                }
            }
        }
    }
    
    $report | ConvertTo-Json -Depth 10 | Out-File $jsonPath
    Write-Host "Detailed report saved to: $jsonPath" -ForegroundColor Gray
}