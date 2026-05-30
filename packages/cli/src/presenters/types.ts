// Choice presenter framework — pluggable renderers for choice stages.
//
// A presenter owns both the *visual* arrangement of options and the
// *key handling* for moving among them. The cursor itself lives in
// the central screen-model; presenters compute target indices and
// emit existing UiAction / engine Input results through KeyResult.
//
// Two built-ins (list, grid) ship by default. Scripts opt into a
// presenter via `? prompt {view: name}`; unknown names fall back to
// list. The engine never knows what a presenter is — it just carries
// the view string through.

import type { ReactNode } from "react";
import type { RenderedChoice } from "@rpg-harness/engine";
import type { KeyEvent, KeyResult } from "../stage-input";

export interface ChoicePresenterProps {
  prompt?: string;
  options: RenderedChoice[];
  cursor: number;
}

export interface ChoicePresenter {
  // Stable name — used both as the registry key and as the value
  // authors write in `{view: name}`. Kept on the presenter so the
  // registry can be assembled by enumerating presenter modules.
  name: string;
  // What goes on the footer line when this presenter is active. Lets
  // each presenter advertise its own key conventions (e.g. grid adds
  // ←→) without the central footer needing to know view names.
  footerHint: string;
  render(props: ChoicePresenterProps): ReactNode;
  dispatchKey(
    props: ChoicePresenterProps,
    input: string,
    key: KeyEvent,
  ): KeyResult;
}
