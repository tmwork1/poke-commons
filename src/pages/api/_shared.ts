// API ルートで共通に使うレスポンス生成・入力検証ヘルパーをまとめる。
// 各エンドポイントの本体を短く保つための基盤ファイル (poke-research の同名ファイルを移植)。
export function jsonResponse(body: unknown, status = 200): Response {
  // すべての API で JSON レスポンスのヘッダを揃える。
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export function methodNotAllowed(allowed: string[]): Response {
  // 許可メソッドをレスポンスに含めて、クライアント側の切り分けをしやすくする。
  return jsonResponse(
    {
      error: 'Method not allowed',
      allowed,
    },
    405,
  );
}

export function badRequest(message: string): Response {
  return jsonResponse({ error: message }, 400);
}

// リクエストボディの文字数上限(64K文字)。このアプリのJSONペイロード(計算条件・育成データ)は
// 実際には数百文字〜数KB程度で収まるため、巨大なペイロードを送りつけて jsonb 列の
// ストレージ・帯域を消費させる行為への歯止めとして十分すぎる余裕を持たせている。
// (text.length は UTF-16 コード単位数でバイト数の厳密な上限ではないが、
// 「桁違いに巨大なペイロードを弾く」という目的には十分な精度)
export const MAX_REQUEST_BODY_LENGTH = 64 * 1024;

export async function readJsonBody<T>(request: Request): Promise<{ data: T | null; response?: Response }> {
  try {
    // 空ボディは null として扱い、JSON でない入力だけをエラーにする。
    const text = await request.text();
    if (!text.trim()) {
      return { data: null };
    }
    if (text.length > MAX_REQUEST_BODY_LENGTH) {
      return {
        data: null,
        response: badRequest('Request body too large'),
      };
    }
    return { data: JSON.parse(text) as T };
  } catch {
    return {
      data: null,
      response: badRequest('Invalid JSON payload'),
    };
  }
}
