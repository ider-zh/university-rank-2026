import type { CatalogProfile, Locale } from "../lib/catalog-types";

export default function Infobox({
  profile,
  locale,
  snapshot,
}: {
  profile: CatalogProfile;
  locale: Locale;
  snapshot: string;
}) {
  const zh = locale === "zh";
  const renderFields = (fields: CatalogProfile["infobox"]) => (
    <dl className="grid gap-x-10 md:grid-cols-2">
      {fields.map((field) => (
        <div
          key={field.key}
          className="grid grid-cols-[7rem_1fr] gap-4 border-b border-line/60 py-4 text-sm leading-7"
        >
          <dt className="font-medium">{field.label}</dt>
          <dd
            className="min-w-0 whitespace-pre-line break-words text-muted"
            lang={field.language}
          >
            {field.value.length > 240 ? (
              <details>
                <summary>
                  {field.value.slice(0, 100)}…{" "}
                  <span className="text-xs underline">
                    {zh ? "展开" : "More"}
                  </span>
                </summary>
                <p className="mt-2">{field.value}</p>
              </details>
            ) : (
              field.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
  return (
    <section
      className="border-t border-line py-9"
      aria-labelledby="infobox-heading"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="infobox-heading" className="text-lg font-semibold">
          {zh ? "学校与校园信息" : "University & campus facts"}
        </h2>
        {profile.wikiUrl && (
          <a
            className="text-xs text-muted underline underline-offset-4"
            href={profile.wikiUrl}
            rel="noreferrer"
            target="_blank"
          >
            {zh ? "查看百科来源" : "View Wikipedia source"} ↗
          </a>
        )}
      </div>
      {profile.infobox.length > 0 ? (
        <>
          {renderFields(profile.infobox.slice(0, 8))}
          {profile.infobox.length > 8 && (
            <details className="mt-4">
              <summary className="text-sm font-medium">
                {zh
                  ? `更多学校信息（${profile.infobox.length - 8} 项）`
                  : `More university facts (${profile.infobox.length - 8})`}
              </summary>
              {renderFields(profile.infobox.slice(8))}
            </details>
          )}
        </>
      ) : (
        <p className="text-sm leading-7 text-muted">
          {zh
            ? "此学校的百科信息卡暂无可用内容。"
            : "No infobox information is available for this university yet."}
        </p>
      )}
      <p className="mt-5 text-xs leading-6 text-muted">
        {zh
          ? `百科快照 ${snapshot}。学生、资金等字段保留来源标注的年份；不同语种可能采用不同统计年度。`
          : `Wikipedia snapshot ${snapshot}. Student and financial figures retain their source years; language editions may use different reporting years.`}
      </p>
      {profile.externalRankings.length > 0 && (
        <div className="mt-7">
          <h3 className="mb-3 text-sm font-semibold">
            {zh ? "百科收录的其他排名" : "Other rankings recorded in Wikipedia"}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {profile.externalRankings.map((row) => (
              <div
                key={row.publisher}
                className="rounded border border-line bg-white/60 p-4"
              >
                <p className="text-xs text-muted">
                  {row.publisher}
                  {row.year ? ` · ${row.year}` : ""}
                </p>
                <p className="mt-2 text-lg">{row.rank}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-6 text-muted">
            {zh
              ? "以上为百科快照中的原文排名，非实时榜单；没有标注年份的条目不推定其年度。"
              : "These are rankings as recorded in the source snapshot, not live results. Undated entries are not assigned an inferred year."}
          </p>
        </div>
      )}
    </section>
  );
}
