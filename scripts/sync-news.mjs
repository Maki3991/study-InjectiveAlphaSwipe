import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const CACHE_PATH = process.env.NEWS_CACHE_PATH
  ? resolve(process.env.NEWS_CACHE_PATH)
  : resolve(PROJECT_ROOT, "data/news-cache.json");
const TRANSLATION_CACHE_PATH = process.env.NEWS_TRANSLATION_CACHE_PATH
  ? resolve(process.env.NEWS_TRANSLATION_CACHE_PATH)
  : resolve(PROJECT_ROOT, "data/.news-translation-cache.json");
const LOCAL_ENV_FILES = [".env.local", ".dev.vars"].map((name) =>
  resolve(PROJECT_ROOT, name),
);

const STOCK_SYMBOLS = ["META", "NVDA", "AAPL", "TSLA"];
const CRYPTO_SYMBOLS = ["BTCUSD", "ETHUSD", "BNBUSD", "INJUSD"];
const ALLOWED_SYMBOLS = new Set([...STOCK_SYMBOLS, ...CRYPTO_SYMBOLS]);
const FMP_BASE_URL =
  process.env.FMP_BASE_URL ||
  "https://financialmodelingprep.com/stable/news";
const DEFAULT_LLM_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
const DEFAULT_LLM_MODEL = "glm-4.5-air";
const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;
const TRANSLATION_BATCH_SIZE = 6;
const TRANSLATION_CONCURRENCY = 2;

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

