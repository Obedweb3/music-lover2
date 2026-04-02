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

// FIX: Safe escaping for strings embedded inside inline JS onclick attributes.
// esc() converts ' to &#39; which breaks 'string' delimiters in HTML event attrs.
function escAttr(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '');
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
      <p>Searching...</p></div>`;
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
        <button class="load-more-btn" onclick="doSearch('${escAttr(q)}',false)">Load More</button>
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
        <button class="load-more-btn purple" onclick="doSearch('${escAttr(q)}',false)">Load More</button>
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
        <div class="thumb-overlay"><div class="play-circle">&#9658;</div></div>
        <div class="now-badge" id="badge-${id}" style="display:none">&#9835; NOW PLAYING</div>
      </div>
      <div class="card-body">
        <div class="card-title">${esc(v.title)}</div>
        <div class="card-channel">${esc(v.channelTitle)}</div>
        <div class="action-row">
          <button class="btn btn-stream-mp3" id="smp3-${id}" onclick="openPlayer('${id}','mp3')">🎵 Stream MP3</button>
          <button class="btn btn-stream-mp4" id="smp4-${id}" onclick="openPlayer('${id}','mp4')">🎬 Stream MP4</button>
        </div>
        <div class="action-row">
          <button class="btn btn-dl-mp3" onclick="window.open(dlUrl('${id}','mp3'),'_blank')">&#11015; MP3</button>
          <div class="quality-wrap">
            <button class="btn btn-dl-mp4" style="width:100%" onclick="toggleQuality('${id}',event)">
              &#11015; MP4 <span id="qlabel-${id}">720p</span> &#9660;
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
  // FIX: use escAttr() for JS onclick string args; esc() converts ' to &#39;
  // which breaks JS string delimiters when playlist titles contain apostrophes.
  return `
    <div class="card playlist-card" onclick="openPlaylist('${escAttr(pl.playlistId)}','${escAttr(pl.title)}')">
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

  document.getElementById('pm-title').textContent   = title;
  document.getElementById('pm-channel').textContent = channel;
  document.getElementById('pm-thumb').src           = thumb;

  const badge = document.getElementById('pm-type-badge');
  badge.textContent = isAudio ? '🎵 MP3 Audio' : '🎬 MP4 Video';
  badge.className   = 'pm-type-badge ' + (isAudio ? 'green' : 'purple');

  const expBtn = document.getElementById('pm-expand-btn');
  expBtn.textContent = '⊞';
  expBtn.title = 'Expand';

  const thumbWrap = document.getElementById('pm-thumb-wrap');
  const videoWrap = document.getElementById('pm-video-wrap');
  const iframe    = document.getElementById('pm-iframe');

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

  iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;

  modal.classList.add('open');
  modal.classList.remove('expanded');

  // FIX: Compensate for scrollbar disappearing so page doesn't shift
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.paddingRight = scrollbarWidth + 'px';
  document.body.style.overflow = 'hidden';

  updateAllCardStates(id, type);
  currentNpbId = id;

  // FIX: Silence NPB iframe while modal is playing to prevent audio doubling
  document.getElementById('npb-iframe').src = '';
  document.getElementById('npb-thumb').src           = thumb;
  document.getElementById('npb-title').textContent   = title;
  document.getElementById('npb-channel').textContent = channel;
  showNpbBar();
}

function closePlayerModal() {
  const modal = document.getElementById('player-modal');
  modal.classList.remove('open', 'expanded');
  document.getElementById('pm-iframe').src = '';
  document.getElementById('pm-menu').classList.remove('open');
  document.getElementById('pm-submenu').classList.remove('open');

  // FIX: Restore overflow + padding compensation together
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';

  modalExpanded = false;

  // FIX: Reset card states before nulling modalVideoId
  if (modalVideoId) updateAllCardStates(modalVideoId, null);

  // FIX: Hand playback back to the NPB iframe so music continues after modal closes
  if (currentNpbId) {
    document.getElementById('npb-iframe').src =
      `https://www.youtube.com/embed/${currentNpbId}?autoplay=1&rel=0`;
  }
  // Note: modalVideoId/modalType are intentionally kept so NPB reopen still works.
}

function toggleExpand() {
  modalExpanded = !modalExpanded;
  const modal  = document.getElementById('player-modal');
  const expBtn = document.getElementById('pm-expand-btn');
  modal.classList.toggle('expanded', modalExpanded);
  expBtn.textContent = modalExpanded ? '⊡' : '⊞';
  expBtn.title       = modalExpanded ? 'Shrink' : 'Expand';
}

// FIX: Clicking the dark backdrop (outside pm-box) closes the modal
document.getElementById('player-modal').addEventListener('click', function(e) {
  if (e.target === this) closePlayerModal();
});

// ── 3-DOT MENU ────────────────────────────────────────────────────────────────
function toggleModalMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('pm-menu');
  menu.classList.toggle('open');
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
    const id       = card.dataset.videoId;
    const isActive = id === activeId && !!type;
    card.classList.toggle('playing', isActive);

    const badge = document.getElementById(`badge-${id}`);
    const s3    = document.getElementById(`smp3-${id}`);
    const s4    = document.getElementById(`smp4-${id}`);

    // FIX: Use explicit 'flex'/'none' instead of ''/'none' to guarantee correct state
    if (badge) badge.style.display = isActive ? 'flex' : 'none';
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
  // FIX: Removed auto-download on quality select. Now only updates the label;
  // user must click the MP4 button again to confirm and trigger the download.
}

// Close menus on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.quality-menu.open').forEach(m => m.classList.remove('open'));

  // FIX: Replace unreliable :hover check with a simple classList check
  const pmMenu = document.getElementById('pm-menu');
  const pmSub  = document.getElementById('pm-submenu');
  if (pmMenu?.classList.contains('open')) {
    pmMenu.classList.remove('open');
    pmSub?.classList.remove('open');
  }
});

// ESC key → close modal
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closePlayerModal();
});

// ── NOW PLAYING BAR ───────────────────────────────────────────────────────────
function showNpbBar() {
  document.getElementById('now-playing-bar').classList.add('visible');
  document.body.classList.add('pb-bar');
}

function stopPlayer() {
  document.getElementById('npb-iframe').src = '';
  document.getElementById('pm-iframe').src  = '';

  const modal = document.getElementById('player-modal');
  if (modal.classList.contains('open')) {
    modal.classList.remove('open', 'expanded');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }

  document.getElementById('now-playing-bar').classList.remove('visible');
  document.body.classList.remove('pb-bar');

  // FIX: Clear all playback state so nothing lingers after stop
  if (currentNpbId) updateAllCardStates(currentNpbId, null);
  currentNpbId = null;
  modalVideoId = null;
  modalType    = null;
}

// Click NPB info area → reopen modal
document.getElementById('npb-reopen').addEventListener('click', () => {
  // FIX: Fallback chain ensures reopen works whether modal was closed or never opened
  const id   = modalVideoId ?? currentNpbId;
  const type = modalType    ?? 'mp4';
  if (id) openPlayer(id, type);
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
    <div class="spinner purple"></div><p>Loading playlist...</p></div>`;

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
