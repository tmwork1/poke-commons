// Phase 1 残課題: Pyodideコア一式 + jpoke wheel をページ再読み込みをまたいで
// キャッシュする Service Worker (開発プラン §3 Phase1「残課題」/ §4リスク表)。
//
// 対象を絞る方針: Pyodide CDN (cdn.jsdelivr.net/pyodide/) と jpoke wheel
// (/master-data/pyodide/) への GET リクエストのみ cache-first で扱う。
// それ以外 (API呼び出し・通常ページ遷移など) は一切介入せず素通しする。

const CACHE_NAME = "pyodide-engine-v1";
const CACHEABLE_PATTERNS = [/^https:\/\/cdn\.jsdelivr\.net\/pyodide\//, /\/master-data\/pyodide\//];

function isCacheable(url) {
  return CACHEABLE_PATTERNS.some((pattern) => pattern.test(url));
}

self.addEventListener("install", () => {
  // 新しいSWを即座にactivateへ進める(ページ側の再読み込みを待たない)。
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // activate直後から既存タブのフェッチも制御下に置く。
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !isCacheable(request.url)) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) {
        return cached;
      }
      const response = await fetch(request);
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
