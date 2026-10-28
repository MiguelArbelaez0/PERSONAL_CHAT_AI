param(
    [Parameter(Mandatory = $true)]
    [string] $BackendDirectory
)

$ErrorActionPreference = 'Stop'
$backendRoot = (Resolve-Path -LiteralPath $BackendDirectory).Path
$manifestPath = Join-Path $backendRoot 'backend-integrity.json'
$records = @(
    Get-ChildItem -LiteralPath $backendRoot -File -Recurse |
        Where-Object { $_.Name -ne 'backend-integrity.json' } |
        Sort-Object FullName |
        ForEach-Object {
            if ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw 'El paquete FastAPI contiene un enlace o punto de reanálisis no admitido.'
            }
            $relative = $_.FullName.Substring($backendRoot.Length).TrimStart('\', '/').Replace('\', '/')
            [pscustomobject]@{
                path = $relative
                sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
            }
        }
)
if ($records.Count -eq 0) {
    throw 'El paquete FastAPI no contiene archivos para verificar.'
}

$json = ConvertTo-Json -InputObject ([ordered]@{ files = $records }) -Depth 4 -Compress
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($manifestPath, $json, $utf8WithoutBom)
(Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
