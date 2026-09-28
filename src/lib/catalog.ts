import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pointer from "../data/catalog.json";
import type {
  CatalogDetail,
  CatalogUniversity,
  Subject,
  MediaManifest,
} from "./catalog-types";

export const catalogRelease = pointer.release;
export const catalogUrl = `/data/${catalogRelease}`;
export const mediaUrl = `/media/${catalogRelease}/manifest.json`;
const mediaPath = resolve(process.cwd(), "public", mediaUrl.slice(1));
export const catalogMedia: MediaManifest = existsSync(mediaPath)
  ? JSON.parse(readFileSync(mediaPath, "utf8"))
  : { release: catalogRelease, universities: {} };
const read = (path: string) =>
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "public", catalogUrl.slice(1), path),
      "utf8",
    ),
  );
export const catalogManifest: {
  universityCount: number;
  excludedCount: number;
  subjects: Subject[];
  sourceSnapshot: string;
} = read("manifest.json");
export const catalogUniversities: CatalogUniversity[] =
  read("ranking.json").universities;
export const catalogProfileFor = (id: string): CatalogDetail =>
  read(`universities/${id}.json`);