async function readCache() {
  try {
    return JSON.parse(await readFile(CACHE_PATH, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readTranslationCache() {
  try {
    const cache = JSON.parse(await readFile(TRANSLATION_CACHE_PATH, "utf8"));
    return cache?.translations && typeof cache.translations === "object"
      ? cache.translations
      : {};
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

function parseFmpDate(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.includes("T")
    ? value
    : `${value.trim().replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanText(value, maxLength = 8_000) {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function normalizeArticle(raw, category, windowStart) {
  const symbol = cleanText(raw?.symbol, 20).toUpperCase();
  const publishedAt = parseFmpDate(raw?.publishedDate);
  const url = cleanText(raw?.url, 2_000);
  const title = cleanText(raw?.title, 1_000);

  if (
    !ALLOWED_SYMBOLS.has(symbol) ||
    !publishedAt ||
    publishedAt < windowStart ||
    !url ||
    !title
  ) {
    return null;
  }

  const idSource = `${symbol}:${publishedAt.toISOString()}:${url}`;
  const id = Buffer.from(idSource).toString("base64url").slice(0, 96);

  return {
    id,
    category,
    symbol,
    publishedDate: publishedAt.toISOString(),
    publisher: cleanText(raw?.publisher, 200),
    title,
    titleZh: "",
    image: cleanText(raw?.image, 2_000),
    site: cleanText(raw?.site, 300),
    text: cleanText(raw?.text),
    textZh: "",
    url,
  };
}

async function fetchFmpNews(category, symbols, apiKey, windowStart) {
  const url = new URL(`${FMP_BASE_URL}/${category}`);
  url.searchParams.set("symbols", symbols.join(","));
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `FMP ${category} news failed (${response.status}): ${body.slice(0, 240)}`,
    );
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`FMP ${category} news did not return valid JSON`);
  }
  if (!Array.isArray(payload)) {
    throw new Error(`FMP ${category} news returned an unexpected payload`);
  }

  return payload
    .map((article) => normalizeArticle(article, category, windowStart))
    .filter(Boolean);
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function extractJsonObject(value) {
  const trimmed = cleanText(value, 200_000);
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  return JSON.parse(fenced || trimmed);
}

async function translateBatch(articles, config, attempt = 0) {
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
          content:
            "你是严谨的金融新闻翻译。只做忠实翻译，不补充事实、不做投资建议。股票代码、币种代码、公司名、产品名和数字必须准确保留。返回合法 JSON。",
        },
        {
          role: "user",
          content: JSON.stringify({
            task:
              '把每条英文 title 和 text 翻译为简体中文。返回 {"translations":[{"id":"原 id","titleZh":"中文标题","textZh":"中文摘要"}]}，不要遗漏或增加条目。',
            articles: articles.map(({ id, title, text }) => ({ id, title, text })),
          }),
        },
      ],
      thinking: { type: "enabled" },
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: Math.min(8_192, Math.max(1_500, articles.length * 520)),
    }),
    signal: AbortSignal.timeout(180_000),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `GLM translation failed (${response.status}): ${JSON.stringify(payload).slice(0, 300)}`,
    );
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("GLM translation returned no content");
  }

  const parsed = extractJsonObject(content);
  const translations = Array.isArray(parsed?.translations)
    ? parsed.translations
    : [];
  const byId = new Map(
    translations.map((item) => [
      cleanText(item?.id, 120),
      {
        titleZh: cleanText(item?.titleZh, 1_000),
        textZh: cleanText(item?.textZh),
      },
    ]),
  );

  const translated = articles.flatMap((article) => {
    const translation = byId.get(article.id);
    if (!translation?.titleZh) return [];
    return {
      ...article,
      titleZh: translation.titleZh,
      textZh: translation.textZh || article.text,
    };
  });

  const translatedIds = new Set(translated.map((article) => article.id));
  const missing = articles.filter((article) => !translatedIds.has(article.id));
  if (missing.length) {
    if (attempt >= 3) {
      throw new Error(`GLM translation omitted article ${missing[0].id}`);
    }
    const retryGroups =
      missing.length === articles.length && missing.length > 1
        ? chunks(missing, Math.ceil(missing.length / 2))
        : [missing];
    for (const retryGroup of retryGroups) {
      translated.push(...(await translateBatch(retryGroup, config, attempt + 1)));
    }
  }

  const byTranslatedId = new Map(
    translated.map((article) => [article.id, article]),
  );
  return articles.map((article) => byTranslatedId.get(article.id));
}

async function translateArticles(articles, config) {
  const savedTranslations = await readTranslationCache();
  const translatedById = new Map();
  for (const article of articles) {
    const saved = savedTranslations[article.id];
    if (
      saved?.originalTitle === article.title &&
      saved?.titleZh &&
      typeof saved.titleZh === "string"
    ) {
      translatedById.set(article.id, {
        ...article,
        titleZh: saved.titleZh,
        textZh: saved.textZh || article.text,
      });
    }
  }

  const pendingBatches = chunks(
    articles.filter((article) => !translatedById.has(article.id)),
    TRANSLATION_BATCH_SIZE,
  );
  let nextBatchIndex = 0;
  let persistChain = Promise.resolve();

  const persistProgress = () => {
    const translations = Object.fromEntries(
      [...translatedById.values()].map((article) => [
        article.id,
        {
          originalTitle: article.title,
          titleZh: article.titleZh,
          textZh: article.textZh,
        },
      ]),
    );
    persistChain = persistChain.then(() =>
      writeJsonAtomically(TRANSLATION_CACHE_PATH, {
        version: 1,
        model: config.model,
        translations,
      }),
    );
    return persistChain;
  };

  async function worker() {
    while (nextBatchIndex < pendingBatches.length) {
      const batchIndex = nextBatchIndex;
      nextBatchIndex += 1;
      const translatedBatch = await translateBatch(
        pendingBatches[batchIndex],
        config,
      );
      for (const article of translatedBatch) {
        translatedById.set(article.id, article);
      }
      await persistProgress();
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(TRANSLATION_CONCURRENCY, pendingBatches.length),
      },
      () => worker(),
    ),
  );
  await persistChain;

  return articles.map((article) => {
    const translated = translatedById.get(article.id);
    if (!translated) {
      throw new Error(`No cached translation for article ${article.id}`);
    }
    return translated;
  });
}

async function writeJsonAtomically(path, value) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function writeCache(cache) {
  await writeJsonAtomically(CACHE_PATH, cache);
}

async function syncNews() {
  await loadLocalEnv();

  const refresh = process.argv.includes("--refresh");
  const existingCache = await readCache();

  if (!refresh && existingCache?.articles?.length) {
    console.log(
      `News cache ready: ${existingCache.articles.length} articles from ${existingCache.syncedAt}`,
    );
    return;
  }

  const fmpApiKey = cleanText(process.env.FMP_API_KEY, 500);
  if (!fmpApiKey) throw new Error("FMP_API_KEY is required to sync news");

  const now = new Date();
  const windowStart = new Date(now.getTime() - WEEK_MS);
  const [stockNews, cryptoNews] = await Promise.all([
    fetchFmpNews("stock", STOCK_SYMBOLS, fmpApiKey, windowStart),
    fetchFmpNews("crypto", CRYPTO_SYMBOLS, fmpApiKey, windowStart),
  ]);

  const uniqueArticles = [
    ...new Map(
      [...stockNews, ...cryptoNews].map((article) => [article.url, article]),
    ).values(),
  ].sort(
    (left, right) =>
      new Date(right.publishedDate).getTime() -
      new Date(left.publishedDate).getTime(),
  );

  if (!uniqueArticles.length) {
    throw new Error(
      "FMP returned no matching articles from the configured symbols in the last 7 days",
    );
  }
  console.log(
    `FMP fetched ${stockNews.length} stock and ${cryptoNews.length} crypto articles from the last 7 days`,
  );

  const llmApiKey = cleanText(
    process.env.LLM_API_KEY || process.env.ZHIPU_API_KEY,
    1_000,
  );
  if (!llmApiKey) {
    throw new Error("LLM_API_KEY or ZHIPU_API_KEY is required to translate news");
  }

  const llmConfig = {
    apiKey: llmApiKey,
    baseUrl: cleanText(process.env.LLM_BASE_URL, 1_000).replace(/\/+$/, "") ||
      DEFAULT_LLM_BASE_URL,
    model: cleanText(process.env.LLM_MODEL, 200) || DEFAULT_LLM_MODEL,
  };
  const articles = await translateArticles(uniqueArticles, llmConfig);

  await writeCache({
    version: 1,
    syncedAt: now.toISOString(),
    windowStart: windowStart.toISOString(),
    source: "financialmodelingprep",
    symbols: {
      stock: STOCK_SYMBOLS,
      crypto: CRYPTO_SYMBOLS,
    },
    translation: {
      provider: "bigmodel",
      model: llmConfig.model,
      thinking: "enabled",
    },
    articles,
  });

  console.log(`News cache updated: ${articles.length} translated articles`);
}

try {
  await syncNews();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes("--if-missing")) {
    console.warn(`News sync skipped: ${message}`);
    process.exitCode = 0;
  } else {
    console.error(`News sync failed: ${message}`);
    process.exitCode = 1;
  }
}
