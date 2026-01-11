const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// CACHE LAYER
// ============================================
const cache = {
  binance_buy: { data: [], timestamp: null, error: null, exchange: "binance" },
  binance_sell: { data: [], timestamp: null, error: null, exchange: "binance" },
  okx_buy: { data: [], timestamp: null, error: null, exchange: "okx" },
  okx_sell: { data: [], timestamp: null, error: null, exchange: "okx" },
};

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const CACHE_STALE_ACCEPTABLE = 30 * 60 * 1000; // 30 minutes

// ============================================
// BINANCE P2P API (with multiple methods)
// ============================================
async function fetchBinanceAds(tradeType) {
  const url = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

  const payload = {
    asset: "USDT",
    fiat: "VND",
    page: 1,
    rows: 20,
    tradeType: tradeType,
    payTypes: [],
    countries: [],
    publisherType: "merchant",
    filterType: "tradable",
    periods: [],
    additionalKycVerifyFilter: 0,
    classifies: ["mass", "profession", "fiat_trade"],
  };

  const methods = [
    // Method 1: Direct call with full headers
    async () => {
      return await axios.post(url, payload, {
        headers: {
          Accept: "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "Content-Type": "application/json",
          Origin: "https://p2p.binance.com",
          Referer: "https://p2p.binance.com/en",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
          "bnc-location": "",
          "bnc-time-zone": "Asia/Bangkok",
          c2ctype: "c2c_web",
          clienttype: "web",
          lang: "en",
          "sec-ch-ua":
            '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
        },
        timeout: 30000,
      });
    },

    // Method 2: ScraperAPI (better than CORS proxy)
    async () => {
      // Free tier: 1000 calls/month
      const scraperApiKey = process.env.SCRAPER_API_KEY || "demo";
      const proxyUrl = `http://api.scraperapi.com/?api_key=${scraperApiKey}&url=`;

      return await axios.post(proxyUrl + encodeURIComponent(url), payload, {
        headers: {
          "Content-Type": "application/json",
          "X-Original-Headers": JSON.stringify({
            Accept: "*/*",
            Origin: "https://p2p.binance.com",
            Referer: "https://p2p.binance.com/en",
          }),
        },
        timeout: 30000,
      });
    },

    // Method 3: Via different CORS proxy
    async () => {
      const proxyUrl = "https://corsproxy.io/?";
      return await axios.post(proxyUrl + encodeURIComponent(url), payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      });
    },
  ];

  let lastError;

  // Try each method
  for (let i = 0; i < methods.length; i++) {
    try {
      console.log(`Trying Binance method ${i + 1}...`);
      const response = await methods[i]();

      if (response.data?.data) {
        console.log(`✅ Binance method ${i + 1} succeeded`);
        return normalizeAds(response.data.data, tradeType, "binance");
      }
    } catch (error) {
      console.log(`❌ Binance method ${i + 1} failed: ${error.message}`);
      lastError = error;
    }
  }

  throw lastError || new Error("All Binance fetch methods failed");
}

// ============================================
// OKX P2P API
// ============================================
async function fetchOKXAds(tradeType) {
  // OKX uses 'buy' for user buying (merchant selling) and vice versa
  const side = tradeType === "SELL" ? "buy" : "sell";

  const url = "https://www.okx.com/v3/c2c/tradingOrders/books";

  const params = {
    quoteCurrency: "VND",
    baseCurrency: "USDT",
    side: side,
    paymentMethod: "all",
    userType: "all",
    showTrade: false,
    receivingAds: false,
    limit: 20,
  };

  try {
    console.log(`Fetching OKX ${tradeType} with side=${side}`);
    const response = await axios.get(url, {
      params,
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 30000,
    });

    console.log(`OKX response status: ${response.status}`);

    if (response.data?.data?.buy || response.data?.data?.sell) {
      const ads = response.data.data[side] || [];
      console.log(`OKX ${tradeType} returned ${ads.length} ads`);
      return normalizeOKXAds(ads, tradeType);
    }

    console.error(
      `OKX ${tradeType} invalid structure:`,
      JSON.stringify(response.data).substring(0, 200)
    );
    throw new Error("Invalid OKX response structure");
  } catch (error) {
    console.error(`❌ OKX ${tradeType} error:`, error.message);
    if (error.response) {
      console.error(`OKX response status: ${error.response.status}`);
      console.error(
        `OKX response data:`,
        JSON.stringify(error.response.data).substring(0, 200)
      );
    }
    throw error;
  }
}

