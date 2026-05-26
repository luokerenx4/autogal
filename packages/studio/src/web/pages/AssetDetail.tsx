import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type {
  AssetRow,
  DitherMode,
  HealthState,
  RenderOptions,
  SymbolSet,
} from "../api";
import {
  fetchAsset,
  fetchHealth,
  fetchTuiTxt,
  renderTui,
  sourceImageUrl,
  uploadSource,
} from "../api";

// Server's whitelist (mirrored here for the dropdown). Each entry
// carries a one-line `hint` shown next to the dropdown when that
// option is selected — gives the author actionable trade-off info
// without forcing them to A/B every option.
//
// "density" column = effective pixels per character cell. Higher
// density = more visual info, but needs a font shipping those
// Unicode ranges. Most modern monospace fonts (SF Mono, Menlo,
// Fira Code, JetBrains Mono, any Nerd Font) cover through sextant;
// octant is Unicode 16 and rolling out gradually.
interface SymbolOpt {
  value: SymbolSet;
  label: string;
  hint: string;
}
const SYMBOL_OPTIONS: SymbolOpt[] = [
  {
    value: "block",
    label: "block",
    hint: "▀▄█ half-blocks. 1×2 density. Works everywhere; loses detail on portraits.",
  },
  {
    value: "half",
    label: "half",
    hint: "▀▄ + ▌▐. Same density as block; slightly richer pattern set.",
  },
  {
    value: "quad",
    label: "quad",
    hint: "▖▗▘▙ quadrants. 2×2 density. Good middle ground; broad font support.",
  },
  {
    value: "sextant",
    label: "sextant",
    hint: "🬀–🬻 sextants. 2×3 density — 3× more detail than block. Needs SF Mono / Fira / etc.",
  },
  {
    value: "braille",
    label: "braille",
    hint: "⠁⠂⠃ Braille dots. 2×4 density, pointillist look. Best for line art / text-y subjects.",
  },
  {
    value: "octant",
    label: "octant",
    hint: "𜺨–𜻿 octants. 2×4 density. Unicode 16; only newest fonts render it correctly.",
  },
  {
    value: "ascii",
    label: "ascii",
    hint: "Plain ASCII only (no Unicode). Lowest quality, max compatibility (logs / email).",
  },
  {
    value: "all",
    label: "all",
    hint: "chafa picks from every supported glyph. Highest perceived quality; output varies.",
  },
];

interface DitherOpt {
  value: DitherMode;
  label: string;
  hint: string;
}
const DITHER_OPTIONS: DitherOpt[] = [
  {
    value: "none",
    label: "none",
    hint: "No dithering. Crisp edges, posterized flats. Best for line art, logos, pixel art.",
  },
  {
    value: "ordered",
    label: "ordered",
    hint: "Bayer pattern. Adds a uniform texture to flat regions; predictable, looks 'engineered'.",
  },
  {
    value: "diffusion",
    label: "diffusion",
    hint: "Floyd-Steinberg error diffusion. Smoothest gradients; best for photos / faces.",
  },
];

