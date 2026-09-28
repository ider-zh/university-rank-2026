import { useEffect, useState } from "react";
import Infobox from "./Infobox";
import SchoolHeader, { type Introduction } from "./SchoolHeader";
import SchoolOverview,{overviewTeaser,type Overview} from './SchoolOverview';
import UsSupplement from './UsSupplement';
import {
  METRICS,
  metricLabels,
  type CatalogDetail,
  type Locale,
  type UniversityMedia,
} from "../lib/catalog-types";

const EMPTY_INTRODUCTION_IDS: string[] = [];
export default function UniversityDetail({
  locale,
  baseUrl,
  release,
  mediaUrl,
  introductionIds = EMPTY_INTRODUCTION_IDS,
}: {
  locale: Locale;
  baseUrl: string;
  release: string;
  mediaUrl: string;
  introductionIds?: string[];
}) {
  const zh = locale === "zh";
  const [data, setData] = useState<CatalogDetail | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [media, setMedia] = useState<UniversityMedia | null>(null);
  const [introduction, setIntroduction] = useState<Introduction | null>(null);
  const [overview,setOverview]=useState<Overview|null>(null);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("id") || "";
    const alternate = document.querySelector<HTMLAnchorElement>(
      "[data-locale-switch]",
    );
    if (alternate && /^Q[1-9]\d*$/.test(id))
      alternate.href = `/${zh ? "en" : "zh"}/university/?id=${id}`;
    if (!/^Q[1-9]\d*$/.test(id)) {
      setError(
        zh
          ? "请从排名列表选择一所大学。"
          : "Choose a university from the rankings.",
      );
      return;
    }
    const controller = new AbortController();
    setError("");
    setMedia(null);
    setIntroduction(null);
    setOverview(null);
    fetch(`/overviews/${release}/${id}.json`,{signal:controller.signal})
      .then(async r=>r.ok?r.json():null).then(value=>{if(value?.id===id&&value.release===release)setOverview(value);}).catch(()=>{});
    if (introductionIds.includes(id)) {
      fetch(`/content/${release}/${id}.json`, { signal: controller.signal })
        .then(async response => response.ok ? response.json() : null)
        .then(value => { if (value?.release === release && value.id === id) setIntroduction(value); })
        .catch(() => { /* Optional editorial content: retain the source description. */ });
    }
    const schoolMediaUrl = mediaUrl.replace(/\/manifest\.json$/, `/universities/${id}.json`);
    fetch(schoolMediaUrl, { signal: controller.signal })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (value?.release === release && value.id === id)
          setMedia({ logo: value.logo || null, hero: value.hero || null });
      })
      .catch(() => {
        /* Images are optional; profile remains usable offline. */
      });
    fetch(`${baseUrl}/universities/${id}.json`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) throw new Error("missing");
        if (!response.ok) throw new Error("network");
        return response.json();
      })
      .then((value) => {
        if (
          value.release !== release ||
          value.university?.id !== id ||
          !value.profiles?.[locale]
        )
          throw new Error("invalid");
        setData(value);
        document.title = `${value.profiles[locale].name} · University Atlas`;
      })
      .catch((error) => {
        if (error.name !== "AbortError")
          setError(
            error.message === "missing"
              ? zh
                ? "该记录不在当前学校收录名单中。"
                : "This record is not in the current university selection."
              : zh
                ? "详情加载失败，请重试。"
                : "Unable to load the university. Please retry.",
          );
      });
    return () => controller.abort();
  }, [locale, baseUrl, mediaUrl, release, attempt, zh, introductionIds]);
  if (error)
    return (
      <section className="py-16">
        <p role="alert" className="mb-5">
          {error}
        </p>
        <button
          className="rounded border border-line px-4 py-2"
          onClick={() => setAttempt((n) => n + 1)}
        >
          {zh ? "重试" : "Retry"}
        </button>
      </section>
    );
  if (!data)
    return (
      <p role="status" className="py-16 text-muted">
        {zh ? "正在加载大学资料…" : "Loading university details…"}
      </p>
    );
  const u = data.university,
    p = data.profiles[locale];
  const country = u.countryCode
    ? new Intl.DisplayNames([locale], { type: "region" }).of(u.countryCode)
    : "";
  const teaser=overviewTeaser(overview,locale);
  return (
    <>
      <SchoolHeader name={p.name} englishName={u.names.en} id={u.id} country={country || ""}
        locale={locale} description={teaser.text||p.description} descriptionLanguage={teaser.text?teaser.language:p.descriptionLanguage}
        website={p.website} wikiUrl={p.wikiUrl} media={media} introduction={introduction} polishedSummary={zh?overview?.polish?.summary:undefined} />
      <SchoolOverview value={overview} locale={locale} sourceUrl={overview?.paragraphs[locale]?.length?p.wikiUrl:data.profiles.en.wikiUrl} />
      {['US','PR','GU','VI','AS','MP'].includes(u.countryCode||'')&&<UsSupplement id={u.id} release={release} locale={locale} />}
      <Infobox profile={p} locale={locale} snapshot={data.sourceSnapshot} />
      <section className="border-t border-line py-9">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {zh ? "五维表现" : "Academic profile"}
          </h2>
          <p className="text-xs text-muted">
            {zh ? "本站名次" : "Site rank"} {u.siteRank ?? u.sourceRank} ·{" "}
            {zh ? "综合分" : "Score"} {(u.sourceScore * 100).toFixed(2)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {METRICS.map((key) => (
            <div
              key={key}
              className="rounded-lg border border-line bg-white/60 p-5"
            >
              <p className="text-xs text-muted">{metricLabels[locale][key]}</p>
              <p className="display mt-3 text-3xl">
                {(u.metrics[key] * 100).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-xs leading-6 text-muted">
          {zh
            ? `本站名次在精选大学集合内计算；原始数据名次 ${u.sourceRank} 保留用于溯源。`
            : `Site rank is calculated within the selected universities. Original source rank ${u.sourceRank} is retained for provenance.`}
        </p>
      </section>
    </>
  );
}
