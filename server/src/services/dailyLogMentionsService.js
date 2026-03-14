// server/src/services/dailyLogMentionsService.js
import { generateText } from "./llmClient.js";
import { payloadToAnalysisSourceText } from "./dailyLogAnalysisService.js";
import {
  deletePeopleMentionsByDailyLogId,
  insertPeopleMentions,
} from "../dao/dailyLogPeopleMentionsDao.js";
import {
  deletePlaceMentionsByDailyLogId,
  insertPlaceMentions,
} from "../dao/dailyLogPlaceMentionsDao.js";

/**
 * =====================================================
 * daily log mentions service
 * =====================================================
 * 役割：
 * - 日記1件ごとの人物 / 場所明細を保存する
 * - マイページの月別人物 / 場所表示の基礎データを作る
 * =====================================================
 */

function uniqueByName(items, key) {
  const map = new Map();

  for (const item of items) {
    const value = item?.[key];

    if (!value || typeof value !== "string") {
      continue;
    }

    if (!map.has(value)) {
      map.set(value, item);
    }
  }

  return [...map.values()];
}

function extractJsonText(text) {
  const trimmed = text.trim();

  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");

  if (firstBracket === -1 || lastBracket === -1 || lastBracket < firstBracket) {
    throw new Error("extractJsonText: JSON array not found");
  }

  return trimmed.slice(firstBracket, lastBracket + 1);
}

function normalizePeopleResult(parsed) {
  if (!Array.isArray(parsed)) {
    return [];
  }

  const people = parsed
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      person_name:
        typeof item.person_name === "string" ? item.person_name.trim() : "",
      confidence: typeof item.confidence === "number" ? item.confidence : null,
    }))
    .filter((item) => item.person_name.length > 0);

  return uniqueByName(people, "person_name");
}

function normalizePlacesResult(parsed) {
  if (!Array.isArray(parsed)) {
    return [];
  }

  const places = parsed
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      place_name:
        typeof item.place_name === "string" ? item.place_name.trim() : "",
      confidence: typeof item.confidence === "number" ? item.confidence : null,
    }))
    .filter((item) => item.place_name.length > 0);

  return uniqueByName(places, "place_name");
}

function buildPeoplePrompt(sourceText) {
  return `
あなたは日記テキストから人物名だけを抽出するアシスタントです。
以下のルールに従って、人物だけを JSON 配列で出力してください。

ルール:
- 日記に登場する人物名を抽出する
- 会った人、話した人、話題に出た人を含める
- 書かれている表現をそのまま使う
- 敬称（さん、ちゃん、くん、様など）は消さない
- 推測で補わない
- 人物でないものは出さない
- 必ず JSON 配列のみを返す
- 各要素は {"person_name":"...", "confidence":0.9} の形式
- confidence は任意だが、数値を入れるなら 0〜1

[日記]
${sourceText}
  `.trim();
}

function buildPlacesPrompt(sourceText) {
  return `
あなたは日記テキストから、実際に行った場所だけを抽出するアシスタントです。
以下のルールに従って、場所だけを JSON 配列で出力してください。

ルール:
- 実際に行った場所を抽出する
- 単なる話題の地名や推測は出さない
- 書かれている表現をそのまま使う
- 必ず JSON 配列のみを返す
- 各要素は {"place_name":"...", "confidence":0.9} の形式
- confidence は任意だが、数値を入れるなら 0〜1

[日記]
${sourceText}
  `.trim();
}

async function extractPeopleFromPayload(payload) {
  const sourceText = payloadToAnalysisSourceText(payload);

  if (!sourceText.trim()) {
    return [];
  }

  const prompt = buildPeoplePrompt(sourceText);
  const rawText = await generateText(prompt);
  const jsonText = extractJsonText(rawText);
  const parsed = JSON.parse(jsonText);

  return normalizePeopleResult(parsed);
}

async function extractPlacesFromPayload(payload) {
  const sourceText = payloadToAnalysisSourceText(payload);

  if (!sourceText.trim()) {
    return [];
  }

  const prompt = buildPlacesPrompt(sourceText);
  const rawText = await generateText(prompt);
  const jsonText = extractJsonText(rawText);
  const parsed = JSON.parse(jsonText);

  return normalizePlacesResult(parsed);
}

/**
 * 日記1件分の人物 / 場所明細を保存
 */
export async function saveDailyLogMentions(params) {
  const { daily_log_id, user_id, log_date, payload } = params;

  if (!daily_log_id || !user_id || !log_date || !payload) {
    throw new Error(
      "saveDailyLogMentions: daily_log_id, user_id, log_date, payload are required",
    );
  }

  const [people, places] = await Promise.all([
    extractPeopleFromPayload(payload),
    extractPlacesFromPayload(payload),
  ]);

  await deletePeopleMentionsByDailyLogId(daily_log_id);
  await deletePlaceMentionsByDailyLogId(daily_log_id);

  const [savedPeople, savedPlaces] = await Promise.all([
    insertPeopleMentions({
      daily_log_id,
      user_id,
      log_date,
      people,
    }),
    insertPlaceMentions({
      daily_log_id,
      user_id,
      log_date,
      places,
    }),
  ]);

  return {
    people: savedPeople,
    places: savedPlaces,
  };
}
