import "dotenv/config";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function parsePublicKeysCsv(csv: string): PublicKey[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => new PublicKey(s));
}

export const SOLANA_RPC_URL = mustGetEnv("SOLANA_RPC_URL");
export const connection = new Connection(SOLANA_RPC_URL, "confirmed");

// ===== Receiving wallets (POOL) =====
// Preferred: RECEIVER_POOL=addr1,addr2,addr3...
// Fallback: RECEIVER_WALLET=single_address
export const RECEIVER_POOL: PublicKey[] = (() => {
  const pool = (process.env.RECEIVER_POOL ?? "").trim();
  if (pool) return parsePublicKeysCsv(pool);

  const single = mustGetEnv("RECEIVER_WALLET");
  return [new PublicKey(single)];
})();

export const RESERVATION_TTL_MINUTES = Number(process.env.RESERVATION_TTL_MINUTES ?? 30);

// ===== Server signer =====
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

// Pricing
export const BASE_PRICE_SOL = 0.08;
export const ADDON_PRICE_SOL = 0.1;

export const UPDATE_AUTHORITY_BURN = new PublicKey(
  process.env.UPDATE_AUTHORITY_BURN ?? "11111111111111111111111111111111"
);