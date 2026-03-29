import { homedir } from "node:os";
import { join } from "node:path";

/** Default loci data directory */
export function lociDataDir(): string {
  return join(homedir(), ".loci");
}

/** Default index file path */
export function indexFilePath(dataDir?: string): string {
  return join(dataDir ?? lociDataDir(), "index.json");
}

/** Normalize a path: expand ~ to homedir */
export function normalizePath(p: string): string {
  if (p.startsWith("~/")) {
    return join(homedir(), p.slice(2));
  }
  return p;
}
