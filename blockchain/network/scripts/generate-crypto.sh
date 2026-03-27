#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CHANNEL_NAME="${CHANNEL_NAME:-lexnet-channel}"
SYSTEM_CHANNEL_ID="${SYSTEM_CHANNEL_ID:-system-channel}"

is_windows_shell=false
if [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* ]]; then
	is_windows_shell=true
fi

to_tool_path() {
	local p="$1"
	if [[ "${is_windows_shell}" == "true" ]] && command -v cygpath >/dev/null 2>&1; then
		cygpath -w "${p}"
	else
		echo "${p}"
	fi
}

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

FABRIC_CFG_PATH_NATIVE="$(to_tool_path "${NETWORK_DIR}")"
CRYPTO_CONFIG_NATIVE="$(to_tool_path "${NETWORK_DIR}/crypto-config.yaml")"
CRYPTO_OUTPUT_NATIVE="$(to_tool_path "${NETWORK_DIR}/crypto-config")"
GENESIS_BLOCK_NATIVE="$(to_tool_path "${NETWORK_DIR}/channel-artifacts/genesis.block")"
CHANNEL_TX_NATIVE="$(to_tool_path "${NETWORK_DIR}/channel-artifacts/${CHANNEL_NAME}.tx")"
GOVT_ANCHOR_NATIVE="$(to_tool_path "${NETWORK_DIR}/channel-artifacts/GovtOrgMSPanchors.tx")"
VERIFIER_ANCHOR_NATIVE="$(to_tool_path "${NETWORK_DIR}/channel-artifacts/VerifierOrgMSPanchors.tx")"

export FABRIC_CFG_PATH="${FABRIC_CFG_PATH_NATIVE}"

log "Cleaning old crypto and channel artifacts"
rm -rf "${NETWORK_DIR}/crypto-config" "${NETWORK_DIR}/channel-artifacts"
mkdir -p "${NETWORK_DIR}/channel-artifacts"

log "Generating MSP crypto material with cryptogen"
cryptogen generate \
	--config="${CRYPTO_CONFIG_NATIVE}" \
	--output="${CRYPTO_OUTPUT_NATIVE}"

if [[ "${is_windows_shell}" == "true" ]]; then
	log "Normalizing generated MSP config paths for Linux containers"
	find "${NETWORK_DIR}/crypto-config" -type f -name "config.yaml" -exec sed -i 's|\\|/|g' {} +
fi

log "Generating orderer genesis block"
configtxgen \
	-profile LexNetOrdererGenesis \
	-channelID "${SYSTEM_CHANNEL_ID}" \
	-outputBlock "${GENESIS_BLOCK_NATIVE}"

log "Generating channel creation transaction for ${CHANNEL_NAME}"
configtxgen \
	-profile LexNetChannel \
	-channelID "${CHANNEL_NAME}" \
	-outputCreateChannelTx "${CHANNEL_TX_NATIVE}"

log "Generating GovtOrg anchor peer update"
configtxgen \
	-profile LexNetChannel \
	-channelID "${CHANNEL_NAME}" \
	-asOrg GovtOrgMSP \
	-outputAnchorPeersUpdate "${GOVT_ANCHOR_NATIVE}"

log "Generating VerifierOrg anchor peer update"
configtxgen \
	-profile LexNetChannel \
	-channelID "${CHANNEL_NAME}" \
	-asOrg VerifierOrgMSP \
	-outputAnchorPeersUpdate "${VERIFIER_ANCHOR_NATIVE}"

log "Crypto generation complete"

