const STATE = {
  competitions: [],
  selectedCode: null,
  currentFilter: 'all',
  matches: [],
  standings: [],
  teams: [],
  refreshTimer: null,
};

async function fetchJSON(url) {
  const resp = await fetch(url);
  return resp.json();
}

/* ── Competition Loading ── */
async function loadCompetitions() {
  const compList = document.getElementById('comp-list');
  try {
    const result = await fetchJSON('/api/competitions');
    if (!result.success) throw new Error(result.error || 'Failed to load competitions');
    STATE.competitions = result.data || [];
    renderCompetitionBar(STATE.competitions);
    const first = STATE.competitions[0];
    if (first) selectCompetition(first.code);
  } catch (err) {
    compList.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

function renderCompetitionBar(competitions) {
  const list = document.getElementById('comp-list');
  list.innerHTML = competitions.map(c => `
    <button class="comp-item" data-code="${c.code}" role="tab" aria-selected="false">
      ${c.emblem ? `<img src="${c.emblem}" alt="" class="comp-emblem" loading="lazy">` : `<span class="comp-emblem comp-emblem-fallback">${c.code.slice(0, 2)}</span>`}
      <span class="comp-name">${c.name}</span>
      <span class="comp-area">${c.area || ''}</span>
    </button>
  `).join('');
}

/* ── Competition Selection ── */
function selectCompetition(code) {
  closeSearch();
  if (STATE.selectedCode === code) return;
  STATE.selectedCode = code;

  document.querySelectorAll('.comp-item').forEach(el => {
    const sel = el.dataset.code === code;
    el.classList.toggle('active', sel);
    el.setAttribute('aria-selected', sel);
  });

  const comp = STATE.competitions.find(c => c.code === code);
  if (comp) {
    const heroTitle = document.getElementById('hero-title');
    const heroKicker = document.getElementById('hero-kicker');
    const heroLead = document.getElementById('hero-lead');
    const compSeason = document.getElementById('comp-season');

    heroTitle.textContent = comp.name;
    heroKicker.textContent = `${comp.area || 'International'} • ${comp.type || 'Competition'}`;

    const hero = document.querySelector('.hero');
    if (comp.emblem) {
      hero.style.setProperty('--hero-emblem', `url(${comp.emblem})`);
    } else {
      hero.style.setProperty('--hero-emblem', 'none');
    }

    if (comp.currentSeason) {
      compSeason.textContent = `${comp.currentSeason} Season`;
    } else {
      compSeason.textContent = code;
    }
  }

  loadAllData(code);
}

/* ── Data Loading ── */
async function loadAllData(code) {
  const filter = STATE.currentFilter;
  const [matchesResult, standingsResult, teamsResult] = await Promise.all([
    fetchJSON(`/api/matches?competition=${code}&filter=${filter}`),
    fetchJSON(`/api/standings?competition=${code}`),
    fetchJSON(`/api/teams?competition=${code}`),
  ]);

  if (matchesResult.success) STATE.matches = matchesResult.data || [];
  if (standingsResult.success) STATE.standings = standingsResult.data || [];
  if (teamsResult.success) STATE.teams = teamsResult.data || [];

  renderMatches(code, filter);
  renderStandings();
  renderTeams();
  updateLiveCount();
  startAutoRefresh(code);
}

function startAutoRefresh(code) {
  if (STATE.refreshTimer) clearInterval(STATE.refreshTimer);
  STATE.refreshTimer = setInterval(() => {
    const filter = STATE.currentFilter;
    fetchJSON(`/api/matches?competition=${code}&filter=${filter}`)
      .then(result => {
        if (result.success) STATE.matches = result.data || [];
        renderMatches(code, filter);
        updateLiveCount();
      })
      .catch(() => {});
  }, 60000);
}

/* ── Match Rendering ── */
function renderMatches(code, filter) {
  const container = document.getElementById('matches-container');
  const resultsContainer = document.getElementById('results-container');

  if (!STATE.matches.length) {
    const empty = '<p class="no-data">No matches found.</p>';
    container.innerHTML = empty;
    resultsContainer.innerHTML = empty;
    return;
  }

  const scheduleMatches = STATE.matches.filter(m => m.status === 'upcoming' || m.status === 'live');
  const finishedMatches = STATE.matches.filter(m => m.status === 'finished');

  container.innerHTML = scheduleMatches.length
    ? scheduleMatches.map(m => renderMatchCard(m, code)).join('')
    : '<p class="no-data">No upcoming matches.</p>';

  resultsContainer.innerHTML = finishedMatches.length
    ? finishedMatches.slice(0, 10).map(m => renderMatchCard(m, code)).join('')
    : '<p class="no-data">No results yet.</p>';
}

function renderMatchCard(m) {
  const isLive = m.status === 'live';
  const localTime = m.datetimeUtc ? formatLocalTime(m.datetimeUtc) : null;
  const scoreDisplay = m.homeScore !== null && m.awayScore !== null
    ? `<span class="ms-score">${m.homeScore} &ndash; ${m.awayScore}</span>`
    : `<span class="ms-time">${localTime || m.date || 'TBD'}</span>`;

  return `
    <div class="match-card ${isLive ? 'match-live' : ''}">
      <div class="match-header">
        <span class="match-competition">${m.competition}</span>
        <span class="match-round">${m.round || m.stage || ''}</span>
        ${isLive ? '<span class="match-live-badge">LIVE</span>' : ''}
      </div>
      <div class="match-teams">
        <div class="team home">
          ${m.homeBadge ? `<img src="${m.homeBadge}" alt="" class="team-badge" loading="lazy">` : ''}
          <span class="team-name">${m.homeTeam}</span>
        </div>
        <div class="match-center">
          ${scoreDisplay}
          ${m.group ? `<span class="match-group">Group ${m.group}</span>` : ''}
        </div>
        <div class="team away">
          ${m.awayBadge ? `<img src="${m.awayBadge}" alt="" class="team-badge" loading="lazy">` : ''}
          <span class="team-name">${m.awayTeam}</span>
        </div>
      </div>
      <div class="match-footer">
        <span>${m.date || ''} ${localTime ? '• ' + localTime : ''}</span>
        <span>${m.venue || ''}</span>
      </div>
    </div>
  `;
}

function formatLocalTime(datetimeUtc) {
  if (!datetimeUtc) return null;
  try {
    const d = new Date(datetimeUtc);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return null;
  }
}

/* ── Standings Rendering ── */
function renderStandings() {
  const container = document.getElementById('standings-container');
  if (!STATE.standings.length) {
    container.innerHTML = '<p class="no-data">No standings available.</p>';
    return;
  }

  const groups = groupBy(STATE.standings, 'group');
  container.innerHTML = Object.entries(groups).map(([group, rows]) => `
    <div class="standings-group">
      <h3 class="standings-group-title">${group || 'Table'}</h3>
      <table class="standings-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>P</th>
            <th>W</th>
            <th>D</th>
            <th>L</th>
            <th>GF</th>
            <th>GA</th>
            <th>GD</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr class="${row.rank <= 4 ? 'qualifying' : ''}">
              <td class="pos">${row.rank}</td>
              <td class="team-cell">
                ${row.teamBadge ? `<img src="${row.teamBadge}" alt="" class="team-badge" loading="lazy">` : ''}
                <span>${row.team}</span>
                ${row.form ? `<span class="form-strip">${renderForm(row.form)}</span>` : ''}
              </td>
              <td>${row.played}</td>
              <td>${row.won}</td>
              <td>${row.drawn}</td>
              <td>${row.lost}</td>
              <td>${row.goalsFor}</td>
              <td>${row.goalsAgainst}</td>
              <td>${row.goalDifference}</td>
              <td class="pts"><strong>${row.points}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `).join('');
}

function renderForm(form) {
  return (form || '').split(',').slice(0, 5).map(r => {
    const ch = r.trim().toUpperCase();
    if (ch === 'W') return '<span class="form-w">W</span>';
    if (ch === 'D') return '<span class="form-d">D</span>';
    if (ch === 'L') return '<span class="form-l">L</span>';
    return '';
  }).join('');
}

/* ── Teams Rendering ── */
function renderTeams() {
  const container = document.getElementById('teams-container');
  if (!STATE.teams.length) {
    container.innerHTML = '<p class="no-data">No teams available.</p>';
    return;
  }

  container.innerHTML = STATE.teams.map(t => `
    <div class="team-card">
      ${t.badge ? `<img src="${t.badge}" alt="" class="team-badge large" loading="lazy">` : '<div class="team-badge-placeholder">?</div>'}
      <div class="team-card-info">
        <strong>${t.name}</strong>
        <span>${t.country || ''}</span>
        <span>${t.venue || ''}</span>
      </div>
    </div>
  `).join('');
}

/* ── Helpers ── */
function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] || '__ungrouped';
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

function updateLiveCount() {
  const live = STATE.matches.filter(m => m.status === 'live').length;
  const el = document.getElementById('live-count');
  if (live > 0) {
    el.textContent = `${live} live now`;
    el.classList.add('live-pulse');
  } else {
    el.textContent = 'No live matches';
    el.classList.remove('live-pulse');
  }
}

/* ── Event Binding ── */
function bindEvents() {
  document.getElementById('comp-list').addEventListener('click', e => {
    const item = e.target.closest('.comp-item');
    if (item) selectCompetition(item.dataset.code);
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      STATE.currentFilter = btn.dataset.filter;

      closeSearch();
      const code = STATE.selectedCode;
      if (code) {
        loadAllData(code);
      }
    });
  });
}

