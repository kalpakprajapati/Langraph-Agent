// first node after START node
// user input is correct

import type { TaskNode } from "../types";

export const ValidateNode: TaskNode = async (state) => {
  const raw = state.input ?? "";
  const trimInput = raw.trim();

  // lot of extra checks

  if (trimInput.length === 0) {
    return {
      status: "cancelled",
      message: "Input is empty. Please provide a proper task to start",
    };
  }

  const MAX = 300;
  const safeInput =
    trimInput.length > MAX ? trimInput.slice(0, MAX) + "..." : trimInput;

  return {
    input: safeInput,
  };
};