// Asset detail. Two-column layout:
//   left  — spec metadata (kind, refs, size_hint, tags, placeholder)
//   right — prompt (copyable) + previews (source.png, tui.txt)
//
// The route path is `/asset/<asset-path>` where <asset-path> may
// itself contain slashes (e.g. "assets/portraits/kagari-smile").
// React Router's splat (`/asset/*`) preserves that, accessible via
// useLocation since `useParams` only gives the splat as a single
// param — same effect via location.pathname.slice.
export function AssetDetail() {
  const loc = useLocation();
  const assetPath = loc.pathname.replace(/^\/asset\//, "");

  const [asset, setAsset] = useState<AssetRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tuiTxt, setTuiTxt] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [busy, setBusy] = useState<"upload" | "render" | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Render options form state. Defaults are "use chafa's own / spec's
  // hint" — only fields the user explicitly touched go into the POST
  // body. Persisted in component state only; refreshing the page
  // resets to defaults (intentional for v2-experiment-mode use).
  const [symbols, setSymbols] = useState<SymbolSet | "">("");
  const [dither, setDither] = useState<DitherMode | "">("");
  const [overrideSize, setOverrideSize] = useState(false);
  const [cols, setCols] = useState<string>("");
  const [rows, setRows] = useState<string>("");

  // After an upload or render, the asset's renderings flip on the
  // server — refetch + re-pull the preview so the UI mirrors disk.
  // Reused by both upload and render handlers + the source.png
  // preview cache-busts on the new query string.
  const [cacheKey, setCacheKey] = useState(0);

  useEffect(() => {
    setAsset(null);
    setErr(null);
    setTuiTxt(null);
    fetchAsset(assetPath)
      .then((a) => {
        setAsset(a);
        if (a.renderings.tuiTxt) {
          fetchTuiTxt(assetPath)
            .then(setTuiTxt)
            .catch(() => {}); // tui-txt is a preview-nice-to-have, not blocking
        }
      })
      .catch((e) => setErr(e.message));
  }, [assetPath, cacheKey]);

  // Health is global; fetch once on mount and reuse for the whole
  // session. The user installing chafa mid-session would need to
  // refresh — acceptable for v2.
  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch(() => {
        /* health is advisory; failures fall back to "chafa unknown" */
      });
  }, []);

  if (err) return <Layout backTo="/"><div className="empty">⚠ {err}</div></Layout>;
  if (!asset) return <Layout backTo="/"><div className="empty">loading…</div></Layout>;

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(asset.prompt);
      showToast(setToast, "prompt copied");
    } catch {
      showToast(setToast, "copy failed (clipboard permission)");
    }
  };
  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(asset.path);
      showToast(setToast, "path copied");
    } catch {
      showToast(setToast, "copy failed");
    }
  };

  // Upload handler shared by the file picker and drag-drop pathways.
  // Both end up here with a single Blob. v2 enforces PNG client-side
  // for a friendlier error message; the server enforces it too.
  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/png")) {
      showToast(setToast, "PNG only — got " + (file.type || "unknown"));
      return;
    }
    setBusy("upload");
    try {
      await uploadSource(assetPath, file);
      setCacheKey((k) => k + 1);
      showToast(setToast, "source.png uploaded");
    } catch (e) {
      showToast(setToast, (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const onPickFile: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0];
    if (f) void handleUpload(f);
    // Reset so picking the same file twice still fires onChange.
    e.target.value = "";
  };
  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) void handleUpload(f);
  };

  const handleRender = async () => {
    // Compose options from the form: include each field only if the
    // user touched it. Empty options sends an empty body (server
    // preserves backward-compatible defaults — block / spec.sizeHint).
    const options: RenderOptions = {};
    if (symbols !== "") options.symbols = symbols;
    if (dither !== "") options.dither = dither;
    if (overrideSize) {
      const c = parseInt(cols, 10);
      const r = parseInt(rows, 10);
      if (Number.isFinite(c) && c > 0) options.cols = c;
      if (Number.isFinite(r) && r > 0) options.rows = r;
    }

    setBusy("render");
    try {
      await renderTui(assetPath, options);
      setCacheKey((k) => k + 1);
      showToast(setToast, "tui.txt rendered");
    } catch (e) {
      // 503 (no chafa) gets a more actionable hint than the raw
      // server message — the user shouldn't have to read JSON.
      const status = (e as Error & { status?: number }).status;
      if (status === 503) {
        showToast(setToast, "chafa not installed — try `brew install chafa`");
      } else if (status === 412) {
        showToast(setToast, "upload a source.png first");
      } else {
        showToast(setToast, (e as Error).message);
      }
    } finally {
      setBusy(null);
    }
  };

  const chafaPresent = health?.chafa.present ?? false;
  const canRender = asset.renderings.source && chafaPresent && busy === null;

  return (
    <Layout backTo="/">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>
            <span className={`kind-badge ${asset.kind}`}>{asset.kind}</span>{" "}
            <span style={{ marginLeft: 8 }}>{asset.placeholder}</span>
          </h1>
          <div className="path mono muted">{asset.path}</div>
        </div>
        <button className="btn" onClick={copyPath}>
          copy path
        </button>
      </div>

      <div className="detail-layout">
        <div>
          <div className="detail-section">
            <h2>spec</h2>
            <dl className="kv">
              <dt>kind</dt>
              <dd>{asset.kind}</dd>
              <dt>placeholder</dt>
              <dd>{asset.placeholder}</dd>
              {asset.styleRef && (
                <>
                  <dt>style_ref</dt>
                  <dd className="mono">{asset.styleRef}</dd>
                </>
              )}
              {asset.sizeHint?.tui && (
                <>
                  <dt>size_hint.tui</dt>
                  <dd className="mono">
                    {asset.sizeHint.tui.cols} × {asset.sizeHint.tui.rows}
                  </dd>
                </>
              )}
              {asset.sizeHint?.web && (
                <>
                  <dt>size_hint.web</dt>
                  <dd className="mono">aspect {asset.sizeHint.web.aspect}</dd>
                </>
              )}
              {asset.tags && asset.tags.length > 0 && (
                <>
                  <dt>tags</dt>
                  <dd>{asset.tags.join(", ")}</dd>
                </>
              )}
            </dl>
          </div>

          {asset.refs && Object.keys(asset.refs).length > 0 && (
            <div className="detail-section" style={{ marginTop: 16 }}>
              <h2>refs</h2>
              <dl className="kv">
                {asset.refs.characters && (
                  <>
                    <dt>characters</dt>
                    <dd>{asset.refs.characters.join(", ")}</dd>
                  </>
                )}
                {asset.refs.emotion && (
                  <>
                    <dt>emotion</dt>
                    <dd>{asset.refs.emotion}</dd>
                  </>
                )}
                {Object.entries(asset.refs)
                  .filter(
                    ([k]) => k !== "characters" && k !== "emotion",
                  )
                  .map(([k, v]) => (
                    <React.Fragment key={k}>
                      <dt>{k}</dt>
                      <dd>{String(v)}</dd>
                    </React.Fragment>
                  ))}
              </dl>
            </div>
          )}

          <div className="detail-section" style={{ marginTop: 16 }}>
            <h2>description</h2>
            <div style={{ whiteSpace: "pre-wrap" }}>{asset.description}</div>
          </div>

          <div className="detail-section" style={{ marginTop: 16 }}>
            <h2>renderings</h2>
            <div className="rendering-flags">
              <span className={"flag" + (asset.renderings.tuiAns ? " present" : "")}>
                tui.ans
              </span>
              <span className={"flag" + (asset.renderings.tuiTxt ? " present" : "")}>
                tui.txt
              </span>
              <span className={"flag" + (asset.renderings.source ? " present" : "")}>
                source.png
              </span>
              <span className={"flag" + (asset.renderings.web ? " present" : "")}>
                web.*
              </span>
            </div>
          </div>
        </div>

        <div>
          <div className="detail-section">
            <h2 style={{ display: "flex", justifyContent: "space-between" }}>
              <span>prompt</span>
              <button className="btn primary" onClick={copyPrompt}>
                copy
              </button>
            </h2>
            <div className="prompt-block">{asset.prompt}</div>
          </div>

          <div className="detail-section" style={{ marginTop: 16 }}>
            <h2 style={{ display: "flex", justifyContent: "space-between" }}>
              <span>source.png</span>
              <button
                className="btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy !== null}
              >
                {asset.renderings.source ? "replace" : "upload"}
              </button>
            </h2>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png"
              onChange={onPickFile}
              style={{ display: "none" }}
            />
            <div
              className={
                "preview-img droppable" + (busy === "upload" ? " busy" : "")
              }
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
            >
              {asset.renderings.source ? (
                <img
                  // Cache-bust on cacheKey so a re-upload of the same
                  // path doesn't show the stale browser-cached image.
                  src={`${sourceImageUrl(asset.path)}?v=${cacheKey}`}
                  alt={asset.placeholder}
                />
              ) : (
                <div className="empty" style={{ padding: 32 }}>
                  drop a PNG here or click <em>upload</em>
                </div>
              )}
              {busy === "upload" && (
                <div className="overlay">uploading…</div>
              )}
            </div>
          </div>

          <div className="detail-section" style={{ marginTop: 16 }}>
            <h2 style={{ display: "flex", justifyContent: "space-between" }}>
              <span>tui.txt</span>
              <button
                className="btn primary"
                onClick={handleRender}
                disabled={!canRender}
                title={
                  !asset.renderings.source
                    ? "upload source.png first"
                    : !chafaPresent
                      ? "chafa not installed — brew install chafa"
                      : busy === "render"
                        ? "rendering…"
                        : "run chafa to regenerate"
                }
              >
                {busy === "render"
                  ? "rendering…"
                  : asset.renderings.tuiTxt
                    ? "re-render"
                    : "render (chafa)"}
              </button>
            </h2>
            {!chafaPresent && (
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                chafa not detected on PATH. Install with{" "}
                <code>brew install chafa</code> (macOS) and restart studio.
              </div>
            )}

            <details className="render-opts" open>
              <summary>render options</summary>

              <div className="render-opts-grid">
                <label>
                  <span>symbols</span>
                  <select
                    value={symbols}
                    onChange={(e) =>
                      setSymbols(e.target.value as SymbolSet | "")
                    }
                  >
                    <option value="">(default: block)</option>
                    {SYMBOL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="opt-hint">
                  {symbols === ""
                    ? SYMBOL_OPTIONS[0]!.hint
                    : SYMBOL_OPTIONS.find((o) => o.value === symbols)?.hint}
                </div>

                <label>
                  <span>dither</span>
                  <select
                    value={dither}
                    onChange={(e) =>
                      setDither(e.target.value as DitherMode | "")
                    }
                  >
                    <option value="">(default: none)</option>
                    {DITHER_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="opt-hint">
                  {dither === ""
                    ? DITHER_OPTIONS[0]!.hint
                    : DITHER_OPTIONS.find((o) => o.value === dither)?.hint}
                </div>

                <label className="size-toggle">
                  <span>
                    <input
                      type="checkbox"
                      checked={overrideSize}
                      onChange={(e) => {
                        setOverrideSize(e.target.checked);
                        if (e.target.checked && cols === "" && rows === "") {
                          // Seed from spec hint when toggling on, so
                          // tweaking is editing-not-typing-from-scratch.
                          setCols(
                            asset.sizeHint?.tui?.cols
                              ? String(asset.sizeHint.tui.cols)
                              : "",
                          );
                          setRows(
                            asset.sizeHint?.tui?.rows
                              ? String(asset.sizeHint.tui.rows)
                              : "",
                          );
                        }
                      }}
                    />{" "}
                    override size
                  </span>
                  {overrideSize && (
                    <span className="size-inputs">
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={cols}
                        onChange={(e) => setCols(e.target.value)}
                        placeholder="cols"
                      />
                      <span>×</span>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={rows}
                        onChange={(e) => setRows(e.target.value)}
                        placeholder="rows"
                      />
                    </span>
                  )}
                </label>
                <div className="opt-hint">
                  {overrideSize
                    ? "Bigger = more detail but eats stage area. Portraits: 40×24 ≈ half-screen. BGs: 80×30 ≈ full-stage."
                    : asset.sizeHint?.tui
                      ? `Using spec hint: ${asset.sizeHint.tui.cols}×${asset.sizeHint.tui.rows}. Tick to override per-render.`
                      : "No spec hint set. chafa will pick its own (terminal-sized — likely too big to commit). Tick to set explicitly."}
                </div>
              </div>

              <div className="render-opts-tip">
                <strong>Quick recipe:</strong> portraits → <code>sextant</code>{" "}
                + <code>diffusion</code>; bg / scenery →{" "}
                <code>sextant</code> + <code>ordered</code>; line-art or
                logos → <code>quad</code> + <code>none</code>.
              </div>
            </details>

            {asset.renderings.tuiTxt && tuiTxt !== null ? (
              <div className="tui-preview">{tuiTxt}</div>
            ) : (
              <div className="empty" style={{ padding: 16 }}>
                no tui.txt yet
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </Layout>
  );
}

function Layout({
  children,
  backTo,
}: {
  children: React.ReactNode;
  backTo: string;
}) {
  return (
    <>
      <Link to={backTo} className="back-link">
        ← back to gallery
      </Link>
      {children}
    </>
  );
}

function showToast(
  setToast: (s: string | null) => void,
  msg: string,
): void {
  setToast(msg);
  setTimeout(() => setToast(null), 1800);
}
