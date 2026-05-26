function renderExec(){
  applyChartDefaults();
  const set = FC;
  const kpiSet = fcForKpiStats();
  const kb = kpiBundleForFilteredPractices(kpiSet);
  const pracN = kb.pracN;
  const enc = kb.encProv, feat = kb.featProv, none = kb.noneProv;
  const activeProv = kb.activeProv;
  const provTotal = kb.roster;
  let noBcProv = 0;
  for (const p of kpiSet){
    if (!p.bc) noBcProv += (p.providers || []).length;
  }

  const wExec = getExec30dWindow();
  const winSub = wExec.nDays
    ? (wExec.nDays < 30
        ? ('Activity lookback: ' + formatDateShort(wExec.startStr) + '–' + formatDateShort(wExec.endStr) + ' (' + wExec.nDays + 'd, full range)')
        : ('Activity lookback: ' + formatDateShort(wExec.startStr) + '–' + formatDateShort(wExec.endStr) + ' (trailing 30d in range)'))
    : 'Set a date range in the slicer for 30d activity';
  const eligiblePrac = countEligiblePractices();
  const pracSub = FC.length === DATA.practices.length && kb.pracN === eligiblePrac
    ? (fmtFull(pracN) + ' billing practices')
    : (fmtFull(pracN) + ' practices in filter');

  document.getElementById('ek-prac').textContent = fmtFull(pracN);
  document.getElementById('ek-prac-sub').textContent = pracSub + ' · ' + winSub;
  document.getElementById('ek-roster').textContent = fmtFull(provTotal);
  document.getElementById('ek-roster-sub').textContent = 'active + inactive in filter';
  document.getElementById('ek-active').textContent = fmtFull(activeProv);
  document.getElementById('ek-active-sub').textContent = getActiveProvidersKpiSubtitle();
  document.getElementById('ek-inactive').textContent = fmtFull(none);
  document.getElementById('ek-inactive-sub').textContent = provTotal ? (pct(none, provTotal) + ' of roster (treating providers)') : '0%';
  document.getElementById('ek-favg').textContent = activeProv
    ? (kb.featPerActive >= 10 ? kb.featPerActive.toFixed(1) : kb.featPerActive.toFixed(2))
    : '—';
  document.getElementById('ek-favg-sub').textContent = activeProv
    ? 'mean feature events · active providers only'
    : 'no active providers in window';

  const elActiveKpi = document.getElementById('ek-active-kpi');
  if (elActiveKpi) {
    elActiveKpi.title = wExec.nDays
      ? ('Active = encounter (' + fmtFull(enc) + ') + feature-only (' + fmtFull(feat) + ') = ' + fmtFull(activeProv) +
         ' in ' + wExec.nDays + 'd ending ' + formatDate(wExec.endStr) + '. Inactive = ' + fmtFull(none) + ' on roster.')
      : 'Set the date slicer to compute the activity window.';
  }

  document.getElementById('ek-enc').textContent = fmtFull(enc);
  document.getElementById('ek-enc-sub').textContent = activeProv
    ? (pct(enc, activeProv) + ' of active · ' + pct(enc, provTotal) + ' of roster')
    : '0%';
  document.getElementById('ek-feat').textContent = fmtFull(feat);
  document.getElementById('ek-feat-sub').textContent = activeProv
    ? (pct(feat, activeProv) + ' of active (feature-only)')
    : '0%';
  document.getElementById('ek-nobc').textContent = fmtFull(noBcProv);
  // Engagement bar: share of treating providers
  const encPct = provTotal ? (100*enc/provTotal) : 0;
  const featPct = provTotal ? (100*feat/provTotal) : 0;
  const nonePct = provTotal ? (100*none/provTotal) : 0;
  document.getElementById('bar-enc').style.width = encPct + '%';
  document.getElementById('bar-feat').style.width = featPct + '%';
  document.getElementById('bar-none').style.width = nonePct + '%';
  document.getElementById('bar-enc').textContent = encPct >= 6 ? Math.round(encPct)+'%' : '';
  document.getElementById('bar-feat').textContent = featPct >= 6 ? Math.round(featPct)+'%' : '';
  document.getElementById('bar-none').textContent = nonePct >= 6 ? Math.round(nonePct)+'%' : '';

  document.getElementById('leg-enc').textContent = fmtFull(enc);
  document.getElementById('leg-feat').textContent = fmtFull(feat);
  document.getElementById('leg-none').textContent = fmtFull(none);
  document.getElementById('leg-enc-pct').textContent = '· ' + (provTotal ? pct(enc, provTotal) : '0%');
  document.getElementById('leg-feat-pct').textContent = '· ' + (provTotal ? pct(feat, provTotal) : '0%');
  document.getElementById('leg-none-pct').textContent = '· ' + (provTotal ? pct(none, provTotal) : '0%');

  // Per team: provider-level engagement; No BC = providers in practices with no BC
  const teams = {};
  for (const p of kpiSet){
    const tm = p.team || '— No team —';
    if (!teams[tm]) teams[tm] = { prac:0, enc:0, feat:0, none:0, noBc:0, prov:0 };
    teams[tm].prac++;
    for (const pr of (p.providers || [])){
      teams[tm].prov++;
      const e2 = provider30dEncFeatFromDaily(pr.provKey);
      const e = e2.enc, f = e2.feat;
      if (e > 0) teams[tm].enc++;
      else if (f > 0) teams[tm].feat++;
      else teams[tm].none++;
    }
    if (!p.bc) teams[tm].noBc += (p.providers || []).length;
  }
  const teamRows = Object.entries(teams)
    .sort((a,b) => b[1].prov - a[1].prov)
    .map(([name, s]) => {
      const tprov = s.enc + s.feat + s.none;
      const encShare = tprov ? pct(s.enc, tprov) : '0%';
      return `<tr>
        <td><strong>${escapeHtml(name)}</strong></td>
        <td>${fmtFull(s.prov)}</td>
        <td><span style="color:var(--brand-orange);font-weight:700">${fmtFull(s.enc)}</span></td>
        <td><span style="color:var(--brand-purple);font-weight:700">${fmtFull(s.feat)}</span></td>
        <td><span style="color:var(--slate-700)">${fmtFull(s.none)}</span></td>
        <td><strong>${encShare}</strong></td>
        <td>${s.noBc > 0 ? `<span class="badge b-no-bc">${s.noBc}</span>` : '—'}</td>
      </tr>`;
    }).join('');
  document.getElementById('team-rollup-tbody').innerHTML = teamRows
    || '<tr><td colspan="7" class="empty"><p>No clients in current filter</p></td></tr>';

  // PMA split — treating providers in each PMA (inherit practice PMA)
  let novaProv = 0, mpsProv = 0;
  for (const p of kpiSet){
    const n = (p.providers || []).length;
    if (p.pma === 'Nova') novaProv += n;
    else if (p.pma === 'myMPS') mpsProv += n;
  }
  const sumP = novaProv + mpsProv;
  const mpsPct = sumP ? (100*mpsProv/sumP) : 0;
  const novaPct = sumP ? (100*novaProv/sumP) : 0;

  document.getElementById('pma-mps').style.width = mpsPct + '%';
  document.getElementById('pma-nova').style.width = novaPct + '%';
  document.getElementById('pma-mps').textContent = mpsPct >= 8 ? `myMPS · ${Math.round(mpsPct)}%` : '';
  document.getElementById('pma-nova').textContent = novaPct >= 8 ? `Nova · ${Math.round(novaPct)}%` : '';
  document.getElementById('pma-mps-n').textContent = fmtFull(mpsProv);
  document.getElementById('pma-nova-n').textContent = fmtFull(novaProv);

  // Version — count treating providers (practice app version)
  const verCounts = {};
  for (const p of kpiSet){
    if (!p.appVer) continue;
    const w = (p.providers || []).length;
    if (!w) continue;
    verCounts[p.appVer] = (verCounts[p.appVer] || 0) + w;
  }
  const latest = (DATA.metadata.LatestVersion || '').trim();
  const verSorted = Object.entries(verCounts).sort((a,b) => b[1] - a[1]).slice(0, 6);
  const maxVerCount = verSorted.length ? verSorted[0][1] : 1;
  const verHtml = verSorted.map(([v,c]) => {
    const isLatest = v === latest;
    const w = (c / maxVerCount) * 100;
    return `<div style="display:flex;align-items:center;gap:10px;font-size:12px">
      <span style="font-family:var(--font-mono);font-weight:700;min-width:54px">${escapeHtml(v)}${isLatest ? ' <span style="color:var(--green-100)">★</span>' : ''}</span>
      <div style="flex:1;height:8px;background:var(--slate-100);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${w}%;background:${isLatest ? 'var(--green-100)' : 'var(--brand-orange)'};border-radius:4px"></div>
      </div>
      <span style="color:var(--slate-700);font-weight:700;min-width:36px;text-align:right">${fmtFull(c)}</span>
    </div>`;
  }).join('');
  document.getElementById('version-list').innerHTML = verHtml || '<div style="font-size:12px;color:var(--slate-700)">No version data</div>';

  // === Daily users chart ===
  killChart('daily-users');
  const ctx1 = document.getElementById('c-daily-users').getContext('2d');
  charts['daily-users'] = new Chart(ctx1, {
    type: 'line',
    data: {
      labels: dailyForSliceKpi().map(d => formatDateShort(d.d)),
      datasets: [
        { label: 'Encounter users', data: dailyForSliceKpi().map(d => d.encUsers),
          borderColor: getCss('--brand-orange'), backgroundColor: 'rgba(247,148,29,0.12)',
          tension: .35, fill: true, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 },
        { label: 'Feature-only users', data: dailyForSliceKpi().map(d => d.featUsers),
          borderColor: getCss('--brand-purple'), backgroundColor: 'rgba(119,87,236,0.10)',
          tension: .35, fill: true, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 },
      ]
    },
    options: chartLineOpts(),
  });

  // === Team bar chart ===
  killChart('team-bar');
  const ctx2 = document.getElementById('c-team-bar').getContext('2d');
  const teamArr = Object.entries(teams).sort((a,b) => b[1].prov - a[1].prov);
  charts['team-bar'] = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: teamArr.map(([t]) => t.replace(/Meraki\s*Outbound/i,'Meraki').replace(/^HB\s+/,'')),
      datasets: [
        { label: 'Encounter', data: teamArr.map(([,s]) => s.enc),
          backgroundColor: getCss('--brand-orange'), stack: 'a', borderRadius: 4 },
        { label: 'Feature-only', data: teamArr.map(([,s]) => s.feat),
          backgroundColor: getCss('--brand-purple'), stack: 'a', borderRadius: 4 },
        { label: 'No activity', data: teamArr.map(([,s]) => s.none),
          backgroundColor: getCss('--slate-300'), stack: 'a', borderRadius: 4 },
      ]
    },
    options: chartBarStackedOpts(),
  });

  // === Speciality split ===
  renderSpecialityChart(kpiSet);

  // === BC portfolio cards ===
  renderBCPortfolioCards(kpiSet);
}