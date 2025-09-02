# Check-DynamicFixed.ps1
# PowerShell script to check for cross-contamination between Fixed and Dynamic code files
# Ensures proper separation of concerns in the codebase

param(
    [string]$Path = ".",
    [switch]$Verbose
)

Write-Host "Checking Fixed/Dynamic code separation..." -ForegroundColor Cyan
Write-Host ""

# Initialize counters
$violations = @()
$totalFiles = 0
$fixedFiles = 0
$dynamicFiles = 0

# Get all TypeScript files recursively
$tsFiles = Get-ChildItem -Path $Path -Recurse -Filter "*.ts" | Where-Object { $_.Name -notmatch "\.d\.ts$" }

foreach ($file in $tsFiles) {
    $totalFiles++
    $relativePath = Resolve-Path -Path $file.FullName -Relative
    $fileName = $file.Name
    $content = Get-Content -Path $file.FullName -Raw
    
    # Check if filename contains "Fixed" (case insensitive)
    if ($fileName -imatch "Fixed") {
        $fixedFiles++
        if ($Verbose) {
            Write-Host "  Checking Fixed file: $relativePath" -ForegroundColor Gray
        }
        
        # Check if content contains "Dynamic" (case insensitive)
        if ($content -imatch "Dynamic") {
            $violations += [PSCustomObject]@{
                File = $relativePath
                Type = "Fixed file contains 'Dynamic'"
                Violations = @()
            }
            
            # Find specific lines with violations for detailed reporting
            $lines = Get-Content -Path $file.FullName
            for ($i = 0; $i -lt $lines.Count; $i++) {
                if ($lines[$i] -imatch "Dynamic") {
                    $violations[-1].Violations += "Line $($i + 1): $($lines[$i].Trim())"
                }
            }
        }
    }
    
    # Check if filename contains "Dynamic" (case insensitive)
    if ($fileName -imatch "Dynamic") {
        $dynamicFiles++
        if ($Verbose) {
            Write-Host "  Checking Dynamic file: $relativePath" -ForegroundColor Gray
        }
        
        # Check if content contains "Fixed" (case insensitive)
        if ($content -imatch "Fixed") {
            $violations += [PSCustomObject]@{
                File = $relativePath
                Type = "Dynamic file contains 'Fixed'"
                Violations = @()
            }
            
            # Find specific lines with violations for detailed reporting
            $lines = Get-Content -Path $file.FullName
            for ($i = 0; $i -lt $lines.Count; $i++) {
                if ($lines[$i] -imatch "Fixed") {
                    $violations[-1].Violations += "Line $($i + 1): $($lines[$i].Trim())"
                }
            }
        }
    }
}

# Report results
Write-Host "Scan Results:" -ForegroundColor Yellow
Write-Host "  Total TypeScript files: $totalFiles"
Write-Host "  Files with 'Fixed' in name: $fixedFiles"
Write-Host "  Files with 'Dynamic' in name: $dynamicFiles"
Write-Host ""

if ($violations.Count -eq 0) {
    Write-Host "No violations found! Fixed and Dynamic code are properly separated." -ForegroundColor Green
    exit 0
} else {
    Write-Host "Found $($violations.Count) violation(s):" -ForegroundColor Red
    Write-Host ""
    
    foreach ($violation in $violations) {
        Write-Host "[FILE] $($violation.File)" -ForegroundColor Red
        Write-Host "   Issue: $($violation.Type)" -ForegroundColor Yellow
        
        if ($violation.Violations.Count -gt 0) {
            Write-Host "   Violations:" -ForegroundColor Yellow
            foreach ($line in $violation.Violations) {
                Write-Host "     $line" -ForegroundColor Gray
            }
        }
        Write-Host ""
    }
    
    Write-Host "Recommendation: Review and remove cross-references between Fixed and Dynamic implementations." -ForegroundColor Cyan
    exit 1
}