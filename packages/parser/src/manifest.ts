import { parse as parseYaml } from "yaml";

export interface Manifest {
  title: string;
}

export class ManifestParseError extends Error {}

export function parseManifest(content: string): Manifest {
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (err) {
    throw new ManifestParseError(
      `Invalid YAML in game manifest: ${(err as Error).message}`,
    );
  }
  if (!raw || typeof raw !== "object") {
    throw new ManifestParseError("Manifest must be a YAML object");
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.title !== "string" || obj.title.length === 0) {
    throw new ManifestParseError("Manifest missing `title`");
  }
  return { title: obj.title };
}
