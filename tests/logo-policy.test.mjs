import test from 'node:test';
import assert from 'node:assert/strict';
import {currentLogoMetadata,currentClaim,isStandaloneMotto} from '../scripts/logo-policy.mjs';
const info=description=>({width:100,height:100,descriptionurl:'https://commons.wikimedia.org/wiki/File:Example.svg',extmetadata:{Artist:{value:'University'},LicenseShortName:{value:'Public domain'},ImageDescription:{value:description}}});
test('standalone motto images cannot be university logos',()=>{
 assert.equal(currentLogoMetadata({...info('Own work'),canonicaltitle:'File:Motto of Nanjing University .jpg'}),null);
 assert.equal(isStandaloneMotto('File:南京大学校训.jpg'),true);
 assert.equal(isStandaloneMotto('File:University of Calgary coat of arms without motto scroll.svg'),false);
 assert.equal(isStandaloneMotto('File:Minn duluth logo motto.png'),false);
});
test('historical school logo is rejected despite valid public-domain license',()=>{
 assert.equal(currentLogoMetadata(info('1932年至1949年国立中山大学（广州）校徽。')),null);
 assert.equal(currentLogoMetadata(info('Former logo of the university')),null);
 assert.ok(currentLogoMetadata(info('Logo of the university, founded in 1932')));
});
test('deprecated and explicitly ended logo claims are not current identity evidence',()=>{
 assert.equal(currentClaim({rank:'deprecated'}),false);
 assert.equal(currentClaim({qualifiers:{P582:[{datavalue:{value:{time:'+1949-01-01T00:00:00Z'}}}]}},2026),false);
 assert.equal(currentClaim({rank:'normal'}),true);
});
