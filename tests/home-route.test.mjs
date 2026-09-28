import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('root renders the shared Chinese homepage without a redirect', () => {
  const root = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
  assert.match(root, /import HomePage from/);
  assert.match(root, /<HomePage locale="zh"/);
  assert.doesNotMatch(root, /Astro\.redirect|http-equiv|window\.location/);
});

test('localized routes retain both languages using the shared homepage', () => {
  const route = readFileSync(new URL('../src/pages/[locale]/index.astro', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../src/components/HomePage.astro', import.meta.url), 'utf8');
  assert.match(route, /\['zh', 'en'\]/);
  assert.match(route, /<HomePage locale=\{locale\}/);
  assert.match(home, /<Rankings[\s]*locale=\{locale\}/);
  assert.match(home, /client:load/);
});
