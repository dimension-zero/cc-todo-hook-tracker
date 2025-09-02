<#
.SYNOPSIS
    Finds all timeout-related code in TypeScript files to ensure proper dynamic calculation for LLM calls.

.DESCRIPTION
    Scans all .ts and .tsx files for timeout-related code and validates that LLM API timeouts
    are dynamically calculated based on token length, not hardcoded. Fixed-length timeouts 
    for variable-length data make no sense!

.NOTES
    File: Find-Timeouts.ps1
    Purpose: Code quality check for timeout implementations
    Created: 2025
#>

param(
    [string]$RootPath = ".",
    [string[]]$SearchPaths = @("src", "tests", "config"),
    [string[]]$ExcludePaths = @("node_modules", ".git", "dist", "build"),
    [switch]$ShowContext = $false,
    [int]$ContextLines = 2,
    [switch]$ShowAll = $false
)

# Set console encoding for proper output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TIMEOUT USAGE ANALYZER" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "CRITICAL REQUIREMENT:" -ForegroundColor Red
Write-Host "  All LLM API timeouts MUST be dynamically calculated based on:" -ForegroundColor Yellow
Write-Host "    1. Token count of the request" -ForegroundColor White
Write-Host "    2. Model performance characteristics (tokens/minute)" -ForegroundColor White
Write-Host "    3. Task complexity multiplier" -ForegroundColor White
Write-Host "    4. Safety padding (recommended 3x for 99% reliability)" -ForegroundColor White
Write-Host ""
Write-Host "  Fixed-length timeouts for variable-length data make NO SENSE!" -ForegroundColor Red
Write-Host "  This applies to BOTH Fixed and Dynamic processing modes!" -ForegroundColor Red
Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor DarkGray

# Use provided search paths
$searchPaths = $SearchPaths

# Keywords that indicate timeout usage
$timeoutKeywords = @(
    'timeout',
    'setTimeout',
    'clearTimeout',
    'timeoutMs',
    'maxTimeout',
    'minTimeout',
    'requestTimeout',
    'apiTimeout',
    'responseTimeout',
    'abortSignal',
    'AbortController',
    'signal.timeout'
)

# Files that are known to handle LLM API calls
$llmRelatedFiles = @(
    'anthropicApi',
    'ClaudeProcessor',
    'apiConfig',
    'claudeApi',
    'llmClient',
    'aiClient'
)

$totalFiles = 0
$filesWithTimeouts = 0
$suspiciousTimeouts = @()

Write-Host "`nSearching for timeout usage in TypeScript files...`n" -ForegroundColor Cyan

