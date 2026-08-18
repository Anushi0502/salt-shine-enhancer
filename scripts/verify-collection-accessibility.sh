#!/usr/bin/env bash
set -euo pipefail

TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_HOME_PATH="${CODEX_HOME:-$HOME/.codex}"
PWCLI_PATH="${PWCLI:-$CODEX_HOME_PATH/skills/playwright/scripts/playwright_cli.sh}"
COLLECTION_URL="${SALT_COLLECTION_URL:-https://www.saltonlinestore.com/collections/shopping-bags-jute-bags}"
SESSION_NAME="${PLAYWRIGHT_CLI_SESSION:-salt-collection-a11y}"

if [[ ! -x "$PWCLI_PATH" ]]; then
  echo "Playwright CLI wrapper not found: $PWCLI_PATH" >&2
  exit 1
fi

"$PWCLI_PATH" --session "$SESSION_NAME" open "$COLLECTION_URL" >/dev/null
"$PWCLI_PATH" --session "$SESSION_NAME" run-code '
  const toggle = page.getByRole("button", { name: /Filter and sort|Show filters/i }).first();
  if (await toggle.count()) await toggle.click();
  const form = page.locator("form[aria-label=\"Product filters\"]").first();
  if (!(await form.count())) throw new Error("Product filters form was not rendered");
  const min = form.locator("#min_price");
  const max = form.locator("#max_price");
  if (!(await min.count()) || !(await max.count())) throw new Error("min_price/max_price inputs are missing");
  const minName = await min.getAttribute("aria-label");
  const maxName = await max.getAttribute("aria-label");
  if (minName !== "Minimum price" || maxName !== "Maximum price") {
    throw new Error(`Accessible names failed: ${minName} / ${maxName}`);
  }
  await min.fill("10");
  await max.fill("20");
  await form.getByRole("button", { name: /Apply price/i }).click();
  await page.waitForTimeout(350);
  const url = new URL(page.url());
  if (url.searchParams.get("min") !== "10" || url.searchParams.get("max") !== "20") {
    throw new Error(`Filter submission failed: ${page.url()}`);
  }
  console.log(JSON.stringify({ url: page.url(), minName, maxName, status: "passed" }));
'

echo "Collection accessibility test passed for $COLLECTION_URL"
