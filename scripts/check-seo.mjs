// Run against a running production server: SEO_BASE_URL=http://127.0.0.1:3002 node scripts/check-seo.mjs
import assert from 'node:assert/strict';
import sharp from 'sharp';

const origin = process.env.SEO_BASE_URL || 'http://127.0.0.1:3000';
const decode = text => text.replaceAll('&amp;', '&').replaceAll('&quot;', '"');
async function get(path) {
  const response = await fetch(new URL(path, origin), { headers: { 'user-agent': 'facebookexternalhit/1.1' } });
  assert.ok(response.ok, `${path}: HTTP ${response.status}`);
  return response;
}
const sitemap = await (await get('/sitemap.xml')).text();
const pages = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(([, url]) => new URL(decode(url)).pathname);
assert.ok(pages.length >= 6, 'Sitemap includes the public storefront and policies');
const images = new Map();
const titles = new Set();
for (const theme of ['christmas', 'original']) {
  const coreImages = new Set();
  for (const route of pages) {
    const html = await (await get(`${route}?theme=${theme}`)).text();
    const tags = [...html.matchAll(/<meta\s[^>]*>/g)].map(([tag]) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)])));
    const meta = key => tags.find(tag => tag.name === key || tag.property === key)?.content;
    const title = html.match(/<title>(.*?)<\/title>/)?.[1];
    assert.ok(title, `${route}: title`);
    if (theme === 'christmas') { assert.ok(!titles.has(title), `${route}: unique title`); titles.add(title); }
    assert.ok(meta('description'), `${route}: description`);
    assert.ok(!meta('robots')?.includes('noindex'), `${route}: indexable`);
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.ok(canonical && new URL(canonical).protocol === 'https:', `${route}: absolute HTTPS canonical`);
    assert.equal(new URL(canonical).pathname.replace(/\/$/, '') || '/', route);
    const share = new URL(meta('og:url'));
    assert.equal(share.origin, new URL(canonical).origin);
    assert.equal(share.pathname, new URL(canonical).pathname);
    assert.equal(share.searchParams.get('theme'), theme);
    const image = meta('og:image');
    assert.ok(image, `${route}: social image`);
    assert.equal(new URL(image).searchParams.get('theme'), theme);
    if (['/', '/menu', '/order'].includes(route)) { assert.ok(!coreImages.has(image), `${route}: dedicated preview`); coreImages.add(image); }
    assert.equal(meta('twitter:image'), image);
    assert.equal(meta('twitter:card'), 'summary_large_image');
    assert.ok(meta('og:image:alt'));
    if (!images.has(image)) {
      const url = new URL(image);
      const response = await get(url.pathname + url.search);
      assert.match(response.headers.get('content-type') || '', /image\/png/);
      const buffer = Buffer.from(await response.arrayBuffer());
      const info = await sharp(buffer).metadata();
      assert.equal(info.width, 1200); assert.equal(info.height, 630);
      assert.ok(buffer.length < 5 * 1024 * 1024);
      images.set(image, true);
    }
    for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(json);
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, `${route}: one primary heading`);
    console.log(`PASS ${route} (${theme}): canonical, metadata, preview, JSON-LD, heading`);
  }
}
assert.equal(images.size, 6, 'Three page-specific previews in each theme');
assert.ok((await (await get('/robots.txt')).text()).includes('Sitemap: https://'));
console.log('PASS all six preview images, sitemap and robots');
