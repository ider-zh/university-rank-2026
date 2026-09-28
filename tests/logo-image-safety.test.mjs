import test from 'node:test';import assert from 'node:assert/strict';
import {embeddedPng} from '../scripts/logo-image-safety.mjs';
test('extracts only a self-contained PNG from a single-image SVG wrapper',()=>{
 const png=Buffer.from('89504e470d0a1a0a','hex');
 const input=Buffer.from(`<svg width="24"><image xlink:href="data:image/png;base64,${png.toString('base64')}" /></svg>`);
 assert.deepEqual(embeddedPng(input),png);
 assert.throws(()=>embeddedPng(Buffer.from('<svg><image href="https://example.com/a.png" /></svg>')));
 assert.throws(()=>embeddedPng(Buffer.from(input.toString().replace('</svg>','<path d="M0 0"/></svg>'))));
});
