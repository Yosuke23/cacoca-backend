// server/src/dao/dailyLogGeneratedTextsDao.js
import { pool } from "../db/pool.js";

/**
 * daily_log_generated_texts DAO
 *
 * 方針：
 * - 生成物は常に INSERT（履歴を積む）
 * - prompt_type / prompt_version はAPI側で確定した値を入れる
 */

/**
 * @typedef {Object} GeneratedTextInsert
 * @property {string} daily_log_id
 * @property {string} model
 * @property {string} prompt_type
 * @property {string} prompt_version
 * @property {string|null} [title]
 * @property {string} generated_text
 */

export async function insertGeneratedText(params) {
  const {
    daily_log_id,
    model,
    prompt_type,
    prompt_version,
    title = null,
    generated_text,
  } = params;

  if (!daily_log_id || !model || !prompt_type || !prompt_version) {
    throw new Error(
      "insertGeneratedText: daily_log_id, model, prompt_type, prompt_version are required",
    );
  }
  if (!generated_text) {
    throw new Error("insertGeneratedText: generated_text is required");
  }

  const result = await pool.query(
    `
    INSERT INTO daily_log_generated_texts (
      daily_log_id,
      model,
      prompt_type,
      prompt_version,
      title,
      generated_text
    )
    VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING *
    `,
    [daily_log_id, model, prompt_type, prompt_version, title, generated_text],
  );

  return result.rows[0];
}

export async function findLatestGeneratedText(dailyLogId) {
  if (!dailyLogId) {
    throw new Error("findLatestGeneratedText: dailyLogId is required");
  }

  const result = await pool.query(
    `
    SELECT *
    FROM daily_log_generated_texts
    WHERE daily_log_id = $1
      AND is_deleted = false
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [dailyLogId],
  );

  return result.rows[0] ?? null;
}

export async function findGeneratedTextById(id) {
  if (!id) throw new Error("findGeneratedTextById: id is required");

  const result = await pool.query(
    `
    SELECT *
    FROM daily_log_generated_texts
    WHERE id = $1
      AND is_deleted = false
    `,
    [id],
  );

  return result.rows[0] ?? null;
}
