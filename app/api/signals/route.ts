import newsCache from "../../../data/news-cache.json";
import {
  NEWS_ITEMS,
  type NewsItem,
  type SignalSymbol,
} from "../../news-data";

type CachedArticle = {
  id: string;
  category: "stock" | "crypto";
  symbol: string;
  publishedDate: string;
  publisher: string;
  title: string;
  titleZh: string;
  image: string;
  site: string;
  text: string;
  textZh: string;
  url: string;
};

const SYMBOL_MAP: Record<string, SignalSymbol> = {
  META: "META",
  NVDA: "NVDA",
  AAPL: "AAPL",
  TSLA: "TSLA",
  BTCUSD: "BTC",
  ETHUSD: "ETH",
  BNBUSD: "BNB",
  INJUSD: "INJ",
};

function formatPublishedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function articleToSignal(article: CachedArticle): NewsItem | null {
  const marketQuery = SYMBOL_MAP[article.symbol];
  const base = NEWS_ITEMS.find((item) => item.marketQuery === marketQuery);
  if (!base) return null;

  const publisher = article.publisher || article.site || "Financial Modeling Prep";
  const translatedText = article.textZh || article.text;

  return {
    ...base,
    id: article.id,
    category: article.category,
    title: article.titleZh || article.title,
    hook: translatedText || "打开卡片查看这条新闻的原始来源。",
    summary:
      translatedText ||
      "FMP 提供了标题与原文链接，但没有提供可翻译的新闻摘要。",
    source: publisher,
    published: formatPublishedDate(article.publishedDate),
    sourceUrl: article.url,
    tags: [
      marketQuery,
      article.category === "stock" ? "股票新闻" : "加密新闻",
      publisher,
    ].slice(0, 3),
    impact: "Medium",
    confidence: 72,
    horizon: "新闻驱动",
    bullCase: "若新闻中的进展被后续数据确认，可能改善市场对该标的的预期。",
    bearCase: "单条新闻未必能转化为持续的价格或基本面影响，需要更多证据确认。",
    catalyst: "后续公告、成交量与价格反应",
    risk: "标题与摘要信息有限，交易前需核对原文",
    earnings: undefined,
  };
}

export async function GET() {
  const cachedArticles = (newsCache.articles as CachedArticle[]) ?? [];
  const signals = cachedArticles
    .map(articleToSignal)
    .filter((item): item is NewsItem => Boolean(item));
  const usingLocalCache = signals.length > 0;

  return Response.json(
    {
      symbols: usingLocalCache
        ? [...new Set(signals.map((item) => item.marketQuery))]
        : NEWS_ITEMS.map((item) => item.marketQuery),
      signals: usingLocalCache ? signals : NEWS_ITEMS,
      source: usingLocalCache ? "financialmodelingprep" : "bundled-fallback",
      refreshedAt: usingLocalCache ? newsCache.syncedAt : null,
      windowStart: usingLocalCache ? newsCache.windowStart : null,
      translation: usingLocalCache ? newsCache.translation : null,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  );
}
