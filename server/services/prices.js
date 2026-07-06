import { env } from '../config/env.js';

const priceCache = new Map();

const assetFeeds = {
  USDC: { id: 'usd-coin', label: 'USDC on Stellar' },
  EURC: { id: 'euro-coin', label: 'EURC on Stellar' },
  PYUSD: { id: 'paypal-usd', label: 'PYUSD on Stellar' },
  XLM: { id: 'stellar', label: 'XLM Stellar' },
  AQUA: { id: 'aquarius', label: 'AQUA Stellar' },
  USDT: { id: 'tether', label: 'USDT Stellar' },
};

export class PriceFeedError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = 'PriceFeedError';
    this.statusCode = statusCode;
  }
}

function normalizeAsset(value) {
  const text = String(value || '').trim().toUpperCase();
  return text.split(/\s+/)[0];
}

export function getSupportedPriceAssets() {
  return Object.entries(assetFeeds).map(([symbol, feed]) => ({
    symbol,
    label: feed.label,
  }));
}

export async function getUsdPriceForAsset(asset) {
  const symbol = normalizeAsset(asset);
  const feed = assetFeeds[symbol];

  if (!feed) {
    throw new PriceFeedError(`No live price feed is configured for ${asset}.`, 422);
  }

  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.cachedAt < env.prices.cacheMs) {
    return cached.value;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.prices.timeoutMs);
  const url = new URL('/api/v3/simple/price', env.prices.coingeckoBaseUrl);
  url.searchParams.set('ids', feed.id);
  url.searchParams.set('vs_currencies', 'usd');
  url.searchParams.set('include_last_updated_at', 'true');
  url.searchParams.set('include_24hr_change', 'true');
  url.searchParams.set('precision', 'full');

  try {
    const apiResponse = await fetch(url, { signal: controller.signal });
    const data = await apiResponse.json().catch(() => null);

    if (!apiResponse.ok) {
      throw new PriceFeedError(data?.error || 'Price provider request failed.', apiResponse.status);
    }

    const record = data?.[feed.id];
    const price = Number(record?.usd);

    if (!Number.isFinite(price) || price <= 0) {
      throw new PriceFeedError(`Price provider did not return a usable USD price for ${feed.label}.`);
    }

    const value = {
      asset: feed.label,
      symbol,
      price,
      currency: 'USD',
      lastUpdatedAt: record?.last_updated_at ? Number(record.last_updated_at) * 1000 : null,
      change24h: Number.isFinite(Number(record?.usd_24h_change)) ? Number(record.usd_24h_change) : null,
      provider: 'CoinGecko',
    };

    priceCache.set(symbol, { cachedAt: Date.now(), value });
    return value;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new PriceFeedError('Price request timed out.', 504);
    }

    if (error instanceof PriceFeedError) {
      throw error;
    }

    throw new PriceFeedError(error.message || 'Price request failed.');
  } finally {
    clearTimeout(timeout);
  }
}