foreach ($searchPath in $searchPaths) {
    $fullPath = Join-Path $RootPath $searchPath
    if (Test-Path $fullPath) {
        Get-ChildItem -Path $fullPath -Include "*.ts", "*.tsx" -Recurse -File | ForEach-Object {
            $totalFiles++
            $file = $_
            $relativePath = $file.FullName.Replace("$RootPath\", "").Replace("\", "/")
            $content = Get-Content $file.FullName -Raw
            $lines = Get-Content $file.FullName
            
            $foundTimeout = $false
            $timeoutInstances = @()
            
            # Check for timeout-related code
            for ($i = 0; $i -lt $lines.Count; $i++) {
                $line = $lines[$i]
                $lineNumber = $i + 1
                
                foreach ($keyword in $timeoutKeywords) {
                    if ($line -match "\b$keyword\b" -or $line -match $keyword) {
                        $foundTimeout = $true
                        
                        # Check if this looks like a hardcoded timeout value
                        $isHardcoded = $false
                        $timeoutValue = ""
                        
                        # Pattern 1: Direct number assignment (timeout: 30000)
                        if ($line -match "(?:timeout[:\s]*[:=]\s*)(\d+)") {
                            $isHardcoded = $true
                            $timeoutValue = $matches[1]
                        }
                        # Pattern 2: setTimeout with hardcoded value
                        elseif ($line -match "setTimeout\s*\([^,]+,\s*(\d+)\s*\)") {
                            $isHardcoded = $true
                            $timeoutValue = $matches[1]
                        }
                        # Pattern 3: Constant timeout definitions
                        elseif ($line -match "(?:const|let|var)\s+\w*[Tt]imeout\w*\s*=\s*(\d+)") {
                            $isHardcoded = $true
                            $timeoutValue = $matches[1]
                        }
                        
                        # Check if this file is LLM-related
                        $isLLMRelated = $false
                        foreach ($llmFile in $llmRelatedFiles) {
                            if ($relativePath -match $llmFile) {
                                $isLLMRelated = $true
                                break
                            }
                        }
                        
                        # Store the finding
                        $finding = @{
                            Line = $lineNumber
                            Content = $line.Trim()
                            IsHardcoded = $isHardcoded
                            TimeoutValue = $timeoutValue
                            IsLLMRelated = $isLLMRelated
                        }
                        
                        # If it's hardcoded and LLM-related, it's suspicious
                        if ($isHardcoded -and $isLLMRelated) {
                            $finding.IsSuspicious = $true
                        }
                        
                        $timeoutInstances += $finding
                        
                        # Skip duplicate findings on the same line
                        break
                    }
                }
            }
            
            if ($foundTimeout) {
                $filesWithTimeouts++
                
                # Determine file status
                $hasSuspicious = $timeoutInstances | Where-Object { $_.IsSuspicious }
                $hasHardcoded = $timeoutInstances | Where-Object { $_.IsHardcoded }
                
                if ($hasSuspicious) {
                    Write-Host "[CRITICAL] " -ForegroundColor Red -NoNewline
                    Write-Host $relativePath -ForegroundColor Yellow
                    $suspiciousTimeouts += @{
                        Path = $relativePath
                        Instances = $timeoutInstances
                    }
                }
                elseif ($hasHardcoded) {
                    Write-Host "[WARNING]  " -ForegroundColor Yellow -NoNewline
                    Write-Host $relativePath -ForegroundColor White
                }
                else {
                    Write-Host "[OK]       " -ForegroundColor Green -NoNewline
                    Write-Host $relativePath -ForegroundColor Gray
                }
                
                # Show timeout instances
                foreach ($instance in $timeoutInstances) {
                    if ($instance.IsSuspicious) {
                        Write-Host "  Line $($instance.Line): " -ForegroundColor Red -NoNewline
                        Write-Host "HARDCODED LLM TIMEOUT = $($instance.TimeoutValue)ms" -ForegroundColor Red
                        if ($ShowContext) {
                            Write-Host "    $($instance.Content)" -ForegroundColor DarkGray
                        }
                    }
                    elseif ($instance.IsHardcoded) {
                        Write-Host "  Line $($instance.Line): " -ForegroundColor Yellow -NoNewline
                        Write-Host "Hardcoded timeout = $($instance.TimeoutValue)ms" -ForegroundColor Yellow
                        if ($ShowContext) {
                            Write-Host "    $($instance.Content)" -ForegroundColor DarkGray
                        }
                    }
                    elseif ($ShowContext) {
                        Write-Host "  Line $($instance.Line): $($instance.Content)" -ForegroundColor DarkGray
                    }
                }
            }
        }
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ANALYSIS SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Total files scanned:        $totalFiles" -ForegroundColor White
Write-Host "Files with timeout usage:   $filesWithTimeouts" -ForegroundColor White

if ($suspiciousTimeouts.Count -gt 0) {
    Write-Host ""
    Write-Host "CRITICAL ISSUES FOUND!" -ForegroundColor Red
    Write-Host "The following files have hardcoded timeouts in LLM-related code:" -ForegroundColor Red
    Write-Host ""
    
    foreach ($suspicious in $suspiciousTimeouts) {
        Write-Host "  - $($suspicious.Path)" -ForegroundColor Yellow
        foreach ($instance in $suspicious.Instances | Where-Object { $_.IsSuspicious }) {
            Write-Host "      Line $($instance.Line): $($instance.TimeoutValue)ms" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Host "REQUIRED ACTION:" -ForegroundColor Red
    Write-Host "  Replace ALL hardcoded LLM timeouts with dynamic calculation using:" -ForegroundColor Yellow
    Write-Host "    - getTimeoutForOperation() from anthropicApi.ts" -ForegroundColor White
    Write-Host "    - Token count estimation" -ForegroundColor White
    Write-Host "    - Model performance metrics" -ForegroundColor White
    Write-Host "    - Task complexity parameter" -ForegroundColor White
    Write-Host ""
    Write-Host "  Example:" -ForegroundColor Green
    Write-Host "    // BAD - Hardcoded timeout" -ForegroundColor Red
    Write-Host "    const timeout = 60000; // Fixed 60 seconds" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "    // GOOD - Dynamic calculation" -ForegroundColor Green
    Write-Host "    const timeout = getTimeoutForOperation(" -ForegroundColor DarkGray
    Write-Host "        estimatedTokens," -ForegroundColor DarkGray
    Write-Host "        selectedModel," -ForegroundColor DarkGray
    Write-Host "        'analysis' // or 'simple' or 'reasoning'" -ForegroundColor DarkGray
    Write-Host "    );" -ForegroundColor DarkGray
}
else {
    Write-Host ""
    Write-Host "No critical timeout issues found!" -ForegroundColor Green
    Write-Host "All LLM-related timeouts appear to be properly dynamic." -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Return exit code based on findings
if ($suspiciousTimeouts.Count -gt 0) {
    exit 1
}
else {
    exit 0
}