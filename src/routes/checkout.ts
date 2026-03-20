// File: src/routes/checkout.ts
import express from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { ADDON_PRICE_SOL, BASE_PRICE_SOL, RESERVATION_TTL_MINUTES } from "../config";
import { deriveRecipientKeypair } from "../solana/deriveRecipient";

const router = express.Router();

const RevokeOptionsSchema = z.object({
  revokeFreeze: z.boolean().default(false),
  revokeMint: z.boolean().default(false),
  revokeUpdate: z.boolean().default(false),
});

const CheckoutSchema = z.object({
  buyer: z.string().min(32),
  options: RevokeOptionsSchema.optional().default({
    revokeFreeze: false,
    revokeMint: false,
    revokeUpdate: false,
  }),
});

export type CheckoutOrder = {
  orderId: string;
  buyer: string;
  createdAt: number;
  expiresAt: number;
  expectedLamports: number;
  options: z.infer<typeof RevokeOptionsSchema>;
  recipient: string; // unique per order (base58)
};

const orders = new Map<string, CheckoutOrder>();
const ORDER_TTL_MS = RESERVATION_TTL_MINUTES * 60 * 1000;

function cleanupExpiredOrders(): void {
  const now = Date.now();
  for (const [id, o] of orders.entries()) {
    if (o.expiresAt <= now) orders.delete(id);
  }
}

function computeExpectedLamports(options: z.infer<typeof RevokeOptionsSchema>): number {
  const addons =
    (options.revokeFreeze ? 1 : 0) +
    (options.revokeMint ? 1 : 0) +
    (options.revokeUpdate ? 1 : 0);

  const totalSol = BASE_PRICE_SOL + addons * ADDON_PRICE_SOL;
  return Math.round(totalSol * LAMPORTS_PER_SOL);
}

export function getCheckoutOrder(orderId: string): CheckoutOrder | undefined {
  cleanupExpiredOrders();
  return orders.get(orderId);
}

export function deleteCheckoutOrder(orderId: string): void {
  orders.delete(orderId);
}

router.post("/", (req, res) => {
  cleanupExpiredOrders();

  const parsed = CheckoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const buyerStr = parsed.data.buyer;
  try {
    // eslint-disable-next-line no-new
    new PublicKey(buyerStr);
  } catch {
    return res.status(400).json({ error: "Invalid buyer public key" });
  }

  const options = parsed.data.options;

  const orderId = uuid();
  const recipient = deriveRecipientKeypair(orderId).publicKey.toBase58();

  const createdAt = Date.now();
  const expiresAt = createdAt + ORDER_TTL_MS;

  const expectedLamports = computeExpectedLamports(options);

  const order: CheckoutOrder = {
    orderId,
    buyer: buyerStr,
    createdAt,
    expiresAt,
    expectedLamports,
    options,
    recipient,
  };

  orders.set(orderId, order);

  return res.json({
    orderId,
    recipient,
    expectedLamports,
    expiresAt,
    pricing: {
      baseSol: BASE_PRICE_SOL,
      addonSol: ADDON_PRICE_SOL,
      options,
      totalSol: expectedLamports / LAMPORTS_PER_SOL,
    },
  });
});

export default router;