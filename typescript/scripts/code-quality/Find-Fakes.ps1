# Find-Fakes.ps1
# Searches for test doubles, mock objects, magic values, and hardcoded test data
# Supports TypeScript patterns with advanced detection

param(
    [string]$Path = ".",
    [string]$Language = "TypeScript",
    [switch]$IncludeLineNumbers,
    [switch]$Detailed,
    [switch]$IncludeMagicStrings,
    [switch]$ExcludeTestFiles,
    [switch]$ExcludeNodeModules = $true
)

Write-Host "Find-Fakes Analysis - Mock and Test Pattern Detection" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Language Mode: $Language" -ForegroundColor Gray
Write-Host "Scan Path: $Path" -ForegroundColor Gray
if ($IncludeMagicStrings) {
    Write-Host "Including magic strings/numbers scan" -ForegroundColor Yellow
}
Write-Host ""

# Define TypeScript-specific patterns (more sophisticated)
$TypeScriptPatterns = @{
    "Mock Classes and Functions" = @(
        "class Mock\w+",
        "function mock\w+",
        "const mock\w+ = ",
        "let mock\w+ = "
    )
    "Jest Framework" = @(
        "jest\.mock\(",
        "jest\.fn\(",
        "\.mockImplementation\(",
        "\.mockReturnValue\(",
        "\.mockResolvedValue\(",
        "\.mockRejectedValue\(",
        "\.mockClear\(",
        "\.mockReset\(",
        "jest\.spyOn\(",
        "\.toHaveBeenCalled\(",
        "\.toHaveBeenCalledWith\(",
        "\.toHaveBeenCalledTimes\("
    )
    "Test Doubles" = @(
        "class Fake\w+",
        "class Stub\w+",
        "class Spy\w+",
        "class Dummy\w+",
        "function fake\w+",
        "function stub\w+",
        "function spy\w+",
        "const fake\w+ = ",
        "const stub\w+ = ",
        "const spy\w+ = "
    )
    "Sinon Framework" = @(
        "sinon\.stub\(",
        "sinon\.spy\(",
        "sinon\.fake\(",
        "sinon\.mock\(",
        "sinon\.sandbox\.",
        "\.restore\(\)",
        "\.calledOnce",
        "\.calledWith\(",
        "\.returns\(",
        "\.throws\(",
        "\.yields\(",
        "\.callsArg\("
    )
    "Test Helpers" = @(
        "createMock\w*\(",
        "createFake\w*\(",
        "createStub\w*\(",
        "createSpy\w*\(",
        "createTestDouble\(",
        "setupTest\w*\(",
        "buildTest\w*\(",
        "makeTest\w*\("
    )
    "Hardcoded Test Data" = @(
        "testData\s*=",
        "mockData\s*=",
        "fakeData\s*=",
        "dummyData\s*=",
        "sampleData\s*=",
        "fixtureData\s*=",
        "exampleData\s*=",
        "TEST_\w+\s*=",
        "MOCK_\w+\s*=",
        "FAKE_\w+\s*=",
        "DUMMY_\w+\s*="
    )
    "Test Assertions" = @(
        "expect\(.+\)\.to",
        "assert\.",
        "should\.",
        "\.toBe\(",
        "\.toEqual\(",
        "\.toMatch\(",
        "\.toBeTruthy\(",
        "\.toBeFalsy\(",
        "\.toContain\(",
        "\.toThrow\(",
        "\.toHaveLength\("
    )
    "Test Lifecycle" = @(
        "beforeEach\(",
        "afterEach\(",
        "beforeAll\(",
        "afterAll\(",
        "setup\(\)",
        "teardown\(\)",
        "describe\(",
        "it\(",
        "test\(",
        "xit\(",
        "xdescribe\("
    )
}

