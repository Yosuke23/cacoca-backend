// server/src/routes/myPageCurrentMonthEntities.js
import express from "express";
import { isUserPro } from "../dao/subscriptionsDao.js";
import { findWeeklyDigestsByUserAndDateRange } from "../dao/weeklyDigestsDao.js";

const router = express.Router();

function formatTodayJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function parseYmdToDate(ymd) {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateToYmd(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentYearMonthAndRange(triggerDate) {
  const date = parseYmdToDate(triggerDate);

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
    year_month: `${monthStartDate.getFullYear()}-${`${monthStartDate.getMonth() + 1}`.padStart(2, "0")}`,
    month_start_date: formatDateToYmd(monthStartDate),
    month_end_date: formatDateToYmd(monthEndDate),
  };
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function splitSummaryText(value) {
  if (!value || typeof value !== "string") {
    return [];
  }
  return uniqueStrings(
    value
      .split("、")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );
}

function formatDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return formatDateToYmd(value);
  }
  return String(value).slice(0, 10);
}

/**
 * GET /mypage/current-month-entities?user_id=xxx
 *
 * 役割：
 * - 有料ユーザー向け
 * - 当月トップ表示用の「今月会った人 / 今月行った場所」を返す
 * - 元データは weekly_digests.people_summary / places_summary
 */
router.get("/", async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({
        error: true,
        message: "user_id is required",
      });
    }

    const triggerDate = formatTodayJst();
    const { year_month, month_start_date, month_end_date } =
      getCurrentYearMonthAndRange(triggerDate);

    const weeklyRows = await findWeeklyDigestsByUserAndDateRange(
      String(user_id),
      month_start_date,
      month_end_date,
    );

    const sourcePeriodStartDate =
      weeklyRows.length > 0
        ? weeklyRows
            .map((row) => row.week_start_date)
            .filter(Boolean)
            .sort()[0]
        : null;

    const sourcePeriodEndDate =
      weeklyRows.length > 0
        ? weeklyRows
            .map((row) => row.week_end_date)
            .filter(Boolean)
            .sort()
            .slice(-1)[0]
        : null;

    const lastUpdatedAt =
      weeklyRows.length > 0
        ? weeklyRows
            .map((row) => row.generated_at || row.created_at)
            .filter(Boolean)
            .sort()
            .slice(-1)[0]
        : null;

    const people = uniqueStrings(
      weeklyRows.flatMap((row) => splitSummaryText(row.people_summary)),
    ).map((name, index) => ({
      id: `p-${year_month}-${index}`,
      name,
    }));

    const places = uniqueStrings(
      weeklyRows.flatMap((row) => splitSummaryText(row.places_summary)),
    ).map((name, index) => ({
      id: `pl-${year_month}-${index}`,
      name,
    }));

    return res.json({
      message: "current month entities fetched",
      data: {
        source_period_start_date: formatDateOnly(sourcePeriodStartDate),
        source_period_end_date: formatDateOnly(sourcePeriodEndDate),
        last_updated_at: formatDateOnly(lastUpdatedAt),
        year_month,
        people,
        places,
      },
    });
  } catch (error) {
    console.error("GET /mypage/current-month-entities error:", error);
    return res.status(500).json({
      error: true,
      message: "failed to fetch current month entities",
    });
  }
});

export default router;
