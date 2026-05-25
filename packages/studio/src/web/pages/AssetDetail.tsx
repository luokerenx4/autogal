import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { AssetRow } from "../api";
import { fetchAsset, fetchTuiTxt, sourceImageUrl } from "../api";

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
  }, [assetPath]);

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

          {asset.renderings.source && (
            <div className="detail-section" style={{ marginTop: 16 }}>
              <h2>source.png</h2>
              <div className="preview-img">
                <img
                  src={sourceImageUrl(asset.path)}
                  alt={asset.placeholder}
                />
              </div>
            </div>
          )}

          {asset.renderings.tuiTxt && tuiTxt !== null && (
            <div className="detail-section" style={{ marginTop: 16 }}>
              <h2>tui.txt preview</h2>
              <div className="tui-preview">{tuiTxt}</div>
            </div>
          )}
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
