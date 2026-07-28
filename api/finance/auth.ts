import { handleFinanceOptions, issueFinanceSession, setFinanceCors } from "./_shared";

export default function handler(req: any, res: any) {
  if (handleFinanceOptions(req, res, "POST, OPTIONS")) return;
  setFinanceCors(req, res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    issueFinanceSession(req, res);
  } catch {
    res.status(503).json({ error: "Finance authentication is unavailable" });
  }
}
