function renderSpecialityChart(set){
  const specs = {};
  for (const p of set){
    const s = normalizeSpeciality(p.speciality);
    for (const pr of (p.providers || [])){
      if (!specs[s]) specs[s] = { total: 0, enc: 0, feat: 0, none: 0, noBc: 0 };
      specs[s].total++;
      const e2s = provider30dEncFeatFromDaily(pr.provKey);
      const e = e2s.enc, f = e2s.feat;
      if (e > 0) specs[s].enc++;
      else if (f > 0) specs[s].feat++;
      else specs[s].none++;
      if (!p.bc) specs[s].noBc++;
    }
  }
  const arr = Object.entries(specs)
    .filter(([s]) => s !== 'Unknown')
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 12);

  // Side-by-side: chart on the left, summary table on the right
  const summaryRows = arr.map(([s, st]) => `
    <tr>
      <td style="padding:4px 8px;font-size:12px">${escapeHtml(s)}</td>
      <td style="padding:4px 8px;text-align:right;font-weight:700;font-size:12px;font-variant-numeric:tabular-nums">${fmtFull(st.total)}</td>
      <td style="padding:4px 8px;text-align:right;font-size:12px;color:var(--brand-orange);font-weight:700">${pct(st.enc, st.total)}</td>
      <td style="padding:4px 8px;text-align:right;font-size:12px;color:${st.noBc > 0 ? 'var(--brand-burnt-orange)' : 'var(--slate-700)'};font-weight:${st.noBc > 0 ? '700' : '400'}">${st.noBc > 0 ? st.noBc : '\u2014'}</td>
    </tr>`).join('');

  const html = `
    <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:24px;align-items:start">
      <div style="position:relative;height:${Math.max(280, arr.length * 32)}px">
        <canvas id="c-spec-bar"></canvas>
      </div>
      <div style="overflow:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr>
              <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:800;color:var(--mu);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--bd)">Speciality</th>
              <th style="padding:6px 8px;text-align:right;font-size:10px;font-weight:800;color:var(--mu);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--bd)">Providers</th>
              <th style="padding:6px 8px;text-align:right;font-size:10px;font-weight:800;color:var(--mu);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--bd)">% Enc</th>
              <th style="padding:6px 8px;text-align:right;font-size:10px;font-weight:800;color:var(--mu);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--bd)">No BC</th>
            </tr>
          </thead>
          <tbody>${summaryRows}</tbody>
        </table>
      </div>
    </div>
  `;
  document.getElementById('spec-chart').innerHTML = html;

  killChart('spec-bar');
  const ctx = document.getElementById('c-spec-bar').getContext('2d');
  charts['spec-bar'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: arr.map(([s]) => s.length > 22 ? s.slice(0, 20) + '\u2026' : s),
      datasets: [
        { label: 'Encounter',    data: arr.map(([,s]) => s.enc),
          backgroundColor: getCss('--brand-orange'), stack: 'a', borderRadius: 4, borderSkipped: false },
        { label: 'Feature-only', data: arr.map(([,s]) => s.feat),
          backgroundColor: getCss('--brand-purple'), stack: 'a', borderRadius: 4, borderSkipped: false },
        { label: 'No activity',  data: arr.map(([,s]) => s.none),
          backgroundColor: getCss('--slate-300'),    stack: 'a', borderRadius: 4, borderSkipped: false },
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            footer: (items) => {
              const i = items[0].dataIndex;
              const total = arr[i][1].total;
              const noBc  = arr[i][1].noBc;
              return 'Providers: ' + total + (noBc > 0 ? '  \u00b7  No BC (prov.): ' + noBc : '');
            }
          }
        }
      },
      scales: {
        x: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,.04)' }, ticks: { precision: 0 } },
        y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
      }
    }
  });
}