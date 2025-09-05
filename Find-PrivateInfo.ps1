#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Searches project files for personal/private information like usernames
.DESCRIPTION
    This script dynamically detects the current user's information (username, full name, email, etc.)
    and searches through project files to find any occurrences. This helps identify potential
    privacy issues or hardcoded personal information that shouldn't be in the codebase.
.PARAMETER Path
    The root directory to search. Defaults to current directory.
.PARAMETER ExcludePatterns
    Additional file patterns to exclude from search
.PARAMETER IncludeHidden
    Include hidden files and directories in search
.EXAMPLE
    .\Find-PrivateInfo.ps1
    Searches current directory for personal information
.EXAMPLE
    .\Find-PrivateInfo.ps1 -Path "C:\Projects" -IncludeHidden
    Searches specified directory including hidden files
#>

param(
    [string]$Path = ".",
    [string[]]$ExcludePatterns = @(),
    [switch]$IncludeHidden
)

# Colors for output
$script:RED = "`e[31m"
$script:GREEN = "`e[32m"
$script:YELLOW = "`e[33m"
$script:BLUE = "`e[34m"
$script:MAGENTA = "`e[35m"
$script:CYAN = "`e[36m"
$script:RESET = "`e[0m"
$script:BOLD = "`e[1m"

# Get current user information dynamically
function Get-UserInfo {
    $userInfo = @{}
    
    # Get Windows username (without domain)
    $userInfo.Username = $env:USERNAME
    
    # Get domain\username
    $userInfo.DomainUser = "$env:USERDOMAIN\$env:USERNAME"
    
    # Get user's full name from Windows
    try {
        $user = Get-WmiObject -Class Win32_UserAccount -Filter "Name='$env:USERNAME'" | 
                Select-Object -First 1
        if ($user.FullName) {
            $userInfo.FullName = $user.FullName
        }
    } catch {
        # Fallback to getting from net user command
        try {
            $netUser = net user $env:USERNAME 2>$null | Select-String "Full Name" 
            if ($netUser) {
                $fullName = ($netUser -split '\s{2,}')[1].Trim()
                if ($fullName) {
                    $userInfo.FullName = $fullName
                }
            }
        } catch {}
    }
    
    # Get computer name
    $userInfo.ComputerName = $env:COMPUTERNAME
    
    # Get user profile path
    $userInfo.ProfilePath = $env:USERPROFILE
    
    # Get home directory name (last part of profile path)
    $userInfo.HomeDir = Split-Path $env:USERPROFILE -Leaf
    
    # Try to get email from git config
    try {
        $gitEmail = git config --global user.email 2>$null
        if ($gitEmail) {
            $userInfo.GitEmail = $gitEmail
        }
    } catch {}
    
    # Try to get name from git config
    try {
        $gitName = git config --global user.name 2>$null
        if ($gitName) {
            $userInfo.GitName = $gitName
        }
    } catch {}
    
    # Create search patterns from user info
    $patterns = @()
    
    # Add each piece of info as a pattern
    foreach ($key in $userInfo.Keys) {
        $value = $userInfo[$key]
        if ($value -and $value.Length -gt 2) {
            # Skip if it's too generic
            if ($value -notmatch '^(Administrator|Admin|User|Guest|Public)$') {
                $patterns += @{
                    Pattern = $value
                    Type = $key
                    CaseSensitive = $false
                }
                
                # Add variations for usernames with dots
                if ($key -eq 'Username' -and $value -match '\.') {
                    # Add variation with dot replaced by dash/underscore
                    $patterns += @{
                        Pattern = $value -replace '\.', '-'
                        Type = "$key (dash variant)"
                        CaseSensitive = $false
                    }
                    $patterns += @{
                        Pattern = $value -replace '\.', '_'
                        Type = "$key (underscore variant)"
                        CaseSensitive = $false
                    }
                }
            }
        }
    }
    
    return @{
        Info = $userInfo
        Patterns = $patterns
    }
}

# Get files to search
function Get-SearchFiles {
    param(
        [string]$SearchPath,
        [string[]]$ExcludePatterns,
        [bool]$IncludeHidden
    )
    
    # Default exclude patterns
    $defaultExcludes = @(
        '*.exe', '*.dll', '*.pdb', '*.obj', '*.o', '*.a', '*.lib',
        '*.zip', '*.tar', '*.gz', '*.7z', '*.rar',
        '*.jpg', '*.jpeg', '*.png', '*.gif', '*.bmp', '*.ico', '*.svg',
        '*.mp3', '*.mp4', '*.avi', '*.mov', '*.wav',
        '*.pdf', '*.doc', '*.docx', '*.xls', '*.xlsx',
        '*.min.js', '*.min.css',
        'package-lock.json', 'yarn.lock', 'composer.lock'
    )
    
    $allExcludes = $defaultExcludes + $ExcludePatterns
    
    # Directories to skip
    $excludeDirs = @(
        '.git', 'node_modules', '.vs', 'bin', 'obj', 'dist', 'build', 'out',
        'target', 'vendor', 'packages', '.idea', '.vscode', '__pycache__',
        'venv', '.env', 'env', 'coverage', '.nyc_output', '.pytest_cache'
    )
    
    Write-Host "`nSearching for files in: $SearchPath" -ForegroundColor Cyan
    
    $files = Get-ChildItem -Path $SearchPath -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object {
            # Check if in excluded directory
            $inExcludedDir = $false
            foreach ($dir in $excludeDirs) {
                if ($_.FullName -match "\\$dir\\|/$dir/") {
                    $inExcludedDir = $true
                    break
                }
            }
            
            # Check if hidden and should be included
            if (-not $IncludeHidden -and $_.Attributes -match 'Hidden') {
                return $false
            }
            
            # Check if matches exclude pattern
            $excluded = $false
            foreach ($pattern in $allExcludes) {
                if ($_.Name -like $pattern) {
                    $excluded = $true
                    break
                }
            }
            
            return (-not $inExcludedDir) -and (-not $excluded)
        }
    
    return $files
}

