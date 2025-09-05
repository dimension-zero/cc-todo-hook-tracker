# Find-Exceptions.ps1
# Data-driven script to find exception usage across multiple programming languages
# and suggest Result<T> pattern conversions (excluding constructors which cannot return Result<T>)

param(
    [string]$Path = ".",
    [switch]$Verbose,
    [string[]]$ExcludePaths = @("node_modules", ".git", "dist", "build", "target", "obj", "bin"),
    [string[]]$Languages = @(),  # Empty = auto-detect, or specify: "csharp", "fsharp", "java", "javascript", "typescript", "python", "vbnet", "kotlin", "scala", "go", "rust"
    [switch]$ShowExamples
)

# Language configuration data structure
$LanguageConfig = @{
    "csharp" = @{
        Extensions = @(".cs")
        ThrowPatterns = @(
            'throw\s+new\s+\w+Exception\s*\([^)]*\)',
            'throw\s+new\s+\w+\s*\([^)]*\)',
            'throw\s+\w+;'
        )
        TryCatchPattern = 'try\s*\{[^}]*\}\s*catch'
        ConstructorPattern = 'public\s+\w+\s*\([^)]*\)\s*(?::\s*base\s*\([^)]*\))?\s*\{'
        ResultType = "Result<T>"
        OkHelper = "Result.Ok"
        ErrHelper = "Result.Fail"
        AsyncResultType = "Task<Result<T>>"
        ExampleConversion = @"
// WRONG - Throwing exceptions in methods:
public User GetUser(int id) {
    if (id <= 0) throw new ArgumentException("Invalid ID");
    return database.FindUser(id);
}

// CORRECT - Use Result<T> pattern:
public Result<User> GetUser(int id) {
    if (id <= 0) return Result.Fail<User>("Invalid ID");
    return Result.Ok(database.FindUser(id));
}

// NOTE: Constructors are EXEMPT - they can throw:
public User(string name) {
    if (string.IsNullOrEmpty(name))
        throw new ArgumentException("Name cannot be empty");
    Name = name;
}
"@
    }
    "fsharp" = @{
        Extensions = @(".fs", ".fsx")
        ThrowPatterns = @(
            'failwith\s+',
            'failwithf\s+',
            'raise\s+\(',
            'invalidArg\s+',
            'nullArg\s+'
        )
        TryCatchPattern = 'try\s+[^with]*with'
        ConstructorPattern = 'new\s*\([^)]*\)\s*='
        ResultType = "Result<'T, 'TError>"
        OkHelper = "Ok"
        ErrHelper = "Error"
        AsyncResultType = "Async<Result<'T, 'TError>>"
        ExampleConversion = @"
// WRONG - Using exceptions in functions:
let getUser id =
    if id <= 0 then failwith "Invalid ID"
    database.FindUser(id)

// CORRECT - Use Result type:
let getUser id =
    if id <= 0 then Error "Invalid ID"
    else Ok (database.FindUser(id))

// NOTE: Constructors can throw:
type User(name: string) =
    do if String.IsNullOrEmpty(name) then
        invalidArg "name" "Name cannot be empty"
    member _.Name = name
"@
    }
    "java" = @{
        Extensions = @(".java")
        ThrowPatterns = @(
            'throw\s+new\s+\w+Exception\s*\([^)]*\)',
            'throw\s+new\s+\w+\s*\([^)]*\)',
            'throw\s+\w+;'
        )
        TryCatchPattern = 'try\s*\{[^}]*\}\s*catch'
        ConstructorPattern = '(public|protected|private)?\s*\w+\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{'
        ResultType = "Result<T>"
        OkHelper = "Result.success"
        ErrHelper = "Result.failure"
        AsyncResultType = "CompletableFuture<Result<T>>"
        ExampleConversion = @"
// WRONG - Throwing exceptions in methods:
public User getUser(int id) {
    if (id <= 0) throw new IllegalArgumentException("Invalid ID");
    return database.findUser(id);
}

// CORRECT - Use Result<T> pattern:
public Result<User> getUser(int id) {
    if (id <= 0) return Result.failure("Invalid ID");
    return Result.success(database.findUser(id));
}

// NOTE: Constructors are EXEMPT - they can throw:
public User(String name) {
    if (name == null || name.isEmpty())
        throw new IllegalArgumentException("Name cannot be empty");
    this.name = name;
}
"@
    }
    "javascript" = @{
        Extensions = @(".js", ".mjs", ".cjs")
        ThrowPatterns = @(
            'throw\s+new\s+\w+\s*\([^)]*\)',
            'throw\s+\w+;',
            'throw\s+[''"][^''"]*[''"];'
        )
        TryCatchPattern = 'try\s*\{[^}]*\}\s*catch'
        ConstructorPattern = 'constructor\s*\([^)]*\)\s*\{'
        ResultType = "Result<T>"
        OkHelper = "Ok"
        ErrHelper = "Err"
        AsyncResultType = "Promise<Result<T>>"
        ExampleConversion = @"
// WRONG - Throwing exceptions in methods:
function getUser(id) {
    if (id <= 0) throw new Error('Invalid ID');
    return database.findUser(id);
}

// CORRECT - Use Result<T> pattern:
function getUser(id) {
    if (id <= 0) return Err('Invalid ID');
    return Ok(database.findUser(id));
}

// NOTE: Constructors are EXEMPT - they can throw:
class User {
    constructor(name) {
        if (!name) throw new Error('Name cannot be empty');
        this.name = name;
    }
}
"@
    }
    "typescript" = @{
        Extensions = @(".ts", ".tsx")
        ThrowPatterns = @(
            'throw\s+new\s+\w+\s*\([^)]*\)',
            'throw\s+\w+;',
            'throw\s+[''"][^''"]*[''"];'
        )
        TryCatchPattern = 'try\s*\{[^}]*\}\s*catch'
        ConstructorPattern = 'constructor\s*\([^)]*\)\s*\{'
        ResultType = "Result<T, E>"
        OkHelper = "Ok"
        ErrHelper = "Err"
        AsyncResultType = "Promise<Result<T, E>>"
        ExampleConversion = @"
// WRONG - Throwing exceptions in methods:
function getUser(id: number): User {
    if (id <= 0) throw new Error('Invalid ID');
    return database.findUser(id);
}

// CORRECT - Use Result<T> pattern:
function getUser(id: number): Result<User, string> {
    if (id <= 0) return Err('Invalid ID');
    return Ok(database.findUser(id));
}

// NOTE: Constructors are EXEMPT - they can throw:
class User {
    constructor(private name: string) {
        if (!name) throw new Error('Name cannot be empty');
    }
}
"@
    }
    "python" = @{
        Extensions = @(".py", ".pyx")
        ThrowPatterns = @(
            'raise\s+\w+Exception\s*\([^)]*\)',
            'raise\s+\w+\s*\([^)]*\)',
            'raise\s+\w+$'
        )
        TryCatchPattern = 'try\s*:[^e]*except'
        ConstructorPattern = 'def\s+__init__\s*\([^)]*\)\s*:'
        ResultType = "Result[T, E]"
        OkHelper = "Ok"
        ErrHelper = "Err"
        AsyncResultType = "Awaitable[Result[T, E]]"
        ExampleConversion = @"
# WRONG - Raising exceptions in methods:
def get_user(id: int) -> User:
    if id <= 0:
        raise ValueError("Invalid ID")
    return database.find_user(id)

# CORRECT - Use Result[T, E] pattern:
def get_user(id: int) -> Result[User, str]:
    if id <= 0:
        return Err("Invalid ID")
    return Ok(database.find_user(id))

# NOTE: Constructors (__init__) are EXEMPT - they can raise:
class User:
    def __init__(self, name: str):
        if not name:
            raise ValueError("Name cannot be empty")
        self.name = name
"@
    }
    "vbnet" = @{
        Extensions = @(".vb")
        ThrowPatterns = @(
            'Throw\s+New\s+\w+Exception\s*\([^)]*\)',
            'Throw\s+New\s+\w+\s*\([^)]*\)',
            'Throw\s+\w+'
        )
        TryCatchPattern = 'Try\s+[^C]*Catch'
        ConstructorPattern = 'Public\s+Sub\s+New\s*\([^)]*\)'
        ResultType = "Result(Of T)"
        OkHelper = "Result.Success"
        ErrHelper = "Result.Failure"
        AsyncResultType = "Task(Of Result(Of T))"
        ExampleConversion = @"
' WRONG - Throwing exceptions in methods:
Public Function GetUser(id As Integer) As User
    If id <= 0 Then Throw New ArgumentException("Invalid ID")
    Return database.FindUser(id)
End Function

' CORRECT - Use Result(Of T) pattern:
Public Function GetUser(id As Integer) As Result(Of User)
    If id <= 0 Then Return Result.Failure(Of User)("Invalid ID")
    Return Result.Success(database.FindUser(id))
End Function

' NOTE: Constructors are EXEMPT - they can throw:
Public Sub New(name As String)
    If String.IsNullOrEmpty(name) Then
        Throw New ArgumentException("Name cannot be empty")
    End If
    Me.Name = name
End Sub
"@
    }
    "kotlin" = @{
        Extensions = @(".kt", ".kts")
        ThrowPatterns = @(
            'throw\s+\w+Exception\s*\([^)]*\)',
            'throw\s+\w+\s*\([^)]*\)',
            'error\s*\([^)]*\)'
        )
        TryCatchPattern = 'try\s*\{[^}]*\}\s*catch'
        ConstructorPattern = '(constructor|init)\s*\([^)]*\)\s*\{'
        ResultType = "Result<T>"
        OkHelper = "Result.success"
        ErrHelper = "Result.failure"
        AsyncResultType = "suspend () -> Result<T>"
        ExampleConversion = @"
// WRONG - Throwing exceptions in functions:
fun getUser(id: Int): User {
    if (id <= 0) throw IllegalArgumentException("Invalid ID")
    return database.findUser(id)
}

// CORRECT - Use Result<T> pattern:
fun getUser(id: Int): Result<User> {
    if (id <= 0) return Result.failure(IllegalArgumentException("Invalid ID"))
    return Result.success(database.findUser(id))
}

// NOTE: Constructors/init blocks are EXEMPT - they can throw:
class User(name: String) {
    init {
        require(name.isNotEmpty()) { "Name cannot be empty" }
    }
}
"@
    }
    "scala" = @{
        Extensions = @(".scala")
        ThrowPatterns = @(
            'throw\s+new\s+\w+Exception\s*\([^)]*\)',
            'throw\s+new\s+\w+\s*\([^)]*\)',
            'sys\.error\s*\([^)]*\)'
        )
        TryCatchPattern = 'try\s*\{[^}]*\}\s*catch'
        ConstructorPattern = 'def\s+this\s*\([^)]*\)\s*='
        ResultType = "Either[Error, T]"
        OkHelper = "Right"
        ErrHelper = "Left"
        AsyncResultType = "Future[Either[Error, T]]"
        ExampleConversion = @"
// WRONG - Throwing exceptions in methods:
def getUser(id: Int): User = {
    if (id <= 0) throw new IllegalArgumentException("Invalid ID")
    database.findUser(id)
}

// CORRECT - Use Either pattern:
def getUser(id: Int): Either[String, User] = {
    if (id <= 0) Left("Invalid ID")
    else Right(database.findUser(id))
}

// NOTE: Constructors are EXEMPT - they can throw:
class User(name: String) {
    require(name.nonEmpty, "Name cannot be empty")
}
"@
    }
    "go" = @{
        Extensions = @(".go")
        ThrowPatterns = @(
            'panic\s*\([^)]*\)'
        )
        TryCatchPattern = 'defer\s+func\s*\(\)\s*\{[^}]*recover\s*\(\)'
        ConstructorPattern = 'func\s+New\w+\s*\([^)]*\)\s*(?:\*?\w+|\([^)]*\))'
        ResultType = "(T, error)"
        OkHelper = "return value, nil"
        ErrHelper = "return nil, error"
        AsyncResultType = "chan Result"
        ExampleConversion = @"
// WRONG - Using panic in functions:
func GetUser(id int) User {
    if id <= 0 {
        panic("Invalid ID")
    }
    return database.FindUser(id)
}

// CORRECT - Use Go's error pattern:
func GetUser(id int) (User, error) {
    if id <= 0 {
        return User{}, errors.New("Invalid ID")
    }
    return database.FindUser(id), nil
}

// NOTE: Constructor-like functions typically return errors:
func NewUser(name string) (*User, error) {
    if name == "" {
        return nil, errors.New("name cannot be empty")
    }
    return &User{Name: name}, nil
}
"@
    }
    "rust" = @{
        Extensions = @(".rs")
        ThrowPatterns = @(
            'panic!\s*\([^)]*\)',
            'unwrap\s*\(\)',
            'expect\s*\([^)]*\)'
        )
        TryCatchPattern = 'match\s+.*\s*\{\s*Ok\s*\(.*\)\s*=>'
        ConstructorPattern = 'impl\s+\w+\s*\{[^}]*fn\s+new\s*\([^)]*\)'
        ResultType = "Result<T, E>"
        OkHelper = "Ok"
        ErrHelper = "Err"
        AsyncResultType = "async fn() -> Result<T, E>"
        ExampleConversion = @"
// WRONG - Using panic in functions:
fn get_user(id: i32) -> User {
    if id <= 0 {
        panic!("Invalid ID");
    }
    database.find_user(id)
}

// CORRECT - Use Result<T, E> pattern:
fn get_user(id: i32) -> Result<User, String> {
    if id <= 0 {
        return Err("Invalid ID".to_string());
    }
    Ok(database.find_user(id))
}

// NOTE: Constructors typically return Result:
impl User {
    fn new(name: String) -> Result<Self, String> {
        if name.is_empty() {
            return Err("Name cannot be empty".to_string());
        }
        Ok(User { name })
    }
}
"@
    }
}

