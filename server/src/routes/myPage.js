// server/src/routes/myPage.js
import express from "express";
import { isUserPro } from "../dao/subscriptionsDao.js";

const router = express.Router();

/**
 * GET /mypage?user_id=xxx
 *
 * 役割：
 * - マイページ初期表示用の軽量API
 * - 画面を即描画するための最小情報だけ返す
 */
router.get("/", async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({
        error: true,
        message: "user_id is required",
      });
    }

    const pro = await isUserPro(user_id);

    return res.json({
      message: "mypage fetched",
      data: {
        is_pro: pro,
      },
    });
  } catch (error) {
    console.error("GET /mypage error:", error);
    return res.status(500).json({
      error: true,
      message: "failed to fetch mypage",
    });
  }
});
export default router;
