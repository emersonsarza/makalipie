import assert from "node:assert/strict";
import test from "node:test";
import { socialImageMetadata, themedMetadata, type SocialSearchParams } from "../src/lib/social-metadata";

for (const page of ["home", "menu", "order"] as const) {
  test(`${page} social images have distinct theme URLs and correct dimensions`, () => {
    const christmas = socialImageMetadata(page);
    const original = socialImageMetadata(page, "original");
    assert.notEqual(christmas.url, original.url);
    assert.equal(christmas.width, 1200);
    assert.equal(christmas.height, 630);
    assert.match(christmas.url, /theme=christmas&v=/);
    assert.match(original.url, /theme=original&v=/);
    assert.match(christmas.alt, /Christmas/);
  });
}

test("metadata defaults to Christmas and handles original, invalid, and repeated theme values like the UI", async () => {
  const cases: [SocialSearchParams, string][] = [[{}, "christmas"], [{ theme: "original" }, "original"], [{ theme: "invalid" }, "christmas"], [{ theme: ["original", "christmas"] }, "original"]];
  for (const [params, expected] of cases) {
    const metadata = await themedMetadata({}, "home", Promise.resolve(params));
    assert.match(JSON.stringify(metadata.openGraph), new RegExp(`theme=${expected}`));
    assert.match(JSON.stringify(metadata.twitter), new RegExp(`theme=${expected}`));
  }
});

test("theme-specific image metadata preserves existing titles, descriptions, canonical and robots", async () => {
  const metadata = await themedMetadata({title:"Privacy Policy", description:"Existing description", alternates:{canonical:"/privacy"}, robots:{index:false}, openGraph:{title:"Existing OG title"}}, "home", Promise.resolve({theme:"original"}));
  assert.equal(metadata.title, "Privacy Policy");
  assert.equal(metadata.description, "Existing description");
  assert.deepEqual(metadata.alternates, {canonical:"/privacy"});
  assert.deepEqual(metadata.robots, {index:false});
  assert.equal(metadata.openGraph?.title, "Existing OG title");
  assert.equal(metadata.openGraph?.url, "/privacy?theme=original");
  assert.deepEqual(metadata.openGraph?.images, metadata.twitter?.images);
});


test("share identities distinguish themes without including order details", async () => {
  const metadata = await themedMetadata({alternates:{canonical:"/order"}}, "order", Promise.resolve({theme:"original", product:"keylime", branch:"cebu"}));
  assert.equal(metadata.openGraph?.url, "/order?theme=original");
  assert.deepEqual(metadata.alternates, {canonical:"/order"});
  const preorder = await themedMetadata({openGraph:{url:"/menu"}}, "menu", Promise.resolve({view:"preorders"}));
  assert.equal(preorder.openGraph?.url, "/menu?theme=christmas&view=preorders");
});
