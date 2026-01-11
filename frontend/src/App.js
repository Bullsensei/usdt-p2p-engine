import React, { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Search,
  AlertCircle,
  ExternalLink,
  Shield,
  Clock,
} from "lucide-react";

export default function P2PComparison() {
  const [action, setAction] = useState("buy");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USDT");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
      console.log("API_URL:", API_URL);
      console.log("Searching with:", {
        action,
        amount: parseFloat(amount),
        currency,
      });

      const response = await fetch(`${API_URL}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, amount: parseFloat(amount), currency }),
      });

      console.log("Response status:", response.status);

      if (!response.ok) {
        const err = await response.json();
        console.error("API Error:", err);
        throw new Error(err.error || "Search failed");
      }

      const data = await response.json();
      console.log("Search results:", data);
      setResults(data);
    } catch (err) {
      console.error("Search error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  const formatNumber = (num) => {
    return new Intl.NumberFormat("vi-VN").format(num);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                USDT P2P Comparison
              </h1>
              <p className="text-sm text-slate-600">
                Find the best P2P offers in seconds
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Disclaimer */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <strong>Educational Tool:</strong> This is a price comparison tool,
            not an exchange. We do not handle payments or custody. Always verify
            offers on the exchange before trading.
          </div>
        </div>

        {/* Search Panel */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Buy/Sell Toggle */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                I want to
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setAction("buy")}
                  className={`flex-1 py-3 rounded-lg font-medium transition-all ${
                    action === "buy"
                      ? "bg-green-600 text-white shadow-md"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Buy USDT
                  </div>
                </button>
                <button
                  onClick={() => setAction("sell")}
                  className={`flex-1 py-3 rounded-lg font-medium transition-all ${
                    action === "sell"
                      ? "bg-red-600 text-white shadow-md"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <TrendingDown className="w-4 h-4" />
                    Sell USDT
                  </div>
                </button>
              </div>
            </div>

            {/* Amount Input */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Amount
              </label>
              <div className="flex gap-3">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="px-4 py-3 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="USDT">USDT</option>
                  <option value="VND">VND</option>
                </select>
              </div>
            </div>
          </div>

          <button
            onClick={handleSearch}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Search className="w-5 h-5" />
            {loading ? "Searching..." : "Find Best Offers"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div className="text-sm text-red-800">{error}</div>
          </div>
        )}

        {/* Results */}
        {results && (
          <>
            {/* Estimate */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg p-6 mb-6 text-white">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-5 h-5" />
                <span className="font-medium">Best Estimated Rate</span>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-sm opacity-90">
                    You {action === "buy" ? "pay" : "receive"}
                  </div>
                  <div className="text-3xl font-bold">
                    {action === "buy"
                      ? `${formatNumber(results.estimate?.output?.pay || 0)} ${
                          results.estimate?.output?.payCurrency
                        }`
                      : `${formatNumber(
                          results.estimate?.output?.receive || 0
                        )} ${results.estimate?.output?.receiveCurrency}`}
                  </div>
                </div>
                <div>
                  <div className="text-sm opacity-90">
                    You {action === "buy" ? "receive" : "pay"}
                  </div>
                  <div className="text-3xl font-bold">
                    {action === "buy"
                      ? `${(results.estimate?.output?.receive || 0).toFixed(
                          2
                        )} ${results.estimate?.output?.receiveCurrency}`
                      : `${formatNumber(results.estimate?.output?.pay || 0)} ${
                          results.estimate?.output?.payCurrency
                        }`}
                  </div>
                </div>
              </div>
              {results.meta?.isStale && (
                <div className="mt-4 flex items-center gap-2 text-sm bg-white/20 rounded px-3 py-2">
                  <Clock className="w-4 h-4" />
                  Data is {results.meta.dataAge} old - prices may have changed
                  slightly
                </div>
              )}
            </div>

            {/* Offers */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">
                  Top {results.offers.length} Offers
                </h2>
                <div className="text-sm text-slate-600">
                  {results.meta?.compatibleAds} compatible out of{" "}
                  {results.meta?.totalAdsAvailable} total
                </div>
              </div>

              {results.offers.map((offer, index) => (
                <div
                  key={offer.id}
                  className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow border-2 border-transparent hover:border-blue-200"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                          index === 0
                            ? "bg-yellow-500"
                            : index === 1
                            ? "bg-slate-400"
                            : index === 2
                            ? "bg-amber-600"
                            : "bg-slate-300"
                        }`}
                      >
                        #{index + 1}
                      </div>
                      <div>
                        <div className="font-semibold text-lg text-slate-900">
                          {offer.merchant}
                        </div>
                        <div className="text-sm text-slate-600">
                          {offer.totalOrders} orders • {offer.completionRate}{" "}
                          completion
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-slate-900">
                        {formatNumber(offer.price)}
                      </div>
                      <div className="text-sm text-slate-600">VND/USDT</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
                    <div>
                      <div className="text-slate-600">Available</div>
                      <div className="font-medium text-slate-900">
                        {offer.available.toFixed(2)} USDT
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-600">Min - Max</div>
                      <div className="font-medium text-slate-900">
                        {formatNumber(offer.limits.min.toFixed(0))} -{" "}
                        {formatNumber(offer.limits.max.toFixed(0))}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-600">Exchange</div>
                      <div className="font-medium text-blue-600">
                        {offer.exchange}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    {offer.paymentMethods.map((method) => (
                      <span
                        key={method}
                        className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium"
                      >
                        {method}
                      </span>
                    ))}
                  </div>

                  <a
                    href={offer.deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full bg-slate-900 text-white py-3 rounded-lg font-medium hover:bg-slate-800 transition-colors text-center"
                  >
                    <span className="flex items-center justify-center gap-2">
                      View on {offer.exchange}
                      <ExternalLink className="w-4 h-4" />
                    </span>
                  </a>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Footer Info */}
        {!results && !loading && (
          <div className="text-center py-12">
            <div className="inline-block p-6 bg-white rounded-full mb-4 shadow-md">
              <Search className="w-12 h-12 text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              Ready to Compare?
            </h3>
            <p className="text-slate-600 max-w-md mx-auto">
              Enter your amount and we'll find the best P2P offers for you. Our
              decision engine considers price, reputation, and availability.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
