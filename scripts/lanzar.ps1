$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot)
$base = Join-Path (Get-Location) '.cacahuete'
New-Item -ItemType Directory $base -Force | Out-Null
$env:PATH = "$base\node;$env:LOCALAPPDATA\Programs\Ollama;$env:PATH"
$version = if (Get-Command node.exe -ErrorAction SilentlyContinue) { [version]((node -v).TrimStart('v')) }
if (!$version -or $version.Major -ne 22 -or $version.Minor -lt 13) {
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {'arm64'} else {'x64'}
    $sums = (Invoke-WebRequest -UseBasicParsing https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt).Content
    if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }
    if ($sums -notmatch "(?m)^([a-f0-9]{64})\s+(node-(v22\.[\d.]+)-win-$arch\.zip)\s*$") { throw 'No se encuentra Node 22 para Windows.' }
    $hash, $file, $release = $Matches[1], $Matches[2], $Matches[3]
    $zip = Join-Path $base $file
    Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$release/$file" -OutFile $zip
    if ((Get-FileHash $zip).Hash -ne $hash) { throw 'La descarga de Node no coincide con su SHA-256.' }
    Expand-Archive $zip $base -Force
    $nodeDir = Join-Path $base 'node'
    New-Item -ItemType Directory $nodeDir -Force | Out-Null
    Copy-Item "$base\$([IO.Path]::GetFileNameWithoutExtension($file))\*" $nodeDir -Recurse -Force
    Remove-Item -LiteralPath $zip
}
if (!(Get-Command ollama.exe -ErrorAction SilentlyContinue)) {
    winget install --id Ollama.Ollama --exact --source winget --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE) { throw 'No se pudo instalar Ollama mediante winget.' }
}
node --env-file-if-exists=backend/.env scripts/lanzar.mjs
exit $LASTEXITCODE
