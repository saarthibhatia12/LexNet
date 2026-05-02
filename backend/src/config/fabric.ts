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
import type { Contract } from 'fabric-network';
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
 * Load the Fabric connection profile JSON from disk.
 *
 * @returns The parsed connection profile object
 * @throws FabricError if the file cannot be read or parsed
 */
function loadConnectionProfile(): Record<string, unknown> {
  const profilePath = path.resolve(process.cwd(), env.FABRIC_CONNECTION_PROFILE);

  if (!fs.existsSync(profilePath)) {
    throw new FabricError(
      `Connection profile not found at: ${profilePath}. ` +
      `Check FABRIC_CONNECTION_PROFILE in your .env file.`
    );
  }

  try {
    const raw = fs.readFileSync(profilePath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new FabricError(`Failed to load connection profile: ${message}`);
  }
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
      const walletPath = path.resolve(process.cwd(), env.FABRIC_WALLET_PATH);
      const wallet = await Wallets.newFileSystemWallet(walletPath);

      // 3. Check that the identity exists in the wallet
      const identity = await wallet.get('admin');
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
