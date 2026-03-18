// server/src/routes/myPage.js
import express from "express";
import { isUserPro } from "../dao/subscriptionsDao.js";
import { runDerivedJobsIfNeeded } from "../services/runDerivedJobsService.js";

const router = express.Router();

function formatTodayJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

/**
 * GET /mypage?user_id=xxx
 *
 * 役割：
 * - マイページ初期表示用の軽量API
 * - 画面を即描画するための最小情報だけ返す
 * - 集約系ジョブの起点はここだけにする
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
    const triggerDate = formatTodayJst();

    try {
      await runDerivedJobsIfNeeded(user_id, triggerDate);
    } catch (derivedJobsError) {
      console.error("GET /mypage derived jobs error:", derivedJobsError);
    }

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
