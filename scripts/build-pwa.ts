import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { relative, resolve, sep } from 'node:path';

const directory = resolve('dist');
const files = (await readdir(directory, { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name !== 'sw.js')
  .map(entry => resolve(entry.parentPath, entry.name)).sort();
const hash = createHash('sha256');
for (const file of files) hash.update(relative(directory, file)).update(await readFile(file));
const version = hash.digest('hex').slice(0, 16);
const resources = files.map(file => relative(directory, file).split(sep).join('/'))
  .filter(path => !path.startsWith('previews/'));

// Hash the complete build so code/data updates always get a fresh, complete cache.
// A new worker waits for open tabs unless the user explicitly chooses Update & reload.
const worker = `
const PREFIX = 'pogocounter:' + new URL(self.registration.scope).pathname + ':';
const CACHE = PREFIX + '${version}';
const PREVIEW_CACHE = PREFIX + 'previews-v1';
const PREVIEW_ROOT = new URL('previews/', self.registration.scope).href;
const ASSETS = ${JSON.stringify(resources)}.map(path => new URL(path, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE && name !== PREVIEW_CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // SVG <use> requests may include a symbol fragment; all symbols share one cached file.
  url.hash = '';
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then(async cache =>
      await cache.match(new URL('index.html', self.registration.scope).href, { ignoreVary: true }) || fetch(event.request)));
  } else if (url.href.startsWith(PREVIEW_ROOT) && /^[a-f0-9]{20}\\.webp$/.test(url.href.slice(PREVIEW_ROOT.length))) {
    event.respondWith((async () => {
      const cache = await caches.open(PREVIEW_CACHE);
      const saved = await cache.match(event.request, { ignoreVary: true });
      if (saved) return saved;
      try {
        const response = await fetch(event.request);
        if (response.ok && response.headers.get('content-type')?.includes('image/webp')) {
          await cache.put(event.request, response.clone());
          const keys = await cache.keys();
          for (const key of keys.slice(0, Math.max(0, keys.length - 256))) await cache.delete(key);
        }
        return response;
      } catch {
        // Optional unseen artwork stays blank offline; search generation uses only the core cache.
        return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"/>', {
          headers: { 'Content-Type': 'image/svg+xml' },
        });
      }
    })());
  } else if (ASSETS.includes(url.href)) {
    // Precached static files have one representation. Module-script requests may
    // send a different Origin header than precaching, despite identical content.
    event.respondWith(caches.open(CACHE).then(async cache =>
      await cache.match(event.request, { ignoreVary: true }) || fetch(event.request)));
  }
});
`;
await writeFile(resolve(directory, 'sw.js'), worker.trimStart(), 'utf8');
console.log(`Offline cache: ${resources.length} local assets; version ${version}.`);
