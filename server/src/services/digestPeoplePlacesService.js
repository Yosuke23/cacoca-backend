// server/src/services/digestPeoplePlacesService.js
import { generateText } from "./llmClient.js";
import { payloadToAnalysisSourceText } from "../utils/dailyLogPayload.js";
import { findLatestDigestPeopleByUserId } from "../dao/digestPeopleDao.js";
import { findLatestDigestPlacesByUserId } from "../dao/digestPlacesDao.js";
import {
  findDailyLogsByUserAndDateRange,
  findFirstLogDateByUser,
  countDailyLogsByUserAndMonthRange,
} from "../dao/dailyLogsDao.js";

/**
 * =====================================================
 * digest people / places service
 * =====================================================
 * 役割：
 * - 未抽出区間を求める
 * - 7日 / 月初初回の実行条件を判定する
 * - 対象日記を集約して LLM 抽出用テキストを作る
 * - PEOPLE / PLACES を別プロンプトで抽出する
 * =====================================================
 */

function normalizeText(value) {
  return value.replace(/\r\n/g, "\n").trim();
}

function formatDateToYmd(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseYmdToDate(ymd) {
  if (ymd instanceof Date) {
    return new Date(ymd.getFullYear(), ymd.getMonth(), ymd.getDate());
  }

  if (typeof ymd === "string") {
    const [year, month, day] = ymd.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  throw new Error(`parseYmdToDate: unsupported value ${String(ymd)}`);
}

function addDays(ymd, days) {
  const date = parseYmdToDate(ymd);
  date.setDate(date.getDate() + days);
  return formatDateToYmd(date);
}

function diffDaysInclusive(startYmd, endYmd) {
  const start = parseYmdToDate(startYmd);
  const end = parseYmdToDate(endYmd);
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

function getMonthStartDate(ymd) {
  const date = parseYmdToDate(ymd);
  date.setDate(1);
  return formatDateToYmd(date);
}

function getNextMonthStartDate(ymd) {
  const date = parseYmdToDate(ymd);
  date.setDate(1);
  date.setMonth(date.getMonth() + 1);
  return formatDateToYmd(date);
}

function uniqueStrings(values) {
  return [...new Set(values)];
}

function parseBulletLines(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  return normalized
    .split("\n")
    .map((line) => line.replace(/^[-・*]\s*/, "").trim())
    .filter(Boolean);
}

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
 * 前回集約終了日を求める
 * people / places の最新終了日のうち、より新しいほうを使う
 */
async function findLatestDigestEndDate(userId) {
  const [latestPeople, latestPlaces] = await Promise.all([
    findLatestDigestPeopleByUserId(userId),
    findLatestDigestPlacesByUserId(userId),
  ]);

  const peopleEnd = latestPeople?.digest_end_date ?? null;
  const placesEnd = latestPlaces?.digest_end_date ?? null;

  if (!peopleEnd && !placesEnd) return null;
  if (peopleEnd && !placesEnd) return peopleEnd;
  if (!peopleEnd && placesEnd) return placesEnd;

  return peopleEnd >= placesEnd ? peopleEnd : placesEnd;
}

/**
 * 今回のトリガ日を起点に、未抽出期間を決める
 */
async function resolveDigestRange(userId, triggerLogDate) {
  const latestDigestEndDate = await findLatestDigestEndDate(userId);

  if (latestDigestEndDate) {
    return {
      digest_start_date: addDays(latestDigestEndDate, 1),
      digest_end_date: triggerLogDate,
      latest_digest_end_date: latestDigestEndDate,
    };
  }

  const firstLogDate = await findFirstLogDateByUser(userId);

  if (!firstLogDate) {
    return null;
  }

  return {
    digest_start_date: firstLogDate,
    digest_end_date: triggerLogDate,
    latest_digest_end_date: null,
  };
}

/**
 * 7日トリガー判定
 */
function shouldRunSevenDayDigest(digestStartDate, digestEndDate) {
  return diffDaysInclusive(digestStartDate, digestEndDate) >= 7;
}

/**
 * 月初初回トリガー判定
 *
 * triggerLogDate がその月の初回日記日かをみる。
 * ただし current write 自体は含まれている前提なので、
 * 当月件数が 1 件なら「月初初回」とみなせる。
 */
async function shouldRunFirstLogOfMonthDigest(userId, triggerLogDate) {
  const monthStartDate = getMonthStartDate(triggerLogDate);
  const nextMonthStartDate = getNextMonthStartDate(triggerLogDate);

  const count = await countDailyLogsByUserAndMonthRange(
    userId,
    monthStartDate,
    nextMonthStartDate,
  );

  return count === 1;
}

/**
 * 対象日記群から digest_source_text を作る
 */
function buildDigestSourceText(logs) {
  const blocks = logs
    .map((log) => {
      const sourceText = payloadToAnalysisSourceText(log.payload);

      if (!sourceText) return null;

      return `[${log.log_date}]\n${sourceText}`;
    })
    .filter(Boolean);

  return blocks.join("\n\n");
}

/**
 * PEOPLE 抽出
 * 定義：
 * - 日記の登場人物の名前
 * - 書かれた表現のまま
 * - さん/ちゃん/くん/様などを削らない
 * - 推測しない
 */
async function extractDigestPeople(digestSourceText) {
  if (!digestSourceText) return [];

  const prompt = `
あなたは複数日の日記から「登場人物の名前」を抽出するアシスタントです。

対象:
- 日記に登場する人物名
- 人物の呼び方や呼称
- ユーザーが書いた表現そのまま

重要ルール:
- 「さん」「ちゃん」「くん」「さま」「様」「サマ」などは削除しない
- 同姓同名や表記ゆれは許容する
- 正規化しない
- 推測しない
- 人物でないものは出さない
- 同じ表記の重複は1回にまとめる

出力ルール:
- [PEOPLE] セクションのみ
- 1行に1件
- 箇条書き形式
- 説明文や前置きは禁止
- 該当がなければ空欄

出力形式:
[PEOPLE]
- ...
- ...

[日記群]
${digestSourceText}
  `.trim();

  const rawText = await generateText(prompt);
  const sections = parseTaggedSections(rawText);
  const people = uniqueStrings(parseBulletLines(sections.PEOPLE ?? ""));

  return people.map((personName) => ({
    person_name: personName,
    confidence: null,
  }));
}

/**
 * PLACES 抽出
 * 定義：
 * - 実際に行った場所
 * - 書かれた表現のまま
 * - 推測しない
 */
async function extractDigestPlaces(digestSourceText) {
  if (!digestSourceText) return [];

  const prompt = `
あなたは複数日の日記から「実際に行った場所」を抽出するアシスタントです。

対象:
- 実際に行った場所
- 滞在した場所
- 訪れた場所
- 行動の舞台になった場所

重要ルール:
- 日記に書かれた表現をそのまま使う
- 推測しない
- 話題に出ただけの地名は除外する
- 実際に行ったか不明な場所は除外する
- 同じ表記の重複は1回にまとめる

出力ルール:
- [PLACES] セクションのみ
- 1行に1件
- 箇条書き形式
- 説明文や前置きは禁止
- 該当がなければ空欄

出力形式:
[PLACES]
- ...
- ...

[日記群]
${digestSourceText}
  `.trim();

  const rawText = await generateText(prompt);
  const sections = parseTaggedSections(rawText);
  const places = uniqueStrings(parseBulletLines(sections.PLACES ?? ""));

  return places.map((placeName) => ({
    place_name: placeName,
    confidence: null,
  }));
}

/**
 * 今回の保存時に digest 実行すべきか判定し、範囲を返す
 *
 * @returns {Promise<{
 *   should_run: boolean,
 *   reason: "seven_days" | "first_log_of_month" | null,
 *   digest_start_date: string | null,
 *   digest_end_date: string | null
 * }>}
 */
export async function resolveDigestExecution(userId, triggerLogDate) {
  const range = await resolveDigestRange(userId, triggerLogDate);

  if (!range) {
    return {
      should_run: false,
      reason: null,
      digest_start_date: null,
      digest_end_date: null,
    };
  }

  const { digest_start_date, digest_end_date } = range;

  if (digest_start_date > digest_end_date) {
    return {
      should_run: false,
      reason: null,
      digest_start_date: null,
      digest_end_date: null,
    };
  }

  if (shouldRunSevenDayDigest(digest_start_date, digest_end_date)) {
    return {
      should_run: true,
      reason: "seven_days",
      digest_start_date,
      digest_end_date,
    };
  }

  const isFirstLogOfMonth = await shouldRunFirstLogOfMonthDigest(
    userId,
    triggerLogDate,
  );

  if (isFirstLogOfMonth) {
    return {
      should_run: true,
      reason: "first_log_of_month",
      digest_start_date,
      digest_end_date,
    };
  }

  return {
    should_run: false,
    reason: null,
    digest_start_date: null,
    digest_end_date: null,
  };
}

/**
 * 実際の digest 抽出を行う
 *
 * @returns {Promise<{
 *   digest_start_date: string,
 *   digest_end_date: string,
 *   source_log_count: number,
 *   digest_source_text: string,
 *   people: Array<{ person_name: string, confidence: number | null }>,
 *   places: Array<{ place_name: string, confidence: number | null }>
 * }>}
 */
export async function analyzeDigestPeopleAndPlaces(
  userId,
  digestStartDate,
  digestEndDate,
) {
  const logs = await findDailyLogsByUserAndDateRange(
    userId,
    digestStartDate,
    digestEndDate,
  );

  const digestSourceText = buildDigestSourceText(logs);

  if (!digestSourceText) {
    return {
      digest_start_date: digestStartDate,
      digest_end_date: digestEndDate,
      source_log_count: logs.length,
      digest_source_text: "",
      people: [],
      places: [],
    };
  }

  const [people, places] = await Promise.all([
    extractDigestPeople(digestSourceText).catch((error) => {
      console.error("extractDigestPeople error:", error);
      return [];
    }),
    extractDigestPlaces(digestSourceText).catch((error) => {
      console.error("extractDigestPlaces error:", error);
      return [];
    }),
  ]);

  return {
    digest_start_date: digestStartDate,
    digest_end_date: digestEndDate,
    source_log_count: logs.length,
    digest_source_text: digestSourceText,
    people,
    places,
  };
}
