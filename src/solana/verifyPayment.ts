import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";

type Params = {
  connection: Connection;
  signature: string;
  expectedReceiver: PublicKey;
  expectedLamports: number;
  expectedSigner: PublicKey;
};

export async function verifyPaymentTx(params: Params): Promise<void> {
  const { connection, signature, expectedReceiver, expectedLamports, expectedSigner } = params;

  const tx = await connection.getParsedTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) throw new Error("Payment transaction not found (not confirmed yet?)");

  // 1) Signer must be the buyer
  const accountKeys = tx.transaction.message.accountKeys;
  const signerKeys = accountKeys
    .filter((k) => k.signer)
    .map((k) => k.pubkey.toBase58());

  if (!signerKeys.includes(expectedSigner.toBase58())) {
    throw new Error("Payment signer mismatch");
  }

  // 2) Must contain SystemProgram transfer to receiver with enough lamports
  const instructions = tx.transaction.message.instructions as any[];
  let transferOk = false;

  for (const ix of instructions) {
    const programId =
      ix?.programId?.toBase58?.() ?? ix?.programId?.toString?.() ?? "";
    if (programId !== SystemProgram.programId.toBase58()) continue;

    const parsed = ix?.parsed;
    if (!parsed || parsed?.type !== "transfer") continue;

    const info = parsed?.info;
    const dest = info?.destination;
    const lamports = Number(info?.lamports ?? 0);

    if (dest === expectedReceiver.toBase58() && lamports >= expectedLamports) {
      transferOk = true;
      break;
    }
  }

  if (!transferOk) throw new Error("Payment transfer not found or amount too low");
}