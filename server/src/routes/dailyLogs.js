// server/src/routes/dailyLogs.js
import express from "express";
import {
  insertDailyLog,
  findTodayLogs,
  findDailyLogById,
} from "../dao/dailyLogsDao.js";
import { isUserPro } from "../dao/subscriptionsDao.js";

const router = express.Router();

/**
 * =====================================================
 * POST /daily-logs
 * 保存のみ
 * =====================================================
 */
router.post("/", async (req, res) => {
  try {
    const { user_id, log_date, payload } = req.body;

    if (!user_id || !log_date || !payload) {
      return res.status(400).json({
        error: true,
        message: "user_id, log_date, payload are required",
      });
    }

    // 今日のログ取得
    const todayLogs = await findTodayLogs(user_id, log_date);

    if (todayLogs.length >= 1) {
      const isPro = await isUserPro(user_id);

      if (!isPro) {
        return res.status(403).json({
          error: true,
          code: "DAILY_LIMIT_EXCEEDED",
          message:
            "本日のログはすでに作成済みです。有料プランで複数作成できます。",
        });
      }
    }

    const saved = await insertDailyLog({
      user_id,
      log_date,
      payload,
    });

    return res.status(201).json({
      message: "daily log saved",
      data: saved,
    });
  } catch (error) {
    console.error("POST /daily-logs error:", error);
    return res.status(500).json({
      error: true,
      message: "failed to save daily log",
    });
  }
});

/**
 * =====================================================
 * GET /daily-logs/today?user_id=xxx
 * 今日のログ一覧取得
 * =====================================================
 */
router.get("/today", async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({
        error: true,
        message: "user_id is required",
      });
    }

    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = jst.toISOString().slice(0, 10);

    const logs = await findTodayLogs(user_id, today);

    return res.json({
      message: "today logs fetched",
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    console.error("GET /daily-logs/today error:", error);
    return res.status(500).json({
      error: true,
      message: "failed to fetch today logs",
    });
  }
});

/**
 * =====================================================
 * GET /daily-logs/:id
 * 詳細取得
 * =====================================================
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const log = await findDailyLogById(id);

    if (!log) {
      return res.status(404).json({
        error: true,
        message: "daily log not found",
      });
    }

    return res.json({
      message: "daily log fetched",
      data: log,
    });
  } catch (error) {
    console.error("GET /daily-logs/:id error:", error);
    return res.status(500).json({
      error: true,
      message: "failed to fetch daily log",
    });
  }
});

export default router;
