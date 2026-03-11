// server/src/routes/users.js
import express from "express";
import {
  getAiCommentEnabledByUserId,
  updateAiCommentEnabledByUserId,
} from "../dao/usersDao.js";

const router = express.Router();

/**
 * GET /users/:id/settings
 */
router.get("/:id/settings", async (req, res) => {
  try {
    const { id } = req.params;

    const aiCommentEnabled = await getAiCommentEnabledByUserId(id);

    if (aiCommentEnabled === null) {
      return res.status(404).json({
        error: true,
        message: "user not found",
      });
    }

    return res.json({
      message: "user settings fetched",
      data: {
        ai_comment_enabled: aiCommentEnabled,
      },
    });
  } catch (error) {
    console.error("GET /users/:id/settings error:", error);
    return res.status(500).json({
      error: true,
      message: "failed to fetch user settings",
    });
  }
});

/**
 * PUT /users/:id/settings
 */
router.put("/:id/settings", async (req, res) => {
  try {
    const { id } = req.params;
    const { ai_comment_enabled } = req.body;

    if (typeof ai_comment_enabled !== "boolean") {
      return res.status(400).json({
        error: true,
        message: "ai_comment_enabled must be boolean",
      });
    }

    const updated = await updateAiCommentEnabledByUserId(
      id,
      ai_comment_enabled,
    );

    if (!updated) {
      return res.status(404).json({
        error: true,
        message: "user not found",
      });
    }

    return res.json({
      message: "user settings updated",
      data: {
        ai_comment_enabled: updated.ai_comment_enabled,
      },
    });
  } catch (error) {
    console.error("PUT /users/:id/settings error:", error);
    return res.status(500).json({
      error: true,
      message: "failed to update user settings",
    });
  }
});

export default router;
