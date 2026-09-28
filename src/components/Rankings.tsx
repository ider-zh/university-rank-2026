import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { Slider } from "./ui/Slider";
import { Checkbox } from "./ui/Checkbox";
import SchoolLogo from "./SchoolLogo";
import {
  DEFAULT_WEIGHTS,
  rankUniversities,
  filterUniversities,
} from "../lib/ranking.mjs";
import {
  METRICS,
  metricLabels,
  subjectNames,
  type Locale,
  type CatalogUniversity,
  type Featured,
  type Subject,
  type SubjectData,
  type Metric,
} from "../lib/catalog-types";

type Ranked = CatalogUniversity & { rank: number; score: number };
interface Props {
  locale: Locale;
  url: string;
  release: string;
  count: number;
  excludedCount: number;
  initial: CatalogUniversity[];
  featured: Featured[];
  logos: Record<string, string>;
  subjects: Subject[];
}
const control =
  "ranking-control border border-line bg-white px-3 py-2 text-sm text-ink";

export default function Rankings({
  locale,
  url,
  release,
  count,
  initial,
  featured,
  logos,
  subjects,
}: Props) {
  const zh = locale === "zh";
  const [data, setData] = useState(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search);
  const [country, setCountry] = useState("");
  const [continent, setContinent] = useState("");
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS });
  const [enabled, setEnabled] = useState<Record<Metric, boolean>>({
    reputation: true,
    academic: true,
    financial: true,
    faculty: true,
    alumnus: true,
  });
  const [custom, setCustom] = useState(false);
  const [subject, setSubject] = useState("");
  const [subjectData, setSubjectData] = useState<SubjectData | null>(null);
  const [subjectError, setSubjectError] = useState("");
  const [subjectAttempt, setSubjectAttempt] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectionNotice, setSelectionNotice] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const regions = useMemo(
    () => new Intl.DisplayNames([locale], { type: "region" }),
    [locale],
  );
  const names = metricLabels[locale];
  const activeWeights = useMemo(
    () =>
      Object.fromEntries(
        METRICS.map((key) => [key, enabled[key] ? weights[key] : 0]),
      ),
    [enabled, weights],
  );
  const weightSum = Object.values(activeWeights).reduce((n, v) => n + v, 0);
  const invalid = custom && !subject && weightSum === 0;
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch(url, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((value) => {
        if (
          value.release !== release ||
          !Array.isArray(value.universities) ||
          value.universities.length !== count
        )
          throw new Error();
        setData(value.universities);
        setReady(true);
      })
      .catch((error) => {
        if (error.name !== "AbortError")
          setError(
            zh
              ? "完整榜单加载失败，请重试。"
              : "Unable to load the complete ranking. Please retry.",
          );
      });
    return () => controller.abort();
  }, [url, release, count, attempt, zh]);
  useEffect(() => {
    setSubjectData(null);
    setSubjectError("");
    const target = subjects.find((s) => s.id === subject);
    if (!target) return;
    const controller = new AbortController();
    fetch(target.url, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((value) => {
        if (
          value.release !== release ||
          value.source !== "legacy-2025" ||
          !Array.isArray(value.rows)
        )
          throw new Error();
        setSubjectData(value);
      })
      .catch((error) => {
        if (error.name !== "AbortError")
          setSubjectError(
            zh ? "学科榜加载失败。" : "Unable to load subject rankings.",
          );
      });
    return () => controller.abort();
  }, [subject, subjects, release, zh, subjectAttempt]);
  const ranked: Ranked[] = useMemo(() => {
    if (invalid) return [];
    if (subject) {
      if (!subjectData) return [];
      const map = new Map(data.map((u) => [u.id, u]));
      return subjectData.rows.flatMap((r) => {
        const u = map.get(r.id);
        return u ? [{ ...u, rank: r.rank, score: r.score }] : [];
      });
    }
    return rankUniversities(data, custom ? activeWeights : null);
  }, [data, activeWeights, custom, invalid, subject, subjectData]);
  const filtered = useMemo(
    () => filterUniversities(ranked, { query, country, continent }),
    [ranked, query, country, continent],
  );
  const countryOptions = useMemo(
    () =>
      [
        ...new Set(
          data.map((u) => u.countryCode).filter((x): x is string => Boolean(x)),
        ),
      ].sort((a, b) =>
        (regions.of(a) || a).localeCompare(regions.of(b) || b, locale),
      ),
    [data, regions, locale],
  );
  const continentOptions = useMemo(
    () =>
      [
        ...new Set(
          data.map((u) => u.continent).filter((x): x is string => Boolean(x)),
        ),
      ].sort(),
    [data],
  );
  const continentNames: Record<string, string> = {
    Asia: "亚洲",
    Europe: "欧洲",
    Africa: "非洲",
    Americas: "美洲",
    "North America": "北美洲",
    "South America": "南美洲",
    Oceania: "大洋洲",
    Antarctica: "南极洲",
  };
  function firstPage() {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }
  function choose(id: string, checked: boolean) {
    setSelectionNotice("");
    if (checked && selected.length >= 4) {
      setSelectionNotice(
        zh
          ? "最多对比 4 所大学，请先移除一所。"
          : "Compare up to four universities. Remove one first.",
      );
      return;
    }
    setSelected((ids) =>
      checked ? [...new Set([...ids, id])] : ids.filter((x) => x !== id),
    );
  }
  const columns = useMemo<ColumnDef<Ranked>[]>(
    () => [
      {
        id: "compare",
        header: () => (
          <span className="sr-only">
            {zh ? "选择对比" : "Select to compare"}
          </span>
        ),
        enableSorting: false,
        cell: ({ row }) => (
          <Checkbox
            aria-label={`${zh ? "对比" : "Compare"} ${row.original.names[locale]}`}
            checked={selected.includes(row.original.id)}
            onCheckedChange={(checked) =>
              choose(row.original.id, checked === true)
            }
          />
        ),
      },
      {
        accessorKey: "rank",
        header: zh
          ? subject
            ? "学科名次"
            : custom
              ? "自定义名次"
              : "本站名次"
          : subject
            ? "Subject rank"
            : custom
              ? "Custom rank"
              : "Site rank",
        cell: ({ getValue }) => (
          <span className="font-semibold tabular-nums">
            {getValue<number>().toLocaleString(locale)}
          </span>
        ),
      },
      {
        id: "name",
        accessorFn: (u) => u.names[locale],
        header: zh ? "大学" : "University",
        cell: ({ row }) => {
          const u = row.original;
          const f = featured.find((x) => x.id === u.id);
          return (
            <a
              className="flex min-w-64 items-center gap-3 sm:gap-4 hover:underline"
              href={
                f
                  ? `/${locale}/university/${u.id}/`
                  : `/${locale}/university/?id=${u.id}`
              }
            >
              <SchoolLogo
                url={logos[u.id]}
                name={u.names[locale]}
                locale={locale}
                list
              />
              <span>
                <span className="block font-medium">{u.names[locale]}</span>
                {zh && u.names.zh !== u.names.en && (
                  <span className="mt-1 block text-xs text-muted">
                    {u.names.en}
                  </span>
                )}
              </span>
            </a>
          );
        },
      },
      {
        id: "country",
        accessorFn: (u) => (u.countryCode ? regions.of(u.countryCode) : ""),
        header: zh ? "国家 / 地区" : "Country / region",
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-muted">
            {getValue<string>() || (zh ? "未知" : "Unknown")}
          </span>
        ),
      },
      {
        accessorKey: "score",
        header: zh ? "综合分" : "Score",
        cell: ({ getValue }) => (
          <span className="font-semibold tabular-nums">
            {getValue<number>().toFixed(2)}
          </span>
        ),
      },
      ...(!subject
        ? METRICS.map((key) => ({
            id: key,
            accessorFn: (u: Ranked) => u.metrics[key] * 100,
            header: names[key],
            cell: ({ getValue }: { getValue: () => unknown }) => (
              <span className="tabular-nums text-muted">
                {Number(getValue()).toFixed(2)}
              </span>
            ),
          }))
        : []),
    ],
    [locale, zh, custom, subject, featured, logos, selected, regions],
  );
  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { sorting, pagination },
    onSortingChange: (next) => {
      setSorting(next);
      firstPage();
    },
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
  });
  const compared = useMemo(
    () =>
      selected.flatMap((id) => {
        const u = data.find((u) => u.id === id);
        return u ? [u] : [];
      }),
    [selected, data],
  );
  function reset() {
    setSearch("");
    setCountry("");
    setContinent("");
    setSubject("");
    setWeights({ ...DEFAULT_WEIGHTS });
    setEnabled({
      reputation: true,
      academic: true,
      financial: true,
      faculty: true,
      alumnus: true,
    });
    setCustom(false);
    setSorting([]);
    setSelected([]);
    setSelectionNotice("");
    firstPage();
  }
  const busy = !ready || Boolean(subject && !subjectData && !subjectError);
  return (
    <section id="rankings" className="rankings-section scroll-mt-6 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs tracking-widest text-muted uppercase">
            {zh ? "01 / 榜单索引" : "01 / THE RANKINGS"}
          </p>
          <h2 className="display text-3xl font-semibold">
            {zh ? "世界大学排名" : "World university rankings"}
          </h2>
        </div>
        <button
          type="button"
          className={`${control} flex items-center gap-2`}
          onClick={reset}
        >
          <RotateCcw size={14} />
          {zh ? "重置" : "Reset"}
        </button>
      </div>
      <p className="mb-6 text-sm leading-7 text-muted">
        {zh
          ? `探索本站收录的 ${count.toLocaleString("zh")} 所大学，按你关注的维度调整权重，比较院校特色。排名在全部收录院校中计算，地区与名称筛选帮助你聚焦感兴趣的学校。`
          : `Explore the ${count.toLocaleString("en")} universities in our collection. Adjust the weights to reflect your priorities and compare institutions. Ranks are calculated across the full collection; region and name filters help you focus on schools of interest.`}
      </p>
      <div className="ranking-filters mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="relative">
          <span className="sr-only">
            {zh ? "搜索大学" : "Search universities"}
          </span>
          <Search size={16} className="absolute top-3 left-3 text-muted" />
          <input
            disabled={!ready}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              firstPage();
            }}
            className={`${control} w-full pl-9`}
            placeholder={zh ? "中文 / English / QID" : "Name / QID"}
          />
        </label>
        <label>
          <span className="sr-only">{zh ? "大洲" : "Continent"}</span>
          <select
            disabled={!ready}
            value={continent}
            onChange={(e) => {
              setContinent(e.target.value);
              setCountry("");
              firstPage();
            }}
            className={`${control} w-full`}
          >
            <option value="">{zh ? "所有大洲" : "All continents"}</option>
            {continentOptions.map((c) => (
              <option key={c} value={c}>
                {zh ? continentNames[c] || c : c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">
            {zh ? "国家 / 地区" : "Country / region"}
          </span>
          <select
            disabled={!ready}
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              firstPage();
            }}
            className={`${control} w-full`}
          >
            <option value="">
              {zh ? "所有国家 / 地区" : "All countries / regions"}
            </option>
            {countryOptions.map((c) => (
              <option key={c} value={c}>
                {regions.of(c)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">{zh ? "学科" : "Subject"}</span>
          <select
            disabled={!ready}
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setSorting([]);
              firstPage();
            }}
            className={`${control} w-full`}
          >
            <option value="">{zh ? "综合排名" : "Overall ranking"}</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {zh ? subjectNames[s.name] || s.name : s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <details
        className="weight-panel mb-5 border-y border-line p-5"
      >
        <summary className="font-medium">
          {zh ? "自定义五维权重" : "Customize your weights"}{" "}
          <span className="ml-2 text-xs font-normal text-muted">
            {subject
              ? zh
                ? "学科榜不适用"
                : "Not applicable to subject rankings"
              : custom
                ? zh
                  ? "自定义模式"
                  : "Custom mode"
                : zh
                  ? "默认权重"
                  : "Default weights"}
          </span>
        </summary>
        {subject ? (
          <p className="mt-3 text-sm text-muted">
            {zh
              ? "当前学科数据沿用旧版（2025），仅显示能映射至当前学校集合的前 2000 名；不与综合指标混算。"
              : "Subject rankings use the legacy 2025 dataset, limited to mapped universities in the source top 2,000. Overall weights do not affect these ranks."}
          </p>
        ) : (
          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {METRICS.map((key) => (
              <div key={key}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={enabled[key]}
                      disabled={!ready}
                      aria-label={`${zh ? "启用" : "Enable"} ${names[key]}`}
                      onCheckedChange={(v) => {
                        setEnabled((x) => ({ ...x, [key]: v === true }));
                        setCustom(true);
                        firstPage();
                      }}
                    />
                    {names[key]}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    aria-label={`${names[key]} ${zh ? "权重" : "weight"}`}
                    disabled={!ready || !enabled[key]}
                    value={weights[key]}
                    className="w-14 rounded border border-line bg-white px-1 py-1 text-right text-xs tabular-nums"
                    onChange={(e) => {
                      setWeights((w) => ({
                        ...w,
                        [key]: Math.max(
                          0,
                          Math.min(100, Number(e.target.value) || 0),
                        ),
                      }));
                      setCustom(true);
                      firstPage();
                    }}
                  />
                </div>
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[weights[key]]}
                  disabled={!ready || !enabled[key]}
                  aria-label={`${names[key]} ${zh ? "权重滑块" : "weight slider"}`}
                  onValueChange={([v]) => {
                    setWeights((w) => ({ ...w, [key]: v }));
                    setCustom(true);
                    firstPage();
                  }}
                />
                <p className="mt-1 text-right text-xs text-muted">
                  {weightSum
                    ? ((activeWeights[key] / weightSum) * 100).toFixed(1)
                    : "0.0"}
                  %
                </p>
              </div>
            ))}
          </div>
        )}
      </details>
      <div role="status" aria-live="polite" className="mb-3 text-sm text-muted">
        {busy
          ? zh
            ? "正在加载完整榜单…"
            : "Loading complete rankings…"
          : error ||
            subjectError ||
            (zh
              ? `找到 ${filtered.length.toLocaleString("zh")} 所大学`
              : `${filtered.length.toLocaleString("en")} universities found`)}
      </div>
      {error && (
        <button className={control} onClick={() => setAttempt((a) => a + 1)}>
          {zh ? "重新加载" : "Retry"}
        </button>
      )}
      {subjectError && (
        <button
          className={control}
          onClick={() => setSubjectAttempt((a) => a + 1)}
        >
          {zh ? "重新加载学科榜" : "Retry subject"}
        </button>
      )}
      {invalid && (
        <p
          role="alert"
          className="mb-4 rounded bg-amber-50 p-3 text-sm text-amber-900"
        >
          {zh
            ? "请至少启用一项大于 0 的权重。"
            : "Enable at least one positive weight."}
        </p>
      )}
      {selectionNotice && (
        <p role="alert" className="my-3 text-sm">
          {selectionNotice}
        </p>
      )}
      <div
        className="ranking-table overflow-x-auto border-y border-line bg-white"
        tabIndex={0}
        role="region"
        aria-label={
          zh
            ? "大学排名表，可横向滚动"
            : "University rankings, horizontally scrollable"
        }
      >
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-ink/5">
            <tr>
              {table.getHeaderGroups()[0].headers.map((header) => (
                <th
                  key={header.id}
                  className="whitespace-nowrap px-4 py-4 text-xs font-medium"
                  aria-sort={
                    header.column.getIsSorted() === "asc"
                      ? "ascending"
                      : header.column.getIsSorted() === "desc"
                        ? "descending"
                        : undefined
                  }
                >
                  {header.column.getCanSort() ? (
                    <button
                      className="flex items-center gap-1"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      <ArrowDownUp size={12} />
                    </button>
                  ) : (
                    flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.original.id}
                className="border-b border-line/70 last:border-0 hover:bg-paper/80"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-4">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!busy && filtered.length === 0 && (
          <p className="p-10 text-center text-muted">
            {zh
              ? "暂无匹配大学，请调整条件。"
              : "No matching universities. Try different filters."}
          </p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <label className="flex items-center gap-2 text-muted">
          {zh ? "每页" : "Rows per page"}
          <select
            aria-label={zh ? "每页条数" : "Rows per page"}
            className={control}
            value={pagination.pageSize}
            onChange={(e) =>
              setPagination({ pageIndex: 0, pageSize: Number(e.target.value) })
            }
          >
            {[20, 50, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-4">
          <button
            aria-label={zh ? "上一页" : "Previous page"}
            className={`${control} disabled:opacity-30`}
            onClick={() => table.previousPage()}
            disabled={busy || !table.getCanPreviousPage()}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="tabular-nums">
            {filtered.length ? pagination.pageIndex + 1 : 0} /{" "}
            {table.getPageCount()}
          </span>
          <button
            aria-label={zh ? "下一页" : "Next page"}
            className={`${control} disabled:opacity-30`}
            onClick={() => table.nextPage()}
            disabled={busy || !table.getCanNextPage()}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      {compared.length > 0 && (
        <section
          className="mt-8 rounded-lg border border-line bg-white/60 p-5"
          aria-label={zh ? "大学对比" : "University comparison"}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">
              {zh ? "大学对比" : "Compare universities"} ({compared.length}/4)
            </h3>
            <button
              className="text-xs underline"
              onClick={() => {
                setSelected([]);
                setSelectionNotice("");
              }}
            >
              {zh ? "清空" : "Clear"}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-3 text-left">
                    {zh ? "维度 / 源指标" : "Dimension / source metric"}
                  </th>
                  {compared.map((u) => (
                    <th key={u.id} className="min-w-40 p-3">
                      <span>{u.names[locale]}</span>
                      <button
                        className="ml-2"
                        aria-label={`${zh ? "移除" : "Remove"} ${u.names[locale]}`}
                        onClick={() => choose(u.id, false)}
                      >
                        <X size={13} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((key) => (
                  <tr key={key} className="border-t border-line">
                    <td className="p-3">{names[key]}</td>
                    {compared.map((u) => (
                      <td className="p-3 text-center tabular-nums" key={u.id}>
                        {(u.metrics[key] * 100).toFixed(2)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
