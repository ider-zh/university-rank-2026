export type Locale = "zh" | "en";
export type Metric =
  "reputation" | "academic" | "financial" | "faculty" | "alumnus";
export type Weights = Record<Metric, number>;
export interface CatalogUniversity {
  id: string;
  names: Record<Locale, string>;
  countryCode: string | null;
  continent: string | null;
  sourceRank: number;
  siteRank?: number;
  sourceScore: number;
  metrics: Weights;
}
export interface InfoboxField {
  key: string;
  label: string;
  value: string;
  language: Locale;
}
export interface CatalogProfile {
  name: string;
  description: string;
  descriptionLanguage: Locale;
  website: string | null;
  wikiUrl: string | null;
  infobox: InfoboxField[];
  externalRankings: { publisher: string; rank: string; year: string | null }[];
}
export interface CatalogDetail {
  schemaVersion: string;
  release: string;
  sourceSnapshot: string;
  university: CatalogUniversity;
  profiles: Record<Locale, CatalogProfile>;
}
export interface Subject {
  id: string;
  name: string;
  count: number;
  url: string;
}
export interface SubjectData {
  release: string;
  source: string;
  rows: { id: string; rank: number; score: number }[];
}
export interface Featured {
  id: string;
  logo: { url: string } | null;
}
export interface MediaAsset {
  url: string;
  width: number;
  height: number;
  sourceUrl: string;
  sourcePage: string | null;
  artist: string | null;
  license: string | null;
  licenseUrl: string | null;
  attribution: string | null;
}
export interface UniversityMedia {
  logo: MediaAsset | null;
  hero: MediaAsset | null;
}
export interface MediaManifest {
  release: string;
  universities: Record<string, UniversityMedia>;
}
export const METRICS: Metric[] = [
  "reputation",
  "academic",
  "financial",
  "faculty",
  "alumnus",
];
export const metricLabels: Record<Locale, Record<Metric, string>> = {
  zh: {
    reputation: "声誉",
    academic: "学术",
    financial: "资金",
    faculty: "师资",
    alumnus: "校友",
  },
  en: {
    reputation: "Reputation",
    academic: "Academic",
    financial: "Funding",
    faculty: "Faculty",
    alumnus: "Alumni",
  },
};
export const subjectNames: Record<string, string> = {
  Art: "艺术",
  Biology: "生物学",
  Business: "商学",
  Chemistry: "化学",
  "Computer science": "计算机科学",
  Economics: "经济学",
  Engineering: "工程学",
  "Engineering disciplines": "工程学科",
  "Environmental science": "环境科学",
  Geography: "地理学",
  Geology: "地质学",
  History: "历史学",
  "Materials science": "材料科学",
  Mathematics: "数学",
  Medicine: "医学",
  Philosophy: "哲学",
  Physics: "物理学",
  "Political science": "政治学",
  Psychology: "心理学",
  Sociology: "社会学",
};