/* ── Inline Data ── */
function tryUseInlineData() {
  const el = document.getElementById('inline-data');
  if (!el) return false;
  try {
    const data = JSON.parse(el.textContent || el.innerText || '{}');
    if (data.competitions && data.competitions.length) {
      STATE.competitions = data.competitions;
      renderCompetitionBar(STATE.competitions);
      if (data.matches) STATE.matches = data.matches;
      if (data.standings) STATE.standings = data.standings;
      if (data.teams) STATE.teams = data.teams;
      if (data.selectedCode) STATE.selectedCode = data.selectedCode;
      return true;
    }
  } catch {}
  return false;
}

/* ── Search ── */
function performSearch(query) {
  const section = document.getElementById('search-section');
  const container = document.getElementById('search-results');
  const info = document.getElementById('search-info');
  const q = query.trim().toLowerCase();

  if (!q) {
    section.style.display = 'none';
    return;
  }

  const code = STATE.selectedCode;
  const results = [];

  // Search matches
  for (const m of STATE.matches) {
    if ((m.homeTeam && m.homeTeam.toLowerCase().includes(q)) ||
        (m.awayTeam && m.awayTeam.toLowerCase().includes(q)) ||
        (m.competition && m.competition.toLowerCase().includes(q)) ||
        (m.stage || '').toLowerCase().includes(q)) {
      results.push({ type: 'match', data: m });
      if (results.length >= 20) break;
    }
  }

  // Search teams (if not enough results)
  if (results.length < 20) {
    for (const t of STATE.teams) {
      if ((t.name && t.name.toLowerCase().includes(q)) ||
          (t.country || '').toLowerCase().includes(q)) {
        results.push({ type: 'team', data: t });
        if (results.length >= 20) break;
      }
    }
  }

  // Search standings
  if (results.length < 20) {
    for (const s of STATE.standings) {
      if ((s.team && s.team.toLowerCase().includes(q)) ||
          (s.group || '').toLowerCase().includes(q)) {
        results.push({ type: 'standing', data: s });
        if (results.length >= 20) break;
      }
    }
  }

  section.style.display = '';

  if (!results.length) {
    info.textContent = `No results for "${query.trim()}"`;
    container.innerHTML = '';
    return;
  }

  info.textContent = `Found ${results.length} result${results.length > 1 ? 's' : ''} for "${query.trim()}"`;
  container.innerHTML = results.map(r => {
    if (r.type === 'match') return renderMatchCard(r.data);
    if (r.type === 'team') {
      const t = r.data;
      return `<div class="team-card">
        ${t.badge ? `<img src="${t.badge}" alt="" class="team-badge large" loading="lazy">` : '<div class="team-badge-placeholder">?</div>'}
        <div class="team-card-info">
          <strong>${highlightText(t.name, q)}</strong>
          <span>${t.country || ''}</span>
          <span>${t.venue || ''}</span>
        </div>
      </div>`;
    }
    if (r.type === 'standing') {
      const s = r.data;
      return `<div class="match-card">
        <div class="match-teams">
          <div class="team home"><span class="team-name">${highlightText(s.team, q)}</span></div>
          <div class="match-center"><span class="ms-score">${s.points} pts</span></div>
        </div>
        <div class="match-footer"><span>${s.competition} ${s.group ? '• Group ' + s.group : ''}</span><span>#${s.rank}</span></div>
      </div>`;
    }
    return '';
  }).join('');
}

