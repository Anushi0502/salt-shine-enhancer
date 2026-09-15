import { clearFinanceSession, financeResponse, handleFinanceOptions, setFinanceCors, type FinanceRequest, type FinanceResponse } from "./_shared.js";

export default function handler(req: FinanceRequest, res: FinanceResponse) {
  if (handleFinanceOptions(req, res, "POST, OPTIONS")) return;
  setFinanceCors(req, res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  clearFinanceSession(res, req);
  financeResponse(res, 200, { authenticated: false });
}