// ============================================
// DATA NORMALIZATION
// ============================================
function normalizeAds(rawData, tradeType, exchange) {
  const ads = rawData || [];

  return ads
    .map((ad) => {
      const adv = ad.adv || {};
      const advertiser = ad.advertiser || {};

      // Binance returns amounts in FIAT (VND), need to convert to USDT
      const price = parseFloat(adv.price);
      const surplusAmountVND = parseFloat(adv.surplusAmount);
      const minLimitVND = parseFloat(adv.minSingleTransAmount);
      const maxLimitVND = parseFloat(adv.dynamicMaxSingleTransAmount);

      // Convert all VND amounts to USDT
      const availableAmountUSDT = surplusAmountVND / price;
      const minLimitUSDT = minLimitVND / price;
      const maxLimitUSDT = maxLimitVND / price;

      return {
        id: `${exchange}_${adv.advNo}`,
        exchange: "Binance",
        type: tradeType,
        price: price,
        availableAmount: availableAmountUSDT,
        minLimit: minLimitUSDT,
        maxLimit: maxLimitUSDT,
        merchantName: advertiser.nickName,
        completionRate: parseFloat(advertiser.monthFinishRate) * 100,
        totalOrders: parseInt(advertiser.monthOrderCount) || 0,
        paymentMethods: (adv.tradeMethods || []).map((m) => m.tradeMethodName),
        deepLink: `https://p2p.binance.com/en/advertiserDetail?advertiserNo=${advertiser.userNo}`,
      };
    })
    .filter((ad) => ad.price > 0 && ad.availableAmount > 0);
}

function normalizeOKXAds(rawData, tradeType) {
  const ads = rawData || [];

  return ads
    .map((ad) => {
      const price = parseFloat(ad.price);
      const availableAmount = parseFloat(ad.availableAmount); // Already in USDT
      const minLimitVND = parseFloat(ad.quoteMinAmountPerOrder);
      const maxLimitVND = parseFloat(ad.quoteMaxAmountPerOrder);

      // Convert VND limits to USDT
      const minLimitUSDT = minLimitVND / price;
      const maxLimitUSDT = maxLimitVND / price;

      return {
        id: `okx_${ad.id}`,
        exchange: "OKX",
        type: tradeType,
        price: price,
        availableAmount: availableAmount, // Already in USDT
        minLimit: minLimitUSDT, // Convert from VND
        maxLimit: maxLimitUSDT, // Convert from VND
        merchantName: ad.nickName,
        completionRate: (parseFloat(ad.completedRate) || 0) * 100,
        totalOrders: parseInt(ad.completedOrderQuantity) || 0,
        paymentMethods: ad.paymentMethods || [],
        deepLink: `https://www.okx.com/p2p-markets/${ad.id}`,
      };
    })
    .filter((ad) => ad.price > 0 && ad.availableAmount > 0);
}