# Helper function to detect language from file extension
function Get-LanguageFromExtension($extension) {
    foreach ($lang in $LanguageConfig.Keys) {
        if ($LanguageConfig[$lang].Extensions -contains $extension.ToLower()) {
            return $lang
        }
    }
    return $null
}

# Helper function to check if we're in a constructor context
function Test-InConstructor($content, $throwIndex, $constructorPattern) {
    if (-not $constructorPattern) { return $false }
    
    # Look backwards from the throw statement to find the nearest function/method definition
    $beforeThrow = $content.Substring(0, $throwIndex)
    $constructorMatches = [regex]::Matches($beforeThrow, $constructorPattern, 'Multiline')
    
    if ($constructorMatches.Count -eq 0) { return $false }
    
    # Get the last (nearest) constructor before the throw
    $nearestConstructor = $constructorMatches[$constructorMatches.Count - 1]
    
    # Rough check: count braces to see if we're still inside that constructor
    $betweenText = $content.Substring($nearestConstructor.Index, $throwIndex - $nearestConstructor.Index)
    $openBraces = ($betweenText.ToCharArray() | Where-Object { $_ -eq '{' }).Count
    $closeBraces = ($betweenText.ToCharArray() | Where-Object { $_ -eq '}' }).Count
    
    # If we have more open braces than close braces, we're likely still in the constructor
    return ($openBraces -gt $closeBraces)
}

