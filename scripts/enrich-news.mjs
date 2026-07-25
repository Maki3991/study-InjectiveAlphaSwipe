import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const NEWS_CACHE_PATH = process.env.NEWS_CACHE_PATH
  ? resolve(process.env.NEWS_CACHE_PATH)
  : resolve(PROJECT_ROOT, "data/news-cache.json");
const ANALYSIS_CACHE_PATH = process.env.NEWS_ANALYSIS_CACHE_PATH
  ? resolve(process.env.NEWS_ANALYSIS_CACHE_PATH)
  : resolve(PROJECT_ROOT, "data/.news-analysis-cache.json");
const LOCAL_ENV_FILES = [".env.local", ".dev.vars"].map((name) =>
  resolve(PROJECT_ROOT, name),
);

const FMP_API_BASE =
  process.env.FMP_API_BASE || "https://financialmodelingprep.com/stable";
const DEFAULT_LLM_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
const DEFAULT_LLM_MODEL = "glm-4.5-air";
const ANALYSIS_BATCH_SIZE = 4;
const ANALYSIS_CONCURRENCY = 2;

const CRYPTO_INDUSTRIES = {
  BTCUSD: "数字资产 · 价值储存与宏观流动性",
  ETHUSD: "智能合约平台 · L1 与链上应用",
  BNBUSD: "交易平台生态 · L1 与应用基础设施",
  INJUSD: "去中心化金融 · 交易基础设施与 L1",
};

