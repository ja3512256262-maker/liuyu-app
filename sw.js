/* 留余 · Service Worker
   策略：静态资源 network-first（超时回退缓存），图片/图标 cache-first。
   数据仍保存在浏览器 localStorage，SW 不触碰。
*/
const CACHE_NAME = 'liuyu-v3';
const APP_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './finance.js',
  './reports.js',
  './monthly.js',
  './plans.js',
  './review.js',
  './trends.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_FILES);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (name) { return name !== CACHE_NAME; })
          .map(function (name) { return caches.delete(name); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

function isSameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

function networkWithTimeout(request, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error('timeout')); }, timeoutMs);
    fetch(request).then(function (response) {
      clearTimeout(timer);
      resolve(response);
    }).catch(function (err) {
      clearTimeout(timer);
      reject(err);
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  if (!isSameOrigin(request.url)) return;

  var accept = request.headers.get('accept') || '';
  var isHtml = request.mode === 'navigate' || accept.includes('text/html');
  var isImage = request.destination === 'image' || /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(request.url);

  if (isImage) {
    // cache-first：离线时也能显示图标/图片
    event.respondWith(
      caches.match(request).then(function (cached) {
        if (cached) return cached;
        return fetch(request).then(function (response) {
          if (response && response.status === 200 && response.type === 'basic') {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
          }
          return response;
        }).catch(function () {
          return caches.match('./icons/icon-192.png');
        });
      })
    );
    return;
  }

  // 页面 + JS/CSS/JSON：network-first，超时回退缓存
  event.respondWith(
    networkWithTimeout(request, 3500).then(function (response) {
      if (response && response.status === 200 && response.type === 'basic') {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
      }
      return response;
    }).catch(function () {
      return caches.match(request).then(function (cached) {
        if (cached) return cached;
        if (isHtml) return caches.match('./index.html');
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});
