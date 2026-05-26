function renderEncTable(){
  const teamFilter = document.getElementById('enc-team-filter').value;
  let set = FC;
  if (teamFilter) set = set.filter(p => p.team === teamFilter);
  const sorted = [...set].sort((a,b) => b.enc - a.enc).slice(0, 200);

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
      </tr>
    `;
    }).join('');
    let provPanelHtml;
    if (!provRoster) {
      provPanelHtml = `<div class="prov-panel"><em style="color:var(--slate-700);font-size:12px">No per-provider detail in bundle</em></div>`;
    } else if (!provListForPanel.length) {
      const dm = DATA.metadata || {};
      provPanelHtml = `<div class="prov-panel"><em style="color:var(--slate-700);font-size:12px">No provider activity in the selected date range · ${provRoster} treating providers in the full bundle window (${dm.DataDateMin || '—'}–${dm.DataDateMax || '—'})</em></div>`;
    } else {
      let provTitle;
      if (!SLICER || !SLICER.dates || !SLICER.dates.length || (typeof slicerIsFullRange === 'function' && slicerIsFullRange())) {
        provTitle = `Treating providers (${provRoster})`;
      } else {
        provTitle = `Treating providers — ${provShown} with activity in selected range · ${provRoster} in full bundle`;
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
    const rowId = 'er-' + i;
    return `
      <tr class="enc-row" onclick="toggleEncRow('${rowId}')" style="cursor:pointer">
        <td>${i+1}</td>
        <td><strong>${escapeHtml(p.name)}</strong></td>
        <td><code style="font-size:11px;font-family:var(--font-mono);color:var(--slate-700)">${escapeHtml(p.bpn)}</code></td>
        <td>${escapeHtml(p.bc) || '—'}</td>
        <td style="font-size:11px;color:var(--slate-700)">${escapeHtml(p.team) || '—'}</td>
        <td>${pmaBadge(p.pma)}</td>
        <td>${versionChip(p.appVer, DATA.metadata.LatestVersion, p.onLatest)}</td>
        <td>${personaBadge(p.persona)}</td>
        <td><strong>${fmtFull(p.enc)}</strong></td>
        <td>${encounterTableProviderCountHtml(p)}</td>
        <td>${statusBadge(p.status)}</td>
      </tr>
      <tr class="prov-detail-row" id="${rowId}" style="display:none">
        <td class="prov-detail-cell" colspan="11">${provPanelHtml}</td>
      </tr>`;
  }).join('');

  document.getElementById('enc-tbody').innerHTML = rows
    || '<tr><td colspan="11" class="empty"><p>No clients in current filter</p></td></tr>';
}