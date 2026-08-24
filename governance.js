(function () {
  "use strict";

  const config = globalThis.DASHBOARD_CONFIG || {};
  const dashboardId = config.id || "unknown";
  const links = [
    { id: "daily-mtd", label: "Daily MTD", href: "https://aptronix26.github.io/Retail-Sales-MTD/" },
    { id: "weekly-comparison", label: "Weekly", href: "https://aptronix26.github.io/Boardroom-JAS-Weekly/" },
    { id: "quarter-to-date", label: "QTD", href: "https://aptronix26.github.io/Boardroom-JAS-QTD/" },
    { id: "year-over-year", label: "YoY", href: "https://aptronix26.github.io/Boardroom-JAS-YOY/" },
    { id: "weekly-trajectory", label: "Trajectory", href: "https://aptronix26.github.io/Weekly-Trajectory-Intelligence/" }
  ];

  const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row && row[key]) || 0), 0);
  const normalized = value => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  const uniqueCount = values => new Set(values.map(normalized).filter(Boolean)).size;
  const close = (left, right, tolerance = 0.0001) =>
    Math.abs(Number(left) - Number(right)) <= Math.max(1, Math.abs(Number(right)) * tolerance);
  const check = (name, state, detail, severity = "high") => ({ name, state: Boolean(state) ? "pass" : severity === "low" ? "warning" : "fail", detail });

  function dailyAudit() {
    const targets = typeof EMBEDDED_TARGETS === "undefined" ? globalThis.PROD_TARGETS_2454 : EMBEDDED_TARGETS;
    const actuals = typeof EMBEDDED_ACHIEVEMENT === "undefined" ? globalThis.PROD_ACH_2454 : EMBEDDED_ACHIEVEMENT;
    const meta = typeof EMBEDDED_META === "undefined" ? null : EMBEDDED_META;
    if (!targets || !actuals) return { source: config.governance && config.governance.source, coverage: "Unavailable", dataThrough: config.reporting && config.reporting.label, checks: [check("Embedded data available", false, "Target or achievement data is unavailable.")] };
    const targetKeys = Object.keys(targets);
    const actualKeys = Object.keys(actuals);
    const targetSet = new Set(targetKeys);
    const actualSet = new Set(actualKeys);
    const missingActual = targetKeys.filter(key => !actualSet.has(key));
    const missingTarget = actualKeys.filter(key => !targetSet.has(key));
    const rowsValid = [...Object.values(targets), ...Object.values(actuals)].every(row => row && row.store && Number.isFinite(Number(row.revenue)));
    const actualDates = Object.values(actuals).map(row => row && row.date).filter(Boolean).sort();
    const dataThrough = actualDates.at(-1) || (config.reporting && (config.reporting.asOf || config.reporting.label));
    return {
      source: meta ? [meta.targetFile, meta.achievementFile].filter(Boolean).join(" + ") : config.governance && config.governance.source,
      coverage: `${actualKeys.length} stores`,
      dataThrough,
      checks: [
        check("Target and actual row counts", targetKeys.length === actualKeys.length && (!meta || (meta.targetRows === targetKeys.length && meta.achievementRows === actualKeys.length)), `${targetKeys.length} target rows · ${actualKeys.length} actual rows`),
        check("Store key alignment", missingActual.length === 0 && missingTarget.length === 0, missingActual.length || missingTarget.length ? `${missingActual.length} without actuals · ${missingTarget.length} without targets` : "Every target store has a matching actual row"),
        check("Required revenue fields", rowsValid, rowsValid ? "Store and revenue fields are populated" : "One or more embedded rows has an invalid store or revenue value"),
        check("Store names unique", uniqueCount(Object.values(actuals).map(row => row.store)) === actualKeys.length, `${uniqueCount(Object.values(actuals).map(row => row.store))} unique names across ${actualKeys.length} rows`)
      ]
    };
  }

  function weeklyAudit() {
    const model = typeof DATA === "undefined" ? null : DATA;
    const stores = model && Array.isArray(model.stores) ? model.stores : [];
    const arms = model && Array.isArray(model.arms) ? model.arms : [];
    const armNames = new Set(arms.map(row => normalized(row.arm)));
    const allMapped = stores.every(row => armNames.has(normalized(row.arm)));
    const currentStoreRevenue = sum(stores, "wk1Revenue");
    const currentArmRevenue = sum(arms, "wk1Revenue");
    const priorStoreRevenue = sum(stores, "wk13Revenue");
    const priorArmRevenue = sum(arms, "wk13Revenue");
    const ratesValid = stores.every(row => ["wk1Conversion", "wk13Conversion", "wk13Loan", "wk13Trade"].every(key => row[key] == null || (Number(row[key]) >= 0 && Number(row[key]) <= 1)));
    return {
      source: config.governance && config.governance.source,
      coverage: `${stores.length} stores · ${arms.length} ARMs`,
      dataThrough: config.governance && config.governance.dataThrough,
      checks: [
        check("Expected coverage", stores.length === Number(config.governance && config.governance.expectedStores) && arms.length === Number(config.governance && config.governance.expectedArms), `${stores.length} stores · ${arms.length} ARMs`),
        check("Store names unique", uniqueCount(stores.map(row => row.store)) === stores.length, `${uniqueCount(stores.map(row => row.store))} unique names across ${stores.length} rows`),
        check("Store-to-ARM mapping", allMapped, allMapped ? "Every store maps to a listed ARM" : "One or more stores maps to an unknown ARM"),
        check("Current revenue roll-up", close(currentStoreRevenue, currentArmRevenue), `Store ₹${(currentStoreRevenue / 1e7).toFixed(2)} Cr · ARM ₹${(currentArmRevenue / 1e7).toFixed(2)} Cr; review summary scope`, "low"),
        check("Comparable revenue roll-up", close(priorStoreRevenue, priorArmRevenue), `Store ₹${(priorStoreRevenue / 1e7).toFixed(2)} Cr · ARM ₹${(priorArmRevenue / 1e7).toFixed(2)} Cr; review summary scope`, "low"),
        check("Rate ranges", ratesValid, ratesValid ? "Conversion and attachment rates are within 0–100%" : "A conversion or attachment rate is outside 0–100%")
      ]
    };
  }

  function qtdAudit() {
    const rows = typeof DATA === "undefined" || !Array.isArray(DATA) ? [] : DATA;
    const summary = typeof SUM === "undefined" ? null : SUM;
    const arms = uniqueCount(rows.map(row => row.arm));
    const rollups = summary && [
      ["iPhone", "iPhone_cur"], ["Mac", "Mac_cur"], ["iPad", "iPad_cur"],
      ["Watch", "Watch_cur"], ["AirPods", "AirPods_cur"], ["Footfall", "ff_cur"]
    ];
    const rollupPass = Boolean(rollups && rollups.every(([label, key]) => close(sum(rows, key), summary[label] && summary[label].cur)));
    const headlineText = document.querySelector(".exec-v3-kpis .exec-v3-kpi:nth-child(2) .sub")?.textContent || "";
    const headlineMatch = headlineText.match(/[\d,]+/);
    const headlineUnits = headlineMatch ? Number(headlineMatch[0].replace(/,/g, "")) : null;
    const detailUnits = summary && summary.iPhone ? Number(summary.iPhone.cur) : null;
    const headlineAligned = headlineUnits == null || detailUnits == null || close(headlineUnits, detailUnits);
    const ratesValid = rows.every(row => ["iph_trade", "mac_trade", "iph_loan", "overall_loan", "license_attach_ex_air", "license_attach_with_air"].every(key => row[key] == null || (Number(row[key]) >= 0 && Number(row[key]) <= 1)));
    return {
      source: config.governance && config.governance.source,
      coverage: `${rows.length} stores · ${arms} ARMs`,
      dataThrough: config.governance && config.governance.dataThrough,
      checks: [
        check("Expected coverage", rows.length === Number(config.governance && config.governance.expectedStores) && arms === Number(config.governance && config.governance.expectedArms), `${rows.length} stores · ${arms} ARMs`),
        check("Store names unique", uniqueCount(rows.map(row => row.store)) === rows.length, `${uniqueCount(rows.map(row => row.store))} unique names across ${rows.length} rows`),
        check("Detail-to-summary roll-up", rollupPass, rollupPass ? "LOB units and footfall reconcile to the embedded summary" : "One or more detail totals differs from the embedded summary"),
        check("Executive/detail scope alignment", headlineAligned, headlineAligned ? "Executive iPhone units match the embedded detail summary" : `Executive ${headlineUnits?.toLocaleString("en-IN")} · detail model ${detailUnits?.toLocaleString("en-IN")}; review source scope`, "low"),
        check("Rate ranges", ratesValid, ratesValid ? "Attachment rates are within 0–100%" : "An attachment rate is outside 0–100%")
      ]
    };
  }

  function yoyAudit() {
    const model = typeof D === "undefined" ? null : D;
    const stores = model && Array.isArray(model.stores) ? model.stores : [];
    const categories = model && Array.isArray(model.categories) ? model.categories : [];
    const overall = model && model.overall;
    const daily = model && Array.isArray(model.daily) ? model.daily : [];
    const storeRevenue = sum(stores.map(row => ({ value: row.cy_lfl && row.cy_lfl.rev })), "value");
    const categoryRevenue = sum(categories.map(row => ({ value: row.cy_lfl && row.cy_lfl.rev })), "value");
    const dailyRevenue = sum(daily.map(row => ({ value: row.rev26 })), "value");
    const actualRevenue = overall && overall.cy_lfl ? overall.cy_lfl.rev : 0;
    return {
      source: model && model.meta ? model.meta.source : config.governance && config.governance.source,
      coverage: `${stores.length} stores · ${categories.length} categories`,
      dataThrough: model && model.meta ? model.meta.actual_cutoff : config.governance && config.governance.dataThrough,
      checks: [
        check("Expected store coverage", stores.length === Number(config.governance && config.governance.expectedStores), `${stores.length} retail stores`),
        check("Store names unique", uniqueCount(stores.map(row => row.name)) === stores.length, `${uniqueCount(stores.map(row => row.name))} unique names across ${stores.length} rows`),
        check("Store revenue roll-up", close(storeRevenue, actualRevenue), `Store ₹${(storeRevenue / 1e7).toFixed(2)} Cr · overall ₹${(actualRevenue / 1e7).toFixed(2)} Cr`),
        check("Category revenue roll-up", close(categoryRevenue, actualRevenue), `Category ₹${(categoryRevenue / 1e7).toFixed(2)} Cr · overall ₹${(actualRevenue / 1e7).toFixed(2)} Cr; review category scope`, "low"),
        check("Daily revenue roll-up", close(dailyRevenue, actualRevenue), `Daily ₹${(dailyRevenue / 1e7).toFixed(2)} Cr · overall ₹${(actualRevenue / 1e7).toFixed(2)} Cr`),
        check("Growth breadth", overall && overall.stores_growing + overall.stores_declining === overall.retail_stores, overall ? `${overall.stores_growing} growing + ${overall.stores_declining} declining = ${overall.retail_stores}` : "Overall breadth is unavailable")
      ]
    };
  }

  function trajectoryAudit() {
    const model = typeof D === "undefined" ? null : D;
    const lobs = ["Mac", "iPhone", "iPad"];
    const totalsAvailable = Boolean(model && model.totals && model.sub && lobs.every(lob => Array.isArray(model.totals[lob]) && Array.isArray(model.sub[lob])));
    const modelCount = totalsAvailable ? lobs.reduce((count, lob) => count + model.sub[lob].length, 0) : 0;
    const liveIndex = Number(model && model.completedWeeks);
    const expectedWeeks = liveIndex + 1;
    const liveWeek = model && model.liveWeek;
    const weekShapeValid = totalsAvailable && lobs.every(lob =>
      Number.isInteger(liveIndex) && liveIndex >= 1 &&
      model.totals[lob].length === expectedWeeks &&
      model.sub[lob].every(row => Array.isArray(row.weeks) && row.weeks.length === expectedWeeks)
    ) && Array.isArray(model.weeks) && model.weeks.length === expectedWeeks &&
      Array.isArray(model.dates) && model.dates.length === expectedWeeks;
    const liveTotalsReconcile = weekShapeValid && lobs.every(lob =>
      close(model.sub[lob].reduce((total, row) => total + (Number(row.weeks[liveIndex]) || 0), 0), model.totals[lob][liveIndex])
    );
    const movementsReconcile = weekShapeValid && model.moves && lobs.every(lob => {
      const expected = (Number(model.totals[lob][liveIndex]) / Number(model.totals[lob][liveIndex - 1]) - 1) * 100;
      return close(model.moves[lob] && model.moves[lob][liveIndex], expected);
    });
    const metadataValid = Boolean(model && model.latest && liveWeek && model.weeks[liveIndex] === liveWeek && Number(model.liveDays) >= 1 && Number(model.liveDays) <= 7);
    return {
      source: config.governance && config.governance.source,
      coverage: `${modelCount} models · ${lobs.length} LOBs`,
      dataThrough: model && model.latest,
      checks: [
        check("Weekly model shape", weekShapeValid, weekShapeValid ? `W1–${liveWeek} is available for every displayed model` : "One or more LOB or model is missing a weekly series"),
        check(`${liveWeek || "Live week"} model reconciliation`, liveTotalsReconcile, liveTotalsReconcile ? "Displayed model rows reconcile to each LOB live total" : "A live LOB total differs from its displayed model rows"),
        check(`${liveWeek || "Live week"} movement calculation`, movementsReconcile, movementsReconcile ? `Live movement matches ${liveWeek} versus W${liveIndex} totals` : "A live movement differs from the displayed totals"),
        check("Live-period metadata", metadataValid, metadataValid ? `${model.latest} · ${model.liveDays} elapsed day${Number(model.liveDays) === 1 ? "" : "s"}` : "The live week, as-of date, or elapsed-day count is unavailable")
      ]
    };
  }

  const adapters = { "daily-mtd": dailyAudit, "weekly-comparison": weeklyAudit, "quarter-to-date": qtdAudit, "year-over-year": yoyAudit, "weekly-trajectory": trajectoryAudit };
  let audit;
  try {
    audit = (adapters[dashboardId] || (() => ({ checks: [check("Dashboard configuration", false, "Unknown dashboard identifier.")] })))();
  } catch (error) {
    audit = { checks: [check("Reconciliation engine", false, error && error.message ? error.message : "Unexpected validation error.")] };
  }

  const checks = audit.checks || [];
  const failures = checks.filter(item => item.state === "fail").length;
  const warnings = checks.filter(item => item.state === "warning").length;
  const status = failures ? "Failed" : warnings ? "Warning" : "Passed";
  const state = failures ? "fail" : warnings ? "warning" : "pass";
  const governance = {
    dashboardId,
    status,
    state,
    checks,
    source: audit.source || (config.governance && config.governance.source) || "Embedded source",
    dataThrough: audit.dataThrough || (config.governance && config.governance.dataThrough) || (config.reporting && (config.reporting.asOf || config.reporting.label)) || "Not stated",
    coverage: audit.coverage || "Not stated",
    published: config.governance && config.governance.published
  };
  globalThis.DASHBOARD_GOVERNANCE = Object.freeze(governance);
  document.body.dataset.dashboardId = dashboardId;

  const shell = document.createElement("section");
  shell.className = "governance-shell";
  shell.setAttribute("aria-label", "Dashboard data confidence and navigation");
  shell.innerHTML = `
    <div class="governance-summary">
      <div class="governance-eyebrow">DATA CONFIDENCE</div>
      <div class="governance-source" title="${governance.source}">${governance.source}</div>
      <div class="governance-facts">
        <span><b>Through</b> ${governance.dataThrough}</span>
        <span><b>Coverage</b> ${governance.coverage}</span>
        <span><b>Published</b> ${governance.published || "Current build"}</span>
      </div>
    </div>
    <div class="governance-actions">
      <details class="governance-checks">
        <summary class="governance-status governance-status--${state}"><span class="governance-dot"></span>Validation ${status}<small>${checks.length} checks</small></summary>
        <div class="governance-panel">
          <strong>Automated reconciliation</strong>
          ${checks.map(item => `<div class="governance-check governance-check--${item.state}"><span></span><div><b>${item.name}</b><small>${item.detail}</small></div></div>`).join("")}
        </div>
      </details>
      <nav class="governance-switcher" aria-label="Intelligence dashboards">
        ${links.map(link => `<a href="${link.href}"${link.id === dashboardId ? ' aria-current="page"' : ""}>${link.label}</a>`).join("")}
      </nav>
    </div>`;

  const topbar = document.querySelector("main.main > .topbar");
  const main = document.querySelector("main");
  if (topbar) topbar.after(shell);
  else if (dashboardId === "year-over-year" && main) main.before(shell);
  else if (main) main.prepend(shell);
  else document.body.prepend(shell);

  document.addEventListener("click", event => {
    document.querySelectorAll(".governance-checks[open]").forEach(details => {
      if (!details.contains(event.target)) details.removeAttribute("open");
    });
  });
})();
