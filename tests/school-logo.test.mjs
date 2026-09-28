import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const source = readFileSync(new URL("../src/components/SchoolLogo.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", compiled)(createRequire(import.meta.url), module, module.exports);
const SchoolLogo = module.exports.default;
const render = (props) => renderToStaticMarkup(createElement(SchoolLogo, { name: "Test University", locale: "en", ...props }));

test("list logos have responsive larger frames and fill them without cropping", () => {
  const html = render({ list: true, url: "/logo.svg" });
  assert.match(html, /size-16 p-1\.5 sm:size-20/);
  assert.match(html, /h-full w-full object-contain/);
  assert.match(html, /width="80" height="80"/);
  assert.match(html, /loading="lazy"/);
});

test("list placeholders are accessible and header sizes remain unchanged", () => {
  assert.match(render({ list: true }), /aria-label="Test University: logo unavailable"/);
  assert.match(render({}), /size-10 p-1\.5/);
  assert.match(render({ large: true }), /size-28 p-4 md:size-36 md:p-6/);
});
