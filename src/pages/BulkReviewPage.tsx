import { ChangeEvent, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  FileDown,
  Download,
  FileSpreadsheet,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import Reveal from "@/components/storefront/Reveal";
import { useProducts } from "@/lib/shopify-data";
import { getRuntimeContext, getShopBaseOrigin } from "@/lib/theme-assets";
import { toast } from "sonner";

type ParsedReviewRow = {
  rowNumber: number;
  productIdRaw: string;
  productHandleRaw: string;
  productUrlRaw: string;
  name: string;
  email: string;
  ratingRaw: string;
  title: string;
  body: string;
};

type ResolvedReviewRow = ParsedReviewRow & {
  rating: number;
  productId: number | null;
  productHandle: string;
  productUrl: string;
  productTitle: string;
  mappedBy: "product_id" | "product_handle" | "product_url" | "unmapped";
  errors: string[];
};

type JudgeMeConfig = {
  publicToken: string;
  shopDomains: string[];
};

type BulkSubmitStats = {
  processed: number;
  success: number;
  failed: number;
};

const DEFAULT_JUDGEME_SHOP_DOMAIN = "0309d3-72.myshopify.com";
const DEFAULT_JUDGEME_PUBLIC_TOKEN = "TQ0rk940ADN89zj_f83SKuTYIfY";

const templateCsv = [
  "title,body,rating,reviewer_name,reviewer_email,product_url",
  "Great fit,NICE DRESS QUITE EASILY WEARABLE LOOKS GOOD,5,Courtney Jones,courtney@example.com,https://saltonlinestore.com/products/elegant-black-v-neck-long-dress-sleeveless-high-slit-prom-dress",
].join("\n");

function normalizeDomain(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProtocol).hostname.toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
  }
}

function normalizeHandle(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function extractHandleFromProductUrl(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const directMatch = raw.match(/(?:^|\/)products\/([^/?#]+)/i);
  if (directMatch?.[1]) {
    return normalizeHandle(decodeURIComponent(directMatch[1]));
  }

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, "")}`;
    const parsed = new URL(withProtocol);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const productsIndex = segments.findIndex((segment) => segment.toLowerCase() === "products");
    if (productsIndex >= 0 && segments[productsIndex + 1]) {
      return normalizeHandle(decodeURIComponent(segments[productsIndex + 1]));
    }
  } catch {
    return "";
  }

  return "";
}

function normalizeHeader(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
}

function asString(value: unknown): string {
  return String(value ?? "").trim();
}

function getJudgeMeConfig(): JudgeMeConfig | null {
  const runtime = getRuntimeContext();
  const publicToken = String(
    runtime.judgeMePublicToken ||
      import.meta.env.VITE_JUDGEME_PUBLIC_TOKEN ||
      (typeof window !== "undefined"
        ? (window as unknown as { jdgm?: { PUBLIC_TOKEN?: string } }).jdgm?.PUBLIC_TOKEN
        : "") ||
      DEFAULT_JUDGEME_PUBLIC_TOKEN,
  ).trim();

  const shopDomains = Array.from(
    new Set(
      [
        runtime.judgeMeShopDomain,
        runtime.shopDomain,
        getShopBaseOrigin(),
        import.meta.env.VITE_JUDGEME_SHOP_DOMAIN,
        import.meta.env.VITE_SALT_SHOP_URL,
        import.meta.env.VITE_SHOPIFY_STOREFRONT_URL,
        DEFAULT_JUDGEME_SHOP_DOMAIN,
      ]
        .map((entry) => normalizeDomain(String(entry || "")))
        .filter(Boolean),
    ),
  );

  if (!publicToken || !shopDomains.length) {
    return null;
  }

  return { publicToken, shopDomains };
}

function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(input || "").trim());
}

function toRecordList(rows: unknown[]): Record<string, unknown>[] {
  return rows.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"));
}

function pickValue(row: Record<string, unknown>, aliases: string[]): string {
  for (const alias of aliases) {
    if (alias in row) {
      return asString(row[alias]);
    }
  }
  return "";
}

function parseRating(value: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(1, Math.min(5, Math.round(numeric)));
}

function escapeCsvCell(value: string): string {
  const cell = String(value ?? "");
  if (/[,"\n\r]/.test(cell)) {
    return `"${cell.replace(/"/g, "\"\"")}"`;
  }
  return cell;
}

