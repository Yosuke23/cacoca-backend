// server/src/services/llmClient.js

import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * =====================================================
 * LLM Client
 * =====================================================
 * 役割：
 * - LLM（Gemma）との通信のみを担当
 * - プロンプトの意味や用途は一切知らない
 * =====================================================
 */

// =========================
// 初期化
// =========================

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not set");
}

const genAI = new GoogleGenerativeAI(apiKey);

/**
 * 使用モデル
 * - 無料枠
 * - 日本語安定
 * - 編集用途に十分
 */
const model = genAI.getGenerativeModel({
  // model: "gemini-2.5-flash", // 有料
  model: "gemma-3-27b-it", // 無料
});

// =========================
// 公開API
// =========================
let llmCallCount = 0;
/**
 * generateText
 *
 * @param {string} prompt - 完全に組み立て済みのプロンプト
 * @returns {Promise<string>} 生成されたテキスト
 *
 * - 成功 or throw のみ
 */
export async function generateText(prompt) {
  if (!prompt || typeof prompt !== "string") {
    throw new Error("Prompt must be a non-empty string");
  }
  llmCallCount += 1;
  const callNo = llmCallCount;
  console.log(
    `[LLM] #${callNo} start model=${modelName} promptLength=${prompt.length}`,
  );
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;

    const text = response.text();

    if (!text || typeof text !== "string") {
      throw new Error("LLM returned empty text");
    }
    console.log(`[LLM] #${callNo} success outputLength=${text.length}`);
    return text;
  } catch (error) {
    console.error("LLM generateText error:", error);
    console.error(
      `[LLM] #${callNo} error message=${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}
