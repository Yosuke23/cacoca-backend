// server/src/dao/dailyLogLightAnalysisDao.js
import { pool } from "../db/pool.js";

/**
 * daily_log_light_analysis を日記単位で削除
 * 試験運用では再抽出時に削除 → 再INSERT で扱う
 */
export async function deleteLightAnalysisByDailyLogId(dailyLogId) {
  if (!dailyLogId) {
    throw new Error("deleteLightAnalysisByDailyLogId: dailyLogId is required");
  }

  await pool.query(
    `
    DELETE FROM daily_log_light_analysis
    WHERE daily_log_id = $1
    `,
    [dailyLogId],
  );
}

/**
 * 軽分析結果を保存
 *
 * @param {object} params
 * @param {string} params.daily_log_id
 * @param {string|null} [params.one_line_summary]
 * @param {string[]|null} [params.keywords]
 * @param {string[]|null} [params.emotion_tags]
 * @param {number|null} [params.confidence_score]
 * @returns {Promise<object>}
 */
export async function insertLightAnalysis(params) {
  const {
    daily_log_id,
    one_line_summary = null,
    keywords = null,
    emotion_tags = null,
    confidence_score = null,
  } = params;

  if (!daily_log_id) {
    throw new Error("insertLightAnalysis: daily_log_id is required");
  }

  const result = await pool.query(
    `
    INSERT INTO daily_log_light_analysis (
      daily_log_id,
      one_line_summary,
      keywords,
      emotion_tags,
      confidence_score
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [daily_log_id, one_line_summary, keywords, emotion_tags, confidence_score],
  );

  return result.rows[0];
}

export async function findLightAnalysisByDailyLogId(dailyLogId) {
  if (!dailyLogId) {
    throw new Error("findLightAnalysisByDailyLogId: dailyLogId is required");
  }

  const result = await pool.query(
    `
    SELECT *
    FROM daily_log_light_analysis
    WHERE daily_log_id = $1
      AND is_deleted = false
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [dailyLogId],
  );

  return result.rows[0] ?? null;
}
