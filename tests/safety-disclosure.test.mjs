import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../src/components/UsSupplement.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('UsSupplement.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const panels=[];
function visit(node){
 if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(ast)==='details'&&node.openingElement.attributes.properties.some(p=>p.name?.getText(ast)==='data-campus-safety'))panels.push(node);
 ts.forEachChild(node,visit);
}
visit(ast);

test('campus safety uses a native disclosure closed by default',()=>{
 assert.equal(panels.length,1);
 const panel=panels[0];
 assert.ok(!panel.openingElement.attributes.properties.some(p=>p.name?.getText(ast)==='open'||ts.isJsxSpreadAttribute(p)));
 const summary=panel.children.find(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='summary');
 assert.ok(summary);
 assert.match(summary.getText(ast),/校园安全报告/);
 assert.match(summary.getText(ast),/Campus safety reports/);
 assert.match(summary.getText(ast),/展开查看/);
 assert.match(summary.getText(ast),/收起/);
});

test('filters, counts, definitions and sources fold together; earnings stay outside',()=>{
 const text=panels[0].getText(ast);
 for(const marker of ['campusOptions.map','years.map','geographies','categories','rows.flatMap','历史报告数量','sources.safetyArchive'])assert.ok(text.includes(marker),marker);
 assert.ok(!text.includes('institution.outcomes'));
 assert.ok(source.includes('institution.outcomes'));
});
