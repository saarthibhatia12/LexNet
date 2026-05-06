// ============================================================================
// LexNet Backend — Fabric Network Configuration
// ============================================================================
//
// Connects to the Hyperledger Fabric network using the fabric-network SDK.
// Loads the connection profile and wallet, creates a gateway, and returns
// a contract handle for interacting with the LexNet chaincode.
//
// Retry logic: up to 3 attempts with 2-second backoff.
// ============================================================================

import { Gateway, Wallets } from 'fabric-network';
import type { Contract, X509Identity } from 'fabric-network';
import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';
import { logger } from './logger.js';
import { FabricError } from '../types/index.js';
import {
  FABRIC_RETRY_COUNT,
  FABRIC_RETRY_DELAY_MS,
} from '../utils/constants.js';

/** Singleton gateway instance — reused across requests */
let gatewayInstance: Gateway | null = null;

/** Cached contract handle */
let contractInstance: Contract | null = null;

/**
 * Sleep for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve a path from the backend working directory first, then from the repo root.
 */
function resolveProjectPath(targetPath: string): string {
  const candidates = [
    path.resolve(process.cwd(), targetPath),
    path.resolve(process.cwd(), '..', targetPath),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0]!;
}

/**
 * Read a text file and trim surrounding whitespace.
 */
function readTextFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8').trim();
}

/**
 * Build a connection profile dynamically from the checked-in crypto-config
 * material when a standalone JSON profile file is not present.
 */
function buildFallbackConnectionProfile(): Record<string, unknown> {
  const cryptoRoot = resolveProjectPath('blockchain/network/crypto-config');
  const govtOrgRoot = path.join(
    cryptoRoot,
    'peerOrganizations',
    'govtorg.lexnet.local'
  );
  const ordererRoot = path.join(
    cryptoRoot,
    'ordererOrganizations',
    'lexnet.local'
  );

  if (!fs.existsSync(govtOrgRoot) || !fs.existsSync(ordererRoot)) {
    throw new FabricError(
      'Fallback crypto-config material not found under blockchain/network/crypto-config'
    );
  }

  const govtPeerTlsCa = readTextFile(
    path.join(
      govtOrgRoot,
      'peers',
      'peer0.govtorg.lexnet.local',
      'tls',
      'ca.crt'
    )
  );
  const verifierPeerTlsCa = readTextFile(
    path.join(
      cryptoRoot,
      'peerOrganizations',
      'verifierorg.lexnet.local',
      'peers',
      'peer0.verifierorg.lexnet.local',
      'tls',
      'ca.crt'
    )
  );
  const ordererTlsCa = readTextFile(
    path.join(
      ordererRoot,
      'orderers',
      'orderer.lexnet.local',
      'tls',
      'ca.crt'
    )
  );

  return {
    name: 'lexnet-network',
    version: '1.0.0',
    client: {
      organization: 'GovtOrg',
      connection: {
        timeout: {
          peer: {
            endorser: '300',
          },
          orderer: '300',
        },
      },
    },
    organizations: {
      GovtOrg: {
        mspid: 'GovtOrgMSP',
        peers: ['peer0.govtorg.lexnet.local'],
      },
      VerifierOrg: {
        mspid: 'VerifierOrgMSP',
        peers: ['peer0.verifierorg.lexnet.local'],
      },
    },
    peers: {
      'peer0.govtorg.lexnet.local': {
        url: 'grpcs://localhost:7051',
        tlsCACerts: {
          pem: govtPeerTlsCa,
        },
        grpcOptions: {
          'ssl-target-name-override': 'peer0.govtorg.lexnet.local',
          hostnameOverride: 'peer0.govtorg.lexnet.local',
        },
      },
      'peer0.verifierorg.lexnet.local': {
        url: 'grpcs://localhost:9051',
        tlsCACerts: {
          pem: verifierPeerTlsCa,
        },
        grpcOptions: {
          'ssl-target-name-override': 'peer0.verifierorg.lexnet.local',
          hostnameOverride: 'peer0.verifierorg.lexnet.local',
        },
      },
    },
    orderers: {
      'orderer.lexnet.local': {
        url: 'grpcs://localhost:7050',
        tlsCACerts: {
          pem: ordererTlsCa,
        },
        grpcOptions: {
          'ssl-target-name-override': 'orderer.lexnet.local',
          hostnameOverride: 'orderer.lexnet.local',
        },
      },
    },
    channels: {
      [env.FABRIC_CHANNEL]: {
        orderers: ['orderer.lexnet.local'],
        peers: {
          'peer0.govtorg.lexnet.local': {},
          'peer0.verifierorg.lexnet.local': {},
        },
      },
    },
  };
}

/**
 * Import the GovtOrg admin identity from crypto-config into the configured
 * file-system wallet when no explicit wallet entry exists yet.
 */
