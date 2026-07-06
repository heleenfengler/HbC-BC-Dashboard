/**

 * Portfolio scorecard + health tiers + momentum + feature adoption.

 * Additive only — uses global FC, kpiSet helpers; does not alter filters or slicing.

 */

(function () {

  'use strict';



  const FEAT_AREAS = [
    { key: 'encounters', idx: 1, cat: '1. Encounters', label: 'Encounters' },
    { key: 'clinical', idx: 3, cat: '2. Clinical Doc', label: 'Clinical documentation' },
    { key: 'scripts', idx: 4, cat: '3. Scripts', label: 'Scripts' },
    { key: 'pathology', idx: 5, cat: '4. Pathology', label: 'Pathology' },
    { key: 'ai', idx: 6, cat: '5. AI Features', label: 'AI features' },
    { key: 'preventative', idx: 7, cat: '6. Preventative Care', label: 'Preventative care' },
    { key: 'tasks', idx: 8, cat: '7. Task Management', label: 'Task management' },
    { key: 'customization', idx: 9, cat: '8. Customization', label: 'Customization' },
    { key: 'noise', idx: 10, cat: '9. Noise / Passive', label: 'Noise / passive' },
  ];

  const FEAT_AREA_FALLBACK_COLORS = {
    encounters: '#F7941D',
    clinical: '#7757EC',
    scripts: '#0067C5',
    pathology: '#06b6d4',
    ai: '#75EB9E',
    preventative: '#84cc16',
    tasks: '#f59e0b',
    customization: '#6D7175',
    noise: '#94a3b8',
  };

  function featAreaColor(area) {
    if (typeof FEAT_CAT_COLORS !== 'undefined' && FEAT_CAT_COLORS[area.cat]) {
      return FEAT_CAT_COLORS[area.cat];
    }
    return FEAT_AREA_FALLBACK_COLORS[area.key] || '#64748b';
  }

  function emptyEncFeatRange() {
    const out = { enc: 0, feat: 0 };
    FEAT_AREAS.forEach(function (a) { out[a.key] = 0; });
    return out;
  }

  function practiceEncFeatInRange(p, fromIdx, toIdx) {
    if (fromIdx == null || toIdx == null || fromIdx > toIdx) {
      return emptyEncFeatRange();
    }
    const recs = (DATA.bpnDaily && DATA.bpnDaily[String(p.bpn)]) || [];
    const out = emptyEncFeatRange();
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      if (r[0] < fromIdx || r[0] > toIdx) continue;
      out.enc += r[1] || 0;
      out.feat += r[2] || 0;
      FEAT_AREAS.forEach(function (a) {
        out[a.key] += r[a.idx] || 0;
      });
    }
    return out;
  }

  function practice30dEncFeat(p) {
    const w = getExec30dWindow();
    if (!w.nDays) return { enc: 0, feat: 0 };
    return practiceEncFeatInRange(p, w.fromIdx, w.toIdx);
  }

  const MOVER_LIMIT = 6;
  const COMPARE_DAY_OPTIONS = [7, 14, 30];

  function getCompareDays() {
    const d = window._pfCompareDays;
    return COMPARE_DAY_OPTIONS.indexOf(d) >= 0 ? d : 30;
  }

  function momentumWindowSpan(fromIdx, toIdx) {
    if (!SLICER || !SLICER.dates || fromIdx == null || toIdx == null || fromIdx > toIdx) {
      return null;
    }
    return {
      fromIdx: fromIdx,
      toIdx: toIdx,
      nDays: toIdx - fromIdx + 1,
      startStr: SLICER.dates[fromIdx],
      endStr: SLICER.dates[toIdx],
    };
  }

  function getMomentumWindows(compareDays) {
    const days = compareDays || getCompareDays();
    if (!SLICER || !SLICER.dates || !SLICER.dates.length) {
      return { recent: null, prior: null, compareDays: days };
    }

    const recentTo = SLICER.endIdx;
    const recentFrom = Math.max(0, recentTo - days + 1);
    const recent = momentumWindowSpan(recentFrom, recentTo);
    const priorTo = recentFrom - 1;
    const priorFrom = priorTo - days + 1;

    if (priorTo < 0 || priorFrom < 0) {
      return { recent: recent, prior: null, compareDays: days };
    }

    return {
      recent: recent,
      prior: momentumWindowSpan(priorFrom, priorTo),
      compareDays: days,
    };
  }



  function isEligiblePractice(p) {

    return !(typeof practiceExcludedFromTreatingProviderKpis === 'function' &&

      practiceExcludedFromTreatingProviderKpis(p));

  }



  function practiceMetricsInWindow(p, fromIdx, toIdx) {
    const w = practiceEncFeatInRange(p, fromIdx, toIdx);
    return {
      enc: w.enc || 0,
      feat: Math.max(0, (w.feat || 0) - (w.enc || 0)),
    };
  }

  function buildPracticeMoverRow(p, mw) {
    const recent = practiceMetricsInWindow(p, mw.recent.fromIdx, mw.recent.toIdx);
    const prior = mw.prior
      ? practiceMetricsInWindow(p, mw.prior.fromIdx, mw.prior.toIdx)
      : { enc: 0, feat: 0 };
    return {
      p: p,
      enc: { recent: recent.enc, prior: prior.enc, delta: recent.enc - prior.enc },
      feat: { recent: recent.feat, prior: prior.feat, delta: recent.feat - prior.feat },
    };
  }

  function classifyMoverLists(rows, key) {
    const improving = [];
    const declining = [];
    const flat = [];
    const newActivity = [];
    let recentTotal = 0;
    let priorTotal = 0;

    for (let i = 0; i < rows.length; i++) {
      const m = rows[i][key];
      recentTotal += m.recent;
      priorTotal += m.prior;
      if (m.prior === 0 && m.recent > 0) newActivity.push(rows[i]);
      else if (m.delta > 0) improving.push(rows[i]);
      else if (m.delta < 0) declining.push(rows[i]);
      else flat.push(rows[i]);
    }

    improving.sort(function (a, b) { return b[key].delta - a[key].delta; });
    declining.sort(function (a, b) { return a[key].delta - b[key].delta; });
    newActivity.sort(function (a, b) { return b[key].recent - a[key].recent; });

    return {
      improving: improving,
      declining: declining,
      flat: flat,
      newActivity: newActivity,
      recentTotal: recentTotal,
      priorTotal: priorTotal,
    };
  }

  function buildMomentumStats(kpiSet, compareDays) {
    const mw = getMomentumWindows(compareDays);
    const stats = {
      mw: mw,
      rows: [],
      recentEnc: 0,
      priorEnc: 0,
      recentFeat: 0,
      priorFeat: 0,
      enc: { improving: [], declining: [], flat: [], newActivity: [] },
      feat: { improving: [], declining: [], flat: [], newActivity: [] },
    };

    if (!mw.recent) return stats;

    for (let i = 0; i < kpiSet.length; i++) {
      const p = kpiSet[i];
      if (!isEligiblePractice(p)) continue;
      stats.rows.push(buildPracticeMoverRow(p, mw));
    }

    stats.enc = classifyMoverLists(stats.rows, 'enc');
    stats.feat = classifyMoverLists(stats.rows, 'feat');
    stats.recentEnc = stats.enc.recentTotal;
    stats.priorEnc = stats.enc.priorTotal;
    stats.recentFeat = stats.feat.recentTotal;
    stats.priorFeat = stats.feat.priorTotal;
    return stats;
  }



  function buildFeatureAdoption(kpiSet, fromIdx, toIdx) {

    const eligible = kpiSet.filter(isEligiblePractice);

    const total = eligible.length;

    const counts = {};

    FEAT_AREAS.forEach(function (a) { counts[a.key] = 0; });



    for (let i = 0; i < eligible.length; i++) {

      const p = eligible[i];

      const w = practiceEncFeatInRange(p, fromIdx, toIdx);

      FEAT_AREAS.forEach(function (a) {

        if ((w[a.key] || 0) > 0) counts[a.key]++;

      });

    }



    return FEAT_AREAS.map(function (a) {

      const n = counts[a.key];

      return {

        label: a.label,

        key: a.key,

        color: featAreaColor(a),

        count: n,

        pct: total ? Math.round(100 * n / total) : 0,

        total: total,

      };

    });

  }



  function portfolioDailyEncSeries(kpiSet, fromIdx, toIdx) {

    const out = [];

    if (!SLICER || !SLICER.dates || fromIdx > toIdx) return out;

    const keys = kpiSet.filter(isEligiblePractice).map(function (p) { return String(p.bpn); });

    for (let di = fromIdx; di <= toIdx; di++) {

      let enc = 0;

      for (let k = 0; k < keys.length; k++) {

        const recs = (DATA.bpnDaily && DATA.bpnDaily[keys[k]]) || [];

        for (let ri = 0; ri < recs.length; ri++) {

          const r = recs[ri];

          if (r[0] < di) continue;

          if (r[0] > di) break;

          enc += r[1] || 0;

        }

      }

      out.push({ d: SLICER.dates[di], enc: enc });

    }

    return out;

  }



  function renderMomentumChart(series) {

    if (typeof killChart === 'function') killChart('pf-momentum');

    const canvas = document.getElementById('c-pf-momentum');

    if (!canvas || !window.Chart || !series.length) return;

    if (typeof applyChartDefaults === 'function') applyChartDefaults();

    const ctx = canvas.getContext('2d');

    window.charts = window.charts || {};

    window.charts['pf-momentum'] = new Chart(ctx, {

      type: 'line',

      data: {

        labels: series.map(function (s) { return formatDateShort(s.d); }),

        datasets: [{

          label: 'Consult-complete encounters',

          data: series.map(function (s) { return s.enc; }),

          borderColor: typeof getCss === 'function' ? getCss('--brand-orange') : '#F7941D',

          backgroundColor: 'rgba(247,148,29,0.12)',

          tension: 0.35,

          fill: true,

          borderWidth: 2,

          pointRadius: 0,

          pointHoverRadius: 4,

        }],

      },

      options: typeof chartLineOpts === 'function' ? chartLineOpts() : {

        responsive: true,

        maintainAspectRatio: false,

        scales: { y: { beginAtZero: true } },

      },

    });

  }



  function practiceHealthTier(p) {

    if (!isEligiblePractice(p)) return 'excluded';

    if (!p.bc) return 'data_gap';

    const w30 = practice30dEncFeat(p);

    if (w30.enc > 0) return 'on_track';

    if (w30.feat > 0) return 'needs_engagement';

    if ((p.enc || 0) > 0 || (p.feat || 0) > 0) return 'needs_engagement';

    return 'at_risk';

  }



  const TIER_META = {

    on_track: { label: 'On track', color: 'var(--green-100)', desc: 'Encounters in 30d window' },

    needs_engagement: { label: 'Needs engagement', color: 'var(--brand-orange)', desc: 'Feature-only or not recent' },

    at_risk: { label: 'At risk', color: '#c62828', desc: 'No activity in filter range' },

    data_gap: { label: 'Data gap', color: 'var(--brand-burnt-orange)', desc: 'No BC assigned' },

  };



  function portfolioFilterLabel() {

    const bcVals = getMultiFilterValues('f-bc');

    const teamVals = getMultiFilterValues('f-team');

    if (bcVals.length === 1 && teamVals.length <= 1) {

      const teamPart = teamVals.length === 1 ? teamVals[0] + ' · ' : '';

      return {

        title: teamPart + 'Portfolio: ' + bcVals[0],

        subtitle: 'BC client book · filters apply to all tabs',

      };

    }

    if (teamVals.length === 1 && bcVals.length === 0) {

      return { title: 'Team: ' + teamVals[0], subtitle: 'All BC portfolios in this team' };

    }

    if (bcVals.length > 1 && teamVals.length <= 1) {

      return { title: bcVals.length + ' BCs selected', subtitle: 'Combined portfolio view' };

    }

    if (teamVals.length > 1) {

      return { title: teamVals.length + ' teams selected', subtitle: 'Combined portfolio view' };

    }

    return {

      title: 'All portfolios',

      subtitle: 'Filter by BC or team above to focus your book of business',

    };

  }



  function momentumDeltaHtml(recentEnc, priorEnc) {

    if (!priorEnc && !recentEnc) return '<span class="pf-delta flat">—</span>';

    if (!priorEnc && recentEnc) return '<span class="pf-delta up">new</span>';

    const chg = Math.round(((recentEnc - priorEnc) / priorEnc) * 100);

    if (chg > 0) return '<span class="pf-delta up">+' + chg + '%</span>';

    if (chg < 0) return '<span class="pf-delta down">' + chg + '%</span>';

    return '<span class="pf-delta flat">flat</span>';

  }



  function portfolioFilterActive() {
    const bcVals = getMultiFilterValues('f-bc');
    const teamVals = getMultiFilterValues('f-team');
    const q = document.getElementById('f-q');
    const hasQ = q && String(q.value || '').trim();
    return bcVals.length > 0 || teamVals.length > 0 || !!hasQ;
  }

  function formatComparePeriodBanner(mw) {
    if (!mw || !mw.recent) return '';
    let html = '<div class="pf-compare-banner">' +
      '<strong>Recent period</strong> (' + mw.recent.nDays + 'd): ' +
      formatDateShort(mw.recent.startStr) + ' – ' + formatDateShort(mw.recent.endStr);
    if (mw.prior) {
      html += ' · <strong>Prior period</strong> (' + mw.prior.nDays + 'd): ' +
        formatDateShort(mw.prior.startStr) + ' – ' + formatDateShort(mw.prior.endStr) +
        '<br><span style="color:var(--mu)">Ranked by selected metric · both encounter and feature columns shown</span>';
    } else {
      html += '<br><span style="color:var(--mu)">Prior period unavailable — choose a shorter window or extend the date range.</span>';
    }
    return html + '</div>';
  }

  function comparePeriodSelectHtml(selectedDays) {
    const opts = COMPARE_DAY_OPTIONS.map(function (d) {
      return '<option value="' + d + '"' + (d === selectedDays ? ' selected' : '') + '>' + d + ' days</option>';
    }).join('');
    return '<div class="pf-mover-period"><label for="pf-compare-days">Compare window</label>' +
      '<select id="pf-compare-days" onchange="portfolioSetCompareDays(this.value)">' + opts + '</select></div>';
  }

  function fmtDeltaCell(delta, highlight) {
    const cls = delta > 0 ? 'up' : (delta < 0 ? 'down' : 'flat');
    const prefix = delta > 0 ? '+' : '';
    const tdCls = highlight ? ' pf-rank-col' : '';
    return '<td class="' + tdCls.trim() + '" style="text-align:right"><span class="pf-delta ' + cls + '">' + prefix + fmtFull(delta) + '</span></td>';
  }

  function dualMoverTableHead(rankMetric) {
    const encHi = rankMetric === 'enc' ? ' pf-rank-col' : '';
    const featHi = rankMetric === 'feat' ? ' pf-rank-col' : '';
    return '<thead>' +
      '<tr><th rowspan="2">Practice</th>' +
      '<th colspan="3" class="pf-col-grp' + encHi + '">Encounters</th>' +
      '<th colspan="3" class="pf-col-grp' + featHi + '">Feature events</th></tr>' +
      '<tr>' +
      '<th class="' + encHi.trim() + '">Recent</th><th>Prior</th><th class="' + encHi.trim() + '">Δ</th>' +
      '<th class="' + featHi.trim() + '">Recent</th><th>Prior</th><th class="' + featHi.trim() + '">Δ</th>' +
      '</tr></thead>';
  }

  function dualMoverRows(rows, limit, showAll, rankMetric) {
    if (!rows.length) {
      return '<tr><td colspan="7" class="empty" style="padding:8px"><small>None in filter</small></td></tr>';
    }
    const slice = showAll ? rows : rows.slice(0, limit);
    const encHi = rankMetric === 'enc';
    const featHi = rankMetric === 'feat';
    return slice.map(function (row) {
      const e = row.enc;
      const f = row.feat;
      return '<tr class="pf-action-row" onclick="portfolioFocusPractice(\'' + escapeHtmlAttr(String(row.p.bpn)) + '\')" style="cursor:pointer">' +
        '<td><strong>' + escapeHtml(row.p.name) + '</strong></td>' +
        '<td class="' + (encHi ? 'pf-rank-col' : '') + '" style="text-align:right">' + fmtFull(e.recent) + '</td>' +
        '<td style="text-align:right;color:var(--mu)">' + fmtFull(e.prior) + '</td>' +
        fmtDeltaCell(e.delta, encHi) +
        '<td class="' + (featHi ? 'pf-rank-col' : '') + '" style="text-align:right">' + fmtFull(f.recent) + '</td>' +
        '<td style="text-align:right;color:var(--mu)">' + fmtFull(f.prior) + '</td>' +
        fmtDeltaCell(f.delta, featHi) +
        '</tr>';
    }).join('');
  }

  function moverRankLabel(metric) {
    return metric === 'feat' ? 'feature events' : 'encounters';
  }

  function renderMoverSectionHtml(momentum, metric, showAll, filterActive) {
    const mw = momentum.mw || {};
    const lists = momentum[metric] || { improving: [], declining: [], flat: [], newActivity: [] };
    const improving = lists.improving || [];
    const declining = lists.declining || [];
    const hasMore = filterActive && (
      improving.length > MOVER_LIMIT || declining.length > MOVER_LIMIT
    );
    const shownImp = showAll ? improving.length : Math.min(improving.length, MOVER_LIMIT);
    const shownDec = showAll ? declining.length : Math.min(declining.length, MOVER_LIMIT);
    const rankLabel = moverRankLabel(metric);

    let showAllBtn = '';
    if (hasMore) {
      showAllBtn = '<button type="button" class="pf-mover-showall" onclick="portfolioToggleMoverShowAll()">' +
        (showAll ? 'Show top ' + MOVER_LIMIT : 'Show all (' + improving.length + ' up · ' + declining.length + ' down)') +
        '</button>';
    }

    return formatComparePeriodBanner(mw) +
      '<div class="pf-mover-toolbar">' +
        comparePeriodSelectHtml(mw.compareDays || getCompareDays()) +
        '<div class="pf-mover-toggle">' +
          '<button type="button" class="pf-mover-btn' + (metric === 'enc' ? ' active' : '') + '" onclick="portfolioSetMoverMetric(\'enc\')">Rank by encounters</button>' +
          '<button type="button" class="pf-mover-btn' + (metric === 'feat' ? ' active' : '') + '" onclick="portfolioSetMoverMetric(\'feat\')">Rank by features</button>' +
        '</div>' +
        showAllBtn +
      '</div>' +
      '<div class="pf-mover-grid-wrap">' +
        '<div class="pf-mover-grid">' +
          '<div class="pf-mover-col"><div class="pf-mover-title pf-delta up">Top improving · by ' + escapeHtml(rankLabel) + '</div>' +
            '<table class="pf-mover-table">' +
            dualMoverTableHead(metric) +
            '<tbody>' + dualMoverRows(improving, MOVER_LIMIT, showAll, metric) + '</tbody></table></div>' +
          '<div class="pf-mover-col"><div class="pf-mover-title pf-delta down">Top declining · by ' + escapeHtml(rankLabel) + '</div>' +
            '<table class="pf-mover-table">' +
            dualMoverTableHead(metric) +
            '<tbody>' + dualMoverRows(declining, MOVER_LIMIT, showAll, metric) + '</tbody></table></div>' +
        '</div>' +
      '</div>' +
      (hasMore
        ? '<div class="pf-mover-foot">Showing ' + shownImp + ' improving · ' + shownDec + ' declining' +
          (showAll ? '' : ' · filter applied') + '</div>'
        : '');
  }

  function refreshMoverSection() {
    const el = document.getElementById('pf-mover-section');
    const momentum = window._pfMomentumData;
    if (!el || !momentum) return;
    const metric = window._pfMoverMetric || 'enc';
    const showAll = !!window._pfMoverShowAll;
    el.innerHTML = renderMoverSectionHtml(momentum, metric, showAll, portfolioFilterActive());
  }

  window.portfolioSetMoverMetric = function (metric) {
    window._pfMoverMetric = metric === 'feat' ? 'feat' : 'enc';
    refreshMoverSection();
  };

  window.portfolioToggleMoverShowAll = function () {
    window._pfMoverShowAll = !window._pfMoverShowAll;
    refreshMoverSection();
  };

  window.portfolioSetCompareDays = function (days) {
    const d = parseInt(days, 10);
    window._pfCompareDays = COMPARE_DAY_OPTIONS.indexOf(d) >= 0 ? d : 30;
    window._pfMoverShowAll = false;
    if (typeof renderPortfolioPanel === 'function') renderPortfolioPanel();
  };



  function featureAdoptionHtml(adoption) {

    if (!adoption.length || !adoption[0].total) {

      return '<div class="pf-empty-note">No practices in filter</div>';

    }

    return adoption.map(function (a) {

      return '<div class="pf-feat-row">' +

        '<div class="pf-feat-label">' + escapeHtml(a.label) + '</div>' +

        '<div class="pf-feat-track"><div class="pf-feat-fill" style="width:' + Math.max(a.pct, 2) + '%;background:' + a.color + '"></div></div>' +

        '<div class="pf-feat-pct"><strong>' + a.pct + '%</strong></div>' +

        '<div class="pf-feat-n">' + a.count + '/' + a.total + '</div>' +

        '</div>';

    }).join('');

  }



  function focusPractice(bpn) {

    const q = document.getElementById('f-q');

    if (q) {

      q.value = String(bpn);

      if (typeof applyFilters === 'function') applyFilters();

      if (typeof switchTab === 'function') switchTab('bcview', document.querySelector('.tab[data-tab="bcview"]'));

    }

  }

  window.portfolioFocusPractice = focusPractice;



  function renderPortfolioPanel() {

    const root = document.getElementById('portfolio-panel-root');

    if (!root) return;



    const kpiSet = typeof fcForKpiStats === 'function' ? fcForKpiStats() : (FC || []);

    const kb = typeof kpiBundleForFilteredPractices === 'function'

      ? kpiBundleForFilteredPractices(kpiSet)

      : { pracN: kpiSet.length, roster: 0, activeProv: 0, encProv: 0, noneProv: 0, featPerActive: 0 };

    const label = portfolioFilterLabel();

    const meta = DATA.metadata || {};

    const w = getExec30dWindow();

    const winNote = w.nDays

      ? (w.nDays >= 30 ? '30d ending ' + formatDateShort(w.endStr) : w.nDays + 'd ending ' + formatDateShort(w.endStr))

      : 'Set date range';



    let sumEnc = 0;

    let sumFeat = 0;

    let onLatestN = 0;

    let withVerN = 0;

    let withBcN = 0;

    const tiers = { on_track: 0, needs_engagement: 0, at_risk: 0, data_gap: 0 };



    for (let i = 0; i < kpiSet.length; i++) {

      const p = kpiSet[i];

      sumEnc += p.enc || 0;

      sumFeat += p.feat || 0;

      if (p.bc) withBcN++;

      if (p.appVer) {

        withVerN++;

        if (p.onLatest) onLatestN++;

      }

      const tier = practiceHealthTier(p);

      if (tier !== 'excluded' && tiers[tier] !== undefined) tiers[tier]++;

    }



    const pracN = kpiSet.length;

    const provTotal = kb.roster || 0;

    const activePct = provTotal ? pct(kb.activeProv, provTotal) : '0%';

    const encShare = kb.activeProv ? pct(kb.encProv, kb.activeProv) : '0%';

    const bcPct = pracN ? pct(withBcN, pracN) : '0%';

    const verPct = withVerN ? pct(onLatestN, withVerN) : '—';



    const tierTotal = tiers.on_track + tiers.needs_engagement + tiers.at_risk + tiers.data_gap;

    let healthBar = '';

    let healthLegend = '';

    if (tierTotal > 0) {

      ['on_track', 'needs_engagement', 'at_risk', 'data_gap'].forEach(function (key) {

        const n = tiers[key];

        if (!n) return;

        const pctW = Math.max(2, Math.round(100 * n / tierTotal));

        const m = TIER_META[key];

        healthBar += '<div class="pf-tier-seg" style="width:' + pctW + '%;background:' + m.color + '" title="' +

          escapeHtml(m.label + ': ' + n) + '"></div>';

        healthLegend += '<div class="pf-tier-key"><span class="pf-tier-dot" style="background:' + m.color + '"></span>' +

          '<strong>' + n + '</strong> ' + escapeHtml(m.label) +

          '<span class="pf-tier-hint"> · ' + escapeHtml(m.desc) + '</span></div>';

      });

    } else {

      healthBar = '<div class="pf-tier-seg" style="width:100%;background:var(--slate-300)"></div>';

      healthLegend = '<div class="pf-tier-key" style="color:var(--mu)">No practices in current filter</div>';

    }



    const compareDays = getCompareDays();
    const momentum = buildMomentumStats(kpiSet, compareDays);

    const mw = momentum.mw;

    const featWindow = mw.recent || w;

    const adoption = buildFeatureAdoption(

      kpiSet,

      featWindow.fromIdx,

      featWindow.toIdx

    );



    let momentumSummary = '';

    let chartFrom = 0;

    let chartTo = 0;

    if (mw.recent && mw.prior) {
      const cmpDays = mw.compareDays || compareDays;
      momentumSummary =
        '<div class="pf-mom-compare">' +
          '<div class="pf-mom-box"><div class="pf-mom-lbl">Prior period · encounters</div><div class="pf-mom-val">' + fmtFull(momentum.priorEnc) + '</div>' +
            '<div class="pf-mom-dates">' + formatDateShort(mw.prior.startStr) + ' – ' + formatDateShort(mw.prior.endStr) + ' (' + mw.prior.nDays + 'd)</div></div>' +
          '<div class="pf-mom-box pf-mom-box-hi"><div class="pf-mom-lbl">Recent period · encounters</div><div class="pf-mom-val">' + fmtFull(momentum.recentEnc) + '</div>' +
            momentumDeltaHtml(momentum.recentEnc, momentum.priorEnc) +
            '<div class="pf-mom-dates">' + formatDateShort(mw.recent.startStr) + ' – ' + formatDateShort(mw.recent.endStr) + ' (' + mw.recent.nDays + 'd)</div></div>' +
          '<div class="pf-mom-box"><div class="pf-mom-lbl">Recent period · feature events</div><div class="pf-mom-val">' + fmtFull(momentum.recentFeat) + '</div>' +
            momentumDeltaHtml(momentum.recentFeat, momentum.priorFeat) +
            '<div class="pf-mom-dates">vs prior ' + fmtFull(momentum.priorFeat) + ' · ' + cmpDays + 'd window</div></div>' +
        '</div>';
      chartFrom = mw.prior.fromIdx;
      chartTo = mw.recent.toIdx;
    } else if (mw.recent) {
      momentumSummary = '<div class="pf-empty-note">Prior ' + (mw.compareDays || compareDays) + 'd not available — extend the date range back or choose a shorter compare window.</div>';

      chartFrom = Math.max(0, mw.recent.toIdx - 59);

      chartTo = mw.recent.toIdx;

    } else {

      momentumSummary = '<div class="pf-empty-note">Set a date range to view momentum.</div>';

    }



    window._pfMomentumData = momentum;
    window._pfMoverShowAll = false;
    if (!window._pfMoverMetric) window._pfMoverMetric = 'enc';
    if (!window._pfCompareDays) window._pfCompareDays = 30;
    const moverMetric = window._pfMoverMetric;
    const filterActive = portfolioFilterActive();
    const moverSectionHtml = renderMoverSectionHtml(momentum, moverMetric, false, filterActive);



    root.innerHTML =

      '<div class="card portfolio-panel">' +

        '<div class="pf-header">' +

          '<div>' +

            '<div class="pf-title">' + escapeHtml(label.title) + '</div>' +

            '<div class="pf-sub">' + escapeHtml(label.subtitle) + ' · Data through ' + escapeHtml(meta.DataDateMax || '—') + '</div>' +

          '</div>' +

          '<div class="pf-win-note">' + escapeHtml(winNote) + '</div>' +

        '</div>' +

        '<div class="pf-kpi-grid">' +

          '<div class="pf-kpi"><div class="pf-kpi-val">' + fmtFull(pracN) + '</div><div class="pf-kpi-lbl">Billing practices</div></div>' +

          '<div class="pf-kpi"><div class="pf-kpi-val">' + fmtFull(provTotal) + '</div><div class="pf-kpi-lbl">Treating providers</div></div>' +

          '<div class="pf-kpi"><div class="pf-kpi-val">' + activePct + '</div><div class="pf-kpi-lbl">Active providers (30d)</div></div>' +

          '<div class="pf-kpi"><div class="pf-kpi-val">' + encShare + '</div><div class="pf-kpi-lbl">With encounter (of active)</div></div>' +

          '<div class="pf-kpi"><div class="pf-kpi-val">' + fmtFull(sumEnc) + '</div><div class="pf-kpi-lbl">Encounters (range)</div></div>' +

          '<div class="pf-kpi"><div class="pf-kpi-val">' + fmtFull(sumFeat) + '</div><div class="pf-kpi-lbl">Feature events (range)</div></div>' +

          '<div class="pf-kpi"><div class="pf-kpi-val">' + bcPct + '</div><div class="pf-kpi-lbl">With BC assigned</div></div>' +

          '<div class="pf-kpi"><div class="pf-kpi-val">' + verPct + '</div><div class="pf-kpi-lbl">On latest version</div></div>' +

        '</div>' +

        '<div class="pf-health-block">' +

          '<div class="pf-health-title">Practice health (30d window)</div>' +

          '<div class="pf-health-bar">' + healthBar + '</div>' +

          '<div class="pf-health-legend">' + healthLegend + '</div>' +

        '</div>' +

        '<div class="pf-phase2-grid">' +

          '<div class="pf-phase2-card">' +

            '<div class="pf-phase2-head"><div class="ct" style="margin:0">Momentum</div>' +

              '<div class="cs" style="margin:0">Compare recent vs prior window · chart = encounters · tables show both metrics</div></div>' +

            momentumSummary +

            '<div class="pf-chart-wrap"><canvas id="c-pf-momentum"></canvas></div>' +

            '<div id="pf-mover-section">' + moverSectionHtml + '</div>' +

          '</div>' +

          '<div class="pf-phase2-card">' +

            '<div class="pf-phase2-head"><div class="ct" style="margin:0">Feature adoption breadth</div>' +

              '<div class="cs" style="margin:0">All 9 event categories · % of practices with activity · recent 30d window</div></div>' +

            featureAdoptionHtml(adoption) +

          '</div>' +

        '</div>' +

      '</div>';



    if (chartTo >= chartFrom) {

      const series = portfolioDailyEncSeries(kpiSet, chartFrom, chartTo);

      renderMomentumChart(series);

    }

  }



  window.renderPortfolioPanel = renderPortfolioPanel;

})();


