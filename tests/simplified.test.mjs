import test from 'node:test';
import assert from 'node:assert/strict';
import { simplifyDisplay } from '../scripts/simplify-zh.mjs';
test('removes empty extraction brackets while preserving meaningful parentheses and URLs',()=>{
  assert.equal(simplifyDisplay('耶鲁大学（），简称耶鲁（），创办于1701年。'),'耶鲁大学，简称耶鲁，创办于1701年。');
  assert.equal(simplifyDisplay('大学（，）（ ； ）（（ ））()（Yale University）（1701年）'),'大学（Yale University）（1701年）');
  assert.equal(simplifyDisplay('https://example.org/学校（）'),'https://example.org/学校（）');
  assert.deepEqual(simplifyDisplay({infobox:[{key:'motto',value:'（）'},{key:'year',value:'（1701）'}]}),{infobox:[{key:'year',value:'（1701）'}]});
});
test('phrase conversion converges to stable simplified display text',()=>{
  const result=simplifyDisplay('帝國學院的本部校園位於倫敦市中心');
  assert.equal(result,'帝国学院的本部校园位于伦敦市中心');
  assert.equal(simplifyDisplay(result),result);
});
test('normalizes university names, facts and alumni without changing source URLs',()=>{
  const source={names:{zh:'國立臺灣大學',en:'National Taiwan University'},infobox:[{value:'自強不息 厚德載物'}],people:[{name:'錢學森'}],wikiUrl:'https://zh.wikipedia.org/wiki/國立臺灣大學',path:'/media/臺灣.webp',score:0.5};
  const result=simplifyDisplay(source);
  assert.equal(result.names.zh,'国立台湾大学');
  assert.equal(result.infobox[0].value,'自强不息 厚德载物');
  assert.equal(result.people[0].name,'钱学森');
  assert.equal(result.wikiUrl,source.wikiUrl);assert.equal(result.path,source.path);
  assert.equal(result.names.en,source.names.en);assert.equal(result.score,source.score);
  assert.deepEqual(simplifyDisplay(result),result);
});
