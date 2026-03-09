// server/src/utils/dailyLogPayload.js

/**
 * =====================================================
 * daily log payload utils
 * =====================================================
 * 役割：
 * - daily_logs.payload の mode 差分を吸収する
 * - 検索用全文・LLM抽出用テキストを共通生成する
 * =====================================================
 */

/**
 * basic payload 判定
 * @param {unknown} payload
 * @returns {boolean}
 */
export function isBasicTemplatePayload(payload) {
  if (!payload || typeof payload !== "object") return false;

  return (
    payload.mode === "basic" &&
    typeof payload.todayDid === "string" &&
    typeof payload.todayThought === "string" &&
    typeof payload.todaySaw === "string" &&
    typeof payload.todayHeard === "string" &&
    typeof payload.tomorrowPlan === "string" &&
    typeof payload.recentConcern === "string" &&
    typeof payload.freeNote === "string"
  );
}

/**
 * free payload 判定
 * @param {unknown} payload
 * @returns {boolean}
 */
export function isFreeTemplatePayload(payload) {
  if (!payload || typeof payload !== "object") return false;

  return payload.mode === "free" && typeof payload.freeText === "string";
}

/**
 * 空文字や前後空白を整理
 * @param {string} value
 * @returns {string}
 */
function normalizeText(value) {
  return value.replace(/\r\n/g, "\n").trim();
}

/**
 * ラベル付き1行を生成
 * 空なら返さない
 * @param {string} label
 * @param {string} value
 * @returns {string|null}
 */
function buildLabeledLine(label, value) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  return `${label}: ${normalized}`;
}

/**
 * payload から検索用全文を生成
 *
 * 用途：
 * - daily_logs.search_text に保存
 * - 全文検索対象
 *
 * @param {unknown} payload
 * @returns {string}
 */
export function payloadToSearchText(payload) {
  if (isBasicTemplatePayload(payload)) {
    const lines = [
      buildLabeledLine("今日したこと", payload.todayDid),
      buildLabeledLine("今日思ったこと", payload.todayThought),
      buildLabeledLine("今日見たこと", payload.todaySaw),
      buildLabeledLine("今日聞いたこと", payload.todayHeard),
      buildLabeledLine("明日したいこと", payload.tomorrowPlan),
      buildLabeledLine("最近の悩み", payload.recentConcern),
      buildLabeledLine("自由欄", payload.freeNote),
    ].filter(Boolean);

    return lines.join("\n");
  }

  if (isFreeTemplatePayload(payload)) {
    return normalizeText(payload.freeText);
  }

  return "";
}

/**
 * payload からLLM抽出用テキストを生成
 *
 * 用途：
 * - daily_summary 抽出
 * - people 抽出
 * - places 抽出
 *
 * 方針：
 * - basic はラベル付きで文脈を明示
 * - free は本文そのまま
 *
 * @param {unknown} payload
 * @returns {string}
 */
export function payloadToAnalysisSourceText(payload) {
  if (isBasicTemplatePayload(payload)) {
    const blocks = [
      buildLabeledLine("今日したこと", payload.todayDid),
      buildLabeledLine("今日思ったこと", payload.todayThought),
      buildLabeledLine("今日見たこと", payload.todaySaw),
      buildLabeledLine("今日聞いたこと", payload.todayHeard),
      buildLabeledLine("明日したいこと", payload.tomorrowPlan),
      buildLabeledLine("最近の悩み", payload.recentConcern),
      buildLabeledLine("自由欄", payload.freeNote),
    ].filter(Boolean);

    return blocks.join("\n");
  }

  if (isFreeTemplatePayload(payload)) {
    return normalizeText(payload.freeText);
  }

  return "";
}
