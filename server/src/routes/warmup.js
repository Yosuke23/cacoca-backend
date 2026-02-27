// server/src/routes/warmup.js

import express from "express";

const router = express.Router();

router.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "warmup success",
    timestamp: new Date().toISOString(),
  });
});

export default router;
