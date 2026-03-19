import { describe, expect, test } from "bun:test";

import { shouldSubmitTextShortcut } from "./input";

describe("shouldSubmitTextShortcut", () => {
  test("submits on plain Enter", () => {
    expect(
      shouldSubmitTextShortcut({
        key: "Enter",
        shiftKey: false,
      }),
    ).toBe(true);
  });

  test("does not submit on Shift+Enter", () => {
    expect(
      shouldSubmitTextShortcut({
        key: "Enter",
        shiftKey: true,
      }),
    ).toBe(false);
  });

  test("does not submit while IME composition is active", () => {
    expect(
      shouldSubmitTextShortcut({
        isComposing: true,
        key: "Enter",
        shiftKey: false,
      }),
    ).toBe(false);
  });

  test("ignores non-Enter keys", () => {
    expect(
      shouldSubmitTextShortcut({
        key: "Escape",
        shiftKey: false,
      }),
    ).toBe(false);
  });
});
