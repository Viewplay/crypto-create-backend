import express from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  ADDON_PRICE_SOL,
  BASE_PRICE_SOL,
  RECEIVER_POOL,
  RESERVATION_TTL_MINUTES,
} from "../config";

const router = express.Router();

const RevokeOptionsSchema = z.object({
  revokeFreeze: z.boolean().default(false),
  revokeMint: z.boolean().default(false),
  revokeUpdate: z.boolean().default(false),
});

const OrderRequestSchema = z.object({
  buyer: z.string().min(32),
  options: RevokeOptionsSchema.optional().default({
    revokeFreeze: false,
    revokeMint: false,
    revokeUpdate: false,
  }),
});

export type Order = {
  orderId: string;
  buyer: string;
  createdAt: number;
  expiresAt: number;
  expectedLamports: number;
  options: z.infer<typeof RevokeOptionsSchema>;
  recipient: string; // assigned receiving address (base58)
};

type PoolItem = {
  address: string;
  reservedUntil: number; // epoch ms
  lastOrderId?: string;
};

const orders = new Map<string, Order>();

// Pool state (in-memory). Env var controls initial list.
const pool: PoolItem[] = RECEIVER_POOL.map((pk) => ({
  address: pk.toBase58(),
  reservedUntil: 0,
}));

const ORDER_TTL_MS = RESERVATION_TTL_MINUTES * 60 * 1000;

function computeExpectedLamports(options: z.infer<typeof RevokeOptionsSchema>): number {
  const addons =
    (options.revokeFreeze ? 1 : 0) +
    (options.revokeMint ? 1 : 0) +
    (options.revokeUpdate ? 1 : 0);

  const totalSol = BASE_PRICE_SOL + addons * ADDON_PRICE_SOL;
  return Math.round(totalSol * LAMPORTS_PER_SOL);
}

function cleanupExpiredReservations(): void {
  const now = Date.now();

  // Release expired orders
  for (const [id, o] of orders.entries()) {
    if (o.expiresAt <= now) {
      orders.delete(id);
      // release recipient
      const idx = pool.findIndex((p) => p.address === o.recipient);
      if (idx >= 0) {
        pool[idx].reservedUntil = 0;
        pool[idx].lastOrderId = undefined;
      }
    }
  }

  // Release any pool items that are past reservedUntil (safety)
  for (const p of pool) {
    if (p.reservedUntil && p.reservedUntil <= now) {
      p.reservedUntil = 0;
      p.lastOrderId = undefined;
    }
  }
}

function acquireRecipient(orderId: string): string | null {
  cleanupExpiredReservations();

  const now = Date.now();
  const ttlUntil = now + ORDER_TTL_MS;

  // Find first free
  const freeIndex = pool.findIndex((p) => !p.reservedUntil || p.reservedUntil <= now);
  if (freeIndex < 0) return null;

  // Reserve it
  const item = pool[freeIndex];
  item.reservedUntil = ttlUntil;
  item.lastOrderId = orderId;

  // Rotate: move to end of queue
  pool.splice(freeIndex, 1);
  pool.push(item);

  return item.address;
}

export function getOrder(orderId: string): Order | undefined {
  cleanupExpiredReservations();
  return orders.get(orderId);
}

export function deleteOrder(orderId: string): void {
  const o = orders.get(orderId);
  if (o) {
    // release recipient
    const idx = pool.findIndex((p) => p.address === o.recipient);
    if (idx >= 0) {
      pool[idx].reservedUntil = 0;
      pool[idx].lastOrderId = undefined;
    }
  }
  orders.delete(orderId);
}

router.post("/", (req, res) => {
  cleanupExpiredReservations();

  const parsed = OrderRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const buyerStr = parsed.data.buyer;
  try {
    // Validate base58 pubkey
    // eslint-disable-next-line no-new
    new PublicKey(buyerStr);
  } catch {
    return res.status(400).json({ error: "Invalid buyer public key" });
  }

  const options = parsed.data.options;
  const expectedLamports = computeExpectedLamports(options);

  const orderId = uuid();
  const recipient = acquireRecipient(orderId);

  if (!recipient) {
    return res.status(503).json({
      error: "No receiving address available",
      hint: "Increase RECEIVER_POOL size or wait for reservations to expire",
    });
  }

  const createdAt = Date.now();
  const expiresAt = createdAt + ORDER_TTL_MS;

  const order: Order = {
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