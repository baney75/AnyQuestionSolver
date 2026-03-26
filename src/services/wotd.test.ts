import { describe, expect, test } from "bun:test";

import { looksLikeFeedResponse } from "./rss";
import { parseMerriamWotdXml } from "./wotd";

describe("word of the day parsing", () => {
  test("parses Merriam-Webster XML into the app word model", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:merriam="https://www.merriam-webster.com/word-of-the-day" version="2.0">
  <channel>
    <item>
      <title><![CDATA[cadence]]></title>
      <link><![CDATA[https://www.merriam-webster.com/word-of-the-day/cadence-2026-03-24]]></link>
      <description><![CDATA[
        <p><strong>cadence</strong> &#149; \\KAY-dunss\\ &#149; <em>noun</em></p>
        <p><em>Cadence</em> is used to refer to various rhythmic or repeated motions.</p>
        <p>// Ivy relaxed at the beach, listening to the <em>cadence</em> of the surf.</p>
        <p><strong>Did you know?</strong><br /><p>A cadence is a rhythm or flow.</p></p>
      ]]></description>
      <enclosure url="https://audio.example/cadence.mp3" type="audio/mpeg" />
      <pubDate>Tue, 24 Mar 2026 01:00:01 -0400</pubDate>
    </item>
  </channel>
</rss>`;

    const parsed = parseMerriamWotdXml(xml);

    expect(parsed.word).toBe("cadence");
    expect(parsed.phonetic).toBe("KAY-dunss");
    expect(parsed.partOfSpeech).toBe("noun");
    expect(parsed.definition?.includes("rhythmic or repeated motions")).toBe(true);
    expect(parsed.example?.includes("Ivy relaxed")).toBe(true);
    expect(parsed.didYouKnow?.includes("rhythm or flow")).toBe(true);
    expect(parsed.audioUrl).toBe("https://audio.example/cadence.mp3");
  });

  test("rejects html challenge pages when sniffing RSS responses", () => {
    const html = "<!DOCTYPE html><html><head><title>Challenge</title></head><body>blocked</body></html>";
    const xml = "<?xml version=\"1.0\"?><rss><channel><item><title>cadence</title></item></channel></rss>";

    expect(looksLikeFeedResponse(html)).toBe(false);
    expect(looksLikeFeedResponse(xml)).toBe(true);
  });
});
