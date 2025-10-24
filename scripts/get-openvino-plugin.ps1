# Self-elevating script
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))) {
    Write-Host "Not running as administrator, restarting elevated..."
    $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    Start-Process powershell -ArgumentList $arg -Verb RunAs
    exit
}

$ErrorActionPreference = 'Stop'
$baseUrl = "http://powerbuilder.sh.intel.com/project/webnn/nightly-ort_ci-ov/"
$target = "C:\Program Files\ort-ov-plugin-for-sample-test"

Write-Host "Fetching directory listing from $baseUrl ..."
$html = (Invoke-WebRequest -Uri $baseUrl -UseBasicParsing -TimeoutSec 5).Content

# Parse folder rows: capture folder href (ending with /), folder text (ending with /), and the right-aligned timestamp
# Example row: <tr><td valign="top"><img src="/icons/folder.gif" alt="[DIR]"></td><td><a href="onnxruntime-ci-develop-195/">onnxruntime-ci-develop-195/</a></td><td align="right">2025-10-17 15:27  </td>...
$regex = [regex]'<a href="([^"]+/)">([^<]+/)</a>\s*</td>\s*<td[^>]*align="right"[^>]*>\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})'
$matches = $regex.Matches($html)
if ($matches.Count -eq 0) { throw "No folder entries found on page!" }

$latest = $matches | ForEach-Object {
    [PSCustomObject]@{
        Folder = $_.Groups[1].Value
        Date = [DateTime]$_.Groups[3].Value
    }
} | Sort-Object Date -Descending | Select-Object -First 1

$folderName = $latest.Folder.TrimEnd('/')
$sevenZipUrl = ($baseUrl.TrimEnd('/') + '/' + $folderName + '/TestTools-OV-Latest-Release-x64.7z')
Write-Host "Latest folder found: $folderName    timestamp: $($latest.Date)"

# Download the 7z archive
$zipTmp = Join-Path $env:TEMP "TestTools-OV-Latest-Release-x64.7z"
$tempStage = Join-Path $env:TEMP "ort_ov_stage"
Write-Host "Downloading $sevenZipUrl to $zipTmp ..."
Invoke-WebRequest -Uri $sevenZipUrl -OutFile $zipTmp -UseBasicParsing -TimeoutSec 180

# Clean staging area
if (Test-Path $tempStage) { Remove-Item $tempStage -Recurse -Force }
New-Item -ItemType Directory -Path $tempStage | Out-Null

Write-Host "Extracting archive to temporary location ..."
# Ensure 7z is available: check common Program Files locations first, then PATH
$possiblePaths = @("C:\Program Files\7-Zip\7z.exe", "C:\Program Files (x86)\7-Zip\7z.exe")
$sevenZipPath = $null
foreach ($p in $possiblePaths) {
    if (Test-Path $p) { $sevenZipPath = $p; break }
}
if (-not $sevenZipPath) {
    $cmd = Get-Command 7z.exe -ErrorAction SilentlyContinue
    if ($cmd) { $sevenZipPath = $cmd.Source }
}
if (-not $sevenZipPath) { throw "7z (7-Zip) not found. Please install 7-Zip or ensure 7z.exe is available in PATH or at C:\\Program Files\\7-Zip\\7z.exe." }

# Use 7z to extract; suppress output for clarity
& "$sevenZipPath" x "$zipTmp" "-o$tempStage" -y | Out-Null
Remove-Item $zipTmp -Force

# Assume onnxruntime.dll is at the root of the extracted archive
$onnxruntimePath = Join-Path $tempStage "onnxruntime.dll"
if (-not (Test-Path $onnxruntimePath)) { throw "No 'onnxruntime.dll' found at the root of the extracted archive." }

Write-Host "Preparing to replace target contents at $target with contents from $tempStage ..."
# Ensure target exists
if (Test-Path $target) {
    # Remove only existing contents (files/folders) but keep the folder itself
    Get-ChildItem -Path $target -Force | Remove-Item -Recurse -Force -ErrorAction Stop
} else {
    New-Item -ItemType Directory -Path $target | Out-Null
}

# Copy contents into target
# Use robocopy for robustness. Note: robocopy exit codes < 8 are success.
$sourceForRobocopy = $tempStage.TrimEnd('\')
$robocopyCmd = "robocopy `"$sourceForRobocopy`" `"$target`" /E /NFL /NDL /NJH /NJS /NP"
Write-Host "Running: $robocopyCmd"
Invoke-Expression $robocopyCmd
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }

# Cleanup
Remove-Item $tempStage -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Done. Latest $folderName's contents deployed to $target."
