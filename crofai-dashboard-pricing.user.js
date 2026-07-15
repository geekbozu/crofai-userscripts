// ==UserScript==
// @name         Crof.ai Dashboard Cost Enrichment
// @namespace    https://crof.ai/
// @version      1.7.6
// @description  Shows per-model cost breakdown on Crof.ai dashboard usage charts.
// @author       CrofUserScripts
// @match        https://crof.ai/dashboard
// @match        https://crof.ai/dashboard/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/geekbozu/crofai-userscripts/dev/crofai-dashboard-pricing.user.js
// @updateURL    https://raw.githubusercontent.com/geekbozu/crofai-userscripts/dev/crofai-dashboard-pricing.user.js
// ==/UserScript==

(function () {
    'use strict';
    var CACHE_MS = 10 * 60 * 1000;
    var pricing = null, pricingTime = 0, lastUsage = null, VERSION = '1.7.6';

    async function loadPricing(force) {
        var now = Date.now();
        if (!force && pricing && now - pricingTime < CACHE_MS) return pricing;
        if (!force) { try { var c = GM_getValue('_cp', null); if (c) { var p = JSON.parse(c); if (Array.isArray(p.d) && now - p.t < CACHE_MS) { pricing = buildMap(p.d); pricingTime = p.t; return; } } } catch(e) {} }
        try {
            var r = await fetch('https://crof.ai/v1/models', { credentials: 'include' });
            if (!r.ok) throw new Error(String(r.status));
            var j = await r.json();
            var arr = Array.isArray(j) ? j : (j.data || j.models || []);
            pricing = buildMap(arr); pricingTime = now;
            GM_setValue('_cp', JSON.stringify({ d: arr, t: now }));
            console.log('[CrofCost] ✅ ' + arr.length + ' models');
        } catch (e) { console.warn('[CrofCost] Pricing fail:', e); if (!pricing) throw e; }
    }
    function buildMap(arr) {
        var m = new Map();
        (arr || []).forEach(function(x) { var p = x.pricing || {}; m.set(x.id || '', { i: +p.prompt || 0, o: +p.completion || 0, c: +p.cache_prompt || 0, s: x.sub_req_cost || 0, n: x.name || x.id || '' }); });
        return m;
    }
    function getPrice(id) { return pricing ? pricing.get(id) : null; }
    function calcCost(inT, outT, cacheT, id) {
        var p = getPrice(id || ''); if (!p) return null;
        var nc = Math.max(0, inT - (cacheT || 0));
        return { i: nc * (p.i / 1e6), o: (outT || 0) * (p.o / 1e6), c: (cacheT || 0) * (p.c / 1e6), t: nc * (p.i / 1e6) + (outT || 0) * (p.o / 1e6) + (cacheT || 0) * (p.c / 1e6) };
    }
    function fmt$(n) { if (!n) return '$0'; if (n < 0.0001) return '$' + n.toFixed(6); if (n < 1) return '$' + n.toFixed(4); if (n < 100) return '$' + n.toFixed(2); return '$' + n.toFixed(1); }
    function fmtTok(n) { if (!n) return '0'; if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'; if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'; return String(Math.round(n)); }

    GM_addStyle('.cc-strip{display:flex!important;align-items:center;gap:12px;padding:8px 14px;margin:4px 0;background:linear-gradient(135deg,rgba(102,126,234,0.12),rgba(118,75,162,0.08));border:1px solid rgba(102,126,234,0.25);border-radius:8px;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;flex-wrap:wrap}.cc-item{display:inline-flex;align-items:baseline;gap:4px}.cc-lbl{color:#c9d1d9;font-size:10px;text-transform:uppercase;letter-spacing:.2px}.cc-val{font-weight:700;font-variant-numeric:tabular-nums;color:#f0f6fc;font-size:14px}.cc-val.green{color:#3fb950}.cc-val.yellow{color:#d29922}.cc-val.red{color:#f85149}.cc-sep{width:1px;height:20px;background:rgba(102,126,234,0.2);flex-shrink:0}.cc-breakdown{background:rgba(255,255,255,0.02);border:1px solid rgba(102,126,234,0.15);border-top:none;border-radius:0 0 8px 8px;padding:6px 0;margin:-4px 0 6px;font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}');

    // ─── Page interceptor ─────────────────────────────────────────────
    function injectInterceptor() {
        var s = document.createElement('script');
        s.id = 'cc-int';
        s.textContent = 'window.__ccReqs=[];window.__ccResps=[];(function(){var _f=window.fetch;window.fetch=function(u,i){var url=typeof u==="string"?u:(u&&u.url?u.url:"");window.__ccReqs.push({t:"FETCH",url:url});return _f.call(this,u,i).then(function(r){var ct=r.headers.get("content-type")||"";if(ct.includes("json")&&(url.includes("crof.ai")||url.startsWith("/"))){r.clone().json().then(function(d){window.__ccResps.push({url:url,data:d});window.dispatchEvent(new CustomEvent("cc-data",{detail:{url:url,data:d}}));}).catch(function(){})}return r;})};var _o=XMLHttpRequest.prototype.open,_s=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(m,u){this.__u=String(u||"");return _o.apply(this,arguments)};XMLHttpRequest.prototype.send=function(b){var self=this,u=self.__u||"";if(u.includes("crof.ai")||u.startsWith("/")){window.__ccReqs.push({t:"XHR",url:u});self.addEventListener("load",function(){var ct=(self.getResponseHeader("content-type")||"");if(ct.includes("json"))try{var d=JSON.parse(self.responseText);window.__ccResps.push({url:u,data:d});window.dispatchEvent(new CustomEvent("cc-data",{detail:{url:u,data:d}}));}catch(e){}})}return _s.apply(this,arguments)};console.log("[CC] Interceptor active");})();';
        document.documentElement.appendChild(s);
    }

    // ─── Parse usage ──────────────────────────────────────────────────
    function parseUsage(data, url) {
        if (!data || typeof data !== 'object') return null;
        console.log('[CrofCost] 📡 ' + url);

        var records = [];
        if (Array.isArray(data)) records = data;
        else if (data.data && Array.isArray(data.data)) records = data.data;
        else if (data.series && Array.isArray(data.series)) records = data.series;
        else if (data.records && Array.isArray(data.records)) records = data.records;
        else if (data.usage && Array.isArray(data.usage)) records = data.usage;
        else if (data.points && Array.isArray(data.points)) records = data.points;
        else if (data.daily && Array.isArray(data.daily)) records = data.daily;
        else if (data.hourly && Array.isArray(data.hourly)) records = data.hourly;
        else if (typeof data === 'object') {
            var vals = Object.values(data);
            if (vals.length > 0 && typeof vals[0] === 'object' && vals[0] !== null && ('input_tokens' in vals[0] || 'output_tokens' in vals[0])) {
                records = vals;
                var keys = Object.keys(data);
                keys.forEach(function(k, i) { if (vals[i]) vals[i].__model = k; });
            }
        }
        if (!records.length) return null;

        var inT = 0, outT = 0, cacheT = 0, models = new Set(), perModel = {};
        for (var ri = 0; ri < records.length; ri++) {
            var r = records[ri];
            if (!r || typeof r !== 'object') continue;
            var mid = r.__model || r.model || r.model_id || '';
            if (mid) models.add(mid);
            var iT = r.input_tokens || r.input || r.prompt_tokens || 0;
            var oT = r.output_tokens || r.output || r.completion_tokens || 0;
            var cT = r.cached_tokens || r.cache_tokens || r.cache_prompt || 0;
            if (typeof iT === 'number' && iT > 0) inT += iT;
            if (typeof oT === 'number' && oT > 0) outT += oT;
            if (typeof cT === 'number' && cT > 0) cacheT += cT;
            if (mid) perModel[mid] = { input: typeof iT === 'number' ? iT : 0, output: typeof oT === 'number' ? oT : 0, cache: typeof cT === 'number' ? cT : 0 };
        }
        if (inT > 0 || outT > 0) return { input: inT, output: outT, cache: cacheT, models: models, perModel: perModel };
        return null;
    }

    // ─── Enrich chart ────────────────────────────────────────────────
    function injectStrip(usage, source) {
        if (!usage || (!usage.input && !usage.output)) return;
        // Remove old strips wherever they are
        document.querySelectorAll('.cc-strip,.cc-breakdown').forEach(function(el) { el.remove(); });
        // Inject inside the chart container to inherit its centering/padding.
        // When the chart re-renders and wipes the strip, the 300ms interval
        // re-injects it from lastUsage.
        var chart = document.querySelector('.total_tokens_chart');
        var target = chart || document.body;
        var ref = chart ? chart.firstChild : target.firstChild;

        var modelCosts = [], totalCost = 0, totalIn = 0, totalOut = 0, totalCache = 0;
        if (pricing && pricing.size && usage.perModel) {
            for (var id in usage.perModel) {
                if (!usage.perModel.hasOwnProperty(id)) continue;
                var toks = usage.perModel[id];
                var c = calcCost(toks.input, toks.output, toks.cache, id);
                if (c) {
                    totalCost += c.t; totalIn += c.i; totalOut += c.o; totalCache += c.c;
                    modelCosts.push({ id: id, inputT: toks.input, outputT: toks.output, cacheT: toks.cache, inputCost: c.i, outputCost: c.o, cacheCost: c.c, total: c.t, rate: getPrice(id) });
                }
            }
        }
        modelCosts.sort(function(a, b) { return b.total - a.total; });

        // Total cost strip
        var cl = totalCost > 10 ? 'red' : totalCost > 1 ? 'yellow' : 'green';
        var st = document.createElement('div'); st.className = 'cc-strip';
        st.innerHTML = '<span class=cc-item><span class=cc-lbl>Cost</span><span class="cc-val ' + cl + '">' + fmt$(totalCost) + '</span></span><span class=cc-sep></span><span class=cc-item><span class=cc-lbl>In</span><span class=cc-val>' + fmt$(totalIn) + '</span><span class=cc-item><span class=cc-lbl>Out</span><span class=cc-val>' + fmt$(totalOut) + '</span></span></span>';
        if (totalCache > 0) st.innerHTML += '<span class=cc-sep></span><span class=cc-item><span class=cc-lbl>Cache</span><span class=cc-val>' + fmt$(totalCache) + '</span></span>';
        st.innerHTML += '<span style="margin-left:auto;font-size:10px;color:#8b949e;opacity:0.6" data-version="' + VERSION + '">v' + VERSION + '</span>';
        target.insertBefore(st, ref);

        // Per-model breakdown
        if (modelCosts.length > 0) {
            var hasCache = modelCosts.some(function(m) { return m.cacheT > 0; });
            var rows = '';
            for (var i = 0; i < modelCosts.length; i++) {
                var mc = modelCosts[i];
                var bg = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'transparent';
                var isMajor = mc.total > totalCost * 0.05;
                var nameColor = isMajor ? '#f0f6fc' : '#c9d1d9';
                var valColor = isMajor ? '#f0f6fc' : '#c9d1d9';
                rows += '<div style="display:flex;align-items:center;gap:6px;padding:5px 14px;font-size:12px;background:' + bg + '">' +
                    '<span style="min-width:130px;font-weight:' + (isMajor ? '600' : '400') + ';color:' + nameColor + ';overflow:hidden;text-overflow:ellipsis">' + mc.id + '</span>' +
                    '<span style="min-width:65px;text-align:right;font-family:monospace;color:#3fb950;font-weight:600">' + fmt$(mc.total) + '</span>' +
                    '<span style="min-width:50px;text-align:right;font-family:monospace;color:' + valColor + ';font-size:11px">' + (mc.inputCost > 0.0001 ? fmt$(mc.inputCost) : '-') + '</span>' +
                    '<span style="min-width:50px;text-align:right;font-family:monospace;color:' + valColor + ';font-size:11px">' + (mc.outputCost > 0.0001 ? fmt$(mc.outputCost) : '-') + '</span>' +
                    (hasCache ? '<span style="min-width:50px;text-align:right;font-family:monospace;color:' + valColor + ';font-size:11px">' + (mc.cacheCost > 0.0001 ? fmt$(mc.cacheCost) : '-') + '</span>' : '') +
                    '<span style="min-width:85px;text-align:right;font-family:monospace;color:#c9d1d9;font-size:10px">' +
                        '$' + (mc.rate ? mc.rate.i : '?') + '/' + (mc.rate ? mc.rate.o : '?') + (mc.rate && mc.rate.c ? '/' + mc.rate.c : '') +
                    '</span>' +
                    '<span style="min-width:55px;text-align:right;color:#c9d1d9;font-size:10px;font-family:monospace">' + fmtTok(mc.inputT + mc.outputT) + '</span>' +
                    '</div>';
            }
            var header = '<div style="display:flex;align-items:center;gap:6px;padding:3px 14px;font-size:10px;color:#c9d1d9;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid rgba(102,126,234,0.15)">' +
                '<span style="min-width:130px">Model</span>' +
                '<span style="min-width:65px;text-align:right">Cost</span>' +
                '<span style="min-width:50px;text-align:right">In</span>' +
                '<span style="min-width:50px;text-align:right">Out</span>' +
                (hasCache ? '<span style="min-width:50px;text-align:right">Cache</span>' : '') +
                '<span style="min-width:85px;text-align:right">$/M</span>' +
                '<span style="min-width:55px;text-align:right">Tokens</span></div>';

            var bd = document.createElement('div'); bd.className = 'cc-breakdown';
            bd.innerHTML = header + rows;
            target.insertBefore(bd, st.nextSibling);
        }
        console.log('[CrofCost] ✅ $' + totalCost.toFixed(4) + ' across ' + modelCosts.length + ' models (' + source + ')');
    }

    // ─── Init ─────────────────────────────────────────────────────────
    function init() {
        try { var c = GM_getValue('_cp', null); if (c) { var p = JSON.parse(c); if (Array.isArray(p.d) && Date.now() - p.t < CACHE_MS) { pricing = buildMap(p.d); pricingTime = p.t; console.log('[CrofCost] Cached: ' + pricing.size + ' models'); } } } catch(e) {}
        injectInterceptor();

        // Process usage data — key-usage is preferred over total; once a key
        // filter is active, total-usage won't overwrite it. Saves lastUsage so
        // we can re-inject when the dashboard wipes our strip on re-render.
        function processUsage(data, url) {
            var u = parseUsage(data, url);
            var isKey = url && url.indexOf('/key-usage/') >= 0;
            // Key-usage returning empty data (no usage this period) → zero-cost record
            if (!u && isKey) u = { input: 0, output: 0, cache: 0, models: new Set(), perModel: {} };
            if (!u) return;
            // Don't let total-usage overwrite key-usage while a key filter is active
            if (!isKey && lastUsage && lastUsage.source === 'key') return;
            lastUsage = { data: u, source: isKey ? 'key' : 'total' };
            if (pricing) injectStrip(u, lastUsage.source);
            else loadPricing().then(function(){ injectStrip(u, lastUsage.source); }).catch(function(){});
        }

        window.addEventListener('cc-data', function(e) {
            processUsage(e.detail.data, e.detail.url);
        });

        setInterval(function() {
            var rs = window.__ccResps;
            if (rs && rs.length) {
                try { while (rs.length) { var r = rs.shift(); processUsage(r.data, r.url); } }
                catch(e) { console.warn('[CrofCost] drain error:', e); }
            }
            // Re-inject if the dashboard re-rendered and wiped our strip
            if (pricing && lastUsage && !document.querySelector('.cc-strip')) {
                injectStrip(lastUsage.data, lastUsage.source);
            }
        }, 300);

        setInterval(function() {
            var rs = window.__ccReqs;
            try { if (rs && rs.length) { while (rs.length) { var r = rs.shift(); console.log('[CrofCost] 📡 ' + r.t + ': ' + r.url); } } }
            catch(e) {}
        }, 500);

        loadPricing().then(function(){ console.log('[CrofCost] ✅ ' + pricing.size + ' models'); }).catch(function(){});
        console.log('[CrofCost] Active');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
