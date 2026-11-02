// Lightweight "is there a new flyer?" probes. These only fetch the small
// HTML pages / issue cheap HEAD requests to extract the current version
// markers (date strings, PDF filenames) - they NEVER download the flyers
// themselves. The client uses them to decide whether a cached flyer is
// still current, so page reloads don't re-download multi-MB flyers.
const PROBE_TIMEOUT_MS = 10_000;

async function probeFetch(
  url: string,
  init?: RequestInit
): Promise<Response | null> {
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("Probe fetch failed:", url, error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shop N Kart (weekly) + Ion (monthly) flyers on ashlandshopnkart.com
// ---------------------------------------------------------------------------

export function extractShopNKartDates(html: string): {
  shopNKartDate: string | null;
  ionDate: string | null;
} {
  // Shop N Kart weekly date: "December 3-9 2025"
  const weeklyPattern =
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})-(\d{1,2})\s+(\d{4})/i;
  const weeklyMatch = html.match(weeklyPattern);
  let shopNKartDate = null;
  if (weeklyMatch) {
    const [, month, startDay, endDay] = weeklyMatch;
    const monthAbbr = month.slice(0, 3);
    shopNKartDate = `${monthAbbr} ${startDay} – ${monthAbbr} ${endDay}`;
  }

  // Ion monthly date: "December 2025" from xr_s36 span
  const monthlyPattern =
    /<span class="Normal_text xr_s36"[^>]*>([A-Za-z]+\s+\d{4})<\/span>/;
  const monthlyMatch = html.match(monthlyPattern);
  let ionDate = monthlyMatch ? monthlyMatch[1] : null;

  // Fallback for ion date
  if (!ionDate) {
    const fallbackPattern =
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/g;
    const allMatches = html.match(fallbackPattern);
    if (allMatches && allMatches.length > 0) {
      ionDate = allMatches[allMatches.length - 1];
    }
  }

  return { shopNKartDate, ionDate };
}

export async function probeShopNKart(): Promise<{
  shopNKartDate: string | null;
  ionDate: string | null;
}> {
  const response = await probeFetch("https://ashlandshopnkart.com/");
  if (!response || !response.ok) {
    return { shopNKartDate: null, ionDate: null };
  }
  return extractShopNKartDates(await response.text());
}

// ---------------------------------------------------------------------------
// Market of Choice weekly PDF
// ---------------------------------------------------------------------------

// Extract date from PDF URL like:
// https://static.marketofchoice.com/uploads/2025/12/2025-12-05-MoC-Weekly-Specials.pdf
export function extractMoCDateFromUrl(url: string): string | null {
  const match = url.match(/(\d{4}-\d{2}-\d{2})-MoC/);
  return match ? match[1] : null;
}

export async function probeMarketOfChoice(): Promise<{
  pdfDate: string | null;
}> {
  // HEAD request - cheap, no body. We compare the date in the final
  // redirect URL to the marker stored with the cached flyer.
  const response = await probeFetch(
    "https://marketofchoice.com/download-weekly-specials",
    { method: "HEAD", redirect: "follow" }
  );
  if (!response || !response.ok) {
    return { pdfDate: null };
  }
  return { pdfDate: extractMoCDateFromUrl(response.url) };
}

// ---------------------------------------------------------------------------
// Ashland Food Co-op PDFs
// ---------------------------------------------------------------------------

const COOP_BASE_URL = "https://ashlandfood.coop";
// The sales page moved from /sales-flyer to /sales (the old path still 301s,
// but point at the canonical URL so we don't depend on the redirect).
const COOP_SALES_URL = `${COOP_BASE_URL}/sales`;

function toAbsoluteCoopUrl(url: string): string {
  return url.startsWith("http") ? url : COOP_BASE_URL + url;
}

