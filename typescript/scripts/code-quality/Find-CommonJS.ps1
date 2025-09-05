# Find-CommonJS.ps1
# Traverses the codebase to find files using CommonJS instead of ES Modules
# and provides instructions for converting to ES Modules

param(
    [string]$Path = ".",
    [switch]$Verbose,
    [string[]]$ExcludePaths = @("node_modules", ".git", "dist", "build", "coverage", "out"),
    [string[]]$Extensions = @(".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"),
    [switch]$ShowExamples
)

# Show conversion examples if requested
if ($ShowExamples) {
    Write-Host ""
    Write-Host "=== CommonJS to ES Modules Conversion Guide ===" -ForegroundColor Cyan
    Write-Host ""
    
    Write-Host "1. IMPORTS:" -ForegroundColor Yellow
    Write-Host "   CommonJS:" -ForegroundColor Red
    Write-Host "   const fs = require('fs');"
    Write-Host "   const { readFile } = require('fs/promises');"
    Write-Host "   const express = require('express');"
    Write-Host ""
    Write-Host "   ES Modules:" -ForegroundColor Green
    Write-Host "   import fs from 'fs';"
    Write-Host "   import { readFile } from 'fs/promises';"
    Write-Host "   import express from 'express';"
    Write-Host ""
    
    Write-Host "2. EXPORTS:" -ForegroundColor Yellow
    Write-Host "   CommonJS:" -ForegroundColor Red
    Write-Host "   module.exports = MyClass;"
    Write-Host "   module.exports = { func1, func2 };"
    Write-Host "   exports.myFunction = () => {};"
    Write-Host ""
    Write-Host "   ES Modules:" -ForegroundColor Green
    Write-Host "   export default MyClass;"
    Write-Host "   export { func1, func2 };"
    Write-Host "   export const myFunction = () => {};"
    Write-Host ""
    
    Write-Host "3. DYNAMIC IMPORTS:" -ForegroundColor Yellow
    Write-Host "   CommonJS:" -ForegroundColor Red
    Write-Host "   const module = require('./path/' + dynamicVar);"
    Write-Host ""
    Write-Host "   ES Modules:" -ForegroundColor Green
    Write-Host "   const module = await import('./path/' + dynamicVar);"
    Write-Host ""
    
    Write-Host "4. __dirname and __filename:" -ForegroundColor Yellow
    Write-Host "   CommonJS:" -ForegroundColor Red
    Write-Host "   console.log(__dirname);"
    Write-Host "   console.log(__filename);"
    Write-Host ""
    Write-Host "   ES Modules:" -ForegroundColor Green
    Write-Host "   import { fileURLToPath } from 'url';"
    Write-Host "   import { dirname } from 'path';"
    Write-Host "   const __filename = fileURLToPath(import.meta.url);"
    Write-Host "   const __dirname = dirname(__filename);"
    Write-Host ""
    
    Write-Host "5. CONFIGURATION:" -ForegroundColor Yellow
    Write-Host "   package.json:" -ForegroundColor Cyan
    Write-Host '   Add: "type": "module"'
    Write-Host ""
    Write-Host "   TypeScript (tsconfig.json):" -ForegroundColor Cyan
    Write-Host '   "module": "ES2022" or "ESNext"'
    Write-Host '   "target": "ES2022" or later'
    Write-Host ""
    
    Write-Host "6. FILE EXTENSIONS:" -ForegroundColor Yellow
    Write-Host "   .js  - ES Modules (when type: module)" -ForegroundColor Green
    Write-Host "   .mjs - ES Modules (always)" -ForegroundColor Green
    Write-Host "   .cjs - CommonJS (always)" -ForegroundColor Red
    Write-Host ""
    
    Write-Host "7. SPECIAL CASES:" -ForegroundColor Yellow
    Write-Host "   Electron preload scripts:" -ForegroundColor Magenta
    Write-Host "   - May need to stay CommonJS or use .mjs extension"
    Write-Host "   - Check Electron version for ESM support (v28+)"
    Write-Host ""
    Write-Host "   Node.js built-ins with CommonJS modules:" -ForegroundColor Magenta
    Write-Host "   import pkg from 'commonjs-package';"
    Write-Host "   const { namedExport } = pkg;"
    Write-Host ""
    
    return
}

