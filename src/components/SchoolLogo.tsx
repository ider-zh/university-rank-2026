import { useState } from "react";
import { School } from "lucide-react";
import type { Locale } from "../lib/catalog-types";

export default function SchoolLogo({
  url,
  name,
  locale,
  large = false,
  list = false,
}: {
  url?: string | null;
  name: string;
  locale: Locale;
  large?: boolean;
  list?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const available = url && failedUrl !== url;
  const label =
    locale === "zh" ? `${name}：校徽暂缺` : `${name}: logo unavailable`;
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center rounded-lg border border-line bg-white ${large ? "size-28 p-4 md:size-36 md:p-6" : list ? "size-16 p-1.5 sm:size-20" : "size-10 p-1.5"}`}
    >
      {available ? (
        <img
          src={url}
          alt={locale === "zh" ? `${name}校徽` : `${name} logo`}
          width={large ? 96 : list ? 80 : 32}
          height={large ? 96 : list ? 80 : 32}
          loading={large ? "eager" : "lazy"}
          decoding="async"
          className={list ? "h-full w-full object-contain" : "max-h-full max-w-full object-contain"}
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <span
          role="img"
          aria-label={label}
          title={label}
          className="flex h-full flex-col items-center justify-center gap-2 text-muted"
        >
          <School size={large ? 36 : list ? 30 : 22} strokeWidth={1.5} aria-hidden="true" />
          {large && (
            <span className="text-[10px]">
              {locale === "zh" ? "校徽待补充" : "Logo unavailable"}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
