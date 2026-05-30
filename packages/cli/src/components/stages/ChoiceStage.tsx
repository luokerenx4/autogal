import React from "react";
import { Box } from "ink";
import type { RenderedChoice } from "@rpg-harness/engine";
import { getChoicePresenter } from "../../presenters";

interface Props {
  prompt?: string;
  options: RenderedChoice[];
  cursor: number;
  view?: string;
}

export function ChoiceStage({ prompt, options, cursor, view }: Props) {
  const presenter = getChoicePresenter(view);
  return (
    <Box
      flexGrow={1}
      flexDirection="column"
      justifyContent="center"
      paddingX={4}
    >
      {presenter.render({
        ...(prompt !== undefined ? { prompt } : {}),
        options,
        cursor,
      })}
    </Box>
  );
}
