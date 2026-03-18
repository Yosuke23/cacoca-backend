// server/src/routes/myPageMonthly.js
import express from "express";
import { isUserPro } from "../dao/subscriptionsDao.js";
import { findMonthlyDigestByUserAndYearMonth } from "../dao/monthlyDigestsDao.js";

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

function getPreviousMonthYearMonth(triggerDate) {
  const date = parseYmdToDate(triggerDate);
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;
}

/**
 * GET /mypage/monthly?user_id=xxx
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

    const pro = await isUserPro(user_id);

    if (!pro) {
      return res.json({
        message: "monthly fetched",
        data: null,
      });
    }

    const triggerDate = formatTodayJst();
    const previousYearMonth = getPreviousMonthYearMonth(triggerDate);
    const monthlyDigest = await findMonthlyDigestByUserAndYearMonth(
      user_id,
      previousYearMonth,
    );

    return res.json({
      message: "monthly fetched",
      data: monthlyDigest
        ? {
            id: monthlyDigest.id,
            target_year_month: monthlyDigest.target_year_month,
            month_start_date: monthlyDigest.month_start_date,
            month_end_date: monthlyDigest.month_end_date,
            summary_text: monthlyDigest.summary_text,
            people_summary: monthlyDigest.people_summary,
            places_summary: monthlyDigest.places_summary,
            source_log_count: monthlyDigest.source_log_count,
            generated_at: monthlyDigest.generated_at,
          }
        : null,
    });
  } catch (error) {
    console.error("GET /mypage/monthly error:", error);
    return res.status(500).json({
      error: true,
      message: "failed to fetch monthly",
    });
  }
});

export default router;
