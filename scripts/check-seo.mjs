// Run after npm run build. Checks every public page, including future routes.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const output = '.next/server/app';
const htmlFiles = (await readdir(output, { recursive: true })).filter(file => file.endsWith('.html') && !file.startsWith('_'));
assert.ok(htmlFiles.length, 'Run the production build before checking SEO');
const titles = new Set();
const previews = new Set();
for (const file of htmlFiles) {
  const html = await readFile(join(output, file), 'utf8');
  const route = file === 'index.html' ? '/' : `/${file.replace(/\.html$/, '')}`;
  const tags = [...html.matchAll(/<meta\s[^>]*>/g)].map(([tag]) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value])));
  const meta = key => tags.find(tag => tag.name === key || tag.property === key)?.content;
  const title = html.match(/<title>(.*?)<\/title>/)?.[1];
  assert.ok(title && !titles.has(title), `${route}: unique title`); titles.add(title);
  assert.ok(meta('description'), `${route}: description`);
  assert.ok(!meta('robots')?.includes('noindex'), `${route}: indexable`);
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  assert.ok(canonical && new URL(canonical).protocol === 'https:', `${route}: absolute HTTPS canonical`);
  assert.equal(new URL(canonical).pathname.replace(/\/$/, '') || '/', route);
  assert.equal(new URL(meta('og:url')).href, new URL(canonical).href);
  const image = meta('og:image');
  assert.ok(image && !previews.has(image), `${route}: dedicated social image`); previews.add(image);
  assert.equal(meta('twitter:image'), image);
  assert.equal(meta('twitter:card'), 'summary_large_image');
  assert.ok(meta('og:image:alt'));
  const imagePath = new URL(image).pathname;
  const buffer = await readFile(join(output, `${imagePath.slice(1)}.body`));
  const info = await sharp(buffer).metadata();
  assert.equal(info.width, 1200); assert.equal(info.height, 630); assert.equal(info.format, 'png');
  assert.ok(buffer.length < 5 * 1024 * 1024);
  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(json);
  assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, `${route}: one primary heading`);
  console.log(`PASS ${route}: canonical, metadata, OG/Twitter image, JSON-LD, heading`);
}
const sitemap = await readFile(join(output, 'sitemap.xml.body'), 'utf8');
assert.equal((sitemap.match(/<loc>/g) || []).length, htmlFiles.length, 'Sitemap covers every public page');
assert.ok((await readFile(join(output, 'robots.txt.body'), 'utf8')).includes('Sitemap: https://'));
console.log('PASS sitemap and robots');
