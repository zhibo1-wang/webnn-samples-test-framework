# Download and deploy the fixed-version libraries used by the `ot` / `ot-litert` configs.
# If a target folder already exists, compare its content with the package:
#   identical -> report only; different -> ask whether to overwrite.

# Self-elevating script
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))) {
    Write-Host "Not running as administrator, restarting elevated..."
    $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    Start-Process powershell -ArgumentList $arg -Verb RunAs
    exit
}

$ErrorActionPreference = 'Stop'
$baseUrl = "http://powerbuilder.sh.intel.com/project/webnn/OT"
$programFiles = "C:\Program Files"

# Keep the targets in sync with the defaults in generate-config.js.
# Name: display name, Url: package url, Target: folder to compare/deploy,
# Root: sub folder inside the extracted package which maps to Target ("" = package root).
$packages = @(
    @{
        Name = "ONNXRuntime 1.28.3"
        Url = "$baseUrl/ONNXRuntime/onnxruntime-win-x64-1.28.3.zip"
        Target = "$programFiles\onnxruntime-win-x64-1.28.3"
        Root = "onnxruntime-win-x64-1.28.3"
    },
    @{
        Name = "OVEP 1.8.0"
        Url = "$baseUrl/OVEP-1.8.0/TestTools-Release-x64.7z"
        Target = "$programFiles\onnxruntime-ep-openvino-1.8.0"
        Root = ""
    },
    @{
        Name = "ORT WebGPU rel-0.5"
        Url = "$baseUrl/WebGPU-rel-0.5/WebGPU-rel-0.5.zip"
        Target = "$programFiles\onnxruntime-webgpu-rel-0.5"
        Root = ""
    }
)

# Locate 7z
$sevenZip = @("C:\Program Files\7-Zip\7z.exe", "C:\Program Files (x86)\7-Zip\7z.exe") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $sevenZip) {
    $cmd = Get-Command 7z.exe -ErrorAction SilentlyContinue
    if ($cmd) { $sevenZip = $cmd.Source }
}
if (-not $sevenZip) { throw "7z (7-Zip) not found. Please install 7-Zip or add 7z.exe to PATH." }

# Returns @{ relativePath = sha256 } for all files under $dir
function Get-FolderHashes($dir) {
    $result = @{}
    $prefix = (Resolve-Path $dir).Path.TrimEnd('\') + '\'
    Get-ChildItem -Path $dir -Recurse -File -Force | ForEach-Object {
        $result[$_.FullName.Substring($prefix.Length).ToLowerInvariant()] = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
    }
    return $result
}

# Returns a list of human readable differences (empty if identical)
function Compare-Folders($expected, $actual) {
    $a = Get-FolderHashes $expected
    $b = Get-FolderHashes $actual
    $diffs = @()
    foreach ($k in $a.Keys) {
        if (-not $b.ContainsKey($k)) { $diffs += "missing: $k" }
        elseif ($a[$k] -ne $b[$k]) { $diffs += "modified: $k" }
    }
    foreach ($k in $b.Keys) {
        if (-not $a.ContainsKey($k)) { $diffs += "extra: $k" }
    }
    return $diffs
}

$tempRoot = Join-Path $env:TEMP "ot_libs"
if (Test-Path $tempRoot) { Remove-Item $tempRoot -Recurse -Force }
New-Item -ItemType Directory -Path $tempRoot | Out-Null

$summary = @()
try {
    foreach ($pkg in $packages) {
        Write-Host ""
        Write-Host "=== $($pkg.Name) ==="
        $archive = Join-Path $tempRoot (Split-Path $pkg.Url -Leaf)
        $stage = Join-Path $tempRoot ([IO.Path]::GetFileNameWithoutExtension($archive))

        Write-Host "Downloading $($pkg.Url) ..."
        Invoke-WebRequest -Uri $pkg.Url -OutFile $archive -UseBasicParsing -TimeoutSec 600

        Write-Host "Extracting ..."
        & $sevenZip x $archive "-o$stage" -y | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "7z failed to extract $archive (exit code $LASTEXITCODE)" }
        Remove-Item $archive -Force

        $source = if ($pkg.Root) { Join-Path $stage $pkg.Root } else { $stage }
        if (-not (Test-Path $source)) { throw "'$($pkg.Root)' not found in the extracted package." }

        $deploy = $false
        if (Test-Path $pkg.Target) {
            $diffs = Compare-Folders $source $pkg.Target
            if ($diffs.Count -eq 0) {
                Write-Host "$($pkg.Target) already exists and is identical to the package. Nothing to do."
                $summary += "$($pkg.Name): identical, skipped"
                continue
            }
            Write-Host "$($pkg.Target) already exists but differs from the package ($($diffs.Count) difference(s)):"
            $diffs | Select-Object -First 20 | ForEach-Object { Write-Host "  $_" }
            if ($diffs.Count -gt 20) { Write-Host "  ... and $($diffs.Count - 20) more" }
            $answer = Read-Host "Overwrite $($pkg.Target)? (y/N)"
            if ($answer -notmatch '^(y|yes)$') {
                $summary += "$($pkg.Name): different, kept existing"
                continue
            }
            Get-ChildItem -Path $pkg.Target -Force | Remove-Item -Recurse -Force
            $summary += "$($pkg.Name): different, overwritten"
        } else {
            New-Item -ItemType Directory -Path $pkg.Target -Force | Out-Null
            $summary += "$($pkg.Name): deployed"
        }

        # robocopy exit codes < 8 are success
        robocopy $source.TrimEnd('\') $pkg.Target /E /NFL /NDL /NJH /NJS /NP | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }
        Write-Host "Deployed to $($pkg.Target)"
    }
} finally {
    Remove-Item $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "=== Summary ==="
$summary | ForEach-Object { Write-Host $_ }

