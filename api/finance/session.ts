import { getFinanceSession, handleFinanceOptions, sessionResponse, setFinanceCors } from "./_shared";

export const config = { runtime: "nodejs20.x" };

export default function handler(req: any, res: any) {
  if (handleFinanceOptions(req, res, "GET, OPTIONS")) return;
  setFinanceCors(req, res);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  sessionResponse(res, getFinanceSession(req));
}
