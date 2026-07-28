export const config = { runtime: "nodejs20.x" };

export default function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.status(200).json({ authenticated: false, probe: true, method: req.method });
}
