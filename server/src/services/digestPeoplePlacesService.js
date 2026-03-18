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
 * - 各抽出結果に log_date を持たせる
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

function isValidYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDateLabeledLines(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-・*]\s*/, "").trim())
    .map((line) => {
      const parts = line.split("|").map((part) => part.trim());
      if (parts.length < 2) {
        return null;
      }

      const logDate = parts[0];
      const value = parts.slice(1).join(" | ").trim();

      if (!isValidYmd(logDate) || !value) {
        return null;
      }

      return {
        log_date: logDate,
        value,
      };
    })
    .filter(Boolean);
}

function uniqueDateNamedItems(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = `${item.log_date}__${item.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    const latestDigestEndYmd =
      latestDigestEndDate instanceof Date
        ? formatDateToYmd(latestDigestEndDate)
        : latestDigestEndDate;

    return {
      digest_start_date: addDays(latestDigestEndYmd, 1),
      digest_end_date:
        triggerLogDate instanceof Date
          ? formatDateToYmd(triggerLogDate)
          : triggerLogDate,
      latest_digest_end_date: latestDigestEndYmd,
    };
  }

  const firstLogDate = await findFirstLogDateByUser(userId);

  if (!firstLogDate) {
    return null;
  }

  const firstLogYmd =
    firstLogDate instanceof Date ? formatDateToYmd(firstLogDate) : firstLogDate;

  return {
    digest_start_date: firstLogYmd,
    digest_end_date:
      triggerLogDate instanceof Date
        ? formatDateToYmd(triggerLogDate)
        : triggerLogDate,
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
 * - 日付つきで返させる
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
- 同じ人物でも別日に出たら、日付ごとに別行で出す
- 同じ日付・同じ表記の重複だけ1回にまとめる

人物として出してはいけないもの:
- 病院名、医院名、クリニック名、産婦人科名
- 保育園名、幼稚園名、学校名、施設名
- 店名、会社名、建物名、組織名
- 地名、駅名、施設の通称
- 実際に行った場所や迎えに行った先の施設名

文脈ルール:
- 「〜へ行った」「〜に行った」「〜に寄った」「〜に迎えに行った」の対象は、人物ではなく場所の可能性を優先する
- 人名らしく見えても、文脈上施設や場所なら人物に含めない
- 「阿部産婦人科」「○○病院」「ひだまり」など、施設・場所として読めるものは人物にしない
- 迷う場合は人物として出さない

出力ルール:
- [PEOPLE] セクションのみ
- 1行に1件
- 形式は「YYYY-MM-DD | 人物名」
- 必ず日付を付ける
- 日付は、その人物が書かれている日記ブロックの [YYYY-MM-DD] をそのまま使う
- 箇条書きでも箇条書きなしでもよい
- 説明文や前置きは禁止
- 該当がなければ空欄

出力形式:
[PEOPLE]
2026-03-15 | 佐藤さん
2026-03-16 | そうちゃん

[日記群]
${digestSourceText}
  `.trim();

  const rawText = await generateText(prompt);
  const sections = parseTaggedSections(rawText);
  const parsed = uniqueDateNamedItems(
    parseDateLabeledLines(sections.PEOPLE ?? ""),
  );

  return parsed.map((item) => ({
    log_date: item.log_date,
    person_name: item.value,
    confidence: null,
  }));
}

/**
 * PLACES 抽出
 * - 日付つきで返させる
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
- 同じ場所でも別日に出たら、日付ごとに別行で出す
- 同じ日付・同じ表記の重複だけ1回にまとめる

場所として扱ってよいもの:
- 病院名、医院名、クリニック名、産婦人科名
- 保育園名、幼稚園名、学校名、施設名
- 店名、会社名、建物名
- 「ひだまり」のような施設の通称
- 「阿部産婦人科」のような医療機関名

文脈ルール:
- 「〜へ行った」「〜に行った」「〜に寄った」「〜に迎えに行った」の対象は、場所の強い候補
- 人名らしく見える語でも、施設名や場所名として読める場合は場所を優先する
- 「阿部産婦人科」「○○病院」「ひだまり」などは場所として扱う
- 迷う場合は場所として出してよいが、人物にはしない

出力ルール:
- [PLACES] セクションのみ
- 1行に1件
- 形式は「YYYY-MM-DD | 場所名」
- 必ず日付を付ける
- 日付は、その場所が書かれている日記ブロックの [YYYY-MM-DD] をそのまま使う
- 箇条書きでも箇条書きなしでもよい
- 説明文や前置きは禁止
- 該当がなければ空欄

出力形式:
[PLACES]
2026-03-15 | 職場
2026-03-16 | イオン
2026-03-16 | ひだまり

[日記群]
${digestSourceText}
  `.trim();

  const rawText = await generateText(prompt);
  const sections = parseTaggedSections(rawText);
  const parsed = uniqueDateNamedItems(
    parseDateLabeledLines(sections.PLACES ?? ""),
  );

  return parsed.map((item) => ({
    log_date: item.log_date,
    place_name: item.value,
    confidence: null,
  }));
}

/**
 * 今回の保存時に digest 実行すべきか判定し、範囲を返す
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
