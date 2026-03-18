// server/src/services/premiumDigestRunnerService.js
import { generateText } from "./llmClient.js";
import {
  findWeeklyDigestByUserAndWeekStartDate,
  findWeeklyDigestsByUserAndDateRange,
  deleteWeeklyDigestByUserAndWeekStartDate,
  insertWeeklyDigest,
} from "../dao/weeklyDigestsDao.js";
import {
  findMonthlyDigestByUserAndYearMonth,
  deleteMonthlyDigestByUserAndYearMonth,
  insertMonthlyDigest,
} from "../dao/monthlyDigestsDao.js";
import { findDailyLogsByUserAndDateRange } from "../dao/dailyLogsDao.js";
import { findDigestPeopleByUserAndLogDateRange } from "../dao/digestPeopleDao.js";
import { findDigestPlacesByUserAndLogDateRange } from "../dao/digestPlacesDao.js";

/**
 * =====================================================
 * premium digest runner service
 * =====================================================
 * 役割：
 * - 週次 / 月次集約を必要時のみ生成する
 * - weekly_digests / monthly_digests に保存する
 * - 編集時には指定週 / 指定月を即再生成する
 * =====================================================
 */

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

function formatDateToYmd(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeYmd(value) {
  if (value instanceof Date) {
    return formatDateToYmd(value);
  }

  if (typeof value === "string") {
    return value;
  }

  throw new Error(`normalizeYmd: unsupported value ${String(value)}`);
}

function addDays(ymd, days) {
  const date = parseYmdToDate(ymd);
  date.setDate(date.getDate() + days);
  return formatDateToYmd(date);
}

function getWeekStartMonday(ymd) {
  const date = parseYmdToDate(ymd);
  const day = date.getDay(); // Sun=0 ... Sat=6
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return formatDateToYmd(date);
}

function getWeekEndSunday(weekStartYmd) {
  return addDays(weekStartYmd, 6);
}

function getPreviousWeekRange(triggerDate) {
  const triggerYmd = normalizeYmd(triggerDate);
  const currentWeekStart = getWeekStartMonday(triggerYmd);
  const previousWeekEnd = addDays(currentWeekStart, -1);
  const previousWeekStart = addDays(previousWeekEnd, -6);

  return {
    week_start_date: previousWeekStart,
    week_end_date: previousWeekEnd,
  };
}

function getWeekRangeByTargetDate(targetDate) {
  const targetYmd = normalizeYmd(targetDate);
  const weekStartDate = getWeekStartMonday(targetYmd);
  const weekEndDate = getWeekEndSunday(weekStartDate);

  return {
    week_start_date: weekStartDate,
    week_end_date: weekEndDate,
  };
}

function getCurrentMonthStart(triggerDate) {
  const triggerYmd = normalizeYmd(triggerDate);
  const date = parseYmdToDate(triggerYmd);
  date.setDate(1);
  return formatDateToYmd(date);
}

function getPreviousMonthRange(triggerDate) {
  const triggerYmd = normalizeYmd(triggerDate);
  const currentMonthStart = getCurrentMonthStart(triggerYmd);
  const previousMonthEnd = addDays(currentMonthStart, -1);
  const previousMonthStartDate = parseYmdToDate(previousMonthEnd);
  previousMonthStartDate.setDate(1);

  return {
    target_year_month: `${previousMonthStartDate.getFullYear()}-${`${previousMonthStartDate.getMonth() + 1}`.padStart(2, "0")}`,
    month_start_date: formatDateToYmd(previousMonthStartDate),
    month_end_date: previousMonthEnd,
  };
}

function getMonthRangeByTargetDate(targetDate) {
  const targetYmd = normalizeYmd(targetDate);
  const date = parseYmdToDate(targetYmd);
  const monthStartDate = new Date(date.getFullYear(), date.getMonth(), 1);
  const nextMonthStartDate = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    1,
  );
  const monthEndDate = new Date(
    nextMonthStartDate.getTime() - 24 * 60 * 60 * 1000,
  );

  return {
    target_year_month: `${monthStartDate.getFullYear()}-${`${monthStartDate.getMonth() + 1}`.padStart(2, "0")}`,
    month_start_date: formatDateToYmd(monthStartDate),
    month_end_date: formatDateToYmd(monthEndDate),
  };
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildPeopleSummary(peopleRows) {
  const names = uniqueStrings(
    peopleRows.map((row) => row.person_name).filter(Boolean),
  );
  return names.length > 0 ? names.join("、") : null;
}

function buildPlacesSummary(placeRows) {
  const names = uniqueStrings(
    placeRows.map((row) => row.place_name).filter(Boolean),
  );
  return names.length > 0 ? names.join("、") : null;
}

function buildSummaryPrompt({
  rangeLabel,
  searchTexts,
  peopleSummary,
  placesSummary,
}) {
  const searchTextBlock =
    searchTexts.length > 0 ? searchTexts.join("\n\n") : "（なし）";
  const peopleBlock = peopleSummary ?? "（なし）";
  const placesBlock = placesSummary ?? "（なし）";

  return `
あなたは日記の振り返り要約を作るアシスタントです。
以下の素材をもとに、自然な日本語で要約を作成してください。

ルール:
- 誇張しない
- 読みやすく簡潔にまとめる
- 断定しすぎない
- 余計な見出しは出さない
- 要約本文のみを出力する
- 週や月の主な出来事と流れを優先してまとめる
- 同じ話題や似た内容は1つにまとめる
- 長い感想文があっても、重要な傾向だけを残して簡潔にまとめる
- 細かい枝葉より、その期間を通して何をして何を感じていたかを優先する
- 人物名や場所名は、その流れを理解するのに必要な範囲で自然に触れる

[対象期間]
${rangeLabel}

[日記本文素材]
${searchTextBlock}

[登場人物素材]
${peopleBlock}

[場所素材]
${placesBlock}
  `.trim();
}

async function generateWeeklySummaryText(params) {
  const prompt = buildSummaryPrompt(params);
  const text = await generateText(prompt);
  return text.trim() || null;
}

async function generateMonthlySummaryText(params) {
  const prompt = buildSummaryPrompt(params);
  const text = await generateText(prompt);
  return text.trim() || null;
}

/**
 * exact な日付範囲で weekly/monthly 用素材を取る
 * people / places は log_date ベース
 */
async function collectDigestSourceMaterials(userId, startDate, endDate) {
  const [logs, peopleRows, placeRows] = await Promise.all([
    findDailyLogsByUserAndDateRange(userId, startDate, endDate),
    findDigestPeopleByUserAndLogDateRange(userId, startDate, endDate),
    findDigestPlacesByUserAndLogDateRange(userId, startDate, endDate),
  ]);

  return {
    logs,
    peopleRows,
    placeRows,
  };
}

async function buildWeeklyDigestPayload(userId, weekStartDate, weekEndDate) {
  const materials = await collectDigestSourceMaterials(
    userId,
    weekStartDate,
    weekEndDate,
  );

  if (materials.logs.length === 0) {
    return null;
  }

  const peopleSummary = buildPeopleSummary(materials.peopleRows);
  const placesSummary = buildPlacesSummary(materials.placeRows);

  const didSummary = await generateWeeklySummaryText({
    rangeLabel: `${weekStartDate} 〜 ${weekEndDate}`,
    searchTexts: materials.logs.map((log) => log.search_text).filter(Boolean),
    peopleSummary,
    placesSummary,
  });

  return {
    user_id: userId,
    week_start_date: weekStartDate,
    week_end_date: weekEndDate,
    did_summary: didSummary,
    people_summary: peopleSummary,
    places_summary: placesSummary,
    free_note_summary: null,
    source_log_count: materials.logs.length,
  };
}

async function buildMonthlyDigestPayload(
  userId,
  targetYearMonth,
  monthStartDate,
  monthEndDate,
) {
  const [materials, weeklyRows] = await Promise.all([
    collectDigestSourceMaterials(userId, monthStartDate, monthEndDate),
    findWeeklyDigestsByUserAndDateRange(userId, monthStartDate, monthEndDate),
  ]);

  if (materials.logs.length === 0) {
    return null;
  }

  const peopleSummary = buildPeopleSummary(materials.peopleRows);
  const placesSummary = buildPlacesSummary(materials.placeRows);

  const weeklySummaryTexts = weeklyRows
    .map((row) => row.did_summary)
    .filter(Boolean);

  const summaryText = await generateMonthlySummaryText({
    rangeLabel: `${monthStartDate} 〜 ${monthEndDate}`,
    searchTexts:
      weeklySummaryTexts.length > 0
        ? weeklySummaryTexts
        : materials.logs.map((log) => log.search_text).filter(Boolean),
    peopleSummary,
    placesSummary,
  });

  return {
    user_id: userId,
    target_year_month: targetYearMonth,
    month_start_date: monthStartDate,
    month_end_date: monthEndDate,
    summary_text: summaryText,
    people_summary: peopleSummary,
    places_summary: placesSummary,
    source_log_count: materials.logs.length,
  };
}

/**
 * 指定週を即再生成
 */
export async function regenerateWeeklyDigestForTargetDateIfPro(
  userId,
  targetDate,
) {
  const { week_start_date, week_end_date } =
    getWeekRangeByTargetDate(targetDate);
  const payload = await buildWeeklyDigestPayload(
    userId,
    week_start_date,
    week_end_date,
  );

  if (!payload) {
    await deleteWeeklyDigestByUserAndWeekStartDate(userId, week_start_date);

    return {
      enabled: true,
      ran: false,
      week_start_date,
      week_end_date,
      source_log_count: 0,
    };
  }

  await deleteWeeklyDigestByUserAndWeekStartDate(userId, week_start_date);
  await insertWeeklyDigest(payload);

  return {
    enabled: true,
    ran: true,
    week_start_date,
    week_end_date,
    source_log_count: payload.source_log_count,
  };
}

/**
 * 指定月を即再生成
 */
export async function regenerateMonthlyDigestForTargetDateIfPro(
  userId,
  targetDate,
) {
  const { target_year_month, month_start_date, month_end_date } =
    getMonthRangeByTargetDate(targetDate);

  const payload = await buildMonthlyDigestPayload(
    userId,
    target_year_month,
    month_start_date,
    month_end_date,
  );

  if (!payload) {
    await deleteMonthlyDigestByUserAndYearMonth(userId, target_year_month);

    return {
      enabled: true,
      ran: false,
      target_year_month,
      month_start_date,
      month_end_date,
      source_log_count: 0,
    };
  }

  await deleteMonthlyDigestByUserAndYearMonth(userId, target_year_month);
  await insertMonthlyDigest(payload);

  return {
    enabled: true,
    ran: true,
    target_year_month,
    month_start_date,
    month_end_date,
    source_log_count: payload.source_log_count,
  };
}

/**
 * 前週 weekly digest を必要時のみ生成
 */
async function runWeeklyDigestIfNeeded(userId, triggerDate) {
  const { week_start_date, week_end_date } = getPreviousWeekRange(triggerDate);

  const existing = await findWeeklyDigestByUserAndWeekStartDate(
    userId,
    week_start_date,
  );

  if (existing) {
    return {
      ran: false,
      target_week_start: week_start_date,
      target_week_end: week_end_date,
      source_log_count: existing.source_log_count ?? 0,
    };
  }

  const payload = await buildWeeklyDigestPayload(
    userId,
    week_start_date,
    week_end_date,
  );

  if (!payload) {
    return {
      ran: false,
      target_week_start: week_start_date,
      target_week_end: week_end_date,
      source_log_count: 0,
    };
  }

  await deleteWeeklyDigestByUserAndWeekStartDate(userId, week_start_date);
  await insertWeeklyDigest(payload);

  return {
    ran: true,
    target_week_start: week_start_date,
    target_week_end: week_end_date,
    source_log_count: payload.source_log_count,
  };
}

/**
 * 前月 monthly digest を必要時のみ生成
 */
async function runMonthlyDigestIfNeeded(userId, triggerDate) {
  const { target_year_month, month_start_date, month_end_date } =
    getPreviousMonthRange(triggerDate);

  const existing = await findMonthlyDigestByUserAndYearMonth(
    userId,
    target_year_month,
  );

  if (existing) {
    return {
      ran: false,
      target_year_month,
      month_start_date,
      month_end_date,
      source_log_count: existing.source_log_count ?? 0,
    };
  }

  const payload = await buildMonthlyDigestPayload(
    userId,
    target_year_month,
    month_start_date,
    month_end_date,
  );

  if (!payload) {
    return {
      ran: false,
      target_year_month,
      month_start_date,
      month_end_date,
      source_log_count: 0,
    };
  }

  await deleteMonthlyDigestByUserAndYearMonth(userId, target_year_month);
  await insertMonthlyDigest(payload);

  return {
    ran: true,
    target_year_month,
    month_start_date,
    month_end_date,
    source_log_count: payload.source_log_count,
  };
}

/**
 * 週次 / 月次集約を必要時のみ実行
 *
 * @param {string} userId
 * @param {string} triggerDate - YYYY-MM-DD
 */
export async function runPremiumDigestsIfNeeded(userId, triggerDate) {
  if (!userId || !triggerDate) {
    throw new Error(
      "runPremiumDigestsIfNeeded: userId and triggerDate are required",
    );
  }

  const [weekly, monthly] = await Promise.all([
    runWeeklyDigestIfNeeded(userId, triggerDate).catch((error) => {
      console.error("runWeeklyDigestIfNeeded error:", error);
      return {
        ran: false,
        error: true,
      };
    }),
    runMonthlyDigestIfNeeded(userId, triggerDate).catch((error) => {
      console.error("runMonthlyDigestIfNeeded error:", error);
      return {
        ran: false,
        error: true,
      };
    }),
  ]);

  return {
    enabled: true,
    weekly,
    monthly,
  };
}
