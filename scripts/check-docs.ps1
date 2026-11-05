[CmdletBinding()]
param(
    [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

# Checks what a reader cannot easily verify by eye: local links resolve,
# record headers are well formed, open slices appear in the roadmap with the
# same status, legacy task/acceptance pairs agree, and accepted records have
# no unchecked boxes. It does not judge whether a document is true.

$ErrorActionPreference = "Stop"

$root = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$errors = [System.Collections.Generic.List[string]]::new()

function Get-RelativePath {
    param([string]$Path)
    return [System.IO.Path]::GetRelativePath($root, $Path).Replace("\", "/")
}

# --- Local Markdown links --------------------------------------------------

$markdownFiles = @(
    foreach ($relativePath in @(
        "AGENTS.md",
        "README.md",
        "README.zh-CN.md",
        "deploy/README.md",
        ".github/PULL_REQUEST_TEMPLATE.md"
    )) {
        $absolutePath = Join-Path $root $relativePath
        if (Test-Path -LiteralPath $absolutePath -PathType Leaf) {
            Get-Item -LiteralPath $absolutePath
        }
    }
    Get-ChildItem -LiteralPath (Join-Path $root "docs") -Filter "*.md" -File -Recurse
)

$linkPattern = [regex]'\[[^\]]*\]\((?<target>[^)]+)\)'

foreach ($file in $markdownFiles) {
    $content = Get-Content -LiteralPath $file.FullName -Raw
    foreach ($match in $linkPattern.Matches($content)) {
        $target = $match.Groups["target"].Value.Trim().Trim("<", ">")
        if ($target.StartsWith("#") -or $target -match '^[a-zA-Z][a-zA-Z0-9+.-]*:') {
            continue
        }
        $pathPart = ($target -split "#", 2)[0]
        if ([string]::IsNullOrWhiteSpace($pathPart)) {
            continue
        }
        $resolved = Join-Path $file.DirectoryName ([System.Uri]::UnescapeDataString($pathPart))
        if (-not (Test-Path -LiteralPath $resolved)) {
            $errors.Add("$(Get-RelativePath $file.FullName) has a broken link: $target")
        }
    }
}

# --- Record headers --------------------------------------------------------

$deliveryStatuses = @("Planned", "In progress", "Implemented", "Accepted", "Deferred", "Superseded")
$closedStatuses = @("Accepted", "Superseded")

$recordSets = @(
    @{ Directory = "docs/TASKS"; Kind = "task"; Statuses = $deliveryStatuses },
    @{ Directory = "docs/ACCEPTANCE"; Kind = "acceptance"; Statuses = $deliveryStatuses },
    @{ Directory = "docs/SPECS"; Kind = "spec"; Statuses = @("Draft", "Active", "Superseded") },
    @{ Directory = "docs/DEBUGGING"; Kind = "incident"; Statuses = @("Investigating", "Resolved", "Superseded") }
)

function Get-HeaderField {
    param([string]$Header, [string]$Name)
    $match = [regex]::Match($Header, "(?m)^$([regex]::Escape($Name)):\s*(?<value>.+?)\s*$")
    if ($match.Success) { return $match.Groups["value"].Value.Trim() }
    return $null
}

function Get-BacktickedPaths {
    param([string]$Value, [string]$Field, [string]$Record)
    $paths = @()
    if ([string]::IsNullOrWhiteSpace($Value) -or $Value -eq "None") {
        return $paths
    }
    foreach ($match in [regex]::Matches($Value, '`(?<path>[^`]+)`')) {
        $path = $match.Groups["path"].Value.Replace("\", "/")
        if ([System.IO.Path]::IsPathRooted($path) -or $path -match '(^|/)\.\.(/|$)') {
            $errors.Add("$Record has an unsafe $Field path: $path")
            continue
        }
        if (-not (Test-Path -LiteralPath (Join-Path $root $path) -PathType Leaf)) {
            $errors.Add("$Record has a missing $Field path: $path")
        }
        $paths += $path
    }
    if ($paths.Count -eq 0) {
        $errors.Add("$Record $Field metadata has no backticked path.")
    }
    return $paths
}

$records = @{}

foreach ($set in $recordSets) {
    $directory = Join-Path $root $set.Directory
    if (-not (Test-Path -LiteralPath $directory)) { continue }

    foreach ($file in Get-ChildItem -LiteralPath $directory -Filter "*.md" -File) {
        $path = Get-RelativePath $file.FullName
        $content = Get-Content -LiteralPath $file.FullName -Raw
        $header = (Get-Content -LiteralPath $file.FullName -TotalCount 12) -join "`n"

        if ($header -notmatch '(?m)^#\s+\S') {
            $errors.Add("$path is missing a level-one title.")
        }

        $status = Get-HeaderField $header "Status"
        if ($null -eq $status) {
            $errors.Add("$path is missing Status.")
        }
        elseif ($set.Statuses -notcontains $status) {
            $errors.Add("$path has Status '$status'. Allowed: $($set.Statuses -join ', ')")
        }

        $lastUpdated = Get-HeaderField $header "Last updated"
        $parsed = [datetime]::MinValue
        if (-not [datetime]::TryParseExact(
            $lastUpdated, "yyyy-MM-dd",
            [System.Globalization.CultureInfo]::InvariantCulture,
            [System.Globalization.DateTimeStyles]::None, [ref]$parsed
        )) {
            $errors.Add("$path has a missing or invalid 'Last updated' date.")
        }

        $null = Get-BacktickedPaths (Get-HeaderField $header "Related") "Related" $path
        $pairPaths = @(Get-BacktickedPaths (Get-HeaderField $header "Pair") "Pair" $path)

        # Legacy acceptance records repeat the status in two more places.
        $decision = Get-HeaderField $header "Decision"
        if ($null -ne $decision -and $decision -ne $status) {
            $errors.Add("$path Decision '$decision' does not match Status '$status'.")
        }
        $currentDecision = [regex]::Match($content, '(?m)^Current decision:\s*`(?<value>[^`]+)`')
        if ($currentDecision.Success -and $currentDecision.Groups["value"].Value.Trim() -ne $status) {
            $errors.Add("$path 'Current decision' does not match Status '$status'.")
        }

        $records[$path] = [pscustomobject]@{
            Path = $path
            Kind = $set.Kind
            Status = $status
            PairPaths = $pairPaths
            Content = $content
        }
    }
}

# --- Delivery records against the roadmap ----------------------------------

$roadmapRows = @(
    (Get-Content -LiteralPath (Join-Path $root "docs/ROADMAP.md")) |
        Where-Object { $_ -match '^\|' }
)

foreach ($record in $records.Values | Where-Object { $_.Kind -in @("task", "acceptance") }) {
    $docsRelative = $record.Path -replace '^docs/', ''
    $rows = @($roadmapRows | Where-Object {
        $_.Contains("($docsRelative)") -or $_.Contains("($($record.Path))")
    })

    if ($closedStatuses -notcontains $record.Status -and $rows.Count -eq 0) {
        $errors.Add("Open record has no ROADMAP row: $($record.Path) ($($record.Status))")
    }
    foreach ($row in $rows) {
        if ($row -notmatch "\|\s*$([regex]::Escape($record.Status))\s*\|") {
            $errors.Add("ROADMAP row status differs from $($record.Path) Status '$($record.Status)'.")
        }
    }

    if ($record.Status -eq "Accepted" -and $record.Content -match '(?m)^\s*-\s+\[ \]') {
        $errors.Add("Accepted record still has unchecked boxes: $($record.Path)")
    }

    foreach ($pairPath in $record.PairPaths) {
        $paired = $records[$pairPath]
        if ($null -eq $paired) {
            $errors.Add("$($record.Path) pairs with a non-record: $pairPath")
            continue
        }
        if ($paired.PairPaths -notcontains $record.Path) {
            $errors.Add("One-sided pair: $($record.Path) names $pairPath, which does not name it back.")
        }
        if ($paired.Status -ne $record.Status) {
            $errors.Add("Paired statuses differ: $($record.Path)=$($record.Status), $pairPath=$($paired.Status)")
        }
    }
}

if ($errors.Count -gt 0) {
    foreach ($message in $errors) {
        Write-Error $message -ErrorAction Continue
    }
    exit 1
}

Write-Host ("Documentation checks passed: {0} Markdown files, {1} records." -f $markdownFiles.Count, $records.Count)
