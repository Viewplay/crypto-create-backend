// File: src/routes/order.ts
import express from "express";
import checkoutRouter from "./checkout";

/**
 * Backward-compatible alias:
 * /v1/solana/order behaves like /v1/solana/checkout (Solution C).
 *
 * Returns: orderId, recipient (unique per order), expectedLamports, expiresAt, pricing.
 */
const router = express.Router();

router.post("/", (req, res, next) => {
  (checkoutRouter as any).handle(req, res, next);
});

export default router;