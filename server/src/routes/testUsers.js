// server/src/routes/testUsers.js

// 商用向け改修時外す
import express from "express";

const router = express.Router();

// ★ 試験期間用：ハードコード
const TEST_USERS = {
  yosuke: {
    userId: "baa16ad9-0db2-4818-95b5-2f5c893911d3",
    name: "Yosuke Narumi",
  },
  chieko: {
    userId: "c944214c-a62a-4f7e-8b53-1b26ef3c3402",
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
