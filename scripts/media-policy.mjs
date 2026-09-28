// Only explicitly reusable Commons images enter the published local asset bundle.
export function plain(value = '') {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#0*39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

export function commonsTitle(row) {
  try {
    const url = new URL(row.url);
    if (!['commons.wikimedia.org', 'upload.wikimedia.org', 'wikipedia.org', 'en.wikipedia.org'].includes(url.hostname)) return null;
    if (url.hostname === 'upload.wikimedia.org' && !url.pathname.startsWith('/wikipedia/commons/')) return null;
    const filename = decodeURIComponent(url.pathname.split('/').at(-1)).replaceAll('_', ' ');
    if (!/\.(svg|png|jpe?g|webp|gif|tiff?)$/i.test(filename)) return null;
    return `File:${filename}`;
  } catch { return null; }
}

export function reusableMetadata(info) {
  const metadata = info?.extmetadata;
  if (!metadata || info.width <= 0 || info.height <= 0) return null;
  const value = key => plain(metadata[key]?.value || '');
  const license = value('LicenseShortName');
  const ownWorkFreeUse = license === 'Copyrighted free use' && value('Credit') === 'Own work'
    && value('Categories').split('|').includes('Copyrighted free use') && value('AttributionRequired') === 'false';
  if (!ownWorkFreeUse && !/^(CC BY(?:-SA)? (?:[1-4]\.0|2\.5)|CC0|Public domain)$/i.test(license)) return null;
  // Missing authorship is not silently converted into an attribution claim.
  const artist = value('Artist');
  if (!artist) return null;
  const licenseUrl = value('LicenseUrl') || (license === 'Public domain' ? 'https://commons.wikimedia.org/wiki/Commons:Public_domain'
    : ownWorkFreeUse ? 'https://commons.wikimedia.org/wiki/Template:Copyrighted_free_use' : '');
  if (!/^https?:\/\//.test(licenseUrl)) return null;
  return {sourcePage: info.descriptionurl, artist, license, licenseUrl,
    attribution: `${artist} / ${license}`, description: value('ImageDescription'),
    categories: value('Categories'), commonsTitle: info.canonicaltitle,
    ...(ownWorkFreeUse ? {permissionEvidence:{template:'Copyrighted free use',credit:'Own work',attributionRequired:false}} : {})};
}

export function isCampusCandidate(row, info) {
  if (row.source_flag !== 'wikidata-image' || !info || info.width < 800 || info.height < 400) return false;
  const text = `${row.filename} ${plain(info.extmetadata?.ImageDescription?.value || '')}`;
  // A real campus gate/building can also be categorized by the logo or flags on it.
  if (/\b(logos|coats of arms|portraits|flags|maps|paintings|drawings)\b/i.test(plain(info.extmetadata?.Categories?.value || ''))
    && !/\b(hall|building|gate|library|courtyard|tower|facade|façade)\b/i.test(text)) return false;
  return !/\b(logo|seal|shield|coats? of arms|emblem|portrait|map|diagram|flag|signature|painting|drawing|watercolou?r|lithograph)\b|watercolou?r/i.test(text)
    && /image\/(jpeg|png|webp|tiff)/.test(info.mime || '');
}
