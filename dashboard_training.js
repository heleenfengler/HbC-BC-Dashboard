/**
 * Dashboard training — guided tours, learn hub, tab help, scenario guides.
 */
(function () {
  const STORAGE_TOUR = 'hbc_training_tour_v1_done';
  const STORAGE_HUB = 'hbc_training_hub_seen_v1';

  const TAB_GUIDES = {
    exec: {
      title: 'Executive summary',
      summary: 'Portfolio roll-up for managers and leads: KPIs, team charts, BC cards, and persona thresholds.',
      bullets: [
        'Use filters above to narrow to one BC or team — all charts and KPIs update together.',
        'Persona chips describe clinical user activity days in a 30-day window.',
        'BC portfolio cards show each consultant’s client count and engagement at a glance.',
      ],
      try: 'Filter to your team, then compare BC portfolio cards.',
    },
    overview: {
      title: 'Overview',
      summary: 'Client health snapshot: daily active users, personas, top clients, and feature mix.',
      bullets: [
        'Shared KPI strip matches other tabs for the same filter and date range.',
        'Expand “Show usage definitions” for a quick glossary without leaving the tab.',
        'Feature category pie reflects the selected date slicer range.',
      ],
      try: 'Open usage definitions, then change the slicer to 30d and watch charts update.',
    },
    encounters: {
      title: 'Encounters',
      summary: 'Consult-complete volume: trends and a ranked practice table with provider drill-down.',
      bullets: [
        'Encounters = consult-complete events in the selected date range.',
        'Expand a practice row to see treating providers; use View features for detail.',
        'The tab-level team filter is optional — the global Team filter still applies.',
      ],
      try: 'Search a BPN in the global search box, then expand the practice row.',
    },
    features: {
      title: 'Features',
      summary: 'Meaningful feature events by category, trends, and feature-only engagement.',
      bullets: [
        'Categories follow the Healthbridge feature map (see Definitions).',
        'AI feature events are called out in KPIs and Data Q&A.',
        'Feature-only practices have features but no consult-complete in the range.',
      ],
      try: 'Filter to Feature-only engagement and review category bars.',
    },
    bcview: {
      title: 'BC view',
      summary: 'Your daily workflow: find a client, open their providers, then View features to see adoption.',
      bullets: [
        'Search the global filter bar by practice, BPN, or provider name, then open BC view.',
        'Click a practice row to expand treating providers — pick the correct one if there are several.',
        'Use 📊 View features on that provider to see what they are using or not using.',
      ],
      try: 'Filter to your BC, search a client, expand the row, and open View features on the right provider.',
    },
    anomalies: {
      title: 'Anomalies',
      summary: 'Follow-up list: missing BC, feature-only without encounters, and similar flags.',
      bullets: [
        'Tab badge = flagged clients in the current filter.',
        'Use after portfolio reviews or data refreshes.',
        'Pair with BC view for outreach.',
      ],
      try: 'Filter to your BC and compare badge count to the full list.',
    },
    bctoolkit: {
      title: 'BC Toolkit',
      summary: 'Coaching: help articles, case-reason finder, and conversation tips.',
      bullets: [
        'Resources link to Healthbridge Clinical help centre articles.',
        'Case reason finder matches situations to talking points.',
        'Toolkit content is separate from dashboard filters.',
      ],
      try: 'Pick a case reason similar to your next client call.',
    },
    qa: {
      title: 'Data Q&A',
      summary: 'Plain-language questions — answers from loaded data and filters only.',
      bullets: [
        'Search practices, providers, BPN, TPN, or BC; use prompt chips for metrics.',
        'Typeahead suggests entities and example questions.',
        'No invented numbers — unavailable data is stated clearly.',
      ],
      try: 'Ask “Summarize the current filter and KPI counts” with your BC filter set.',
    },
    defs: {
      title: 'Definitions',
      summary: 'Full reference: personas, engagement, metrics, features, anomalies.',
      bullets: [
        'Bookmark when onboarding or when KPI labels are unclear.',
        'Expandable feature list matches the Features tab.',
        'Aligns with Data Q&A metric explanations.',
      ],
      try: 'Read Key Metrics, then ask Data Q&A how avg features is calculated.',
    },
  };

  const SCENARIOS = [
    { id: 'my-portfolio', title: 'See my portfolio', icon: '👤', steps: ['Set BC filter to your name.', 'Open BC view and find a practice.', 'Expand the row → pick the provider → View features.'], tab: 'bcview', tour: 'bc' },
    { id: 'one-practice', title: 'Look up one practice', icon: '🔍', steps: ['Search name or BPN in the filter bar.', 'Use Data Q&A or BC view for detail.'], tab: 'qa', tour: 'quick' },
    { id: 'metric-meaning', title: 'Understand a metric', icon: '📊', steps: ['Hover KPI tiles.', 'Open Definitions → Key Metrics.', 'Ask Data Q&A for the formula.'], tab: 'defs', tour: null },
    { id: 'date-confusion', title: 'Date range vs activity window', icon: '📅', steps: ['Slicer = event volumes in charts/tables.', 'Active provider = trailing up to 30d ending on slicer end.', 'See Definitions for detail.'], tab: 'exec', tour: 'quick' },
    { id: 'leadership', title: 'Leadership review', icon: '📈', steps: ['Executive summary for all BCs.', 'Overview for personas.', 'Encounters / Features for deep dives.'], tab: 'exec', tour: 'manager' },
    { id: 'client-call', title: 'Prepare for a client call', icon: '📞', steps: ['Search for the practice in BC view.', 'Expand the row; if multiple providers, choose the right one.', 'Click View features to see what they use or have not adopted.'], tab: 'bcview', tour: 'bc' },
    { id: 'at-risk', title: 'Clients needing action', icon: '⚠️', steps: ['Open Anomalies.', 'Filter by your BC.', 'Follow up in BC view.'], tab: 'anomalies', tour: 'bc' },
    { id: 'data-freshness', title: 'Check data freshness', icon: '🕐', steps: ['Header: last refresh and 24hr lag.', 'Data Q&A: date range and refresh.', 'Definitions for field meanings.'], tab: 'qa', tour: null },
  ];

  const TOUR_STEPS = {
    quick: [
      { sel: '.hdr-brand', title: 'Welcome', body: 'Feature and encounter adoption across your BC portfolio. About 2 minutes.' },
      { sel: '.gfb', title: 'Filters', body: 'BC, team, PMA, engagement, or search by practice, BPN, TPN, provider. All tabs respect these filters.' },
      { sel: '#slicer-bar', title: 'Date slicer', body: 'Event volumes in charts/tables. Active/inactive provider KPIs use a separate trailing activity window (up to 30 days).' },
      { sel: '#ek-active-kpi', title: 'Key KPIs', body: 'Billing practices, roster, active vs inactive providers, avg features per active provider. Hover for definitions.' },
      { sel: '#trn-open-hub', title: 'Learn anytime', body: 'Open Learn for tab guides, scenarios, and tours. Definitions is the full glossary.' },
    ],
    manager: [
      { sel: '.tabs .tab[data-tab="exec"]', title: 'Start here', body: 'Executive summary — all BCs, teams, at-risk signals.', tab: 'exec' },
      { sel: '#s-exec .kg7', title: 'Portfolio KPIs', body: 'Headline counts for the current filter and slicer.', tab: 'exec' },
      { sel: '.tabs .tab[data-tab="overview"]', title: 'Overview', body: 'Personas, daily active users, top clients.', tab: 'overview', before: function () { goTab('overview'); } },
      { sel: '#slicer-bar', title: 'Two time concepts', body: 'Slicer drives event totals. Active provider uses the trailing activity window.', tab: 'overview' },
      { sel: '.tabs .tab[data-tab="defs"]', title: 'Definitions', body: 'Full metric and persona reference for your team.', tab: 'defs', before: function () { goTab('defs'); } },
    ],
    bc: [
      { sel: '#f-bc', title: 'Your BC filter', body: 'Select your name so every tab shows only your clients.' },
      { sel: '#f-q', title: 'Find the client', body: 'Search by practice name, BPN, or treating provider. The portfolio table updates as you type.' },
      { sel: '.tabs .tab[data-tab="bcview"]', title: 'BC view', body: 'Your working list — practices in your filter with expandable provider rows.', tab: 'bcview', before: function () { goTab('bcview'); } },
      { sel: '#bc-tbody', title: 'Open the practice', body: 'Click a practice row to expand its treating providers. Use search above if you need to narrow the list quickly.', tab: 'bcview' },
      { sel: '#s-bcview .card', title: 'Choose the provider', body: 'If the practice has multiple treating providers, pick the one you are working with. Click 📊 View features on that row to see what the client is using or not using.', tab: 'bcview' },
      { sel: '.tabs .tab[data-tab="qa"]', title: 'Data Q&A', body: 'Optional: ask metric questions or look up a client in plain language — answers come from this data only.', tab: 'qa', before: function () { goTab('qa'); if (typeof renderQA === 'function') renderQA(); } },
    ],
    full: [
      { sel: '.hdr-brand', title: 'BC Client Tracker', body: 'Data refreshes daily (~24hr lag). Header shows last refresh.' },
      { sel: '.tabs', title: 'Nine areas', body: 'Exec, Overview, Encounters, Features, BC view, Anomalies, Toolkit, Data Q&A, Definitions.' },
      { sel: '.gfb', title: 'Global filters', body: 'Apply once — all tabs update. Test BPNs excluded from KPI totals but searchable.' },
      { sel: '#slicer-bar', title: 'Date slicer', body: 'Presets 7d–All; drag handles or type dates.' },
      { sel: '#ek-active-kpi', title: 'Shared KPIs', body: 'Same tiles on most tabs. Active provider = trailing activity window.', tab: 'exec' },
      { sel: '.tabs .tab[data-tab="overview"]', title: 'Overview', tab: 'overview', before: function () { goTab('overview'); }, body: 'Health snapshot and feature mix.' },
      { sel: '.tabs .tab[data-tab="encounters"]', title: 'Encounters', tab: 'encounters', before: function () { goTab('encounters'); }, body: 'Consult-complete trends and table.' },
      { sel: '.tabs .tab[data-tab="features"]', title: 'Features', tab: 'features', before: function () { goTab('features'); }, body: 'Category trends and AI events.' },
      { sel: '.tabs .tab[data-tab="bcview"]', title: 'BC view', tab: 'bcview', before: function () { goTab('bcview'); }, body: 'Portfolio table with provider drill-down.' },
      { sel: '.tabs .tab[data-tab="anomalies"]', title: 'Anomalies', tab: 'anomalies', before: function () { goTab('anomalies'); }, body: 'Operational flags and badge.' },
      { sel: '.tabs .tab[data-tab="qa"]', title: 'Data Q&A', tab: 'qa', before: function () { goTab('qa'); if (typeof renderQA === 'function') renderQA(); }, body: 'Natural language with typeahead.' },
      { sel: '.tabs .tab[data-tab="defs"]', title: 'Definitions', tab: 'defs', before: function () { goTab('defs'); }, body: 'Complete glossary.' },
      { sel: '#trn-open-hub', title: "You're set", body: 'Reopen Learn anytime. Bookmark Definitions for reference.' },
    ],
  };

  let tourState = null;

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function goTab(name) {
    const tab = document.querySelector('.tab[data-tab="' + name + '"]');
    if (tab && typeof switchTab === 'function') switchTab(name, tab);
  }

  function trackTraining(event, detail) {
    if (typeof trackUsageEvent === 'function') {
      try {
        trackUsageEvent('training_' + event, typeof CURRENT_TAB !== 'undefined' ? CURRENT_TAB : '', detail || {});
      } catch (e) { /* ignore */ }
    }
  }

  function isWelcomeVisible() {
    const w = document.getElementById('trn-welcome');
    return w && !w.hidden && w.style.display !== 'none' && w.getAttribute('aria-hidden') !== 'true';
  }

  function dismissWelcome(persist) {
    hideWelcome();
    if (persist) {
      try { localStorage.setItem(STORAGE_TOUR, '1'); } catch (e) { /* ignore */ }
    }
    trackTraining('welcome_dismiss', { persist: !!persist });
  }

  function bindTrainingShellEvents() {
    const root = document.getElementById('trn-root');
    if (!root || root.dataset.eventsBound) return;
    root.dataset.eventsBound = '1';

    root.addEventListener('click', function (e) {
      const t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('#trn-welcome-close')) {
        e.preventDefault();
        dismissWelcome(true);
        return;
      }
      if (t.closest('#trn-welcome-tour')) {
        e.preventDefault();
        hideWelcome();
        startTour('quick');
        return;
      }
      if (t.closest('#trn-welcome-hub')) {
        e.preventDefault();
        hideWelcome();
        openHub();
        return;
      }
      if (t.closest('#trn-welcome-dismiss')) {
        e.preventDefault();
        dismissWelcome(true);
        return;
      }
      if (t.id === 'trn-welcome') {
        dismissWelcome(true);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isWelcomeVisible()) {
        e.preventDefault();
        dismissWelcome(true);
        return;
      }
      const tourLayer = document.getElementById('trn-tour');
      if (!tourState || !tourLayer || tourLayer.hidden) return;
      if (e.key === 'Escape') endTour(false);
      if (e.key === 'Enter' && !e.target.closest('#trn-hub, #trn-welcome, #trn-tab-drawer, input, textarea, select')) {
        e.preventDefault();
        tourStep(1);
      }
    });
  }

  function ensureShell() {
    const existingRoot = document.getElementById('trn-root');
    if (existingRoot && document.getElementById('trn-tour') && document.getElementById('trn-welcome-close')) {
      bindTrainingShellEvents();
      return;
    }
    if (existingRoot) existingRoot.remove();
    const wrap = document.createElement('div');
    wrap.id = 'trn-root';
    wrap.innerHTML = [
      '<div id="trn-tour" class="trn-tour" hidden>',
      '<div id="trn-tour-backdrop" class="trn-tour-backdrop"></div>',
      '<div id="trn-spot" class="trn-spot" hidden></div>',
      '<div id="trn-card" class="trn-card" role="dialog" aria-labelledby="trn-card-title">',
      '  <motionless class="trn-card-progress" id="trn-progress"></motionless>',
      '  <h3 class="trn-card-title" id="trn-card-title"></h3>',
      '  <p class="trn-card-body" id="trn-card-body"></p>',
      '  <motionless class="trn-card-actions">',
      '    <button type="button" class="trn-btn trn-btn-ghost" id="trn-skip">Skip tour</button>',
      '    <motionless class="trn-card-nav">',
      '      <button type="button" class="trn-btn trn-btn-ghost" id="trn-prev">Back</button>',
      '      <button type="button" class="trn-btn trn-btn-primary" id="trn-next">Next</button>',
      '    </motionless>',
      '  </div>',
      '</motionless>',
      '</div>',
      '<motionless id="trn-hub-backdrop" class="trn-hub-backdrop" hidden></motionless>',
      '<motionless id="trn-hub" class="trn-hub" hidden role="dialog" aria-labelledby="trn-hub-title">',
      '  <motionless class="trn-hub-head"><h2 id="trn-hub-title">Learn this dashboard</h2>',
      '  <button type="button" class="trn-hub-close" id="trn-hub-close" aria-label="Close">×</button></motionless>',
      '  <motionless class="trn-hub-body" id="trn-hub-body"></motionless>',
      '</motionless>',
      '<motionless id="trn-tab-drawer-backdrop" class="trn-hub-backdrop" hidden></motionless>',
      '<motionless id="trn-tab-drawer" class="trn-tab-drawer" hidden role="dialog"></motionless>',
      '<div id="trn-welcome" class="trn-welcome" hidden role="dialog" aria-modal="true" aria-labelledby="trn-welcome-title">',
      '  <div class="trn-welcome-card">',
      '    <button type="button" class="trn-welcome-close" id="trn-welcome-close" aria-label="Close welcome">×</button>',
      '    <h2 id="trn-welcome-title">Welcome to the BC Client Tracker</h2>',
      '    <p>New here or need a refresher? Take a short tour, browse scenarios, or open tab help on any screen.</p>',
      '    <motionless class="trn-welcome-actions">',
      '      <button type="button" class="trn-btn trn-btn-primary" id="trn-welcome-tour">Quick tour (2 min)</button>',
      '      <button type="button" class="trn-btn trn-btn-ghost" id="trn-welcome-hub">Explore Learn hub</button>',
      '      <button type="button" class="trn-btn trn-btn-link" id="trn-welcome-dismiss">Skip for now</button>',
      '    </motionless>',
      '  </div>',
      '</div>',
    ].join('');
    wrap.innerHTML = wrap.innerHTML.replace(/motionless/g, 'div');
    document.body.appendChild(wrap);

    document.getElementById('trn-skip').addEventListener('click', function (e) {
      e.stopPropagation();
      endTour(false);
    });
    document.getElementById('trn-prev').addEventListener('click', function (e) {
      e.stopPropagation();
      tourStep(-1);
    });
    document.getElementById('trn-next').addEventListener('click', function (e) {
      e.stopPropagation();
      tourStep(1);
    });
    document.getElementById('trn-card').addEventListener('click', function (e) { e.stopPropagation(); });
    const tourBackdrop = document.getElementById('trn-tour-backdrop') || document.getElementById('trn-overlay');
    if (tourBackdrop) tourBackdrop.addEventListener('click', function () { endTour(false); });
    document.getElementById('trn-hub-close').addEventListener('click', closeHub);
    document.getElementById('trn-hub-backdrop').addEventListener('click', closeHub);
    document.getElementById('trn-tab-drawer-backdrop').addEventListener('click', closeTabDrawer);
    bindTrainingShellEvents();
    window.addEventListener('resize', positionTourCard);
    window.addEventListener('scroll', positionTourCard, true);
  }

  function getRect(sel) {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 && r.height < 2) return null;
    return r;
  }

  function positionTourCard() {
    if (!tourState) return;
    const step = tourState.steps[tourState.index];
    const spot = document.getElementById('trn-spot');
    const card = document.getElementById('trn-card');
    const rect = getRect(step.sel);
    if (!rect) {
      spot.hidden = true;
      card.style.top = '50%';
      card.style.left = '50%';
      card.style.transform = 'translate(-50%, -50%)';
      card.style.right = 'auto';
      return;
    }
    const pad = 8;
    spot.hidden = false;
    spot.style.top = (rect.top - pad) + 'px';
    spot.style.left = (rect.left - pad) + 'px';
    spot.style.width = (rect.width + pad * 2) + 'px';
    spot.style.height = (rect.height + pad * 2) + 'px';
    card.style.transform = 'none';
    const margin = 12;
    const cardW = Math.min(360, window.innerWidth - 24);
    let top = rect.bottom + margin;
    let left = Math.max(12, Math.min(rect.left, window.innerWidth - cardW - 12));
    if (top + 200 > window.innerHeight) top = Math.max(12, rect.top - 200 - margin);
    card.style.top = top + 'px';
    card.style.left = left + 'px';
    card.style.right = 'auto';
    card.style.maxWidth = cardW + 'px';
  }

  function renderTourStep() {
    const st = tourState;
    if (!st) return;
    const step = st.steps[st.index];
    if (step.before) step.before();
    if (step.tab) goTab(step.tab);
    setTimeout(function () {
      document.getElementById('trn-card-title').textContent = step.title;
      document.getElementById('trn-card-body').textContent = step.body;
      document.getElementById('trn-progress').textContent = 'Step ' + (st.index + 1) + ' of ' + st.steps.length;
      document.getElementById('trn-prev').disabled = st.index === 0;
      document.getElementById('trn-next').textContent = st.index >= st.steps.length - 1 ? 'Finish' : 'Next';
      positionTourCard();
    }, step.before || step.tab ? 120 : 0);
  }

  function startTour(path) {
    ensureShell();
    closeHub();
    hideWelcome();
    const steps = TOUR_STEPS[path] || TOUR_STEPS.quick;
    tourState = { path: path, steps: steps, index: 0 };
    const tourEl = document.getElementById('trn-tour');
    const card = document.getElementById('trn-card');
    if (tourEl) tourEl.hidden = false;
    if (card) card.hidden = false;
    document.body.classList.add('trn-tour-active');
    renderTourStep();
    trackTraining('tour_start', { path: path });
  }

  function tourStep(delta) {
    if (!tourState) return;
    const next = tourState.index + delta;
    if (next < 0) return;
    if (next >= tourState.steps.length) {
      endTour(true);
      return;
    }
    tourState.index = next;
    renderTourStep();
  }

  function endTour(completed) {
    if (!tourState) return;
    const path = tourState.path;
    tourState = null;
    const tourEl = document.getElementById('trn-tour');
    if (tourEl) tourEl.hidden = true;
    const spot = document.getElementById('trn-spot');
    if (spot) spot.hidden = true;
    document.body.classList.remove('trn-tour-active');
    if (completed) {
      try { localStorage.setItem(STORAGE_TOUR, '1'); } catch (e) { /* ignore */ }
      trackTraining('tour_complete', { path: path });
    } else {
      trackTraining('tour_skip', { path: path });
    }
  }

  function hubHtml() {
    const tabs = Object.keys(TAB_GUIDES).map(function (key) {
      const g = TAB_GUIDES[key];
      return '<button type="button" class="trn-tab-pill" data-tab="' + esc(key) + '">' + esc(g.title) + '</button>';
    }).join('');
    const scenarios = SCENARIOS.map(function (s) {
      return '<motionless class="trn-scenario-card" data-scenario="' + esc(s.id) + '">' +
        '<motionless class="trn-scenario-icon">' + s.icon + '</motionless>' +
        '<h4>' + esc(s.title) + '</h4>' +
        '<ol>' + s.steps.map(function (st) { return '<li>' + esc(st) + '</li>'; }).join('') + '</ol>' +
        '<motionless class="trn-scenario-actions">' +
        (s.tab ? '<button type="button" class="trn-btn trn-btn-ghost trn-go-tab" data-tab="' + esc(s.tab) + '">Go to tab</button>' : '') +
        (s.tour ? '<button type="button" class="trn-btn trn-btn-primary trn-start-tour" data-tour="' + esc(s.tour) + '">Start tour</button>' : '') +
        '</motionless></motionless>';
    }).join('').replace(/motionless/g, 'div');
    return (
      '<motionless class="trn-hub-section">' +
      '<h3>Guided tours</h3>' +
      '<p class="trn-muted">Step-by-step highlights. You can skip or exit anytime.</p>' +
      '<motionless class="trn-tour-btns">' +
      '<button type="button" class="trn-btn trn-btn-primary trn-start-tour" data-tour="quick">Quick (2 min)</button>' +
      '<button type="button" class="trn-btn trn-btn-ghost trn-start-tour" data-tour="bc">BC workflow</button>' +
      '<button type="button" class="trn-btn trn-btn-ghost trn-start-tour" data-tour="manager">Manager view</button>' +
      '<button type="button" class="trn-btn trn-btn-ghost trn-start-tour" data-tour="full">Full dashboard</button>' +
      '</motionless></motionless>' +
      '<motionless class="trn-hub-section"><h3>Common scenarios</h3><motionless class="trn-scenario-grid">' + scenarios + '</motionless></motionless>' +
      '<motionless class="trn-hub-section"><h3>Tab reference</h3><p class="trn-muted">Click a tab for a short guide. Use <strong>?</strong> on any tab header while working.</p>' +
      '<motionless class="trn-tab-pills">' + tabs + '</motionless></motionless>' +
      '<motionless class="trn-hub-section trn-tip-box">' +
      '<strong>Tip:</strong> Data is ~24 hours behind. KPI “active provider” uses a trailing activity window; chart totals use the date slicer. See <button type="button" class="trn-link-btn" data-tab="defs">Definitions</button> or <button type="button" class="trn-link-btn" data-tab="qa">Data Q&A</button>.' +
      '</motionless>'
    ).replace(/motionless/g, 'div');
  }

  function bindHubEvents() {
    const body = document.getElementById('trn-hub-body');
    body.querySelectorAll('.trn-start-tour').forEach(function (btn) {
      btn.addEventListener('click', function () {
        closeHub();
        startTour(btn.getAttribute('data-tour') || 'quick');
      });
    });
    body.querySelectorAll('.trn-go-tab, .trn-link-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const t = btn.getAttribute('data-tab');
        if (t) { closeHub(); goTab(t); if (t === 'qa' && typeof renderQA === 'function') renderQA(); }
      });
    });
    body.querySelectorAll('.trn-tab-pill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openTabGuide(btn.getAttribute('data-tab'));
      });
    });
  }

  function openHub() {
    ensureShell();
    hideWelcome();
    const hub = document.getElementById('trn-hub');
    const back = document.getElementById('trn-hub-backdrop');
    document.getElementById('trn-hub-body').innerHTML = hubHtml();
    bindHubEvents();
    hub.hidden = false;
    back.hidden = false;
    try { localStorage.setItem(STORAGE_HUB, '1'); } catch (e) { /* ignore */ }
    trackTraining('hub_open', {});
  }

  function closeHub() {
    const hub = document.getElementById('trn-hub');
    const back = document.getElementById('trn-hub-backdrop');
    if (hub) hub.hidden = true;
    if (back) back.hidden = true;
  }

  function openTabGuide(tabKey) {
    const g = TAB_GUIDES[tabKey];
    if (!g) return;
    ensureShell();
    const drawer = document.getElementById('trn-tab-drawer');
    const back = document.getElementById('trn-tab-drawer-backdrop');
    drawer.innerHTML =
      '<motionless class="trn-drawer-head"><h3>' + esc(g.title) + '</h3>' +
      '<button type="button" class="trn-hub-close" id="trn-drawer-close" aria-label="Close">×</button></motionless>' +
      '<p class="trn-drawer-summary">' + esc(g.summary) + '</p>' +
      '<ul class="trn-drawer-list">' + g.bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' +
      '<p class="trn-drawer-try"><strong>Try it:</strong> ' + esc(g.try) + '</p>' +
      '<motionless class="trn-drawer-actions">' +
      '<button type="button" class="trn-btn trn-btn-primary" id="trn-drawer-goto">Open ' + esc(g.title) + '</button>' +
      '<button type="button" class="trn-btn trn-btn-ghost" id="trn-drawer-defs">Full glossary</button>' +
      '</motionless>';
    drawer.innerHTML = drawer.innerHTML.replace(/motionless/g, 'div');
    drawer.hidden = false;
    back.hidden = false;
    document.getElementById('trn-drawer-close').addEventListener('click', closeTabDrawer);
    document.getElementById('trn-drawer-goto').addEventListener('click', function () {
      closeTabDrawer();
      closeHub();
      goTab(tabKey);
      if (tabKey === 'qa' && typeof renderQA === 'function') renderQA();
    });
    document.getElementById('trn-drawer-defs').addEventListener('click', function () {
      closeTabDrawer();
      closeHub();
      goTab('defs');
    });
    trackTraining('tab_help', { tab: tabKey });
  }

  function closeTabDrawer() {
    const d = document.getElementById('trn-tab-drawer');
    const b = document.getElementById('trn-tab-drawer-backdrop');
    if (d) d.hidden = true;
    if (b) b.hidden = true;
  }

  function injectTabHelpButtons() {
    document.querySelectorAll('.section').forEach(function (sec) {
      const id = sec.id || '';
      if (id.indexOf('s-') !== 0) return;
      const tabKey = id.slice(2);
      if (!TAB_GUIDES[tabKey]) return;
      const shdr = sec.querySelector('.shdr');
      if (!shdr || shdr.querySelector('.trn-tab-help-btn')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'trn-tab-help-btn';
      btn.title = 'Help for this tab';
      btn.setAttribute('aria-label', 'Help for ' + TAB_GUIDES[tabKey].title);
      btn.textContent = '?';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openTabGuide(tabKey);
      });
      shdr.style.position = 'relative';
      shdr.appendChild(btn);
    });
  }

  function showWelcomeIfNeeded() {
    let done = false;
    try { done = localStorage.getItem(STORAGE_TOUR) === '1'; } catch (e) { /* ignore */ }
    if (done) return;
    ensureShell();
    bindTrainingShellEvents();
    const tourEl = document.getElementById('trn-tour');
    if (tourEl) tourEl.hidden = true;
    const w = document.getElementById('trn-welcome');
    if (!w) return;
    w.removeAttribute('hidden');
    w.style.display = 'flex';
    w.setAttribute('aria-hidden', 'false');
    trackTraining('welcome_show', {});
  }

  function hideWelcome() {
    const w = document.getElementById('trn-welcome');
    if (!w) return;
    w.hidden = true;
    w.style.display = 'none';
    w.setAttribute('aria-hidden', 'true');
  }

  window.initDashboardTraining = function (entryEvent) {
    ensureShell();
    bindTrainingShellEvents();
    injectTabHelpButtons();
    const hubBtn = document.getElementById('trn-open-hub');
    if (hubBtn && !hubBtn.dataset.bound) {
      hubBtn.dataset.bound = '1';
      hubBtn.addEventListener('click', openHub);
    }
    if (entryEvent === 'login') showWelcomeIfNeeded();
  };

  window.openTrainingHub = openHub;
  window.startDashboardTour = startTour;
  window.openTabTrainingHelp = openTabGuide;
})();
