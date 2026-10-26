/* こえのわ Service Worker（vite build 時に事前キャッシュ一覧が埋め込まれる） */
const PREFIX = 'koenowa-precache-';
const CACHE = PREFIX + '__PRECACHE_VERSION__';
const FILES = __PRECACHE_FILES__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // 古いバージョンのアプリ用キャッシュだけを消す。
  // 入力中の文章・よく使う言葉・設定は localStorage にあり、ここでは触らない。
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // 画面本体: キャッシュを優先し、ネットがなくても起動できるようにする
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match('./', { ignoreVary: true }).then((cached) => cached || fetch(req)),
      ),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req, { ignoreSearch: true, ignoreVary: true }).then((cached) => cached || fetch(req)),
    ),
  );
});
