// server/src/services/dailyLogTextSourceService.js

/**
 * daily_logs.payload を LLM入力用テキストへ整形
 */
export function payloadToAnalysisSourceText(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  if (payload.mode === "free") {
    return typeof payload.freeText === "string" ? payload.freeText.trim() : "";
  }

  const lines = [];

  if (payload.todayDid) {
    lines.push(`今日したこと: ${payload.todayDid}`);
  }

  if (payload.todaySaw) {
    lines.push(`今日みたこと: ${payload.todaySaw}`);
  }

  if (payload.todayHeard) {
    lines.push(`今日きいたこと: ${payload.todayHeard}`);
  }

  if (payload.todayThought) {
    lines.push(`今日思ったこと: ${payload.todayThought}`);
  }

  if (payload.tomorrowPlan) {
    lines.push(`明日したいこと: ${payload.tomorrowPlan}`);
  }

  if (payload.recentConcern) {
    lines.push(`最近気になっていることや悩み: ${payload.recentConcern}`);
  }

  if (payload.freeNote) {
    lines.push(`自由メモ: ${payload.freeNote}`);
  }

  return lines.join("\n");
}
