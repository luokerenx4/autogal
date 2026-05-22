import type { ChoicePresenter } from "./types";
import { listPresenter } from "./list";
import { gridPresenter } from "./grid";

export type { ChoicePresenter, ChoicePresenterProps } from "./types";

// Registry of available choice presenters, keyed by their `name`. The
// list presenter is also the fallback for unknown / missing view
// names — see `getChoicePresenter`.
const presenters: Record<string, ChoicePresenter> = {
  [listPresenter.name]: listPresenter,
  [gridPresenter.name]: gridPresenter,
};

export function getChoicePresenter(view: string | undefined): ChoicePresenter {
  if (view !== undefined) {
    const found = presenters[view];
    if (found) return found;
  }
  return listPresenter;
}
