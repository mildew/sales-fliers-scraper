"use client";

import { useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import PDFViewer from "@/app/components/PDFViewer";
import { Button } from "./ui/button";
import { X } from "lucide-react";

interface FlyerCardProps {
  title: string;
  description: string;
  pdfData?: string;
  pdfUrl?: string;
  pdfFileName?: string;
  url?: string;
  dateRange?: string;
  onDocumentLoadSuccess?: (numPages: number) => void;
  onPdfError?: (error: Error) => void;
}

export default function FlyerCard({
  title,
  description,
  pdfData,
  pdfUrl,
  pdfFileName,
  url,
  dateRange,
  onDocumentLoadSuccess,
  onPdfError,
}: FlyerCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pdfSource = pdfData ?? pdfUrl;

  // Extract date from URL or filename
  const extractDateFromUrl = (url?: string): string | null => {
    if (!url) return null;

    // Handle "Month X to Month Y" pattern (e.g., "December%203%20to%20December%209")
    const monthRangePattern =
      /(January|February|March|April|May|June|July|August|September|October|November|December)%20(\d{1,2})%20to%20(January|February|March|April|May|June|July|August|September|October|November|December)%20(\d{1,2})/;
    const monthRangeMatch = url.match(monthRangePattern);
    if (monthRangeMatch) {
      const [, startMonth, startDay, endMonth, endDay] = monthRangeMatch;
      const startMonthAbbr = startMonth.slice(0, 3);
      const endMonthAbbr = endMonth.slice(0, 3);
      return `${startMonthAbbr} ${startDay} – ${endMonthAbbr} ${endDay}`;
    }

    // Handle single month with range (e.g., "December%203%20to%209")
    const singleMonthRangePattern =
      /(January|February|March|April|May|June|July|August|September|October|November|December)%20(\d{1,2})%20to%20(\d{1,2})/;
    const singleMonthRangeMatch = url.match(singleMonthRangePattern);
    if (singleMonthRangeMatch) {
      const [, month, startDay, endDay] = singleMonthRangeMatch;
      const monthAbbr = month.slice(0, 3);
      return `${monthAbbr} ${startDay} – ${monthAbbr} ${endDay}`;
    }

    // Common date patterns in URLs
    const datePatterns = [
      /\d{4}-\d{2}-\d{2}/, // YYYY-MM-DD
      /\d{2}-\d{2}-\d{4}/, // MM-DD-YYYY
      /\d{2}\/\d{2}\/\d{4}/, // MM/DD/YYYY
      /\d{4}\/\d{2}\/\d{2}/, // YYYY/MM/DD
      /\d{8}/, // YYYYMMDD
    ];

    for (const pattern of datePatterns) {
      const match = url.match(pattern);
      if (match) {
        const dateStr = match[0];
        // Try to parse and format the date
        let formattedDate: string;

        if (dateStr.includes("-")) {
          formattedDate = dateStr; // Already in readable format
        } else if (dateStr.includes("/")) {
          formattedDate = dateStr; // Already in readable format
        } else if (dateStr.length === 8) {
          // YYYYMMDD format
          formattedDate = `${dateStr.slice(0, 4)}-${dateStr.slice(
            4,
            6,
          )}-${dateStr.slice(6, 8)}`;
        } else {
          formattedDate = dateStr;
        }

        return formattedDate;
      }
    }

    return null;
  };

  // Extract date from filename as fallback
  const extractDateFromFilename = (filename?: string): string | null => {
    if (!filename) return null;

    // Decode URL-encoded filename
    const decodedFilename = decodeURIComponent(filename);

    // Handle "Month X to Month Y" pattern in filename (e.g., "December 3 to December 9")
    const monthRangePattern =
      /(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}) to (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2})/i;
    const monthRangeMatch = decodedFilename.match(monthRangePattern);
    if (monthRangeMatch) {
      const [, startMonth, startDay, endMonth, endDay] = monthRangeMatch;
      const startMonthAbbr = startMonth.slice(0, 3);
      const endMonthAbbr = endMonth.slice(0, 3);
      return `${startMonthAbbr} ${startDay} – ${endMonthAbbr} ${endDay}`;
    }

    // Handle single month with range (e.g., "December 3 to 9")
    const singleMonthRangePattern =
      /(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}) to (\d{1,2})/i;
    const singleMonthRangeMatch = decodedFilename.match(
      singleMonthRangePattern,
    );
    if (singleMonthRangeMatch) {
      const [, month, startDay, endDay] = singleMonthRangeMatch;
      const monthAbbr = month.slice(0, 3);
      return `${monthAbbr} ${startDay} – ${monthAbbr} ${endDay}`;
    }

    // Common date patterns in filenames
    const datePatterns = [
      /\d{4}-\d{2}-\d{2}/, // YYYY-MM-DD
      /\d{2}-\d{2}-\d{4}/, // MM-DD-YYYY
      /\d{2}\/\d{2}\/\d{4}/, // MM/DD/YYYY
      /\d{4}\/\d{2}\/\d{2}/, // YYYY/MM/DD
      /\d{8}/, // YYYYMMDD
    ];

    for (const pattern of datePatterns) {
      const match = decodedFilename.match(pattern);
      if (match) {
        const dateStr = match[0];
        // Try to parse and format the date
        let formattedDate: string;

        if (dateStr.includes("-")) {
          formattedDate = dateStr; // Already in readable format
        } else if (dateStr.includes("/")) {
          formattedDate = dateStr; // Already in readable format
        } else if (dateStr.length === 8) {
          // YYYYMMDD format
          formattedDate = `${dateStr.slice(0, 4)}-${dateStr.slice(
            4,
            6,
          )}-${dateStr.slice(6, 8)}`;
        } else {
          formattedDate = dateStr;
        }

        return formattedDate;
      }
    }

    return null;
  };

  const extractedDate =
    dateRange ||
    extractDateFromUrl(url) ||
    extractDateFromFilename(pdfFileName);

  return (
    <>
      <div
        className="group relative bg-card hover:shadow-xl hover:shadow-black/3 dark:hover:shadow-black/15 transition-all duration-300 ease-out hover:-translate-y-1 rounded-xl border border-border/50 overflow-hidden cursor-pointer"
        onClick={() => setIsOpen(true)}
      >
        <div className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold text-base text-card-foreground leading-snug group-hover:text-primary transition-colors">
              {title}
            </h3>
            {extractedDate && (
              <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors border-transparent bg-secondary text-secondary-foreground whitespace-nowrap shrink-0">
                {extractedDate}
              </span>
            )}
          </div>

          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {description}
          </p>

          <div className="pt-1 flex items-center gap-1.5 text-xs font-medium text-primary/70 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0 duration-300">
            <span>Click to view</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          showCloseButton={false}
          className="w-screen h-[calc(100vh-2rem)] max-w-none gap-0! my-3 overflow-hidden p-0! flex flex-col bg-background/95 backdrop-blur-sm border-none shadow-2xl rounded-xl"
        >
          <div className="px-5 py-3.5 border-b border-border/60 flex items-center gap-4 bg-background/70 backdrop-blur-md z-10 sticky top-0">
            <DialogTitle className="text-base font-semibold tracking-tight text-foreground/90 truncate flex-1">
              {title}
            </DialogTitle>
            {extractedDate && (
              <span className="text-[11px] font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-md shrink-0">
                {extractedDate}
              </span>
            )}
            <DialogClose asChild>
              <Button
                variant="secondary"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full shadow-sm hover:bg-accent"
                aria-label="Close flyer"
                title="Close (Esc)"
              >
                <X className="h-5 w-5" />
              </Button>
            </DialogClose>
          </div>
          <div className="h-[calc(100vh-10rem)]">
            {pdfSource ? (
              <PDFViewer
                file={pdfSource}
                onDocumentLoadSuccess={onDocumentLoadSuccess}
                onError={onPdfError}
                onClose={() => setIsOpen(false)}
              />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                PDF not available
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
