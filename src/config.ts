import "dotenv/config";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const SOLANA_RPC_URL = mustGetEnv("SOLANA_RPC_URL");
export const connection = new Connection(SOLANA_RPC_URL, "confirmed");

/**
 * This is YOUR main wallet (treasury).
 * Funds will be swept here from the unique per-order receiving addresses.
 */
export const RECEIVER_WALLET = new PublicKey(mustGetEnv("RECEIVER_WALLET"));

/**
 * Deterministic unique-address system (Solution C).
 *
 * Put a strong secret here (DO NOT share it, DO NOT commit it to Git).
 * Example: 64+ random chars.
 *
 * On Render: Environment -> add RECIPIENT_MASTER_SECRET
 */
export const RECIPIENT_MASTER_SECRET = mustGetEnv("RECIPIENT_MASTER_SECRET");

/**
 * Provide ONE of:
 * - SERVER_KEYPAIR_BASE58 (recommended): base58-encoded secretKey bytes
 * - SERVER_KEYPAIR_JSON: JSON array of secretKey bytes, e.g. [12,34,...]
 */
export function loadServerKeypair(): Keypair {
  const b58 = process.env.SERVER_KEYPAIR_BASE58;
  if (b58) {
    const secret = bs58.decode(b58.trim());
    return Keypair.fromSecretKey(secret);
  }

  const json = process.env.SERVER_KEYPAIR_JSON;
  if (json) {
    const arr = JSON.parse(json) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }

  throw new Error("Missing env: SERVER_KEYPAIR_BASE58 or SERVER_KEYPAIR_JSON");
}

export const serverKeypair = loadServerKeypair();

export const PORT = Number(process.env.PORT ?? 3000);
export const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";

export const NFT_STORAGE_TOKEN = process.env.NFT_STORAGE_TOKEN ?? "";

// Pricing
export const BASE_PRICE_SOL = 0.08;
export const ADDON_PRICE_SOL = 0.07;

// Reservation TTL (minutes) for payment window
export const RESERVATION_TTL_MINUTES = Number(process.env.RESERVATION_TTL_MINUTES ?? 30);

// Metaplex “burn-like” address for making updates impossible.
export const UPDATE_AUTHORITY_BURN = new PublicKey(
  process.env.UPDATE_AUTHORITY_BURN ?? "11111111111111111111111111111111"
);