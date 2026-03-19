interface TextSubmitShortcutOptions {
  isComposing?: boolean;
  key: string;
  shiftKey: boolean;
}

export function shouldSubmitTextShortcut({
  isComposing = false,
  key,
  shiftKey,
}: TextSubmitShortcutOptions) {
  return !isComposing && key === "Enter" && !shiftKey;
}
