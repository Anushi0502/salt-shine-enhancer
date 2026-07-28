export default function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.status(200).json({ ok: true, method: req.method });
}
