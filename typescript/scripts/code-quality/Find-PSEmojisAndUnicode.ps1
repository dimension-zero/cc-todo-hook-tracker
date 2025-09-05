# Find-PSEmojisAndUnicode.ps1
# Searches all PowerShell scripts for emojis and Unicode characters
# Helps identify files that may have encoding issues

param(
    [string]$Path = ".",
    [switch]$ShowDetails,
    [switch]$IncludeAsciiExtended  # Include extended ASCII (128-255) like accented characters
)

Write-Host "Searching PowerShell scripts for emojis and Unicode characters..." -ForegroundColor Cyan
Write-Host "Path: $Path" -ForegroundColor Gray
if ($IncludeAsciiExtended) {
    Write-Host "Including extended ASCII characters (128-255)" -ForegroundColor Yellow
} else {
    Write-Host "Searching for Unicode only (>255)" -ForegroundColor Gray
}
Write-Host ""

# Get all PowerShell files
$psFiles = Get-ChildItem -Path $Path -Include "*.ps1", "*.psm1", "*.psd1" -Recurse -File

$totalFiles = 0
$filesWithUnicode = @()
$totalUnicodeChars = 0
$unicodeByType = @{
    Emoji = 0
    BoxDrawing = 0
    Arrows = 0
    Mathematical = 0
    Currency = 0
    Other = 0
}

foreach ($file in $psFiles) {
    $totalFiles++
    $relativePath = Resolve-Path $file.FullName -Relative
    
    try {
        # Read file as byte array to properly detect encoding issues
        $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
        $content = [System.Text.Encoding]::UTF8.GetString($bytes)
        
        $foundUnicode = $false
        $unicodeChars = @()
        $lineNumber = 1
        
        # Check each character
        for ($i = 0; $i -lt $content.Length; $i++) {
            $char = $content[$i]
            $charCode = [int]$char
            
            # Check if character is outside basic ASCII range
            $isUnicode = if ($IncludeAsciiExtended) {
                $charCode -gt 255
            } else {
                $charCode -gt 127
            }
            
            if ($isUnicode) {
                $foundUnicode = $true
                $totalUnicodeChars++
                
                # Calculate line number
                $lineNumber = ($content.Substring(0, $i) -split "`n").Count
                
                # Categorize the Unicode character
                $category = "Other"
                if ($charCode -ge 0x1F300 -and $charCode -le 0x1F9FF) {
                    $category = "Emoji"
                } elseif ($charCode -ge 0x2500 -and $charCode -le 0x257F) {
                    $category = "BoxDrawing"
                } elseif ($charCode -ge 0x2190 -and $charCode -le 0x21FF) {
                    $category = "Arrows"
                } elseif ($charCode -ge 0x2200 -and $charCode -le 0x22FF) {
                    $category = "Mathematical"
                } elseif (($charCode -ge 0x20A0 -and $charCode -le 0x20CF) -or $charCode -eq 0x00A3 -or $charCode -eq 0x00A5) {
                    $category = "Currency"
                }
                
                $unicodeByType[$category]++
                
                # Get context around the character
                $contextStart = [Math]::Max(0, $i - 20)
                $contextEnd = [Math]::Min($content.Length - 1, $i + 20)
                $context = $content.Substring($contextStart, $contextEnd - $contextStart)
                $context = $context -replace "`r`n", " " -replace "`n", " "
                
                $unicodeInfo = [PSCustomObject]@{
                    Line = $lineNumber
                    Char = $char
                    Code = "U+{0:X4}" -f $charCode
                    Category = $category
                    Context = $context
                }
                
                $unicodeChars += $unicodeInfo
            }
        }
        
        if ($foundUnicode) {
            $fileInfo = [PSCustomObject]@{
                Path = $relativePath
                UnicodeCount = $unicodeChars.Count
                Characters = $unicodeChars
            }
            $filesWithUnicode += $fileInfo
        }
        
    } catch {
        Write-Warning "Could not read file: $relativePath - $($_.Exception.Message)"
    }
}

# Output results
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RESULTS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($filesWithUnicode.Count -eq 0) {
    Write-Host "No Unicode/emoji characters found in PowerShell scripts!" -ForegroundColor Green
    Write-Host "All files use standard ASCII encoding." -ForegroundColor Green
} else {
    Write-Host "Found Unicode/emoji in $($filesWithUnicode.Count) of $totalFiles PowerShell files:" -ForegroundColor Yellow
    Write-Host ""
    
    if ($ShowDetails) {
        # Detailed output with character information
        foreach ($file in $filesWithUnicode) {
            Write-Host "[FILE] $($file.Path)" -ForegroundColor Yellow
            Write-Host "  Unicode characters: $($file.UnicodeCount)" -ForegroundColor Gray
            
            # Group by line number for cleaner output
            $lineGroups = $file.Characters | Group-Object -Property Line
            
            foreach ($lineGroup in $lineGroups) {
                Write-Host "  Line $($lineGroup.Name):" -ForegroundColor Cyan
                foreach ($char in $lineGroup.Group) {
                    Write-Host "    [$($char.Code)] '$($char.Char)' ($($char.Category))" -ForegroundColor White
                    Write-Host "      Context: ...$($char.Context)..." -ForegroundColor DarkGray
                }
            }
            Write-Host ""
        }
    } else {
        # Simple output - just file paths
        foreach ($file in $filesWithUnicode | Sort-Object -Property UnicodeCount -Descending) {
            $color = if ($file.UnicodeCount -gt 50) { "Red" }
                     elseif ($file.UnicodeCount -gt 10) { "Yellow" }
                     else { "White" }
            
            Write-Host "$($file.Path) ($($file.UnicodeCount) Unicode chars)" -ForegroundColor $color
        }
    }
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "SUMMARY" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Total files scanned: $totalFiles" -ForegroundColor White
    Write-Host "Files with Unicode: $($filesWithUnicode.Count)" -ForegroundColor Yellow
    Write-Host "Total Unicode characters: $totalUnicodeChars" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Unicode by category:" -ForegroundColor Cyan
    foreach ($category in $unicodeByType.Keys | Sort-Object) {
        if ($unicodeByType[$category] -gt 0) {
            Write-Host "  ${category}: $($unicodeByType[$category])" -ForegroundColor Gray
        }
    }
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "RECOMMENDATIONS" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "1. Replace emojis with ASCII text descriptions" -ForegroundColor White
    Write-Host "2. Replace box-drawing characters with ASCII (-, |, +)" -ForegroundColor White
    Write-Host "3. Use standard quotes instead of smart quotes" -ForegroundColor White
    Write-Host "4. Save files as UTF-8 without BOM or ASCII" -ForegroundColor White
    Write-Host "5. Use -ShowDetails flag to see specific characters and locations" -ForegroundColor White
    
    if (-not $ShowDetails) {
        Write-Host ""
        Write-Host "Tip: Run with -ShowDetails to see specific Unicode characters and their locations" -ForegroundColor Gray
    }
}

Write-Host ""

# Return file paths for scripting
return $filesWithUnicode | ForEach-Object { $_.Path }