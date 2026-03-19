import express from "express";
import multer from "multer";
import { z } from "zod";
import { uploadToNftStorage } from "../storage/nftStorage";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

const UploadSchema = z.object({
  orderId: z.string().min(1),
});

router.post("/", upload.single("image"), async (req, res) => {
  try {
    const parsed = UploadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    if (!req.file) return res.status(400).json({ error: "Missing image file" });

    if (!process.env.PINATA_JWT) {
      return res.status(400).json({
        error: "PINATA_JWT missing",
        hint: "Set PINATA_JWT in .env to enable IPFS upload via Pinata",
      });
    }

    const imageUrl = await uploadToNftStorage({
      filename: req.file.originalname || "logo.png",
      contentType: req.file.mimetype || "image/png",
      buffer: req.file.buffer,
    });

    return res.json({ imageUrl, provider: "pinata" });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Upload failed" });
  }
});

export default router;