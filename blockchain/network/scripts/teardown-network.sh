#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${NETWORK_DIR}/docker-compose-fabric.yaml"

log() {
	echo "[teardown-network] $*"
}

if ! command -v docker >/dev/null 2>&1; then
	log "Docker is required but was not found in PATH."
	exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
	log "docker compose is required but not available."
	exit 1
fi

log "Stopping Fabric containers and removing associated volumes"
docker compose -f "${COMPOSE_FILE}" down --volumes --remove-orphans || true

log "Removing generated crypto material and channel artifacts"
rm -rf \
	"${NETWORK_DIR}/crypto-config" \
	"${NETWORK_DIR}/channel-artifacts" \
	"${NETWORK_DIR}/fabric-ca"

mkdir -p "${NETWORK_DIR}/channel-artifacts"

log "Removing transient chaincode dev images"
dev_images="$(docker images --format '{{.Repository}} {{.ID}}' | awk '$1 ~ /^dev-peer/ {print $2}' | sort -u)"
if [[ -n "${dev_images}" ]]; then
	# shellcheck disable=SC2086
	docker rmi -f ${dev_images} >/dev/null 2>&1 || true
fi

log "Teardown complete"

