import assert from 'node:assert/strict';
// Some official icons wrap a higher-resolution PNG in a tiny SVG viewport.
// Extract only a sole embedded PNG: never execute SVG, load URLs, or discard other art.
export function embeddedPng(original) {
  const match=original.toString().trim().match(/^<svg\b[^>]*>\s*<image\b[^>]*\b(?:xlink:)?href="data:image\/png;base64,([A-Za-z0-9+/=\s]+)"[^>]*\/?>\s*(?:<\/image>\s*)?<\/svg>$/);
  assert.ok(match,'Expected a single embedded PNG, with no other SVG artwork');
  const data=Buffer.from(match[1],'base64');
  assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  return data;
}
