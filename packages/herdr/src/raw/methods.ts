import type { SpecialKey } from "../domain.js";

export const specialKeyNames: Record<SpecialKey, string> = {
  enter: "enter",
  escape: "esc",
  ctrlC: "ctrl+c",
  arrowUp: "up",
  arrowDown: "down",
  arrowLeft: "left",
  arrowRight: "right",
  optionArrowUp: "alt+up",
};
