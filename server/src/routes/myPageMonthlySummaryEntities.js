// server/src/routes/myPageMonthlySummaryEntities.js
import express from "express";
import { findMonthlyDigestByUserAndYearMonth } from "../dao/monthlyDigestsDao.js";

const router = express.Router();

function splitSummaryText(value) {
  if (!value || typeof value !== "string") {
    return [];
  }

  return [
    ...new Set(
      value
        .split("、")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  ];
}

/**
 * GET /mypage/monthly-summary-entities?user_id=xxx&year_month=2026-02
 */
router.get("/", async (req, res) => {
  try {
    const { user_id, year_month } = req.query;

    if (!user_id) {
      return res.status(400).json({
        error: true,
        message: "user_id is required",
      });
    }

    if (!year_month) {
      return res.status(400).json({
        error: true,
        message: "year_month is required",
      });
    }

    const monthlyDigest = await findMonthlyDigestByUserAndYearMonth(
      String(user_id),
      String(year_month),
    );

    return res.json({
      message: "monthly summary entities fetched",
      data: monthlyDigest
        ? {
            year_month: monthlyDigest.target_year_month,
            people: splitSummaryText(monthlyDigest.people_summary).map(
              (name, index) => ({
                id: `${monthlyDigest.id}-p-${index}`,
                name,
              }),
            ),
            places: splitSummaryText(monthlyDigest.places_summary).map(
              (name, index) => ({
                id: `${monthlyDigest.id}-pl-${index}`,
                name,
              }),
            ),
          }
        : {
            year_month: String(year_month),
            people: [],
            places: [],
          },
    });
  } catch (error) {
    console.error("GET /mypage/monthly-summary-entities error:", error);
    return res.status(500).json({
      error: true,
      message: "failed to fetch monthly summary entities",
    });
  }
});

export default router;
