#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${NETWORK_DIR}/docker-compose-fabric.yaml"

CHANNEL_NAME="${CHANNEL_NAME:-lexnet-channel}"
CHAINCODE_NAME="${CHAINCODE_NAME:-lexnet-cc}"
CHAINCODE_LABEL="${CHAINCODE_LABEL:-lexnet-cc_1.0}"
CHAINCODE_LANG="${CHAINCODE_LANG:-golang}"
CHAINCODE_SRC_PATH="${CHAINCODE_SRC_PATH:-/opt/gopath/src/chaincode/lexnet-cc}"
CHAINCODE_PACKAGE="/etc/hyperledger/fabric/channel-artifacts/${CHAINCODE_NAME}.tar.gz"
INSTALL_CHAINCODE="${INSTALL_CHAINCODE:-false}"

ORDERER_CA="/etc/hyperledger/fabric/crypto/ordererOrganizations/lexnet.local/orderers/orderer.lexnet.local/msp/tlscacerts/tlsca.lexnet.local-cert.pem"
CHANNEL_TX="/etc/hyperledger/fabric/channel-artifacts/${CHANNEL_NAME}.tx"
CHANNEL_BLOCK="/etc/hyperledger/fabric/channel-artifacts/${CHANNEL_NAME}.block"
GOVT_ANCHOR_TX="/etc/hyperledger/fabric/channel-artifacts/GovtOrgMSPanchors.tx"
VERIFIER_ANCHOR_TX="/etc/hyperledger/fabric/channel-artifacts/VerifierOrgMSPanchors.tx"

log() {
	echo "[setup-network] $*"
}

require_tool() {
	local tool="$1"
	if ! command -v "${tool}" >/dev/null 2>&1; then
		log "Missing required tool: ${tool}"
		exit 1
	fi
}

wait_for_running() {
	local container="$1"
	local retries="${2:-30}"
	local delay="${3:-2}"

	for ((i = 1; i <= retries; i++)); do
		if [[ "$(docker inspect -f '{{.State.Running}}' "${container}" 2>/dev/null || true)" == "true" ]]; then
			return 0
		fi
		sleep "${delay}"
	done

	log "Container did not start in time: ${container}"
	return 1
}

run_govt_peer() {
	if [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* ]]; then
		MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*" docker exec \
			-e CORE_PEER_LOCALMSPID=GovtOrgMSP \
			-e CORE_PEER_TLS_ENABLED=true \
			-e CORE_PEER_ADDRESS=peer0.govtorg.lexnet.local:7051 \
			-e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto/peerOrganizations/govtorg.lexnet.local/peers/peer0.govtorg.lexnet.local/tls/ca.crt \
			-e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto/peerOrganizations/govtorg.lexnet.local/users/Admin@govtorg.lexnet.local/msp \
			peer0.govtorg.lexnet.local "$@"
	else
		docker exec \
			-e CORE_PEER_LOCALMSPID=GovtOrgMSP \
			-e CORE_PEER_TLS_ENABLED=true \
			-e CORE_PEER_ADDRESS=peer0.govtorg.lexnet.local:7051 \
			-e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto/peerOrganizations/govtorg.lexnet.local/peers/peer0.govtorg.lexnet.local/tls/ca.crt \
			-e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto/peerOrganizations/govtorg.lexnet.local/users/Admin@govtorg.lexnet.local/msp \
			peer0.govtorg.lexnet.local "$@"
	fi
}

run_verifier_peer() {
	if [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* ]]; then
		MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*" docker exec \
			-e CORE_PEER_LOCALMSPID=VerifierOrgMSP \
			-e CORE_PEER_TLS_ENABLED=true \
			-e CORE_PEER_ADDRESS=peer0.verifierorg.lexnet.local:9051 \
			-e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto/peerOrganizations/verifierorg.lexnet.local/peers/peer0.verifierorg.lexnet.local/tls/ca.crt \
			-e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto/peerOrganizations/verifierorg.lexnet.local/users/Admin@verifierorg.lexnet.local/msp \
			peer0.verifierorg.lexnet.local "$@"
	else
		docker exec \
			-e CORE_PEER_LOCALMSPID=VerifierOrgMSP \
			-e CORE_PEER_TLS_ENABLED=true \
			-e CORE_PEER_ADDRESS=peer0.verifierorg.lexnet.local:9051 \
			-e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto/peerOrganizations/verifierorg.lexnet.local/peers/peer0.verifierorg.lexnet.local/tls/ca.crt \
			-e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto/peerOrganizations/verifierorg.lexnet.local/users/Admin@verifierorg.lexnet.local/msp \
			peer0.verifierorg.lexnet.local "$@"
	fi
}

