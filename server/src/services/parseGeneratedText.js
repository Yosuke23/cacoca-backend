// server/src/services/parseGeneratedText.js
/**
 * LLM出力を title / body に分離する
 *
 * 想定フォーマット：
 *
 * 【title】
 * xxxx
 *
 * 【body】
 * yyyy
 */
export function parseGeneratedText(text) {
  if (!text || typeof text !== "string") {
    return {
      title: null,
      body: null,
    };
  }

  const titleMatch = text.match(/【title】([\s\S]*?)【body】/);
  const bodyMatch = text.match(/【body】([\s\S]*)$/);

  const title = titleMatch ? titleMatch[1].trim() : null;

  const body = bodyMatch ? bodyMatch[1].trim() : text.trim(); // フォールバック

  return { title, body };
}
