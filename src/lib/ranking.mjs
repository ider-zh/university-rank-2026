export const DEFAULT_WEIGHTS = Object.freeze({
  reputation: 25,
  academic: 50,
  financial: 10,
  faculty: 5,
  alumnus: 10,
});
const KEYS = Object.keys(DEFAULT_WEIGHTS);

/** @param {Record<string, number>} weights */
export function normalizeWeights(weights) {
  if (KEYS.some((key) => !Number.isFinite(weights[key]) || weights[key] < 0))
    throw new Error("Invalid weights");
  const sum = KEYS.reduce((n, key) => n + weights[key], 0);
  if (sum <= 0) throw new Error("At least one weight must be positive");
  return Object.fromEntries(KEYS.map((key) => [key, weights[key] / sum]));
}

/**
 * Rank the admitted universe BEFORE filtering; retain upstream ranks as provenance.
 * @param {import('./catalog-types').CatalogUniversity[]} records
 * @param {Record<string,number> | null} weights null selects precomputed admission ranks
 */
export function rankUniversities(records, weights = null) {
  if (!weights)
    return records.map((u) => ({
      ...u,
      rank: u.siteRank ?? u.sourceRank,
      score: u.sourceScore * 100,
    }));
  const normalized = normalizeWeights(weights);
  const scored = records
    .map((u) => {
      const score = KEYS.reduce(
        (n, key) =>
          n +
          u.metrics[/** @type {keyof typeof u.metrics} */ (key)] *
            normalized[key],
        0,
      );
      return {
        ...u,
        rank: 0,
        score: score * 100,
        tieKey: Math.round(score * 1e12),
      };
    })
    .sort((a, b) => b.tieKey - a.tieKey || a.id.localeCompare(b.id));
  let previous = -1,
    rank = 0;
  return scored.map((u, index) => {
    if (u.tieKey !== previous) rank = index + 1;
    previous = u.tieKey;
    const { tieKey, ...record } = u;
    return { ...record, rank };
  });
}

/**
 * @template {{names:{en:string,zh:string},id:string,countryCode:string|null,continent:string|null}} T
 * @param {T[]} records
 * @param {{query?:string,country?:string,continent?:string}} filters
 * @returns {T[]}
 */
export function filterUniversities(
  records,
  { query = "", country = "", continent = "" } = {},
) {
  const needle = query.trim().normalize("NFKC").toLocaleLowerCase();
  return records.filter(
    (u) =>
      (!country || u.countryCode === country) &&
      (!continent || u.continent === continent) &&
      (!needle ||
        `${u.names.en} ${u.names.zh} ${u.id}`
          .normalize("NFKC")
          .toLocaleLowerCase()
          .includes(needle)),
  );
}