function getDuplicateSignature(row: Pick<ResolvedReviewRow, "productId" | "productHandle" | "email" | "title" | "body" | "rating">): string {
  return [
    String(row.productId ?? row.productHandle ?? ""),
    normalizeHandle(row.email),
    normalizeHandle(row.title),
    normalizeHandle(row.body),
    String(row.rating),
  ].join("::");
}

async function parseFile(file: File): Promise<ParsedReviewRow[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", raw: false });
  const firstSheet = workbook.SheetNames[0];

  if (!firstSheet) {
    return [];
  }

  const sheet = workbook.Sheets[firstSheet];
  const rawRows = toRecordList(
    XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: false,
      defval: "",
    }),
  );

  return rawRows.map((raw, index) => {
    const row = Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [normalizeHeader(key), value]),
    );

    return {
      rowNumber: index + 2,
      productIdRaw: pickValue(row, ["product_id", "id", "external_id"]),
      productHandleRaw: pickValue(row, ["product_handle", "handle", "product", "product_slug"]),
      productUrlRaw: pickValue(row, ["product_url", "url", "product_link", "link", "product_page_url"]),
      name: pickValue(row, ["name", "author", "reviewer_name"]),
      email: pickValue(row, ["email", "reviewer_email"]),
      ratingRaw: pickValue(row, ["rating", "stars", "score"]),
      title: pickValue(row, ["title", "headline", "review_title"]),
      body: pickValue(row, ["body", "review", "content", "comment", "text"]),
    };
  });
}

async function submitSingleReview(
  config: JudgeMeConfig,
  row: ResolvedReviewRow,
): Promise<void> {
  if (!row.productId || !row.productHandle) {
    throw new Error("Missing product mapping");
  }

  const endpoint = "https://api.judge.me/api/v1/reviews";
  const basePayload = {
    api_token: config.publicToken,
    platform: "shopify",
    id: String(row.productId),
    external_id: String(row.productId),
    handle: row.productHandle,
    product_handle: row.productHandle,
    url: row.productUrl || `${getShopBaseOrigin()}/products/${row.productHandle}`,
    name: row.name,
    email: row.email,
    rating: row.rating,
    title: row.title || "Customer review",
    body: row.body,
  };

  for (const shopDomain of config.shopDomains) {
    const payload = {
      ...basePayload,
      shop_domain: shopDomain,
    };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "omit",
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return;
      }
    } catch (error) {
      if (!(error instanceof TypeError)) {
        continue;
      }

      await fetch(endpoint, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({
          api_token: payload.api_token,
          shop_domain: payload.shop_domain,
          platform: payload.platform,
          id: payload.id,
          external_id: payload.external_id,
          handle: payload.handle,
          product_handle: payload.product_handle,
          url: payload.url,
          name: payload.name,
          email: payload.email,
          rating: String(payload.rating),
          title: payload.title,
          body: payload.body,
        }).toString(),
      });
      return;
    }
  }

  throw new Error(`Failed to submit row ${row.rowNumber}`);
}

