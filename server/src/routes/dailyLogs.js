// server/src/routes/dailyLogs.js
import express from "express";
import {
  insertDailyLog,
  findTodayLogs,
  findDailyLogByIdAndUser,
  updateDailyLogByIdAndUser,
  countLogsByUserAndDate,
  findDailyLogsByUser,
} from "../dao/dailyLogsDao.js";
import { isUserPro } from "../dao/subscriptionsDao.js";
import { runDerivedJobsIfNeeded } from "../services/runDerivedJobsService.js";
import { syncDerivedDataAfterEdit } from "../services/dailyLogEditSyncService.js";
import { saveDailyLogAiComment } from "../services/dailyLogAiCommentService.js";
import { findLatestAiCommentByDailyLogId } from "../dao/dailyLogAiCommentsDao.js";
import { getAiCommentEnabledByUserId } from "../dao/usersDao.js";

const router = express.Router();

/**
 * POST /daily-logs
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

    const count = await countLogsByUserAndDate(user_id, log_date);

    if (count >= 1) {
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

    let derived = {
      ai_comment: null,
      ai_comment_enabled: true,
    };

    const pro = await isUserPro(user_id);

    if (pro) {
      try {
        const aiCommentResult = await saveDailyLogAiComment(
          user_id,
          saved.id,
          payload,
        );

        derived = {
          ai_comment: aiCommentResult.ai_comment,
          ai_comment_enabled: aiCommentResult.ai_comment_enabled,
        };
      } catch (aiCommentError) {
        console.error("POST /daily-logs ai comment error:", aiCommentError);
      }
    }

    try {
      await runDerivedJobsIfNeeded(user_id, log_date);
    } catch (derivedJobsError) {
      console.error("POST /daily-logs derived jobs error:", derivedJobsError);
    }

    return res.status(201).json({
      message: "daily log saved",
      data: saved,
      ai_comment: derived.ai_comment
        ? {
            id: derived.ai_comment.id,
            comment_text: derived.ai_comment.comment_text,
          }
        : null,
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
 * GET /daily-logs
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

    const logs = await findDailyLogsByUser(user_id);

    return res.json({
      message: "daily logs fetched",
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    console.error("GET /daily-logs error:", error);
    return res.status(500).json({
      error: true,
      message: "failed to fetch daily logs",
    });
  }
});

/**
 * GET /daily-logs/today
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
 * GET /daily-logs/:id/ai-comment
 */
router.get("/:id/ai-comment", async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({
        error: true,
        message: "user_id is required",
      });
    }

    const log = await findDailyLogByIdAndUser(id, user_id);
    if (!log) {
      return res.status(404).json({
        error: true,
        message: "daily log not found",
      });
    }

    const aiCommentEnabled = await getAiCommentEnabledByUserId(user_id);
    if (!aiCommentEnabled) {
      return res.json({
        message: "ai comment fetched",
        data: null,
      });
    }

    const comment = await findLatestAiCommentByDailyLogId(id);

    return res.json({
      message: "ai comment fetched",
      data: comment
        ? {
            id: comment.id,
            comment_text: comment.comment_text,
          }
        : null,
    });
  } catch (error) {
    console.error("GET /daily-logs/:id/ai-comment error:", error);
    return res.status(500).json({
      error: true,
      message: "failed to fetch ai comment",
    });
  }
});

/**
 * PUT /daily-logs/:id
 */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, payload, title } = req.body;

    if (!user_id || !payload) {
      return res.status(400).json({
        error: true,
        message: "user_id and payload are required",
      });
    }

    const updated = await updateDailyLogByIdAndUser(
      id,
      user_id,
      payload,
      title,
    );

    if (!updated) {
      return res.status(404).json({
        error: true,
        message: "daily log not found or not allowed",
      });
    }

    const pro = await isUserPro(user_id);

    if (pro) {
      try {
        await saveDailyLogAiComment(user_id, updated.id, payload);
      } catch (aiCommentError) {
        console.error("PUT /daily-logs/:id ai comment error:", aiCommentError);
      }
    }

    try {
      await syncDerivedDataAfterEdit(user_id, updated.log_date);
    } catch (editSyncError) {
      console.error("PUT /daily-logs/:id edit sync error:", editSyncError);
    }

    return res.json({
      message: "daily log updated",
      data: updated,
    });
  } catch (error) {
    console.error("PUT /daily-logs/:id error:", error);
    return res.status(500).json({
      error: true,
      message: "failed to update daily log",
    });
  }
});

/**
 * GET /daily-logs/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({
        error: true,
        message: "user_id is required",
      });
    }

    const log = await findDailyLogByIdAndUser(id, user_id);

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
