import { clearFinanceSession, financeResponse, handleFinanceOptions, setFinanceCors } from "./_shared";

export const config = { runtime: "nodejs20.x" };

export default function handler(req: any, res: any) {
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
