import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/** Read a JSON file, returning null if it doesn't exist */
export async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as T;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/** Write a JSON file atomically (ensure parent dir exists) */
export async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const content = JSON.stringify(data, null, 2) + "\n";
  await writeFile(path, content, "utf-8");
}
