// ── CONFIG ───────────────────────────────────────────────────────────────────
const BASE = 'https://ytapiv4.techobed4.workers.dev/api';

const TRENDING_QUERIES = [
  'trending music 2026',
  'top hits 2026',
  'popular songs today',
];

const MP4_QUALITIES = [
  { v: '360', l: '360p', tag: 'Low' },
  { v: '480', l: '480p', tag: 'SD' },
  { v: '720', l: '720p', tag: 'HD' },
  { v: '1080', l: '1080p', tag: 'Full HD' },
];

// ── STATE ────────────────────────────────────────────────────────────────────
let mode              = 'video';
let currentQuery      = '';
let videoNextToken    = null;
let playlistNextToken = null;
let currentNpbId      = null;
let selectedQualities = {};

// Modal state
let modalVideoId  = null;
let modalType     = null;   // 'mp3' | 'mp4'
let modalExpanded = false;

// ── HELPERS ──────────────────────────────────────────────────────────────────
function dec(html) {
  const t = document.createElement('textarea');
  t.innerHTML = html;
  return t.value;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function apiFetch(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('API error');
  return r.json();
}

function dlUrl(id, type, quality) {
  let url = `${BASE}/download?url=${id}&type=${type}`;
  if (quality && type === 'mp4') url += `&quality=${quality}`;
  return url;
}

// ── MODE TOGGLE ───────────────────────────────────────────────────────────────
function setMode(m) {
  mode = m;
  document.getElementById('toggle-video').className =
    'toggle-btn' + (m === 'video' ? ' active-green' : '');
  document.getElementById('toggle-playlist').className =
    'toggle-btn' + (m === 'playlist' ? ' active-purple' : '');
  if (currentQuery) doSearch(currentQuery, true);
}

// ── SEARCH ────────────────────────────────────────────────────────────────────
function handleSearch(e) {
  e.preventDefault();
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;
  doSearch(q, true);
}

async function doSearch(q, reset) {
  currentQuery = q;
  if (reset) { videoNextToken = null; playlistNextToken = null; }

  showTrending(false);
  showEmptyState(false);
  closePlaylist();

  const sec = document.getElementById('results-section');
  if (reset) {
    sec.innerHTML = `<div class="center-msg">
      <div class="spinner${mode === 'playlist' ? ' purple' : ''}"></div>
      <p>Searching…</p></div>`;
  }

  try {
    if (mode === 'video') await loadVideos(q, reset);
    else await loadPlaylists(q, reset);
  } catch (err) {
    sec.innerHTML = `<div class="center-msg" style="color:#e05252">Something went wrong. Please try again.</div>`;
  }
}

// ── VIDEO SEARCH ──────────────────────────────────────────────────────────────
async function loadVideos(q, reset) {
  const params = new URLSearchParams({ q, type: 'video', maxResults: '12' });
  if (videoNextToken) params.set('pageToken', videoNextToken);

  const data = await apiFetch(`${BASE}/search?${params}`);
  const items = (data.results ?? []).map(r => ({
    videoId: r.videoId, title: dec(r.title),
    thumbnail: r.thumbnail, channelTitle: r.channel ?? '', publishedAt: r.published ?? '',
  }));
  videoNextToken = data.nextPageToken ?? null;

  const sec = document.getElementById('results-section');
  if (reset) sec.innerHTML = '';

  if (reset && items.length === 0) {
    sec.innerHTML = `<p class="center-msg">No results found for "${esc(q)}"</p>`;
    return;
  }

  let grid = sec.querySelector('.grid');
  if (!grid) {
    sec.insertAdjacentHTML('beforeend', `
      <div class="section-head">
        <div class="section-icon">🎵</div><h3>Results</h3>
      </div><div class="grid"></div>`);
    grid = sec.querySelector('.grid');
  }

  items.forEach(v => grid.insertAdjacentHTML('beforeend', videoCardHTML(v)));

  const old = sec.querySelector('.load-more-wrap');
  if (old) old.remove();
  if (videoNextToken) {
    sec.insertAdjacentHTML('beforeend', `
      <div class="load-more-wrap">
        <button class="load-more-btn" onclick="doSearch('${esc(q)}',false)">Load More</button>
      </div>`);
  }
}

// ── PLAYLIST SEARCH ───────────────────────────────────────────────────────────
async function loadPlaylists(q, reset) {
  const params = new URLSearchParams({ q, type: 'playlist', maxResults: '12' });
  if (playlistNextToken) params.set('pageToken', playlistNextToken);

  const data = await apiFetch(`${BASE}/search?${params}`);
  const items = (data.results ?? []).map(r => ({
    playlistId: r.videoId ?? '', title: dec(r.title),
    thumbnail: r.thumbnail, channelTitle: r.channel ?? '', itemCount: r.itemCount,
  }));
  playlistNextToken = data.nextPageToken ?? null;

  const sec = document.getElementById('results-section');
  if (reset) sec.innerHTML = '';

  if (reset && items.length === 0) {
    sec.innerHTML = `<p class="center-msg">No playlists found for "${esc(q)}"</p>`;
    return;
  }

  let grid = sec.querySelector('.grid');
  if (!grid) {
    sec.insertAdjacentHTML('beforeend', `
      <div class="section-head">
        <div class="section-icon purple">📋</div><h3>Playlists</h3>
      </div><div class="grid"></div>`);
    grid = sec.querySelector('.grid');
  }

  items.forEach(pl => grid.insertAdjacentHTML('beforeend', playlistCardHTML(pl)));

  const old = sec.querySelector('.load-more-wrap');
  if (old) old.remove();
  if (playlistNextToken) {
    sec.insertAdjacentHTML('beforeend', `
      <div class="load-more-wrap">
        <button class="load-more-btn purple" onclick="doSearch('${esc(q)}',false)">Load More</button>
      </div>`);
  }
}

// ── VIDEO CARD HTML ───────────────────────────────────────────────────────────
function videoCardHTML(v) {
  const id = v.videoId;
  return `
    <div class="card" id="card-${id}" data-video-id="${id}">
      <div class="thumb-wrap" onclick="openPlayer('${id}','mp4')">
        <img src="${esc(v.thumbnail)}" alt="${esc(v.title)}" loading="lazy" />
        <div class="thumb-overlay"><div class="play-circle">▶</div></div>
        <div class="now-badge" id="badge-${id}" style="display:none">♫ NOW PLAYING</div>
      </div>
      <div class="card-body">
        <div class="card-title">${esc(v.title)}</div>
        <div class="card-channel">${esc(v.channelTitle)}</div>
        <div class="action-row">
          <button class="btn btn-stream-mp3" id="smp3-${id}" onclick="openPlayer('${id}','mp3')">🎵 Stream MP3</button>
          <button class="btn btn-stream-mp4" id="smp4-${id}" onclick="openPlayer('${id}','mp4')">🎬 Stream MP4</button>
        </div>
        <div class="action-row">
          <button class="btn btn-dl-mp3" onclick="window.open(dlUrl('${id}','mp3'),'_blank')">⬇ MP3</button>
          <div class="quality-wrap">
            <button class="btn btn-dl-mp4" style="width:100%" onclick="toggleQuality('${id}',event)">
              ⬇ MP4 <span id="qlabel-${id}">720p</span> ▾
            </button>
            <div class="quality-menu" id="qmenu-${id}">
              ${MP4_QUALITIES.map(q => `
                <div class="quality-item" onclick="selectQuality('${id}','${q.v}',event)">
                  <span>${q.l}</span><span class="quality-tag">${q.tag}</span>
                </div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

// ── PLAYLIST CARD HTML ────────────────────────────────────────────────────────
function playlistCardHTML(pl) {
  return `
    <div class="card playlist-card" onclick="openPlaylist('${pl.playlistId}','${esc(pl.title)}')">
      <div class="thumb-wrap">
        <img src="${esc(pl.thumbnail)}" alt="${esc(pl.title)}" loading="lazy" />
        <div class="thumb-overlay"><div class="play-circle purple">📋</div></div>
        ${pl.itemCount ? `<div class="count-badge">📋 ${pl.itemCount} videos</div>` : ''}
      </div>
      <div class="card-body">
        <div class="card-title">${esc(pl.title)}</div>
        <div class="card-channel">${esc(pl.channelTitle)}</div>
      </div>
    </div>`;
}

// ── PLAYER MODAL ─────────────────────────────────────────────────────────────
function openPlayer(id, type) {
  // Toggle off if already showing same video + type
  const modal = document.getElementById('player-modal');
  if (modalVideoId === id && modalType === type && modal.classList.contains('open')) {
    closePlayerModal();
    return;
  }

  modalVideoId  = id;
  modalType     = type;
  modalExpanded = false;

  const card    = document.getElementById(`card-${id}`);
  const title   = card?.querySelector('.card-title')?.textContent   || '';
  const channel = card?.querySelector('.card-channel')?.textContent || '';
  const thumb   = card?.querySelector('img')?.src                   || '';

  const isAudio = type === 'mp3';

  // Fill in details
  document.getElementById('pm-title').textContent   = title;
  document.getElementById('pm-channel').textContent = channel;
  document.getElementById('pm-thumb').src           = thumb;

  const badge = document.getElementById('pm-type-badge');
  badge.textContent = isAudio ? '🎵 MP3 Audio' : '🎬 MP4 Video';
  badge.className   = 'pm-type-badge ' + (isAudio ? 'green' : 'purple');

  // Reset expand button
  const expBtn = document.getElementById('pm-expand-btn');
  expBtn.textContent = '⊞';
  expBtn.title = 'Expand';

  const thumbWrap = document.getElementById('pm-thumb-wrap');
  const videoWrap = document.getElementById('pm-video-wrap');
  const iframe    = document.getElementById('pm-iframe');

  // Move the single iframe into the right container
  if (isAudio) {
    thumbWrap.style.display = 'flex';
    videoWrap.style.display = 'none';
    iframe.style.height = '100px';
    thumbWrap.appendChild(iframe);
  } else {
    thumbWrap.style.display = 'none';
    videoWrap.style.display = 'flex';
    iframe.style.height = '100%';
    videoWrap.appendChild(iframe);
  }

  // Set src after DOM placement so autoplay fires correctly
  iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;

  modal.classList.add('open');
  modal.classList.remove('expanded');
  document.body.style.overflow = 'hidden';

  updateAllCardStates(id, type);
  currentNpbId = id;
  showNpb(id, thumb, title, channel);
}

function closePlayerModal() {
  const modal = document.getElementById('player-modal');
  modal.classList.remove('open', 'expanded');
  document.getElementById('pm-iframe').src = '';
  document.getElementById('pm-menu').classList.remove('open');
  document.getElementById('pm-submenu').classList.remove('open');
  document.body.style.overflow = '';
  modalExpanded = false;

  if (modalVideoId) updateAllCardStates(modalVideoId, null);
  modalVideoId = null;
  modalType    = null;
  stopPlayer();
}

function toggleExpand() {
  modalExpanded = !modalExpanded;
  const modal  = document.getElementById('player-modal');
  const expBtn = document.getElementById('pm-expand-btn');
  modal.classList.toggle('expanded', modalExpanded);
  expBtn.textContent = modalExpanded ? '⊡' : '⊞';
  expBtn.title       = modalExpanded ? 'Shrink' : 'Expand';
}

// ── 3-DOT MENU ────────────────────────────────────────────────────────────────
function toggleModalMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('pm-menu');
  menu.classList.toggle('open');
  // Close submenu if main menu closing
  if (!menu.classList.contains('open')) {
    document.getElementById('pm-submenu').classList.remove('open');
  }
}

function toggleModalQualitySubmenu(e) {
  e.stopPropagation();
  document.getElementById('pm-submenu').classList.toggle('open');
}

function modalDlMp3(e) {
  if (e) e.stopPropagation();
  if (!modalVideoId) return;
  window.open(dlUrl(modalVideoId, 'mp3'), '_blank');
  document.getElementById('pm-menu').classList.remove('open');
}

function modalDlMp4(q, e) {
  if (e) e.stopPropagation();
  if (!modalVideoId) return;
  const quality = q || selectedQualities[modalVideoId] || '720';
  window.open(dlUrl(modalVideoId, 'mp4', quality), '_blank');
  document.getElementById('pm-menu').classList.remove('open');
  document.getElementById('pm-submenu').classList.remove('open');
}

// ── CARD STATE ────────────────────────────────────────────────────────────────
function updateAllCardStates(activeId, type) {
  document.querySelectorAll('.card[data-video-id]').forEach(card => {
    const id      = card.dataset.videoId;
    const isActive = id === activeId && !!type;
    card.classList.toggle('playing', isActive);

    const badge = document.getElementById(`badge-${id}`);
    const s3    = document.getElementById(`smp3-${id}`);
    const s4    = document.getElementById(`smp4-${id}`);

    if (badge) badge.style.display = isActive ? '' : 'none';
    if (s3) {
      s3.classList.toggle('active', isActive && type === 'mp3');
      s3.textContent = (isActive && type === 'mp3') ? '🎵 Playing' : '🎵 Stream MP3';
    }
    if (s4) {
      s4.classList.toggle('active', isActive && type === 'mp4');
      s4.textContent = (isActive && type === 'mp4') ? '🎬 Playing' : '🎬 Stream MP4';
    }
  });
}

// ── CARD DOWNLOAD QUALITY ─────────────────────────────────────────────────────
function toggleQuality(id, e) {
  e.stopPropagation();
  const menu = document.getElementById(`qmenu-${id}`);
  document.querySelectorAll('.quality-menu.open').forEach(m => {
    if (m !== menu) m.classList.remove('open');
  });
  menu.classList.toggle('open');
}

function selectQuality(id, q, e) {
  e.stopPropagation();
  selectedQualities[id] = q;
  const label = document.getElementById(`qlabel-${id}`);
  if (label) label.textContent = q + 'p';
  document.getElementById(`qmenu-${id}`)?.classList.remove('open');
  window.open(dlUrl(id, 'mp4', q), '_blank');
}

// Close menus on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.quality-menu.open').forEach(m => m.classList.remove('open'));
  const pmMenu = document.getElementById('pm-menu');
  const pmSub  = document.getElementById('pm-submenu');
  if (pmMenu && !pmMenu.matches(':hover')) {
    pmMenu.classList.remove('open');
    pmSub?.classList.remove('open');
  }
});

