// server.js - Complete Backend Implementation
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://usdt-p2p-engine-erli.vercel.app", // Frontend URL của bạn
      "https://*.vercel.app",
    ],
    credentials: true,
  })
);
app.use(express.json());

// ============================================
// CACHE LAYER
// ============================================
const cache = {
  buy: { data: [], timestamp: null, error: null },
  sell: { data: [], timestamp: null, error: null },
};

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const CACHE_STALE_ACCEPTABLE = 30 * 60 * 1000; // 30 minutes (fallback)

// ============================================
// BINANCE P2P API FETCHER
// ============================================
async function fetchBinanceAds(tradeType) {
  const url = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

  const payload = {
    asset: "USDT",
    fiat: "VND",
    merchantCheck: false,
    page: 1,
    payTypes: [],
    publisherType: null,
    rows: 10, // Fetch 20 ads
    tradeType: tradeType, // 'BUY' or 'SELL'
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      timeout: 30000,
    });

    if (response.data?.data) {
      return normalizeAds(response.data.data, tradeType);
    }

    throw new Error("Invalid response structure");
  } catch (error) {
    console.error(`Error fetching ${tradeType} ads:`, error.message);
    throw error;
  }
}

// ============================================
// DATA NORMALIZATION
// ============================================
function normalizeAds(rawData, tradeType) {
  const ads = rawData || [];

  return ads
    .map((ad) => {
      const adv = ad.adv || {};
      const advertiser = ad.advertiser || {};

      return {
        id: adv.advNo,
        type: tradeType,
        price: parseFloat(adv.price),
        availableAmount: parseFloat(adv.surplusAmount),
        minLimit: parseFloat(adv.minSingleTransAmount),
        maxLimit: parseFloat(adv.dynamicMaxSingleTransAmount),
        merchantName: advertiser.nickName,
        completionRate: parseFloat(advertiser.monthFinishRate) * 100, // Convert to percentage
        totalOrders: parseInt(advertiser.monthOrderCount) || 0,
        paymentMethods: (adv.tradeMethods || []).map((m) => m.tradeMethodName),
        deepLink: `https://p2p.binance.com/en/advertiserDetail?advertiserNo=${
          advertiser.userNo
        }&tradeType=${tradeType.toLowerCase()}`,
      };
    })
    .filter((ad) => ad.price > 0 && ad.availableAmount > 0);
}

// ============================================
// SNAPSHOT UPDATER
// ============================================
async function updateSnapshots() {
  console.log("🔄 Updating snapshots...");

  // Fetch BUY ads (user wants to buy USDT = merchant sells USDT)
  try {
    const buyAds = await fetchBinanceAds("SELL"); // SELL from merchant = BUY for user
    cache.buy = {
      data: buyAds,
      timestamp: Date.now(),
      error: null,
    };
    console.log(`✅ BUY ads updated: ${buyAds.length} offers`);
  } catch (error) {
    cache.buy.error = error.message;
    console.error("❌ BUY ads update failed");
  }

  // Fetch SELL ads (user wants to sell USDT = merchant buys USDT)
  try {
    const sellAds = await fetchBinanceAds("BUY"); // BUY from merchant = SELL for user
    cache.sell = {
      data: sellAds,
      timestamp: Date.now(),
      error: null,
    };
    console.log(`✅ SELL ads updated: ${sellAds.length} offers`);
  } catch (error) {
    cache.sell.error = error.message;
    console.error("❌ SELL ads update failed");
  }
}

// ============================================
// DECISION ENGINE - RANKING ALGORITHM
// ============================================
function rankOffers(ads, userAmount, isBuying) {
  // Filter: Only ads that can handle the user's amount
  const compatible = ads.filter((ad) => {
    return (
      ad.availableAmount >= userAmount &&
      ad.minLimit <= userAmount &&
      ad.maxLimit >= userAmount
    );
  });

  // Score each offer
  const scored = compatible.map((ad) => {
    let score = 0;

    // 1. Price competitiveness (40 points)
    if (isBuying) {
      // Lower price = better for buying
      const priceRank = compatible.findIndex((a) => a.price >= ad.price) + 1;
      score += (40 * (compatible.length - priceRank + 1)) / compatible.length;
    } else {
      // Higher price = better for selling
      const priceRank = compatible.findIndex((a) => a.price <= ad.price) + 1;
      score += (40 * (compatible.length - priceRank + 1)) / compatible.length;
    }

    // 2. Completion rate (30 points)
    score += (ad.completionRate / 100) * 30;

    // 3. Available amount buffer (15 points)
    const buffer = ad.availableAmount / userAmount;
    score += Math.min(buffer / 3, 1) * 15; // Cap at 3x buffer

    // 4. Total orders (experience) (15 points)
    const orderScore = Math.min(ad.totalOrders / 100, 1); // Cap at 100 orders
    score += orderScore * 15;

    return { ...ad, score };
  });

  // Sort by score descending
  return scored.sort((a, b) => b.score - a.score);
}

