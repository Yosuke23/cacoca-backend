// server/src/routes/dailyLogs.js
import express from "express";
import { insertDailyLog, findDailyLogById } from "../dao/dailyLogsDao.js";
import { insertGeneratedText } from "../dao/dailyLogGeneratedTextsDao.js";
import { generateText } from "../services/llmClient.js";
import { buildDailyTextPrompt } from "../services/dailyTextPrompt.js";
import { parseGeneratedText } from "../services/parseGeneratedText.js";

const router = express.Router();

/**
 * =====================================================
 * POST /daily-logs
 * 設問フローのrawを保存
 * =====================================================
 */
router.post("/", async (req, res) => {
  try {
    const { user_id, log_date, events, message_to_tomorrow, free_memo_raw } =
      req.body;

    if (!user_id || !log_date) {
      return res.status(400).json({
        error: true,
        message: "user_id and log_date are required",
      });
    }

    if (!Array.isArray(events)) {
      return res.status(400).json({
        error: true,
        message: "events must be an array",
      });
    }

    const dailyLog = await insertDailyLog({
      user_id,
      log_date,
      events,
      message_to_tomorrow,
      free_memo_raw,
    });

    return res.status(201).json({
      message: "daily log saved",
      data: dailyLog,
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
 * POST /daily-logs/:id/generate
 * 設問フロー用 日記生成
 * =====================================================
 */
router.post("/:id/generate", async (req, res) => {
  const { id } = req.params;

  try {
    // ---------------------
    // raw 取得
    // ---------------------
    const dailyLog = await findDailyLogById(id);

    if (!dailyLog) {
      return res.status(404).json({
        error: true,
        message: "daily log not found",
      });
    }

    // ---------------------
    // prompt 種別決定（FIX）
    // ---------------------
    const promptType = "daily_log_v1";
    const promptVersion = "v1";

    // ---------------------
    // プロンプト構築
    // ---------------------
    const prompt = buildDailyTextPrompt(dailyLog);

    // ---------------------
    // LLM生成
    // ---------------------
    const rawText = await generateText(prompt);

    // ---------------------
    // ★ title / body 分離
    // ---------------------
    const { title, body } = parseGeneratedText(rawText);

    // ---------------------
    // 生成結果保存
    // ---------------------
    const saved = await insertGeneratedText({
      daily_log_id: dailyLog.id,
      model: "gemma-3-27b-it",
      prompt_type: promptType,
      prompt_version: promptVersion,
      title: title, // ← 分離後 title
      generated_text: body, // ← 分離後 body
    });

    return res.json({
      message: "daily log generated",
      data: saved,
    });
  } catch (error) {
    console.error("POST /daily-logs/:id/generate error:", error);
    return res.status(500).json({
      error: true,
      message: "failed to generate daily log",
    });
  }
});

export default router;
