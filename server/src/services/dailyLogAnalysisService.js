// server/src/services/dailyLogAnalysisService.js
import { generateText } from "./llmClient.js";
import { payloadToAnalysisSourceText } from "../utils/dailyLogPayload.js";

/**
 * =====================================================
 * daily log analysis service
 * =====================================================
 * 役割：
 * - daily_logs.payload から LLM抽出に必要な情報を取り出す
 * - daily_summary / people / places を抽出する
 * - 保存しやすい形に整形して返す
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
 * 行配列から空要素を除去
 * @param {string[]} lines
 * @returns {string[]}
 */
function compactLines(lines) {
  return lines.map((line) => line.trim()).filter(Boolean);
}

/**
 * 単純な名前正規化
 * 試験運用では最小限でよい
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeName(value) {
  return normalizeText(value).toLowerCase();
}

/**
 * LLMの箇条書き出力を配列へ
 *
 * 想定入力例:
 * - 田中さん
 * - 佐藤さん
 *
 * @param {string} text
 * @returns {string[]}
 */
function parseBulletLines(text) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return [];
  }

  return compactLines(
    normalized.split("\n").map((line) => line.replace(/^[-・*]\s*/, "").trim()),
  );
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
 * daily summary 抽出
 * 30〜50文字程度 / 誇張なし
 *
 * @param {string} sourceText
 * @returns {Promise<string|null>}
 */
async function extractDailySummary(sourceText) {
  if (!sourceText) {
    return null;
  }

  const prompt = `
あなたは日記の内容を短く要約するアシスタントです。
以下の日記内容を、誇張せず自然な日本語で30〜50文字程度の1文に要約してください。
出力は要約文のみで、説明や前置きは不要です。

[日記内容]
${sourceText}
  `.trim();

  const text = await generateText(prompt);
  const summary = normalizeText(text);

  return summary || null;
}

/**
 * あった人・話した人 抽出
 *
 * 方針：
 * - 対面だけでなく、会話・電話・オンライン・メッセージ相手も含む
 * - ニュース内人物や無関係な有名人は除外
 * - 出力は1行1件の箇条書き
 *
 * @param {string} sourceText
 * @returns {Promise<Array<{ person_name: string, normalized_name: string, confidence: number | null }>>}
 */
async function extractPeople(sourceText) {
  if (!sourceText) {
    return [];
  }

  const prompt = `
あなたは日記から人物を抽出するアシスタントです。
以下の日記内容から、その日にユーザーが「あった人・話した人」を抽出してください。

抽出対象:
- 実際に会った相手
- 話した相手
- 電話した相手
- オンラインで会話した相手
- メッセージ等でやり取りした相手

除外対象:
- ニュースや話題に出ただけの人物
- 有名人や第三者で、当日の関わりがない人物
- 相手として明確でない抽象表現

出力ルール:
- 1行に1人
- 箇条書き形式
- 人名や呼び方だけを出力
- 前置きや説明は不要
- 該当者がいなければ何も出力しない

[日記内容]
${sourceText}
  `.trim();

  const text = await generateText(prompt);
  const parsed = uniqueStrings(parseBulletLines(text));

  return parsed.map((personName) => ({
    person_name: personName,
    normalized_name: normalizeName(personName),
    confidence: null,
  }));
}

/**
 * 行った場所 抽出
 *
 * 方針：
 * - 実際に行った・滞在した・訪れた場所
 * - 単なる話題の場所やニュースの地名は除外
 *
 * @param {string} sourceText
 * @returns {Promise<Array<{ place_name: string, normalized_name: string, confidence: number | null }>>}
 */
async function extractPlaces(sourceText) {
  if (!sourceText) {
    return [];
  }

  const prompt = `
あなたは日記から場所を抽出するアシスタントです。
以下の日記内容から、その日にユーザーが実際に行った場所、滞在した場所、訪れた場所を抽出してください。

抽出対象:
- 実際に行った場所
- 滞在した場所
- 訪れた場所
- 行動の舞台になった場所

除外対象:
- 話題に出ただけの地名
- ニュースや一般論の場所
- 実際に行ったか不明な場所

出力ルール:
- 1行に1件
- 箇条書き形式
- 場所名だけを出力
- 前置きや説明は不要
- 該当がなければ何も出力しない

[日記内容]
${sourceText}
  `.trim();

  const text = await generateText(prompt);
  const parsed = uniqueStrings(parseBulletLines(text));

  return parsed.map((placeName) => ({
    place_name: placeName,
    normalized_name: normalizeName(placeName),
    confidence: null,
  }));
}

/**
 * 1件の日記payloadを分析
 *
 * @param {unknown} payload
 * @returns {Promise<{
 *   analysis_source_text: string,
 *   one_line_summary: string | null,
 *   people: Array<{ person_name: string, normalized_name: string, confidence: number | null }>,
 *   places: Array<{ place_name: string, normalized_name: string, confidence: number | null }>
 * }>}
 */
export async function analyzeDailyLogPayload(payload) {
  const analysisSourceText = payloadToAnalysisSourceText(payload);

  if (!analysisSourceText) {
    return {
      analysis_source_text: "",
      one_line_summary: null,
      people: [],
      places: [],
    };
  }

  const [oneLineSummary, people, places] = await Promise.all([
    extractDailySummary(analysisSourceText).catch((error) => {
      console.error("extractDailySummary error:", error);
      return null;
    }),
    extractPeople(analysisSourceText).catch((error) => {
      console.error("extractPeople error:", error);
      return [];
    }),
    extractPlaces(analysisSourceText).catch((error) => {
      console.error("extractPlaces error:", error);
      return [];
    }),
  ]);

  return {
    analysis_source_text: analysisSourceText,
    one_line_summary: oneLineSummary,
    people,
    places,
  };
}
