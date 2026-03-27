#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CHANNEL_NAME="${CHANNEL_NAME:-lexnet-channel}"
SYSTEM_CHANNEL_ID="${SYSTEM_CHANNEL_ID:-system-channel}"

log() {
	echo "[generate-crypto] $*"
}

ensure_tool() {
	local tool="$1"
	if command -v "${tool}" >/dev/null 2>&1; then
		return
	fi

	local local_bin="${NETWORK_DIR}/../../fabric-samples/bin"
	if [[ -d "${local_bin}" ]]; then
		export PATH="${local_bin}:${PATH}"
	fi

	if ! command -v "${tool}" >/dev/null 2>&1; then
		log "Missing required binary: ${tool}"
		log "Install Hyperledger Fabric binaries or clone fabric-samples so ${local_bin} exists."
		exit 1
	fi
}

ensure_tool cryptogen
ensure_tool configtxgen

export FABRIC_CFG_PATH="${NETWORK_DIR}"

log "Cleaning old crypto and channel artifacts"
rm -rf "${NETWORK_DIR}/crypto-config" "${NETWORK_DIR}/channel-artifacts"
mkdir -p "${NETWORK_DIR}/channel-artifacts"

log "Generating MSP crypto material with cryptogen"
cryptogen generate \
	--config="${NETWORK_DIR}/crypto-config.yaml" \
	--output="${NETWORK_DIR}/crypto-config"

log "Generating orderer genesis block"
configtxgen \
	-profile LexNetOrdererGenesis \
	-channelID "${SYSTEM_CHANNEL_ID}" \
	-outputBlock "${NETWORK_DIR}/channel-artifacts/genesis.block"

log "Generating channel creation transaction for ${CHANNEL_NAME}"
configtxgen \
	-profile LexNetChannel \
	-channelID "${CHANNEL_NAME}" \
	-outputCreateChannelTx "${NETWORK_DIR}/channel-artifacts/${CHANNEL_NAME}.tx"

log "Generating GovtOrg anchor peer update"
configtxgen \
	-profile LexNetChannel \
	-channelID "${CHANNEL_NAME}" \
	-asOrg GovtOrgMSP \
	-outputAnchorPeersUpdate "${NETWORK_DIR}/channel-artifacts/GovtOrgMSPanchors.tx"

log "Generating VerifierOrg anchor peer update"
configtxgen \
	-profile LexNetChannel \
	-channelID "${CHANNEL_NAME}" \
	-asOrg VerifierOrgMSP \
	-outputAnchorPeersUpdate "${NETWORK_DIR}/channel-artifacts/VerifierOrgMSPanchors.tx"

log "Crypto generation complete"

