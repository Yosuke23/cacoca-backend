// server/src/services/dailyLogAiCommentService.js
import { generateText } from "./llmClient.js";
import { payloadToAnalysisSourceText } from "./dailyLogTextSourceService.js";
import { upsertDailyLogAiComment } from "../dao/dailyLogAiCommentsDao.js";
import { getAiCommentEnabledByUserId } from "../dao/usersDao.js";

/**
 * =====================================================
 * daily log ai comment service
 * =====================================================
 * 役割：
 * - 日記1件に対する AIコメントだけを生成する
 * - daily_log_ai_comments に保存する
 * - フロントの保存後モーダル表示に必要な形式で返す
 * =====================================================
 */

function buildAiCommentPrompt(sourceText) {
  return `
あなたは日記アプリ CaCoCa のやさしい相棒です。
以下の日記内容に対して、短く自然で、少しほっこりする日本語のコメントを1つ作成してください。

ルール:
- 2〜4文程度
- 上から目線にしない
- 説教しない
- 過剰に褒めすぎない
- ユーザーの出来事や気持ちに自然に触れる
- 読後感がやわらかいこと
- コメント本文のみを出力する
- 箇条書きにしない
- ユーザーが明示していない気持ちを推測して断定しない
- 「〜したくなった」「〜と思ったはず」など、内面を補完する表現は避ける
- ユーザーの感情は、日記本文に書かれている範囲で受け止める
- 共感はしてよいが、気持ちを広げすぎない
- 少しやさしく寄り添う程度にとどめる

[日記]
${sourceText}
  `.trim();
}

/**
 * AIコメント生成 + 保存
 */
export async function saveDailyLogAiComment(userId, dailyLogId, payload) {
  if (!userId || !dailyLogId || !payload) {
    throw new Error(
      "saveDailyLogAiComment: userId, dailyLogId, payload are required",
    );
  }

  const aiCommentEnabled = await getAiCommentEnabledByUserId(userId);

  if (!aiCommentEnabled) {
    return {
      ai_comment: null,
      ai_comment_enabled: false,
    };
  }

  const sourceText = payloadToAnalysisSourceText(payload);

  if (!sourceText.trim()) {
    return {
      ai_comment: null,
      ai_comment_enabled: true,
    };
  }

  const prompt = buildAiCommentPrompt(sourceText);
  const aiCommentText = (await generateText(prompt)).trim();

  if (!aiCommentText) {
    return {
      ai_comment: null,
      ai_comment_enabled: true,
    };
  }

  const savedAiComment = await upsertDailyLogAiComment(
    userId,
    dailyLogId,
    aiCommentText,
  );

  return {
    ai_comment: savedAiComment,
    ai_comment_enabled: true,
  };
}
