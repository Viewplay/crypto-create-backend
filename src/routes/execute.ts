// File: src/routes/execute.ts
import express from "express";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { connection, serverKeypair, UPDATE_AUTHORITY_BURN } from "../config";
import { getCheckoutOrder, deleteCheckoutOrder } from "./checkout";
import { verifyPaymentTx } from "../solana/verifyPayment";
import { createTokenWithMetadata } from "../solana/createToken";
import { deriveRecipientKeypair } from "../solana/deriveRecipient";
import { sweepToTreasury } from "../solana/sweep";

const router = express.Router();

const ExecuteSchema = z.object({
  orderId: z.string().min(8),
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
});

router.post("/", async (req, res) => {
  const parsed = ExecuteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { orderId, paymentSignature, token } = parsed.data;

  try {
    // Load order created by /checkout (in-memory, TTL 30 min)
    const order = getCheckoutOrder(orderId);
    if (!order) return res.status(404).json({ error: "Order not found or expired" });

    const now = Date.now();
    if (order.expiresAt <= now) {
      deleteCheckoutOrder(orderId);
      return res.status(404).json({ error: "Order not found or expired" });
    }

    // Derive the unique recipient keypair for THIS order
    const recipientKp = deriveRecipientKeypair(orderId);
    const recipientPk = recipientKp.publicKey;

    // Safety check (should always match)
    if (recipientPk.toBase58() !== order.recipient) {
      return res.status(500).json({ error: "Recipient derivation mismatch" });
    }

    const buyerPk = new PublicKey(order.buyer);

    // Verify payment: buyer signed, transfer sent to derived recipient, exact lamports match
    await verifyPaymentTx({
      connection,
      signature: paymentSignature,
      expectedReceiver: recipientPk,
      expectedLamports: order.expectedLamports,
      expectedSigner: buyerPk,
    });

    // Sweep SOL from derived recipient wallet to your main treasury wallet
    const sweep = await sweepToTreasury({
      connection,
      from: recipientKp,
    });

    // Create token + metadata + apply options
    const out = await createTokenWithMetadata({
      connection,
      feePayer: serverKeypair,
      buyer: buyerPk,
      token,
      options: order.options,
      updateAuthorityBurn: UPDATE_AUTHORITY_BURN,
    });

    // Cleanup
    deleteCheckoutOrder(orderId);

    return res.json({
      mode: "order",
      orderId,
      mintAddress: out.mint.toBase58(),
      metadataUri: out.metadataUri,
      signatures: out.signatures,
      explorer: {
        mint: `https://solscan.io/token/${out.mint.toBase58()}`,
        txs: out.signatures.map((s) => `https://solscan.io/tx/${s}`),
        metadataUri: out.metadataUri,
      },
      receiverChecked: order.recipient,
      pricingCheckedLamports: order.expectedLamports,
      appliedOptions: order.options,
      sweep: {
        sweptLamports: sweep.sweptLamports,
        signature: sweep.signature ?? null,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Execute failed" });
  }
});

export default router;