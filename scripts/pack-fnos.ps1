# Build the JoyAI image (web + API in one container) and push it to Docker Hub.
# MySQL / Redis stay as official images and are not pushed.
#
#   powershell -ExecutionPolicy Bypass -File scripts/pack-fnos.ps1
#
# Requires `docker login` first.
# On 飞牛, create two Compose projects from:
#   deploy/fnos/db
#   deploy/fnos/app
# Start db first, then app. Do not use the repo-root docker-compose.yml.

param(
  [string]$User = $(if ($env:DOCKERHUB_USER) { $env:DOCKERHUB_USER } else { "liuxiaodi2026" }),
  [string]$Tag = $(if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { "latest" }),
  [string]$ApiPort = $(if ($env:API_PORT) { $env:API_PORT } else { "18081" })
)

$ErrorActionPreference = "Stop"

if (-not $User.Trim()) {
  Write-Error "Docker Hub username is empty. Pass -User or set DOCKERHUB_USER."
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

$Image = "$($User.Trim())/joyai:$($Tag.Trim())"

Write-Host "Building $Image ..."
docker build -f Dockerfile -t $Image `
  --build-arg "NEXT_PUBLIC_API_URL=http://localhost:${ApiPort}/api" `
  --build-arg "NEXT_PUBLIC_WS_URL=http://localhost:${ApiPort}" `
  .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Pushing to Docker Hub ..."
docker push $Image
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Pushed: $Image"
Write-Host "On the NAS Docker panel, use deploy/fnos/db and deploy/fnos/app."
Write-Host "Each folder is its own Compose project. Start db first, then app."
