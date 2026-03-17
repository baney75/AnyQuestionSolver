/**
 * Free dictionary lookups via https://dictionaryapi.dev — no API key needed.
 */

export interface DictionaryMeaning {
  partOfSpeech: string;
  definitions: { definition: string; example?: string; synonyms?: string[] }[];
}

export interface DictionaryEntry {
  word: string;
  phonetic?: string;
  phonetics?: { text?: string; audio?: string }[];
  meanings: DictionaryMeaning[];
  sourceUrls?: string[];
}

const BASE = "https://api.dictionaryapi.dev/api/v2/entries/en";

export async function lookupWord(word: string): Promise<DictionaryEntry[]> {
  const res = await fetch(`${BASE}/${encodeURIComponent(word.trim())}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error(`No definition found for "${word}".`);
    throw new Error("Dictionary lookup failed. Please try again.");
  }
  return res.json();
}
