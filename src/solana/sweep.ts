// File: src/solana/sweep.ts
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { RECEIVER_WALLET } from "../config";

/**
 * Sweep (transfer) all SOL from a temporary recipient wallet to the main treasury wallet.
 *
 * Why:
 * - In Solution C, each order uses a unique recipient address (with private key).
 * - We must move funds out to your main wallet after payment.
 *
 * Notes:
 * - We keep a small buffer to avoid "insufficient funds" due to fees.
 * - If the balance is too small, we skip sweeping.
 */
export async function sweepToTreasury(params: {
  connection: Connection;
  from: Keypair; // the derived recipient keypair
  to?: PublicKey; // default RECEIVER_WALLET
  keepLamports?: number; // buffer for fees
}): Promise<{
  sweptLamports: number;
  signature?: string;
}> {
  const { connection, from } = params;
  const to = params.to ?? RECEIVER_WALLET;
  const keep = params.keepLamports ?? 10_000; // ~0.00001 SOL buffer

  const balance = await connection.getBalance(from.publicKey, "confirmed");
  const transferable = balance - keep;

  if (transferable <= 0) {
    return { sweptLamports: 0 };
  }

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to,
      lamports: transferable,
    })
  );

  const sig = await sendAndConfirmTransaction(connection, tx, [from], {
    commitment: "confirmed",
  });

  return { sweptLamports: transferable, signature: sig };
}