# Magic values patterns (optional)
$MagicPatterns = @{
    "Magic Numbers" = @(
        "(?<![\w\.])[0-9]{3,}(?![\w\.])",  # Numbers with 3+ digits not part of identifiers
        "(?<![\w\.])3\.14159",              # Pi
        "(?<![\w\.])2\.71828",              # e
        "(?<![\w\.])42(?![\w\.])",          # The answer
        "(?<![\w\.])666(?![\w\.])",         # Devil's number
        "(?<![\w\.])1337(?![\w\.])",        # Leet
        "(?<![\w\.])9999(?![\w\.])",        # Common test max
        "(?<![\w\.])1234(?![\w\.])",        # Sequential
        "(?<![\w\.])0x[A-F0-9]{4,}"         # Hex values
    )
    "Magic Strings" = @(
        '"test\w*"',
        '"fake\w*"',
        '"mock\w*"',
        '"dummy\w*"',
        '"foo"',
        '"bar"',
        '"baz"',
        '"qux"',
        '"lorem ipsum"',
        '"asdf"',
        '"xyz"',
        '"abc"',
        '"123"',
        '"password"',
        '"admin"',
        '"user"',
        '"example\.com"'
    )
    "Test URLs" = @(
        'https?://localhost',
        'https?://127\.0\.0\.1',
        'https?://0\.0\.0\.0',
        'https?://example\.',
        'https?://test\.',
        'https?://fake\.',
        'https?://mock\.',
        'https?://dummy\.',
        'https?://.*\.test',
        'https?://.*\.local'
    )
    "Test Emails" = @(
        '\w+@example\.\w+',
        '\w+@test\.\w+',
        '\w+@fake\.\w+',
        '\w+@mock\.\w+',
        'test@\w+\.\w+',
        'fake@\w+\.\w+',
        'mock@\w+\.\w+',
        'dummy@\w+\.\w+'
    )
    "Test IDs and Keys" = @(
        '["`'']test[-_]?id["`'']',
        '["`'']fake[-_]?id["`'']',
        '["`'']mock[-_]?id["`'']',
        '["`'']dummy[-_]?id["`'']',
        '["`'']test[-_]?key["`'']',
        '["`'']api[-_]?key["`'']',
        '["`'']secret[-_]?key["`'']',
        'xxxxxxxx-xxxx',
        '00000000-0000',
        '11111111-1111',
        '12345678-\w{4}'
    )
}

# Determine which patterns to use
$patterns = $TypeScriptPatterns
if ($IncludeMagicStrings) {
    foreach ($category in $MagicPatterns.Keys) {
        $patterns[$category] = $MagicPatterns[$category]
    }
}

# Get files to scan
$extensions = switch ($Language) {
    "TypeScript" { @("*.ts", "*.tsx") }
    "JavaScript" { @("*.js", "*.jsx") }
    "CSharp" { @("*.cs") }
    "Python" { @("*.py") }
    "Java" { @("*.java") }
    default { @("*.ts", "*.tsx", "*.js", "*.jsx") }
}

$files = @()
foreach ($ext in $extensions) {
    $files += Get-ChildItem -Path $Path -Filter $ext -Recurse -File
}

# Apply filters
if ($ExcludeTestFiles) {
    $files = $files | Where-Object { 
        $_.Name -notmatch '\.(test|spec|tests|specs)\.' -and
        $_.FullName -notmatch '[\\/](test|tests|spec|specs|__tests__)[\\/]'
    }
}

if ($ExcludeNodeModules) {
    $files = $files | Where-Object { 
        $_.FullName -notmatch '[\\/]node_modules[\\/]'
    }
}

Write-Host "Scanning $($files.Count) $Language files..." -ForegroundColor Gray
Write-Host ""

$allMatches = @()
$fileCount = 0