// ESC key → close modal
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closePlayerModal();
});

// ── NOW PLAYING BAR ───────────────────────────────────────────────────────────
function showNpb(id, thumb, title, channel) {
  document.getElementById('npb-thumb').src = thumb;
  document.getElementById('npb-title').textContent   = title;
  document.getElementById('npb-channel').textContent = channel;
  document.getElementById('npb-iframe').src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
  document.getElementById('now-playing-bar').classList.add('visible');
  document.body.classList.add('pb-bar');
}

function stopPlayer() {
  document.getElementById('npb-iframe').src = '';
  document.getElementById('now-playing-bar').classList.remove('visible');
  document.body.classList.remove('pb-bar');
  currentNpbId = null;
}

// Click NPB info area → reopen modal
document.getElementById('npb-reopen').addEventListener('click', () => {
  if (currentNpbId && modalType) openPlayer(currentNpbId, modalType);
});

// ── PLAYLIST VIEWER ───────────────────────────────────────────────────────────
async function openPlaylist(id, title) {
  document.getElementById('playlist-viewer').classList.add('visible');
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('trending-section').style.display = 'none';
  document.getElementById('playlist-title').textContent = title;
  document.getElementById('playlist-count').textContent = '';

  const grid = document.getElementById('playlist-grid');
  grid.innerHTML = `<div class="center-msg" style="grid-column:1/-1">
    <div class="spinner purple"></div><p>Loading playlist…</p></div>`;

  try {
    const params = new URLSearchParams({ id, maxResults: '50' });
    const data = await apiFetch(`${BASE}/playlist?${params}`);
    const items = (data.videos ?? []).map(r => ({
      videoId: r.videoId, title: dec(r.title),
      thumbnail: r.thumbnail, channelTitle: r.channel ?? '', publishedAt: '',
    }));
    document.getElementById('playlist-count').textContent = `(${items.length} tracks)`;
    grid.innerHTML = items.map(v => videoCardHTML(v)).join('');
  } catch (e) {
    grid.innerHTML = `<div class="center-msg" style="grid-column:1/-1;color:#e05252">Failed to load playlist.</div>`;
  }
}