# Search file for patterns
function Search-FileForPatterns {
    param(
        [System.IO.FileInfo]$File,
        [array]$Patterns
    )
    
    $results = @()
    
    try {
        $content = Get-Content -Path $File.FullName -ErrorAction Stop
        $lineNum = 0
        
        foreach ($line in $content) {
            $lineNum++
            
            foreach ($pattern in $Patterns) {
                $searchPattern = [regex]::Escape($pattern.Pattern)
                
                if ($pattern.CaseSensitive) {
                    $match = $line -cmatch $searchPattern
                } else {
                    $match = $line -imatch $searchPattern
                }
                
                if ($match) {
                    # Get surrounding context
                    $startPos = [Math]::Max(0, $line.IndexOf($pattern.Pattern, [StringComparison]::OrdinalIgnoreCase) - 20)
                    $length = [Math]::Min(80, $line.Length - $startPos)
                    $context = $line.Substring($startPos, $length).Trim()
                    
                    $results += @{
                        File = $File.FullName
                        Line = $lineNum
                        Pattern = $pattern.Pattern
                        Type = $pattern.Type
                        Context = $context
                    }
                }
            }
        }
    } catch {
        # Skip binary files or files that can't be read
    }
    
    return $results
}

# Main execution
function Main {
    Write-Host "$BOLD$CYAN"
    Write-Host "================================================================"
    Write-Host "            PRIVATE INFORMATION SCANNER"
    Write-Host "================================================================"
    Write-Host "$RESET"
    
    # Get user information
    Write-Host "Detecting user information..." -ForegroundColor Yellow
    $userData = Get-UserInfo
    
    Write-Host "`nUser Information Found:" -ForegroundColor Cyan
    foreach ($key in $userData.Info.Keys | Sort-Object) {
        Write-Host "  ${key}: $($userData.Info[$key])" -ForegroundColor Gray
    }
    
    Write-Host "`nSearch Patterns (${YELLOW}$($userData.Patterns.Count) patterns${RESET}):" -ForegroundColor Cyan
    foreach ($pattern in $userData.Patterns) {
        Write-Host "  [$($pattern.Type)] $($pattern.Pattern)" -ForegroundColor Gray
    }
    
    # Get files to search
    $files = Get-SearchFiles -SearchPath $Path -ExcludePatterns $ExcludePatterns -IncludeHidden $IncludeHidden
    Write-Host "Found $($files.Count) files to search" -ForegroundColor Cyan
    
    # Search files
    Write-Host "`nSearching files..." -ForegroundColor Yellow
    $allResults = @()
    $filesWithMatches = @{}
    $progress = 0
    
    foreach ($file in $files) {
        $progress++
        
        # Show progress for every 100 files
        if ($progress % 100 -eq 0) {
            Write-Host "  Processed $progress/$($files.Count) files..." -ForegroundColor Gray
        }
        
        $results = Search-FileForPatterns -File $file -Patterns $userData.Patterns
        
        if ($results.Count -gt 0) {
            $allResults += $results
            $relativePath = $file.FullName.Replace("$((Get-Location).Path)\", "").Replace("\", "/")
            
            if (-not $filesWithMatches.ContainsKey($relativePath)) {
                $filesWithMatches[$relativePath] = @()
            }
            $filesWithMatches[$relativePath] += $results
        }
    }
    
    # Display results
    Write-Host "`n$BOLD$CYAN"
    Write-Host "================================================================"
    Write-Host "                        RESULTS"
    Write-Host "================================================================"
    Write-Host "$RESET"
    
    if ($allResults.Count -eq 0) {
        Write-Host "${GREEN}✓ No personal information found in the codebase!${RESET}" -ForegroundColor Green
    } else {
        Write-Host "${RED}⚠ Found $($allResults.Count) occurrences in $($filesWithMatches.Count) files${RESET}" -ForegroundColor Red
        Write-Host ""
        
        # Group by file
        foreach ($file in $filesWithMatches.Keys | Sort-Object) {
            Write-Host "${YELLOW}$file${RESET}:" -ForegroundColor Yellow
            
            $fileResults = $filesWithMatches[$file] | Sort-Object Line
            foreach ($result in $fileResults) {
                Write-Host "  ${CYAN}Line $($result.Line)${RESET}: [$($result.Type)] ${MAGENTA}$($result.Pattern)${RESET}" -ForegroundColor White
                Write-Host "    Context: $($result.Context)" -ForegroundColor Gray
            }
            Write-Host ""
        }
        
        # Summary by type
        Write-Host "${BOLD}Summary by Information Type:${RESET}" -ForegroundColor Cyan
        $summary = $allResults | Group-Object Type | Sort-Object Count -Descending
        foreach ($group in $summary) {
            Write-Host "  $($group.Name): $($group.Count) occurrences" -ForegroundColor Gray
        }
    }
    
    Write-Host "`n${BOLD}Scan Complete${RESET}" -ForegroundColor Green
    
    # Return exit code based on whether issues were found
    if ($allResults.Count -gt 0) {
        exit 1
    } else {
        exit 0
    }
}

# Run the script
Main