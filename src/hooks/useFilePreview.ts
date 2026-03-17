import { useState, useEffect } from "react";

/**
 * Creates a temporary object URL for a File so it can be shown in an <img>.
 * Automatically revokes the URL when the file changes to avoid memory leaks.
 */
export function useFilePreview(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return url;
}
