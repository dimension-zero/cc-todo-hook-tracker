# Find-LongFiles-TypeScript.ps1
# Finds TypeScript files exceeding a minimum line count and lists them in descending order
# Helps identify files that may need refactoring or breaking into smaller modules
#
# Usage:
#   .\Find-LongFiles-TypeScript.ps1                    # Default 300+ lines
#   .\Find-LongFiles-TypeScript.ps1 -Min 500           # Files with 500+ lines
#   .\Find-LongFiles-TypeScript.ps1 -Min 100 -Path src # Scan specific directory
#   .\Find-LongFiles-TypeScript.ps1 -Detailed          # Show file size info
#   .\Find-LongFiles-TypeScript.ps1 -ShowAll           # Show all files (compatibility mode)
#
# Examples:
#   Find files over 1000 lines: .\Find-LongFiles-TypeScript.ps1 -Min 1000
#   Scan only source files: .\Find-LongFiles-TypeScript.ps1 -Path "src" -Min 200
#   Show all files like old script: .\Find-LongFiles-TypeScript.ps1 -ShowAll

param(
    [int]$Min = 300,
    [string]$Path = ".",
    [switch]$Detailed,
    [switch]$IncludeTests,
    [switch]$ShowAll  # Compatibility mode - show all files regardless of length
)

if ($ShowAll) {
    Write-Host "Scanning ALL TypeScript files (compatibility mode)..." -ForegroundColor Cyan
    $Min = 0  # Override minimum to show all files
} else {
    Write-Host "Scanning TypeScript files for files with $Min+ lines..." -ForegroundColor Cyan
}
Write-Host ""

# Get all TypeScript files
$includePatterns = @("*.ts", "*.tsx")
$excludePatterns = @()

# Exclude test files unless specifically requested
if (-not $IncludeTests) {
    $excludePatterns += "*test*", "*spec*", "*.test.ts", "*.spec.ts", "*.test.tsx", "*.spec.tsx"
}

# Always exclude node_modules and dist
$excludePatterns += "*node_modules*", "*dist*", "*build*", "*coverage*"

Write-Host "Scanning directory: $Path" -ForegroundColor Gray
Write-Host "Include patterns: $($includePatterns -join ', ')" -ForegroundColor Gray
if (-not $IncludeTests) {
    Write-Host "Excluding test files (use -IncludeTests to include)" -ForegroundColor Gray
}
Write-Host ""

$tsFiles = Get-ChildItem -Path $Path -Recurse -Include $includePatterns -File | 
    Where-Object { 
        $file = $_
        $shouldExclude = $false
        
        foreach ($pattern in $excludePatterns) {
            if ($file.FullName -like "*$pattern*") {
                $shouldExclude = $true
                break
            }
        }
        
        -not $shouldExclude
    }

$longFiles = @()
$totalFiles = 0
$totalLinesScanned = 0

foreach ($file in $tsFiles) {
    $totalFiles++
    
    try {
        $content = Get-Content $file.FullName -ErrorAction SilentlyContinue
        if (-not $content) { continue }
        
        $lineCount = $content.Count
        $totalLinesScanned += $lineCount
        
        if ($lineCount -ge $Min) {
            $relativePath = Resolve-Path $file.FullName -Relative
            
            # Calculate file size
            $fileSizeKB = [math]::Round($file.Length / 1KB, 2)
            
            # Calculate some basic metrics
            $emptyLines = ($content | Where-Object { $_.Trim() -eq "" }).Count
            $commentLines = ($content | Where-Object { $_.Trim().StartsWith("//") -or $_.Trim().StartsWith("/*") -or $_.Trim().StartsWith("*") }).Count
            $codeLines = $lineCount - $emptyLines - $commentLines
            
            $fileInfo = [PSCustomObject]@{
                Path = $relativePath
                FullPath = $file.FullName
                LineCount = $lineCount
                CodeLines = $codeLines
                CommentLines = $commentLines
                EmptyLines = $emptyLines
                SizeKB = $fileSizeKB
                LastModified = $file.LastWriteTime
            }
            
            $longFiles += $fileInfo
        }
    }
    catch {
        Write-Warning "Could not read file: $($file.FullName) - $($_.Exception.Message)"
    }
}

# Sort by line count (descending)
$longFiles = $longFiles | Sort-Object LineCount -Descending

