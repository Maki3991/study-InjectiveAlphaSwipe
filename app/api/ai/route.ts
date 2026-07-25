import {
  ALLOWED_SYMBOLS,
  NEWS_ITEMS,
  type EarningsAnalysis,
  type NewsItem,
  type SignalSymbol,
} from "../../news-data";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-5.6-sol";
const DEFAULT_REASONING_EFFORT = "low";
const MAX_QUESTION_LENGTH = 1_200;
const MAX_FIELD_LENGTH = 1_000;

type RuntimeEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_REASONING_EFFORT?: string;
};

type AiRequestBody = {
  question?: unknown;
  signal?: unknown;
  marketQuery?: unknown;
};

type OpenAiResponsePayload = {
  output_text?: unknown;
  output?: Array<{
    content?: Array<{
      text?: unknown;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

async function readRuntimeEnv(key: keyof RuntimeEnv) {
  let cloudflareEnv: RuntimeEnv = {};
  try {
    cloudflareEnv = ((await import("cloudflare:workers")) as { env?: RuntimeEnv })
      .env ?? {};
  } catch {
    cloudflareEnv = {};
  }

  const nodeEnv =
    typeof process === "undefined"
      ? undefined
      : (process.env as RuntimeEnv | undefined);

  return (cloudflareEnv[key] || nodeEnv?.[key] || "").trim();
}

function clampText(value: unknown, fallback = "", maxLength = MAX_FIELD_LENGTH) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}…` : trimmed;
}

function isAllowedSymbol(value: unknown): value is SignalSymbol {
  return typeof value === "string" && ALLOWED_SYMBOLS.includes(value as SignalSymbol);
}

function normalizeReasoningEffort(value: string) {
  return ["none", "low", "medium", "high", "xhigh", "max"].includes(value)
    ? value
    : DEFAULT_REASONING_EFFORT;
}

function postedSignalObject(signal: unknown) {
  return signal && typeof signal === "object"
    ? (signal as Partial<NewsItem>)
    : {};
}

function sanitizeEarnings(value: unknown): EarningsAnalysis | undefined {
  if (!value || typeof value !== "object") return undefined;
  const earnings = value as Partial<EarningsAnalysis>;
  const metrics = Array.isArray(earnings.metrics)
    ? earnings.metrics.slice(0, 8).map((metric) => ({
        label: clampText(metric?.label, "", 80),
        value: clampText(metric?.value, "", 80),
        change: clampText(metric?.change, "", 80),
      }))
    : [];

  return {
    period: clampText(earnings.period, "", 120),
    headline: clampText(earnings.headline, "", 240),
    metrics,
    analysis: clampText(earnings.analysis),
    nextWatch: clampText(earnings.nextWatch),
  };
}

function resolveSignal(body: AiRequestBody) {
  const postedSignal = postedSignalObject(body.signal);
  const marketQuery = isAllowedSymbol(postedSignal.marketQuery)
    ? postedSignal.marketQuery
    : isAllowedSymbol(body.marketQuery)
      ? body.marketQuery
      : null;

  if (!marketQuery) return null;

  const base = NEWS_ITEMS.find((item) => item.marketQuery === marketQuery);
  if (!base) return null;

  const tags = Array.isArray(postedSignal.tags)
    ? postedSignal.tags.slice(0, 8).map((tag) => clampText(tag, "", 60)).filter(Boolean)
    : base.tags;

  return {
    ...base,
    id: clampText(postedSignal.id, base.id, 140),
    title: clampText(postedSignal.title, base.title),
    hook: clampText(postedSignal.hook, base.hook),
    summary: clampText(postedSignal.summary, base.summary, 1_400),
    source: clampText(postedSignal.source, base.source, 160),
    published: clampText(postedSignal.published, base.published, 120),
    sourceUrl: clampText(postedSignal.sourceUrl, base.sourceUrl, 1_000),
    marketLabel: clampText(postedSignal.marketLabel, base.marketLabel, 120),
    tags,
    impact: postedSignal.impact === "Medium" ? "Medium" : base.impact,
    confidence:
      typeof postedSignal.confidence === "number" &&
      Number.isFinite(postedSignal.confidence)
        ? Math.min(99, Math.max(1, Math.round(postedSignal.confidence)))
        : base.confidence,
    horizon: clampText(postedSignal.horizon, base.horizon, 120),
    bullCase: clampText(postedSignal.bullCase, base.bullCase),
    bearCase: clampText(postedSignal.bearCase, base.bearCase),
    catalyst: clampText(postedSignal.catalyst, base.catalyst),
    risk: clampText(postedSignal.risk, base.risk),
    earnings: sanitizeEarnings(postedSignal.earnings) || base.earnings,
  } satisfies NewsItem;
}

function buildSignalContext(signal: NewsItem) {
  return {
    app: "AlphaSwipe",
    symbol: signal.marketQuery,
    marketLabel: signal.marketLabel,
    category: signal.category,
    title: signal.title,
    hook: signal.hook,
    summary: signal.summary,
    source: signal.source,
    published: signal.published,
    tags: signal.tags,
    impact: signal.impact,
    confidence: signal.confidence,
    horizon: signal.horizon,
    bullCase: signal.bullCase,
    bearCase: signal.bearCase,
    catalyst: signal.catalyst,
    risk: signal.risk,
    earnings: signal.earnings,
  };
}

function extractAnswer(payload: OpenAiResponsePayload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  return (
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim() || ""
  );
}

export async function POST(request: Request) {
  const [apiKey, configuredModel, configuredReasoningEffort] =
    await Promise.all([
      readRuntimeEnv("OPENAI_API_KEY"),
      readRuntimeEnv("OPENAI_MODEL"),
      readRuntimeEnv("OPENAI_REASONING_EFFORT"),
    ]);
  const model = configuredModel || DEFAULT_OPENAI_MODEL;
  const reasoningEffort = normalizeReasoningEffort(
    configuredReasoningEffort || DEFAULT_REASONING_EFFORT,
  );

  if (!apiKey) {
    return Response.json(
      {
        error:
          "AI 还没有配置 OPENAI_API_KEY。请先在本地或 Sites runtime env 添加 OpenAI API key。",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: AiRequestBody;
  try {
    body = (await request.json()) as AiRequestBody;
  } catch {
    return Response.json(
      { error: "请求格式无效，请重新发送问题。" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const question = clampText(body.question, "", MAX_QUESTION_LENGTH);
  const signal = resolveSignal(body);

  if (!question) {
    return Response.json(
      { error: "问题不能为空。" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!signal) {
    return Response.json(
      { error: "当前卡片不在 AlphaSwipe 支持的交易列表里。" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const inputText = JSON.stringify(
    {
      signal: buildSignalContext(signal),
      userQuestion: question,
    },
    null,
    2,
  );

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: [
          "You are AlphaSwipe Signal AI, a concise market research copilot for crypto and tokenized/RWA-related perpetual signals.",
          "Answer in the user's language. If the user writes Chinese, answer in Chinese.",
          "Use only the supplied signal context plus clearly labeled general market reasoning. Do not invent live prices, order-book depth, account balances, or unprovided facts.",
          "Separate what the source says from AlphaSwipe's bull/bear thesis. Call out uncertainty and what data would confirm or invalidate the thesis.",
          "This chat cannot place trades. Do not give personalized financial advice; frame trade-related answers as risk, scenario, sizing, and execution considerations.",
          "Keep the answer compact: usually 2-5 short paragraphs or bullets.",
        ].join("\n"),
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: inputText }],
          },
        ],
        max_output_tokens: 650,
        reasoning: { effort: reasoningEffort },
        text: { format: { type: "text" }, verbosity: "medium" },
        store: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const payload = (await response.json().catch(() => ({}))) as OpenAiResponsePayload;
    if (!response.ok) {
      return Response.json(
        {
          error:
            payload.error?.message ||
            `OpenAI API 调用失败（HTTP ${response.status}）。`,
        },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    const answer = extractAnswer(payload);
    if (!answer) {
      return Response.json(
        { error: "OpenAI API 没有返回可展示的文字内容。" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(
      { answer, model, reasoningEffort },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && error.name === "TimeoutError"
            ? "OpenAI API 响应超时，请稍后重试。"
            : "AI 对话暂时不可用，请稍后重试。",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
