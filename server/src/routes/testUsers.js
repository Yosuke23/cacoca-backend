// server/src/routes/testUsers.js

// 商用向け改修時外す
import express from "express";

const router = express.Router();

// ★ 試験期間用：ハードコード
const TEST_USERS = {
  yosuke: {
    userId: "39d68eb1-80af-4499-862e-3677eb7efa55",
    name: "Yosuke Narumi",
  },
  chieko: {
    userId: "54e7b5ab-29dd-4cd5-9551-6b3dae16746d",
    name: "Chieko Narumi",
  },
};

router.get("/:key", (req, res) => {
  const { key } = req.params;
  const user = TEST_USERS[key];

  if (!user) {
    return res.status(404).json({ error: "user not found" });
  }

  res.json(user);
});

export default router;
