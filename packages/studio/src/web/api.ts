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
