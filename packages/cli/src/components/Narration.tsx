import React from "react";
import { Text } from "ink";

interface NarrationProps {
  text: string;
}

export function Narration({ text }: NarrationProps) {
  return <Text dimColor>{text}</Text>;
}
