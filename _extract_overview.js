function renderOverview(){
  applyChartDefaults();
  const set = FC;
  const kpiSet = fcForKpiStats();
  const totalEnc = kpiSet.reduce((s,p) => s + p.enc, 0);
  const totalAI = kpiSet.reduce((s,p) => s + (p.cats['5. AI Features']||0), 0);
  const kb = kpiBundleForFilteredPractices(kpiSet);

  document.getElementById('ov-kpi-prac').textContent = fmtFull(kb.pracN);
  document.getElementById('ov-kpi-prac-sub').textContent =
    FC.length === DATA.practices.length && kb.pracN === countEligiblePractices()
    ? 'all billing practices'
    : 'practices in filter';

  document.getElementById('ov-kpi-roster').textContent = fmtFull(kb.roster);
  document.getElementById('ov-kpi-roster-sub').textContent = 'active + inactive in filter';

  document.getElementById('ov-active').textContent = fmtFull(kb.activeProv);
  document.getElementById('ov-active-sub').textContent = getActiveProvidersKpiSubtitle();

  document.getElementById('ov-kpi-inactive').textContent = fmtFull(kb.noneProv);
  document.getElementById('ov-kpi-inactive-sub').textContent = kb.roster ? (pct(kb.noneProv, kb.roster) + ' of roster') : '—';

  document.getElementById('ov-kpi-favg').textContent = kb.activeProv
    ? (kb.featPerActive >= 10 ? kb.featPerActive.toFixed(1) : kb.featPerActive.toFixed(2))
    : '—';
  document.getElementById('ov-kpi-favg-sub').textContent = kb.activeProv ? 'mean · active providers only' : 'no active providers';

  document.getElementById('ov-enc').textContent = fmtFull(totalEnc);
  document.getElementById('ov-ai').textContent = fmtFull(totalAI);
  const daySpan = (SLICER && SLICER.dates && SLICER.dates.length)
    ? (SLICER.endIdx - SLICER.startIdx + 1)
    : 0;
  const avgEncPerDay = daySpan ? (totalEnc / daySpan) : 0;
  document.getElementById('ov-enc-pct').textContent = daySpan
    ? ((avgEncPerDay >= 100 ? fmt(Math.round(avgEncPerDay)) : avgEncPerDay.toFixed(1)) + ' avg consult-complete events/day in range')
    : '—';

  // Daily users chart (overview variant — uses same data)
  killChart('ov-daily');
  const ctx = document.getElementById('c-ov-daily').getContext('2d');
  charts['ov-daily'] = new Chart(ctx, {
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

  // Personas donut
  const pers = {};
  for (const p of kpiSet){
    pers[p.persona] = (pers[p.persona] || 0) + 1;
  }
  const personaKeys = ['Power Clinical User','Active Clinical User','Low Clinical User','Feature-Only User','Inactive','Dormant'];
  const personaColors = [getCss('--green-100'), getCss('--brand-orange'), getCss('--blue-100'), getCss('--brand-purple'), getCss('--brand-burnt-orange'), getCss('--slate-500')];
  killChart('personas');
  const ctx2 = document.getElementById('c-personas').getContext('2d');
  charts['personas'] = new Chart(ctx2, {
    type: 'doughnut',
    data: {
      labels: personaKeys,
      datasets: [{
        data: personaKeys.map(k => pers[k] || 0),
        backgroundColor: personaColors,
        borderColor: '#fff', borderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 8, padding: 8, font: { size: 11 } } },
        tooltip: {
          callbacks: { label: (c) => `${c.label}: ${fmtFull(c.parsed)} (${pct(c.parsed, kpiSet.length)})` }
        }
      }
    }
  });

  // Top clients by encounters
  const top10 = [...kpiSet].filter(p => p.enc > 0).sort((a,b) => b.enc - a.enc).slice(0, 10);
  killChart('top-clients');
  const ctx3 = document.getElementById('c-top-clients').getContext('2d');
  charts['top-clients'] = new Chart(ctx3, {
    type: 'bar',
    data: {
      labels: top10.map(p => p.name.length > 24 ? p.name.slice(0,22)+'…' : p.name),
      datasets: [{
        label: 'Encounters',
        data: top10.map(p => p.enc),
        backgroundColor: getCss('--brand-orange'), borderRadius: 6,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.04)' } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } },
      }
    }
  });

  // Category pie (meaningful events only)
  const catNames = ['1. Encounters','2. Clinical Doc','3. Scripts','4. Pathology','5. AI Features','6. Preventative Care','7. Task Management','8. Customization'];
  const catTotals = catNames.map(c => kpiSet.reduce((s,p) => s + (p.cats[c]||0), 0));
  const catColors = [
    getCss('--brand-orange'), getCss('--brand-purple'),
    getCss('--blue-100'), '#06b6d4',
    getCss('--brand-bright-green'), '#84cc16',
    '#f59e0b', getCss('--slate-700')
  ];
  killChart('cat-pie');
  const ctx4 = document.getElementById('c-cat-pie').getContext('2d');
  charts['cat-pie'] = new Chart(ctx4, {
    type: 'doughnut',
    data: {
      labels: catNames.map(c => c.replace(/^\d+\.\s*/,'')),
      datasets: [{ data: catTotals, backgroundColor: catColors, borderColor: '#fff', borderWidth: 2 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 8, padding: 6, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (c) => {
              const total = catTotals.reduce((a,b) => a+b, 0);
              return `${c.label}: ${fmtFull(c.parsed)} (${pct(c.parsed, total)})`;
            }
          }
        }
      }
    }
  });
}

/* ============================================================
   ENCOUNTERS
   ============================================================ */
