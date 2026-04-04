# BC4 deployment smoke validation for LexNet.
# Run from anywhere; the script resolves the repo root from its own location.

param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
)

$ErrorActionPreference = 'Stop'
Set-Location $RepoRoot

$channelName = 'lexnet-channel'
$chaincodeName = 'lexnet-cc'
$chaincodeLabel = 'lexnet-cc_1.0'
$chaincodeVersion = '1.0'

$chaincodeHostPath = (Resolve-Path (Join-Path $RepoRoot 'blockchain\chaincode\lexnet-cc')).Path
$channelArtifactsHostPath = (Resolve-Path (Join-Path $RepoRoot 'blockchain\network\channel-artifacts')).Path
$packageContainerPath = '/etc/hyperledger/fabric/channel-artifacts/lexnet-cc.tar.gz'

$govtContainer = 'peer0.govtorg.lexnet.local'
$verifierContainer = 'peer0.verifierorg.lexnet.local'

$govtMspPath = '/etc/hyperledger/fabric/crypto/peerOrganizations/govtorg.lexnet.local/users/Admin@govtorg.lexnet.local/msp'
$verifierMspPath = '/etc/hyperledger/fabric/crypto/peerOrganizations/verifierorg.lexnet.local/users/Admin@verifierorg.lexnet.local/msp'
$govtTls = '/etc/hyperledger/fabric/crypto/peerOrganizations/govtorg.lexnet.local/peers/peer0.govtorg.lexnet.local/tls/ca.crt'
$verifierTls = '/etc/hyperledger/fabric/crypto/peerOrganizations/verifierorg.lexnet.local/peers/peer0.verifierorg.lexnet.local/tls/ca.crt'
$ordererCa = '/etc/hyperledger/fabric/crypto/ordererOrganizations/lexnet.local/orderers/orderer.lexnet.local/msp/tlscacerts/tlsca.lexnet.local-cert.pem'

function Ensure-Image {
    param(
        [string]$ImageName
    )

    & docker image inspect $ImageName *> $null
    if ($LASTEXITCODE -eq 0) {
        return
    }

    & docker pull $ImageName
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to pull Docker image: $ImageName"
    }
}

function Ensure-FabricCcenv {
    & docker image inspect 'hyperledger/fabric-ccenv:2.5' *> $null
    if ($LASTEXITCODE -eq 0) {
        return
    }

    & docker pull hyperledger/fabric-ccenv:2.5.15
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to pull hyperledger/fabric-ccenv:2.5.15'
    }

    & docker tag hyperledger/fabric-ccenv:2.5.15 hyperledger/fabric-ccenv:2.5
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to tag hyperledger/fabric-ccenv:2.5.15 as hyperledger/fabric-ccenv:2.5'
    }
}

function Assert-ContainerRunning {
    param(
        [string]$ContainerName
    )

    $state = & docker inspect -f '{{.State.Running}}' $ContainerName 2>$null
    if ($LASTEXITCODE -ne 0 -or $state.Trim() -ne 'true') {
        throw "Container not running: $ContainerName"
    }
}

function Write-Utf8NoBom {
    param(
        [string]$Path,
        [string]$Text
    )

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Text, $utf8NoBom)
}

function Invoke-GovtCommand {
    param(
        [string]$Command
    )

    $args = @(
        'exec',
        '-e', 'FABRIC_LOGGING_SPEC=ERROR',
        '-e', 'CORE_PEER_LOCALMSPID=GovtOrgMSP',
        '-e', "CORE_PEER_MSPCONFIGPATH=$govtMspPath",
        '-e', 'CORE_PEER_ADDRESS=peer0.govtorg.lexnet.local:7051',
        '-e', 'CORE_PEER_TLS_ENABLED=true',
        '-e', "CORE_PEER_TLS_ROOTCERT_FILE=$govtTls",
        $govtContainer,
        '/bin/sh',
        '-c',
        $Command
    )

    $output = & docker @args 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "GovtOrg command failed: $Command`n$output"
    }

    return $output
}

function Invoke-VerifierCommand {
    param(
        [string]$Command
    )

    $args = @(
        'exec',
        '-e', 'FABRIC_LOGGING_SPEC=ERROR',
        '-e', 'CORE_PEER_LOCALMSPID=VerifierOrgMSP',
        '-e', "CORE_PEER_MSPCONFIGPATH=$verifierMspPath",
        '-e', 'CORE_PEER_ADDRESS=peer0.verifierorg.lexnet.local:9051',
        '-e', 'CORE_PEER_TLS_ENABLED=true',
        '-e', "CORE_PEER_TLS_ROOTCERT_FILE=$verifierTls",
        $verifierContainer,
        '/bin/sh',
        '-c',
        $Command
    )

    $output = & docker @args 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "VerifierOrg command failed: $Command`n$output"
    }

    return $output
}

