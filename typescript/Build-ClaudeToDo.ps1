# Build-ClaudeToDo.ps1
# Builds standalone ClaudeToDo executables for Windows, macOS, and Linux

param(
    [switch]$Windows,
    [switch]$Mac, 
    [switch]$Linux,
    [switch]$All,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  ClaudeToDo Standalone Builder" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# If no platform specified, build for current OS
if (-not $Windows -and -not $Mac -and -not $Linux -and -not $All) {
    $Windows = $true
    Write-Host "No platform specified. Building for Windows." -ForegroundColor Yellow
}

if ($All) {
    $Windows = $true
    $Mac = $true
    $Linux = $true
    Write-Host "Building for all platforms..." -ForegroundColor Green
}

# Clean if requested
if ($Clean) {
    Write-Host "Cleaning previous builds..." -ForegroundColor Yellow
    Remove-Item -Path "portable" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "release" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "dist-standalone" -Recurse -Force -ErrorAction SilentlyContinue
}

# Ensure we're in the typescript directory
if (-not (Test-Path "package.json")) {
    Write-Error "This script must be run from the typescript directory!"
    exit 1
}

# Check for node and npm
Write-Host "Checking dependencies..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    $npmVersion = npm --version
    Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green
    Write-Host "  npm: $npmVersion" -ForegroundColor Green
}
catch {
    Write-Error "Node.js and npm are required. Please install them first."
    exit 1
}

# Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install dependencies"
        exit 1
    }
}

# Build the application
Write-Host ""
Write-Host "Building application..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed"
    exit 1
}
Write-Host "  Build completed" -ForegroundColor Green

# Create output directory
$outputDir = "dist-standalone"
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

Write-Host ""
Write-Host "Creating standalone executables..." -ForegroundColor Yellow
Write-Host ""

# Build for Windows
if ($Windows) {
    Write-Host "Building Windows portable executable..." -ForegroundColor Cyan
    
    # Clean Windows build directory
    Remove-Item -Path "portable" -Recurse -Force -ErrorAction SilentlyContinue
    
    # Build Windows unpacked (since true portable has issues)
    npx electron-builder --dir --win 2>&1 | Out-Null
    
    if (Test-Path "portable\win-unpacked\ClaudeToDo.exe") {
        # Create Windows package
        Write-Host "  Creating Windows package..." -ForegroundColor Yellow
        
        $winDir = "$outputDir\ClaudeToDo-Windows"
        Remove-Item -Path $winDir -Recurse -Force -ErrorAction SilentlyContinue
        Copy-Item -Path "portable\win-unpacked" -Destination $winDir -Recurse
        
        Write-Host "  Created: ClaudeToDo-Windows folder" -ForegroundColor Green
        Write-Host "    Run: ClaudeToDo.exe directly" -ForegroundColor Gray
    }
    else {
        Write-Host "  Windows build failed" -ForegroundColor Red
    }
}

# Build for macOS
if ($Mac) {
    Write-Host ""
    Write-Host "Building macOS application..." -ForegroundColor Cyan
    Write-Host "  macOS builds must be created on a Mac" -ForegroundColor Yellow
    Write-Host "  Run on macOS: pwsh Build-ClaudeToDo.ps1 -Mac" -ForegroundColor Gray
}

# Build for Linux
if ($Linux) {
    Write-Host ""
    Write-Host "Building Linux AppImage..." -ForegroundColor Cyan
    Write-Host "  Linux builds must be created on Linux" -ForegroundColor Yellow
    Write-Host "  Run on Linux: pwsh Build-ClaudeToDo.ps1 -Linux" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  On Linux, the AppImage will be a true single portable file!" -ForegroundColor Green
}

# Summary
Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Build Complete!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Standalone applications created in: $outputDir" -ForegroundColor Green
Write-Host ""

# List created files
if (Test-Path $outputDir) {
    Write-Host "Available builds:" -ForegroundColor Yellow
    Get-ChildItem $outputDir | ForEach-Object {
        Write-Host "  - $($_.Name)" -ForegroundColor White
    }
}

Write-Host ""
Write-Host "Usage Notes:" -ForegroundColor Yellow
Write-Host "  Windows: Double-click ClaudeToDo.exe" -ForegroundColor Gray
Write-Host "  macOS: Build on Mac, then run ClaudeToDo.app" -ForegroundColor Gray  
Write-Host "  Linux: Build on Linux for true single-file AppImage" -ForegroundColor Gray
Write-Host ""