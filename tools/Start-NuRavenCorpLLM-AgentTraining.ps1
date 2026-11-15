Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Bridge script from wiseravenshare repo to NuRavenCorpLLM training workflow.
$llmRepo = "G:\NuRavenCorpLLM"
$trainScript = Join-Path $llmRepo "training\scripts\Train-Wiseravenshare-Agent-Full.ps1"

if (-not (Test-Path $trainScript)) {
    throw "Training script not found: $trainScript"
}

Push-Location $llmRepo
try {
    & $trainScript
}
finally {
    Pop-Location
}