function closePlaylist() {
  document.getElementById('playlist-viewer').classList.remove('visible');
  document.getElementById('results-section').style.display = '';
  if (!currentQuery) document.getElementById('trending-section').style.display = '';
}

// ── TRENDING ──────────────────────────────────────────────────────────────────
function showTrending(show) {
  document.getElementById('trending-section').style.display = show ? '' : 'none';
}
function showEmptyState(show) {
  document.getElementById('empty-state').style.display = show ? '' : 'none';
}

async function loadTrending() {
  const q = TRENDING_QUERIES[Math.floor(Math.random() * TRENDING_QUERIES.length)];
  try {
    const params = new URLSearchParams({ q, type: 'video', maxResults: '8' });
    const data = await apiFetch(`${BASE}/search?${params}`);
    const items = (data.results ?? []).map(r => ({
      videoId: r.videoId, title: dec(r.title),
      thumbnail: r.thumbnail, channelTitle: r.channel ?? '', publishedAt: '',
    }));
    document.getElementById('trending-loading').style.display = 'none';
    const grid = document.getElementById('trending-grid');
    if (items.length) {
      grid.style.display = '';
      grid.innerHTML = items.map(v => videoCardHTML(v)).join('');
    }
  } catch (e) {
    document.getElementById('trending-loading').innerHTML =
      '<p style="color:var(--muted)">Could not load trending music.</p>';
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────────
loadTrending();
