"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type OrderSide = "long" | "short";

type PlaceOrderInput = {
  privateKey: string;
  marketQuery: string;
  side: OrderSide;
  notional: number;
  leverage: number;
};

type PlaceOrderResult = {
  txHash: string;
  ticker: string;
  price: number;
  quantity: number;
  injectiveAddress: string;
};

export type DerivativePosition = {
  marketId: string;
  ticker: string;
  side: OrderSide;
  quantity: number;
  entryPrice: number;
  markPrice: number;
  margin: number;
  liquidationPrice: number;
  unrealizedPnl: number;
  leverage: number;
};

const DERIVATIVE_MARKET_ORDER_TYPE = {
  BUY: 1,
  SELL: 2,
} as const;

let injectiveModulesPromise: Promise<any> | undefined;
let marketsCache: any[] | undefined;

function normalizePrivateKey(value: string) {
  const normalized = value.trim().replace(/^0x/i, "");
  if (!/^[a-f0-9]{64}$/i.test(normalized)) {
    throw new Error("请输入 64 位十六进制 Injective 私钥。");
  }
  return normalized;
}

function getDerivativeMarketOrderType(side: OrderSide) {
  return side === "long"
    ? DERIVATIVE_MARKET_ORDER_TYPE.BUY
    : DERIVATIVE_MARKET_ORDER_TYPE.SELL;
}

function getBestOrderbookLevel(orderbook: any, side: OrderSide) {
  const levels = side === "long" ? orderbook.sells : orderbook.buys;
  return Array.isArray(levels)
    ? levels.find(
        (level) => Number(level?.price) > 0 && Number(level?.quantity) > 0,
      )
    : undefined;
}

function getErrorText(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || "");
}

function normalizeInjectiveOrderError(error: unknown) {
  const message = getErrorText(error);
  if (/account .* not found/i.test(message)) {
    return "账户未激活或余额不足：请先给这个 Injective 地址充值可用资金。";
  }
  if (
    /insufficient funds|insufficient balance|spendable balance|insufficient fee/i.test(
      message,
    )
  ) {
    return "余额不足：可用余额不足以支付保证金或 gas。";
  }
  return message || "Injective 拒绝了这笔订单。";
}

async function loadInjectiveModules() {
  if (!injectiveModulesPromise) {
    injectiveModulesPromise = (async () => {
      const bufferModule = await import("buffer");
      if (!(globalThis as any).Buffer) {
        (globalThis as any).Buffer = bufferModule.Buffer;
      }

      const [
        networksModule,
        indexerModule,
        sdkModules,
        sdkTx,
        sdkAccounts,
        sdkUtils,
      ] = await Promise.all([
        import("@injectivelabs/networks"),
        import("@injectivelabs/sdk-ts/client/indexer"),
        import("@injectivelabs/sdk-ts/core/modules"),
        import("@injectivelabs/sdk-ts/core/tx"),
        import("@injectivelabs/sdk-ts/core/accounts"),
        import("@injectivelabs/sdk-ts/utils"),
      ]);

      return {
        ...networksModule,
        ...indexerModule,
        ...sdkModules,
        ...sdkTx,
        ...sdkAccounts,
        ...sdkUtils,
      };
    })();
  }

  return injectiveModulesPromise;
}

export async function deriveInjectiveAddress(privateKeyValue: string) {
  const modules = await loadInjectiveModules();
  try {
    return modules.PrivateKey.fromHex(
      normalizePrivateKey(privateKeyValue),
    ).toBech32();
  } catch {
    throw new Error("私钥格式无效，无法派生 Injective 地址。");
  }
}

export async function fetchDerivativePositions(
  injectiveAddress: string,
): Promise<DerivativePosition[]> {
  const modules = await loadInjectiveModules();
  const endpoints = modules.getNetworkEndpoints(modules.Network.Mainnet);
  const api = new modules.IndexerGrpcDerivativesApi(endpoints.indexer);
  const response = await api.fetchPositionsV2({ address: injectiveAddress });

  return response.positions
    .map((position: any) => {
      const direction = String(position.direction || "").toLowerCase();
      const side: OrderSide =
        direction === "buy" || direction === "long" ? "long" : "short";
      const quantity = Math.abs(Number(position.quantity || 0));
      const entryPrice = Number(position.entryPrice || 0);
      const markPrice = Number(position.markPrice || 0);
      const margin = Number(position.margin || 0);
      const reportedPnl = Number(position.upnl);
      const calculatedPnl =
        (side === "long" ? markPrice - entryPrice : entryPrice - markPrice) *
        quantity;

      return {
        marketId: String(position.marketId || ""),
        ticker: String(position.ticker || "Unknown market"),
        side,
        quantity,
        entryPrice,
        markPrice,
        margin,
        liquidationPrice: Number(position.liquidationPrice || 0),
        unrealizedPnl: Number.isFinite(reportedPnl)
          ? reportedPnl
          : calculatedPnl,
        leverage:
          margin > 0 ? Math.max(1, (entryPrice * quantity) / margin) : 1,
      };
    })
    .filter((position: DerivativePosition) => position.quantity > 0);
}

async function fetchMarkets(modules: any) {
  if (marketsCache) return marketsCache;

  const endpoints = modules.getNetworkEndpoints(modules.Network.Mainnet);
  const api = new modules.IndexerGrpcDerivativesApi(endpoints.indexer);
  const markets = await api.fetchMarkets({ marketStatuses: ["active"] });
  marketsCache = markets;
  return markets;
}

