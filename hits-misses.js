(() => {
  const model = typeof D === 'undefined' ? null : D;
  if (!model?.sub || !model.completedWeeks || model.completedWeeks < 2) return;
  const currentIndex = model.completedWeeks - 1;
  const priorIndex = currentIndex - 1;
  const currentWeek = model.weeks[currentIndex], priorWeek = model.weeks[priorIndex];
  const pct = value => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  const rows = Object.entries(model.sub).flatMap(([lob, products]) => products.map(product => {
    const prior = Number(product.weeks[priorIndex] || 0), current = Number(product.weeks[currentIndex] || 0);
    return { lob, name: product.name, prior, current, delta: current - prior, movement: prior ? ((current - prior) / prior) * 100 : null };
  }));
  const hits = rows.filter(r => r.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5);
  const misses = rows.filter(r => r.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5);
  const lobDelta = lob => Number(model.totals[lob][currentIndex]) - Number(model.totals[lob][priorIndex]);
  const item = (r, i, hit) => {
    const totalMove = lobDelta(r.lob);
    const share = totalMove ? Math.abs(r.delta / totalMove) * 100 : 0;
    const lowBase = r.prior < 10 ? ' The prior-week base is small, so treat the percentage as directional and use the unit change for the decision.' : '';
    const reason = hit
      ? `${r.name} added ${r.delta} units. It offset ${share.toFixed(0)}% of the absolute ${r.lob} LOB movement; ${r.lob} overall ${totalMove >= 0 ? 'grew' : 'declined'} by ${Math.abs(totalMove)} units.${lowBase}`
      : `${r.name} lost ${Math.abs(r.delta)} units and explains about ${share.toFixed(0)}% of the absolute ${r.lob} LOB movement. This makes it a material driver, not merely a percentage fluctuation.${lowBase}`;
    const action = hit ? `Protect availability and visibility for ${r.name}; test whether the gain can be repeated across stores.` : `Check stock, offer visibility and conversion for ${r.name}; assign a recovery owner before the next completed week.`;
    return `<div class="hm-item"><div class="hm-rank">${i + 1}</div><div><div class="hm-title">${r.name} <small>· ${r.lob}</small></div><div class="hm-signal">${r.prior} → ${r.current} units · ${r.movement == null ? 'new from zero base' : pct(r.movement)}</div><div class="hm-reason">${reason}</div><div class="hm-action"><b>Action:</b> ${action}</div></div></div>`;
  };
  const section = document.createElement('section');
  section.className = 'hm-section';
  section.innerHTML = `<div class="hm-head"><div><h2>Hits &amp; Misses — Weekly Trajectory</h2><p>Latest completed-week model movements, explained through their unit contribution to the parent LOB.</p></div><span class="hm-period">${currentWeek} vs ${priorWeek}</span></div><div class="hm-grid"><div class="hm-panel hm-hit"><div class="hm-panel-title">Hits — positive model momentum</div><div class="hm-list">${hits.map((r, i) => item(r, i, true)).join('')}</div></div><div class="hm-panel hm-miss"><div class="hm-panel-title">Misses — material model drag</div><div class="hm-list">${misses.map((r, i) => item(r, i, false)).join('')}</div></div></div><div class="hm-note"><b>Method:</b> Rankings use absolute model-unit change in the latest completed week (${currentWeek} vs ${priorWeek}); percentage movement is supporting context only. ${model.liveWeek} is a ${model.liveDays}-day partial week and is deliberately excluded to prevent a false comparison.</div>`;
  const host = document.querySelector('#story');
  if (host) host.appendChild(section);
  globalThis.HITS_MISSES_MODEL = { period: `${currentWeek} vs ${priorWeek}`, hits, misses };
})();