# Helper function to get all files for specified languages
function Get-FilesForLanguages($path, $languages) {
    $allFiles = @()
    
    if ($languages.Count -eq 0) {
        # Auto-detect: get all supported extensions
        $extensions = @()
        foreach ($config in $LanguageConfig.Values) {
            $extensions += $config.Extensions
        }
        $extensions = $extensions | Sort-Object -Unique
    } else {
        # Get extensions for specified languages only
        $extensions = @()
        foreach ($lang in $languages) {
            if ($LanguageConfig.ContainsKey($lang.ToLower())) {
                $extensions += $LanguageConfig[$lang.ToLower()].Extensions
            }
        }
    }
    
    foreach ($ext in $extensions) {
        $pattern = "*$ext"
        $files = Get-ChildItem -Path $path -Filter $pattern -Recurse -ErrorAction SilentlyContinue | Where-Object {
            $relativePath = $_.FullName -replace [regex]::Escape((Get-Location).Path + "\"), ""
            $shouldExclude = $false
            foreach ($excludePath in $ExcludePaths) {
                if ($relativePath -like "*$excludePath*") {
                    $shouldExclude = $true
                    break
                }
            }
            return -not $shouldExclude
        }
        $allFiles += $files
    }
    
    return $allFiles
}

# Show examples if requested
if ($ShowExamples) {
    Write-Host "=== RESULT<T> CONVERSION EXAMPLES ===" -ForegroundColor Cyan
    Write-Host "Note: Constructors are EXEMPT from Result<T> conversion as they cannot return values" -ForegroundColor Yellow
    Write-Host ""
    
    foreach ($lang in $LanguageConfig.Keys | Sort-Object) {
        $config = $LanguageConfig[$lang]
        Write-Host "[$($lang.ToUpper())] Result<T> Pattern:" -ForegroundColor Yellow
        Write-Host "Extensions: $($config.Extensions -join ', ')" -ForegroundColor Gray
        Write-Host "Result Type: $($config.ResultType)" -ForegroundColor Gray
        Write-Host "Success Helper: $($config.OkHelper)" -ForegroundColor Green
        Write-Host "Error Helper: $($config.ErrHelper)" -ForegroundColor Red
        Write-Host "Async Result Type: $($config.AsyncResultType)" -ForegroundColor Gray
        Write-Host ""
        Write-Host $config.ExampleConversion -ForegroundColor White
        Write-Host ""
        Write-Host "------------------------" -ForegroundColor DarkGray
        Write-Host ""
    }
    return
}

Write-Host "Scanning for exceptions in multiple programming languages..." -ForegroundColor Cyan
Write-Host "Path: $Path" -ForegroundColor Gray
if ($Languages.Count -gt 0) {
    Write-Host "Languages: $($Languages -join ', ')" -ForegroundColor Gray
} else {
    Write-Host "Languages: Auto-detect all supported" -ForegroundColor Gray
}
Write-Host ""

$totalFiles = 0
$languageStats = @{}
$overallStats = @{
    FilesWithExceptions = 0
    ThrowStatements = 0
    ThrowInConstructors = 0
    TryCatchBlocks = 0
}

# Get all files for analysis
$allFiles = Get-FilesForLanguages $Path $Languages

foreach ($file in $allFiles) {
    $totalFiles++
    $relativePath = $file.FullName -replace [regex]::Escape((Get-Location).Path + "\"), ""
    
    try {
        $content = Get-Content -Path $file.FullName -Raw
    } catch {
        Write-Host "Warning: Could not read $relativePath" -ForegroundColor Yellow
        continue
    }
    
    $hasExceptions = $false
    
    # Detect language from extension
    $language = Get-LanguageFromExtension $file.Extension
    if (-not $language) { continue }
    
    $config = $LanguageConfig[$language]
    
    # Initialize language stats if needed
    if (-not $languageStats.ContainsKey($language)) {
        $languageStats[$language] = @{
            Files = 0
            FilesWithExceptions = 0
            ThrowStatements = 0
            ThrowInConstructors = 0
            TryCatchBlocks = 0
        }
    }
    $languageStats[$language].Files++
    
    # Find throw statements using language-specific patterns
    $throwCount = 0
    $constructorThrowCount = 0
    foreach ($pattern in $config.ThrowPatterns) {
        $throwMatches = [regex]::Matches($content, $pattern, 'IgnoreCase')
        if ($throwMatches.Count -gt 0) {
            if (-not $hasExceptions) {
                Write-Host "[FILE] $relativePath [$($language.ToUpper())]" -ForegroundColor Yellow
                $hasExceptions = $true
                $languageStats[$language].FilesWithExceptions++
                $overallStats.FilesWithExceptions++
            }
            
            foreach ($match in $throwMatches) {
                $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
                $inConstructor = Test-InConstructor $content $match.Index $config.ConstructorPattern
                
                if ($inConstructor) {
                    $constructorThrowCount++
                    $languageStats[$language].ThrowInConstructors++
                    $overallStats.ThrowInConstructors++
                    Write-Host "  ✓ Line ${lineNumber}: $($match.Value.Trim()) [IN CONSTRUCTOR - OK]" -ForegroundColor Green
                    Write-Host "     -> Constructors can throw exceptions - no conversion needed" -ForegroundColor Gray
                } else {
                    $throwCount++
                    $languageStats[$language].ThrowStatements++
                    $overallStats.ThrowStatements++
                    Write-Host "  X Line ${lineNumber}: $($match.Value.Trim())" -ForegroundColor Red
                    Write-Host "     -> Convert to $($config.ResultType) pattern using $($config.ErrHelper)()" -ForegroundColor Gray
                }
            }
        }
    }
    
    # Find try-catch blocks using language-specific patterns
    $tryCatchMatches = [regex]::Matches($content, $config.TryCatchPattern, 'IgnoreCase,Singleline')
    if ($tryCatchMatches.Count -gt 0) {
        if (-not $hasExceptions) {
            Write-Host "[FILE] $relativePath [$($language.ToUpper())]" -ForegroundColor Yellow
            $hasExceptions = $true
            $languageStats[$language].FilesWithExceptions++
            $overallStats.FilesWithExceptions++
        }
        
        foreach ($match in $tryCatchMatches) {
            $languageStats[$language].TryCatchBlocks++
            $overallStats.TryCatchBlocks++
            $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
            Write-Host "  ! Line ${lineNumber}: try-catch block found" -ForegroundColor DarkYellow
            Write-Host "     -> Review: If wrapping 3rd party code = OK, if handling our exceptions = convert to $($config.ResultType)" -ForegroundColor Gray
        }
    }
    
    if ($hasExceptions -and $Verbose) {
        Write-Host ""
    }
}

Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "Total files scanned: $totalFiles" -ForegroundColor White
Write-Host "Files with exceptions: $($overallStats.FilesWithExceptions)" -ForegroundColor Yellow
Write-Host "Total throw statements: $($overallStats.ThrowStatements)" -ForegroundColor Red
Write-Host "Throws in constructors (OK): $($overallStats.ThrowInConstructors)" -ForegroundColor Green
Write-Host "Total try-catch blocks: $($overallStats.TryCatchBlocks)" -ForegroundColor DarkYellow

Write-Host ""
Write-Host "=== BY LANGUAGE ===" -ForegroundColor Cyan
foreach ($lang in $languageStats.Keys | Sort-Object) {
    $stats = $languageStats[$lang]
    $config = $LanguageConfig[$lang]
    Write-Host "[$($lang.ToUpper())]" -ForegroundColor Yellow
    Write-Host "  Files: $($stats.Files) | With exceptions: $($stats.FilesWithExceptions)" -ForegroundColor White
    Write-Host "  Throws: $($stats.ThrowStatements) | In constructors (OK): $($stats.ThrowInConstructors) | Try-catch: $($stats.TryCatchBlocks)" -ForegroundColor White
    Write-Host "  Result type: $($config.ResultType)" -ForegroundColor Gray
    Write-Host "  Helpers: $($config.OkHelper)() / $($config.ErrHelper)()" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== RECOMMENDATIONS ===" -ForegroundColor Green
Write-Host "1. Replace exception throwing with Result<T> pattern for better error handling"
Write-Host "2. Functions that can fail should return Result<T> or equivalent async version"
Write-Host "3. Keep try-catch only for 3rd party library exception handling"
Write-Host "4. Use language-appropriate Ok/Success and Err/Fail helpers consistently"
Write-Host "5. CONSTRUCTORS ARE EXEMPT - they can throw exceptions as they cannot return Result<T>"
Write-Host "6. Consider using monadic bind operations for chaining Result operations"
Write-Host ""
Write-Host "Use -ShowExamples to see language-specific conversion examples" -ForegroundColor Cyan

Write-Host ""
Write-Host "Supported languages: $(($LanguageConfig.Keys | Sort-Object | ForEach-Object { $_.ToUpper() }) -join ', ')" -ForegroundColor DarkGray