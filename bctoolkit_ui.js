/** BC toolkit tab — Case Reason Finder, Resources & Videos, Top Tips */
(function () {
  var sel = null;
  var filt = '';

  function bctkGoTab(id, el) {
    document.querySelectorAll('#s-bctoolkit .bctk-stab').forEach(function (t) {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('#s-bctoolkit .bctk-spanel').forEach(function (p) {
      p.classList.remove('active');
    });
    el.classList.add('active');
    el.setAttribute('aria-selected', 'true');
    var panel = document.getElementById('bctk-sp-' + id);
    if (panel) panel.classList.add('active');
    if (window.trackUsageEvent) window.trackUsageEvent('toolkit_subtab_view', id, {});
  }
  window.bctkGoTab = bctkGoTab;

  function bctkFilterReasons() {
    filt = document.getElementById('bctk-cat-sel').value;
    bctkRenderReasonList();
    if (window.trackUsageEvent) window.trackUsageEvent('toolkit_reason_filter', filt || 'all', {});
  }
  window.bctkFilterReasons = bctkFilterReasons;

  function bctkPill(type) {
    var m = { Preventable: 'prev', 'Non-preventable': 'nonp', 'Non-Preventable': 'nonp', Financial: 'fin' };
    return '<span class="bctk-pill bctk-p-' + (m[type] || 'nonp') + '">' + type + '</span>';
  }

  function bctkStep(date, action, logic, cls) {
    return (
      '<div class="bctk-step' +
      (cls ? ' ' + cls : '') +
      '">' +
      '<div class="bctk-step-date">' +
      date +
      '</div>' +
      '<div class="bctk-step-action">' +
      action +
      '</div>' +
      (logic ? '<div class="bctk-step-logic">' + logic + '</div>' : '') +
      '</div>'
    );
  }

  function bctkMonth(title, steps) {
    return (
      '<div class="bctk-cad-month"><div class="bctk-cad-head">' +
      '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> ' +
      title +
      '</div>' +
      steps +
      '</div>'
    );
  }

  function bctkRenderCadence(r) {
    var el = document.getElementById('bctk-cad-content');
    var desc = document.getElementById('bctk-cad-desc');
    if (!el || !desc) return;
    desc.textContent = '';
    var follow = String((r && r.follow) || '')
      .trim()
      .toLowerCase();
    var intervention = String((r && r.int) || '')
      .trim()
      .toLowerCase();
    var logic = String((r && r.logic) || '')
      .trim()
      .toLowerCase();

    // Normalize matching so minor text/case differences in data still trigger
    // the intended cadence branch.
    var isL1 = follow.indexOf('create follow-up case') !== -1;
    var isEsc = follow.indexOf('escalate to bc lead') !== -1;
    var isClose = follow.indexOf('close case') !== -1 || intervention === 'no intervention';
    if (!isEsc && logic.indexOf('bc lead') !== -1) isEsc = true;
    var html = '';
    if (isClose) {
      html =
        '<div class="bctk-cad-grid bctk-cad-single">' +
        bctkMonth(
          'Immediate action',
          bctkStep('Action', r.int, '', '') + bctkStep('Outcome', r.follow, 'No further follow-up required', '')
        ) +
        '</div>';
    } else if (isEsc) {
      html =
        '<div class="bctk-cad-grid">' +
        bctkMonth(
          'BC action',
          bctkStep('BI Report', 'Client appears as non-user', '', '') +
            bctkStep('3C — 5th', r.int, 'Log in tracking notes', '') +
            bctkStep('3C — 20th', 'Escalate to BC Lead', 'Provide tracking notes', '')
        ) +
        bctkMonth(
          'If BC Lead approves',
          bctkStep('Decision', 'Close case', 'Case closed and resolved', 'gr') +
            bctkStep('Outcome', 'No further action required', '', '')
        ) +
        bctkMonth(
          'If BC Lead disapproves',
          bctkStep('Decision', 'Case reassigned back to BC', 'Review and retry', 'or') +
            bctkStep('Next step', 'Revisit reason and update tracking notes', '', '')
        ) +
        '</div>';
    } else if (isL1) {
      html =
        '<div class="bctk-cad-grid">' +
        bctkMonth(
          'Month 1',
          bctkStep('BI Report', 'Client appears as non-user', '', '') +
            bctkStep('3C — 5th', 'Create case in 3C', 'Intervention: ' + r.int, '') +
            bctkStep('3C — 20th', 'Follow-up intervention', 'Create follow-up task for BC', '')
        ) +
        bctkMonth(
          'Month 2',
          bctkStep('BI Report', 'Check if client still appears', '', '') +
            bctkStep('If present', 'Create new case in 3C', 'Repeat: ' + r.int, 'gr') +
            bctkStep('If NOT present', 'No cases / No follow-up', 'Client resolved', 'gy')
        ) +
        bctkMonth(
          'Month 3',
          bctkStep('BI Report', 'Check if client still appears', '', '') +
            bctkStep('If present', 'Escalate — create case for BC Lead', 'Reassign to BC — close the loop', 'pu') +
            bctkStep('If NOT present', 'No cases — close the loop', 'Client resolved', 'gy')
        ) +
        '</div>';
    } else {
      html =
        '<div class="bctk-cad-grid bctk-cad-single">' +
        bctkMonth(
          'Action',
          bctkStep('Intervention', r.int, '', '') + bctkStep('Follow-up', r.follow, r.logic, '')
        ) +
        '</div>';
    }
    el.innerHTML = html;
  }

  function bctkPickReason(idx) {
    var R = window.BCTK_REASONS;
    sel = R[idx];
    bctkRenderReasonList();
    var r = sel;
    if (window.trackUsageEvent) {
      window.trackUsageEvent('toolkit_reason_selected', r.sub || '', {
        category: r.cat || '',
        type: r.type || '',
        followUp: r.follow || '',
      });
    }
    var res = document.getElementById('bctk-result');
    res.classList.add('show');
    document.getElementById('bctk-r-head').textContent = r.sub;
    document.getElementById('bctk-r-cat').innerHTML = bctkPill(r.type);
    document.getElementById('bctk-r-can').innerHTML =
      r.cancel === 'y'
        ? '<span class="bctk-pill bctk-p-hi">High — possible cancellation</span>'
        : r.cancel === 'n'
          ? '<span class="bctk-pill bctk-p-lo">Low</span>'
          : '<span style="color:var(--mu)">—</span>';
    document.getElementById('bctk-r-int').textContent = r.int || '—';
    document.getElementById('bctk-r-fol').textContent = r.follow || '—';
    document.getElementById('bctk-r-log').textContent = r.logic || '—';
    var nw = document.getElementById('bctk-r-notes');
    if (r.notes) {
      nw.style.display = 'block';
      document.getElementById('bctk-r-notes-txt').textContent = r.notes;
    } else nw.style.display = 'none';
    bctkRenderCadence(r);
  }
  window.bctkPickReason = bctkPickReason;

  function bctkRenderReasonList() {
    var R = window.BCTK_REASONS;
    if (!R || !R.length) return;
    var list = document.getElementById('bctk-rlist');
    if (!list) return;
    var items = R.filter(function (r) {
      return !filt || r.cat === filt;
    });
    list.innerHTML = items
      .map(function (r) {
        var idx = R.indexOf(r);
        var s = sel && sel.sub === r.sub ? ' sel' : '';
        return (
          '<div class="bctk-ri' +
          s +
          '" onclick="bctkPickReason(' +
          idx +
          ')">' +
          '<div class="bctk-ri-cat">' +
          r.cat +
          '</div>' +
          '<div class="bctk-ri-sub">' +
          r.sub +
          '</div>' +
          '</div>'
        );
      })
      .join('');
  }
  window.bctkRenderReasonList = bctkRenderReasonList;

  function bctkFallbackCopyText(text, cb) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch (e) {}
    document.body.removeChild(ta);
    if (typeof cb === 'function') cb();
  }

  function bctkCopyResourceUrlFromBtn(btn) {
    var raw = btn.getAttribute('data-url');
    if (!raw) return;
    var card = btn.closest ? btn.closest('.bctk-rc-card') : null;
    var title = card && card.querySelector('.bctk-rc-title') ? card.querySelector('.bctk-rc-title').textContent : '';
    if (window.trackUsageEvent) window.trackUsageEvent('toolkit_resource_copy', title || raw, {});
    var lbl = btn.querySelector('.bctk-rc-copy-lbl');
    var done = function () {
      if (lbl) lbl.textContent = 'Copied';
      btn.classList.add('bctk-copied');
      setTimeout(function () {
        if (lbl) lbl.textContent = 'Copy';
        btn.classList.remove('bctk-copied');
      }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(raw).then(done).catch(function () {
        bctkFallbackCopyText(raw, done);
      });
    } else {
      bctkFallbackCopyText(raw, done);
    }
  }
  window.bctkCopyResourceUrlFromBtn = bctkCopyResourceUrlFromBtn;

  function bctkResourceType(url) {
    var u = String(url || '').toLowerCase();
    if (u.indexOf('vimeo.com') !== -1 || u.indexOf('youtube.com') !== -1 || u.indexOf('youtu.be') !== -1) return 'video';
    if (u.indexOf('help.healthbridgeclinical.co.za') !== -1) return 'article';
    if (u.indexOf('tablet.mymps.co.za') !== -1) return 'portal';
    return 'site';
  }

  function bctkResourceHost(url) {
    try {
      var u = new URL(url);
      return u.hostname.replace(/^www\./, '');
    } catch (e) {
      return String(url || '').replace(/^https?:\/\//i, '').split('/')[0];
    }
  }

  function bctkResourceKindLabel(t) {
    if (t === 'video') return 'Video';
    if (t === 'article') return 'Help article';
    if (t === 'portal') return 'Portal';
    return 'Website';
  }

  function bctkResourceIconSvg(t) {
    if (t === 'video') {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>';
    }
    if (t === 'article') {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4z"/><path d="M18 4h2v14"/><line x1="9" y1="9" x2="14" y2="9"/><line x1="9" y1="13" x2="14" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>';
    }
    if (t === 'portal') {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15 15 0 0 1 0 20"/><path d="M12 2a15 15 0 0 0 0 20"/></svg>';
  }

  var BCTK_OPEN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3h7v7"/><line x1="21" y1="3" x2="12" y2="12"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>';
  var BCTK_COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var BCTK_HOST_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15 15 0 0 1 0 20"/><path d="M12 2a15 15 0 0 0 0 20"/></svg>';

  function bctkRenderResources() {
    var grid = document.getElementById('bctk-rc-grid');
    if (!grid) return;
    var R = window.BCTK_RESOURCES;
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    if (!R || !R.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.innerHTML = '<p>No resources configured.</p>';
      grid.appendChild(empty);
      return;
    }
    R.forEach(function (item) {
      var url = item.url || '';
      var t = bctkResourceType(url);
      var host = bctkResourceHost(url);

      var card = document.createElement('div');
      card.className = 'bctk-rc-card t-' + t;

      var head = document.createElement('div');
      head.className = 'bctk-rc-head';
      var ico = document.createElement('div');
      ico.className = 'bctk-rc-ico';
      ico.innerHTML = bctkResourceIconSvg(t);
      var kind = document.createElement('div');
      kind.className = 'bctk-rc-kind';
      kind.textContent = bctkResourceKindLabel(t);
      head.appendChild(ico);
      head.appendChild(kind);

      var body = document.createElement('div');
      body.className = 'bctk-rc-body';
      var title = document.createElement('div');
      title.className = 'bctk-rc-title';
      title.textContent = item.title || '';
      var hostEl = document.createElement('div');
      hostEl.className = 'bctk-rc-host';
      var hostSpan = document.createElement('span');
      hostSpan.textContent = host;
      hostEl.innerHTML = BCTK_HOST_SVG;
      hostEl.appendChild(hostSpan);
      body.appendChild(title);
      body.appendChild(hostEl);

      var actions = document.createElement('div');
      actions.className = 'bctk-rc-actions';

      var openBtn = document.createElement('a');
      openBtn.className = 'bctk-rc-open';
      openBtn.href = url;
      openBtn.target = '_blank';
      openBtn.rel = 'noopener noreferrer';
      openBtn.innerHTML = BCTK_OPEN_SVG + '<span>Open</span>';
      openBtn.addEventListener('click', function () {
        if (window.trackUsageEvent) {
          window.trackUsageEvent('toolkit_resource_open', item.title || url, { type: t, url: url });
        }
      });

      var copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'bctk-rc-copy';
      copyBtn.setAttribute('data-url', url);
      copyBtn.innerHTML = BCTK_COPY_SVG + '<span class="bctk-rc-copy-lbl">Copy</span>';
      copyBtn.addEventListener('click', function () {
        bctkCopyResourceUrlFromBtn(copyBtn);
      });

      actions.appendChild(openBtn);
      actions.appendChild(copyBtn);

      card.appendChild(head);
      card.appendChild(body);
      card.appendChild(actions);
      grid.appendChild(card);
    });
  }
  window.bctkRenderResources = bctkRenderResources;

  function bctkInitToolkit() {
    bctkRenderReasonList();
    bctkRenderResources();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bctkInitToolkit);
  } else {
    bctkInitToolkit();
  }
})();
