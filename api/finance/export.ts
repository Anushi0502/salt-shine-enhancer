import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { buildFinanceSummary, handleFinanceOptions, normalizePeriod, requireFinanceSession, setFinanceCors, type FinanceRequest, type FinanceResponse } from "./_shared.js";

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100);
}

function writeLine(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color = rgb(0.08, 0.16, 0.34)) {
  page.drawText(text, { x, y, size, font, color });
}

function wrap(text: string, maxLength = 96): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (`${current} ${word}`.trim().length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

export default async function handler(req: FinanceRequest, res: FinanceResponse) {
  if (handleFinanceOptions(req, res, "GET, OPTIONS")) return;
  setFinanceCors(req, res);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!requireFinanceSession(req, res)) return;

  try {
    const start = typeof req.query?.start === "string" ? req.query.start : undefined;
    const end = typeof req.query?.end === "string" ? req.query.end : undefined;
    const period = normalizePeriod(start, end);
    const summary = await buildFinanceSummary(period.start, period.end);
    const document = await PDFDocument.create();
    const regularFont = await document.embedFont(StandardFonts.Helvetica);
    const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
    const navy = rgb(0.08, 0.16, 0.34);
    const blue = rgb(0.16, 0.38, 0.86);
    const muted = rgb(0.30, 0.39, 0.56);
    const line = rgb(0.78, 0.85, 0.95);
    const activeFont = { current: regularFont };
    let page = document.addPage([595, 842]);
    let y = 795;

    const ensureSpace = (needed = 28) => {
      if (y < needed) {
        page = document.addPage([595, 842]);
        y = 795;
      }
    };

    const section = (title: string) => {
      ensureSpace(80);
      y -= 22;
      activeFont.current = boldFont;
      writeLine(page, title, 42, y, 12, activeFont.current, blue);
      y -= 8;
      page.drawLine({ start: { x: 42, y }, end: { x: 553, y }, thickness: 0.7, color: line });
      y -= 18;
    };

    activeFont.current = boldFont;
    writeLine(page, "SALT FINANCE REPORT", 42, y, 20, activeFont.current, navy);
    y -= 26;
    activeFont.current = regularFont;
    writeLine(page, `${summary.period.start} to ${summary.period.end} | ${summary.period.timezone}`, 42, y, 10, activeFont.current, muted);
    y -= 16;
    writeLine(page, `Generated ${new Date(summary.generatedAt).toLocaleString("en-US")}`, 42, y, 9, activeFont.current, muted);
    y -= 28;

    section("Executive Summary");
    const highlights = [
      ["Net sales", summary.kpis.netSalesCents],
      ["Gross profit", summary.kpis.grossProfitCents],
      ["Operating profit (realized)", summary.kpis.operatingProfitCents],
      ["Operating profit (conservative)", summary.kpis.conservativeOperatingProfitCents],
      ["Payouts received", summary.kpis.payoutsReceivedCents],
      ["Campaign cost per order", summary.kpis.campaignCostsCents],
      ["Cost coverage", summary.kpis.costCoveragePercent == null ? null : `${summary.kpis.costCoveragePercent}%`],
    ] as const;
    activeFont.current = regularFont;
    for (const [label, value] of highlights) {
      ensureSpace();
      writeLine(page, label, 48, y, 10, activeFont.current, muted);
      writeLine(page, value == null ? "Not available" : typeof value === "number" ? money(value, summary.currency) : value, 280, y, 10, activeFont.current, navy);
      y -= 18;
    }

    section("Profit and Loss");
    for (const row of summary.pnlRows) {
      ensureSpace();
      const tone = row.cents < 0 ? rgb(0.72, 0.20, 0.25) : row.tone === "positive" ? navy : muted;
      writeLine(page, row.label, 48, y, 10, activeFont.current, navy);
      writeLine(page, money(row.cents, summary.currency), 385, y, 10, activeFont.current, tone);
      y -= 13;
      for (const detailLine of wrap(row.detail, 80)) {
        writeLine(page, detailLine, 62, y, 8, activeFont.current, muted);
        y -= 11;
      }
      y -= 5;
    }

    section("Payouts");
    if (!summary.payouts.length) {
      writeLine(page, "No payout records were returned for this period.", 48, y, 10, activeFont.current, muted);
      y -= 18;
    } else {
      for (const payout of summary.payouts) {
        ensureSpace();
        writeLine(page, `${payout.id} | ${payout.issuedAt.slice(0, 10)} | ${payout.status}`, 48, y, 9, activeFont.current, navy);
        writeLine(page, money(payout.netCents, payout.currency), 430, y, 9, activeFont.current, navy);
        y -= 16;
      }
    }

    section("Live Reconciliation");
    const reconciliationTotals = summary.reconciliation.totals;
    for (const [label, value] of [
      ["Pending payout", reconciliationTotals.pendingPayoutCents],
      ["Payout paid", reconciliationTotals.payoutPaidCents],
      ["Order cost", reconciliationTotals.orderCostCents],
      ["Bill cost", reconciliationTotals.billCostCents],
      ["Live cash profit", reconciliationTotals.profitCents],
    ] as const) {
      ensureSpace();
      writeLine(page, label, 48, y, 10, activeFont.current, muted);
      writeLine(page, money(value, summary.currency), 280, y, 10, activeFont.current, navy);
      y -= 18;
    }
    if (!summary.reconciliation.rows.length) {
      writeLine(page, summary.reconciliation.message || "Live reconciliation records are not available yet.", 48, y, 10, activeFont.current, muted);
      y -= 18;
    } else {
      for (const row of summary.reconciliation.rows.slice(0, 40)) {
        ensureSpace(26);
        writeLine(page, `${row.serialNo}. ${row.shopifyOrderNumber} | ${row.month}`, 48, y, 9, activeFont.current, navy);
        writeLine(page, `${row.aliExpressOrderId} | ${row.status} | ${row.invoice}`, 48, y - 12, 8, activeFont.current, muted);
        writeLine(page, money(row.amountCents, row.currency), 430, y, 9, activeFont.current, navy);
        y -= 28;
      }
      if (summary.reconciliation.rows.length > 40) {
        writeLine(page, `Showing the first 40 of ${summary.reconciliation.rows.length} reconciliation rows.`, 48, y, 8, activeFont.current, muted);
        y -= 12;
      }
    }

    section("Campaign Allocations");
    if (!summary.campaignCosts.length) {
      writeLine(page, summary.sources.campaigns === "unavailable" ? "Shopify marketing activity access is unavailable for this workspace." : "No Shopify marketing activity spend was matched to this period.", 48, y, 10, activeFont.current, muted);
      y -= 18;
    } else {
      for (const campaign of summary.campaignCosts) {
        ensureSpace(24);
        writeLine(page, `${campaign.title} | ${campaign.source || "unknown"} / ${campaign.medium || "unknown"}`, 48, y, 9, activeFont.current, navy);
        writeLine(page, `${campaign.orderCount} order${campaign.orderCount === 1 ? "" : "s"} | spend ${money(campaign.adSpendCents, campaign.currency)} | allocated ${money(campaign.allocatedCents, campaign.currency)}`, 48, y - 12, 8, activeFont.current, muted);
        y -= 28;
      }
    }

    section("Subscriptions and Operating Costs");
    if (!summary.subscriptions.length) {
      writeLine(page, "No active Shopify app subscriptions or external recurring costs were returned.", 48, y, 9, activeFont.current, muted);
      y -= 12;
      writeLine(page, "Shopify Admin did not return active app billing items for this period.", 48, y, 9, activeFont.current, muted);
      y -= 18;
    } else {
      for (const subscription of summary.subscriptions) {
        ensureSpace();
        writeLine(page, `${subscription.name} | ${subscription.interval} | ${subscription.source}`, 48, y, 9, activeFont.current, navy);
        writeLine(page, money(subscription.allocatedCents, subscription.currency), 430, y, 9, activeFont.current, navy);
        y -= 16;
      }
    }

    section("Reconciliation Exceptions");
    if (!summary.exceptions.length) {
      writeLine(page, "No exceptions were reported for this period.", 48, y, 10, activeFont.current, muted);
      y -= 18;
    } else {
      for (const item of summary.exceptions) {
        ensureSpace();
        for (const detailLine of wrap(`[${item.severity.toUpperCase()}] ${item.message}`, 88)) {
          writeLine(page, detailLine, 48, y, 9, activeFont.current, item.severity === "high" ? rgb(0.72, 0.20, 0.25) : muted);
          y -= 13;
        }
        y -= 4;
      }
    }

    section("Methodology");
    for (const message of [
      "Payouts represent cash movement and are intentionally shown separately from profit.",
      "DSers product cost uses Shopify inventory cost-per-item values synced by DSers; unresolved items remain flagged.",
      "Payment fees are taken from Shopify payout data and allocated to order rows by net revenue.",
      "Campaign cost uses Shopify paid spend where returned; otherwise the configured campaign cost per order is applied once to each non-cancelled order.",
      "Shopify Grow ($105/month) and DSers ($19.90/month) are Shopify Admin-verified recurring charges allocated by calendar month; FINANCE_SHOPIFY_GROW_MONTHLY_COST and FINANCE_DSERS_MONTHLY_COST override those values when the merchant changes plans.",
      "Live reconciliation is calculated from current Shopify payout, order-cost, campaign, and subscription responses.",
      "Taxes collected are reported separately and are not treated as operating profit.",
    ]) {
      ensureSpace();
      for (const detailLine of wrap(`- ${message}`, 88)) {
        writeLine(page, detailLine, 48, y, 9, activeFont.current, muted);
        y -= 13;
      }
      y -= 3;
    }

    const pages = document.getPages();
    pages.forEach((currentPage, index) => {
      currentPage.drawText(`SALT Finance | Page ${index + 1} of ${pages.length}`, {
        x: 42,
        y: 24,
        size: 8,
        font: regularFont,
        color: muted,
      });
    });

    const bytes = await document.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="salt-finance-${summary.period.start}-to-${summary.period.end}.pdf"`);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.status(200).end(Buffer.from(bytes));
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Unable to export finance report" });
  }
}
