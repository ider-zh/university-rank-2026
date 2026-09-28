import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export async function validateCatalog(root = project) {
  const read = async (path) =>
    JSON.parse(await readFile(resolve(root, path), "utf8"));
  const { release } = await read("src/data/catalog.json");
  assert(/^catalog-\d{8}T\d{6}Z$/.test(release));
  const base = `public/data/${release}`;
  const manifest = await read(`${base}/manifest.json`);
  assert.equal(manifest.release, release);
  assert.equal(manifest.status, "provisional");
  assert.equal(manifest.selection.policy, "positive-higher-education-top-1000");
  assert.equal(manifest.selection.limit, 1000);
  assert(manifest.universityCount > 0 && manifest.universityCount <= 1000);
  const files = new Set();
  const profiles = new Map();
  // Limit read concurrency: a full catalog has over 16k small files.
  for (let start = 0; start < manifest.files.length; start += 64) {
    await Promise.all(
      manifest.files.slice(start, start + 64).map(async (file) => {
        assert(
          file.path.startsWith(`/data/${release}/`) &&
            !file.path.split("/").includes(".."),
        );
        assert(!files.has(file.path), "Duplicate inventory path");
        files.add(file.path);
        const bytes = await readFile(resolve(root, `public${file.path}`));
        assert.equal(bytes.length, file.bytes);
        assert.equal(
          createHash("sha256").update(bytes).digest("hex"),
          file.sha256,
        );
        const value = JSON.parse(bytes);
        assert.equal(value.release, release);
        if (file.path.includes("/universities/")) {
          profiles.set(value.university.id, value.university);
          assert.equal(
            file.path.split("/").at(-1),
            `${value.university.id}.json`,
          );
          for (const locale of ["zh", "en"]) {
            const profile = value.profiles[locale];
            assert(typeof profile.name === "string" && profile.name.length > 0);
            assert(Array.isArray(profile.infobox));
            assert.equal(
              new Set(profile.infobox.map((f) => f.key)).size,
              profile.infobox.length,
            );
            for (const field of profile.infobox)
              assert(
                typeof field.value === "string" &&
                  field.value.length > 0 &&
                  typeof field.label === "string",
              );
          }
        }
      }),
    );
  }
  const ranking = await read(`${base}/ranking.json`);
  const ids = new Set();
  for (const u of ranking.universities) {
    assert(
      /^Q[1-9]\d*$/.test(u.id) && !ids.has(u.id),
      "Duplicate/invalid university",
    );
    ids.add(u.id);
    assert.deepEqual(profiles.get(u.id), u, "Profile and ranking admission data disagree");
    assert(
      files.has(`/data/${release}/universities/${u.id}.json`),
      "Missing university profile",
    );
    assert(Number.isInteger(u.sourceRank) && u.sourceRank > 0);
    assert(Number.isInteger(u.siteRank) && u.siteRank > 0 && u.siteRank <= 1000);
    assert.equal(u.eligibility.status, "eligible");
    assert.equal(u.eligibility.ruleVersion, "higher-education-v2");
    assert(u.eligibility.evidence.length > 0, "Admission must have positive evidence");
    assert(Object.values(u.eligibility.quality).every(Boolean), "Incomplete admission quality checks");
    assert(
      Object.values(u.names).every(
        (v) => typeof v === "string" && v.length > 0,
      ),
    );
    const keys = ["reputation", "academic", "financial", "faculty", "alumnus"];
    const weights = [0.25, 0.5, 0.1, 0.05, 0.1];
    assert(
      keys.every(
        (k) =>
          Number.isFinite(u.metrics[k]) &&
          u.metrics[k] >= 0 &&
          u.metrics[k] <= 1,
      ),
    );
    assert(
      Math.abs(
        keys.reduce((n, k, i) => n + u.metrics[k] * weights[i], 0) -
          u.sourceScore,
      ) < 1e-10,
    );
  }
  assert.equal(ids.size, manifest.universityCount);
  assert(!ids.has("Q907311"), "Netflix regression: non-school in catalog");
  let previousScore = Infinity;
  let expectedRank = 0;
  ranking.universities.forEach((university, index) => {
    const key = Math.round(university.sourceScore * 1e12);
    assert(key <= previousScore, "Preselection must be score-sorted");
    if (key !== previousScore) expectedRank = index + 1;
    assert.equal(university.siteRank, expectedRank);
    previousScore = key;
  });
  for (const subject of manifest.subjects) {
    assert(files.has(subject.url));
    const data = await read(`public${subject.url}`);
    assert.equal(data.source, "legacy-2025");
    assert.equal(data.rows.length, subject.count);
    assert.equal(new Set(data.rows.map((r) => r.id)).size, data.rows.length);
    assert(
      data.rows.every(
        (r) => ids.has(r.id) && Number.isFinite(r.score) && r.rank > 0,
      ),
    );
  }
  const audit = await read(`reports/${release}/quality.json`);
  assert.equal(audit.includedUniversities, ids.size);
  assert.equal(audit.excluded.length, manifest.excludedCount);
  assert(audit.excluded.every((x) => !ids.has(x.id)));
  assert.deepEqual(audit.selection, manifest.selection);
  assert.deepEqual(audit.selectedIds, ranking.universities.map((u) => u.id));
  assert.equal(
    audit.admissionDecisions.length + audit.excluded.length,
    audit.sourceUniversities,
  );
  const decisions = new Map(audit.admissionDecisions.map((d) => [d.id, d]));
  for (const id of ids) assert.equal(decisions.get(id)?.status, "eligible");
  assert.equal(decisions.get("Q907311")?.status, "rejected");
  assert.equal(decisions.get("Q1206658")?.reason, "university-system-scope-needs-review");
  assert(!ids.has("Q1206658"), "University system must not duplicate campus scope");
  assert(audit.qualityFailures.every((x) => !ids.has(x.id)));
  return {
    release,
    universities: ids.size,
    subjects: manifest.subjects.length,
    files: files.size,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.log(
    await validateCatalog(process.argv[2] ? resolve(process.argv[2]) : project),
  );
}