require_tool docker

if ! docker compose version >/dev/null 2>&1; then
	log "docker compose is required but not available."
	exit 1
fi

log "Generating crypto material and channel artifacts"
"${SCRIPT_DIR}/generate-crypto.sh"

log "Stopping any existing Fabric network stack"
docker compose -f "${COMPOSE_FILE}" down --volumes --remove-orphans >/dev/null 2>&1 || true

log "Starting Fabric services"
docker compose -f "${COMPOSE_FILE}" up -d

log "Waiting for containers"
wait_for_running orderer.lexnet.local
wait_for_running peer0.govtorg.lexnet.local
wait_for_running peer0.verifierorg.lexnet.local
wait_for_running ca_govtorg
wait_for_running ca_verifierorg

log "Creating channel ${CHANNEL_NAME}"
run_govt_peer peer channel create \
	-o orderer.lexnet.local:7050 \
	--ordererTLSHostnameOverride orderer.lexnet.local \
	-c "${CHANNEL_NAME}" \
	-f "${CHANNEL_TX}" \
	--outputBlock "${CHANNEL_BLOCK}" \
	--tls \
	--cafile "${ORDERER_CA}"

log "Joining peer0.govtorg to ${CHANNEL_NAME}"
run_govt_peer peer channel join -b "${CHANNEL_BLOCK}"

log "Joining peer0.verifierorg to ${CHANNEL_NAME}"
run_verifier_peer peer channel join -b "${CHANNEL_BLOCK}"

log "Updating GovtOrg anchor peer"
run_govt_peer peer channel update \
	-o orderer.lexnet.local:7050 \
	--ordererTLSHostnameOverride orderer.lexnet.local \
	-c "${CHANNEL_NAME}" \
	-f "${GOVT_ANCHOR_TX}" \
	--tls \
	--cafile "${ORDERER_CA}"

log "Updating VerifierOrg anchor peer"
run_verifier_peer peer channel update \
	-o orderer.lexnet.local:7050 \
	--ordererTLSHostnameOverride orderer.lexnet.local \
	-c "${CHANNEL_NAME}" \
	-f "${VERIFIER_ANCHOR_TX}" \
	--tls \
	--cafile "${ORDERER_CA}"

if [[ "${INSTALL_CHAINCODE}" == "true" ]]; then
	if [[ -f "${NETWORK_DIR}/../chaincode/lexnet-cc/go.mod" ]]; then
		log "Packaging chaincode ${CHAINCODE_NAME}"
		run_govt_peer peer lifecycle chaincode package "${CHAINCODE_PACKAGE}" \
			--path "${CHAINCODE_SRC_PATH}" \
			--lang "${CHAINCODE_LANG}" \
			--label "${CHAINCODE_LABEL}"

		log "Installing chaincode package on GovtOrg peer"
		run_govt_peer peer lifecycle chaincode install "${CHAINCODE_PACKAGE}"

		log "Installing chaincode package on VerifierOrg peer"
		run_verifier_peer peer lifecycle chaincode install "${CHAINCODE_PACKAGE}"

		log "Installed chaincodes on GovtOrg peer"
		run_govt_peer peer lifecycle chaincode queryinstalled

		log "Installed chaincodes on VerifierOrg peer"
		run_verifier_peer peer lifecycle chaincode queryinstalled
	else
		log "Chaincode source not found at ../chaincode/lexnet-cc; cannot run lifecycle package/install."
		exit 1
	fi
else
	log "INSTALL_CHAINCODE=false, skipping lifecycle package/install for now."
fi

log "Network setup complete"