function Copy-ToGovtContainer {
    param(
        [string]$LocalPath,
        [string]$RemotePath
    )

    & docker cp $LocalPath "${govtContainer}:$RemotePath"
    if ($LASTEXITCODE -ne 0) {
        throw "docker cp failed for $LocalPath -> $RemotePath"
    }
}

function Test-ChaincodeCommitted {
    try {
        $committedOutput = Invoke-GovtCommand "peer lifecycle chaincode querycommitted --channelID $channelName --name $chaincodeName"
        return $committedOutput -match "Version:\s*$([regex]::Escape($chaincodeVersion)),\s*Sequence:\s*1"
    } catch {
        return $false
    }
}

function Invoke-PeerLifecyclePackaging {
    Ensure-Image 'hyperledger/fabric-tools:2.5'

    $packageCommand = "peer lifecycle chaincode package /opt/channel-artifacts/lexnet-cc.tar.gz --path /opt/chaincode/lexnet-cc --lang golang --label $chaincodeLabel"
    $args = @(
        'run',
        '--rm',
        '-v', "${chaincodeHostPath}:/opt/chaincode/lexnet-cc",
        '-v', "${channelArtifactsHostPath}:/opt/channel-artifacts",
        'hyperledger/fabric-tools:2.5',
        'bash',
        '-lc',
        $packageCommand
    )

    $output = & docker @args 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Chaincode packaging failed`n$output"
    }
}

function New-ChaincodeCtorFiles {
    param(
        [string]$DocumentHash,
        [string]$IpfsCid,
        [string]$OwnerId,
        [string]$DeviceId,
        [string]$Timestamp
    )

    $metadataJson = @{ docType = 'agreement'; ownerId = $OwnerId } | ConvertTo-Json -Compress

    $storeCtor = @{ Args = @('StoreDocument', $DocumentHash, $IpfsCid, $OwnerId, $DeviceId, $Timestamp, 'agreement', $metadataJson) } | ConvertTo-Json -Compress
    $getCtor = @{ Args = @('GetDocument', $DocumentHash) } | ConvertTo-Json -Compress
    $verifyCtor = @{ Args = @('VerifyDocument', $DocumentHash) } | ConvertTo-Json -Compress

    $storeHostPath = Join-Path $env:TEMP 'lexnet-store-ctor.json'
    $getHostPath = Join-Path $env:TEMP 'lexnet-get-ctor.json'
    $verifyHostPath = Join-Path $env:TEMP 'lexnet-verify-ctor.json'

    Write-Utf8NoBom -Path $storeHostPath -Text $storeCtor
    Write-Utf8NoBom -Path $getHostPath -Text $getCtor
    Write-Utf8NoBom -Path $verifyHostPath -Text $verifyCtor

    Copy-ToGovtContainer -LocalPath $storeHostPath -RemotePath '/tmp/lexnet-store-ctor.json'
    Copy-ToGovtContainer -LocalPath $getHostPath -RemotePath '/tmp/lexnet-get-ctor.json'
    Copy-ToGovtContainer -LocalPath $verifyHostPath -RemotePath '/tmp/lexnet-verify-ctor.json'

    return @{
        StoreHostPath  = $storeHostPath
        GetHostPath    = $getHostPath
        VerifyHostPath = $verifyHostPath
    }
}

function Cleanup-ChaincodeCtorFiles {
    param(
        [hashtable]$Paths
    )

    Remove-Item $Paths.StoreHostPath, $Paths.GetHostPath, $Paths.VerifyHostPath -ErrorAction SilentlyContinue
    try {
        Invoke-GovtCommand 'rm -f /tmp/lexnet-store-ctor.json /tmp/lexnet-get-ctor.json /tmp/lexnet-verify-ctor.json' | Out-Null
    } catch {
    }
}

foreach ($container in @($govtContainer, $verifierContainer, 'orderer.lexnet.local')) {
    Assert-ContainerRunning $container
}

Ensure-FabricCcenv
Invoke-PeerLifecyclePackaging

Write-Host '---INSTALL_CHECK---'
$govInstalled = Invoke-GovtCommand 'peer lifecycle chaincode queryinstalled'
if ($govInstalled -notmatch [regex]::Escape($chaincodeLabel)) {
    Write-Host '---INSTALL_GOVT---'
    Invoke-GovtCommand "peer lifecycle chaincode install $packageContainerPath" | Out-Null
}

$verInstalled = Invoke-VerifierCommand 'peer lifecycle chaincode queryinstalled'
if ($verInstalled -notmatch [regex]::Escape($chaincodeLabel)) {
    Write-Host '---INSTALL_VERIFIER---'
    Invoke-VerifierCommand "peer lifecycle chaincode install $packageContainerPath" | Out-Null
}

$govInstalled = Invoke-GovtCommand 'peer lifecycle chaincode queryinstalled'
$packageIdMatch = [regex]::Match($govInstalled, 'Package ID:\s*([^,]+),\s*Label:\s*' + [regex]::Escape($chaincodeLabel))
if (-not $packageIdMatch.Success) {
    throw 'Unable to parse package ID from queryinstalled output'
}

$packageId = $packageIdMatch.Groups[1].Value.Trim()
Write-Host "PACKAGE_ID=$packageId"

if (-not (Test-ChaincodeCommitted)) {
    Write-Host '---APPROVE_GOVT---'
    Invoke-GovtCommand "peer lifecycle chaincode approveformyorg -o orderer.lexnet.local:7050 --ordererTLSHostnameOverride orderer.lexnet.local --tls --cafile $ordererCa --channelID $channelName --name $chaincodeName --version $chaincodeVersion --package-id $packageId --sequence 1" | Out-Null

    Write-Host '---APPROVE_VERIFIER---'
    Invoke-VerifierCommand "peer lifecycle chaincode approveformyorg -o orderer.lexnet.local:7050 --ordererTLSHostnameOverride orderer.lexnet.local --tls --cafile $ordererCa --channelID $channelName --name $chaincodeName --version $chaincodeVersion --package-id $packageId --sequence 1" | Out-Null

    Write-Host '---READINESS---'
    $readiness = Invoke-GovtCommand "peer lifecycle chaincode checkcommitreadiness --channelID $channelName --name $chaincodeName --version $chaincodeVersion --sequence 1 --output json"
    Write-Host $readiness

    Write-Host '---COMMIT---'
    Invoke-GovtCommand "peer lifecycle chaincode commit -o orderer.lexnet.local:7050 --ordererTLSHostnameOverride orderer.lexnet.local --channelID $channelName --name $chaincodeName --version $chaincodeVersion --sequence 1 --tls --cafile $ordererCa --peerAddresses peer0.govtorg.lexnet.local:7051 --tlsRootCertFiles $govtTls --peerAddresses peer0.verifierorg.lexnet.local:9051 --tlsRootCertFiles $verifierTls" | Out-Null
}

Write-Host '---COMMITTED---'
Invoke-GovtCommand "peer lifecycle chaincode querycommitted --channelID $channelName --name $chaincodeName" | Write-Host

$runId = [DateTimeOffset]::UtcNow.ToString('yyyyMMddHHmmssfff')
$docHash = "doc-smoke-$runId"
$ipfsCid = "QmSmokeCid$runId"
$docTimestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
$ownerId = 'owner-001'
$deviceId = 'device-001'

$ctorPaths = $null
try {
    $ctorPaths = New-ChaincodeCtorFiles -DocumentHash $docHash -IpfsCid $ipfsCid -OwnerId $ownerId -DeviceId $deviceId -Timestamp $docTimestamp

    Write-Host "SMOKE_DOC_HASH=$docHash"

    Write-Host '---INVOKE_STORE---'
    Invoke-GovtCommand 'peer chaincode invoke -o orderer.lexnet.local:7050 --ordererTLSHostnameOverride orderer.lexnet.local --tls --cafile /etc/hyperledger/fabric/crypto/ordererOrganizations/lexnet.local/orderers/orderer.lexnet.local/msp/tlscacerts/tlsca.lexnet.local-cert.pem -C lexnet-channel -n lexnet-cc --peerAddresses peer0.govtorg.lexnet.local:7051 --tlsRootCertFiles /etc/hyperledger/fabric/crypto/peerOrganizations/govtorg.lexnet.local/peers/peer0.govtorg.lexnet.local/tls/ca.crt --peerAddresses peer0.verifierorg.lexnet.local:9051 --tlsRootCertFiles /etc/hyperledger/fabric/crypto/peerOrganizations/verifierorg.lexnet.local/peers/peer0.verifierorg.lexnet.local/tls/ca.crt --waitForEvent -c $(cat /tmp/lexnet-store-ctor.json)' | Out-Null

    Write-Host '---QUERY_GETDOCUMENT---'
    Invoke-GovtCommand 'peer chaincode query -C lexnet-channel -n lexnet-cc -c $(cat /tmp/lexnet-get-ctor.json)' | Write-Host

    Write-Host '---QUERY_VERIFYDOCUMENT---'
    Invoke-GovtCommand 'peer chaincode query -C lexnet-channel -n lexnet-cc -c $(cat /tmp/lexnet-verify-ctor.json)' | Write-Host
}
finally {
    if ($null -ne $ctorPaths) {
        Cleanup-ChaincodeCtorFiles -Paths $ctorPaths
    }
}