function quotePriority(market: any) {
  const ticker = String(market.ticker || "").toUpperCase();
  if (ticker.includes("USDC")) return 0;
  if (ticker.includes("USDT")) return 1;
  return 2;
}

function sortMarketCandidates(markets: any[]) {
  return [...markets].sort((left, right) => {
    const quoteDiff = quotePriority(left) - quotePriority(right);
    if (quoteDiff !== 0) return quoteDiff;
    return String(left.ticker || "").localeCompare(String(right.ticker || ""));
  });
}

function findMarketCandidates(markets: any[], marketQuery: string) {
  const query = marketQuery.trim().toUpperCase();
  const perpetuals = markets.filter(
    (market) => market.isPerpetual !== false,
  );
  const exactCandidates = perpetuals.filter((market) => {
    const ticker = String(market.ticker || "").toUpperCase();
    const base = ticker.split("/")[0]?.trim();
    return base === query;
  });
  const candidates = exactCandidates.length
    ? exactCandidates
    : perpetuals.filter((market) =>
        String(market.ticker || "").toUpperCase().includes(query),
      );

  return sortMarketCandidates(candidates);
}

async function findLiquidDerivativeMarket(
  derivativesApi: any,
  markets: any[],
  marketQuery: string,
  side: OrderSide,
) {
  const candidates = findMarketCandidates(markets, marketQuery);
  if (!candidates.length) {
    throw new Error(
      `Injective Mainnet 暂未找到 ${marketQuery} 的可交易永续市场。`,
    );
  }

  const checkedTickers: string[] = [];
  for (const market of candidates) {
    checkedTickers.push(String(market.ticker || "Unknown market"));
    const orderbook = await derivativesApi.fetchOrderbookV2(market.marketId);
    const bestLevel = getBestOrderbookLevel(orderbook, side);
    if (bestLevel) return { bestLevel, market };
  }

  throw new Error(
    `${marketQuery} 当前没有足够的 Mainnet 订单簿流动性。已检查：${checkedTickers.join(
      "、",
    )}`,
  );
}

export async function placeDerivativeMarketOrder(
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  const modules = await loadInjectiveModules();
  const normalizedPrivateKey = normalizePrivateKey(input.privateKey);
  const privateKey = modules.PrivateKey.fromHex(normalizedPrivateKey);
  const injectiveAddress = privateKey.toBech32();
  const markets = await fetchMarkets(modules);
  const endpoints = modules.getNetworkEndpoints(modules.Network.Mainnet);
  const derivativesApi = new modules.IndexerGrpcDerivativesApi(
    endpoints.indexer,
  );
  const { bestLevel, market } = await findLiquidDerivativeMarket(
    derivativesApi,
    markets,
    input.marketQuery,
    input.side,
  );

  const quoteDecimals = Number(market.quoteToken?.decimals ?? 6);
  const multipliers = modules.getDerivativeMarketTensMultiplier({
    quoteDecimals,
    minPriceTickSize: market.minPriceTickSize,
    minQuantityTickSize: market.minQuantityTickSize,
  });
  const referencePrice = Number(
    modules.derivativePriceFromChainPriceToFixed({
      value: bestLevel.price,
      tensMultiplier: multipliers.priceTensMultiplier,
      quoteDecimals,
    }),
  );

  if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
    throw new Error(`${market.ticker} 当前订单簿价格无效，请稍后重试。`);
  }

  const protectedPrice =
    input.side === "long"
      ? referencePrice * 1.005
      : referencePrice * 0.995;
  const rawQuantity = input.notional / protectedPrice;
  const rawMargin = input.notional / input.leverage;
  const allowedPrice = modules.formatPriceToAllowablePrice(
    protectedPrice,
    multipliers.priceTensMultiplier,
  );
  const allowedQuantity = modules.formatAmountToAllowableAmount(
    Math.max(rawQuantity, Number(market.minQuantityTickSize || 0)),
    multipliers.quantityTensMultiplier,
  );
  const subaccountId = modules.getDefaultSubaccountId(injectiveAddress);

  const msg = modules.MsgCreateDerivativeMarketOrder.fromJSON({
    marketId: market.marketId,
    subaccountId,
    injectiveAddress,
    orderType: getDerivativeMarketOrderType(input.side),
    triggerPrice: "0",
    feeRecipient: injectiveAddress,
    price: modules.derivativePriceToChainPriceToFixed({
      value: allowedPrice,
      tensMultiplier: multipliers.priceTensMultiplier,
      quoteDecimals,
    }),
    quantity: modules.derivativeQuantityToChainQuantityToFixed({
      value: allowedQuantity,
      tensMultiplier: multipliers.quantityTensMultiplier,
    }),
    margin: modules.derivativeMarginToChainMarginToFixed({
      value: rawMargin,
      quoteDecimals,
      tensMultiplier: multipliers.priceTensMultiplier,
    }),
  });

  const broadcaster = new modules.MsgBroadcasterWithPk({
    privateKey: normalizedPrivateKey,
    network: modules.Network.Mainnet,
    endpoints,
    simulateTx: true,
    gasBufferCoefficient: 1.1,
  });
  let response;
  try {
    response = await broadcaster.broadcast({ msgs: msg });
  } catch (error) {
    throw new Error(normalizeInjectiveOrderError(error));
  }

  if (response.code !== 0) {
    throw new Error(normalizeInjectiveOrderError(response.rawLog));
  }

  return {
    txHash: response.txHash,
    ticker: market.ticker,
    price: Number(allowedPrice),
    quantity: Number(allowedQuantity),
    injectiveAddress,
  };
}
