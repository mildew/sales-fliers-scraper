"use client";

import { useState, useEffect } from "react";
import FlyerCard from "@/components/FlyerCard";
import ImageFlyerCard from "@/components/ImageFlyerCard";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import ShoppingList from "@/app/components/ShoppingList";
import { idbGet, idbSet } from "@/lib/idb";

interface ScrapeResult {
  success: boolean;
  message: string;
  timestamp: string;
  screenshot?: string;
  error?: string;
  pdfData?: string;
  pdfUrl?: string;
  pdfFileName?: string;
  pdfDate?: string;
  mainFlyerLink?: string;
  // Shop N Kart specific fields
  flyerData?: string;
  flyerFileName?: string;
  flyerUrl?: string;
  dateRange?: string;
  // Ion flyer fields (from consolidated API)
  ionFlyerData?: string;
  ionFileName?: string;
  ionUrl?: string;
  ionDateRange?: string;
  // Albertsons specific fields
  albertsonsPublicationId?: number;
}

type StoreKey =
  | "food-coop"
  | "shop-n-kart"
  | "market-of-choice"
  | "albertsons";

const STORES: StoreKey[] = [
  "food-coop",
  "shop-n-kart",
  "market-of-choice",
  "albertsons",
];

const ACTIVE_STORE_KEYS: Record<string, StoreKey> = {
  "ashland-food-coop": "food-coop",
  "shop-n-kart": "shop-n-kart",
  "market-of-choice": "market-of-choice",
  albertsons: "albertsons",
};

const FLYER_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const flyerCache = new Map<StoreKey, { savedAt: number; data: ScrapeResult }>();

// Shape returned by /api/scrape/check - just the current version markers
// (date strings / PDF filenames), no flyer data.
interface FlyerCheck {
  shopNKart: { dateRange: string | null; ionDateRange: string | null };
  marketOfChoice: { pdfDate: string | null };
  ashlandCoop: { mainFlyerFileName: string | null };
  albertsons?: { publicationId: number | null };
}

