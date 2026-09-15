import { buildFinanceSummary, handleFinanceOptions, normalizePeriod, requireFinanceSession, setFinanceCors, type FinanceRequest, type FinanceResponse } from "./_shared.js";

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
    res.status(200).json(summary);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Unable to build finance summary" });
  }
}
