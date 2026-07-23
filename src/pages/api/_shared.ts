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

export async function readJsonBody<T>(request: Request): Promise<{ data: T | null; response?: Response }> {
  try {
    // 空ボディは null として扱い、JSON でない入力だけをエラーにする。
    const text = await request.text();
    if (!text.trim()) {
      return { data: null };
    }
    return { data: JSON.parse(text) as T };
  } catch {
    return {
      data: null,
      response: badRequest('Invalid JSON payload'),
    };
  }
}