export default function HomeContent() {
  const [activeStoreTab, setActiveStoreTab] = useState("ashland-food-coop");
  const [isLoadingFlyers, setIsLoadingFlyers] = useState(false);
  const [foodCoopResult, setFoodCoopResult] = useState<ScrapeResult | null>(
    null,
  );
  const [shopNKartResult, setShopNKartResult] = useState<ScrapeResult | null>(
    null,
  );
  const [marketOfChoiceResult, setMarketOfChoiceResult] =
    useState<ScrapeResult | null>(null);
  const [albertsonsResult, setAlbertsonsResult] =
    useState<ScrapeResult | null>(null);
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState<string | null>(null);
  const [refreshCountdown, setRefreshCountdown] = useState<string | null>(null);
  // Whether each store's visible flyer came from the local cache (vs a fresh
  // server fetch) - used for the "(from cache)" hint in the header.
  const [cachedSource, setCachedSource] = useState<
    Partial<Record<StoreKey, "cache" | "fresh">>
  >({});

  const getCacheKey = (store: StoreKey) => `flyers-cache:${store}`;

  const resultFor = (store: StoreKey): ScrapeResult | null => {
    switch (store) {
      case "food-coop":
        return foodCoopResult;
      case "shop-n-kart":
        return shopNKartResult;
      case "market-of-choice":
        return marketOfChoiceResult;
      case "albertsons":
        return albertsonsResult;
    }
  };

  // Read the persisted cache: in-memory Map first, then IndexedDB (which can
  // hold the large flyer payloads that overflow localStorage).
  const getCachedResult = async (store: StoreKey) => {
    const memoryCached = flyerCache.get(store);
    if (
      memoryCached &&
      Date.now() - memoryCached.savedAt <= FLYER_CACHE_TTL_MS
    ) {
      return memoryCached.data;
    }

    if (memoryCached) {
      flyerCache.delete(store);
    }

    try {
      const cachedItem = await idbGet<{
        savedAt: number;
        data: ScrapeResult;
      }>(getCacheKey(store));
      if (!cachedItem) {
        return null;
      }

      if (Date.now() - cachedItem.savedAt > FLYER_CACHE_TTL_MS) {
        return null;
      }

      flyerCache.set(store, {
        savedAt: cachedItem.savedAt,
        data: cachedItem.data,
      });
      return cachedItem.data;
    } catch {
      return null;
    }
  };

  const setCachedResult = async (store: StoreKey, result: ScrapeResult) => {
    const cacheEntry = { savedAt: Date.now(), data: result };
    flyerCache.set(store, cacheEntry);
    await idbSet(getCacheKey(store), cacheEntry);
  };

  const applyStoreResult = (store: StoreKey, result: ScrapeResult | null) => {
    switch (store) {
      case "food-coop":
        setFoodCoopResult(result);
        return;
      case "shop-n-kart":
        setShopNKartResult(result);
        return;
      case "market-of-choice":
        setMarketOfChoiceResult(result);
        return;
      case "albertsons":
        setAlbertsonsResult(result);
        return;
    }
  };

  const formatLastUpdated = (timestamp?: string) => {
    if (!timestamp) {
      return null;
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return `Last updated ${date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  };

  const formatRefreshCountdown = (timestamp?: string) => {
    if (!timestamp) {
      return null;
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    const expiresAt = date.getTime() + FLYER_CACHE_TTL_MS;
    const remainingMs = expiresAt - Date.now();

    if (remainingMs <= 0) {
      return "Refresh available now";
    }

    const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
    const remainingMinutes = Math.floor(
      (remainingMs % (1000 * 60 * 60)) / (1000 * 60),
    );

    if (remainingHours > 0) {
      return `${remainingHours}h ${remainingMinutes}m until refresh`;
    }

    return `${remainingMinutes}m until refresh`;
  };

  // A successful flyer result is "fresh" until its recorded timestamp is
  // older than the TTL. Error results are never fresh so they get retried.
  const isResultFresh = (result: ScrapeResult | null) => {
    if (!result?.success || !result.timestamp) {
      return false;
    }
    const fetchedAt = new Date(result.timestamp).getTime();
    if (Number.isNaN(fetchedAt)) {
      return false;
    }
    return Date.now() - fetchedAt <= FLYER_CACHE_TTL_MS;
  };

  const paintResult = (
    store: StoreKey,
    result: ScrapeResult,
    source: "cache" | "fresh",
  ) => {
    applyStoreResult(store, result);
    setLastUpdatedLabel(formatLastUpdated(result.timestamp));
    setRefreshCountdown(formatRefreshCountdown(result.timestamp));
    setCachedSource((prev) => ({ ...prev, [store]: source }));
  };

  // Do the cached flyer's markers match what's live right now? A null marker
  // from the probe means we couldn't find it on the store's page (temporarily
  // removed, page structure changed, or a transient fetch failure). Null is
  // treated as "unknown" so we keep the cached copy instead of re-downloading
  // on every visit; the TTL still catches genuine in-place updates.
  const flyerMarkersMatch = (
    store: StoreKey,
    check: FlyerCheck,
    result: ScrapeResult,
  ) => {
    if (store === "food-coop") {
      const main = check.ashlandCoop.mainFlyerFileName;
      return (
        main === null || (result.pdfFileName ?? null) === main
      );
    }
    if (store === "shop-n-kart") {
      return (
        (check.shopNKart.dateRange === null ||
          (result.dateRange ?? null) === check.shopNKart.dateRange) &&
        (check.shopNKart.ionDateRange === null ||
          (result.ionDateRange ?? null) === check.shopNKart.ionDateRange)
      );
    }
    if (store === "market-of-choice") {
      return (
        check.marketOfChoice.pdfDate === null ||
        (result.pdfDate ?? null) === check.marketOfChoice.pdfDate
      );
    }
    const liveId = check.albertsons?.publicationId ?? null;
    return (
      liveId === null || (result.albertsonsPublicationId ?? null) === liveId
    );
  };

  // Cheap "is there a new flyer?" probe - returns current markers only.
  const fetchFlyerCheck = async (): Promise<FlyerCheck | null> => {
    try {
      const response = await fetch("/api/scrape/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return data.success ? (data as FlyerCheck) : null;
    } catch {
      return null;
    }
  };

  const fetchStoreData = async (store: StoreKey): Promise<ScrapeResult> => {
    if (store === "food-coop") {
      const response = await fetch(
        `/api/scrape/ashland-coop?t=${Date.now()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        },
      );
      return await response.json();
    }
    if (store === "shop-n-kart") {
      const response = await fetch(
        `/api/scrape/shop-n-kart?t=${Date.now()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        },
      );
      return await response.json();
    }
    if (store === "albertsons") {
      const response = await fetch(
        `/api/scrape/albertsons?t=${Date.now()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        },
      );
      return await response.json();
    }
    const response = await fetch(
      `/api/scrape/market-of-choice?t=${Date.now()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      },
    );
    return await response.json();
  };

  // Ensure a store's flyer is current. Skip the server entirely when the
  // cached copy is fresh and (when a check is available) still matches the
  // live markers. Download the full flyer only when it actually changed,
  // the cache is missing, or it's older than the TTL.
  const loadStoreFlyers = async (
    store: StoreKey,
    check?: FlyerCheck | null,
  ) => {
    const current = resultFor(store);

    // Fast path: fresh in-memory result that still matches the markers we
    // were given (or no check supplied = plain tab switch) - nothing to
    // download. A null/absent check skips the marker comparison.
    if (
      current &&
      isResultFresh(current) &&
      (check === undefined || (check && flyerMarkersMatch(store, check, current)))
    ) {
      paintResult(
        store,
        current,
        cachedSource[store] ?? "cache",
      );
      return;
    }

    setIsLoadingFlyers(true);
    try {
      const base = current ?? (await getCachedResult(store));
      const resolvedCheck =
        check !== undefined ? check : await fetchFlyerCheck();
      const sameVersion =
        !!base &&
        isResultFresh(base) &&
        (!resolvedCheck || flyerMarkersMatch(store, resolvedCheck, base));

      if (sameVersion) {
        paintResult(store, base, "cache");
        return;
      }

      const fresh = await fetchStoreData(store);
      if (fresh.success) {
        paintResult(store, fresh, "fresh");
        void setCachedResult(store, fresh);
      } else if (base) {
        // Server had a problem; keep showing the last known good flyer.
        paintResult(store, base, "cache");
      } else {
        paintResult(store, fresh, "fresh");
      }
    } catch (error) {
      // Only surface an error screen when there's nothing cached at all.
      if (!resultFor(store)) {
        const fallbackError: ScrapeResult = {
          success: false,
          message: "Failed to connect",
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : "Unknown error",
        };
        paintResult(store, fallbackError, "fresh");
      }
    } finally {
      setIsLoadingFlyers(false);
    }
  };

  // Auto-load all stores on mount: paint whatever is cached instantly, then
  // run one cheap marker check and download only what changed.
  useEffect(() => {
    const loadAll = async () => {
      setIsLoadingFlyers(true);
      try {
        const cached = await Promise.all(STORES.map(getCachedResult));
        cached.forEach((result, i) => {
          if (result) {
            paintResult(STORES[i], result, "cache");
          }
        });

        const check = await fetchFlyerCheck();
        await Promise.all(STORES.map((s) => loadStoreFlyers(s, check)));
      } catch (error) {
        const fallbackError: ScrapeResult = {
          success: false,
          message: "Failed to connect",
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : "Unknown error",
        };
        STORES.forEach((store) => {
          if (!resultFor(store)) {
            paintResult(store, fallbackError, "fresh");
          }
        });
        setLastUpdatedLabel(formatLastUpdated(fallbackError.timestamp));
        setRefreshCountdown(formatRefreshCountdown(fallbackError.timestamp));
      } finally {
        setIsLoadingFlyers(false);
      }
    };

    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After switching to a store that's only showing cached data, quietly
  // re-validate it in the background: cheap marker check, and only download
  // the full flyer if a new version actually appeared.
  useEffect(() => {
    const store = ACTIVE_STORE_KEYS[activeStoreTab];
    const current = resultFor(store);
    if (
      !current ||
      !isResultFresh(current) ||
      cachedSource[store] !== "cache"
    ) {
      return;
    }
    // Defer so the effect itself never sets state synchronously.
    const timer = setTimeout(() => {
      void loadStoreFlyers(store, null);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStoreTab]);

  function onPdfError(error: Error): void {
    console.error("PDF rendering error:", error);
  }

  const activeStoreKey = ACTIVE_STORE_KEYS[activeStoreTab];
  const showingFromCache = cachedSource[activeStoreKey] === "cache";

  return (
    <div className="min-h-screen py-8 px-3 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="flex justify-between items-center mb-8">
          <div className="flex-1">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Grocery Deals/List
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-lg">
              Deals &amp; shopping list, together.
            </p>
          </div>
          <div className="ml-4 shrink-0">
            <ThemeToggle />
          </div>
        </header>

        {/* Page Tabs: Deals / Shopping List */}
        <Tabs defaultValue="deals" className="flex flex-col">
          <TabsList className="w-fit mb-6">
            <TabsTrigger value="deals" className="flex items-center gap-1.5">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              Find Deals
            </TabsTrigger>
            <TabsTrigger value="list" className="flex items-center gap-1.5">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              Shopping List
            </TabsTrigger>
          </TabsList>

          <TabsContent value="deals" className="mt-0">
            <section>
              <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                {/* Header bar */}
                <div className="border-b border-border/60 px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-card-foreground">
                      Available Flyers by Store
                    </h2>
                    {isLoadingFlyers && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Loading flyers...
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-0.5 text-right shrink-0">
                    {lastUpdatedLabel && (
                      <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">
                        {lastUpdatedLabel}
                        {showingFromCache ? " · from cache" : ""}
                      </span>
                    )}
                    {refreshCountdown && (
                      <span className="text-[11px] text-muted-foreground/50">
                        {refreshCountdown}
                      </span>
                    )}
                  </div>
                </div>

                <Tabs
                  value={activeStoreTab}
                  onValueChange={(value) => {
                    setActiveStoreTab(value);
                    void loadStoreFlyers(ACTIVE_STORE_KEYS[value]);
                  }}
                  className="flex flex-col"
                >
                  <div className="px-5 pt-5">
                    {/* Four store tabs no longer fit on one row on phones and
                        the card clips overflow, so let the list wrap instead
                        of scrolling the last store out of reach. */}
                    <TabsList className="h-auto w-fit max-w-full flex-wrap gap-1">
                      <TabsTrigger value="ashland-food-coop">
                        Ashland Food Coop
                      </TabsTrigger>
                      <TabsTrigger value="shop-n-kart">Shop N Kart</TabsTrigger>
                      <TabsTrigger value="market-of-choice">
                        Market of Choice
                      </TabsTrigger>
                      <TabsTrigger value="albertsons">Albertsons</TabsTrigger>
                    </TabsList>
                  </div>

                  <div className="p-5">
                    <TabsContent
                      value="ashland-food-coop"
                      className="mt-0 space-y-4"
                    >
                      {isLoadingFlyers && !foodCoopResult ? (
                        <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading Ashland Food Coop flyers...
                          </div>
                        </div>
                      ) : foodCoopResult?.error ? (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                          {foodCoopResult.error}
                        </div>
                      ) : foodCoopResult?.pdfData ? (
                        <div className="grid grid-cols-1 gap-4">
                          <FlyerCard
                            title="Ashland Food Coop Flyer"
                            description="Main weekly sales flyer from Ashland Food Coop"
                            pdfData={foodCoopResult.pdfData}
                            pdfFileName={foodCoopResult.pdfFileName}
                            url={foodCoopResult.mainFlyerLink}
                            onPdfError={onPdfError}
                          />
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                          No flyers are available yet for this store.
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="shop-n-kart" className="mt-0 space-y-4">
                      {isLoadingFlyers && !shopNKartResult ? (
                        <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading Shop N Kart flyers...
                          </div>
                        </div>
                      ) : shopNKartResult?.error ? (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                          {shopNKartResult.error}
                        </div>
                      ) : shopNKartResult?.flyerData ||
                        shopNKartResult?.ionFlyerData ? (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          {shopNKartResult.flyerData && (
                            <ImageFlyerCard
                              title="Shop N Kart Flyer"
                              description="Shop N Kart weekly deals and special offers"
                              imageData={shopNKartResult.flyerData}
                              imageFileName={shopNKartResult.flyerFileName}
                              url={shopNKartResult.flyerUrl}
                              dateRange={shopNKartResult.dateRange}
                            />
                          )}
                          {shopNKartResult.ionFlyerData && (
                            <ImageFlyerCard
                              title="Ion Flyer"
                              description="Ion deals and special offers"
                              imageData={shopNKartResult.ionFlyerData}
                              imageFileName={shopNKartResult.ionFileName}
                              url={shopNKartResult.ionUrl}
                              dateRange={shopNKartResult.ionDateRange}
                            />
                          )}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                          No flyers are available yet for this store.
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent
                      value="market-of-choice"
                      className="mt-0 space-y-4"
                    >
                      {isLoadingFlyers && !marketOfChoiceResult ? (
                        <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading Market of Choice flyers...
                          </div>
                        </div>
                      ) : marketOfChoiceResult?.error ? (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                          {marketOfChoiceResult.error}
                        </div>
                      ) : marketOfChoiceResult?.pdfData ? (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <FlyerCard
                            title="Market of Choice"
                            description="Weekly deals and specials"
                            pdfData={marketOfChoiceResult.pdfData}
                            pdfFileName={marketOfChoiceResult.pdfFileName}
                            dateRange={
                              marketOfChoiceResult.dateRange || "Current Week"
                            }
                            url="https://marketofchoice.com/specials/weekly/"
                            onPdfError={onPdfError}
                          />
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                          No flyers are available yet for this store.
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="albertsons" className="mt-0 space-y-4">
                      {isLoadingFlyers && !albertsonsResult ? (
                        <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading Albertsons flyers...
                          </div>
                        </div>
                      ) : albertsonsResult?.error ? (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                          {albertsonsResult.error}
                        </div>
                      ) : albertsonsResult?.pdfUrl ? (
                        <div className="grid grid-cols-1 gap-4">
                          <FlyerCard
                            title="Albertsons Weekly Ad"
                            description="Weekly deals and specials from Albertsons"
                            pdfUrl={albertsonsResult.pdfUrl}
                            pdfFileName={albertsonsResult.pdfFileName}
                            dateRange={albertsonsResult.dateRange}
                            url="https://www.albertsons.com/weeklyad"
                            onPdfError={onPdfError}
                          />
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                          No flyers are available yet for this store.
                        </div>
                      )}
                    </TabsContent>
                  </div>
                </Tabs>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="list" className="mt-0">
            <ShoppingList />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}