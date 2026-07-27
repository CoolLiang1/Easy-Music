[CmdletBinding()]
param(
    [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$errors = [System.Collections.Generic.List[string]]::new()

$requiredFiles = @(
    "AGENTS.md",
    "README.md",
    "README.zh-CN.md",
    "docs/README.md",
    "docs/ROADMAP.md",
    "docs/PRD.md",
    "docs/ARCHITECTURE.md",
    "docs/DEVELOPMENT.md",
    "docs/DEPLOYMENT.md",
    "docs/ENVIRONMENT.md",
    "docs/TEMPLATES/TASK_TEMPLATE.md",
    "docs/TEMPLATES/ACCEPTANCE_TEMPLATE.md",
    "docs/TEMPLATES/SPEC_TEMPLATE.md",
    "docs/TEMPLATES/INCIDENT_TEMPLATE.md",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/workflows/documentation-check.yml",
    "deploy/README.md"
)

foreach ($relativePath in $requiredFiles) {
    $absolutePath = Join-Path $root $relativePath
    if (-not (Test-Path -LiteralPath $absolutePath -PathType Leaf)) {
        $errors.Add("Missing required documentation file: $relativePath")
    }
}

$markdownFiles = @(
    Get-Item -LiteralPath (Join-Path $root "AGENTS.md")
    Get-Item -LiteralPath (Join-Path $root "README.md")
    Get-Item -LiteralPath (Join-Path $root "README.zh-CN.md")
    Get-Item -LiteralPath (Join-Path $root "deploy/README.md")
    Get-Item -LiteralPath (Join-Path $root ".github/PULL_REQUEST_TEMPLATE.md")
    Get-ChildItem -LiteralPath (Join-Path $root "docs") -Filter "*.md" -File -Recurse
)

$linkPattern = [regex]'\[[^\]]*\]\((?<target>[^)]+)\)'

foreach ($file in $markdownFiles) {
    $content = Get-Content -LiteralPath $file.FullName -Raw
    foreach ($match in $linkPattern.Matches($content)) {
        $target = $match.Groups["target"].Value.Trim()
        if (
            $target.StartsWith("#") -or
            $target -match '^(?i:https?|mailto):' -or
            $target -match '^[a-zA-Z][a-zA-Z0-9+.-]*://'
        ) {
            continue
        }

        $target = $target.Trim("<", ">")
        $pathPart = ($target -split "#", 2)[0]
        if ([string]::IsNullOrWhiteSpace($pathPart)) {
            continue
        }

        $decodedPath = [System.Uri]::UnescapeDataString($pathPart)
        $resolvedTarget = Join-Path $file.DirectoryName $decodedPath
        if (-not (Test-Path -LiteralPath $resolvedTarget)) {
            $relativeFile = [System.IO.Path]::GetRelativePath($root, $file.FullName)
            $errors.Add("$relativeFile has a broken local link: $target")
        }
    }
}

function Get-StatusDate {
    param([string]$RelativePath)

    $content = Get-Content -LiteralPath (Join-Path $root $RelativePath) -Raw
    $match = [regex]::Match(
        $content,
        '<!--\s*status-snapshot:\s*(\d{4}-\d{2}-\d{2})\s*-->'
    )
    if (-not $match.Success) {
        $errors.Add("$RelativePath is missing a status-snapshot marker.")
        return $null
    }
    return $match.Groups[1].Value
}

$roadmapDate = Get-StatusDate "docs/ROADMAP.md"
$readmeDate = Get-StatusDate "README.md"
$readmeZhDate = Get-StatusDate "README.zh-CN.md"

if (
    $null -ne $roadmapDate -and
    ($roadmapDate -ne $readmeDate -or $roadmapDate -ne $readmeZhDate)
) {
    $errors.Add(
        "Status snapshot dates differ: ROADMAP=$roadmapDate, " +
        "README=$readmeDate, README.zh-CN=$readmeZhDate"
    )
}

$agentsContent = Get-Content -LiteralPath (Join-Path $root "AGENTS.md") -Raw
if ($agentsContent -notmatch '## Documentation Completion Gate') {
    $errors.Add("AGENTS.md is missing the mandatory Documentation Completion Gate.")
}

$documentationGuide = Get-Content -LiteralPath (
    Join-Path $root "docs/README.md"
) -Raw
if ($documentationGuide -notmatch 'One Fact, One Owner') {
    $errors.Add("docs/README.md is missing the One Fact, One Owner rule.")
}

$roadmapContent = Get-Content -LiteralPath (Join-Path $root "docs/ROADMAP.md") -Raw

$currentStatusSection = [regex]::Match(
    $roadmapContent,
    '(?ms)^## Current Status\s*\r?\n(?<body>.*?)(?=^##\s|\z)'
)
if (-not $currentStatusSection.Success) {
    $errors.Add("docs/ROADMAP.md is missing the Current Status section.")
}
else {
    $roadmapStatusParts = [System.Collections.Generic.List[string]]::new()
    $deliveryStatusPattern = (
        "Planned|In progress|Implemented|Accepted|Deferred|Superseded"
    )
    foreach ($line in $currentStatusSection.Groups["body"].Value -split "`r?`n") {
        $row = [regex]::Match(
            $line,
            "^\|\s*(?<initiative>[^|]+?)\s*\|\s*" +
            "(?<status>${deliveryStatusPattern})\s*\|"
        )
        if ($row.Success) {
            $initiative = $row.Groups["initiative"].Value.Trim()
            $status = $row.Groups["status"].Value.Trim()
            $roadmapStatusParts.Add("${initiative}=${status}")
        }
    }

    if ($roadmapStatusParts.Count -eq 0) {
        $errors.Add("docs/ROADMAP.md Current Status table has no status rows.")
    }
    else {
        $expectedRoadmapSignature = $roadmapStatusParts -join "; "
        foreach ($readmePath in @("README.md", "README.zh-CN.md")) {
            $readmeContent = Get-Content -LiteralPath (
                Join-Path $root $readmePath
            ) -Raw
            $signatureMatch = [regex]::Match(
                $readmeContent,
                '<!--\s*roadmap-statuses:\s*(?<value>.*?)\s*-->'
            )
            if (-not $signatureMatch.Success) {
                $errors.Add("$readmePath is missing a roadmap-statuses marker.")
                continue
            }

            $actualSignature = $signatureMatch.Groups["value"].Value.Trim()
            if ($actualSignature -ne $expectedRoadmapSignature) {
                $errors.Add(
                    "$readmePath roadmap-statuses marker differs from " +
                    "docs/ROADMAP.md Current Status."
                )
            }
        }
    }
}

function Get-HeaderField {
    param(
        [string]$Header,
        [string]$Name
    )

    $escapedName = [regex]::Escape($Name)
    $match = [regex]::Match(
        $Header,
        "(?m)^${escapedName}:\s*(?<value>.+?)\s*$"
    )
    if (-not $match.Success) {
        return $null
    }
    return $match.Groups["value"].Value.Trim()
}

$controlledSets = @(
    [pscustomobject]@{
        Directory = "docs/TASKS"
        Role = "task"
        Statuses = @(
            "Planned",
            "In progress",
            "Implemented",
            "Accepted",
            "Deferred",
            "Superseded"
        )
    },
    [pscustomobject]@{
        Directory = "docs/ACCEPTANCE"
        Role = "acceptance"
        Statuses = @(
            "Planned",
            "In progress",
            "Implemented",
            "Accepted",
            "Deferred",
            "Superseded"
        )
    },
    [pscustomobject]@{
        Directory = "docs/SPECS"
        Role = "specification"
        Statuses = @("Draft", "Active", "Superseded")
    },
    [pscustomobject]@{
        Directory = "docs/DEBUGGING"
        Role = "incident"
        Statuses = @("Investigating", "Resolved", "Superseded")
    }
)

$controlledRecordCount = 0
$controlledRecords = @()
$openDeliveryStatuses = @("Planned", "In progress", "Implemented", "Deferred")

foreach ($set in $controlledSets) {
    $directoryPath = Join-Path $root $set.Directory
    $recordFiles = Get-ChildItem -LiteralPath $directoryPath `
        -Filter "*.md" -File

    foreach ($recordFile in $recordFiles) {
        $controlledRecordCount++
        $header = (
            Get-Content -LiteralPath $recordFile.FullName -TotalCount 12
        ) -join "`n"
        $content = Get-Content -LiteralPath $recordFile.FullName -Raw
        $rootRelativeRecord = [System.IO.Path]::GetRelativePath(
            $root,
            $recordFile.FullName
        ).Replace("\", "/")

        if ($header -notmatch '(?m)^#\s+\S') {
            $errors.Add("$rootRelativeRecord is missing a level-one title.")
        }

        $status = Get-HeaderField -Header $header -Name "Status"
        $lastUpdated = Get-HeaderField -Header $header -Name "Last updated"
        $role = Get-HeaderField -Header $header -Name "Canonical role"
        $related = Get-HeaderField -Header $header -Name "Related"
        $pair = Get-HeaderField -Header $header -Name "Pair"
        $decision = Get-HeaderField -Header $header -Name "Decision"

        if ([string]::IsNullOrWhiteSpace($status)) {
            $errors.Add("$rootRelativeRecord is missing Status metadata.")
        }
        elseif ($set.Statuses -notcontains $status) {
            $allowedStatuses = $set.Statuses -join ", "
            $errors.Add(
                "$rootRelativeRecord has invalid Status '$status'. " +
                "Allowed: $allowedStatuses"
            )
        }

        $parsedLastUpdated = [datetime]::MinValue
        $validLastUpdated = [datetime]::TryParseExact(
            $lastUpdated,
            "yyyy-MM-dd",
            [System.Globalization.CultureInfo]::InvariantCulture,
            [System.Globalization.DateTimeStyles]::None,
            [ref]$parsedLastUpdated
        )
        if (-not $validLastUpdated) {
            $errors.Add(
                "$rootRelativeRecord has missing or invalid Last updated metadata."
            )
        }

        if ($role -ne $set.Role) {
            $errors.Add(
                "$rootRelativeRecord has Canonical role '$role'; " +
                "expected '$($set.Role)'."
            )
        }

        $relatedPaths = @()
        if ([string]::IsNullOrWhiteSpace($related)) {
            $errors.Add("$rootRelativeRecord is missing Related metadata.")
        }
        elseif ($related -ne "None") {
            $relatedMatches = [regex]::Matches(
                $related,
                '`(?<path>[^`]+)`'
            )
            if ($relatedMatches.Count -eq 0) {
                $errors.Add(
                    "$rootRelativeRecord Related metadata has no backticked path."
                )
            }
            foreach ($relatedMatch in $relatedMatches) {
                $relatedPath = $relatedMatch.Groups["path"].Value.Replace("\", "/")
                $relatedPaths += $relatedPath
                if (
                    [System.IO.Path]::IsPathRooted($relatedPath) -or
                    $relatedPath -match '(^|[\\/])\.\.([\\/]|$)'
                ) {
                    $errors.Add(
                        "$rootRelativeRecord has an unsafe Related path: " +
                        $relatedPath
                    )
                    continue
                }
                $relatedTarget = Join-Path $root $relatedPath
                if (-not (Test-Path -LiteralPath $relatedTarget -PathType Leaf)) {
                    $errors.Add(
                        "$rootRelativeRecord has a missing Related path: " +
                        $relatedPath
                    )
                }
            }
        }

        $isDeliveryRecord = $set.Role -in @("task", "acceptance")
        $isOpenDeliveryRecord = (
            $isDeliveryRecord -and
            $openDeliveryStatuses -contains $status
        )

        $pairPaths = @()
        if ($isDeliveryRecord) {
            if ([string]::IsNullOrWhiteSpace($pair)) {
                $errors.Add("$rootRelativeRecord is missing Pair metadata.")
            }
            elseif ($pair -eq "None") {
                $hasExceptionNote = (
                    $content -match '(?m)^(Legacy|Operational) record note:'
                )
                if (
                    $status -ne "Superseded" -and
                    -not $hasExceptionNote
                ) {
                    $errors.Add(
                        "$rootRelativeRecord uses Pair: None without being " +
                        "Superseded or explaining a legacy/operational exception."
                    )
                }
            }
            else {
                $pairMatches = [regex]::Matches(
                    $pair,
                    '`(?<path>[^`]+)`'
                )
                if ($pairMatches.Count -eq 0) {
                    $errors.Add(
                        "$rootRelativeRecord Pair metadata has no backticked path."
                    )
                }
                foreach ($pairMatch in $pairMatches) {
                    $pairPath = $pairMatch.Groups["path"].Value.Replace("\", "/")
                    $pairPaths += $pairPath
                    if (
                        [System.IO.Path]::IsPathRooted($pairPath) -or
                        $pairPath -match '(^|[\\/])\.\.([\\/]|$)'
                    ) {
                        $errors.Add(
                            "$rootRelativeRecord has an unsafe Pair path: " +
                            $pairPath
                        )
                        continue
                    }
                    $pairTarget = Join-Path $root $pairPath
                    if (-not (Test-Path -LiteralPath $pairTarget -PathType Leaf)) {
                        $errors.Add(
                            "$rootRelativeRecord has a missing Pair path: " +
                            $pairPath
                        )
                    }
                    if ($relatedPaths -notcontains $pairPath) {
                        $errors.Add(
                            "$rootRelativeRecord Pair path is absent from " +
                            "Related metadata: $pairPath"
                        )
                    }
                }
            }
        }

        if ($set.Role -eq "acceptance") {
            if ([string]::IsNullOrWhiteSpace($decision)) {
                $errors.Add("$rootRelativeRecord is missing Decision metadata.")
            }
            elseif ($set.Statuses -notcontains $decision) {
                $errors.Add(
                    "$rootRelativeRecord has invalid Decision '$decision'."
                )
            }
            elseif ($decision -ne $status) {
                $errors.Add(
                    "$rootRelativeRecord Decision '$decision' does not match " +
                    "Status '$status'."
                )
            }
        }

        if ($isDeliveryRecord) {
            $roadmapRelativeRecord = [System.IO.Path]::GetRelativePath(
                (Join-Path $root "docs"),
                $recordFile.FullName
            ).Replace("\", "/")
            $matchingRoadmapRows = @(
                $roadmapContent -split "`r?`n" |
                    Where-Object {
                        $_ -match '^\|' -and (
                            $_ -match [regex]::Escape($rootRelativeRecord) -or
                            $_ -match [regex]::Escape($roadmapRelativeRecord)
                        )
                    }
            )
            if (
                $isOpenDeliveryRecord -and
                $matchingRoadmapRows.Count -eq 0
            ) {
                $errors.Add(
                    "Open task or acceptance record has no ROADMAP table row: " +
                    $rootRelativeRecord
                )
            }
            if ($matchingRoadmapRows.Count -gt 0) {
                $escapedStatus = [regex]::Escape($status)
                $matchingStatusRows = @(
                    $matchingRoadmapRows |
                        Where-Object {
                            $_ -match "\|\s*${escapedStatus}\s*\|"
                        }
                )
                if ($matchingStatusRows.Count -eq 0) {
                    $errors.Add(
                        "ROADMAP status does not match $rootRelativeRecord " +
                        "Status '$status'."
                    )
                }
            }
        }

        $controlledRecords += [pscustomobject]@{
            Path = $rootRelativeRecord
            Status = $status
            Role = $role
            RelatedPaths = $relatedPaths
            PairPaths = $pairPaths
            Decision = $decision
            Content = $content
        }

        if (
            $set.Role -eq "task" -and
            $isOpenDeliveryRecord -and
            $content -notmatch '(?m)^## Documentation Impact\s*$'
        ) {
            $errors.Add(
                "Open task is missing a Documentation Impact section: " +
                $rootRelativeRecord
            )
        }

        if ($set.Role -eq "acceptance") {
            $decisionSection = [regex]::Match(
                $content,
                '(?ms)^## Acceptance Decision\s*\r?\n' +
                '(?<body>.*?)(?=^##\s|\z)'
            )

            if ($isOpenDeliveryRecord -and -not $decisionSection.Success) {
                $errors.Add(
                    "Open acceptance record is missing an Acceptance Decision " +
                    "section: $rootRelativeRecord"
                )
            }
            elseif ($decisionSection.Success) {
                $currentDecisionMatch = [regex]::Match(
                    $decisionSection.Groups["body"].Value,
                    '(?m)^Current decision:\s*`(?<value>[^`]+)`'
                )
                if (-not $currentDecisionMatch.Success) {
                    $errors.Add(
                        "Acceptance Decision section is missing a parseable " +
                        "Current decision: $rootRelativeRecord"
                    )
                }
                elseif (
                    $currentDecisionMatch.Groups["value"].Value.Trim() -ne $status
                ) {
                    $errors.Add(
                        "Acceptance Current decision does not match Status " +
                        "'$status': $rootRelativeRecord"
                    )
                }
            }
        }

        if (
            $set.Role -eq "acceptance" -and
            $status -eq "Accepted" -and
            $content -match '(?m)^\s*-\s+\[ \]'
        ) {
            $errors.Add(
                "Accepted record still has unchecked criteria: " +
                $rootRelativeRecord
            )
        }
    }
}

$deliveryRecordsByPath = @{}
foreach ($record in $controlledRecords) {
    if ($record.Role -in @("task", "acceptance")) {
        $deliveryRecordsByPath[$record.Path] = $record
    }
}

foreach ($record in $deliveryRecordsByPath.Values) {
    foreach ($pairPath in $record.PairPaths) {
        if (-not $deliveryRecordsByPath.ContainsKey($pairPath)) {
            $errors.Add(
                "$($record.Path) Pair target is not a controlled task or " +
                "acceptance record: $pairPath"
            )
            continue
        }

        $pairedRecord = $deliveryRecordsByPath[$pairPath]
        if ($record.Role -eq $pairedRecord.Role) {
            $errors.Add(
                "$($record.Path) Pair target has the same role " +
                "'$($record.Role)': $pairPath"
            )
        }
        if ($pairedRecord.PairPaths -notcontains $record.Path) {
            $errors.Add(
                "One-sided delivery pair: $($record.Path) names $pairPath, " +
                "but the target does not name it."
            )
        }
        if ($record.Status -ne $pairedRecord.Status) {
            $errors.Add(
                "Paired task/acceptance statuses differ: " +
                "$($record.Path)=$($record.Status), " +
                "$($pairedRecord.Path)=$($pairedRecord.Status)"
            )
        }
    }
}

if ($errors.Count -gt 0) {
    foreach ($message in $errors) {
        Write-Error $message
    }
    exit 1
}

$successMessage = (
    "Documentation checks passed: {0} Markdown files, {1} controlled records, " +
    "status snapshot {2}."
) -f (
    $markdownFiles.Count,
    $controlledRecordCount,
    $roadmapDate
)
Write-Host $successMessage