// ============================================
// SNAPSHOT UPDATER
// ============================================
async function updateSnapshots() {
  console.log("🔄 Updating snapshots...");

  // Binance BUY
  try {
    console.log("Fetching Binance BUY ads...");
    const buyAds = await fetchBinanceAds("SELL");
    cache.binance_buy = {
      data: buyAds,
      timestamp: Date.now(),
      error: null,
      exchange: "binance",
    };
    console.log(`✅ Binance BUY ads: ${buyAds.length} offers`);
  } catch (error) {
    cache.binance_buy.error = error.message;
    console.error("❌ Binance BUY failed:", error.message);
  }

  // Binance SELL
  try {
    console.log("Fetching Binance SELL ads...");
    const sellAds = await fetchBinanceAds("BUY");
    cache.binance_sell = {
      data: sellAds,
      timestamp: Date.now(),
      error: null,
      exchange: "binance",
    };
    console.log(`✅ Binance SELL ads: ${sellAds.length} offers`);
  } catch (error) {
    cache.binance_sell.error = error.message;
    console.error("❌ Binance SELL failed:", error.message);
  }

  // OKX BUY
  try {
    console.log("Fetching OKX BUY ads...");
    const buyAds = await fetchOKXAds("SELL");
    cache.okx_buy = {
      data: buyAds,
      timestamp: Date.now(),
      error: null,
      exchange: "okx",
    };
    console.log(`✅ OKX BUY ads: ${buyAds.length} offers`);
  } catch (error) {
    cache.okx_buy.error = error.message;
    console.error("❌ OKX BUY failed:", error.message);
  }

  // OKX SELL
  try {
    console.log("Fetching OKX SELL ads...");
    const sellAds = await fetchOKXAds("BUY");
    cache.okx_sell = {
      data: sellAds,
      timestamp: Date.now(),
      error: null,
      exchange: "okx",
    };
    console.log(`✅ OKX SELL ads: ${sellAds.length} offers`);
  } catch (error) {
    cache.okx_sell.error = error.message;
    console.error("❌ OKX SELL failed:", error.message);
  }

  console.log("📊 Snapshot update complete");
}

// ============================================
// DECISION ENGINE
// ============================================
function rankOffers(ads, userAmount, isBuying) {
  const compatible = ads.filter((ad) => {
    return (
      ad.availableAmount >= userAmount &&
      ad.minLimit <= userAmount &&
      ad.maxLimit >= userAmount
    );
  });

  const scored = compatible.map((ad) => {
    let score = 0;

    // Price (40 points)
    if (isBuying) {
      const priceRank = compatible.findIndex((a) => a.price >= ad.price) + 1;
      score += (40 * (compatible.length - priceRank + 1)) / compatible.length;
    } else {
      const priceRank = compatible.findIndex((a) => a.price <= ad.price) + 1;
      score += (40 * (compatible.length - priceRank + 1)) / compatible.length;
    }

    // Completion rate (30 points)
    score += (ad.completionRate / 100) * 30;

    // Available amount buffer (15 points)
    const buffer = ad.availableAmount / userAmount;
    score += Math.min(buffer / 3, 1) * 15;

    // Total orders (15 points)
    const orderScore = Math.min(ad.totalOrders / 100, 1);
    score += orderScore * 15;

    return { ...ad, score };
  });

  return scored.sort((a, b) => b.score - a.score);
}

// ============================================
// API ENDPOINTS
// ============================================

app.get("/", (req, res) => {
  res.json({
    status: "Backend is running",
    exchanges: ["Binance", "OKX"],
    timestamp: Date.now(),
  });
});

app.get("/api/health", (req, res) => {
  const getAge = (ts) =>
    ts ? Math.floor((Date.now() - ts) / 1000) + "s" : "never";

  res.json({
    status: "ok",
    exchanges: {
      binance: {
        buy: {
          count: cache.binance_buy.data.length,
          age: getAge(cache.binance_buy.timestamp),
          error: cache.binance_buy.error,
        },
        sell: {
          count: cache.binance_sell.data.length,
          age: getAge(cache.binance_sell.timestamp),
          error: cache.binance_sell.error,
        },
      },
      okx: {
        buy: {
          count: cache.okx_buy.data.length,
          age: getAge(cache.okx_buy.timestamp),
          error: cache.okx_buy.error,
        },
        sell: {
          count: cache.okx_sell.data.length,
          age: getAge(cache.okx_sell.timestamp),
          error: cache.okx_sell.error,
        },
      },
    },
  });
});

// Manual refresh endpoint
app.post("/api/refresh", async (req, res) => {
  console.log("Manual refresh triggered");
  res.json({ status: "refresh started" });

  // Update in background
  updateSnapshots().catch((err) => {
    console.error("Manual refresh failed:", err);
  });
});