foreach ($file in $files) {
    $fileCount++
    $content = Get-Content -Path $file.FullName -Raw
    $relativePath = Resolve-Path -Path $file.FullName -Relative
    $hasMatches = $false
    
    foreach ($category in $patterns.Keys) {
        foreach ($pattern in $patterns[$category]) {
            $matches = [regex]::Matches($content, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
            
            if ($matches.Count -gt 0) {
                $hasMatches = $true
                
                foreach ($match in $matches) {
                    $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
                    
                    $matchInfo = [PSCustomObject]@{
                        File = $relativePath
                        Category = $category
                        Pattern = $pattern
                        Match = $match.Value
                        Line = $lineNumber
                    }
                    
                    $allMatches += $matchInfo
                }
            }
        }
    }
}

# Display results
if ($allMatches.Count -eq 0) {
    Write-Host "No test doubles or fake patterns found!" -ForegroundColor Green
} else {
    Write-Host "Found $($allMatches.Count) matches across $($allMatches.File | Select-Object -Unique | Measure-Object).Count files" -ForegroundColor Yellow
    Write-Host ""
    
    # Group by category
    $categoryGroups = $allMatches | Group-Object -Property Category | Sort-Object -Property Count -Descending
    
    foreach ($categoryGroup in $categoryGroups) {
        Write-Host "[$($categoryGroup.Name)] - $($categoryGroup.Count) matches" -ForegroundColor Cyan
        
        if ($Detailed) {
            # Group by file within category
            $fileGroups = $categoryGroup.Group | Group-Object -Property File
            
            foreach ($fileGroup in $fileGroups) {
                Write-Host "  $($fileGroup.Name) - $($fileGroup.Count) matches" -ForegroundColor Yellow
                
                if ($IncludeLineNumbers) {
                    # Group by pattern within file
                    $patternGroups = $fileGroup.Group | Group-Object -Property Pattern
                    
                    foreach ($patternGroup in $patternGroups) {
                        Write-Host "    Pattern: $($patternGroup.Name)" -ForegroundColor Gray
                        
                        foreach ($match in $patternGroup.Group) {
                            Write-Host "      Line $($match.Line): $($match.Match)" -ForegroundColor DarkGray
                        }
                    }
                } else {
                    # Just show unique patterns matched
                    $uniquePatterns = $fileGroup.Group | Select-Object -Property Pattern -Unique
                    foreach ($pattern in $uniquePatterns) {
                        $matchCount = ($fileGroup.Group | Where-Object { $_.Pattern -eq $pattern.Pattern }).Count
                        Write-Host "    $matchCount matches for: $($pattern.Pattern)" -ForegroundColor Gray
                    }
                }
            }
        }
        Write-Host ""
    }
    
    # Summary statistics
    Write-Host "Summary:" -ForegroundColor Cyan
    $filesWithMatches = $allMatches | Select-Object -Property File -Unique
    Write-Host "  Files scanned: $fileCount" -ForegroundColor Gray
    Write-Host "  Files with test doubles: $($filesWithMatches.Count)" -ForegroundColor Gray
    $magicMatches = $allMatches | Where-Object { $MagicPatterns.ContainsKey($_.Category) }
    if ($magicMatches.Count -gt 0) {
        Write-Host "  Files with magic patterns: $(($magicMatches | Select-Object -Property File -Unique).Count)" -ForegroundColor Gray
    }
    Write-Host "  Total matches: $($allMatches.Count)" -ForegroundColor Gray
    Write-Host ""
    
    # Top patterns
    Write-Host "Top Pattern Types:" -ForegroundColor Cyan
    $topCategories = $categoryGroups | Select-Object -First 5
    foreach ($cat in $topCategories) {
        Write-Host "  $($cat.Name): $($cat.Count) matches" -ForegroundColor Gray
    }
    
    if (-not $Detailed) {
        Write-Host ""
        Write-Host "Use -Detailed flag for file-by-file breakdown" -ForegroundColor Gray
    }
    
    if (-not $IncludeLineNumbers -and $Detailed) {
        Write-Host "Use -IncludeLineNumbers flag for specific line references" -ForegroundColor Gray
    }
    
    if (-not $IncludeMagicStrings) {
        Write-Host "Use -IncludeMagicStrings flag to include magic values scan" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "Analysis complete!" -ForegroundColor Green

# Return matches for potential piping
return $allMatches