Write-Host ""
Write-Host "Scanning for CommonJS usage..." -ForegroundColor Cyan
Write-Host "Path: $Path" -ForegroundColor Gray
Write-Host "Extensions: $($Extensions -join ', ')" -ForegroundColor Gray
Write-Host ""

$totalFiles = 0
$filesWithCommonJS = 0
$requireCount = 0
$moduleExportsCount = 0
$exportsCount = 0
$dirnameFilenameCount = 0

# Statistics by file type
$stats = @{}

# Get all files with specified extensions
$files = Get-ChildItem -Path $Path -Recurse -File | Where-Object {
    $ext = $_.Extension
    $relativePath = $_.FullName.Substring((Get-Location).Path.Length + 1)
    
    # Check if extension is in our list
    $extensionMatch = $Extensions -contains $ext
    
    # Check if path should be excluded
    $shouldExclude = $false
    foreach ($excludePath in $ExcludePaths) {
        if ($relativePath -like "*$excludePath*") {
            $shouldExclude = $true
            break
        }
    }
    
    return $extensionMatch -and -not $shouldExclude
}

foreach ($file in $files) {
    $totalFiles++
    $relativePath = $file.FullName.Substring((Get-Location).Path.Length + 1)
    
    # Read file content
    try {
        $content = Get-Content -Path $file.FullName -Raw
    } catch {
        Write-Host "  Warning: Could not read file $relativePath" -ForegroundColor Yellow
        continue
    }
    
    $hasCommonJS = $false
    $fileIssues = @()
    
    # Initialize stats for file extension if needed
    $ext = $file.Extension
    if (-not $stats.ContainsKey($ext)) {
        $stats[$ext] = @{
            Files = 0
            CommonJS = 0
            Requires = 0
            ModuleExports = 0
            Exports = 0
            DirnameFilename = 0
        }
    }
    $stats[$ext].Files++
    
    # Check for require() statements (but not in comments)
    $requireMatches = [regex]::Matches($content, '(?:^|[^.\w/])require\s*\([''"`]([^''"`]+)[''"`]\)', 'Multiline')
    if ($requireMatches.Count -gt 0) {
        $hasCommonJS = $true
        $requireCount += $requireMatches.Count
        $stats[$ext].Requires += $requireMatches.Count
        
        foreach ($match in $requireMatches) {
            $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
            $module = $match.Groups[1].Value
            $fileIssues += "  Line ${lineNumber}: require('$module')"
        }
    }
    
    # Check for module.exports
    $moduleExportsMatches = [regex]::Matches($content, 'module\.exports\s*=', 'Multiline')
    if ($moduleExportsMatches.Count -gt 0) {
        $hasCommonJS = $true
        $moduleExportsCount += $moduleExportsMatches.Count
        $stats[$ext].ModuleExports += $moduleExportsMatches.Count
        
        foreach ($match in $moduleExportsMatches) {
            $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
            $fileIssues += "  Line ${lineNumber}: module.exports"
        }
    }
    
    # Check for exports.property
    $exportsMatches = [regex]::Matches($content, '(?:^|[^.])\bexports\.[a-zA-Z_]\w*\s*=', 'Multiline')
    if ($exportsMatches.Count -gt 0) {
        $hasCommonJS = $true
        $exportsCount += $exportsMatches.Count
        $stats[$ext].Exports += $exportsMatches.Count
        
        foreach ($match in $exportsMatches) {
            $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
            $exportName = [regex]::Match($match.Value, 'exports\.([a-zA-Z_]\w*)').Groups[1].Value
            $fileIssues += "  Line ${lineNumber}: exports.$exportName"
        }
    }
    
    # Check for __dirname and __filename (but not ES module definitions)
    # Skip if file contains import.meta.url (indicating ES module conversion)
    $hasImportMeta = $content -match 'import\.meta\.url'
    
    if (-not $hasImportMeta) {
        $dirnameMatches = [regex]::Matches($content, '__dirname|__filename', 'Multiline')
        if ($dirnameMatches.Count -gt 0) {
            $hasCommonJS = $true
            $dirnameFilenameCount += $dirnameMatches.Count
            $stats[$ext].DirnameFilename += $dirnameMatches.Count
            
            foreach ($match in $dirnameMatches) {
                $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
                $fileIssues += "  Line ${lineNumber}: $($match.Value)"
            }
        }
    }
    
    if ($hasCommonJS) {
        $filesWithCommonJS++
        $stats[$ext].CommonJS++
        
        Write-Host "[FILE] $relativePath" -ForegroundColor Yellow
        foreach ($issue in $fileIssues) {
            Write-Host $issue -ForegroundColor Red
        }
        
        # Provide specific conversion instructions based on what was found
        Write-Host "  Conversions needed:" -ForegroundColor Cyan
        if ($requireMatches.Count -gt 0) {
            Write-Host "    - Replace require() with import statements" -ForegroundColor Gray
        }
        if ($moduleExportsMatches.Count -gt 0) {
            Write-Host "    - Replace module.exports with export default or export { }" -ForegroundColor Gray
        }
        if ($exportsMatches.Count -gt 0) {
            Write-Host "    - Replace exports.x with export const x or export { x }" -ForegroundColor Gray
        }
        if ($dirnameMatches.Count -gt 0) {
            Write-Host "    - Add import.meta.url imports for __dirname/__filename" -ForegroundColor Gray
        }
        Write-Host ""
    }
}

