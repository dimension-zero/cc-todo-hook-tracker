# Cross-platform launcher for Claude Todo Monitor
# Works on Windows PowerShell and PowerShell Core (macOS/Linux)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$typescriptDir = Join-Path $scriptDir "typescript"

# Change to typescript directory
Set-Location $typescriptDir

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Check if dist exists
if (-not (Test-Path "dist")) {
    Write-Host "Building application..." -ForegroundColor Yellow
    npm run build
}

# Start the application
Write-Host "Starting Claude Todo Monitor..." -ForegroundColor Green
npm start