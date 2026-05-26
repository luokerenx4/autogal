// Typed fetchers for the studio API. Shapes mirror the server's
// projection in handlers.ts — kept in this single file so a type
// drift between server and client is one diff to spot.

export interface GameSummary {
  title: string;
  counts: { characters: number; scripts: number; assets: number };
  gameDir: string;
}

export type AssetKind = "portrait" | "bg" | "cg";

export interface AssetRow {
  path: string;
  kind: AssetKind;
  description: string;
  prompt: string;
  placeholder: string;
  styleRef?: string;
  refs?: {
    characters?: string[];
    emotion?: string;
    [k: string]: unknown;
  };
  sizeHint?: {
    tui?: { cols: number; rows: number };
    web?: { aspect: string };
  };
  tags?: string[];
  renderings: {
    source: boolean;
    tuiTxt: boolean;
    tuiAns: boolean;
    web: boolean;
  };
}

export async function fetchGame(): Promise<GameSummary> {
  const r = await fetch("/api/game");
  if (!r.ok) throw new Error(`/api/game: ${r.status}`);
  return r.json();
}

export async function fetchAssets(): Promise<AssetRow[]> {
  const r = await fetch("/api/assets");
  if (!r.ok) throw new Error(`/api/assets: ${r.status}`);
  return r.json();
}

export async function fetchAsset(assetPath: string): Promise<AssetRow> {
  const r = await fetch(`/api/assets/${assetPath}`);
  if (!r.ok) throw new Error(`/api/assets/${assetPath}: ${r.status}`);
  return r.json();
}

// Resolves to the URL the <img> tag should use for an asset's source
// PNG. The browser's image cache + content-type handling does the
// rest. Returns undefined for assets with no source file (caller
// falls back to a placeholder UI).
export function sourceImageUrl(assetPath: string): string {
  return `/files/source/${assetPath}`;
}

export async function fetchTuiTxt(assetPath: string): Promise<string> {
  const r = await fetch(`/files/tui-txt/${assetPath}`);
  if (!r.ok) throw new Error(`tui-txt missing`);
  return r.text();
}

export interface ToolCheck {
  present: boolean;
  version?: string;
  path?: string;
}

export interface HealthState {
  chafa: ToolCheck;
}

export async function fetchHealth(): Promise<HealthState> {
  const r = await fetch("/api/health");
  if (!r.ok) throw new Error(`/api/health: ${r.status}`);
  return r.json();
}

// Upload a PNG to the asset's source.png slot. The server accepts
// multipart "file" or raw image/* — we use multipart so a future
// helper that posts a Blob from canvas (e.g. paste from clipboard)
// works without changing the contract. Returns the updated AssetRow.
export async function uploadSource(
  assetPath: string,
  file: Blob,
): Promise<AssetRow> {
  const form = new FormData();
  form.append("file", file);
  const r = await fetch(`/api/assets/${assetPath}/source`, {
    method: "POST",
    body: form,
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`upload failed (${r.status}): ${body}`);
  }
  return r.json();
}

// Invoke server-side chafa to produce tui.txt from source.png.
// Surfaces server status codes verbatim so the UI can branch:
//   503 → chafa not installed (show install hint)
//   412 → no source.png (prompt to upload first)
//   500 → chafa failed (show stderr-derived message)
export async function renderTui(assetPath: string): Promise<AssetRow> {
  const r = await fetch(`/api/assets/${assetPath}/render-tui`, {
    method: "POST",
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({ error: r.statusText }));
    const e = new Error(
      typeof body === "object" && body && "error" in body
        ? String((body as { error: string }).error)
        : r.statusText,
    );
    (e as Error & { status?: number }).status = r.status;
    throw e;
  }
  return r.json();
}