# Output results
if ($longFiles.Count -eq 0) {
    Write-Host "No TypeScript files found with $Min+ lines" -ForegroundColor Green
} else {
    if ($ShowAll) {
        Write-Host "All $($longFiles.Count) TypeScript files (sorted by line count):" -ForegroundColor Yellow
    } else {
        Write-Host "Found $($longFiles.Count) TypeScript files with $Min+ lines:" -ForegroundColor Yellow
    }
    Write-Host ""
    
    if ($Detailed) {
        # Detailed output with metrics
        Write-Host "Detailed File Analysis:" -ForegroundColor White
        Write-Host ""
        
        foreach ($file in $longFiles) {
            $codePercentage = [math]::Round(($file.CodeLines / $file.LineCount) * 100, 1)
            $commentPercentage = [math]::Round(($file.CommentLines / $file.LineCount) * 100, 1)
            
            Write-Host "File: $($file.Path)" -ForegroundColor White
            Write-Host "   Total Lines: $($file.LineCount)" -ForegroundColor Cyan
            Write-Host "   Code Lines: $($file.CodeLines) ($codePercentage%)" -ForegroundColor Green
            Write-Host "   Comments: $($file.CommentLines) ($commentPercentage%)" -ForegroundColor Gray
            Write-Host "   Empty: $($file.EmptyLines)" -ForegroundColor DarkGray
            Write-Host "   Size: $($file.SizeKB) KB" -ForegroundColor Yellow
            Write-Host "   Modified: $($file.LastModified.ToString('yyyy-MM-dd HH:mm'))" -ForegroundColor Magenta
            Write-Host ""
        }
    } else {
        # Simple output
        $maxPathLength = ($longFiles.Path | Measure-Object -Property Length -Maximum).Maximum
        $padLength = [math]::Max($maxPathLength + 2, 40)
        
        Write-Host "Lines".PadRight(8) + "File Path" -ForegroundColor White
        Write-Host (("-" * 8) + ("-" * $padLength)) -ForegroundColor DarkGray
        
        foreach ($file in $longFiles) {
            $lineCountStr = $file.LineCount.ToString().PadRight(8)
            $color = if ($file.LineCount -gt 1000) { "Red" } 
                     elseif ($file.LineCount -gt 500) { "Yellow" } 
                     else { "White" }
            
            Write-Host $lineCountStr -NoNewline -ForegroundColor $color
            Write-Host $file.Path -ForegroundColor White
        }
    }
    
    Write-Host ""
    Write-Host "Summary Statistics:" -ForegroundColor Cyan
    
    $avgLines = [math]::Round(($longFiles | Measure-Object -Property LineCount -Average).Average, 0)
    $maxLines = ($longFiles | Measure-Object -Property LineCount -Maximum).Maximum
    $totalLongLines = ($longFiles | Measure-Object -Property LineCount -Sum).Sum
    
    Write-Host "  Total files scanned: $totalFiles" -ForegroundColor Gray
    Write-Host "  Total lines scanned: $($totalLinesScanned.ToString('N0'))" -ForegroundColor Gray
    Write-Host "  Files over threshold: $($longFiles.Count)" -ForegroundColor Gray
    Write-Host "  Average lines (long files): $avgLines" -ForegroundColor Gray
    Write-Host "  Largest file: $maxLines lines" -ForegroundColor Gray
    Write-Host "  Total lines in long files: $($totalLongLines.ToString('N0'))" -ForegroundColor Gray
    
    # File size categories
    $largeFiles = $longFiles | Where-Object { $_.LineCount -gt 1000 }
    $mediumFiles = $longFiles | Where-Object { $_.LineCount -gt 500 -and $_.LineCount -le 1000 }
    $smallFiles = $longFiles | Where-Object { $_.LineCount -le 500 }
    
    Write-Host ""
    Write-Host "Size Distribution:" -ForegroundColor Cyan
    Write-Host "  * Very Large (1000+ lines): $($largeFiles.Count) files" -ForegroundColor Red
    Write-Host "  * Large (500-1000 lines): $($mediumFiles.Count) files" -ForegroundColor Yellow
    Write-Host "  * Medium ($Min-500 lines): $($smallFiles.Count) files" -ForegroundColor White
    
    if ($largeFiles.Count -gt 0) {
        Write-Host ""
        Write-Host "Refactoring Recommendations:" -ForegroundColor Green
        Write-Host "  Consider breaking down files over 1000 lines into smaller modules" -ForegroundColor Gray
        Write-Host "  Look for opportunities to extract classes, functions, or utilities" -ForegroundColor Gray
        Write-Host "  Files over 500 lines may benefit from modularization" -ForegroundColor Gray
    }
    
    if (-not $Detailed) {
        Write-Host ""
        Write-Host "Use -Detailed flag for comprehensive file analysis" -ForegroundColor Gray
    }
    
    if (-not $IncludeTests) {
        Write-Host "Use -IncludeTests flag to include test files in analysis" -ForegroundColor Gray
    }
}

Write-Host ""

# Return file paths for potential scripting use
return $longFiles | ForEach-Object { $_.Path }