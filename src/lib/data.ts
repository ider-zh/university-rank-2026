import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pointer from '../data/release.json';

export type Locale = 'zh' | 'en';
export interface University {
  id: string;
  names: Record<Locale, string>;
  countryCode: string | null;
  sourceScore: number;
  sourceRank: number;
  metrics: Record<'reputation' | 'academic' | 'financial' | 'faculty' | 'alumnus', number>;
  logo: { url: string; sourceUrl: string; sourceName: string } | null;
}
export interface Profile {
  id: string;
  locale: Locale;
  name: string;
  description: string;
  descriptionLanguage: Locale;
  website: string | null;
  wikiUrl: string | null;
  coordinates: { latitude: number; longitude: number } | null;
}
export const release = pointer.release;
export const dataUrl = `/data/${release}`;
// Build-time file reads only. The browser never receives database or S3 configuration.
function load(path: string) {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'public', dataUrl.slice(1), path), 'utf8'));
}
export const universities: University[] = load('ranking/core.json').universities;
export const manifest = load('manifest.json');
export const profileFor = (id: string, locale: Locale): Profile => load(`universities/${id}/profile.${locale}.json`);
export const countryName = (code: string | null, locale: Locale) => code
  ? new Intl.DisplayNames([locale], { type: 'region' }).of(code)
  : locale === 'zh' ? '地区待补充' : 'Location unavailable';

export const metricNames = {
  zh: { reputation: '声誉', academic: '学术', financial: '资金', faculty: '师资', alumnus: '校友' },
  en: { reputation: 'Reputation', academic: 'Academic', financial: 'Funding', faculty: 'Faculty', alumnus: 'Alumni' },
};
