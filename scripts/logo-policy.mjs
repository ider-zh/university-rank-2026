import {plain,reusableMetadata} from './media-policy.mjs';

// A motto can appear on a real coat of arms. Reject standalone motto artwork,
// not every logo whose description mentions its motto.
export function isStandaloneMotto(title = '') {
  const name = title.replace(/^File:/i, '').replaceAll('_', ' ').trim();
  return /^(?:motto|slogan)\s+(?:of\s+|for\s+)|(?:校训|校訓)(?:\s*\.(?:jpe?g|png|svg|webp)$|图片|圖片)/i.test(name);
}

export function currentLogoMetadata(info) {
  if (isStandaloneMotto(info?.canonicaltitle || '')) return null;
  const reusable = reusableMetadata(info);
  if (!reusable) return null;
  const description = plain(info.extmetadata?.ImageDescription?.value || '');
  // Wikidata P154 can point at a historic logo without an end-time qualifier.
  if (/\b(?:former|historic(?:al)?|old|obsolete)\s+(?:university\s+)?(?:logo|seal|coat of arms|emblem)|(?:旧|舊|历史|歷史)(?:校徽|标志|標誌)|\b(?:logo|seal|emblem)\s+(?:used\s+)?(?:from|between)\s+\d{4}\s*(?:to|and|[-–])\s*\d{4}|\d{4}\s*年至\s*\d{4}\s*年[^。]{0,40}校徽/i.test(description)) return null;
  return reusable;
}

export function currentClaim(claim, currentYear = new Date().getUTCFullYear()) {
  if (claim.rank === 'deprecated') return false;
  return !(claim.qualifiers?.P582 || []).some(q => {
    const time = q.datavalue?.value?.time;
    const year = typeof time === 'string' ? Number(time.match(/^\+?(\d+)-/)?.[1]) : NaN;
    return Number.isFinite(year) && year < currentYear;
  });
}
