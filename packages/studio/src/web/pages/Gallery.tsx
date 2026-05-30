import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { AssetKind, AssetRow } from "../api";
import { fetchAssets, sourceImageUrl } from "../api";

// Asset gallery. Single grid, no pagination — RPG-Harness games are
// small enough that "scroll through all your assets" is the natural
// browse mode. Sort: kind (bg → cg → portrait), then path. The user
// can override with the filter chips at the top.
export function Gallery() {
  const [assets, setAssets] = useState<AssetRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<AssetKind | "all" | "missing">("all");

  useEffect(() => {
    fetchAssets()
      .then(setAssets)
      .catch((e) => setErr(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!assets) return [];
    if (filter === "all") return assets;
    if (filter === "missing") {
      return assets.filter((a) => !a.renderings.tuiTxt && !a.renderings.tuiAns);
    }
    return assets.filter((a) => a.kind === filter);
  }, [assets, filter]);

  if (err) return <div className="empty">⚠ {err}</div>;
  if (!assets) return <div className="empty">loading…</div>;

  if (assets.length === 0) {
    return (
      <div className="empty">
        <p>No assets declared yet.</p>
        <p className="muted">
          Drop a spec.yaml under <code>assets/portraits/</code>,{" "}
          <code>assets/backgrounds/</code>, or <code>assets/cgs/</code> to
          get started.
        </p>
      </div>
    );
  }

  const counts = {
    all: assets.length,
    portrait: assets.filter((a) => a.kind === "portrait").length,
    bg: assets.filter((a) => a.kind === "bg").length,
    cg: assets.filter((a) => a.kind === "cg").length,
    missing: assets.filter((a) => !a.renderings.tuiTxt && !a.renderings.tuiAns)
      .length,
  };

  return (
    <>
      <h1 className="page-title">Assets</h1>
      <div className="row" style={{ marginBottom: 16 }}>
        <FilterChip
          label={`all (${counts.all})`}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <FilterChip
          label={`portrait (${counts.portrait})`}
          active={filter === "portrait"}
          onClick={() => setFilter("portrait")}
        />
        <FilterChip
          label={`bg (${counts.bg})`}
          active={filter === "bg"}
          onClick={() => setFilter("bg")}
        />
        <FilterChip
          label={`cg (${counts.cg})`}
          active={filter === "cg"}
          onClick={() => setFilter("cg")}
        />
        <FilterChip
          label={`missing TUI (${counts.missing})`}
          active={filter === "missing"}
          onClick={() => setFilter("missing")}
        />
      </div>
      <div className="grid">
        {filtered.map((a) => (
          <AssetCard key={a.path} asset={a} />
        ))}
      </div>
    </>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={"btn" + (active ? " primary" : "")} onClick={onClick}>
      {label}
    </button>
  );
}

function AssetCard({ asset }: { asset: AssetRow }) {
  return (
    <Link to={`/asset/${asset.path}`} className="card">
      <div className="thumb">
        {asset.renderings.source ? (
          <img src={sourceImageUrl(asset.path)} alt={asset.placeholder} />
        ) : (
          <div className="placeholder-thumb">{asset.placeholder}</div>
        )}
      </div>
      <div className="body">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className={`kind-badge ${asset.kind}`}>{asset.kind}</span>
          <RenderingFlags r={asset.renderings} />
        </div>
        <div className="path">{asset.path}</div>
        <div className="placeholder-text">{asset.placeholder}</div>
      </div>
    </Link>
  );
}

function RenderingFlags({ r }: { r: AssetRow["renderings"] }) {
  return (
    <div className="rendering-flags">
      <span className={"flag" + (r.tuiAns ? " present" : "")}>ANS</span>
      <span className={"flag" + (r.tuiTxt ? " present" : "")}>TXT</span>
      <span className={"flag" + (r.source ? " present" : "")}>SRC</span>
      <span className={"flag" + (r.web ? " present" : "")}>WEB</span>
    </div>
  );
}