const BulkReviewPage = () => {
  const queryClient = useQueryClient();
  const [fileName, setFileName] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rows, setRows] = useState<ParsedReviewRow[]>([]);
  const [submitStats, setSubmitStats] = useState<BulkSubmitStats>({
    processed: 0,
    success: 0,
    failed: 0,
  });

  const { data: productsPayload } = useProducts();
  const products = productsPayload?.products || [];

  const productById = useMemo(
    () => new Map(products.map((product) => [Number(product.id), product])),
    [products],
  );
  const productByHandle = useMemo(
    () => new Map(products.map((product) => [normalizeHandle(product.handle), product])),
    [products],
  );

  const resolvedRows = useMemo<ResolvedReviewRow[]>(() => {
    const baseRows = rows.map((row) => {
      const errors: string[] = [];
      const parsedProductId = Number(row.productIdRaw);
      const normalizedHandle = normalizeHandle(row.productHandleRaw);
      const handleFromUrl = extractHandleFromProductUrl(row.productUrlRaw);
      const hasProductIdInput = Number.isFinite(parsedProductId) && parsedProductId > 0;
      const hasDirectHandleInput = Boolean(normalizedHandle);
      const hasUrlHandleInput = Boolean(handleFromUrl);

      let mappedBy: ResolvedReviewRow["mappedBy"] = "unmapped";
      let product = null;
      if (hasProductIdInput) {
        product = productById.get(parsedProductId) || null;
        if (product) {
          mappedBy = "product_id";
        }
      }

      if (!product && hasDirectHandleInput) {
        product = productByHandle.get(normalizedHandle) || null;
        if (product) {
          mappedBy = "product_handle";
        }
      }

      if (!product && hasUrlHandleInput) {
        product = productByHandle.get(handleFromUrl) || null;
        if (product) {
          mappedBy = "product_url";
        }
      }

      const rating = parseRating(row.ratingRaw);

      if (!row.productIdRaw && !row.productHandleRaw && !row.productUrlRaw) {
        errors.push("Provide product_url or product_handle or product_id");
      }
      if (!product) {
        errors.push("Product not found by product_url/product_handle/product_id");
      }
      if (!row.name) {
        errors.push("Name is required");
      }
      if (!isValidEmail(row.email)) {
        errors.push("Valid email is required");
      }
      if (!row.ratingRaw) {
        errors.push("Rating is required");
      }
      if (!(rating >= 1 && rating <= 5)) {
        errors.push("Rating must be between 1 and 5");
      }
      if (!row.body || row.body.length < 12) {
        errors.push("Review body must be at least 12 characters");
      }

      return {
        ...row,
        rating,
        productId: product?.id || null,
        productHandle: product?.handle || normalizedHandle || handleFromUrl || "",
        productUrl: row.productUrlRaw || (product?.handle ? `${getShopBaseOrigin()}/products/${product.handle}` : ""),
        productTitle: product?.title || "",
        mappedBy,
        errors,
      };
    });

    const duplicateCounts = new Map<string, number>();
    for (const row of baseRows) {
      if (!row.productId && !row.productHandle) {
        continue;
      }
      const signature = getDuplicateSignature(row);
      duplicateCounts.set(signature, (duplicateCounts.get(signature) || 0) + 1);
    }

    return baseRows.map((row) => {
      const signature = getDuplicateSignature(row);
      if ((duplicateCounts.get(signature) || 0) > 1) {
        return {
          ...row,
          errors: row.errors.includes("Duplicate review row detected")
            ? row.errors
            : [...row.errors, "Duplicate review row detected"],
        };
      }
      return row;
    });
  }, [productByHandle, productById, rows]);

  const validRows = resolvedRows.filter((row) => row.errors.length === 0);
  const invalidRows = resolvedRows.filter((row) => row.errors.length > 0);
  const mappingStats = useMemo(() => {
    return resolvedRows.reduce(
      (acc, row) => {
        if (row.mappedBy === "product_id") {
          acc.byId += 1;
        } else if (row.mappedBy === "product_handle") {
          acc.byHandle += 1;
        } else if (row.mappedBy === "product_url") {
          acc.byUrl += 1;
        } else {
          acc.unmapped += 1;
        }
        return acc;
      },
      { byId: 0, byHandle: 0, byUrl: 0, unmapped: 0 },
    );
  }, [resolvedRows]);
  const submissionProgressPercent = validRows.length
    ? Math.min(100, Math.round((submitStats.processed / validRows.length) * 100))
    : 0;

  const onFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setFileName(file.name);
    setSubmitStats({ processed: 0, success: 0, failed: 0 });
    setIsParsing(true);
    try {
      const parsed = await parseFile(file);
      setRows(parsed);
      toast.success("Review file loaded", {
        description: `${parsed.length.toLocaleString()} row(s) parsed.`,
      });
    } catch {
      setRows([]);
      toast.error("Could not parse file. Upload CSV, XLSX, or XLS.");
    } finally {
      setIsParsing(false);
      event.target.value = "";
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([templateCsv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bulk-reviews-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportInvalidRows = () => {
    if (!invalidRows.length) {
      toast.error("No invalid rows to export.");
      return;
    }

    const header = [
      "row_number",
      "status",
      "errors",
      "product_id",
      "product_handle",
      "product_url",
      "reviewer_name",
      "reviewer_email",
      "rating",
      "title",
      "body",
    ];

    const lines = invalidRows.map((row) =>
      [
        row.rowNumber,
        "invalid",
        row.errors.join(" | "),
        row.productIdRaw,
        row.productHandleRaw || row.productHandle,
        row.productUrlRaw || row.productUrl,
        row.name,
        row.email,
        row.ratingRaw,
        row.title,
        row.body,
      ]
        .map((cell) => escapeCsvCell(String(cell ?? "")))
        .join(","),
    );

    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bulk-review-invalid-rows.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearLoadedFile = () => {
    setRows([]);
    setFileName("");
    setSubmitStats({ processed: 0, success: 0, failed: 0 });
    toast.success("Cleared loaded review rows.");
  };

  const submitBulkReviews = async () => {
    const config = getJudgeMeConfig();
    if (!config) {
      toast.error("Judge.me runtime config missing.");
      return;
    }
    if (!validRows.length) {
      toast.error("No valid rows to submit.");
      return;
    }

    setIsSubmitting(true);
    const nextStats: BulkSubmitStats = { processed: 0, success: 0, failed: 0 };

    for (const row of validRows) {
      try {
        await submitSingleReview(config, row);
        nextStats.success += 1;
      } catch {
        nextStats.failed += 1;
      } finally {
        nextStats.processed += 1;
        setSubmitStats({ ...nextStats });
      }
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["judgeme-preview-badges"] }),
      queryClient.invalidateQueries({ queryKey: ["judgeme-product-widget"] }),
    ]);

    setIsSubmitting(false);
    toast.success("Bulk review submission completed", {
      description: `${nextStats.success.toLocaleString()} success • ${nextStats.failed.toLocaleString()} failed`,
    });
  };

  return (
    <section className="mx-auto mt-8 w-[min(1280px,96vw)] pb-12">
      <Reveal>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Admin</p>
            <h1 className="font-display text-[clamp(2rem,4vw,3.2rem)] leading-[0.95]">
              Bulk review upload
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Upload CSV/XLSX and post product reviews to Judge.me in one run.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={downloadTemplate}
              className="salt-outline-chip h-10 gap-2 px-4 py-0 text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Download template
            </button>
            <button
              type="button"
              onClick={exportInvalidRows}
              disabled={!invalidRows.length}
              className="salt-outline-chip h-10 gap-2 px-4 py-0 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileDown className="h-3.5 w-3.5" />
              Export invalid rows
            </button>
            <button
              type="button"
              onClick={clearLoadedFile}
              disabled={!rows.length || isSubmitting}
              className="salt-outline-chip h-10 gap-2 px-4 py-0 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear rows
            </button>
          </div>
        </div>
      </Reveal>

      <Reveal delayMs={40}>
        <div className="salt-panel-shell rounded-2xl p-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Upload file
              </span>
              <div className="relative">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={onFileSelected}
                  className="salt-form-control h-11 w-full rounded-xl border-border/80 bg-background pr-11"
                  disabled={isSubmitting}
                />
                <FileSpreadsheet className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Preferred columns: <code>title</code>, <code>body</code>, <code>rating</code>, <code>reviewer_name</code>, <code>reviewer_email</code>, <code>product_url</code>. Alternate mappings are still supported.
              </p>
            </label>
            <button
              type="button"
              onClick={submitBulkReviews}
              disabled={isSubmitting || isParsing || !validRows.length}
              className="salt-primary-cta h-11 gap-2 px-5 text-xs font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isSubmitting ? "Submitting..." : "Submit valid reviews"}
            </button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="salt-ambient-card rounded-xl px-3 py-2">
              <p className="text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">Loaded rows</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{rows.length.toLocaleString()}</p>
              <p className="mt-1 text-[0.7rem] text-muted-foreground">{fileName || "No file selected"}</p>
            </div>
            <div className="salt-ambient-card rounded-xl px-3 py-2">
              <p className="text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">Valid rows</p>
              <p className="mt-1 text-xl font-semibold text-emerald-700 dark:text-emerald-300">{validRows.length.toLocaleString()}</p>
            </div>
            <div className="salt-ambient-card rounded-xl px-3 py-2">
              <p className="text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">Invalid rows</p>
              <p className="mt-1 text-xl font-semibold text-destructive">{invalidRows.length.toLocaleString()}</p>
            </div>
            <div className="salt-ambient-card rounded-xl px-3 py-2">
              <p className="text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">Submission progress</p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {submitStats.processed.toLocaleString()} / {validRows.length.toLocaleString()}
              </p>
              <p className="mt-1 text-[0.7rem] text-muted-foreground">
                {submitStats.success.toLocaleString()} success • {submitStats.failed.toLocaleString()} failed
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border/70">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${submissionProgressPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="salt-ambient-card rounded-xl px-3 py-2">
              <p className="text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">Mapped by URL</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{mappingStats.byUrl.toLocaleString()}</p>
            </div>
            <div className="salt-ambient-card rounded-xl px-3 py-2">
              <p className="text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">Mapped by handle</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{mappingStats.byHandle.toLocaleString()}</p>
            </div>
            <div className="salt-ambient-card rounded-xl px-3 py-2">
              <p className="text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">Mapped by id</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{mappingStats.byId.toLocaleString()}</p>
            </div>
            <div className="salt-ambient-card rounded-xl px-3 py-2">
              <p className="text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">Unmapped rows</p>
              <p className="mt-1 text-lg font-semibold text-destructive">{mappingStats.unmapped.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </Reveal>

      {rows.length ? (
        <Reveal delayMs={80}>
          <div className="salt-panel-shell mt-5 rounded-2xl p-5">
            <h2 className="font-display text-2xl">Row preview</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Showing first {Math.min(25, resolvedRows.length)} rows.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-[0.68rem] uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="px-3 py-1">Row</th>
                    <th className="px-3 py-1">Product</th>
                    <th className="px-3 py-1">Reviewer</th>
                    <th className="px-3 py-1">Rating</th>
                    <th className="px-3 py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {resolvedRows.slice(0, 25).map((row) => (
                    <tr key={`bulk-row-${row.rowNumber}`} className="rounded-xl border border-border/75 bg-background/85">
                      <td className="whitespace-nowrap px-3 py-2 font-semibold">#{row.rowNumber}</td>
                      <td className="px-3 py-2">
                        <p className="font-semibold text-foreground">{row.productTitle || row.productHandleRaw || row.productIdRaw || "-"}</p>
                        <p className="text-[0.7rem] text-muted-foreground">{row.productHandle || row.productHandleRaw || "-"}</p>
                        <p className="mt-1 text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">
                          {row.mappedBy === "product_url"
                            ? "Mapped by product_url"
                            : row.mappedBy === "product_handle"
                              ? "Mapped by product_handle"
                              : row.mappedBy === "product_id"
                                ? "Mapped by product_id"
                                : "Not mapped"}
                        </p>
                        {row.productUrlRaw ? (
                          <p className="line-clamp-1 text-[0.68rem] text-muted-foreground">{row.productUrlRaw}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-foreground">{row.name || "-"}</p>
                        <p className="text-[0.7rem] text-muted-foreground">{row.email || "-"}</p>
                      </td>
                      <td className="px-3 py-2 font-semibold text-foreground">{row.ratingRaw || "-"}</td>
                      <td className="px-3 py-2">
                        {row.errors.length === 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/12 px-2 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Valid
                          </span>
                        ) : (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 rounded-full border border-destructive/35 bg-destructive/10 px-2 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-destructive">
                              <AlertCircle className="h-3.5 w-3.5" />
                              {row.errors[0]}
                            </span>
                            {row.errors.length > 1 ? (
                              <p className="text-[0.64rem] uppercase tracking-[0.07em] text-destructive/90">
                                +{row.errors.length - 1} more issue(s)
                              </p>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Reveal>
      ) : null}
    </section>
  );
};

export default BulkReviewPage;