Write-Host "=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "Total files scanned: $totalFiles" -ForegroundColor White
Write-Host "Files with CommonJS: $filesWithCommonJS" -ForegroundColor Yellow
Write-Host ""
Write-Host "CommonJS patterns found:" -ForegroundColor White
Write-Host "  require() calls: $requireCount" -ForegroundColor Red
Write-Host "  module.exports: $moduleExportsCount" -ForegroundColor Red
Write-Host "  exports.property: $exportsCount" -ForegroundColor Red
Write-Host "  __dirname/__filename: $dirnameFilenameCount" -ForegroundColor Red

if ($stats.Count -gt 0) {
    Write-Host ""
    Write-Host "=== BY FILE TYPE ===" -ForegroundColor Cyan
    foreach ($ext in $stats.Keys | Sort-Object) {
        $s = $stats[$ext]
        if ($s.CommonJS -gt 0) {
            Write-Host "$ext files:" -ForegroundColor Yellow
            Write-Host "  Total: $($s.Files) | With CommonJS: $($s.CommonJS)" -ForegroundColor White
            Write-Host "  require: $($s.Requires) | module.exports: $($s.ModuleExports) | exports: $($s.Exports) | __dirname/__filename: $($s.DirnameFilename)" -ForegroundColor Gray
        }
    }
}

if ($filesWithCommonJS -gt 0) {
    Write-Host ""
    Write-Host "=== CONVERSION INSTRUCTIONS ===" -ForegroundColor Green
    Write-Host '1. Replace require() calls with import statements'
    Write-Host '2. Replace module.exports with export default or export { }'
    Write-Host '3. Replace exports.property with export const property'
    Write-Host '4. Update tsconfig.json to use ES2022 modules'
    Write-Host '5. Ensure package.json has "type": "module" for ES modules'
    Write-Host ""
    Write-Host "Note: Some files (like Electron preload scripts) may need to remain CommonJS" -ForegroundColor Magenta
    Write-Host "Check your build system and runtime requirements before converting" -ForegroundColor Magenta
} else {
    Write-Host ""
    Write-Host "No CommonJS usage found! All files are using ES Modules." -ForegroundColor Green
}

Write-Host ""
Write-Host "Use -ShowExamples to see detailed conversion examples" -ForegroundColor Cyan

# Exit with appropriate code
if ($filesWithCommonJS -gt 0) {
    exit 1
} else {
    exit 0
}