// ============================================
// API ENDPOINTS
// ============================================

// Health check
app.get("/api/health", (req, res) => {
  const buyAge = cache.buy.timestamp ? Date.now() - cache.buy.timestamp : null;
  const sellAge = cache.sell.timestamp
    ? Date.now() - cache.sell.timestamp
    : null;

  res.json({
    status: "ok",
    cache: {
      buy: {
        count: cache.buy.data.length,
        age: buyAge ? Math.floor(buyAge / 1000) + "s" : "never",
        error: cache.buy.error,
      },
      sell: {
        count: cache.sell.data.length,
        age: sellAge ? Math.floor(sellAge / 1000) + "s" : "never",
        error: cache.sell.error,
      },
    },
  });
});

// Search endpoint
app.post("/api/search", (req, res) => {
  const { action, amount, currency } = req.body;

  // Validation
  if (!action || !["buy", "sell"].includes(action)) {
    return res
      .status(400)
      .json({ error: 'Invalid action. Use "buy" or "sell"' });
  }

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  if (!currency || !["VND", "USDT"].includes(currency)) {
    return res
      .status(400)
      .json({ error: 'Invalid currency. Use "VND" or "USDT"' });
  }

  // Get relevant cache
  const cacheKey = action;
  const snapshot = cache[cacheKey];

  // Check cache freshness
  const age = snapshot.timestamp ? Date.now() - snapshot.timestamp : null;
  const isStale = age && age > CACHE_DURATION;
  const isTooStale = age && age > CACHE_STALE_ACCEPTABLE;

  if (isTooStale || !snapshot.data.length) {
    return res.status(503).json({
      error: "Service temporarily unavailable. Please try again in a moment.",
      details: snapshot.error,
    });
  }

  // Calculate amounts
  let usdtAmount, vndAmount;
  const ads = snapshot.data;

  if (currency === "USDT") {
    usdtAmount = amount;
    // Estimate VND using best available price
    const bestPrice =
      action === "buy"
        ? Math.min(...ads.map((a) => a.price))
        : Math.max(...ads.map((a) => a.price));
    vndAmount = usdtAmount * bestPrice;
  } else {
    vndAmount = amount;
    // Estimate USDT using best available price
    const bestPrice =
      action === "buy"
        ? Math.min(...ads.map((a) => a.price))
        : Math.max(...ads.map((a) => a.price));
    usdtAmount = vndAmount / bestPrice;
  }

  // Run decision engine
  const rankedOffers = rankOffers(ads, usdtAmount, action === "buy");
  const top5 = rankedOffers.slice(0, 5);

  // Calculate actual receive amount from top offer
  const actualReceive =
    top5.length > 0
      ? action === "buy"
        ? { usdt: usdtAmount, vnd: usdtAmount * top5[0].price }
        : { usdt: vndAmount / top5[0].price, vnd: vndAmount }
      : null;

  res.json({
    query: {
      action,
      inputAmount: amount,
      inputCurrency: currency,
    },
    estimate: actualReceive,
    offers: top5.map((offer) => ({
      id: offer.id,
      merchant: offer.merchantName,
      price: offer.price,
      available: offer.availableAmount,
      limits: {
        min: offer.minLimit,
        max: offer.maxLimit,
      },
      completionRate: offer.completionRate.toFixed(1) + "%",
      totalOrders: offer.totalOrders,
      paymentMethods: offer.paymentMethods,
      score: offer.score.toFixed(1),
      deepLink: offer.deepLink,
    })),
    meta: {
      timestamp: snapshot.timestamp,
      dataAge: Math.floor(age / 1000) + "s",
      isStale,
      totalAdsAvailable: ads.length,
      compatibleAds: rankedOffers.length,
    },
  });
});

// ============================================
// STARTUP & SCHEDULER
// ============================================
const PORT = process.env.PORT || 3001;

// Initial fetch
updateSnapshots().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Cache updates every ${CACHE_DURATION / 1000 / 60} minutes`);
  });
});

// Schedule updates
setInterval(updateSnapshots, CACHE_DURATION);

module.exports = app;
