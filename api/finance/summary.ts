import { buildFinanceSummary, handleFinanceOptions, normalizePeriod, requireFinanceSession, setFinanceCors } from "./_shared";

export const config = { runtime: "nodejs20.x" };

export default async function handler(req: any, res: any) {
  if (handleFinanceOptions(req, res, "GET, OPTIONS")) return;
  setFinanceCors(req, res);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!requireFinanceSession(req, res)) return;

  try {
    const period = normalizePeriod(req.query?.start, req.query?.end);
    const summary = await buildFinanceSummary(period.start, period.end);
    res.status(200).json(summary);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Unable to build finance summary" });
  }
}
