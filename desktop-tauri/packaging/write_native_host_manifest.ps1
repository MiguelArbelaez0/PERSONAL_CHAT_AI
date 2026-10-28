param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-p]{32}$')]
    [string] $ExtensionId,

    [Parameter(Mandatory = $true)]
    [string] $HostExecutable,

    [Parameter(Mandatory = $true)]
    [string] $OutputPath
)

$ErrorActionPreference = 'Stop'
$hostPath = (Resolve-Path -LiteralPath $HostExecutable -ErrorAction Stop).Path
$outputFullPath = [IO.Path]::GetFullPath($OutputPath)
$outputDirectory = [IO.Path]::GetDirectoryName($outputFullPath)
if (-not (Test-Path -LiteralPath $outputDirectory -PathType Container)) {
    throw 'La carpeta de salida del manifiesto debe existir.'
}

$manifest = [ordered]@{
    allowed_origins = @("chrome-extension://$ExtensionId/")
    description = 'Conexión local entre PERSONAL_CHAT_AI y Chrome'
    name = 'com.personalchatai.desktop'
    path = $hostPath
    type = 'stdio'
}
$json = ($manifest | ConvertTo-Json -Depth 4) -replace "`r`n", "`n"
[IO.File]::WriteAllText($outputFullPath, $json, [Text.UTF8Encoding]::new($false))
Write-Output 'Manifiesto Native Messaging generado para un único ID exacto. No se modificó el Registro.'
