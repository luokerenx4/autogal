import React from "react";
import { Box } from "ink";
import type { RenderedChoice } from "@autogal/engine";
import { Choices } from "../Choices";

interface Props {
  prompt?: string;
  options: RenderedChoice[];
}

export function ChoiceStage({ prompt, options }: Props) {
  return (
    <Box
      flexGrow={1}
      flexDirection="column"
      justifyContent="center"
      paddingX={4}
    >
      <Choices {...(prompt !== undefined ? { prompt } : {})} options={options} />
    </Box>
  );
}
