import express from "express";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { connection } from "../config";
import { getOrder, deleteOrder } from "./order";
import { findPaymentSignature } from "../solana/scanPayment";

const router = express.Router();

const ParamsSchema = z.object({
  orderId: z.string().min(8),
});

router.get("/:orderId", async (req, res) => {
  const parsed = ParamsSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: "Invalid orderId" });

  const { orderId } = parsed.data;

  const order = getOrder(orderId);
  if (!order) return res.json({ status: "expired" });

  const now = Date.now();
  if (order.expiresAt <= now) {
    deleteOrder(orderId);
    return res.json({ status: "expired" });
  }

  try {
    const sig = await findPaymentSignature({
      connection,
      recipient: new PublicKey(order.recipient),
      buyer: new PublicKey(order.buyer),
      expectedLamports: order.expectedLamports,
      lookbackLimit: 30,
    });

    if (sig) {
      return res.json({
        status: "paid",
        orderId,
        paymentSignature: sig,
        recipient: order.recipient,
        expectedLamports: order.expectedLamports,
        expiresAt: order.expiresAt,
      });
    }

    return res.json({
      status: "pending",
      orderId,
      recipient: order.recipient,
      expectedLamports: order.expectedLamports,
      expiresAt: order.expiresAt,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Status check failed" });
  }
});

export default router;