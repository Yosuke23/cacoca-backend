// server/src/services/dailyLogAnalysisService.js
import { generateText } from "./llmClient.js";
import { payloadToAnalysisSourceText } from "../utils/dailyLogPayload.js";

/**
 * =====================================================
 * daily log analysis service
 * =====================================================
 * 役割：
 * - 毎回保存時：SUMMARY + COMMENT を1回のプロンプトで生成
 * - 将来拡張：PEOPLE / PLACES 集約抽出の共通パーサにも使う
 * =====================================================
 */

/**
 * テキストの前後空白整理
 * @param {string} value
 * @returns {string}
 */
function normalizeText(value) {
  return value.replace(/\r\n/g, "\n").trim();
}

/**
 * 空文字や空行を除去した行配列へ
 * @param {string} text
 * @returns {string[]}
 */
function toNonEmptyLines(text) {
  return normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * セクション本文を整える
 * @param {string} text
 * @returns {string|null}
 */
function normalizeSectionBody(text) {
  const normalized = normalizeText(text);
  return normalized || null;
}

/**
 * タグ区切りレスポンスをパースする
 *
 * 期待例:
 * [SUMMARY]
 * 今日は...
 *
 * [COMMENT]
 * おつかれさまでした...
 *
 * @param {string} text
 * @returns {Record<string, string>}
 */
function parseTaggedSections(text) {
  const sections = {};
  const normalized = text.replace(/\r\n/g, "\n");

  const tagPattern = /^\[([A-Z_]+)\]\s*$/gm;
  const matches = [...normalized.matchAll(tagPattern)];

  if (matches.length === 0) {
    return sections;
  }

  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const next = matches[i + 1];

    const tag = current[1];
    const startIndex = current.index + current[0].length;
    const endIndex = next ? next.index : normalized.length;

    const body = normalized.slice(startIndex, endIndex).trim();
    sections[tag] = body;
  }

  return sections;
}

/**
 * 箇条書きを配列へ
 *
 * @param {string} text
 * @returns {string[]}
 */
function parseBulletLines(text) {
  if (!text) return [];

  return toNonEmptyLines(text)
    .map((line) => line.replace(/^[-・*]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * 重複除去
 * @param {string[]} values
 * @returns {string[]}
 */
function uniqueStrings(values) {
  return [...new Set(values)];
}

/**
 * 正規化（最小）
 * @param {string} value
 * @returns {string}
 */
function normalizeName(value) {
  return normalizeText(value).toLowerCase();
}

/**
 * SUMMARY + COMMENT を1回のプロンプトで生成
 *
 * @param {string} sourceText
 * @returns {Promise<{ one_line_summary: string | null, comment_text: string | null, raw_text: string }>}
 */
async function extractSummaryAndComment(sourceText) {
  if (!sourceText) {
    return {
      one_line_summary: null,
      comment_text: null,
      raw_text: "",
    };
  }

  const prompt = `
あなたは日記内容から事実を整理し、要約とコメントを作るアシスタントです。
まず日記を読み、明示されている内容だけを把握してください。推測は禁止です。

次のルールで最終出力を作ってください。

[SUMMARY]
- 誇張しない
- 30〜50文字程度
- 要約文のみ
- コメント口調にしない

[COMMENT]
- 1〜2文
- 45〜80文字程度
- 自然でやさしい日本語
- 日記内容に少し触れる
- 過剰に大げさにしない
- 説教しない
- 前向きだが、軽く寄り添う程度にする

出力形式は必ず次のみとしてください。
説明、補足、前置きは禁止です。

[SUMMARY]
...

[COMMENT]
...

[日記内容]
${sourceText}
  `.trim();

  const rawText = await generateText(prompt);
  const sections = parseTaggedSections(rawText);

  const oneLineSummary = normalizeSectionBody(sections.SUMMARY ?? "");
  const commentText = normalizeSectionBody(sections.COMMENT ?? "");

  return {
    one_line_summary: oneLineSummary,
    comment_text: commentText,
    raw_text: rawText,
  };
}

/**
 * 将来の PEOPLE / PLACES 集約抽出でも使える補助関数
 * 今回はまだ routes からは使わない
 *
 * @param {string} text
 * @returns {Array<{ person_name: string, normalized_name: string, confidence: number | null }>}
 */
export function parsePeopleSection(text) {
  const parsed = uniqueStrings(parseBulletLines(text));

  return parsed.map((personName) => ({
    person_name: personName,
    normalized_name: normalizeName(personName),
    confidence: null,
  }));
}

/**
 * 将来の PEOPLE / PLACES 集約抽出でも使える補助関数
 * 今回はまだ routes からは使わない
 *
 * @param {string} text
 * @returns {Array<{ place_name: string, normalized_name: string, confidence: number | null }>}
 */
export function parsePlacesSection(text) {
  const parsed = uniqueStrings(parseBulletLines(text));

  return parsed.map((placeName) => ({
    place_name: placeName,
    normalized_name: normalizeName(placeName),
    confidence: null,
  }));
}

/**
 * 毎回保存時の payload 分析
 *
 * @param {unknown} payload
 * @returns {Promise<{
 *   analysis_source_text: string,
 *   one_line_summary: string | null,
 *   comment_text: string | null,
 *   raw_text: string
 * }>}
 */
export async function analyzeDailyLogPayload(payload) {
  const analysisSourceText = payloadToAnalysisSourceText(payload);

  if (!analysisSourceText) {
    return {
      analysis_source_text: "",
      one_line_summary: null,
      comment_text: null,
      raw_text: "",
    };
  }

  try {
    const summaryAndComment =
      await extractSummaryAndComment(analysisSourceText);

    return {
      analysis_source_text: analysisSourceText,
      one_line_summary: summaryAndComment.one_line_summary,
      comment_text: summaryAndComment.comment_text,
      raw_text: summaryAndComment.raw_text,
    };
  } catch (error) {
    console.error("analyzeDailyLogPayload error:", error);

    return {
      analysis_source_text: analysisSourceText,
      one_line_summary: null,
      comment_text: null,
      raw_text: "",
    };
  }
}
