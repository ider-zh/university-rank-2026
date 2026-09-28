import test from 'node:test';
import assert from 'node:assert/strict';
import { commonsTitle, reusableMetadata, isCampusCandidate } from '../scripts/media-policy.mjs';
const info = {width:1600,height:900,mime:'image/jpeg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Campus.jpg',extmetadata:{
  Artist:{value:'<a>Photographer</a>'},LicenseShortName:{value:'CC BY-SA 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'},ImageDescription:{value:'Campus main building'},
}};
test('local Wikipedia non-free file paths cannot masquerade as Commons files',()=>{
  assert.equal(commonsTitle({url:'https://upload.wikimedia.org/wikipedia/en/a/aa/Logo.svg'}),null);
  assert.equal(commonsTitle({url:'https://upload.wikimedia.org/wikipedia/commons/a/aa/Campus_building.jpg'}),'File:Campus building.jpg');
});
test('requires explicit reusable license and attribution',()=>{
  assert.equal(reusableMetadata(info).artist,'Photographer');
  for (const license of ['Fair use','Copyrighted','CC BY-NC 4.0','']) assert.equal(reusableMetadata({...info,extmetadata:{...info.extmetadata,LicenseShortName:{value:license}}}),null);
  assert.equal(reusableMetadata({...info,extmetadata:{...info.extmetadata,Artist:{value:''}}}),null);
});
test('hero selection excludes logos and small or non-photo assets',()=>{
  assert.equal(isCampusCandidate({source_flag:'wikidata-image',filename:'Campus.jpg'},info),true);
  assert.equal(isCampusCandidate({source_flag:'wikidata-logo',filename:'Campus.jpg'},info),false);
  assert.equal(isCampusCandidate({source_flag:'wikidata-image',filename:'University seal.png'},info),false);
  assert.equal(isCampusCandidate({source_flag:'wikidata-image',filename:'Reading shield.png'},info),false);
  assert.equal(isCampusCandidate({source_flag:'wikidata-image',filename:'Erciyes University.png'},{...info,extmetadata:{...info.extmetadata,ImageDescription:{value:'Erciyes University'},Categories:{value:'CC-Zero|Logos of universities and colleges in Turkey'}}}),false);
  assert.equal(isCampusCandidate({source_flag:'wikidata-image',filename:'King Saud University Entrance Gate, Riyadh.jpg'},{...info,extmetadata:{...info.extmetadata,Categories:{value:'King Saud University|Logos of King Saud University'}}}),true);
  assert.equal(isCampusCandidate({source_flag:'wikidata-image',filename:'ClevelandTowerWatercolor20060829.jpg'},info),false);
  assert.equal(isCampusCandidate({source_flag:'wikidata-image',filename:'Campus.jpg'},{...info,width:200}),false);
});
test('custom free-use license requires explicit own-work grant metadata',()=>{
  const metadata = {...info.extmetadata,LicenseShortName:{value:'Copyrighted free use'},LicenseUrl:{value:''}};
  assert.equal(reusableMetadata({...info,extmetadata:metadata}),null);
  const granted = {...metadata,Credit:{value:'<span>Own work</span>'},Categories:{value:'Campus|Copyrighted free use'},AttributionRequired:{value:'false'}};
  assert.equal(reusableMetadata({...info,extmetadata:granted}).licenseUrl,'https://commons.wikimedia.org/wiki/Template:Copyrighted_free_use');
});
