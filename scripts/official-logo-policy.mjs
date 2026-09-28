// Explicit, reviewed identity exceptions for the LAN development preview.
// Official provenance is NOT an open license or a grant of trademark rights.
import {readFileSync} from 'node:fs';
export const officialLogos = {
  ...JSON.parse(readFileSync(new URL('./official-logo-additions.json',import.meta.url),'utf8')),
  Q180865: {
    sourceUrl: 'https://www.utoronto.ca/themes/custom/bootstrap_uoft/images/favicons/android-chrome-192x192.png',
    sourcePage: 'https://www.utoronto.ca/',
    rightsUrl: 'https://trademarks.utoronto.ca/branding-information/',
    artist: 'University of Toronto',
    description: 'Official small-format tree identity used by the university website; not the full coat of arms.',
    cacheFile: 'toronto-android-chrome-192x192.png',
    sourceSha256: 'd9a6c1af13ed8b963876bfc0b303be68d83e3f64062e5e06bd00e0abb98e01ee',
  },
  Q683580: {
    sourceUrl: 'https://njunju.nju.edu.cn/_upload/article/files/48/c4/076f92fc4d90b01778f6526efa01/ee817df2-0f1b-4663-b98c-78dbf0aba4eb.rar',
    sourcePage: 'https://njunju.nju.edu.cn/3647/list.htm',
    rightsUrl: 'https://njunju.nju.edu.cn/3647/list.htm',
    artist: '南京大学',
    description: '南京大学官方视觉形象规范中的紫色盾形校标，非校训。',
    cacheFile: 'nju-brand.rar',
    archiveMember: '南京大学视觉形象规范化标准(jpeg格式文件)/01校标.jpg',
    sourceSha256: '1bc144f5c1f74f47d0e3b2e4e786c4758157ebdb1bec92f87866b21d0d1a5dd0',
  },
};

export function isReviewedOfficialLogo(id, kind, asset) {
  const approved = officialLogos[id];
  return Boolean(kind === 'logo' && approved
    && asset.license === 'All rights reserved'
    && asset.sourceUrl === approved.sourceUrl && asset.sourcePage === approved.sourcePage
    && asset.licenseUrl === approved.rightsUrl && asset.artist === approved.artist
    && asset.identityEvidence?.sourceSha256 === approved.sourceSha256
    && (asset.identityEvidence?.background || null) === (approved.background || null)
    && (asset.identityEvidence?.archiveMember || null) === (approved.archiveMember || null)
    && asset.identityEvidence?.reviewDate === '2026-09-27'
    && asset.usage === 'University identification in development preview; no open-license or endorsement claim');
}
