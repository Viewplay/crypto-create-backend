// File: src/config.ts
import "dotenv/config";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getEnvNumber(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid number env: ${name}`);
  return n;
}

export const SOLANA_RPC_URL = mustGetEnv("SOLANA_RPC_URL");
export const connection = new Connection(SOLANA_RPC_URL, "confirmed");

/**
 * Main treasury wallet where you want to end up with profits.
 * Keep RECEIVER_WALLET as legacy (optional); your system uses deterministic recipients.
 */
export const RECEIVER_WALLET = new PublicKey(mustGetEnv("RECEIVER_WALLET"));

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

// Pinata
export const PINATA_JWT = process.env.PINATA_JWT ?? "";

// Reservation
export const RESERVATION_TTL_MINUTES = getEnvNumber("RESERVATION_TTL_MINUTES", 30);

/**
 * Pricing
 * PROD default: base=0.08, addon=0.07
 * TEST mode (Render env):
 *  - PRICING_MODE=TEST
 *  - TEST_BASE_PRICE_SOL=0.001
 *  - TEST_ADDON_PRICE_SOL=0
 */
const PRICING_MODE = (process.env.PRICING_MODE ?? "PROD").trim().toUpperCase();

const PROD_BASE_PRICE_SOL = 0.08;
const PROD_ADDON_PRICE_SOL = 0.07;

export const BASE_PRICE_SOL =
  PRICING_MODE === "TEST"
    ? getEnvNumber("TEST_BASE_PRICE_SOL", 0.001)
    : getEnvNumber("BASE_PRICE_SOL", PROD_BASE_PRICE_SOL);

export const ADDON_PRICE_SOL =
  PRICING_MODE === "TEST"
    ? getEnvNumber("TEST_ADDON_PRICE_SOL", 0)
    : getEnvNumber("ADDON_PRICE_SOL", PROD_ADDON_PRICE_SOL);

// Metaplex “burn-like” address for making updates impossible.
export const UPDATE_AUTHORITY_BURN = new PublicKey(
  process.env.UPDATE_AUTHORITY_BURN ?? "11111111111111111111111111111111"
);

// ===== Solution C (deterministic recipients) =====
export const RECIPIENT_MASTER_SECRET = mustGetEnv("RECIPIENT_MASTER_SECRET");

// Optional: sweep destination (profits). If not set, fallback to RECEIVER_WALLET.
export const TREASURY_WALLET = new PublicKey(
  process.env.TREASURY_WALLET ?? RECEIVER_WALLET.toBase58()
);

/**
 * Legacy pool (not used by Solution C), but kept for backwards compatibility.
 * If you still set it in Render, it won't break the build.
 */
export const RECEIVER_POOL: PublicKey[] = (process.env.RECEIVER_POOL ?? "")
  .split(/[,\s]+/)
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => new PublicKey(s));