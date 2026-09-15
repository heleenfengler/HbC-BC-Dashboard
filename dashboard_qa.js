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
    { label: 'Persona mix', q: 'Persona mix in the current filter' },
    { label: 'Feature categories', q: 'Feature category breakdown in the current filter' },
    { label: 'Zero usage practices', q: 'Which practices have zero usage in the selected range?' },
    { label: 'Month vs prior month', q: 'Compare August vs July for the current filter' },
    { label: 'Top 10 by encounters', q: 'Top 10 practices by encounters' },
    { label: 'Version adoption', q: 'How many practices are on the latest app version?' },
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
    { label: 'Persona mix', q: 'Persona mix in the current filter' },
    { label: 'Feature categories', q: 'Feature category breakdown in the current filter' },
    { label: 'Zero usage practices', q: 'Which practices have zero usage in the selected range?' },
    { label: 'Month vs prior month', q: 'Compare August vs July for the current filter' },
    { label: 'Top 10 by encounters', q: 'Top 10 practices by encounters' },
    { label: 'Top features for a practice', q: 'Top features for practice' },
    { label: 'Version adoption', q: 'How many practices are on the latest app version?' },
    { label: 'Avg features / active provider', q: 'How is avg features per active provider calculated?' },
    { label: 'Date range & refresh', q: 'What date range is selected and when was data last refreshed?' },
    { label: 'Encounter count', q: 'How many encounter events in the current filter?' },
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
    'persona', 'category', 'categories', 'zero usage', 'dormant', 'inactive practice',
    'month', 'compare', 'versus', ' vs ', 'mom', 'version', 'on latest', 'top feature',
  ];

  const QA_MONTH_ALIASES = {
    jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
    apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07',
    aug: '08', august: '08', sep: '09', sept: '09', september: '09',
    oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12',
  };

  function qaParseYearMonth(qLower) {
    const iso = qLower.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])\b/);
    if (iso) return iso[1] + '-' + String(iso[2]).padStart(2, '0');
    const named = qLower.match(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\b(?:\s+(20\d{2}))?/
    );
    if (!named) return null;
    const mm = QA_MONTH_ALIASES[named[1]];
    if (!mm) return null;
    let yyyy = named[2];
    if (!yyyy && DATA && DATA.metadata && DATA.metadata.DataDateMax) {
      yyyy = String(DATA.metadata.DataDateMax).slice(0, 4);
    }
    if (!yyyy && SLICER && SLICER.dates && SLICER.dates.length) {
      yyyy = String(SLICER.dates[SLICER.endIdx] || '').slice(0, 4);
    }
    if (!yyyy) yyyy = String(new Date().getFullYear());
    return yyyy + '-' + mm;
  }

  function qaParseTwoMonths(qLower) {
    const vs = qLower.match(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\b(?:\s+(20\d{2}))?\s+(?:vs|versus|compared to|against|to)\s+\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\b(?:\s+(20\d{2}))?/
    );
    if (!vs) return null;
    function ymFrom(name, year) {
      const mm = QA_MONTH_ALIASES[name];
      if (!mm) return null;
      let yyyy = year;
      if (!yyyy && DATA && DATA.metadata && DATA.metadata.DataDateMax) {
        yyyy = String(DATA.metadata.DataDateMax).slice(0, 4);
      }
      if (!yyyy) yyyy = String(new Date().getFullYear());
      return yyyy + '-' + mm;
    }
    const a = ymFrom(vs[1], vs[2]);
    const b = ymFrom(vs[3], vs[4]);
    if (!a || !b) return null;
    return { a: a, b: b };
  }

  function qaMonthLabel(ym) {
    if (!ym || ym.length < 7) return ym || '—';
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const m = parseInt(ym.slice(5, 7), 10);
    return (names[m - 1] || ym) + ' ' + ym.slice(2, 4);
  }

  function qaPriorMonth(ym) {
    const y = parseInt(ym.slice(0, 4), 10);
    const m = parseInt(ym.slice(5, 7), 10);
    if (m <= 1) return (y - 1) + '-12';
    return y + '-' + String(m - 1).padStart(2, '0');
  }

  function qaBpnDailyRecs(bpn) {
    const bd = DATA.bpnDaily || {};
    const key = String(bpn);
    if (bd[key]) return bd[key];
    const norm = String(bpn).replace(/^0+/, '') || '0';
    if (bd[norm]) return bd[norm];
    for (const k of Object.keys(bd)) {
      if (String(k).replace(/^0+/, '') === norm) return bd[k];
    }
    return [];
  }

  function qaUsageForMonth(bpn, ym) {
    const recs = qaBpnDailyRecs(bpn);
    let enc = 0, feat = 0, days = 0;
    if (!SLICER || !SLICER.dates) return { enc: 0, feat: 0, days: 0 };
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      const d = SLICER.dates[r[0]];
      if (!d || d.indexOf(ym) !== 0) continue;
      enc += r[1] || 0;
      feat += r[2] || 0;
      if ((r[1] || 0) > 0 || (r[2] || 0) > 0) days += 1;
    }
    return { enc: enc, feat: feat, days: days };
  }

  function qaUsageInSlicer(bpn) {
    const recs = qaBpnDailyRecs(bpn);
    let enc = 0, feat = 0, days = 0;
    if (!SLICER || !SLICER.dates) return { enc: 0, feat: 0, days: 0 };
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      if (r[0] < SLICER.startIdx || r[0] > SLICER.endIdx) continue;
      enc += r[1] || 0;
      feat += r[2] || 0;
      if ((r[1] || 0) > 0 || (r[2] || 0) > 0) days += 1;
    }
    return { enc: enc, feat: feat, days: days };
  }

  function qaAggregateTopFeatures(p, limit) {
    const map = {};
    (p.providers || []).forEach(function (pr) {
      (pr.topFeatures || []).forEach(function (f) {
        let name = null;
        let cnt = 0;
        let cat = '';
        if (Array.isArray(f)) {
          name = f[0];
          cnt = f[1] || 0;
        } else if (f && typeof f === 'object') {
          name = f.feature || f.name || f.key || null;
          cnt = f.count || f.n || 0;
          cat = String(f.category || '');
        } else if (typeof f === 'string') {
          name = f;
          cnt = 1;
        }
        if (!name) return;
        if (/^9\.\s*Noise/i.test(cat)) return;
        map[name] = (map[name] || 0) + (Number(cnt) || 0);
      });
    });
    return Object.keys(map).map(function (k) {
      return { name: k, count: map[k] };
    }).sort(function (a, b) { return b.count - a.count; }).slice(0, limit || 10);
  }

  function qaCategoryTotals(set) {
    const totals = {};
    (set || []).forEach(function (p) {
      const cats = p.cats || {};
      Object.keys(cats).forEach(function (c) {
        totals[c] = (totals[c] || 0) + (cats[c] || 0);
      });
    });
    return Object.keys(totals).map(function (c) {
      return { cat: c, n: totals[c] };
    }).sort(function (a, b) { return b.n - a.n; });
  }

  function qaPersonaMix(set) {
    const counts = {};
    (set || []).forEach(function (p) {
      const persona = typeof practicePersonaForDisplay === 'function'
        ? practicePersonaForDisplay(p)
        : (p.persona || 'Unknown');
      counts[persona] = (counts[persona] || 0) + 1;
    });
    return counts;
  }

  function qaResolvePracticeFromQuestion(q, qLower) {
    const term = qaLookupSearchTerm(q, qLower);
    if (!term) return null;
    const hits = qaSearchPractices(term, { minScore: 18, limit: 5, pool: qaPool(true) });
    if (!hits.length) return null;
    if (hits.length === 1 || hits[0].score >= 70) return hits[0].p;
    return hits[0].p;
  }

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
    const sliceU = qaUsageInSlicer(p.bpn);
    const persona = typeof practicePersonaForDisplay === 'function'
      ? practicePersonaForDisplay(p) : (p.persona || '—');
    const topFeats = qaAggregateTopFeatures(p, 5);
    const cats = qaCategoryTotals([p]).slice(0, 5);
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
    let featHtml = '';
    if (topFeats.length) {
      featHtml = '<p class="qa-muted">Top features (lifetime / bundle ranking):</p><ul class="qa-list">' +
        topFeats.map(function (f) {
          const label = typeof featLabel === 'function' ? featLabel(f.name) : f.name;
          return '<li>' + escapeHtml(label) + ' — <strong>' + fmtFull(f.count) + '</strong></li>';
        }).join('') + '</ul>';
    }
    let catHtml = '';
    if (cats.length) {
      catHtml = '<p class="qa-muted">Feature categories (bundle totals):</p><ul class="qa-list">' +
        cats.map(function (c) {
          return '<li>' + escapeHtml(c.cat) + ' — <strong>' + fmtFull(c.n) + '</strong></li>';
        }).join('') + '</ul>';
    }
    return '<p><strong>' + escapeHtml(p.name) + '</strong> · BPN <code>' + escapeHtml(p.bpn) + '</code></p>' +
      '<ul class="qa-list">' +
      '<li>BC: ' + (p.bc ? escapeHtml(p.bc) : 'Unassigned') + '</li>' +
      '<li>Team: ' + escapeHtml(p.team || '—') + ' · PMA: ' + escapeHtml(p.pma || '—') + '</li>' +
      '<li>Status: ' + escapeHtml(p.status || '—') + ' · Engagement: ' + escapeHtml(p.engagement || '—') +
      ' · Persona: ' + escapeHtml(persona) + '</li>' +
      '<li>App version: ' + escapeHtml(p.appVer || '—') +
      (p.onLatest ? ' · <strong>on latest</strong>' : '') + '</li>' +
      '<li>Encounters (selected range): <strong>' + fmtFull(sliceU.enc) + '</strong> · active days: ' +
      fmtFull(sliceU.days) + '</li>' +
      '<li>Feature events (selected range): <strong>' + fmtFull(sliceU.feat) + '</strong></li>' +
      '<li>Bundle totals — enc: <strong>' + fmtFull(p.enc || 0) + '</strong> · feat: <strong>' +
      fmtFull(p.feat || 0) + '</strong></li>' +
      '<li>Last active: ' + (p.lastActive ? formatDate(p.lastActive) : '—') + '</li>' +
      '</ul>' + featHtml + catHtml +
      ((p.providers || []).length
        ? '<p class="qa-muted">Providers' + (w && w.nDays ? ' · ' + w.nDays + 'd window' : '') + ':</p><ul class="qa-list">' + provLines + more + '</ul>'
        : '<p class="qa-muted">No per-provider rows in bundle.</p>');
  }

  function qaSuggestHints(qLower) {
    const hints = [];
    if (/enc|consult/.test(qLower)) hints.push('How many encounter events in the current filter?');
    if (/feat|feature/.test(qLower)) hints.push('Feature category breakdown in the current filter');
    if (/persona|dormant|zero/.test(qLower)) hints.push('Persona mix in the current filter');
    if (/month|aug|jul|sep|compare|vs/.test(qLower)) hints.push('Compare August vs July for the current filter');
    if (/version|latest/.test(qLower)) hints.push('How many practices are on the latest app version?');
    if (/bc|consultant/.test(qLower)) hints.push('Summarize the current filter and KPI counts');
    if (/date|range|when|refresh/.test(qLower)) hints.push('What date range is selected and when was data last refreshed?');
    if (hints.length < 3) {
      hints.push('Summarize the current filter and KPI counts');
      hints.push('Which practices have zero usage in the selected range?');
      hints.push('What questions can you answer?');
    }
    return hints.slice(0, 5);
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
      personas: qaIntentScore(qLower, tokens, ['persona', 'power clinical', 'active clinical', 'low clinical', 'dormant']),
      categories: qaIntentScore(qLower, tokens, ['category breakdown', 'feature categor', 'categories', 'clinical doc', 'pathology', 'scripts']),
      zeroUsage: qaIntentScore(qLower, tokens, ['zero usage', 'no usage', 'no activity', 'inactive practice', 'dormant practice', 'which practices have zero']),
      mom: qaIntentScore(qLower, tokens, ['compare', 'versus', ' vs ', 'mom', 'month on month', 'month-over-month']) +
        (qaParseTwoMonths(qLower) ? 14 : 0),
      version: qaIntentScore(qLower, tokens, ['latest version', 'on latest', 'app version', 'version adoption', 'upgrade']),
      topFeatures: qaIntentScore(qLower, tokens, ['top feature', 'feature used', 'which features', 'most used feature']),
      monthDetail: (qaParseYearMonth(qLower) && /(encounter|feature|usage|active day|consult)/.test(qLower) ? 16 : 0) +
        (qaParseYearMonth(qLower) ? 4 : 0),
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
        '<p>Search by <strong>practice name</strong>, <strong>BPN</strong>, <strong>TPN</strong>, <strong>BC name</strong>, or <strong>provider name</strong>.</p>' +
        '<ul class="qa-list">' +
        '<li>Filter &amp; KPI summary · date range &amp; refresh</li>' +
        '<li>Persona mix · feature category breakdown · version adoption</li>' +
        '<li>Zero-usage / dormant practices in the selected range</li>' +
        '<li>Month comparisons (e.g. “Compare August vs July for the current filter”)</li>' +
        '<li>Practice month detail (e.g. “Encounters for BPN 1234567 in August”)</li>' +
        '<li>Top features for a practice · top/bottom practices by enc/feat</li>' +
        '<li>Practices for a BC · provider lookup · metric definitions</li>' +
        '</ul><p class="qa-muted">Answers use only embedded dashboard data for the current filters and date slicer. No invented numbers.</p>',
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

    if (winner === 'personas') {
      const mix = qaPersonaMix(dk.kpiSet);
      const order = ['Power Clinical User', 'Active Clinical User', 'Low Clinical User', 'Inactive', 'Dormant'];
      const keys = order.filter(function (k) { return mix[k]; }).concat(
        Object.keys(mix).filter(function (k) { return order.indexOf(k) < 0; })
      );
      const total = dk.kpiSet.length || 1;
      return qaOk('Persona mix (current filter)',
        '<p>' + escapeHtml(qaDateContext()) + '</p>' +
        '<ul class="qa-list">' + keys.map(function (k) {
          const n = mix[k] || 0;
          const pct = Math.round((n / total) * 1000) / 10;
          return '<li>' + escapeHtml(k) + ': <strong>' + fmtFull(n) + '</strong> (' + pct + '%)</li>';
        }).join('') + '</ul>',
        'practicePersonaForDisplay() · clinical active days');
    }

    if (winner === 'categories') {
      const rows = qaCategoryTotals(dk.kpiSet);
      if (!rows.length) {
        return qaUnavailable('No feature category totals in the current filter.');
      }
      const sum = rows.reduce(function (s, r) { return s + r.n; }, 0) || 1;
      return qaOk('Feature categories (current filter)',
        '<p>Bundle category totals for practices in the current filter (not re-sliced by day).</p>' +
        '<ul class="qa-list">' + rows.map(function (r) {
          return '<li>' + escapeHtml(r.cat) + ': <strong>' + fmtFull(r.n) + '</strong> (' +
            (Math.round((r.n / sum) * 1000) / 10) + '%)</li>';
        }).join('') + '</ul>',
        'practice.cats');
    }

    if (winner === 'zeroUsage') {
      const zeros = dk.kpiSet.filter(function (p) {
        const u = qaUsageInSlicer(p.bpn);
        return u.enc === 0 && u.feat === 0;
      }).slice().sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      if (!zeros.length) {
        return qaOk('Zero usage',
          '<p>No practices in the current filter have zero encounters and zero features in the selected range.</p>',
          'bpnDaily · slicer');
      }
      const show = zeros.slice(0, 20);
      return qaOk('Zero usage in selected range (' + zeros.length + ')',
        '<p>' + escapeHtml(qaDateContext()) + '</p>' +
        '<ul class="qa-list">' + show.map(function (p) {
          return '<li><button type="button" class="qa-link-btn" data-q="' + escapeHtmlAttr(p.name) + '">' +
            escapeHtml(p.name) + '</button> · BPN ' + escapeHtml(p.bpn) +
            (p.bc ? ' · ' + escapeHtml(p.bc) : '') + '</li>';
        }).join('') + '</ul>' +
        (zeros.length > 20 ? '<p class="qa-muted">Showing first 20 of ' + zeros.length + '.</p>' : ''),
        'bpnDaily within slicer');
    }

    if (winner === 'mom' || qaParseTwoMonths(qLower)) {
      let pair = qaParseTwoMonths(qLower);
      if (!pair) {
        const one = qaParseYearMonth(qLower);
        if (one) pair = { a: one, b: qaPriorMonth(one) };
      }
      if (!pair) {
        // Default: latest full month in data vs prior
        const maxD = (DATA.metadata && DATA.metadata.DataDateMax) || (SLICER && SLICER.dates[SLICER.endIdx]);
        const latestYm = String(maxD || '').slice(0, 7);
        if (latestYm.length === 7) pair = { a: latestYm, b: qaPriorMonth(latestYm) };
      }
      if (!pair) return qaUnavailable('Name two months, e.g. Compare August vs July for the current filter.');
      // Prefer chronological: older first
      let left = pair.b;
      let right = pair.a;
      if (pair.a < pair.b) { left = pair.a; right = pair.b; }
      let encL = 0, featL = 0, encR = 0, featR = 0, activeL = 0, activeR = 0;
      dk.kpiSet.forEach(function (p) {
        const uL = qaUsageForMonth(p.bpn, left);
        const uR = qaUsageForMonth(p.bpn, right);
        encL += uL.enc; featL += uL.feat;
        encR += uR.enc; featR += uR.feat;
        if (uL.enc || uL.feat) activeL++;
        if (uR.enc || uR.feat) activeR++;
      });
      const dEnc = encR - encL;
      const dFeat = featR - featL;
      return qaOk(qaMonthLabel(left) + ' → ' + qaMonthLabel(right) + ' (current filter)',
        '<ul class="qa-list">' +
        '<li>Encounters: <strong>' + fmtFull(encL) + '</strong> → <strong>' + fmtFull(encR) + '</strong> (' +
        (dEnc >= 0 ? '+' : '') + fmtFull(dEnc) + ')</li>' +
        '<li>Features: <strong>' + fmtFull(featL) + '</strong> → <strong>' + fmtFull(featR) + '</strong> (' +
        (dFeat >= 0 ? '+' : '') + fmtFull(dFeat) + ')</li>' +
        '<li>Practices with any activity: <strong>' + fmtFull(activeL) + '</strong> → <strong>' +
        fmtFull(activeR) + '</strong></li>' +
        '</ul><p class="qa-muted">Uses daily telemetry months for the filtered practice set.</p>',
        'bpnDaily month buckets');
    }

    if (winner === 'version') {
      const latest = (DATA.metadata && DATA.metadata.LatestVersion) || '—';
      let on = 0, off = 0, unk = 0;
      dk.kpiSet.forEach(function (p) {
        if (p.onLatest) on++;
        else if (p.appVer) off++;
        else unk++;
      });
      return qaOk('App version adoption',
        '<p>Latest in bundle: <strong>' + escapeHtml(String(latest)) + '</strong></p>' +
        '<ul class="qa-list">' +
        '<li>On latest: <strong>' + fmtFull(on) + '</strong></li>' +
        '<li>Not on latest (has version): <strong>' + fmtFull(off) + '</strong></li>' +
        '<li>Unknown / blank: <strong>' + fmtFull(unk) + '</strong></li>' +
        '</ul>',
        'practice.onLatest · metadata.LatestVersion');
    }

    if (winner === 'topFeatures') {
      const p = qaResolvePracticeFromQuestion(q, qLower);
      if (!p) {
        return qaUnavailable('Name a practice or BPN, e.g. Top features for BPN 0154342',
          null, ['Top features for practice', 'Summarize the current filter and KPI counts']);
      }
      const feats = qaAggregateTopFeatures(p, 12);
      if (!feats.length) {
        return qaUnavailable('No topFeatures stored for ' + p.name + '.');
      }
      return qaOk('Top features · ' + p.name,
        '<p>BPN ' + escapeHtml(p.bpn) + ' · aggregated across treating providers (bundle ranking).</p>' +
        '<ul class="qa-list">' + feats.map(function (f, i) {
          const label = typeof featLabel === 'function' ? featLabel(f.name) : f.name;
          return '<li>' + (i + 1) + '. ' + escapeHtml(label) + ' — <strong>' + fmtFull(f.count) + '</strong></li>';
        }).join('') + '</ul>',
        'provider.topFeatures');
    }

    if (winner === 'monthDetail' || (qaParseYearMonth(qLower) && qaResolvePracticeFromQuestion(q, qLower))) {
      const ym = qaParseYearMonth(qLower);
      const p = qaResolvePracticeFromQuestion(q, qLower);
      if (ym && p) {
        const u = qaUsageForMonth(p.bpn, ym);
        const prior = qaPriorMonth(ym);
        const up = qaUsageForMonth(p.bpn, prior);
        return qaOk(p.name + ' · ' + qaMonthLabel(ym),
          '<ul class="qa-list">' +
          '<li>Encounters: <strong>' + fmtFull(u.enc) + '</strong> · active days: ' + fmtFull(u.days) + '</li>' +
          '<li>Feature events: <strong>' + fmtFull(u.feat) + '</strong></li>' +
          '<li>' + qaMonthLabel(prior) + ' comparison — enc ' + fmtFull(up.enc) + ' → ' + fmtFull(u.enc) +
          ' · feat ' + fmtFull(up.feat) + ' → ' + fmtFull(u.feat) + '</li>' +
          '</ul>' +
          '<p class="qa-muted"><button type="button" class="qa-link-btn" data-q="' + escapeHtmlAttr(p.name) +
          '">Full practice detail</button></p>',
          'bpnDaily · ' + ym);
      }
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