async function importFallbackAdminIdentity(walletPath: string): Promise<void> {
  const adminMspPath = resolveProjectPath(
    'blockchain/network/crypto-config/peerOrganizations/govtorg.lexnet.local/users/Admin@govtorg.lexnet.local/msp'
  );

  if (!fs.existsSync(adminMspPath)) {
    throw new FabricError(
      `Fallback admin MSP not found at: ${adminMspPath}`
    );
  }

  const signcertsPath = path.join(adminMspPath, 'signcerts');
  const keystorePath = path.join(adminMspPath, 'keystore');

  const certFile = fs.readdirSync(signcertsPath).find((name) => name.endsWith('.pem'));
  const keyFile = fs.readdirSync(keystorePath).find((name) => name.endsWith('_sk'));

  if (!certFile || !keyFile) {
    throw new FabricError(
      `Admin identity files are incomplete under: ${adminMspPath}`
    );
  }

  const certificate = readTextFile(path.join(signcertsPath, certFile));
  const privateKey = readTextFile(path.join(keystorePath, keyFile));

  const identity: X509Identity = {
    credentials: {
      certificate,
      privateKey,
    },
    mspId: env.FABRIC_MSP_ID,
    type: 'X.509',
  };

  const wallet = await Wallets.newFileSystemWallet(walletPath);
  await wallet.put('admin', identity);

  logger.info('Imported fallback Fabric admin identity into wallet', {
    walletPath,
    mspId: env.FABRIC_MSP_ID,
  });
}

/**
 * Load the Fabric connection profile JSON from disk.
 *
 * @returns The parsed connection profile object
 * @throws FabricError if the file cannot be read or parsed
 */
function loadConnectionProfile(): Record<string, unknown> {
  const profilePath = resolveProjectPath(env.FABRIC_CONNECTION_PROFILE);

  if (fs.existsSync(profilePath)) {
    try {
      const raw = fs.readFileSync(profilePath, 'utf-8');
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new FabricError(`Failed to load connection profile: ${message}`);
    }
  }

  logger.warn('Fabric connection profile file not found, using fallback profile', {
    configuredPath: env.FABRIC_CONNECTION_PROFILE,
    resolvedPath: profilePath,
  });
  return buildFallbackConnectionProfile();
}

/**
 * Connect to the Hyperledger Fabric network and return a contract handle.
 *
 * This function:
 * 1. Loads the connection profile from disk
 * 2. Opens (or creates) a file-system wallet at FABRIC_WALLET_PATH
 * 3. Connects a Gateway using the 'admin' identity
 * 4. Gets the network (channel) and contract
 *
 * Retries up to 3 times with a 2-second backoff between attempts.
 *
 * @returns A Contract handle for submitting/evaluating transactions
 * @throws FabricError if all connection attempts fail
 */
export async function connectToFabric(): Promise<Contract> {
  // Return the cached contract if it exists
  if (contractInstance) {
    return contractInstance;
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= FABRIC_RETRY_COUNT; attempt++) {
    try {
      logger.info(`Connecting to Fabric network (attempt ${attempt}/${FABRIC_RETRY_COUNT})...`);

      // 1. Load connection profile
      const connectionProfile = loadConnectionProfile();

      // 2. Create / open the wallet
      const walletPath = resolveProjectPath(env.FABRIC_WALLET_PATH);
      const wallet = await Wallets.newFileSystemWallet(walletPath);

      // 3. Check that the identity exists in the wallet
      let identity = await wallet.get('admin');
      if (!identity) {
        logger.warn("Identity 'admin' not found in configured wallet, importing fallback identity", {
          walletPath,
        });
        await importFallbackAdminIdentity(walletPath);
        identity = await wallet.get('admin');
      }

      if (!identity) {
        throw new FabricError(
          `Identity 'admin' not found in wallet at ${walletPath}. ` +
          `Run the enrollment script to register admin credentials.`
        );
      }

      // 4. Create and connect the gateway
      const gateway = new Gateway();
      await gateway.connect(connectionProfile, {
        wallet,
        identity: 'admin',
        discovery: {
          enabled: true,
          asLocalhost: true, // Required when running Fabric in Docker on localhost
        },
      });

      // 5. Get the network (channel) and contract
      const network = await gateway.getNetwork(env.FABRIC_CHANNEL);
      const contract = network.getContract(env.FABRIC_CHAINCODE);

      // Cache the instances
      gatewayInstance = gateway;
      contractInstance = contract;

      logger.info('Successfully connected to Fabric network', {
        channel: env.FABRIC_CHANNEL,
        chaincode: env.FABRIC_CHAINCODE,
        mspId: env.FABRIC_MSP_ID,
      });

      return contract;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));

      logger.warn(`Fabric connection attempt ${attempt} failed`, {
        error: lastError.message,
        attempt,
        maxAttempts: FABRIC_RETRY_COUNT,
      });

      if (attempt < FABRIC_RETRY_COUNT) {
        await sleep(FABRIC_RETRY_DELAY_MS);
      }
    }
  }

  throw new FabricError(
    `Failed to connect after ${FABRIC_RETRY_COUNT} attempts. Last error: ${lastError?.message ?? 'Unknown'}`
  );
}

/**
 * Get the cached contract instance.
 * Throws if not yet connected — call connectToFabric() first.
 *
 * @returns The cached Contract handle
 * @throws FabricError if not connected
 */
export function getContract(): Contract {
  if (!contractInstance) {
    throw new FabricError(
      'Not connected to Fabric network. Call connectToFabric() first.'
    );
  }
  return contractInstance;
}

/**
 * Disconnect from the Fabric network and clear cached instances.
 * Safe to call even if not connected.
 */
export function disconnectFabric(): void {
  if (gatewayInstance) {
    gatewayInstance.disconnect();
    gatewayInstance = null;
    contractInstance = null;
    logger.info('Disconnected from Fabric network');
  }
}
