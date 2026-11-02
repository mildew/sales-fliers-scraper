import { NextResponse } from "next/server";
import { getCache, updateCacheSection, isSectionStale } from "@/lib/cache";
import { probeAlbertsons } from "@/lib/probes";

export async function POST() {
  try {
    console.log("=== Albertsons Flyer API ===");

    // Get cached data from unified cache
    const cache = getCache();
    const cached = cache?.albertsons;
    console.log("Cache status:", cache ? "exists" : "empty");
    console.log("Cached publication:", cached?.publicationId);

    // Fetch the current publication metadata (small JSON request). The PDF is
    // never downloaded here - the client loads the CDN URL directly.
    const current = await probeAlbertsons();
    console.log("Current publication:", current?.publicationId);

    // Update needed when the publication id changed, the section is older than
    // the TTL (flyers are updated in place), the cache holds no usable flyer,
    // or the metadata probe failed. A failed probe with a cached entry still
    // serves the last good flyer, so transient outages never destroy it.
    const needsUpdate =
      isSectionStale(cached) ||
      !cached?.pdfUrl ||
      !current ||
      cached.publicationId !== current.publicationId;

    console.log("Needs update:", needsUpdate);

    // Fall back to the cached metadata when the probe came back empty. The
    // cache intentionally has no PDF bytes (and no page count), so the client
    // keeps using the CDN URL from the cached entry.
    const fallback = cached
      ? {
          publicationId: cached.publicationId,
          name: cached.name,
          dateRange: cached.dateRange,
          pdfUrl: cached.pdfUrl,
          pdfFileName: cached.pdfFileName,
          totalPages: 0,
        }
      : null;
    const flyer = current ?? fallback;

    if (!flyer) {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to fetch Albertsons flyer",
          timestamp: new Date().toISOString(),
          error: "Could not load the Albertsons weekly ad",
        },
        { status: 500 }
      );
    }

    // Only touch the cache when the metadata actually needs refreshing. The
    // cache helper stamps `lastUpdated` itself.
    if (current && needsUpdate) {
      updateCacheSection("albertsons", {
        publicationId: current.publicationId,
        name: current.name,
        dateRange: current.dateRange,
        pdfUrl: current.pdfUrl,
        pdfFileName: current.pdfFileName,
      });
      console.log("Cache updated");
    } else {
      console.log("✓ Albertsons flyer - serving from cache");
    }

    return NextResponse.json({
      success: true,
      message: "Flyer fetched successfully",
      timestamp: new Date().toISOString(),
      pdfUrl: flyer.pdfUrl,
      pdfFileName: flyer.pdfFileName,
      dateRange: flyer.dateRange,
      albertsonsPublicationId: flyer.publicationId,
      name: flyer.name,
      totalPages: flyer.totalPages,
      cached: !needsUpdate,
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch Albertsons flyer",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
