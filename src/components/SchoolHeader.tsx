import { useState } from "react";
import SchoolLogo from "./SchoolLogo";
import type { Locale, UniversityMedia } from "../lib/catalog-types";

export interface Introduction {
  release: string;
  id: string;
  sourceSnapshot: string;
  introductions: Record<Locale, { text: string; sources: string[] }>;
  sourceUrls: string[];
}

export default function SchoolHeader({ name, englishName, id, country, locale,
  description, descriptionLanguage, website, wikiUrl, media, introduction, polishedSummary,
}: {
  name: string; englishName: string; id: string; country: string; locale: Locale;
  description: string; descriptionLanguage: Locale; website: string | null; wikiUrl: string | null;
  media?: UniversityMedia | null; introduction?: Introduction | null;
  polishedSummary?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const zh = locale === "zh";
  const photo = media?.hero;
  const available = photo && failedUrl !== photo.url;
  const summary = polishedSummary || introduction?.introductions[locale]?.text;
  return (
    <section className="school-cover relative my-7 isolate overflow-hidden bg-ink text-white md:my-9" aria-label={zh ? "学校概览" : "University overview"}>
      {available && <img src={photo.url} width={photo.width} height={photo.height}
        alt="" aria-hidden="true" fetchPriority="high" decoding="async"
        className="absolute inset-0 -z-20 h-full w-full object-cover"
        style={{ objectPosition: photo.width < photo.height ? "center 48%" : "center" }}
        onError={() => setFailedUrl(photo.url)} />}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#152534]/95 via-[#152534]/85 to-[#152534]/30" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#152534]/75 via-transparent to-transparent" />
      <div className="flex min-h-[420px] flex-col justify-center px-6 py-9 sm:px-10 md:min-h-[470px] md:px-12 md:py-12">
        <div className="flex items-start justify-between gap-5">
          <div className="max-w-3xl">
            <p className="mb-5 text-xs tracking-widest text-white/75">{country} · {id}</p>
            <h1 className="display text-4xl leading-tight [overflow-wrap:anywhere] md:text-5xl">{name}</h1>
            {zh && <p className="mt-3 text-base text-white/80 md:text-lg">{englishName}</p>}
          </div>
          <div className="hidden shrink-0 sm:block"><SchoolLogo url={media?.logo?.url} name={name} locale={locale} large /></div>
        </div>
        <div className="mt-6 max-w-2xl">
          <p lang={summary ? locale : descriptionLanguage} className="text-sm leading-7 text-white/95 md:text-base md:leading-8">
            {summary || description || (zh ? "学校简介待补充。" : "University introduction coming soon.")}
          </p>
          {summary && <p className="mt-3 text-[11px] leading-5 text-white/65">
            {zh ? "AI 辅助资料摘要 · 待人工复核" : "AI-assisted source summary · Pending editorial review"}
            {wikiUrl && <> · <a href={wikiUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">{zh ? "百科来源" : "Encyclopedia source"}</a></>}
          </p>}
        </div>
        <div className="mt-7 flex flex-wrap items-center gap-5 text-sm">
          <div className="sm:hidden"><SchoolLogo url={media?.logo?.url} name={name} locale={locale} /></div>
          {website && <a href={website} target="_blank" rel="noreferrer" className="border-b border-white/50 pb-1">{zh ? "学校官网" : "University website"} ↗</a>}
          {wikiUrl && <a href={wikiUrl} target="_blank" rel="noreferrer" className="border-b border-white/50 pb-1">{zh ? "维基百科" : "Wikipedia"} ↗</a>}
        </div>
      </div>
      {available ? <div className="relative border-t border-white/15 bg-black/25 px-6 py-3 text-[10px] leading-5 text-white/75 sm:px-10 md:px-12">
        {zh ? "背景照片：" : "Background photograph: "}{photo.artist} · <a href={photo.sourcePage || photo.sourceUrl} target="_blank" rel="noreferrer" className="underline">{zh ? "来源" : "Source"}</a>
        {photo.licenseUrl && <> · <a href={photo.licenseUrl} target="_blank" rel="noreferrer" className="underline">{photo.license}</a></>}
        <span> · {zh ? "已缩放、背景裁切与遮罩" : "Resized, background-cropped and overlaid"}</span>
      </div> : <p className="px-6 pb-4 text-[10px] text-white/60 sm:px-10 md:px-12">{zh ? "校园背景照片待补充" : "Campus background photograph unavailable"}</p>}
    </section>
  );
}
