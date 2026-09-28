import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {officialLogos,isReviewedOfficialLogo} from '../scripts/official-logo-policy.mjs';
const fixture=id=>{
 const spec=officialLogos[id];
 return {license:'All rights reserved',sourceUrl:spec.sourceUrl,sourcePage:spec.sourcePage,licenseUrl:spec.rightsUrl,artist:spec.artist,
  usage:'University identification in development preview; no open-license or endorsement claim',
  identityEvidence:{sourceSha256:spec.sourceSha256,archiveMember:spec.archiveMember,reviewDate:'2026-09-27'}};
};
test('official identity exceptions are limited to reviewed school, asset, and source',()=>{
 const logo=fixture('Q683580');
 assert.ok(isReviewedOfficialLogo('Q683580','logo',logo));
 assert.equal(isReviewedOfficialLogo('Q180865','logo',logo),false);
 assert.equal(isReviewedOfficialLogo('Q683580','hero',logo),false);
 assert.equal(isReviewedOfficialLogo('Q683580','logo',{...logo,sourceUrl:'https://example.com/logo.png'}),false);
 assert.equal(isReviewedOfficialLogo('Q683580','logo',{...logo,license:'Public domain'}),false);
 assert.equal(isReviewedOfficialLogo('Q683580','logo',{...logo,identityEvidence:{...logo.identityEvidence,archiveMember:'08校训.jpg'}}),false);
});
test('all published official logos use individually reviewed identities',async()=>{
 const {release}=JSON.parse(await readFile(new URL('../src/data/catalog.json',import.meta.url)));
 const manifest=JSON.parse(await readFile(new URL(`../public/media/${release}/manifest.json`,import.meta.url)));
 for(const id of Object.keys(officialLogos)){
  assert.ok(isReviewedOfficialLogo(id,'logo',manifest.universities[id].logo),id);
  const detail=JSON.parse(await readFile(new URL(`../public/media/${release}/universities/${id}.json`,import.meta.url)));
  assert.deepEqual(detail.logo,manifest.universities[id].logo);
 }
});
