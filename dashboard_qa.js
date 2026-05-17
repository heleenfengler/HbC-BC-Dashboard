/**
 * Data Q&A — grounded answers from embedded DATA, filters, and slicer only.
 */
(function () {
  const QA_STOP = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'what', 'how', 'many', 'much', 'show', 'me', 'tell', 'about', 'for', 'in', 'on', 'at', 'to', 'of',
    'do', 'does', 'did', 'can', 'could', 'would', 'you', 'i', 'we', 'my', 'our', 'get', 'give',
    'please', 'find', 'search', 'look', 'up', 'lookup', 'list', 'who', 'which', 'when', 'where',
    'have', 'has', 'had', 'any', 'some', 'all', 'from', 'with', 'and', 'or', 'the', 'this', 'that',
  ]);

  const QA_PROMPTS = [
    { label: 'Filter & KPI summary', q: 'Summarize the current filter and KPI counts' },
    { label: 'Avg features / active provider', q: 'How is avg features per active provider calculated?' },
    { label: 'Date range & refresh', q: 'What date range is selected and when was data last refreshed?' },
    { label: 'Top 10 by encounters', q: 'Top 10 practices by encounters' },
    { label: 'Search practice name', q: '' },
    { label: 'Inactive providers', q: 'How many inactive treating providers in the current filter?' },
    { label: 'What can I ask?', q: 'What questions can you answer?' },
  ];

  function qaUnavailable(reason, detail, hints) {
    let html = '<p>' + escapeHtml(reason) + '</p>';
    if (detail) html += '<p class="qa-muted">' + escapeHtml(detail) + '</p>';
    if (hints && hints.length) {
      html += '<p class="qa-muted"><strong>Try:</strong></p><ul class="qa-list">' +
        hints.map(function (h) { return '<li>' + escapeHtml(h) + '</li>'; }).join('') + '</ul>';
    }
    return { status: 'unavailable', title: 'Information not available', html: html };
  }

  function qaOutOfScope(detail, hints) {
    let html = '<p>I only answer from the embedded dashboard data (practices, providers, filters, date slicer, documented metrics). I do not invent numbers or use external sources.</p>';
    if (detail) html += '<p class="qa-muted">' + escapeHtml(detail) + '</p>';
    if (hints && hints.length) {
      html += '<p><strong>Suggested questions:</strong></p><ul class="qa-list">' +
        hints.map(function (h) {
          return '<li><button type="button" class="qa-link-btn" data-q="' + escapeHtmlAttr(h) + '">' + escapeHtml(h) + '</button></li>';
        }).join('') + '</ul>';
    }
    return { status: 'out_of_scope', title: 'Outside scope', html: html };
  }

  function qaOk(title, html, footnote) {
    return { status: 'ok', title: title, html: html, footnote: footnote || '' };
  }

  function qaNormalize(s) {
    return String(s || '').toLowerCase()
      .replace(/['']/g, "'")
      .replace(/[^\w\s'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function qaTokens(s) {
    return qaNormalize(s).split(' ').filter(function (t) {
      return t.length >= 2 && !QA_STOP.has(t);
    });
  }

  function qaFilterContext() {
    const bc = document.getElementById('f-bc')?.value || '';
    const team = document.getElementById('f-team')?.value || '';
    const pma = document.getElementById('f-pma')?.value || '';
    const eng = document.getElementById('f-eng')?.value || '';
    const q = document.getElementById('f-q')?.value?.trim() || '';
    const parts = [];
    if (bc) parts.push('BC: ' + bc);
    if (team) parts.push('Team: ' + team);
    if (pma) parts.push('PMA: ' + pma);
    if (eng) parts.push('Engagement: ' + eng);
    if (q) parts.push('Search: “' + q + '”');
    return parts.length ? parts.join(' · ') : 'No portfolio filters (test BPNs excluded from KPIs).';
  }

  function qaDateContext() {
    if (!SLICER || !SLICER.dates || !SLICER.dates.length) return 'Date slicer not ready.';
    const start = SLICER.dates[SLICER.startIdx];
    const end = SLICER.dates[SLICER.endIdx];
    const days = SLICER.endIdx - SLICER.startIdx + 1;
    const w = typeof getExec30dWindow === 'function' ? getExec30dWindow() : null;
    let act = '';
    if (w && w.nDays) {
      act = w.nDays < 30
        ? 'Activity window: ' + w.nDays + 'd (' + formatDateShort(w.startStr) + '–' + formatDateShort(w.endStr) + ').'
        : 'Activity window: up to 30d ending ' + formatDateShort(w.endStr) + '.';
    }
    return 'Selected range: ' + formatDate(start) + ' → ' + formatDate(end) + ' (' + days + ' days). ' + act;
  }

  function qaPool(useFullBundle) {
    if (useFullBundle) return DATA.practices || [];
    return typeof fcForKpiStats === 'function' ? fcForKpiStats() : (FC || []);
  }

  function qaScoreText(hay, tokens, raw) {
    const h = qaNormalize(hay);
    if (!h) return 0;
    let score = 0;
    const rawN = qaNormalize(raw);
    if (rawN.length >= 3 && h.indexOf(rawN) >= 0) score += 40;
    tokens.forEach(function (t) {
      if (h === t) score += 25;
      else if (h.indexOf(t) >= 0) score += 12;
      else if (t.length >= 4 && h.indexOf(t.slice(0, Math.max(3, t.length - 1))) >= 0) score += 6;
    });
    return score;
  }

  function qaScorePractice(p, tokens, raw) {
    let score = 0;
    const rawDigits = String(raw).replace(/\D/g, '');
    if (rawDigits.length >= 4) {
      const bpn = typeof normalizeIdDigits === 'function' ? normalizeIdDigits(p.bpn) : String(p.bpn);
      const qNorm = typeof normalizeIdDigits === 'function' ? normalizeIdDigits(rawDigits) : rawDigits;
      if (bpn === qNorm) score += 120;
      (p.providers || []).forEach(function (pr) {
        const tpn = typeof normalizeIdDigits === 'function' ? normalizeIdDigits(pr.tpn) : String(pr.tpn);
        if (tpn === qNorm) score += 110;
      });
    }
    score += qaScoreText(p.name, tokens, raw) * 1.4;
    score += qaScoreText(p.bpn, tokens, raw);
    score += qaScoreText(p.bc, tokens, raw) * 0.8;
    score += qaScoreText(p.team, tokens, raw) * 0.6;
    (p.providers || []).forEach(function (pr) {
      score += qaScoreText(pr.name, tokens, raw) * 0.9;
      score += qaScoreText(pr.tpn, tokens, raw) * 0.5;
    });
    return score;
  }

  function qaSearchPractices(query, opts) {
    opts = opts || {};
    const raw = String(query || '').trim();
    if (!raw) return [];
    const tokens = qaTokens(raw);
    const pool = opts.pool || qaPool(false);
    const minScore = opts.minScore != null ? opts.minScore : (tokens.length ? 14 : 20);
    const limit = opts.limit || 15;
    const scored = pool.map(function (p) {
      return { p: p, score: qaScorePractice(p, tokens, raw) };
    }).filter(function (x) { return x.score >= minScore; });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, limit);
  }

  function qaSearchProviders(query, opts) {
    opts = opts || {};
    const raw = String(query || '').trim();
    const tokens = qaTokens(raw);
    const pool = opts.pool || qaPool(false);
    const minScore = opts.minScore != null ? opts.minScore : 16;
    const limit = opts.limit || 12;
    const out = [];
    pool.forEach(function (p) {
      (p.providers || []).forEach(function (pr) {
        let score = qaScoreText(pr.name, tokens, raw) * 1.3 + qaScoreText(pr.tpn, tokens, raw);
        if (score >= minScore) {
          out.push({ p: p, pr: pr, score: score });
        }
      });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, limit);
  }

  function qaSearchBCs(query, opts) {
    opts = opts || {};
    const raw = String(query || '').trim();
    if (!raw) return [];
    const tokens = qaTokens(raw);
    const minScore = opts.minScore != null ? opts.minScore : 12;
    const limit = opts.limit || 6;
    const pool = opts.pool || (typeof DATA !== 'undefined' ? DATA.practices : []) || [];
    const seen = new Set();
    const out = [];
    pool.forEach(function (p) {
      const bc = String(p.bc || '').trim();
      if (!bc) return;
      const key = bc.toLowerCase();
      if (seen.has(key)) return;
      const score = qaScoreText(bc, tokens, raw);
      if (score < minScore) return;
      seen.add(key);
      let count = 0;
      pool.forEach(function (x) {
        if (String(x.bc || '').trim().toLowerCase() === key) count++;
      });
      out.push({ bc: bc, score: score, count: count });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, limit);
  }

  const QA_SUGGEST_QUESTIONS = [
    { label: 'Filter & KPI summary', q: 'Summarize the current filter and KPI counts' },
    { label: 'Avg features / active provider', q: 'How is avg features per active provider calculated?' },
    { label: 'Date range & refresh', q: 'What date range is selected and when was data last refreshed?' },
    { label: 'Top 10 by encounters', q: 'Top 10 practices by encounters' },
    { label: 'Encounter count', q: 'How many encounter events in the current filter?' },
    { label: 'Feature count', q: 'How many feature events in the current filter?' },
    { label: 'Inactive providers', q: 'How many inactive treating providers in the current filter?' },
    { label: 'What can I ask?', q: 'What questions can you answer?' },
  ];

  function qaSearchMetricPrompts(query, opts) {
    opts = opts || {};
    const raw = String(query || '').trim();
    if (raw.length < 2) return [];
    const rawN = qaNormalize(raw);
    const tokens = qaTokens(raw);
    const limit = opts.limit || 5;
    const minScore = opts.minScore != null ? opts.minScore : 8;
    const scored = QA_SUGGEST_QUESTIONS.map(function (item) {
      const hay = qaNormalize(item.label + ' ' + item.q);
      let score = 0;
      if (hay.indexOf(rawN) >= 0) score += 28;
      tokens.forEach(function (t) {
        if (hay.indexOf(t) >= 0) score += 10;
      });
      QA_METRIC_PHRASES.forEach(function (k) {
        if (rawN.indexOf(k) >= 0 && hay.indexOf(k) >= 0) score += 6;
      });
      return { item: item, score: score };
    }).filter(function (x) { return x.score >= minScore; });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, limit).map(function (x) { return x.item; });
  }

  function qaBuildSuggestions(query) {
    const v = String(query || '').trim();
    if (v.length < 2) return [];
    const items = [];
    const digits = v.replace(/\D/g, '');
    const fullPool = qaPool(true);

    if (/^\d{4,9}$/.test(v) || (digits.length >= 4 && digits.length <= 9 && /^[\d\s-]+$/.test(v))) {
      const id = (v.match(/\d{4,9}/) || [digits])[0];
      qaSearchPractices(id, { minScore: 40, limit: 4, pool: fullPool }).forEach(function (h) {
        items.push({
          type: 'practice', kind: 'BPN', q: 'BPN ' + h.p.bpn,
          label: h.p.name, sub: 'BPN ' + h.p.bpn, score: h.score + 55,
        });
      });
      qaSearchProviders(id, { minScore: 40, limit: 3, pool: fullPool }).forEach(function (h) {
        items.push({
          type: 'provider', kind: 'TPN', q: h.pr.name,
          label: h.pr.name, sub: 'TPN ' + h.pr.tpn + ' · ' + h.p.name, score: h.score + 50,
        });
      });
    }

    qaSearchPractices(v, { minScore: 10, limit: 5 }).forEach(function (h) {
      items.push({
        type: 'practice', kind: 'Practice', q: h.p.name,
        label: h.p.name, sub: 'BPN ' + h.p.bpn, score: h.score + 20,
      });
    });

    qaSearchProviders(v, { minScore: 12, limit: 4 }).forEach(function (h) {
      items.push({
        type: 'provider', kind: 'Provider', q: h.pr.name,
        label: h.pr.name, sub: h.p.name + ' · TPN ' + h.pr.tpn, score: h.score + 15,
      });
    });

    qaSearchBCs(v, { minScore: 12, limit: 3 }).forEach(function (h) {
      items.push({
        type: 'bc', kind: 'BC', q: 'Practices for ' + h.bc,
        label: h.bc, sub: h.count + ' practices in bundle', score: h.score + 12,
      });
    });

    qaSearchMetricPrompts(v, { limit: 4 }).forEach(function (m) {
      const sub = m.q.length > 52 ? m.q.slice(0, 52) + '…' : m.q;
      items.push({
        type: 'question', kind: 'Question', q: m.q,
        label: m.label, sub: sub, score: 14,
      });
    });

    items.sort(function (a, b) { return b.score - a.score; });
    const seen = new Set();
    const out = [];
    items.forEach(function (it) {
      const key = it.type + '|' + it.q;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(it);
    });
    return out.slice(0, 8);
  }

  function qaSuggestKindLabel(type) {
    if (type === 'practice') return 'Practice';
    if (type === 'provider') return 'Provider';
    if (type === 'bc') return 'BC';
    return 'Question';
  }

  function qaRenderSuggestItem(it) {
    const kind = it.kind || qaSuggestKindLabel(it.type);
    return '<button type="button" class="qa-suggest-item" data-q="' + escapeHtmlAttr(it.q) + '">' +
      '<span class="qa-suggest-kind">' + escapeHtml(kind) + '</span>' +
      '<span class="qa-suggest-text"><strong>' + escapeHtml(it.label) + '</strong>' +
      (it.sub ? '<span class="qa-suggest-sub">' + escapeHtml(it.sub) + '</span>' : '') +
      '</span></button>';
  }

  function qaIntentScore(qLower, tokens, patterns) {
    let s = 0;
    patterns.forEach(function (pat) {
      if (typeof pat === 'string') {
        if (qLower.indexOf(pat) >= 0) s += 10;
      } else if (pat instanceof RegExp && pat.test(qLower)) {
        s += 12;
      }
    });
    tokens.forEach(function (t) {
      patterns.forEach(function (pat) {
        if (typeof pat === 'string' && pat.indexOf(t) >= 0) s += 4;
      });
    });
    return s;
  }

  function qaExtractTopN(q, def) {
    const m = q.match(/\b(?:top|bottom|lowest|highest|first)\s+(\d+)\b/i);
    return m ? Math.min(50, parseInt(m[1], 10)) : def;
  }

  function qaExtractQuoted(q) {
    const m = q.match(/["']([^"']+)["']/);
    return m ? m[1].trim() : '';
  }

  const QA_METRIC_PHRASES = [
    'how many', 'how much', 'total', 'count', 'number of', 'average', 'avg ',
    'summarize', 'summary', 'filter', 'kpi', 'top ', 'bottom ', 'highest', 'lowest',
    'explain', 'calculat', 'definition', 'what is the', 'what are', 'date range',
    'last refresh', 'refreshed', 'active provider', 'inactive provider', 'feature event',
    'encounter event', 'ai event', 'anomal', 'without bc', 'feature only',
  ];

  function qaMetricQuestion(qLower) {
    return QA_METRIC_PHRASES.some(function (k) { return qLower.indexOf(k) >= 0; });
  }

  function qaLookupSearchTerm(q, qLower) {
    let s = String(q || '').trim();
    s = s.replace(/^(?:please\s+)?(?:tell me about|lookup|look up|search for|find|show me|what is|who is)\s+/i, '');
    const quoted = qaExtractQuoted(s);
    if (quoted) return quoted;
    const patterns = [
      /(?:practice|client|clinic|site|provider|doctor|dr\.?)\s+(.+)$/i,
      /(?:named|called)\s+(.+)$/i,
      /(?:for|about)\s+(.+)$/i,
      /(?:bpn|tpn)\s*[:#]?\s*(\S+)/i,
    ];
    for (let i = 0; i < patterns.length; i++) {
      const m = s.match(patterns[i]);
      if (m && m[1]) return m[1].trim();
    }
    const bpn = s.match(/\b(\d{4,9})\b/);
    if (bpn) return bpn[1];
    const tokens = qaTokens(s);
    if (tokens.length >= 2) return tokens.join(' ');
    if (tokens.length === 1 && tokens[0].length >= 3) return tokens[0];
    return '';
  }

  function qaEarlyEntityAnswer(q, qLower) {
    const digitsOnly = q.replace(/\D/g, '');
    if (/^\d{4,9}$/.test(String(q).trim()) || (digitsOnly.length >= 4 && digitsOnly.length <= 9 && !qaMetricQuestion(qLower))) {
      const id = String(q).trim().match(/\d{4,9}/);
      const idStr = id ? id[0] : digitsOnly;
      const hits = qaSearchPractices(idStr, { minScore: 40, limit: 5, pool: qaPool(true) });
      if (hits.length === 1 || (hits.length && hits[0].score >= 100)) {
        return qaOk(hits[0].p.name, qaPracticeBlock(hits[0].p), 'BPN/TPN match · score ' + hits[0].score);
      }
      const provHits = qaSearchProviders(idStr, { minScore: 40, limit: 6, pool: qaPool(true) });
      if (provHits.length === 1) {
        return qaOk(provHits[0].pr.name + ' · ' + provHits[0].p.name, qaPracticeBlock(provHits[0].p), 'TPN match');
      }
      if (provHits.length > 1) {
        const rows = provHits.map(function (h) {
          return '<li><button type="button" class="qa-link-btn" data-q="' + escapeHtmlAttr(h.pr.name) + '">' +
            escapeHtml(h.pr.name) + '</button> (TPN ' + escapeHtml(h.pr.tpn) + ') at <strong>' +
            escapeHtml(h.p.name) + '</strong></li>';
        }).join('');
        return qaOk('Provider matches for ' + idStr, '<ul class="qa-list">' + rows + '</ul>', 'TPN search');
      }
      if (hits.length > 1) {
        const rows = hits.map(function (h) {
          return '<li><button type="button" class="qa-link-btn" data-q="' + escapeHtmlAttr(h.p.name) + '">' +
            '<strong>' + escapeHtml(h.p.name) + '</strong></button> · BPN ' + escapeHtml(h.p.bpn) + '</li>';
        }).join('');
        return qaOk('Multiple practices match ' + idStr, '<ul class="qa-list">' + rows + '</ul>', 'BPN search');
      }
    }

    if (qaMetricQuestion(qLower)) return null;
    const term = qaLookupSearchTerm(q, qLower);
    if (!term || term.length < 3) return null;
    const hits = qaSearchPractices(term, { minScore: 22, limit: 8 });
    if (!hits.length || hits[0].score < 55) return null;
    if (hits.length === 1 || hits[0].score >= 85) {
      return qaOk(hits[0].p.name, qaPracticeBlock(hits[0].p), 'Practice lookup · score ' + hits[0].score);
    }
    if (hits[0].score >= hits[1].score + 18) {
      return qaOk(hits[0].p.name, qaPracticeBlock(hits[0].p), 'Best practice match · score ' + hits[0].score);
    }
    return null;
  }

  function qaPracticeBlock(p) {
    const w = typeof getExec30dWindow === 'function' ? getExec30dWindow() : null;
    let provLines = '';
    (p.providers || []).slice(0, 12).forEach(function (pr) {
      const daily = pr.provKey && typeof provider30dEncFeatFromDaily === 'function'
        ? provider30dEncFeatFromDaily(pr.provKey) : { enc: pr.enc, feat: pr.feat };
      provLines += '<li><strong>' + escapeHtml(pr.name || '—') + '</strong> (TPN ' + escapeHtml(pr.tpn) +
        ') — enc (activity window): <strong>' + fmtFull(daily.enc || 0) +
        '</strong>, feat: <strong>' + fmtFull(daily.feat || 0) + '</strong></li>';
    });
    const more = (p.providers || []).length > 12
      ? '<li class="qa-muted">…and ' + ((p.providers || []).length - 12) + ' more in bundle</li>' : '';
    return '<p><strong>' + escapeHtml(p.name) + '</strong> · BPN <code>' + escapeHtml(p.bpn) + '</code></p>' +
      '<ul class="qa-list">' +
      '<li>BC: ' + (p.bc ? escapeHtml(p.bc) : 'Unassigned') + '</li>' +
      '<li>Team: ' + escapeHtml(p.team || '—') + ' · PMA: ' + escapeHtml(p.pma || '—') + '</li>' +
      '<li>Status: ' + escapeHtml(p.status || '—') + ' · Engagement: ' + escapeHtml(p.engagement || '—') + '</li>' +
      '<li>Encounters (selected range): <strong>' + fmtFull(p.enc || 0) + '</strong></li>' +
      '<li>Feature events (selected range): <strong>' + fmtFull(p.feat || 0) + '</strong></li>' +
      '<li>Last active: ' + (p.lastActive ? formatDate(p.lastActive) : '—') + '</li>' +
      '</ul>' +
      ((p.providers || []).length
        ? '<p class="qa-muted">Providers' + (w && w.nDays ? ' · ' + w.nDays + 'd window' : '') + ':</p><ul class="qa-list">' + provLines + more + '</ul>'
        : '<p class="qa-muted">No per-provider rows in bundle.</p>');
  }

  function qaSuggestHints(qLower) {
    const hints = [];
    if (/enc|consult/.test(qLower)) hints.push('How many encounter events in the current filter?');
    if (/feat|feature/.test(qLower)) hints.push('How many feature events in the current filter?');
    if (/bc|consultant/.test(qLower)) hints.push('Summarize the current filter and KPI counts');
    if (/date|range|when|refresh/.test(qLower)) hints.push('What date range is selected and when was data last refreshed?');
    if (hints.length < 3) {
      hints.push('Summarize the current filter and KPI counts');
      hints.push('Top 10 practices by encounters');
      hints.push('What questions can you answer?');
    }
    return hints.slice(0, 4);
  }

  function qaAnswerFilterSummary(dk, kb) {
    return qaOk('Current filter & KPIs',
      '<p><strong>Filters:</strong> ' + escapeHtml(qaFilterContext()) + '</p>' +
      '<p>' + escapeHtml(qaDateContext()) + '</p>' +
      '<ul class="qa-list">' +
      '<li>Billing practices: <strong>' + fmtFull(kb.pracN) + '</strong></li>' +
      '<li>Treating providers (roster): <strong>' + fmtFull(kb.roster) + '</strong></li>' +
      '<li>Active: <strong>' + fmtFull(kb.activeProv) + '</strong> · Inactive: <strong>' + fmtFull(kb.noneProv) + '</strong></li>' +
      '<li>With encounter: <strong>' + fmtFull(kb.encProv) + '</strong> · Feature-only: <strong>' + fmtFull(kb.featProv) + '</strong></li>' +
      '<li>Encounter events (selected range): <strong>' + fmtFull(dk.sumEnc) + '</strong></li>' +
      '<li>Feature events (selected range): <strong>' + fmtFull(dk.sumFeat) + '</strong></li>' +
      '<li>AI events (selected range): <strong>' + fmtFull(dk.sumAI) + '</strong></li>' +
      '<li>Avg features / active provider: <strong>' + escapeHtml(dk.favgVal) + '</strong></li>' +
      '</ul>',
      'buildDashboardKpis()');
  }

  function qaAnswer(question) {
    const q = String(question || '').trim();
    if (!q) return qaUnavailable('Enter a question or choose a suggested prompt.');
    if (typeof DATA === 'undefined' || !DATA.practices || !DATA.practices.length) {
      return qaUnavailable('Dashboard data is not loaded.');
    }

    const qLower = qaNormalize(q);
    const tokens = qaTokens(q);
    let dk, kb;
    try {
      dk = typeof buildDashboardKpis === 'function' ? buildDashboardKpis() : null;
      kb = dk ? dk.kb : null;
    } catch (e) {
      return qaUnavailable('Could not compute KPIs.', String(e.message || e));
    }
    if (!dk || !kb) return qaUnavailable('KPI helpers are not available.');

    const early = qaEarlyEntityAnswer(q, qLower);
    if (early) return early;

    const scores = {
      help: qaIntentScore(qLower, tokens, ['what can', 'what questions', 'help', 'how do you work']),
      filter: qaIntentScore(qLower, tokens, ['filter', 'summary', 'summarize', 'kpi', 'portfolio', 'overview', 'current selection', 'how many practices', 'billing practices']),
      avgFeat: qaIntentScore(qLower, tokens, ['avg features', 'average features', 'features per active', 'favg', 'feat per active']) +
        (/(how|what|explain|mean|calculat|definition)/.test(qLower) ? 8 : 0),
      providers: qaIntentScore(qLower, tokens, ['active provider', 'inactive provider', 'roster', 'treating provider', 'how many provider']),
      refresh: qaIntentScore(qLower, tokens, ['last refresh', 'refreshed', 'generated', 'when was data', 'data period']),
      dates: qaIntentScore(qLower, tokens, ['date range', 'date slicer', 'selected range', 'how many days']),
      top: qaIntentScore(qLower, tokens, [/\btop\s+\d+/, /\bbottom\s+\d+/, 'highest', 'lowest', 'most encounters', 'most features']),
      totalEnc: qaIntentScore(qLower, tokens, ['encounter', 'consult', 'enc ']) + (/how many|total|count|number/.test(qLower) ? 6 : 0),
      totalFeat: qaIntentScore(qLower, tokens, ['feature event', 'meaningful', 'feat event']) + (/how many|total|count/.test(qLower) ? 6 : 0),
      totalAi: qaIntentScore(qLower, tokens, ['ai event', 'ai feature', 'nora', 'clinical assistant']),
      bc: qaIntentScore(qLower, tokens, ['clients for', 'practices for', 'bc ', 'business consultant']),
      anomalies: qaIntentScore(qLower, tokens, ['anomal', 'no bc', 'without bc', 'unassigned']),
      engagement: qaIntentScore(qLower, tokens, ['feature only', 'feature-only', 'inactive practice', 'engagement']),
    };

    const ranked = Object.entries(scores).sort(function (a, b) { return b[1] - a[1]; });
    const best = ranked[0];
    const second = ranked[1];
    let winner = best && best[1] >= 8 && (best[1] >= (second ? second[1] + 3 : 0)) ? best[0] : null;
    if (winner && !qaMetricQuestion(qLower)) {
      const probe = qaSearchPractices(qaLookupSearchTerm(q, qLower) || q, { minScore: 20, limit: 3 });
      if (probe.length && probe[0].score >= 70 && best[1] < 18) winner = null;
    }

    if (winner === 'help') {
      return qaOk('What I can answer',
        '<p>Search by <strong>practice name</strong>, <strong>BPN</strong>, <strong>TPN</strong>, <strong>BC name</strong>, or <strong>provider name</strong> — even partial words.</p>' +
        '<ul class="qa-list">' +
        '<li>Filter & KPI summary</li><li>Metric definitions (e.g. avg features / active provider)</li>' +
        '<li>Top / bottom practices by encounters or features</li>' +
        '<li>Practices for a BC · Provider lookup</li><li>Date range & data refresh</li>' +
        '</ul><p class="qa-muted">Answers use only embedded data. No invented numbers.</p>',
        'Dashboard Q&A');
    }

    if (winner === 'avgFeat') {
      const w = dk.wExec;
      const winTxt = w && w.nDays
        ? (w.nDays < 30 ? w.nDays + 'd (' + formatDateShort(w.startStr) + '–' + formatDateShort(w.endStr) + ')'
          : 'up to 30d ending ' + formatDate(w.endStr))
        : '—';
      return qaOk('Avg features / active provider',
        '<p><strong>Current (this filter):</strong> ' + escapeHtml(dk.favgVal) + '</p>' +
        '<p><strong>Formula:</strong> ' + fmtFull(kb.sumFeatActive) + ' ÷ ' + fmtFull(kb.activeProv) +
        ' = meaningful feature events in the <em>activity window</em> ÷ active treating providers.</p>' +
        '<ul class="qa-list"><li>Active = ≥1 consult-complete OR ≥1 meaningful feature in window</li>' +
        '<li>Window: ' + escapeHtml(winTxt) + '</li></ul>' +
        '<p class="qa-muted">Feature events (slice) over full selected range: ' + fmtFull(dk.sumFeat) + ' — different time basis.</p>',
        'provDaily · kpiBundleForFilteredPractices()');
    }

    if (winner === 'providers') {
      return qaOk('Treating provider KPIs (current filter)',
        '<ul class="qa-list"><li>Roster: <strong>' + fmtFull(kb.roster) + '</strong></li>' +
        '<li>Active: <strong>' + fmtFull(kb.activeProv) + '</strong> — ' + escapeHtml(dk.activeSub) + '</li>' +
        '<li>Inactive: <strong>' + fmtFull(kb.noneProv) + '</strong></li>' +
        '<li>With encounter: <strong>' + fmtFull(kb.encProv) + '</strong></li>' +
        '<li>Feature-only: <strong>' + fmtFull(kb.featProv) + '</strong></li></ul>' +
        '<p class="qa-muted">' + escapeHtml(qaDateContext()) + '</p>',
        'providerEngagementSplit()');
    }

    if (winner === 'refresh') {
      const m = DATA.metadata || {};
      return qaOk('Data freshness',
        '<ul class="qa-list"><li><strong>Generated:</strong> ' + escapeHtml(String(DATA.generatedAt || m.LastRefreshed || '—')) +
        (m.LastRefreshed_SAST ? ' · ' + escapeHtml(m.LastRefreshed_SAST) + ' SAST' : '') + '</li>' +
        '<li><strong>Events in bundle:</strong> ' + escapeHtml(m.DataDateMin || '—') + ' → ' + escapeHtml(m.DataDateMax || '—') + '</li>' +
        '<li><strong>Practices in bundle:</strong> ' + fmtFull(DATA.practices.length) + '</li></ul>',
        'DATA.metadata');
    }

    if (winner === 'dates') {
      return qaOk('Date selection', '<p>' + escapeHtml(qaDateContext()) + '</p>',
        'SLICER · getExec30dWindow()');
    }

    if (winner === 'filter') {
      return qaAnswerFilterSummary(dk, kb);
    }

    if (winner === 'top' || /\btop\s+\d+|\bbottom\s+\d+|highest|lowest/.test(qLower)) {
      const n = qaExtractTopN(q, 10);
      const bottom = /\bbottom\b|\blowest\b/.test(qLower);
      const byFeat = /feature|feat/.test(qLower) && !/encounter|enc|consult/.test(qLower);
      const sorted = dk.kpiSet.slice().sort(function (a, b) {
        const va = byFeat ? (a.feat || 0) : (a.enc || 0);
        const vb = byFeat ? (b.feat || 0) : (b.enc || 0);
        return bottom ? va - vb : vb - va;
      });
      const top = sorted.filter(function (p) { return byFeat ? (p.feat || 0) > 0 : (p.enc || 0) > 0; }).slice(0, n);
      if (!top.length) {
        return qaUnavailable('No practices with ' + (byFeat ? 'feature' : 'encounter') + ' events in the current filter and range.');
      }
      return qaOk((bottom ? 'Bottom ' : 'Top ') + top.length + ' by ' + (byFeat ? 'features' : 'encounters'),
        '<ul class="qa-list">' + top.map(function (p, i) {
          return '<li>' + (i + 1) + '. <strong>' + escapeHtml(p.name) + '</strong> (BPN ' + escapeHtml(p.bpn) + ') — <strong>' +
            fmtFull(byFeat ? p.feat : p.enc) + '</strong></li>';
        }).join('') + '</ul>',
        'Practice slice totals · filtered set');
    }

    if (winner === 'totalEnc' || (/(how many|total|count).*(encounter|consult)/.test(qLower) && scores.totalEnc >= 8)) {
      return qaOk('Encounter events',
        '<p><strong>' + fmtFull(dk.sumEnc) + '</strong> consult-complete events across the current filter for the <strong>selected date range</strong>.</p>' +
        '<p class="qa-muted">' + escapeHtml(qaDateContext()) + '</p>',
        'buildDashboardKpis().sumEnc');
    }

    if (winner === 'totalFeat' || (/(how many|total|count).*(feature|meaningful)/.test(qLower) && scores.totalFeat >= 8)) {
      return qaOk('Feature events',
        '<p><strong>' + fmtFull(dk.sumFeat) + '</strong> meaningful feature events (selected range).</p>' +
        '<p>Avg features / active provider (activity window): <strong>' + escapeHtml(dk.favgVal) + '</strong></p>',
        'buildDashboardKpis().sumFeat');
    }

    if (winner === 'totalAi' || /ai event|nora/.test(qLower)) {
      return qaOk('AI feature events',
        '<p><strong>' + fmtFull(dk.sumAI) + '</strong> events in category “5. AI Features” (selected date range, current filter).</p>',
        'practice cats · slicer slice');
    }

    if (winner === 'bc') {
      const m = q.match(/(?:bc|consultant|clients for|practices for)\s+["']?([^"']+?)["']?(?:\?|$)/i) ||
        q.match(/["']([^"']+)["']\s*(?:clients|practices)/i);
      const bcName = m && m[1] ? m[1].trim() : tokens.filter(function (t) {
        return t.length > 2 && !/bc|client|practice|how|many/.test(t);
      }).join(' ');
      if (!bcName) return qaUnavailable('Name the BC to search, e.g. practices for Jane Smith');
      const list = DATA.practices.filter(function (p) {
        return String(p.bc || '').toLowerCase().indexOf(bcName.toLowerCase()) >= 0;
      });
      const inFilter = list.filter(function (p) {
        return dk.kpiSet.some(function (k) { return k.bpn === p.bpn; });
      });
      return qaOk('BC match: “' + bcName + '”',
        '<p><strong>' + fmtFull(list.length) + '</strong> practices in bundle · <strong>' + fmtFull(inFilter.length) + '</strong> in current filter.</p>' +
        (inFilter.length ? '<ul class="qa-list">' + inFilter.slice(0, 12).map(function (p) {
          return '<li><strong>' + escapeHtml(p.name) + '</strong> · BPN ' + escapeHtml(p.bpn) + ' · enc ' + fmtFull(p.enc) + '</li>';
        }).join('') + '</ul>' : '<p class="qa-muted">None in current filter — clear filters or adjust BC dropdown.</p>'),
        'DATA.practices · FC');
    }

    if (winner === 'anomalies' || /no bc|without bc|unassigned bc/.test(qLower)) {
      let noBc = 0;
      dk.kpiSet.forEach(function (p) {
        if (!p.bc && ((p.enc || 0) > 0 || (p.feat || 0) > 0)) noBc++;
      });
      return qaOk('Practices without BC (with activity)',
        '<p><strong>' + fmtFull(noBc) + '</strong> practices in the current filter have activity but no BC assigned.</p>' +
        '<p class="qa-muted">See Anomalies tab for full list.</p>',
        'fcForKpiStats()');
    }

    if (winner === 'engagement') {
      let fo = 0;
      dk.kpiSet.forEach(function (p) { if (p.engagement === 'feature_only') fo++; });
      return qaOk('Engagement (practices, selected range)',
        '<ul class="qa-list"><li>Feature-only practices: <strong>' + fmtFull(fo) + '</strong></li>' +
        '<li>Feature-only providers (activity window): <strong>' + fmtFull(kb.featProv) + '</strong></li></ul>',
        'practice.engagement · providerEngagementSplit()');
    }

    // Provider name search
    if (/provider|tpn|doctor|dr\b|treating/.test(qLower) && tokens.length >= 1) {
      const term = qaLookupSearchTerm(q, qLower) || tokens.join(' ');
      const provHits = qaSearchProviders(term, { minScore: 14, limit: 8 });
      if (provHits.length) {
        const rows = provHits.map(function (h) {
          const daily = h.pr.provKey && typeof provider30dEncFeatFromDaily === 'function'
            ? provider30dEncFeatFromDaily(h.pr.provKey) : { enc: h.pr.enc, feat: h.pr.feat };
          return '<li><strong>' + escapeHtml(h.pr.name) + '</strong> (TPN ' + escapeHtml(h.pr.tpn) + ') at <strong>' +
            escapeHtml(h.p.name) + '</strong> · enc ' + fmtFull(daily.enc) + ' · feat ' + fmtFull(daily.feat) + '</li>';
        }).join('');
        return qaOk('Provider matches', '<ul class="qa-list">' + rows + '</ul>', 'DATA.practices · provDaily');
      }
    }

    // Fuzzy practice search — primary fallback for free text
    const searchTerm = qaLookupSearchTerm(q, qLower) || q;
    const hits = qaSearchPractices(searchTerm, { minScore: 12, limit: 12 });
    if (hits.length) {
      if (hits.length === 1 || hits[0].score >= 80) {
        return qaOk(hits[0].p.name, qaPracticeBlock(hits[0].p), 'DATA.practices · match score ' + hits[0].score);
      }
      const rows = hits.map(function (h) {
        return '<li><button type="button" class="qa-link-btn" data-q="' + escapeHtmlAttr(h.p.name) + '">' +
          '<strong>' + escapeHtml(h.p.name) + '</strong></button> · BPN ' + escapeHtml(h.p.bpn) +
          ' · enc <strong>' + fmtFull(h.p.enc) + '</strong> · feat <strong>' + fmtFull(h.p.feat) + '</strong></li>';
      }).join('');
      return qaOk(hits.length + ' practice matches',
        '<p>Click a name for full detail, or refine your search.</p><ul class="qa-list">' + rows + '</ul>',
        'Fuzzy search on filtered practices');
    }

    // Try full bundle if filter excluded matches
    const hitsAll = qaSearchPractices(searchTerm, { pool: qaPool(true), minScore: 50, limit: 5 });
    if (hitsAll.length && (FC || []).length < DATA.practices.length) {
      return qaUnavailable(
        'No match in the <strong>current filter</strong>, but found in the full bundle.',
        'Did you mean <strong>' + escapeHtml(hitsAll[0].p.name) + '</strong> (BPN ' + escapeHtml(hitsAll[0].p.bpn) + ')? Clear filters or search that BPN.',
        ['Clear filters and ask again', 'Summarize the current filter and KPI counts']
      );
    }

    // Weak token suggestions
    if (tokens.length >= 1) {
      const loose = qaSearchPractices(tokens[0], { minScore: 8, limit: 5 });
      if (loose.length) {
        return qaOutOfScope('Your question did not match a known metric pattern.', qaSuggestHints(qLower).concat(
          loose.map(function (h) { return 'Tell me about ' + h.p.name; })
        ));
      }
    }

    return qaOutOfScope(null, qaSuggestHints(qLower));
  }

  function showQaResult(result) {
    const box = document.getElementById('qa-answer');
    if (!box) return;
    const statusClass = 'qa-status-' + (result.status || 'unavailable');
    const foot = result.footnote
      ? '<p class="qa-footnote"><strong>Source:</strong> ' + escapeHtml(result.footnote) + '</p>' : '';
    box.innerHTML =
      '<div class="qa-result ' + statusClass + '">' +
      '<div class="qa-result-title">' + escapeHtml(result.title || '') + '</div>' +
      '<div class="qa-result-body">' + (result.html || '') + '</div>' + foot + '</div>';
    box.querySelectorAll('.qa-link-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const inp = document.getElementById('qa-input');
        if (inp) inp.value = btn.getAttribute('data-q') || '';
        window.runDataQA();
      });
    });
  }

  window.qaAnswer = qaAnswer;
  window.qaSearchPractices = qaSearchPractices;

  window.renderQA = function () {
    const pills = document.getElementById('qa-prompts');
    if (pills && !pills.dataset.ready) {
      pills.dataset.ready = '1';
      pills.innerHTML = QA_PROMPTS.map(function (p, i) {
        const q = p.q || 'Type a practice name in the box below';
        return '<button type="button" class="qa-prompt-btn" data-q="' + escapeHtmlAttr(q) + '" data-idx="' + i + '">' +
          escapeHtml(p.label) + '</button>';
      }).join('');
      pills.querySelectorAll('.qa-prompt-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const inp = document.getElementById('qa-input');
          const q = btn.getAttribute('data-q') || '';
          if (inp) inp.value = q;
          if (q) window.runDataQA();
          else if (inp) inp.focus();
        });
      });
    }
    const ctx = document.getElementById('qa-context');
    if (ctx) ctx.textContent = qaFilterContext() + ' · ' + qaDateContext();
    qaBindSuggest();
  };

  let _qaSuggestTimer = null;
  let _qaSuggestActive = -1;

  function qaHideSuggest(sug) {
    if (!sug) return;
    sug.innerHTML = '';
    sug.style.display = 'none';
    _qaSuggestActive = -1;
  }

  function qaSetSuggestActive(sug, idx) {
    if (!sug) return;
    const btns = sug.querySelectorAll('.qa-suggest-item');
    btns.forEach(function (b, i) {
      b.classList.toggle('qa-suggest-active', i === idx);
    });
    if (idx >= 0 && btns[idx]) btns[idx].scrollIntoView({ block: 'nearest' });
    _qaSuggestActive = idx;
  }

  function qaShowSuggestions(inp, sug, items) {
    if (!items.length) {
      qaHideSuggest(sug);
      return;
    }
    sug.style.display = 'block';
    sug.innerHTML = items.map(qaRenderSuggestItem).join('');
    _qaSuggestActive = -1;
    sug.querySelectorAll('.qa-suggest-item').forEach(function (btn, i) {
      btn.addEventListener('click', function () {
        inp.value = btn.getAttribute('data-q') || '';
        qaHideSuggest(sug);
        window.runDataQA();
      });
      btn.addEventListener('mouseenter', function () {
        qaSetSuggestActive(sug, i);
      });
    });
  }

  function qaBindSuggest() {
    const inp = document.getElementById('qa-input');
    const sug = document.getElementById('qa-suggest');
    if (!inp || !sug || inp.dataset.qaBound) return;
    inp.dataset.qaBound = '1';
    inp.addEventListener('input', function () {
      clearTimeout(_qaSuggestTimer);
      _qaSuggestTimer = setTimeout(function () {
        const v = inp.value.trim();
        if (v.length < 2) {
          qaHideSuggest(sug);
          return;
        }
        qaShowSuggestions(inp, sug, qaBuildSuggestions(v));
      }, 180);
    });
    inp.addEventListener('keydown', function (e) {
      const btns = sug.querySelectorAll('.qa-suggest-item');
      const open = sug.style.display === 'block' && btns.length;
      if (e.key === 'ArrowDown' && open) {
        e.preventDefault();
        qaSetSuggestActive(sug, Math.min(btns.length - 1, _qaSuggestActive + 1));
        return;
      }
      if (e.key === 'ArrowUp' && open) {
        e.preventDefault();
        qaSetSuggestActive(sug, Math.max(0, _qaSuggestActive <= 0 ? 0 : _qaSuggestActive - 1));
        return;
      }
      if (e.key === 'Enter') {
        if (open && _qaSuggestActive >= 0 && btns[_qaSuggestActive]) {
          e.preventDefault();
          inp.value = btns[_qaSuggestActive].getAttribute('data-q') || '';
          qaHideSuggest(sug);
          window.runDataQA();
          return;
        }
        qaHideSuggest(sug);
        window.runDataQA();
        return;
      }
      if (e.key === 'Escape') qaHideSuggest(sug);
    });
    document.addEventListener('click', function (e) {
      if (!inp.contains(e.target) && !sug.contains(e.target)) qaHideSuggest(sug);
    });
  }

  window.runDataQA = function () {
    const sug = document.getElementById('qa-suggest');
    if (sug) sug.style.display = 'none';
    const inp = document.getElementById('qa-input');
    showQaResult(qaAnswer(inp ? inp.value : ''));
  };
})();