function parseEnvFile(content) {
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

async function loadLocalEnv() {
  for (const file of LOCAL_ENV_FILES) {
    try {
      const values = parseEnvFile(await readFile(file, "utf8"));
      for (const [key, value] of Object.entries(values)) {
        if (!process.env[key] && value) process.env[key] = value;
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonAtomically(path, value) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

function cleanText(value, maxLength = 4_000) {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function percentageChange(current, previous) {
  const currentValue = finiteNumber(current);
  const previousValue = finiteNumber(previous);
  if (currentValue === null || previousValue === null || previousValue === 0) {
    return null;
  }
  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
}

function toneForChange(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) {
    return "neutral";
  }
  return value > 0 ? "positive" : "negative";
}

function formatPercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatPrice(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const digits = value >= 100 ? 2 : value >= 1 ? 3 : 5;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  }).format(value);
}

function formatCompactUsd(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

async function fetchFmp(path, params, apiKey, attempt = 0) {
  const url = new URL(`${FMP_API_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("apikey", apiKey);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(25_000),
    });
    const text = await response.text();
    if (!response.ok) {
      if (
        attempt < 2 &&
        (response.status === 429 || response.status >= 500)
      ) {
        await new Promise((resolveDelay) =>
          setTimeout(resolveDelay, 500 * 2 ** attempt),
        );
        return fetchFmp(path, params, apiKey, attempt + 1);
      }
      throw new Error(
        `FMP ${path} failed (${response.status}): ${text.slice(0, 220)}`,
      );
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`FMP ${path} did not return valid JSON`);
    }
  } catch (error) {
    if (attempt < 2) {
      await new Promise((resolveDelay) =>
        setTimeout(resolveDelay, 500 * 2 ** attempt),
      );
      return fetchFmp(path, params, apiKey, attempt + 1);
    }
    throw error;
  }
}

async function fetchMacroSnapshot(apiKey, now) {
  const from = new Date(now.getTime() - 7 * 86_400_000);
  const to = new Date(now.getTime() + 7 * 86_400_000);
  const proxySymbols = ["SPY", "QQQ", "TLT", "GLD"];
  const [proxyRows, treasuryRows, calendarRows] = await Promise.all([
    Promise.all(
      proxySymbols.map((symbol) =>
        fetchFmp("quote", { symbol }, apiKey).then((rows) => rows?.[0] ?? null),
      ),
    ),
    fetchFmp(
      "treasury-rates",
      { from: isoDate(from), to: isoDate(now) },
      apiKey,
    ),
    fetchFmp(
      "economic-calendar",
      { from: isoDate(from), to: isoDate(to) },
      apiKey,
    ),
  ]);

  const proxies = Object.fromEntries(
    proxyRows
      .filter(Boolean)
      .map((row) => [
        row.symbol,
        {
          price: finiteNumber(row.price),
          dayChangePercentage: finiteNumber(row.changePercentage),
          priceAvg50: finiteNumber(row.priceAvg50),
          priceAvg200: finiteNumber(row.priceAvg200),
        },
      ]),
  );
  const treasury = Array.isArray(treasuryRows) ? treasuryRows[0] : null;
  const events = (Array.isArray(calendarRows) ? calendarRows : [])
    .filter(
      (event) =>
        (event.country === "US" || event.currency === "USD") &&
        event.impact === "High",
    )
    .sort(
      (left, right) =>
        Math.abs(new Date(left.date).getTime() - now.getTime()) -
        Math.abs(new Date(right.date).getTime() - now.getTime()),
    )
    .slice(0, 8)
    .map((event) => ({
      date: event.date,
      event: cleanText(event.event, 160),
      previous: event.previous,
      estimate: event.estimate,
      actual: event.actual,
      unit: event.unit,
    }));

  return {
    asOf: now.toISOString(),
    proxies,
    treasury: treasury
      ? {
          date: treasury.date,
          year2: finiteNumber(treasury.year2),
          year10: finiteNumber(treasury.year10),
          year30: finiteNumber(treasury.year30),
        }
      : null,
    nearbyHighImpactUsEvents: events,
  };
}

function findYearAgoQuarter(statements, latest) {
  return statements.find(
    (statement) =>
      statement !== latest &&
      statement.period === latest?.period &&
      Number(statement.fiscalYear) === Number(latest?.fiscalYear) - 1,
  );
}

function buildDisplayMetrics(category, market, earnings, ratios) {
  const metrics = [
    {
      label: "现价",
      value: formatPrice(market.price),
      change: `日内 ${formatPercent(market.dayChangePercentage)}`,
      tone: toneForChange(market.dayChangePercentage),
    },
    {
      label: "近 7 日",
      value: formatPercent(market.weekChangePercentage),
      change: `区间 ${formatPrice(market.weekLow)}–${formatPrice(market.weekHigh)}`,
      tone: toneForChange(market.weekChangePercentage),
    },
    {
      label: "市值",
      value: formatCompactUsd(market.marketCap),
      change: "FMP quote",
      tone: "neutral",
    },
    {
      label: category === "stock" ? "当日成交量" : "24h 成交量",
      value: formatNumber(market.volume),
      change: "FMP quote",
      tone: "neutral",
    },
  ];

  if (category === "stock" && earnings?.latest) {
    metrics.push(
      {
        label: "季度营收",
        value: formatCompactUsd(earnings.latest.revenue),
        change: `同比 ${formatPercent(earnings.revenueYoY)}`,
        tone: toneForChange(earnings.revenueYoY),
      },
      {
        label: "季度净利润",
        value: formatCompactUsd(earnings.latest.netIncome),
        change: `同比 ${formatPercent(earnings.netIncomeYoY)}`,
        tone: toneForChange(earnings.netIncomeYoY),
      },
      {
        label: "稀释 EPS",
        value:
          typeof earnings.latest.epsDiluted === "number"
            ? `$${earnings.latest.epsDiluted.toFixed(2)}`
            : "—",
        change: `${earnings.latest.fiscalYear} ${earnings.latest.period}`,
        tone: "neutral",
      },
      {
        label: "市盈率",
        value:
          typeof ratios?.priceToEarningsRatio === "number"
            ? `${ratios.priceToEarningsRatio.toFixed(1)}×`
            : "—",
        change: "最近年度口径",
        tone: "neutral",
      },
    );
  } else {
    metrics.push(
      {
        label: "50 日均价",
        value: formatPrice(market.priceAvg50),
        change: `偏离 ${formatPercent(percentageChange(market.price, market.priceAvg50))}`,
        tone: toneForChange(percentageChange(market.price, market.priceAvg50)),
      },
      {
        label: "200 日均价",
        value: formatPrice(market.priceAvg200),
        change: `偏离 ${formatPercent(percentageChange(market.price, market.priceAvg200))}`,
        tone: toneForChange(percentageChange(market.price, market.priceAvg200)),
      },
      {
        label: "52 周高点",
        value: formatPrice(market.yearHigh),
        change: `距高点 ${formatPercent(percentageChange(market.price, market.yearHigh))}`,
        tone: "neutral",
      },
      {
        label: "52 周低点",
        value: formatPrice(market.yearLow),
        change: `距低点 ${formatPercent(percentageChange(market.price, market.yearLow))}`,
        tone: "neutral",
      },
    );
  }

  return metrics;
}

async function fetchAssetSnapshot(symbol, category, apiKey, now) {
  const from = new Date(now.getTime() - 10 * 86_400_000);
  const commonRequests = [
    fetchFmp("quote", { symbol }, apiKey),
    fetchFmp(
      "historical-price-eod/full",
      { symbol, from: isoDate(from), to: isoDate(now) },
      apiKey,
    ),
  ];
  const stockRequests =
    category === "stock"
      ? [
          fetchFmp("profile", { symbol }, apiKey),
          fetchFmp(
            "income-statement",
            { symbol, period: "quarter", limit: 6 },
            apiKey,
          ),
          fetchFmp("ratios", { symbol, period: "annual", limit: 1 }, apiKey),
        ]
      : [Promise.resolve([]), Promise.resolve([]), Promise.resolve([])];

  const [quoteRows, historyRows, profileRows, statementRows, ratioRows] =
    await Promise.all([...commonRequests, ...stockRequests]);
  const quote = quoteRows?.[0];
  if (!quote) throw new Error(`FMP returned no quote for ${symbol}`);

  const history = (Array.isArray(historyRows) ? historyRows : [])
    .filter((row) => finiteNumber(row.close) !== null)
    .sort((left, right) => new Date(left.date) - new Date(right.date));
  const oldest = history[0];
  const latest = history.at(-1);
  const weekChangePercentage = percentageChange(latest?.close, oldest?.close);
  const weekHigh = history.length
    ? Math.max(...history.map((row) => finiteNumber(row.high) ?? -Infinity))
    : null;
  const weekLow = history.length
    ? Math.min(...history.map((row) => finiteNumber(row.low) ?? Infinity))
    : null;

  const statements = Array.isArray(statementRows) ? statementRows : [];
  const latestStatement = statements[0] ?? null;
  const yearAgoStatement = latestStatement
    ? findYearAgoQuarter(statements, latestStatement)
    : null;
  const earnings = latestStatement
    ? {
        latest: {
          date: latestStatement.date,
          fiscalYear: latestStatement.fiscalYear,
          period: latestStatement.period,
          revenue: finiteNumber(latestStatement.revenue),
          grossProfit: finiteNumber(latestStatement.grossProfit),
          operatingIncome: finiteNumber(latestStatement.operatingIncome),
          netIncome: finiteNumber(latestStatement.netIncome),
          epsDiluted: finiteNumber(latestStatement.epsDiluted),
        },
        revenueYoY: percentageChange(
          latestStatement.revenue,
          yearAgoStatement?.revenue,
        ),
        netIncomeYoY: percentageChange(
          latestStatement.netIncome,
          yearAgoStatement?.netIncome,
        ),
        operatingIncomeYoY: percentageChange(
          latestStatement.operatingIncome,
          yearAgoStatement?.operatingIncome,
        ),
      }
    : null;
  const ratios = ratioRows?.[0]
    ? {
        date: ratioRows[0].date,
        priceToEarningsRatio: finiteNumber(ratioRows[0].priceToEarningsRatio),
        priceToBookRatio: finiteNumber(ratioRows[0].priceToBookRatio),
        debtToEquityRatio: finiteNumber(ratioRows[0].debtToEquityRatio),
        returnOnEquity: finiteNumber(ratioRows[0].returnOnEquity),
      }
    : null;
  const profile = profileRows?.[0]
    ? {
        sector: cleanText(profileRows[0].sector, 120),
        industry: cleanText(profileRows[0].industry, 160),
        description: cleanText(profileRows[0].description, 1_200),
      }
    : null;
  const timestamp = finiteNumber(quote.timestamp);
  const market = {
    asOf: timestamp
      ? new Date(timestamp * 1_000).toISOString()
      : now.toISOString(),
    price: finiteNumber(quote.price),
    dayChangePercentage: finiteNumber(quote.changePercentage),
    weekChangePercentage,
    weekHigh: Number.isFinite(weekHigh) ? weekHigh : null,
    weekLow: Number.isFinite(weekLow) ? weekLow : null,
    volume: finiteNumber(quote.volume),
    marketCap: finiteNumber(quote.marketCap),
    dayLow: finiteNumber(quote.dayLow),
    dayHigh: finiteNumber(quote.dayHigh),
    yearLow: finiteNumber(quote.yearLow),
    yearHigh: finiteNumber(quote.yearHigh),
    priceAvg50: finiteNumber(quote.priceAvg50),
    priceAvg200: finiteNumber(quote.priceAvg200),
  };

  return {
    symbol,
    category,
    industryName:
      profile?.industry ||
      CRYPTO_INDUSTRIES[symbol] ||
      (category === "stock" ? "上市公司" : "数字资产"),
    profile,
    market,
    earnings,
    ratios,
    displayMetrics: buildDisplayMetrics(category, market, earnings, ratios),
  };
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function extractJsonObject(value) {
  const trimmed = cleanText(value, 300_000);
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  return JSON.parse(fenced || trimmed);
}

function normalizeDirection(value) {
  return value === "long" || value === "short" || value === "neutral"
    ? value
    : "neutral";
}

function normalizeDegree(value, direction) {
  if (direction === "neutral") return value === "moderate" ? "moderate" : "weak";
  return value === "strong" || value === "moderate" || value === "weak"
    ? value
    : "weak";
}

function signalLabel(direction, degree) {
  if (direction === "long") {
    return degree === "strong"
      ? "强烈看多"
      : degree === "moderate"
        ? "偏多"
        : "轻微看多";
  }
  if (direction === "short") {
    return degree === "strong"
      ? "强烈看空"
      : degree === "moderate"
        ? "偏空"
        : "轻微看空";
  }
  return degree === "moderate" ? "中性关注" : "中性观察";
}

function normalizeAnalysis(raw, article, snapshot) {
  if (!raw || typeof raw !== "object") return null;
  const direction = normalizeDirection(raw.signal?.direction);
  const degree = normalizeDegree(raw.signal?.degree, direction);
  const confidence = Math.min(
    95,
    Math.max(45, Math.round(finiteNumber(raw.signal?.confidence) ?? 55)),
  );
  const description = cleanText(raw.signal?.description, 700);
  const macro = cleanText(raw.macro, 1_000);
  const industrySummary = cleanText(raw.industry?.summary, 1_000);
  const overview = cleanText(raw.fundamentals?.overview, 900);
  const recentMarket = cleanText(raw.fundamentals?.recentMarket, 900);
  const recentEarnings = cleanText(raw.fundamentals?.recentEarnings, 900);
  const risks = Array.isArray(raw.risks)
    ? raw.risks.map((risk) => cleanText(risk, 500)).filter(Boolean).slice(0, 5)
    : [];

  if (
    cleanText(raw.id, 120) !== article.id ||
    !description ||
    !macro ||
    !industrySummary ||
    !overview ||
    !recentMarket ||
    !recentEarnings ||
    risks.length < 2
  ) {
    return null;
  }

  return {
    signal: {
      direction,
      degree,
      label: signalLabel(direction, degree),
      confidence,
      description,
    },
    macro,
    industry: {
      name: snapshot.industryName,
      summary: industrySummary,
    },
    fundamentals: {
      overview,
      recentMarket,
      recentEarnings,
      metrics: snapshot.displayMetrics,
    },
    risks,
    dataAsOf: snapshot.market.asOf,
  };
}

function unavailableAnalysis(article, snapshot, macroSnapshot, reason) {
  const spy = macroSnapshot.proxies?.SPY;
  const qqq = macroSnapshot.proxies?.QQQ;
  const treasury = macroSnapshot.treasury;
  const latestEarnings = snapshot.earnings?.latest;
  const macroParts = [
    typeof spy?.dayChangePercentage === "number"
      ? `SPY 日内 ${formatPercent(spy.dayChangePercentage)}`
      : "",
    typeof qqq?.dayChangePercentage === "number"
      ? `QQQ 日内 ${formatPercent(qqq.dayChangePercentage)}`
      : "",
    typeof treasury?.year10 === "number"
      ? `美国 10 年期国债收益率 ${treasury.year10.toFixed(2)}%`
      : "",
  ].filter(Boolean);

  return {
    signal: {
      direction: "neutral",
      degree: "weak",
      label: "中性观察",
      confidence: 45,
      description: `${reason}，因此不对该新闻作方向性推断，仅保留可核验市场数据。`,
    },
    macro:
      macroParts.length > 0
        ? `${macroParts.join("，")}。在缺少完整上下文时，不把宏观快照直接解释为单一交易方向。`
        : "当前宏观快照信息有限，不作方向性推断。",
    industry: {
      name: snapshot.industryName,
      summary:
        "行业影响需要结合原始新闻和后续数据确认；当前分析不扩展模型未能完成处理的新闻内容。",
    },
    fundamentals: {
      overview:
        "基本面部分仅展示 FMP 的可核验行情与财务数据，不根据未完成模型分析的新闻内容补充结论。",
      recentMarket: `${snapshot.symbol} 现价 ${formatPrice(snapshot.market.price)}，日内 ${formatPercent(snapshot.market.dayChangePercentage)}，近 7 日 ${formatPercent(snapshot.market.weekChangePercentage)}。`,
      recentEarnings:
        snapshot.category === "stock" && latestEarnings
          ? `最近财报为 ${latestEarnings.fiscalYear} ${latestEarnings.period}：营收 ${formatCompactUsd(latestEarnings.revenue)}，净利润 ${formatCompactUsd(latestEarnings.netIncome)}，稀释 EPS ${typeof latestEarnings.epsDiluted === "number" ? `$${latestEarnings.epsDiluted.toFixed(2)}` : "—"}。`
          : "加密资产没有公司财报；应改为跟踪网络活动、费用、供给变化与生态采用，但本次输入没有提供这些链上数据。",
      metrics: snapshot.displayMetrics,
    },
    risks: [
      "新闻内容未经过完整模型分析，信号方向保持中性。",
      "行情快照可能在市场快速波动时滞后。",
      "单条新闻不足以替代仓位、流动性与止损评估。",
    ],
    dataAsOf: snapshot.market.asOf,
  };
}

async function analyzeBatch(
  articles,
  snapshot,
  macroSnapshot,
  config,
  attempt = 0,
) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "system",
          content: [
            "你是审慎、数据约束严格的中文金融研究员。",
            "只能使用用户提供的新闻、宏观快照、行情、公司资料、财报和估值数据；不得编造实时数据、链上数据、政策或事件。",
            "新闻信号评价衡量该新闻对当前标的的边际影响，不等于无条件交易建议。",
            "如果证据混合或新闻与行情方向冲突，应给出 neutral。宏观、行业、行情、财报和风险必须分别分析。",
            "加密资产没有公司财报，recentEarnings 必须明确写不适用，并说明应跟踪的可替代基本面。",
            "返回合法 JSON，不要输出 Markdown。",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            task:
              '为每条新闻返回 {"analyses":[{"id":"原 id","signal":{"direction":"long|short|neutral","degree":"strong|moderate|weak","confidence":45到95整数,"description":"信号解释"},"macro":"当前宏观分析","industry":{"summary":"行业分析"},"fundamentals":{"overview":"基本面判断","recentMarket":"结合输入数字的最近行情分析","recentEarnings":"最近财报分析或加密资产不适用说明"},"risks":["风险1","风险2","风险3"]}]}。每段简洁、具体、有数据依据。',
            macroSnapshot,
            assetSnapshot: snapshot,
            articles: articles.map((article) => ({
              id: article.id,
              publishedDate: article.publishedDate,
              title: article.titleZh || article.title,
              summary: article.textZh || article.text,
              publisher: article.publisher,
            })),
          }),
        },
      ],
      thinking: { type: "enabled" },
      response_format: { type: "json_object" },
      temperature: 0.15,
      max_tokens: Math.min(8_192, Math.max(2_200, articles.length * 1_250)),
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const filtered =
      response.status === 400 &&
      (payload?.error?.code === "1301" || Array.isArray(payload?.contentFilter));
    if (filtered) {
      if (articles.length > 1) {
        const byId = new Map();
        for (const group of chunks(articles, Math.ceil(articles.length / 2))) {
          const analyzed = await analyzeBatch(
            group,
            snapshot,
            macroSnapshot,
            config,
            attempt + 1,
          );
          for (const [id, analysis] of analyzed) byId.set(id, analysis);
        }
        return byId;
      }
      return new Map([
        [
          articles[0].id,
          unavailableAnalysis(
            articles[0],
            snapshot,
            macroSnapshot,
            "该新闻未通过自动研究模型的内容安全检查",
          ),
        ],
      ]);
    }
    throw new Error(
      `GLM analysis failed (${response.status}): ${JSON.stringify(payload).slice(0, 300)}`,
    );
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    if (articles.length > 1) {
      const byId = new Map();
      for (const group of chunks(articles, Math.ceil(articles.length / 2))) {
        const analyzed = await analyzeBatch(
          group,
          snapshot,
          macroSnapshot,
          config,
          attempt + 1,
        );
        for (const [id, analysis] of analyzed) byId.set(id, analysis);
      }
      return byId;
    }
    return new Map([
      [
        articles[0].id,
        unavailableAnalysis(
          articles[0],
          snapshot,
          macroSnapshot,
          "自动研究模型没有返回可用内容",
        ),
      ],
    ]);
  }

  const parsed = extractJsonObject(content);
  const rawAnalyses = Array.isArray(parsed?.analyses) ? parsed.analyses : [];
  const byId = new Map(
    rawAnalyses
      .map((raw) => {
        const article = articles.find(
          (candidate) => candidate.id === cleanText(raw?.id, 120),
        );
        if (!article) return null;
        const analysis = normalizeAnalysis(raw, article, snapshot);
        return analysis ? [article.id, analysis] : null;
      })
      .filter(Boolean),
  );
  const missing = articles.filter((article) => !byId.has(article.id));

  if (missing.length) {
    if (attempt >= 3) {
      throw new Error(`GLM analysis omitted article ${missing[0].id}`);
    }
    const retryGroups =
      missing.length === articles.length && missing.length > 1
        ? chunks(missing, Math.ceil(missing.length / 2))
        : [missing];
    for (const retryGroup of retryGroups) {
      const retried = await analyzeBatch(
        retryGroup,
        snapshot,
        macroSnapshot,
        config,
        attempt + 1,
      );
      for (const [id, analysis] of retried) byId.set(id, analysis);
    }
  }

  return byId;
}

async function enrichNews() {
  await loadLocalEnv();
  const newsCache = await readJson(NEWS_CACHE_PATH, null);
  if (!newsCache?.articles?.length) {
    throw new Error("News cache is empty; run the news sync first");
  }

  const ifMissing = process.argv.includes("--if-missing");
  const refresh = process.argv.includes("--refresh");
  if (
    ifMissing &&
    !refresh &&
    newsCache.articles.every((article) => article.analysis)
  ) {
    console.log(
      `News analysis ready: ${newsCache.articles.length} cached articles`,
    );
    return;
  }

  const fmpApiKey = cleanText(process.env.FMP_API_KEY, 500);
  const llmApiKey = cleanText(
    process.env.LLM_API_KEY || process.env.ZHIPU_API_KEY,
    1_000,
  );
  if (!fmpApiKey) throw new Error("FMP_API_KEY is required to enrich news");
  if (!llmApiKey) {
    throw new Error("LLM_API_KEY or ZHIPU_API_KEY is required to analyze news");
  }

  const llmConfig = {
    apiKey: llmApiKey,
    baseUrl:
      cleanText(process.env.LLM_BASE_URL, 1_000).replace(/\/+$/, "") ||
      DEFAULT_LLM_BASE_URL,
    model: cleanText(process.env.LLM_MODEL, 200) || DEFAULT_LLM_MODEL,
  };
  const now = new Date();
  const categoriesBySymbol = new Map(
    newsCache.articles.map((article) => [article.symbol, article.category]),
  );
  const symbols = [...categoriesBySymbol.keys()];
  const [macroSnapshot, snapshotEntries] = await Promise.all([
    fetchMacroSnapshot(fmpApiKey, now),
    Promise.all(
      symbols.map(async (symbol) => [
        symbol,
        await fetchAssetSnapshot(
          symbol,
          categoriesBySymbol.get(symbol),
          fmpApiKey,
          now,
        ),
      ]),
    ),
  ]);
  const assetSnapshots = Object.fromEntries(snapshotEntries);
  console.log(
    `FMP fundamentals ready for ${symbols.length} symbols; analyzing ${newsCache.articles.length} articles`,
  );

  const saved = await readJson(ANALYSIS_CACHE_PATH, {
    version: 1,
    analyses: {},
  });
  const analysisById = new Map();
  for (const article of newsCache.articles) {
    const cached = saved.analyses?.[article.id];
    const snapshot = assetSnapshots[article.symbol];
    if (
      !refresh &&
      cached?.originalTitle === article.title &&
      cached?.snapshotAsOf === snapshot?.market?.asOf &&
      cached?.analysis
    ) {
      analysisById.set(article.id, cached.analysis);
    }
  }

  const tasks = [];
  for (const symbol of symbols) {
    const pending = newsCache.articles.filter(
      (article) =>
        article.symbol === symbol && !analysisById.has(article.id),
    );
    for (const batch of chunks(pending, ANALYSIS_BATCH_SIZE)) {
      tasks.push({ symbol, articles: batch });
    }
  }

  let nextTaskIndex = 0;
  let persistChain = Promise.resolve();
  const persistProgress = () => {
    const analyses = Object.fromEntries(
      newsCache.articles
        .filter((article) => analysisById.has(article.id))
        .map((article) => [
          article.id,
          {
            originalTitle: article.title,
            snapshotAsOf: assetSnapshots[article.symbol].market.asOf,
            analysis: analysisById.get(article.id),
          },
        ]),
    );
    persistChain = persistChain.then(() =>
      writeJsonAtomically(ANALYSIS_CACHE_PATH, {
        version: 1,
        model: llmConfig.model,
        analyses,
      }),
    );
    return persistChain;
  };

  async function worker() {
    while (nextTaskIndex < tasks.length) {
      const taskIndex = nextTaskIndex;
      nextTaskIndex += 1;
      const task = tasks[taskIndex];
      const analyses = await analyzeBatch(
        task.articles,
        assetSnapshots[task.symbol],
        macroSnapshot,
        llmConfig,
      );
      for (const [id, analysis] of analyses) analysisById.set(id, analysis);
      await persistProgress();
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(ANALYSIS_CONCURRENCY, tasks.length) },
      () => worker(),
    ),
  );
  await persistChain;

  const articles = newsCache.articles.map((article) => {
    const analysis = analysisById.get(article.id);
    if (!analysis) {
      throw new Error(`No cached analysis for article ${article.id}`);
    }
    return { ...article, analysis };
  });
  await writeJsonAtomically(NEWS_CACHE_PATH, {
    ...newsCache,
    version: 2,
    enrichedAt: now.toISOString(),
    analysis: {
      provider: "bigmodel",
      model: llmConfig.model,
      thinking: "enabled",
    },
    macroSnapshot,
    assetSnapshots,
    articles,
  });
  console.log(`News analysis updated: ${articles.length} articles`);
}

try {
  await enrichNews();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes("--if-missing")) {
    console.warn(`News analysis skipped: ${message}`);
    process.exitCode = 0;
  } else {
    console.error(`News analysis failed: ${message}`);
    process.exitCode = 1;
  }
}
