function renderBCView(){
  const kpiSet = fcForKpiStats();
  const kb = kpiBundleForFilteredPractices(kpiSet);
  let sumEnc = 0, sumFeat = 0;
  for (const p of kpiSet) {
    sumEnc += (p.enc || 0);
    sumFeat += (p.feat || 0);
  }
  const wExec = getExec30dWindow();
  const winLab = wExec.nDays
    ? (wExec.nDays >= 30 ? 'Up to 30d ending range' : (wExec.nDays + 'd ending range'))
    : '';
  const fullR = slicerIsFullRange();
  const dSpan = slicerDaySpan();
  const volSub = fullR
    ? 'KPI practices (test sites excluded) · full period in bundle'
    : ('KPI practices (test sites excluded) · selected ' + dSpan + 'd');

  function bcSetKpi(valId, subId, valText, subText){
    const v = document.getElementById(valId);
    if (v) v.textContent = valText;
    const s = document.getElementById(subId);
    if (s) s.textContent = subText;
  }
  bcSetKpi('bc-kpi-practices', 'bc-kpi-practices-sub', fmtFull(kb.pracN),
    FC.length === DATA.practices.length && kb.pracN === countEligiblePractices()
      ? 'eligible billing practices (test sites excluded from KPIs)'
      : 'practices in filter (test sites excluded from KPIs)');
  bcSetKpi('bc-kpi-roster', 'bc-kpi-roster-sub', fmtFull(kb.roster), 'active + inactive in filter');
  bcSetKpi('bc-kpi-active', 'bc-kpi-active-sub', fmtFull(kb.activeProv), getActiveProvidersKpiSubtitle());
  bcSetKpi('bc-kpi-inactive', 'bc-kpi-inactive-sub', fmtFull(kb.noneProv), winLab + ' · no activity');
  bcSetKpi('bc-kpi-favg', 'bc-kpi-favg-sub',
    kb.activeProv ? (kb.featPerActive >= 10 ? kb.featPerActive.toFixed(1) : kb.featPerActive.toFixed(2)) : '—',
    kb.activeProv ? 'mean · active providers only' : 'no active providers');
  bcSetKpi('bc-kpi-sum-enc', 'bc-kpi-sum-enc-sub', fmtFull(sumEnc), volSub);
  bcSetKpi('bc-kpi-sum-feat', 'bc-kpi-sum-feat-sub', fmtFull(sumFeat), volSub);

  const sorted = [...FC].sort((a,b) => {
    if (a.bc && !b.bc) return -1;
    if (!a.bc && b.bc) return 1;
    return b.enc - a.enc;
  }).slice(0, 250);

  const rows = sorted.map((p, i) => {
    const { list: provListForPanel, shown: provShown, roster: provRoster } = providersForTablePanel(p);
    const provHtml = provListForPanel.map(pr => {
      const sl = providerStatsFromDaily(pr.provKey);
      const e = sl ? sl.enc : pr.enc;
      const f = sl ? sl.feat : pr.feat;
      const d = sl ? sl.days : pr.days;
      const la = sl ? sl.lastActive : pr.lastActive;
      return `
      <tr>
        <td><strong>${escapeHtml(pr.name)}</strong></td>
        <td><code style="font-size:11px;font-family:var(--font-mono)">${escapeHtml(pr.tpn)}</code></td>
        <td style="text-align:right"><strong>${fmtFull(e)}</strong></td>
        <td style="text-align:right">${fmtFull(f)}</td>
        <td>${d} day${d === 1 ? '' : 's'}</td>
        <td>${la ? formatDateShort(la) : '—'}</td>
        <td>${pr.appVer ? `<span class="badge ${pr.appVer === DATA.metadata.LatestVersion ? 'b-ver-ok' : 'b-ver-old'}">${escapeHtml(pr.appVer)}</span>` : '—'}</td>
        <td><button type="button" class="feat-btn" data-prov-key="${escapeHtmlAttr(pr.provKey)}" onclick="event.stopPropagation();openProviderFeaturesFromBtn(this)">📊 View features</button></td>
      </tr>`;
    }).join('');
    let provPanelHtml;
    if (!provRoster) {
      provPanelHtml = `
      <div class="prov-panel">
        <em style="color:var(--slate-700);font-size:12px">No per-provider detail in bundle — practice-level events: ${fmtFull(p.feat)}</em>
      </div>`;
    } else if (!provListForPanel.length) {
      const dm = DATA.metadata || {};
      provPanelHtml = `
      <div class="prov-panel">
        <em style="color:var(--slate-700);font-size:12px">No provider activity in the selected date range · ${provRoster} treating providers in the full bundle (${dm.DataDateMin || '—'}–${dm.DataDateMax || '—'}) — practice-level events: ${fmtFull(p.feat)}</em>
      </div>`;
    } else {
      let provTitle;
      if (!SLICER || !SLICER.dates || !SLICER.dates.length || (typeof slicerIsFullRange === 'function' && slicerIsFullRange())) {
        provTitle = `${escapeHtml(p.name)} · ${provRoster} treating provider${provRoster === 1 ? '' : 's'} · click View features for per-provider breakdown`;
      } else {
        provTitle = `${escapeHtml(p.name)} · ${provShown} with activity in selected range · ${provRoster} in full bundle · click View features for breakdown`;
      }
      provPanelHtml = `
      <div class="prov-panel">
        <div class="prov-panel-title">${provTitle}</div>
        <div class="prov-table"><table>
          <thead><tr><th>Provider</th><th>TPN</th><th style="text-align:right">Enc</th><th style="text-align:right">Feat events</th><th>Days active</th><th>Last active</th><th>Version</th><th></th></tr></thead>
          <tbody>${provHtml}</tbody>
        </table></div>
      </div>`;
    }
    const rid = 'bv-' + i;
    return `
      <tr class="bc-row" onclick="toggleEncRow('${rid}')" style="cursor:pointer">
        <td><strong>${escapeHtml(p.name)}</strong></td>
        <td><code style="font-size:11px;font-family:var(--font-mono);color:var(--slate-700)">${escapeHtml(p.bpn)}</code></td>
        <td style="text-align:center">${bcViewProviderCountHtml(p)}</td>
        <td>${p.bc ? escapeHtml(p.bc) : '<span class="badge b-no-bc">No BC</span>'}</td>
        <td style="font-size:11px;color:var(--slate-700)">${escapeHtml(p.team) || '—'}</td>
        <td>${pmaBadge(p.pma)}</td>
        <td>${versionChip(p.appVer, DATA.metadata.LatestVersion, p.onLatest)}</td>
        <td>${statusBadge(p.status)}</td>
        <td>${engagementBadge(p.engagement)}</td>
        <td><strong>${fmtFull(p.enc)}</strong></td>
        <td>${fmt(p.feat)}</td>
        <td style="font-size:11px;color:var(--slate-700)">${p.lastActive ? formatDateShort(p.lastActive) : '—'}</td>
        <td>${personaBadge(p.persona)}</td>
      </tr>
      <tr class="prov-detail-row" id="${rid}" style="display:none">
        <td class="prov-detail-cell" colspan="13">${provPanelHtml}</td>
      </tr>`;
  }).join('');
  document.getElementById('bc-tbody').innerHTML = rows
    || '<tr><td colspan="13" class="empty"><p>No clients in current filter</p></td></tr>';
}