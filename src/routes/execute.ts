import express from "express";
import { z } from "zod";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  connection,
  serverKeypair,
  UPDATE_AUTHORITY_BURN,
  RECEIVER_POOL,
  BASE_PRICE_SOL,
  ADDON_PRICE_SOL,
} from "../config";
import { getOrder, deleteOrder } from "./order";
import { verifyPaymentTx } from "../solana/verifyPayment";
import { createTokenWithMetadata } from "../solana/createToken";

const router = express.Router();

const RevokeOptionsSchema = z.object({
  revokeFreeze: z.boolean().default(false),
  revokeMint: z.boolean().default(false),
  revokeUpdate: z.boolean().default(false),
});

const ExecuteSchema = z.object({
  // orderId optional: if missing/expired, we recover from on-chain tx
  orderId: z.string().min(8).optional(),
  paymentSignature: z.string().min(20),

  token: z.object({
    name: z.string().min(1).max(32),
    symbol: z.string().min(1).max(10),
    decimals: z.number().int().min(0).max(9),
    supply: z.string().regex(/^\d+$/),
    description: z.string().max(500).optional().default(""),
    imageUrl: z.string().min(3),
    social: z
      .object({
        website: z.string().url().optional(),
        twitter: z.string().url().optional(),
        telegram: z.string().url().optional(),
        discord: z.string().url().optional(),
      })
      .optional()
      .default({}),
  }),

  // Only used in recovery mode; in normal mode options come from the order
  options: RevokeOptionsSchema.optional().default({
    revokeFreeze: false,
    revokeMint: false,
    revokeUpdate: false,
  }),
});

function computeExpectedLamports(options: z.infer<typeof RevokeOptionsSchema>): number {
  const addons =
    (options.revokeFreeze ? 1 : 0) +
    (options.revokeMint ? 1 : 0) +
    (options.revokeUpdate ? 1 : 0);

  const totalSol = BASE_PRICE_SOL + addons * ADDON_PRICE_SOL;
  return Math.round(totalSol * LAMPORTS_PER_SOL);
}

function isInReceiverPool(dest: string): boolean {
  return RECEIVER_POOL.some((pk) => pk.toBase58() === dest);
}

async function extractTransferAndSigner(signature: string): Promise<{
  signer: string;
  dest: string;
  lamports: number;
}> {
  const tx = await connection.getParsedTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) throw new Error("Payment transaction not found (not confirmed yet?)");

  const signer = tx.transaction.message.accountKeys
    .filter((k) => k.signer)
    .map((k) => k.pubkey.toBase58())[0];

  if (!signer) throw new Error("No signer found in payment tx");

  const instructions = tx.transaction.message.instructions as any[];
  for (const ix of instructions) {
    const pid = ix?.programId?.toBase58?.() ?? ix?.programId?.toString?.() ?? "";
    if (pid !== SystemProgram.programId.toBase58()) continue;

    const parsed = ix?.parsed;
    if (!parsed || parsed?.type !== "transfer") continue;

    const info = parsed?.info;
    const dest = info?.destination;
    const lamports = Number(info?.lamports ?? 0);

    if (dest && lamports > 0) return { signer, dest, lamports };
  }

  throw new Error("No SOL transfer found in payment tx");
}

router.post("/", async (req, res) => {
  const parsed = ExecuteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { orderId, paymentSignature, token, options } = parsed.data;

  try {
    // ===== Normal mode: order exists =====
    const order = orderId ? getOrder(orderId) : undefined;
    if (order) {
      const buyerPk = new PublicKey(order.buyer);
      const recipientPk = new PublicKey(order.recipient);

      await verifyPaymentTx({
        connection,
        signature: paymentSignature,
        expectedReceiver: recipientPk,
        expectedLamports: order.expectedLamports,
        expectedSigner: buyerPk,
      });

      const out = await createTokenWithMetadata({
        connection,
        feePayer: serverKeypair,
        buyer: buyerPk,
        token,
        options: order.options,
        updateAuthorityBurn: UPDATE_AUTHORITY_BURN,
      });

      deleteOrder(orderId!);

      return res.json({
        mode: "order",
        orderId,
        mintAddress: out.mint.toBase58(),
        metadataUri: out.metadataUri,
        signatures: out.signatures,
        explorer: {
          mint: `https://solscan.io/token/${out.mint.toBase58()}`,
          txs: out.signatures.map((s) => `https://solscan.io/tx/${s}`),
        },
        receiverChecked: order.recipient,
        pricingCheckedLamports: order.expectedLamports,
        appliedOptions: order.options,
      });
    }

    // ===== Recovery mode: order missing/expired/restarted =====
    const info = await extractTransferAndSigner(paymentSignature);

    if (!isInReceiverPool(info.dest)) {
      return res.status(400).json({ error: "Payment destination not in RECEIVER_POOL" });
    }

    const expectedLamports = computeExpectedLamports(options);

    // Strict pricing check: must match what options claim
    if (info.lamports < expectedLamports) {
      return res.status(400).json({ error: "Payment amount too low for selected options" });
    }

    const buyerPk = new PublicKey(info.signer);
    const recipientPk = new PublicKey(info.dest);

    await verifyPaymentTx({
      connection,
      signature: paymentSignature,
      expectedReceiver: recipientPk,
      expectedLamports,
      expectedSigner: buyerPk,
    });

    const out = await createTokenWithMetadata({
      connection,
      feePayer: serverKeypair,
      buyer: buyerPk,
      token,
      options,
      updateAuthorityBurn: UPDATE_AUTHORITY_BURN,
    });

    return res.json({
      mode: "recovery",
      mintAddress: out.mint.toBase58(),
      metadataUri: out.metadataUri,
      signatures: out.signatures,
      explorer: {
        mint: `https://solscan.io/token/${out.mint.toBase58()}`,
        txs: out.signatures.map((s) => `https://solscan.io/tx/${s}`),
      },
      receiverChecked: info.dest,
      pricingCheckedLamports: expectedLamports,
      appliedOptions: options,
      recoveredBuyer: info.signer,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Execute failed" });
  }
});

export default router;