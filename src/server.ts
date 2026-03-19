import express from "express";
import cors from "cors";
import { CORS_ORIGIN, PORT } from "./config";
import orderRouter from "./routes/order";
import uploadRouter from "./routes/upload";
import executeRouter from "./routes/execute";

const app = express();

app.use(
  cors({
    origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN,
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/v1/solana/order", orderRouter);
app.use("/v1/solana/upload-image", uploadRouter);
app.use("/v1/solana/execute", executeRouter);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API running on http://localhost:${PORT}`);
});
