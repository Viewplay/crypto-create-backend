import express from "express";
import orderRouter from "./order";

/**
 * /checkout is a friendly alias to /order for the “payment page” flow.
 * It returns: orderId, recipient, expectedLamports, expiresAt, pricing.
 */
const router = express.Router();

router.post("/", (req, res, next) => {
  // Reuse the existing /order implementation
  (orderRouter as any).handle(req, res, next);
});

export default router;