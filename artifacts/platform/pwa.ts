import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import type { Plugin } from "vite";

// Original barbell icon, generated at build time. No external artwork/dependency.
function icon(size: number): Buffer {
  const crc = (data: Buffer) => {
    let value = 0xffffffff;
    for (const byte of data) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (name: string, data: Buffer) => {
    const type = Buffer.from(name);
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc(Buffer.concat([type, data])));
    return Buffer.concat([length, type, data, checksum]);
  };
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const a = x / size, b = y / size;
    const gold = (b > .46 && b < .54 && a > .2 && a < .8) ||
      ((a > .25 && a < .33 || a > .67 && a < .75) && b > .28 && b < .72) ||
      ((a > .18 && a < .24 || a > .76 && a < .82) && b > .36 && b < .64);
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    pixels.set(gold ? [180, 151, 90, 255] : [24, 40, 82, 255], offset);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}

/** Precache actual production hashed chunks (including lazy chunks), never API data. */
export function trainingPwa(base: string): Plugin {
  const root = base.endsWith("/") ? base : `${base}/`;
  const manifest = {
    id: root, name: "Navy Powerlifting", short_name: "Navy Lifting",
    description: "Team training with offline workout logging",
    start_url: root, scope: root, display: "standalone",
    background_color: "#182852", theme_color: "#182852",
    icons: [192, 512].map(size => ({ src: `${root}icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any maskable" })),
  };
  return {
    name: "navy-training-pwa", enforce: "post",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split("?")[0];
        if (pathname === `${root}manifest.webmanifest`) {
          response.setHeader("Content-Type", "application/manifest+json");
          response.end(JSON.stringify(manifest));
        } else if (pathname === `${root}icon-192.png` || pathname === `${root}icon-512.png`) {
          response.setHeader("Content-Type", "image/png");
          response.end(icon(pathname.endsWith("192.png") ? 192 : 512));
        } else next();
      });
    },
    generateBundle(_options, bundle) {
      for (const size of [192, 512]) this.emitFile({ type: "asset", fileName: `icon-${size}.png`, source: icon(size) });
      this.emitFile({ type: "asset", fileName: "manifest.webmanifest", source: JSON.stringify(manifest) });
      const assets = [...new Set([...Object.keys(bundle).filter(name => !name.endsWith(".map")), "icon-192.png", "icon-512.png", "manifest.webmanifest"])].map(name => `${root}${name}`);
      const version = createHash("sha256").update(JSON.stringify(bundle)).digest("hex").slice(0, 16);
      const source = `
const CACHE = "navy-shell-${version}";
const ASSETS = ${JSON.stringify(assets)};
const ROOT = ${JSON.stringify(root)};
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  // A new shell waits until old windows close. Never reload a live logger.
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("navy-shell-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname === "/api") return;
  if (event.request.mode === "navigate" && url.pathname.startsWith(ROOT)) {
    event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then(cache => cache.match(ROOT + "index.html")).then(response => response || Response.error())));
    return;
  }
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname)).then(response => response || fetch(event.request)));
  }
});
`;
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}
