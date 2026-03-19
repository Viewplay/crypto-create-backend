import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";

type ScanParams = {
  connection: Connection;
  recipient: PublicKey;
  buyer: PublicKey;
  expectedLamports: number;
  lookbackLimit?: number; // how many recent txs to inspect
};

function isTransferToRecipient(ix: any, recipient: PublicKey, expectedLamports: number): boolean {
  const pid = ix?.programId?.toBase58?.() ?? ix?.programId?.toString?.() ?? "";
  if (pid !== SystemProgram.programId.toBase58()) return false;

  const parsed = ix?.parsed;
  if (!parsed || parsed?.type !== "transfer") return false;

  const info = parsed?.info;
  const dest = info?.destination;
  const lamports = Number(info?.lamports ?? 0);

  return dest === recipient.toBase58() && lamports >= expectedLamports;
}

export async function findPaymentSignature(params: ScanParams): Promise<string | null> {
  const { connection, recipient, buyer, expectedLamports } = params;
  const limit = params.lookbackLimit ?? 30;

  const sigs = await connection.getSignaturesForAddress(recipient, { limit }, "confirmed");

  for (const s of sigs) {
    const sig = s.signature;

    const tx = await connection.getParsedTransaction(sig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) continue;

    const signerKeys = tx.transaction.message.accountKeys
      .filter((k) => k.signer)
      .map((k) => k.pubkey.toBase58());

    if (!signerKeys.includes(buyer.toBase58())) continue;

    const instructions = tx.transaction.message.instructions as any[];
    const ok = instructions.some((ix) => isTransferToRecipient(ix, recipient, expectedLamports));
    if (!ok) continue;

    return sig;
  }

  return null;
}