// Debug endpoint - shows detailed cache info
app.get("/api/debug", (req, res) => {
  res.json({
    cache: {
      binance_buy: {
        count: cache.binance_buy.data.length,
        timestamp: cache.binance_buy.timestamp,
        error: cache.binance_buy.error,
        sample: cache.binance_buy.data.slice(0, 2),
      },
      binance_sell: {
        count: cache.binance_sell.data.length,
        timestamp: cache.binance_sell.timestamp,
        error: cache.binance_sell.error,
        sample: cache.binance_sell.data.slice(0, 2),
      },
      okx_buy: {
        count: cache.okx_buy.data.length,
        timestamp: cache.okx_buy.timestamp,
        error: cache.okx_buy.error,
        sample: cache.okx_buy.data.slice(0, 2),
      },
      okx_sell: {
        count: cache.okx_sell.data.length,
        timestamp: cache.okx_sell.timestamp,
        error: cache.okx_sell.error,
        sample: cache.okx_sell.data.slice(0, 2),
      },
    },
  });
});

app.post("/api/search", (req, res) => {
  const { action, amount, currency } = req.body;

  if (!action || !["buy", "sell"].includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  if (!currency || !["VND", "USDT"].includes(currency)) {
    return res.status(400).json({ error: "Invalid currency" });
  }

  // Combine data from all exchanges
  const binanceKey = action === "buy" ? "binance_buy" : "binance_sell";
  const okxKey = action === "buy" ? "okx_buy" : "okx_sell";

  const allAds = [
    ...(cache[binanceKey].data || []),
    ...(cache[okxKey].data || []),
  ];

  if (allAds.length === 0) {
    // Try to update snapshots immediately
    console.log("No data available, triggering immediate update...");
    updateSnapshots()
      .then(() => {
        console.log("Snapshot update completed");
      })
      .catch((err) => {
        console.error("Snapshot update failed:", err);
      });

    return res.status(503).json({
      error: "No data available. Please try again in a few seconds.",
      details: {
        binance: cache[binanceKey].error,
        okx: cache[okxKey].error,
      },
    });
  }

  // Calculate amounts
  let usdtAmount, vndAmount;

  if (currency === "USDT") {
    usdtAmount = amount;
    const bestPrice =
      action === "buy"
        ? Math.min(...allAds.map((a) => a.price))
        : Math.max(...allAds.map((a) => a.price));
    vndAmount = usdtAmount * bestPrice;
  } else {
    vndAmount = amount;
    const bestPrice =
      action === "buy"
        ? Math.min(...allAds.map((a) => a.price))
        : Math.max(...allAds.map((a) => a.price));
    usdtAmount = vndAmount / bestPrice;
  }

  // Run decision engine
  const rankedOffers = rankOffers(allAds, usdtAmount, action === "buy");
  const top5 = rankedOffers.slice(0, 5);

  const actualReceive =
    top5.length > 0
      ? action === "buy"
        ? { usdt: usdtAmount, vnd: usdtAmount * top5[0].price }
        : { usdt: vndAmount / top5[0].price, vnd: vndAmount }
      : null;

  res.json({
    query: { action, inputAmount: amount, inputCurrency: currency },
    estimate: actualReceive,
    offers: top5.map((offer) => ({
      id: offer.id,
      exchange: offer.exchange,
      merchant: offer.merchantName,
      price: offer.price,
      available: offer.availableAmount,
      limits: { min: offer.minLimit, max: offer.maxLimit },
      completionRate: offer.completionRate.toFixed(1) + "%",
      totalOrders: offer.totalOrders,
      paymentMethods: offer.paymentMethods,
      score: offer.score.toFixed(1),
      deepLink: offer.deepLink,
    })),
    meta: {
      totalAdsAvailable: allAds.length,
      compatibleAds: rankedOffers.length,
      sources: {
        binance: cache[binanceKey].data.length,
        okx: cache[okxKey].data.length,
      },
    },
  });
});

// ============================================
// STARTUP
// ============================================
const PORT = process.env.PORT || 3001;

updateSnapshots().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Cache updates every ${CACHE_DURATION / 1000 / 60} minutes`);
  });
});

setInterval(updateSnapshots, CACHE_DURATION);

module.exports = app;
