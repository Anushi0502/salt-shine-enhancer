const mountTarget =
  document.getElementById("salt-app-root") ||
  document.getElementById("root");

console.log("SALT main entry reached");

if (!mountTarget) {
  throw new Error("SALT app mount target not found");
}

if (!document.querySelector('link[data-salt-app-styles="true"]')) {
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "/src/index.css";
  stylesheet.dataset.saltAppStyles = "true";
  document.head.appendChild(stylesheet);
}

mountTarget.innerHTML = `
  <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at top left,rgba(255,255,255,0.88),rgba(238,245,255,0.98) 52%,rgba(223,235,255,1));font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="width:min(28rem,88vw);border:1px solid rgba(255,255,255,0.82);border-radius:2rem;background:rgba(255,255,255,0.92);box-shadow:0 24px 70px -36px rgba(26,77,154,0.5);padding:1.5rem;">
      <div style="display:flex;align-items:center;gap:1rem;">
        <img
          src="/brand/salt-logo.png"
          alt="SALT"
          style="height:3.5rem;width:3.5rem;border-radius:1.1rem;object-fit:cover;box-shadow:0 12px 28px -18px rgba(26,77,154,0.55);"
        />
        <div style="min-width:0;">
          <p style="margin:0;font-size:0.68rem;font-weight:800;letter-spacing:0.28em;text-transform:uppercase;color:#1f4b97;">
            Loading storefront
          </p>
          <p style="margin:0.5rem 0 0;color:#475569;font-size:0.92rem;line-height:1.6;">
            Preparing the Shopify storefront and order account experience.
          </p>
        </div>
      </div>
    </div>
  </div>
`;

console.log("SALT splash mounted");

async function loadBrowserScript(src: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

void (async () => {
  console.log("SALT boot: loading React UMD");
  await loadBrowserScript("/node_modules/react/umd/react.development.js");
  console.log("SALT boot: loading ReactDOM UMD");
  await loadBrowserScript("/node_modules/react-dom/umd/react-dom.development.js");
  console.log("SALT boot: importing App module");
  const { default: App } = await import("./App");
  console.log("SALT boot: App module loaded");
  const browserWindow = window as Window &
    typeof globalThis & {
      React: typeof import("react");
      ReactDOM: typeof import("react-dom");
    };
  console.log("SALT boot: creating root");
  const root = browserWindow.ReactDOM.createRoot(mountTarget);
  console.log("SALT boot: rendering App");
  root.render(browserWindow.React.createElement(App));
  console.log("SALT boot: render call complete");
})().catch((error) => {
  console.error("SALT app failed to boot", error);
});
