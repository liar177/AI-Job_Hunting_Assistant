[CmdletBinding()]
param(
  [ValidateSet('Auto', 'Manual')]
  [string]$Mode,
  [string]$Tag,
  [string]$ReleaseName,
  [string]$Notes,
  [string]$NotesFile,
  [switch]$Prerelease,
  [switch]$Yes,
  [switch]$Watch
)

$ErrorActionPreference = 'Stop'

function Resolve-GitHubCli {
  $command = Get-Command gh -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidates = @(
    'C:\Program Files\GitHub CLI\gh.exe',
    "$env:LOCALAPPDATA\Programs\GitHub CLI\gh.exe",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Links\gh.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  throw 'GitHub CLI was not found. Reopen the terminal after installing gh, or add gh.exe to PATH.'
}

function Read-RequiredValue([string]$Prompt, [string]$DefaultValue = '') {
  $suffix = if ($DefaultValue) { " [$DefaultValue]" } else { '' }
  $value = Read-Host "$Prompt$suffix"
  if (-not $value) {
    $value = $DefaultValue
  }
  if (-not $value) {
    throw "$Prompt is required."
  }
  return $value.Trim()
}

function Invoke-QuietNative([string]$Executable, [string[]]$Arguments) {
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $Executable @Arguments *> $null
    return $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
}

if (-not $Mode) {
  $modeInput = Read-RequiredValue 'Release mode: 1=automatic defaults, 2=manual content' '1'
  $Mode = if ($modeInput -eq '2') { 'Manual' } elseif ($modeInput -eq '1') { 'Auto' } else { throw 'Release mode must be 1 or 2.' }
}

$latestTag = git tag --sort=-version:refname | Select-Object -First 1
if (-not $Tag) {
  $Tag = Read-RequiredValue 'Existing version tag' $latestTag
}
$Tag = $Tag.Trim()
if ($Tag -notmatch '^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') {
  throw "Invalid version tag '$Tag'. Expected a semantic version such as v0.2.0 or v0.2.0-beta.1."
}

$gh = Resolve-GitHubCli
if ((Invoke-QuietNative $gh @('auth', 'status')) -ne 0) {
  throw "GitHub CLI is not authenticated. Run: `"$gh`" auth login"
}

if ((Invoke-QuietNative 'git' @('rev-parse', '--verify', '--quiet', "refs/tags/$Tag")) -ne 0) {
  throw "Local tag '$Tag' does not exist. Create it first with: git tag $Tag"
}

if ((Invoke-QuietNative 'git' @('ls-remote', '--exit-code', '--tags', 'origin', "refs/tags/$Tag")) -ne 0) {
  throw "Remote tag '$Tag' does not exist. Push it first with: git push origin $Tag"
}

if ($NotesFile) {
  if (-not (Test-Path -LiteralPath $NotesFile)) {
    throw "Release notes file not found: $NotesFile"
  }
  $Notes = Get-Content -Raw -LiteralPath $NotesFile
}

if ($Mode -eq 'Manual') {
  if (-not $ReleaseName) {
    $ReleaseName = Read-RequiredValue 'Release name' "AI 求职助手 $Tag"
  }
  if (-not $Notes) {
    $notesPath = Read-Host 'Release notes file path (leave empty to enter one-line notes)'
    if ($notesPath) {
      if (-not (Test-Path -LiteralPath $notesPath)) {
        throw "Release notes file not found: $notesPath"
      }
      $Notes = Get-Content -Raw -LiteralPath $notesPath
    } else {
      $Notes = Read-RequiredValue 'Release notes'
    }
  }
  if (-not $PSBoundParameters.ContainsKey('Prerelease')) {
    $Prerelease = (Read-Host 'Mark as prerelease? (y/N)') -match '^(?i:y|yes)$'
  }
} else {
  $ReleaseName = ''
  $Notes = ''
  $Prerelease = $false
}

Write-Host ''
Write-Host 'Release request:'
Write-Host "  Mode:       $Mode"
Write-Host "  Tag:        $Tag"
Write-Host "  Name:       $(if ($ReleaseName) { $ReleaseName } else { '(automatic default)' })"
Write-Host "  Notes:      $(if ($Notes) { 'custom content' } else { '(automatic default)' })"
Write-Host "  Prerelease: $($Prerelease.IsPresent)"

if (-not $Yes) {
  $confirmation = Read-Host 'Trigger GitHub build and release? (y/N)'
  if ($confirmation -notmatch '^(?i:y|yes)$') {
    Write-Host 'Release cancelled.'
    exit 0
  }
}

$arguments = @(
  'workflow', 'run', 'release.yml',
  '--ref', 'main',
  '-f', "release_tag=$Tag",
  '-f', "release_name=$ReleaseName",
  '-f', "release_body=$Notes",
  '-f', "prerelease=$($Prerelease.IsPresent.ToString().ToLowerInvariant())"
)
& $gh @arguments
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to trigger the GitHub release workflow.'
}

Write-Host "Release workflow triggered for $Tag."
Write-Host 'View runs with: gh run list --workflow release.yml'
if ($Watch) {
  & $gh run watch
}
