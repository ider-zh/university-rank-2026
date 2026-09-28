import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { catalogRelease } from "./catalog";
import type { Introduction } from "../components/SchoolHeader";

const manifestPath = resolve(process.cwd(), "public/content", catalogRelease, "manifest.json");
export const introductionIds: string[] = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8")).ids : [];

export function introductionFor(id: string): Introduction | null {
  if (!/^Q[1-9]\d*$/.test(id)) return null;
  const path = resolve(process.cwd(), "public/content", catalogRelease, `${id}.json`);
  if (!existsSync(path)) return null;
  const value = JSON.parse(readFileSync(path, "utf8"));
  return value.id === id && value.release === catalogRelease ? value : null;
}
