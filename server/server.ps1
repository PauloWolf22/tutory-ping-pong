# Tutory Ping Pong Championship - local server (no Node required)
# Windows PowerShell 5.1 + embedded C#. Serves /app, keeps data in /data, pushes updates via SSE.
param(
  [int]$Port = 8787,
  [switch]$ResetPassword
)
$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$cs = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'TutoryServer.cs')
Add-Type -TypeDefinition $cs -ReferencedAssemblies 'System.Web.Extensions','System.Core','System.Net','System.Net.Sockets','System.Security' -ErrorAction Stop
if ($ResetPassword) {
  $auth = Join-Path $base 'data\auth.json'
  if (Test-Path $auth) { Remove-Item $auth -Force; Write-Host 'Senha removida. Defina uma nova no primeiro acesso ao painel.' }
}
[TutoryServer]::Run($base, $Port)
