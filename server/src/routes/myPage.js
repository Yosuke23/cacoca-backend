// server/src/routes/myPage.js
import express from "express";
import { runDerivedJobsIfNeeded } from "../services/runDerivedJobsService.js";
import { findLatestDigestPeopleRowsByUserId } from "../dao/digestPeopleDao.js";
import { findLatestDigestPlacesRowsByUserId } from "../dao/digestPlacesDao.js";
import { findLatestWeeklyDigestByUserId } from "../dao/weeklyDigestsDao.js";
import { findLatestMonthlyDigestByUserId } from "../dao/monthlyDigestsDao.js";

const router = express.Router();

function formatTodayJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

/**
 * GET /mypage?user_id=xxx
 *
 * 役割：
 * - マイページ表示用データ取得
 * - 呼び出し時に runDerivedJobsIfNeeded(...) を実行
 * - 必要なら people / places / weekly / monthly を補完生成
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

    try {
      await runDerivedJobsIfNeeded(user_id, triggerDate);
    } catch (derivedJobsError) {
      console.error("GET /mypage derived jobs error:", derivedJobsError);
    }

    const [peopleRows, placeRows, weeklyDigest, monthlyDigest] =
      await Promise.all([
        findLatestDigestPeopleRowsByUserId(user_id),
        findLatestDigestPlacesRowsByUserId(user_id),
        findLatestWeeklyDigestByUserId(user_id),
        findLatestMonthlyDigestByUserId(user_id),
      ]);

    return res.json({
      message: "mypage data fetched",
      data: {
        people: peopleRows.map((row) => ({
          id: row.id,
          digest_start_date: row.digest_start_date,
          digest_end_date: row.digest_end_date,
          person_name: row.person_name,
        })),
        places: placeRows.map((row) => ({
          id: row.id,
          digest_start_date: row.digest_start_date,
          digest_end_date: row.digest_end_date,
          place_name: row.place_name,
        })),
        weekly_digest: weeklyDigest
          ? {
              id: weeklyDigest.id,
              week_start_date: weeklyDigest.week_start_date,
              week_end_date: weeklyDigest.week_end_date,
              did_summary: weeklyDigest.did_summary,
              people_summary: weeklyDigest.people_summary,
              places_summary: weeklyDigest.places_summary,
              free_note_summary: weeklyDigest.free_note_summary,
              source_log_count: weeklyDigest.source_log_count,
              generated_at: weeklyDigest.generated_at,
            }
          : null,
        monthly_digest: monthlyDigest
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
      },
    });
  } catch (error) {
    console.error("GET /mypage error:", error);
    return res.status(500).json({
      error: true,
      message: "failed to fetch mypage data",
    });
  }
});

export default router;
