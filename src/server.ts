import express from "express";
import cors from "cors";
import { CORS_ORIGIN, PORT, serverKeypair } from "./config";
import orderRouter from "./routes/order";
import uploadRouter from "./routes/upload";
import executeRouter from "./routes/execute";
import checkoutRouter from "./routes/checkout";
import statusRouter from "./routes/status";

const app = express();

app.use(
  cors({
    origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN,
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Debug: show server fee-payer public key (to top up SOL for rent/fees)
app.get("/v1/solana/server-public", (_req, res) =>
  res.json({ serverFeePayer: serverKeypair.publicKey.toBase58() })
);

app.use("/v1/solana/order", orderRouter);
app.use("/v1/solana/upload-image", uploadRouter);
app.use("/v1/solana/execute", executeRouter);
app.use("/v1/solana/checkout", checkoutRouter);
app.use("/v1/solana/status", statusRouter);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API running on http://localhost:${PORT}`);
});