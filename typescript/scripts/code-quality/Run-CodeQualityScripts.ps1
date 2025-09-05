# Run-CodeQualityScripts.ps1
# Runs all other PowerShell scripts in this directory alphabetically and outputs their results

$ErrorActionPreference = "Continue"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "     CODE QUALITY CHECK SUITE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get all .ps1 files except this one, sorted alphabetically
$scripts = Get-ChildItem -Path $scriptDir -Filter "*.ps1" | 
    Where-Object { $_.Name -ne "Run-CodeQualityScripts.ps1" } | 
    Sort-Object Name

if ($scripts.Count -eq 0) {
    Write-Host "No code quality scripts found in $scriptDir" -ForegroundColor Yellow
    exit 0
}

Write-Host "Found $($scripts.Count) code quality scripts to run:" -ForegroundColor Green
$scripts | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor Gray }
Write-Host ""

$totalStartTime = Get-Date
$results = @()

foreach ($script in $scripts) {
    $scriptName = $script.BaseName
    $startTime = Get-Date
    
    Write-Host "========================================" -ForegroundColor Blue
    Write-Host "Running: $($script.Name)" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Blue
    Write-Host ""
    
    try {
        # Execute the script and capture output
        $output = & $script.FullName 2>&1
        
        # Display the output
        $output | ForEach-Object { 
            if ($_ -is [System.Management.Automation.ErrorRecord]) {
                Write-Host $_.Exception.Message -ForegroundColor Red
            } else {
                Write-Host $_
            }
        }
        
        $duration = (Get-Date) - $startTime
        $results += [PSCustomObject]@{
            Script = $script.Name
            Status = "Success"
            Duration = $duration.TotalSeconds
        }
        
        Write-Host ""
        Write-Host "✓ Completed in $([math]::Round($duration.TotalSeconds, 2)) seconds" -ForegroundColor Green
    }
    catch {
        $duration = (Get-Date) - $startTime
        Write-Host "✗ Error running $($script.Name): $_" -ForegroundColor Red
        $results += [PSCustomObject]@{
            Script = $script.Name
            Status = "Failed"
            Duration = $duration.TotalSeconds
        }
    }
    
    Write-Host ""
}

$totalDuration = (Get-Date) - $totalStartTime

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "         SUMMARY REPORT" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Script Results:" -ForegroundColor Yellow
$results | Format-Table -Property Script, Status, @{Label="Duration (s)"; Expression={[math]::Round($_.Duration, 2)}} -AutoSize

$successCount = ($results | Where-Object { $_.Status -eq "Success" }).Count
$failCount = ($results | Where-Object { $_.Status -eq "Failed" }).Count

Write-Host ""
Write-Host "Total Scripts Run: $($results.Count)" -ForegroundColor White
Write-Host "Successful: $successCount" -ForegroundColor Green
if ($failCount -gt 0) {
    Write-Host "Failed: $failCount" -ForegroundColor Red
}

Write-Host ""
Write-Host "Total Execution Time: $([math]::Round($totalDuration.TotalSeconds, 2)) seconds" -ForegroundColor Cyan
Write-Host ""

if ($failCount -gt 0) {
    Write-Host "⚠ Some scripts failed. Review the output above for details." -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "✓ All code quality checks completed successfully!" -ForegroundColor Green
    exit 0
}