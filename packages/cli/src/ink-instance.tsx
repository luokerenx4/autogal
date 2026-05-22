import React, { createContext, useContext } from "react";
import type { Instance } from "ink";

// Exposes the ink render Instance (returned by `render()` in play.ts) to
// any descendant. PlayScreen uses this to call `instance.clear()` on
// stage transitions — a full-screen wipe + ink internal buffer reset —
// to force the next frame to render as a complete repaint instead of
// the incremental diff ink does by default. Without this, macOS
// Terminal.app under alt-screen mode misses parts of mixed
// cursor-move / line-clear sequences and the visible frame falls behind
// the model.

interface InkInstanceRef {
  current: Instance | null;
}

const InkInstanceContext = createContext<InkInstanceRef>({ current: null });

export function InkInstanceProvider({
  value,
  children,
}: {
  value: InkInstanceRef;
  children: React.ReactNode;
}) {
  return (
    <InkInstanceContext.Provider value={value}>
      {children}
    </InkInstanceContext.Provider>
  );
}

export function useInkInstance(): Instance | null {
  return useContext(InkInstanceContext).current;
}
