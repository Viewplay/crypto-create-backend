// File: src/solana/deriveRecipient.ts
import crypto from "crypto";
import { Keypair } from "@solana/web3.js";
import { RECIPIENT_MASTER_SECRET } from "../config";

/**
 * Deterministic recipient per order.
 *
 * We derive a 32-byte seed from:
 *   HMAC_SHA256(masterSecret, "recipient:" + orderId)
 *
 * Then:
 *   Keypair.fromSeed(seed)
 *
 * This lets us re-generate the same keypair later without storing private keys.
 * Keep RECIPIENT_MASTER_SECRET secret (Render env var).
 */
export function deriveRecipientKeypair(orderId: string): Keypair {
  if (!orderId || orderId.length < 8) throw new Error("Invalid orderId for recipient derivation");

  const h = crypto.createHmac("sha256", RECIPIENT_MASTER_SECRET);
  h.update("recipient:");
  h.update(orderId);
  const digest = h.digest(); // 32 bytes

  // Keypair.fromSeed expects 32 bytes
  if (digest.length !== 32) throw new Error("Bad seed length");
  return Keypair.fromSeed(new Uint8Array(digest));
}