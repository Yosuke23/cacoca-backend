// server/src/dao/dailyLogAiCommentsDao.js
import { pool } from "../db/pool.js";

/**
 * 日記単位のAIコメントを削除
 * 試験運用では再生成時に削除 → 再INSERT で扱う
 */
export async function deleteAiCommentsByDailyLogId(dailyLogId) {
  if (!dailyLogId) {
    throw new Error("deleteAiCommentsByDailyLogId: dailyLogId is required");
  }

  await pool.query(
    `
    DELETE FROM daily_log_ai_comments
    WHERE daily_log_id = $1
    `,
    [dailyLogId],
  );
}

/**
 * AIコメント保存
 *
 * @param {object} params
 * @param {string} params.daily_log_id
 * @param {string} params.comment_text
 * @param {string|null} [params.model]
 * @param {string|null} [params.prompt_version]
 * @param {string} [params.status]
 * @param {string|null} [params.error_message]
 * @returns {Promise<object>}
 */
export async function insertAiComment(params) {
  const {
    daily_log_id,
    comment_text,
    model = null,
    prompt_version = null,
    status = "generated",
    error_message = null,
  } = params;

  if (!daily_log_id) {
    throw new Error("insertAiComment: daily_log_id is required");
  }

  if (!comment_text) {
    throw new Error("insertAiComment: comment_text is required");
  }

  const result = await pool.query(
    `
    INSERT INTO daily_log_ai_comments (
      daily_log_id,
      comment_text,
      model,
      prompt_version,
      status,
      error_message
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
    `,
    [daily_log_id, comment_text, model, prompt_version, status, error_message],
  );

  return result.rows[0];
}

export async function findLatestAiCommentByDailyLogId(dailyLogId) {
  if (!dailyLogId) {
    throw new Error("findLatestAiCommentByDailyLogId: dailyLogId is required");
  }

  const result = await pool.query(
    `
    SELECT *
    FROM daily_log_ai_comments
    WHERE daily_log_id = $1
      AND is_deleted = false
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [dailyLogId],
  );

  return result.rows[0] ?? null;
}
