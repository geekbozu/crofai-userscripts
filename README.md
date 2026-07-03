# crofai-userscripts

Tampermonkey user scripts to enhance the [Crof.ai](https://crof.ai) experience.

## Scripts

### Crof.ai Dashboard Cost Enrichment

**File:** `crofai-dashboard-pricing.user.js` (v1.7.0)

Shows per-model cost breakdown on the Crof.ai dashboard usage charts.

![Screenshot](screenshot.png)

#### What it does

Adds a cost strip above the usage chart with:
- **Total cost** for the selected month/key
- **Per-model breakdown** — cost, input/output/cache costs, pricing rates ($/M tokens), and token counts
- Automatically updates when changing months (←/→) or switching API keys

#### How it works

1. Loads model pricing from `/v1/models` (cached 10 min)
2. Intercepts fetch/XHR API calls to `/user-api/usage` and `/monthly-usage-api/`
3. Calculates cost per model using token counts × pricing
4. Injects a styled cost strip above the chart

## Quick Install

Click to install:

```
https://raw.githubusercontent.com/geekbozu/crofai-userscripts/main/crofai-dashboard-pricing.user.js
```

Or manually:

1. Install [Tampermonkey](https://www.tampermonkey.net/) for Firefox
2. Open Tampermonkey → **Dashboard** → **+** (new script)
3. Delete the template, paste the full contents of `crofai-dashboard-pricing.user.js`
4. Save (`Ctrl+S`)
5. Visit `https://crof.ai/dashboard`

Tampermonkey will auto-check for updates via the `@downloadURL` / `@updateURL` directives.

## Development

```bash
git clone https://github.com/geekbozu/crofai-userscripts.git
cd crofai-userscripts
```

Edit `crofai-dashboard-pricing.user.js`, then reload the dashboard to test.

## License

MIT