function highlightText(text, query) {
  if (!text || !query) return text || '';
  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return text;
  return text.slice(0, idx) + '<span class="search-highlight">' + text.slice(idx, idx + query.length) + '</span>' + text.slice(idx + query.length);
}

function closeSearch() {
  const input = document.getElementById('search-input');
  input.value = '';
  performSearch('');
}

function bindSearch() {
  const input = document.getElementById('search-input');
  const icon = document.querySelector('.search-icon');

  function doSearch() {
    performSearch(input.value);
  }

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doSearch, 200);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch();
    } else if (e.key === 'Escape') {
      input.value = '';
      performSearch('');
      input.blur();
    }
  });

  if (icon) {
    icon.addEventListener('click', doSearch);
    icon.style.cursor = 'pointer';
    icon.style.pointerEvents = 'auto';
  }
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  bindSearch();
  // ... rest of init
  bindEvents();
  if (!tryUseInlineData()) {
    loadCompetitions();
  } else {
    const code = STATE.selectedCode || (STATE.competitions[0] && STATE.competitions[0].code);
    if (code) {
      document.querySelectorAll('.comp-item').forEach(el => {
        const sel = el.dataset.code === code;
        el.classList.toggle('active', sel);
        el.setAttribute('aria-selected', sel);
      });
      const comp = STATE.competitions.find(c => c.code === code);
      if (comp) {
        document.getElementById('hero-title').textContent = comp.name;
        document.getElementById('hero-kicker').textContent = `${comp.area || 'International'} • ${comp.type || 'Competition'}`;
        if (comp.currentSeason) document.getElementById('comp-season').textContent = `${comp.currentSeason} Season`;
        if (comp.emblem) document.querySelector('.hero').style.setProperty('--hero-emblem', `url(${comp.emblem})`);
      }
      renderMatches(code, STATE.currentFilter);
      renderStandings();
      renderTeams();
      updateLiveCount();
      startAutoRefresh(code);
    }
  }
});
