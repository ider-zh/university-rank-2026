import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  rankUniversities,
  filterUniversities,
  normalizeWeights,
  DEFAULT_WEIGHTS,
} from "../src/lib/ranking.mjs";

function row(id, reputation, academic, country = "US") {
  return {
    id,
    names: { en: `University ${id}`, zh: `大学 ${id}` },
    countryCode: country,
    continent: "Asia",
    sourceRank: 99,
    sourceScore: 0.5,
    metrics: { reputation, academic, financial: 0, faculty: 0, alumnus: 0 },
  };
}
const reputation = {
  reputation: 100,
  academic: 0,
  financial: 0,
  faculty: 0,
  alumnus: 0,
};

test("calculate global ranks before country filtering and preserve source metadata", () => {
  const rows = [
    row("Q1", 1, 0.1),
    row("Q2", 0.8, 0.2, "CN"),
    row("Q3", 0.6, 0.3, "CN"),
  ];
  const original = JSON.stringify(rows);
  const result = filterUniversities(rankUniversities(rows, reputation), {
    country: "CN",
  });
  assert.deepEqual(
    result.map((x) => x.rank),
    [2, 3],
  );
  assert.equal(result[0].sourceRank, 99);
  assert.equal(JSON.stringify(rows), original);
});
test("different weights change the ranking, not only displayed scores", () => {
  const rows = [row("Q1", 1, 0.1), row("Q2", 0.2, 0.9)];
  assert.equal(rankUniversities(rows, reputation)[0].id, "Q1");
  assert.equal(
    rankUniversities(rows, { ...reputation, reputation: 0, academic: 100 })[0]
      .id,
    "Q2",
  );
});
test("ties have competition ranks, including zero-score ties", () => {
  const rows = [
    row("Q3", 0, 0),
    row("Q2", 0.5, 0),
    row("Q1", 0.5 + 1e-13, 0),
    row("Q4", 0, 0),
  ];
  const results = rankUniversities(rows, reputation);
  assert.deepEqual(
    results.map((x) => [x.id, x.rank]),
    [
      ["Q1", 1],
      ["Q2", 1],
      ["Q3", 3],
      ["Q4", 3],
    ],
  );
});
test("empty or non-finite weights cannot silently produce a ranking", () => {
  assert.throws(() => normalizeWeights({ ...reputation, reputation: 0 }));
  assert.throws(() => normalizeWeights({ ...reputation, reputation: NaN }));
  assert.throws(() => normalizeWeights({ ...reputation, reputation: -1 }));
});
test("search works across languages and ID; source mode does not renumber", () => {
  const rows = [row("Q1", 0.2, 0.3), row("Q2", 0.5, 0.6)];
  assert.equal(
    filterUniversities(rankUniversities(rows), { query: "大学 Q2" })[0].rank,
    99,
  );
  assert.equal(
    filterUniversities(rows, { query: "university q1" })[0].id,
    "Q1",
  );
  assert.equal(filterUniversities(rows, { query: "Q2" })[0].id, "Q2");
});
test("full admitted catalog default weights reproduce source scores without duplicate IDs", () => {
  const { release } = JSON.parse(
    readFileSync(new URL("../src/data/catalog.json", import.meta.url)),
  );
  const { universities } = JSON.parse(
    readFileSync(
      new URL(`../public/data/${release}/ranking.json`, import.meta.url),
    ),
  );
  assert.equal(
    new Set(universities.map((u) => u.id)).size,
    universities.length,
  );
  assert(!universities.some((u) => u.id === "Q859363"));
  const custom = rankUniversities(universities, DEFAULT_WEIGHTS);
  assert(custom.every((u) => Math.abs(u.sourceScore * 100 - u.score) < 1e-9));
  assert.equal(custom.length, 1000);
  assert(!universities.some((u) => u.id === "Q907311"), "Netflix must not be admitted");
  for (const id of ["Q17054681", "Q422402", "Q1206658"])
    assert(!universities.some((u) => u.id === id), "Company, disambiguation or university system admitted");
  assert(universities.every((u) => Number.isInteger(u.siteRank)));
});

test("default ranking uses admission ranks without losing upstream provenance", () => {
  const record = { ...row("Q1", 0.2, 0.3), siteRank: 1 };
  const [ranked] = rankUniversities([record]);
  assert.equal(ranked.rank, 1);
  assert.equal(ranked.sourceRank, 99);
});
