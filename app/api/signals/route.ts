import { NEWS_ITEMS, type NewsItem, type SignalSymbol } from "../../news-data";

const NEWS_QUERIES: Record<SignalSymbol, string> = {
  META: "Meta Platforms META site:investor.atmeta.com OR site:sec.gov",
  NVDA: "NVIDIA NVDA site:investor.nvidia.com",
  AAPL: "Apple AAPL site:apple.com/newsroom",
  TSLA: "Tesla TSLA site:ir.tesla.com OR site:sec.gov",
  BTC: "Bitcoin BTC site:bitcoinops.org OR site:bitcoincore.org",
  ETH: "Ethereum ETH site:blog.ethereum.org",
  BNB: "BNB Chain BNB site:bnbchain.org/en/blog",
  INJ: "Injective INJ site:injective.com/blog",
};

function decodeXml(value: string) {
  return value
    .replaceAll("<![CDATA[", "")
    .replaceAll("]]>", "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function readTag(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeXml(match[1].trim()) : "";
}

function getLatestHeadline(xml: string) {
  const item = xml.match(/<item>([\s\S]*?)<\/item>/i)?.[1];
  if (!item) return null;

  const title = readTag(item, "title");
  const link = readTag(item, "link");
  const source = readTag(item, "source");
  const publishedAt = readTag(item, "pubDate");

  if (!title || !link) return null;
  return { title, link, source, publishedAt };
}

async function refreshSignal(item: NewsItem): Promise<NewsItem> {
  try {
    const query = NEWS_QUERIES[item.marketQuery];
    const url = new URL("https://news.google.com/rss/search");
    url.searchParams.set("q", `${query} when:30d`);
    url.searchParams.set("hl", "en-US");
    url.searchParams.set("gl", "US");
    url.searchParams.set("ceid", "US:en");

    const response = await fetch(url, {
      headers: { "User-Agent": "AlphaSwipe/1.0 news reader" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return item;

    const headline = getLatestHeadline(await response.text());
    if (!headline) return item;

    const publishedDate = new Date(headline.publishedAt);
    return {
      ...item,
      id: `${item.marketQuery.toLowerCase()}-${publishedDate.getTime() || item.id}`,
      title: headline.title.replace(/\s+-\s+[^-]+$/, ""),
      hook: `Latest ${item.marketQuery} headline, framed against the fundamental and market context below.`,
      summary:
        `This live headline directly references ${item.marketQuery}. Open the original source for the full report; AlphaSwipe keeps the thesis, risks and earnings context separate from the headline so it does not invent facts that were not published.`,
      source: headline.source || item.source,
      published: Number.isNaN(publishedDate.getTime())
        ? item.published
        : publishedDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          }),
      sourceUrl: headline.link,
    };
  } catch {
    return item;
  }
}

export async function GET() {
  const signals = await Promise.all(NEWS_ITEMS.map(refreshSignal));

  return Response.json(
    {
      symbols: signals.map((item) => item.marketQuery),
      signals,
      refreshedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=900",
      },
    },
  );
}
