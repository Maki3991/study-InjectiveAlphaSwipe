import newsCache from "../../../data/news-cache.json";
import {
  NEWS_ITEMS,
  type NewsItem,
  type SignalResearch,
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
  analysis?: SignalResearch;
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

function fallbackAnalysis(
  article: CachedArticle,
  marketQuery: SignalSymbol,
): SignalResearch {
  return {
    signal: {
      direction: "neutral",
      degree: "weak",
      label: "中性观察",
      confidence: 55,
      description:
        article.textZh || article.text || "当前新闻信息有限，暂不足以形成方向性判断。",
    },
    macro: "当前缓存中没有可核验的宏观快照。",
    industry: {
      name: article.category === "stock" ? "公司所属行业" : "数字资产行业",
      summary: "当前缓存中没有可核验的行业分析。",
    },
    fundamentals: {
      overview: `${marketQuery} 的基本面分析尚未生成。`,
      recentMarket: "当前缓存中没有最新行情快照。",
      recentEarnings:
        article.category === "stock"
          ? "当前缓存中没有最近财报快照。"
          : "加密资产没有公司财报，应关注网络活动、费用、供给和生态采用。",
      metrics: [],
    },
    risks: ["单条新闻可能不足以形成持续交易信号，交易前应核对原文与市场数据。"],
    dataAsOf: formatPublishedDate(article.publishedDate),
  };
}

function articleToSignal(article: CachedArticle): NewsItem | null {
  const marketQuery = SYMBOL_MAP[article.symbol];
  const base = NEWS_ITEMS.find((item) => item.marketQuery === marketQuery);
  if (!base) return null;

  const publisher = article.publisher || article.site || "Financial Modeling Prep";
  const translatedText = article.textZh || article.text;
  const analysis = article.analysis ?? fallbackAnalysis(article, marketQuery);
  const highImpact =
    analysis.signal.direction !== "neutral" &&
    analysis.signal.degree === "strong";

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
    impact: highImpact ? "High" : "Medium",
    confidence: analysis.signal.confidence,
    horizon: "新闻驱动",
    bullCase: "若新闻中的进展被后续数据确认，可能改善市场对该标的的预期。",
    bearCase: "单条新闻未必能转化为持续的价格或基本面影响，需要更多证据确认。",
    catalyst: "后续公告、成交量与价格反应",
    risk: "标题与摘要信息有限，交易前需核对原文",
    earnings: undefined,
    analysis,
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
      schemaVersion: 2,
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
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
