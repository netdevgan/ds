(function () {
  'use strict';

  // ── State ──
  const state = {
    allMatches: [],
    standings: null,
    teams: [],
    filter: 'all',
    group: '',
    refreshInterval: null,
  };

  // ── DOM ──
  const $ = (s, ctx = document) => ctx.querySelector(s);
  const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];

  const els = {
    matches: $('#matches-container'),
    results: $('#results-container'),
    standings: $('#standings-container'),
    teams: $('#teams-container'),
    filterBtns: $$('.filter-btn'),
    groupSelect: $('#group-select'),
    liveCount: $('#live-count'),
  };

  // ── Helpers ──
  function isoToDisplay(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const opts = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
    return d.toLocaleDateString('en-US', opts);
  }

  function countdown(dateIso) {
    const diff = new Date(dateIso) - Date.now();
    if (diff <= 0) return '';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h > 24) {
      const d = Math.floor(h / 24);
      return `${d}d left`;
    }
    return `${h}h ${m}m left`;
  }

  function getStatusClass(status) {
    return status === 'live' ? 'live' : status === 'upcoming' ? 'upcoming' : 'finished';
  }

  function badgeImg(src, alt, cls = 'team-badge') {
    if (!src) {
      return `<span class="${cls}" aria-hidden="true" style="display:grid;place-items:center;font-size:1.25rem">🏳️</span>`;
    }
    return `<img class="${cls}" src="${src}" alt="${alt}" loading="lazy" onerror="this.outerHTML='<span class=\\'${cls}\\' aria-hidden=\\'true\\' style=\\'display:grid;place-items:center;font-size:1.25rem\\'>🏳️</span>'">`;
  }

  function groupByGroup(items) {
    const map = {};
    items.forEach(item => {
      const g = item.group || 'Other';
      if (!map[g]) map[g] = [];
      map[g].push(item);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }

  // ── Renderers ──
  function renderMatchCard(m) {
    const statusClass = getStatusClass(m.status);
    const isLive = m.status === 'live';
    const isUpcoming = m.status === 'upcoming';

    return `<article class="match-card ${statusClass}">
      <div class="match-meta">
        <span>${m.group ? `Group ${m.group}` : m.round || ''}</span>
        <span class="match-status ${statusClass}">
          ${isLive ? '<span class="match-status-dot"></span>LIVE' : ''}
          ${isUpcoming ? '<span class="match-status-dot"></span>Upcoming' : ''}
          ${m.status === 'finished' ? '<span class="match-status-dot"></span>Finished' : ''}
        </span>
      </div>
      <div class="match-teams">
        <div class="team">
          ${badgeImg(m.homeBadge, m.homeTeam)}
          <span class="team-name">${m.homeTeam}</span>
        </div>
        <div class="match-center">
          ${m.homeScore !== null && m.awayScore !== null
            ? `<span class="match-score">${m.homeScore}–${m.awayScore}</span>`
            : `<span class="match-time">${isoToDisplay(m.datetimeUtc)}</span>`
          }
          ${isUpcoming ? `<span class="match-countdown" data-countdown="${m.datetimeUtc}">${countdown(m.datetimeUtc)}</span>` : ''}
        </div>
        <div class="team">
          ${badgeImg(m.awayBadge, m.awayTeam)}
          <span class="team-name">${m.awayTeam}</span>
        </div>
      </div>
      ${m.venue ? `<div class="match-venue">${m.venue}${m.city ? ', ' + m.city : ''}</div>` : ''}
    </article>`;
  }

  function renderMatches(container, matches, emptyMsg) {
    if (!matches || matches.length === 0) {
      container.innerHTML = `<p class="empty-state">${emptyMsg || 'No matches found'}</p>`;
      return;
    }
    container.innerHTML = matches.map(renderMatchCard).join('');
  }

  function renderStandings(standings) {
    const grouped = groupByGroup(standings);
    if (grouped.length === 0) {
      els.standings.innerHTML = '<p class="empty-state">Standings not available yet</p>';
      return;
    }
    els.standings.innerHTML = grouped.map(([group, rows]) => `
      <div class="group-table">
        <h3 class="group-title">Group ${group}</h3>
        <div class="table-wrap">
          <table class="table-standings">
            <thead>
              <tr>
                <th>Team</th>
                <th title="Played">P</th>
                <th title="Won">W</th>
                <th title="Drawn">D</th>
                <th title="Lost">L</th>
                <th title="Goals">GF:GA</th>
                <th title="Goal Difference">GD</th>
                <th title="Points">Pts</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `<tr>
                <td>
                  <div class="standing-team">
                    ${badgeImg(r.teamBadge, r.team, 'standing-badge')}
                    <span class="standing-name">${r.team}</span>
                  </div>
                </td>
                <td>${r.played}</td>
                <td>${r.won}</td>
                <td>${r.drawn}</td>
                <td>${r.lost}</td>
                <td>${r.goalsFor}:${r.goalsAgainst}</td>
                <td>${r.goalDifference > 0 ? '+' : ''}${r.goalDifference}</td>
                <td class="points">${r.points}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `).join('');
  }

  function renderTeams(teams) {
    if (!teams || teams.length === 0) {
      els.teams.innerHTML = '<p class="empty-state">Team data not available</p>';
      return;
    }
    els.teams.innerHTML = teams.map(t => `
      <article class="team-card">
        ${badgeImg(t.badge, t.name)}
        <span>${t.name}</span>
      </article>
    `).join('');
  }

  // ── Data fetching ──
  async function fetchJSON(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (!json.success) throw new Error(json.error || 'API error');
    return json;
  }

  async function loadMatches() {
    try {
      const params = new URLSearchParams({ filter: state.filter });
      if (state.group) params.set('group', state.group);
      const url = `/api/matches?${params}`;
      const json = await fetchJSON(url);
      state.allMatches = json.data || [];

      renderMatches(els.matches, state.allMatches, 'No matches found');

      const finished = state.allMatches.filter(m => m.status === 'finished').slice(0, 12);
      renderMatches(els.results, finished, 'No finished matches yet');

      const live = state.allMatches.filter(m => m.status === 'live');
      if (live.length > 0) {
        els.liveCount.textContent = `${live.length} match${live.length > 1 ? 'es' : ''} live`;
        els.liveCount.classList.add('pill-live');
      } else {
        els.liveCount.textContent = 'No live matches';
        els.liveCount.classList.remove('pill-live');
      }

      startCountdownTimer();
    } catch (err) {
      els.matches.innerHTML = `<p class="error-message">Failed to load schedule: ${err.message}</p>`;
      els.results.innerHTML = '';
    }
  }

  async function loadStandings() {
    try {
      const json = await fetchJSON('/api/standings');
      state.standings = json.data || [];
      renderStandings(state.standings);
    } catch (err) {
      els.standings.innerHTML = `<p class="error-message">Failed to load standings: ${err.message}</p>`;
    }
  }

  async function loadTeams() {
    try {
      const json = await fetchJSON('/api/teams');
      state.teams = json.data || [];
      renderTeams(state.teams);
    } catch (err) {
      els.teams.innerHTML = `<p class="error-message">Failed to load teams: ${err.message}</p>`;
    }
  }

  // ── Countdown timer ──
  let countdownInterval = null;

  function startCountdownTimer() {
    if (countdownInterval) clearInterval(countdownInterval);
    const updaters = () => {
      $$('[data-countdown]').forEach(el => {
        const iso = el.getAttribute('data-countdown');
        if (iso) el.textContent = countdown(iso);
      });
    };
    updaters();
    countdownInterval = setInterval(updaters, 30000);
  }

  // ── Filter / Group actions ──
  function setFilter(filter) {
    state.filter = filter;
    els.filterBtns.forEach(b => {
      const match = b.getAttribute('data-filter') === filter;
      b.classList.toggle('active', match);
      b.setAttribute('aria-selected', match);
    });
    loadMatches();
  }

  function setGroup(group) {
    state.group = group;
    loadMatches();
  }

  // ── Bind events ──
  function initEvents() {
    els.filterBtns.forEach(b => {
      b.addEventListener('click', () => {
        const f = b.getAttribute('data-filter');
        setFilter(f);
      });
    });

    els.groupSelect.addEventListener('change', e => {
      setGroup(e.target.value);
    });
  }

  // ── Auto-refresh every 5 minutes ──
  function startAutoRefresh() {
    if (state.refreshInterval) clearInterval(state.refreshInterval);
    state.refreshInterval = setInterval(() => {
      loadMatches();
      loadStandings();
    }, 300000);
  }

  // ── Init ──
  async function init() {
    initEvents();
    await Promise.all([loadMatches(), loadStandings(), loadTeams()]);
    startAutoRefresh();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