export function extractCoopPdfLinks(html: string): {
  mainFlyerLink: string | null;
} {
  // The current flyer is embedded in a pdf.js viewer iframe and exposed as
  // data-src. Do NOT scan <a href> first: the only plain link on the page is
  // "Download Previous Week's Flyer", so an href scan silently served last
  // week's PDF (two different files whose first pages look identical).
  const dataSrcMatch = html.match(
    /data-src="([^"]*\/sites\/default\/files\/sales-flyers\/[^"]+\.pdf)"/i
  );
  if (dataSrcMatch) {
    return { mainFlyerLink: toAbsoluteCoopUrl(dataSrcMatch[1]) };
  }

  // Fallback: the viewer's own file= parameter, URL-encoded once.
  const viewerMatch = html.match(/viewer\.html\?[^"']*?file=([^&"']+)/i);
  if (viewerMatch) {
    let decoded = viewerMatch[1];
    try {
      decoded = decodeURIComponent(decoded);
    } catch (error) {
      console.error("Failed to decode Co-op flyer viewer URL:", error);
    }
    if (/\/sites\/default\/files\/sales-flyers\/[^"']+\.pdf/i.test(decoded)) {
      return { mainFlyerLink: toAbsoluteCoopUrl(decoded) };
    }
  }

  // Legacy markup: a bare link straight to the flyer PDF.
  const mainFlyerMatch = html.match(
    /href="((?:https:\/\/ashlandfood\.coop)?\/sites\/default\/files\/sales-flyers\/[^"]+\.pdf)"/i
  );
  return {
    mainFlyerLink: mainFlyerMatch ? toAbsoluteCoopUrl(mainFlyerMatch[1]) : null,
  };
}

export function extractFilename(url: string): string {
  const urlFileName = url.split("/").pop() || "flyer.pdf";
  return decodeURIComponent(urlFileName);
}

export async function probeAshlandCoop(): Promise<{
  mainFlyerLink: string | null;
  mainFlyerFileName: string | null;
}> {
  const response = await probeFetch(COOP_SALES_URL);
  if (!response || !response.ok) {
    return { mainFlyerLink: null, mainFlyerFileName: null };
  }
  const { mainFlyerLink } = extractCoopPdfLinks(await response.text());
  return {
    mainFlyerLink,
    mainFlyerFileName: mainFlyerLink ? extractFilename(mainFlyerLink) : null,
  };
}

// ---------------------------------------------------------------------------
// Albertsons weekly ad (Angular SPA backed by Flipp's public Flyerkit API)
// ---------------------------------------------------------------------------

const ALBERTSONS_POSTAL_CODE = process.env.ALBERTSONS_POSTAL_CODE ?? "97520";
const FLYERKIT_ACCESS_TOKEN = "bfe2071d14d1448296a13b19311ce041";

// Raw shape of the publications endpoint. Only the fields we use are declared;
// everything is optional because a degraded response may omit any of them.
export interface FlyerkitPublication {
  id?: number;
  name?: string;
  flyer_type?: string;
  external_display_name?: string;
  valid_from?: string;
  valid_to?: string;
  pdf_url?: string;
  total_pages?: number;
}

export interface AlbertsonsPublication {
  publicationId: number;
  name: string;
  dateRange: string;
  pdfUrl: string;
  pdfFileName: string;
  totalPages: number;
}

const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Build a flyer date range like "Oct 28 – Nov 3, 2026" from the ISO validity
// timestamps. Only the YYYY-MM-DD prefix is parsed with a regex - reading a
// full Date through local getters would shift the day in timezones on either
// side of the offset. Returns "" when either date cannot be parsed.
export function formatAlbertsonsDateRange(
  validFrom: string,
  validTo: string
): string {
  const fromMatch = validFrom.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const toMatch = validTo.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!fromMatch || !toMatch) {
    return "";
  }

  const fromMonth = Number(fromMatch[2]);
  const fromDay = Number(fromMatch[3]);
  const toMonth = Number(toMatch[2]);
  const toDay = Number(toMatch[3]);
  if (
    fromMonth < 1 ||
    fromMonth > 12 ||
    fromDay < 1 ||
    fromDay > 31 ||
    toMonth < 1 ||
    toMonth > 12 ||
    toDay < 1 ||
    toDay > 31
  ) {
    return "";
  }

  const year = toMatch[1];
  return `${MONTH_ABBREVIATIONS[fromMonth - 1]} ${fromDay} – ${
    MONTH_ABBREVIATIONS[toMonth - 1]
  } ${toDay}, ${year}`;
}

// Pick the actual weekly ad out of the publication list. The API also returns
// ad-hoc publications (e.g. "Big Book of Savings"); prefer the entry explicitly
// labelled "Weekly Ad", then any non-adhoc flyer, then whatever is left.
export function pickAlbertsonsWeeklyAd(
  pubs: FlyerkitPublication[]
): FlyerkitPublication | null {
  if (!Array.isArray(pubs) || pubs.length === 0) {
    return null;
  }

  // We need both an id (the cache marker) and a PDF URL (what the client
  // loads), so entries missing either are unusable.
  const usable = pubs.filter(
    (pub) =>
      typeof pub.id === "number" &&
      typeof pub.pdf_url === "string" &&
      pub.pdf_url.length > 0
  );
  if (usable.length === 0) {
    return null;
  }

  const weeklyAd = usable.find(
    (pub) => pub.external_display_name === "Weekly Ad"
  );
  if (weeklyAd) {
    return weeklyAd;
  }

  const nonAdhoc = usable.find(
    (pub) => !(pub.flyer_type ?? "").toLowerCase().includes("adhoc")
  );
  return nonAdhoc ?? usable[0];
}

export async function probeAlbertsons(): Promise<AlbertsonsPublication | null> {
  const params = new URLSearchParams({
    access_token: FLYERKIT_ACCESS_TOKEN,
    locale: "en-US",
    postal_code: ALBERTSONS_POSTAL_CODE,
  });
  const response = await probeFetch(
    `https://api.flipp.com/flyerkit/v4.0/publications/albertsons?${params.toString()}`
  );
  if (!response || !response.ok) {
    return null;
  }

  let publications: FlyerkitPublication[];
  try {
    publications = await response.json();
  } catch (error) {
    console.error("Failed to parse Albertsons publications:", error);
    return null;
  }

  const publication = pickAlbertsonsWeeklyAd(publications);
  if (!publication || publication.id === undefined || !publication.pdf_url) {
    return null;
  }

  const validFrom = publication.valid_from ?? "";
  const dateRange = formatAlbertsonsDateRange(
    validFrom,
    publication.valid_to ?? ""
  );

  return {
    publicationId: publication.id,
    name:
      publication.name ??
      publication.external_display_name ??
      "Albertsons Weekly Ad",
    dateRange,
    pdfUrl: publication.pdf_url,
    pdfFileName: `albertsons-weekly-ad-${validFrom.slice(0, 10)}.pdf`,
    totalPages: publication.total_pages ?? 0,
  };
}
