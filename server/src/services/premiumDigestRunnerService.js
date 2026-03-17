// server/src/services/premiumDigestRunnerService.js
import { generateText } from "./llmClient.js";
import {
  findWeeklyDigestByUserAndWeekStartDate,
  findWeeklyDigestsByUserAndDateRange,
  deleteWeeklyDigestByUserAndWeekStartDate,
  insertWeeklyDigest,
  // findWeeklyDigestsByUserAndDateRange,
} from "../dao/weeklyDigestsDao.js";
import {
  findMonthlyDigestByUserAndYearMonth,
  deleteMonthlyDigestByUserAndYearMonth,
  insertMonthlyDigest,
} from "../dao/monthlyDigestsDao.js";
import { findDailyLogsByUserAndDateRange } from "../dao/dailyLogsDao.js";
import { findDigestPeopleByUserAndDateRange } from "../dao/digestPeopleDao.js";
import { findDigestPlacesByUserAndDateRange } from "../dao/digestPlacesDao.js";

/**
 * =====================================================
 * premium digest runner service
 * =====================================================
 * 役割：
 * - 有料ユーザー向けの週次 / 月次集約を必要時のみ生成する
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

function buildWeeklySummaryPrompt({
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
あなたは日記アプリの週次要約を作るアシスタントです。
以下の素材をもとに、その週の流れが自然に伝わる要約を作成してください。

対象期間:
${rangeLabel}

[日記本文]
${searchTextBlock}

[登場人物]
${peopleBlock}

[行った場所]
${placesBlock}

ルール:
- 週の主な出来事と流れを優先してまとめる
- 同じ話題や似た内容は1つにまとめる
- 長い感想文があっても、重要な傾向だけを残して簡潔にまとめる
- 細かい枝葉より、その週を通して何をして何を感じていたかを優先する
- 人物名や場所名は、週の流れを理解するのに必要な範囲で自然に触れる
- 箇条書きにしない
- 誇張しない
- 読みやすい自然な日本語にする
- 断定しすぎない
- 要約本文のみを出力する
  `.trim();
}

function buildMonthlySummaryPrompt({
  rangeLabel,
  weeklySummaries,
  weeklyPeopleSummaries,
  weeklyPlacesSummaries,
  fallbackSearchTexts,
  peopleSummary,
  placesSummary,
}) {
  const weeklySummaryBlock =
    weeklySummaries.length > 0
      ? weeklySummaries.join("\n\n")
      : fallbackSearchTexts.length > 0
        ? fallbackSearchTexts.join("\n\n")
        : "（なし）";

  const peopleBlock =
    weeklyPeopleSummaries.length > 0
      ? uniqueStrings(
          weeklyPeopleSummaries
            .flatMap((text) => String(text).split("、"))
            .map((item) => item.trim()),
        ).join("、")
      : (peopleSummary ?? "（なし）");

  const placesBlock =
    weeklyPlacesSummaries.length > 0
      ? uniqueStrings(
          weeklyPlacesSummaries
            .flatMap((text) => String(text).split("、"))
            .map((item) => item.trim()),
        ).join("、")
      : (placesSummary ?? "（なし）");

  return `
あなたは日記アプリの月次要約を作るアシスタントです。
以下の素材をもとに、その月の流れが自然に伝わる要約を作成してください。

対象期間:
${rangeLabel}

[週ごとの要約 / 月内素材]
${weeklySummaryBlock}

[登場人物]
${peopleBlock}

[行った場所]
${placesBlock}

ルール:
- 月全体の流れを優先してまとめる
- 似た内容は1つにまとめる
- 細かい出来事の羅列ではなく、その月がどんな月だったかが伝わる文章にする
- 人物名や場所名は、月の流れを理解するのに必要な範囲で自然に触れる
- 箇条書きにしない
- 誇張しない
- 読みやすい自然な日本語にする
- 断定しすぎない
- 要約本文のみを出力する
  `.trim();
}

async function generateWeeklySummaryText(params) {
  const prompt = buildWeeklySummaryPrompt(params);
  const text = await generateText(prompt);
  return text.trim() || null;
}

async function generateMonthlySummaryText(params) {
  const prompt = buildMonthlySummaryPrompt(params);
  const text = await generateText(prompt);
  return text.trim() || null;
}

async function collectDigestSourceMaterials(userId, startDate, endDate) {
  const [logs, peopleRows, placeRows] = await Promise.all([
    findDailyLogsByUserAndDateRange(userId, startDate, endDate),
    findDigestPeopleByUserAndDateRange(userId, startDate, endDate),
    findDigestPlacesByUserAndDateRange(userId, startDate, endDate),
  ]);

  return {
    logs,
    peopleRows,
    placeRows,
  };
}

async function collectMonthlySourceMaterials(userId, startDate, endDate) {
  const [weeklyRows, logs, peopleRows, placeRows] = await Promise.all([
    findWeeklyDigestsByUserAndDateRange(userId, startDate, endDate),
    findDailyLogsByUserAndDateRange(userId, startDate, endDate),
    findDigestPeopleByUserAndDateRange(userId, startDate, endDate),
    findDigestPlacesByUserAndDateRange(userId, startDate, endDate),
  ]);

  return {
    weeklyRows,
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
  const materials = await collectMonthlySourceMaterials(
    userId,
    monthStartDate,
    monthEndDate,
  );

  const hasWeeklyRows = materials.weeklyRows.length > 0;
  const hasFallbackLogs = materials.logs.length > 0;

  if (!hasWeeklyRows && !hasFallbackLogs) {
    return null;
  }

  const peopleSummary = buildPeopleSummary(materials.peopleRows);
  const placesSummary = buildPlacesSummary(materials.placeRows);

  const summaryText = await generateMonthlySummaryText({
    rangeLabel: `${monthStartDate} 〜 ${monthEndDate}`,
    weeklySummaries: materials.weeklyRows
      .map((row) => row.did_summary)
      .filter(Boolean),
    weeklyPeopleSummaries: materials.weeklyRows
      .map((row) => row.people_summary)
      .filter(Boolean),
    weeklyPlacesSummaries: materials.weeklyRows
      .map((row) => row.places_summary)
      .filter(Boolean),
    fallbackSearchTexts: materials.logs
      .map((log) => log.search_text)
      .filter(Boolean),
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
    source_log_count: hasWeeklyRows
      ? materials.weeklyRows.length
      : materials.logs.length,
  };
}

/**
 * 指定週を即再生成（有料ユーザーのみ）
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
 * 指定月を即再生成（有料ユーザーのみ）
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
 * 有料ユーザー向け週次 / 月次集約を必要時のみ実行
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
