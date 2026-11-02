import { NextResponse } from "next/server";
import {
  probeShopNKart,
  probeMarketOfChoice,
  probeAshlandCoop,
  probeAlbertsons,
} from "@/lib/probes";

// Lightweight "is there a new flyer?" endpoint. Probes all four stores in
// parallel and returns ONLY the current version markers (date strings, PDF
// filenames) - no flyer data is downloaded. The client compares these to the
// markers stored with its cached flyers and only calls the full scrape
// routes when something actually changed.
export async function POST() {
  try {
    const [shopNKart, marketOfChoice, ashlandCoop, albertsons] =
      await Promise.all([
        probeShopNKart(),
        probeMarketOfChoice(),
        probeAshlandCoop(),
        probeAlbertsons(),
      ]);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      shopNKart: {
        dateRange: shopNKart.shopNKartDate,
        ionDateRange: shopNKart.ionDate,
      },
      marketOfChoice: {
        pdfDate: marketOfChoice.pdfDate,
      },
      ashlandCoop: {
        mainFlyerFileName: ashlandCoop.mainFlyerFileName,
      },
      albertsons: {
        publicationId: albertsons?.publicationId ?? null,
      },
    });
  } catch (error) {
    console.error("Check API error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to check flyer updates",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}