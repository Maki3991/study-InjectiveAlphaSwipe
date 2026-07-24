"use client";

export type OrderSide = "long" | "short";

type PlaceOrderInput = {
  injectiveAddress: string;
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

let walletStrategyInstance: any;
let walletModulesPromise: Promise<any> | undefined;
let marketsCache: any[] | undefined;

async function loadWalletModules() {
  if (!walletModulesPromise) {
    walletModulesPromise = (async () => {
      const bufferModule = await import("buffer");
      if (!(globalThis as any).Buffer) {
        (globalThis as any).Buffer = bufferModule.Buffer;
      }

      const [
        walletBaseModule,
        walletCoreModule,
        walletCosmosModule,
        networksModule,
        tsTypesModule,
        indexerModule,
        sdkModules,
        sdkUtils,
      ] = await Promise.all([
        import("@injectivelabs/wallet-base"),
        import("@injectivelabs/wallet-core"),
        import("@injectivelabs/wallet-cosmos"),
        import("@injectivelabs/networks"),
        import("@injectivelabs/ts-types"),
        import("@injectivelabs/sdk-ts/client/indexer"),
        import("@injectivelabs/sdk-ts/core/modules"),
        import("@injectivelabs/sdk-ts/utils"),
      ]);

      return {
        ...walletBaseModule,
        ...walletCoreModule,
        ...walletCosmosModule,
        ...networksModule,
        ...tsTypesModule,
        ...indexerModule,
        ...sdkModules,
        ...sdkUtils,
      };
    })();
  }

  return walletModulesPromise;
}

async function getWalletStrategy() {
  const modules = await loadWalletModules();

  if (!walletStrategyInstance) {
    const endpoints = modules.getNetworkEndpoints(modules.Network.Testnet);
    const keplrStrategy = new modules.CosmosWalletStrategy({
      chainId: modules.ChainId.Testnet,
      wallet: modules.Wallet.Keplr,
      endpoints: {
        rest: endpoints.rest,
        rpc: endpoints.rpc,
      },
    });
    walletStrategyInstance = new modules.BaseWalletStrategy({
      chainId: modules.ChainId.Testnet,
      wallet: modules.Wallet.Keplr,
      strategies: {
        [modules.Wallet.Keplr]: keplrStrategy,
      },
    });
  }

  await walletStrategyInstance.setWallet(modules.Wallet.Keplr);
  return { modules, walletStrategy: walletStrategyInstance };
}

export async function connectKeplr(): Promise<string> {
  if (typeof window === "undefined" || !(window as any).keplr) {
    throw new Error("未检测到 Keplr。请安装并解锁 Keplr 浏览器钱包后再试。");
  }

  const { walletStrategy } = await getWalletStrategy();
  const addresses = await walletStrategy.getAddresses();
  const address = addresses.find((value: string) => value?.startsWith("inj"));

  if (!address) {
    throw new Error("Keplr 没有返回 Injective 地址。请确认已允许连接 Testnet。");
  }

  return address;
}

export async function fetchDerivativePositions(
  injectiveAddress: string,
): Promise<DerivativePosition[]> {
  const modules = await loadWalletModules();
  const endpoints = modules.getNetworkEndpoints(modules.Network.Testnet);
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

  const endpoints = modules.getNetworkEndpoints(modules.Network.Testnet);
  const api = new modules.IndexerGrpcDerivativesApi(endpoints.indexer);
  const markets = await api.fetchMarkets({ marketStatuses: ["active"] });
  marketsCache = markets;
  return markets;
}

function findMarket(markets: any[], marketQuery: string) {
  const query = marketQuery.toUpperCase();
  const candidates = markets.filter((market) => {
    const ticker = String(market.ticker || "").toUpperCase();
    return ticker.includes(query) && market.isPerpetual !== false;
  });

  return (
    candidates.find((market) =>
      String(market.ticker).toUpperCase().includes("USDT"),
    ) ||
    candidates.find((market) =>
      String(market.ticker).toUpperCase().includes("USDC"),
    ) ||
    candidates[0]
  );
}

export async function placeDerivativeMarketOrder(
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  const { modules, walletStrategy } = await getWalletStrategy();
  const markets = await fetchMarkets(modules);
  const market = findMarket(markets, input.marketQuery);

  if (!market) {
    throw new Error(
      `Injective Testnet 暂未找到 ${input.marketQuery} 的可交易永续市场。`,
    );
  }

  const endpoints = modules.getNetworkEndpoints(modules.Network.Testnet);
  const derivativesApi = new modules.IndexerGrpcDerivativesApi(
    endpoints.indexer,
  );
  const orderbook = await derivativesApi.fetchOrderbookV2(market.marketId);
  const bestLevel =
    input.side === "long" ? orderbook.sells?.[0] : orderbook.buys?.[0];

  if (!bestLevel?.price) {
    throw new Error(`${market.ticker} 当前没有足够的 Testnet 订单簿流动性。`);
  }

  const referencePrice = Number(bestLevel.price);
  const protectedPrice =
    input.side === "long"
      ? referencePrice * 1.005
      : referencePrice * 0.995;
  const rawQuantity = input.notional / protectedPrice;
  const rawMargin = input.notional / input.leverage;
  const quoteDecimals = Number(market.quoteToken?.decimals ?? 6);
  const multipliers = modules.getDerivativeMarketTensMultiplier({
    quoteDecimals,
    minPriceTickSize: market.minPriceTickSize,
    minQuantityTickSize: market.minQuantityTickSize,
  });
  const allowedPrice = modules.formatPriceToAllowablePrice(
    protectedPrice,
    multipliers.priceTensMultiplier,
  );
  const allowedQuantity = modules.formatAmountToAllowableAmount(
    Math.max(rawQuantity, Number(market.minQuantityTickSize || 0)),
    multipliers.quantityTensMultiplier,
  );
  const subaccountId = modules.getDefaultSubaccountId(input.injectiveAddress);

  const msg = modules.MsgCreateDerivativeMarketOrder.fromJSON({
    marketId: market.marketId,
    subaccountId,
    injectiveAddress: input.injectiveAddress,
    orderType:
      input.side === "long"
        ? modules.OrderType.BUY
        : modules.OrderType.SELL,
    triggerPrice: "0",
    feeRecipient: input.injectiveAddress,
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

  const broadcaster = new modules.MsgBroadcaster({
    walletStrategy,
    network: modules.Network.Testnet,
    endpoints,
    simulateTx: true,
    gasBufferCoefficient: 1.1,
  });
  const response = await broadcaster.broadcast({
    injectiveAddress: input.injectiveAddress,
    msgs: msg,
  });

  if (response.code !== 0) {
    throw new Error(response.rawLog || "Injective 拒绝了这笔订单。");
  }

  return {
    txHash: response.txHash,
    ticker: market.ticker,
    price: Number(allowedPrice),
    quantity: Number(allowedQuantity),
  };
}
