// ── CONFIG ───────────────────────────────────────────────────────────────────
const BASE = 'https://ytapiv4.techobed4.workers.dev/api';

const TRENDING_QUERIES = [
  'trending music 2026',
  'top hits 2026',
  'popular songs today',
];

const MP4_QUALITIES = [
  { v: '360', l: '360p (Low)' },
  { v: '480', l: '480p (SD)' },
  { v: '720', l: '720p (HD)' },
  { v: '1080', l: '1080p (HD)' },
];

// ── STATE ────────────────────────────────────────────────────────────────────
let mode = 'video';           // 'video' | 'playlist'
let currentQuery = '';
let videoNextToken = null;
let playlistNextToken = null;
let currentNpbId = null;
let activeStreams = {};        // videoId → 'mp3' | 'mp4' | null
let selectedQualities = {};   // videoId → quality string

// ── HELPERS ──────────────────────────────────────────────────────────────────
function dec(html) {
  const t = document.createElement('textarea');
  t.innerHTML = html;
  return t.value;
}

function esc(str) {
  return str.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

async function apiFetch(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('API error');
  return r.json();
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
  if (reset) {
    videoNextToken = null;
    playlistNextToken = null;
  }

  showTrending(false);
  showEmptyState(false);
  closePlaylist();

  const sec = document.getElementById('results-section');
  if (reset) {
    sec.innerHTML = `
      <div class="center-msg">
        <div class="spinner${mode === 'playlist' ? ' purple' : ''}"></div>
        <p>Searching…</p>
      </div>`;
  }

  try {
    if (mode === 'video') {
      await loadVideos(q, reset);
    } else {
      await loadPlaylists(q, reset);
    }
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
    videoId: r.videoId,
    title: dec(r.title),
    thumbnail: r.thumbnail,
    channelTitle: r.channel ?? '',
    publishedAt: r.published ?? '',
  }));
  videoNextToken = data.nextPageToken ?? null;

  const sec = document.getElementById('results-section');
  if (reset) sec.innerHTML = '';

  if (reset && items.length === 0) {
    sec.innerHTML = `<p class="center-msg">No results found for "${q}"</p>`;
    return;
  }

  let grid = sec.querySelector('.grid');
  if (!grid) {
    sec.insertAdjacentHTML('beforeend', `
      <div class="section-head">
        <div class="section-icon">🎵</div>
        <h3>Results</h3>
      </div>
      <div class="grid"></div>`);
    grid = sec.querySelector('.grid');
  }

  items.forEach(v => grid.insertAdjacentHTML('beforeend', videoCardHTML(v)));

  const old = sec.querySelector('.load-more-wrap');
  if (old) old.remove();
  if (videoNextToken) {
    sec.insertAdjacentHTML('beforeend', `
      <div class="load-more-wrap">
        <button class="load-more-btn" onclick="doSearch('${esc(q)}', false)">Load More</button>
      </div>`);
  }
}

// ── PLAYLIST SEARCH ───────────────────────────────────────────────────────────
async function loadPlaylists(q, reset) {
  const params = new URLSearchParams({ q, type: 'playlist', maxResults: '12' });
  if (playlistNextToken) params.set('pageToken', playlistNextToken);

  const data = await apiFetch(`${BASE}/search?${params}`);
  const items = (data.results ?? []).map(r => ({
    playlistId: r.videoId ?? '',
    title: dec(r.title),
    thumbnail: r.thumbnail,
    channelTitle: r.channel ?? '',
    itemCount: r.itemCount,
  }));
  playlistNextToken = data.nextPageToken ?? null;

  const sec = document.getElementById('results-section');
  if (reset) sec.innerHTML = '';

  if (reset && items.length === 0) {
    sec.innerHTML = `<p class="center-msg">No playlists found for "${q}"</p>`;
    return;
  }

  let grid = sec.querySelector('.grid');
  if (!grid) {
    sec.insertAdjacentHTML('beforeend', `
      <div class="section-head">
        <div class="section-icon purple">📋</div>
        <h3>Playlists</h3>
      </div>
      <div class="grid"></div>`);
    grid = sec.querySelector('.grid');
  }

  items.forEach(pl => grid.insertAdjacentHTML('beforeend', playlistCardHTML(pl)));

  const old = sec.querySelector('.load-more-wrap');
  if (old) old.remove();
  if (playlistNextToken) {
    sec.insertAdjacentHTML('beforeend', `
      <div class="load-more-wrap">
        <button class="load-more-btn purple" onclick="doSearch('${esc(q)}', false)">Load More</button>
      </div>`);
  }
}

// ── VIDEO CARD HTML ───────────────────────────────────────────────────────────
function videoCardHTML(v) {
  const id = v.videoId;
  const qualityOptions = MP4_QUALITIES
    .map(q => `<div class="quality-item" onclick="selectQuality('${id}','${q.v}',event)">${q.l}</div>`)
    .join('');

  return `
    <div class="card" id="card-${id}" data-video-id="${id}">
      <div class="thumb-wrap" onclick="streamVideo('${id}','mp4')">
        <img src="${esc(v.thumbnail)}" alt="${esc(v.title)}" loading="lazy" />
        <div class="thumb-overlay"><div class="play-circle">▶</div></div>
        <div class="now-badge" id="badge-${id}" style="display:none">♫ NOW PLAYING</div>
      </div>
      <div class="card-body">
        <div class="card-title">${esc(v.title)}</div>
        <div class="card-channel">${esc(v.channelTitle)}</div>
        <div class="action-row">
          <button class="btn btn-stream-mp3" id="smp3-${id}" onclick="streamVideo('${id}','mp3')">🎵 Stream MP3</button>
          <button class="btn btn-stream-mp4" id="smp4-${id}" onclick="streamVideo('${id}','mp4')">🎬 Stream MP4</button>
        </div>
        <div class="action-row">
          <button class="btn btn-dl-mp3" onclick="dlVideo('${id}','mp3')">⬇ MP3</button>
          <div class="quality-wrap">
            <button class="btn btn-dl-mp4" style="width:100%" onclick="toggleQuality('${id}',event)">
              ⬇ MP4 <span id="qlabel-${id}">720p</span> ▾
            </button>
            <div class="quality-menu" id="qmenu-${id}">
              ${qualityOptions}
            </div>
          </div>
        </div>
        <div id="player-${id}"></div>
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

// ── STREAMING ─────────────────────────────────────────────────────────────────
function streamVideo(id, type) {
  const playerEl = document.getElementById(`player-${id}`);
  if (!playerEl) return;

  // Toggle off if same type is already playing
  if (activeStreams[id] === type) {
    playerEl.innerHTML = '';
    activeStreams[id] = null;
    updateCardState(id, null);
    if (currentNpbId === id) stopPlayer();
    return;
  }

  // Close any other open streams
  Object.keys(activeStreams).forEach(vid => {
    if (vid !== id && activeStreams[vid]) {
      const p = document.getElementById(`player-${vid}`);
      if (p) p.innerHTML = '';
      activeStreams[vid] = null;
      updateCardState(vid, null);
    }
  });

  activeStreams[id] = type;
  updateCardState(id, type);
  currentNpbId = id;

  const iframeHeight = type === 'mp4' ? '220px' : '84px';
  playerEl.innerHTML = `
    <div class="inline-player">
      <div class="inline-player-top">
        <span class="inline-player-label">Now ${type === 'mp3' ? 'playing' : 'streaming'}: <span></span></span>
        <button class="close-btn" onclick="closeStream('${id}')">✕</button>
      </div>
      <iframe
        src="https://www.youtube.com/embed/${id}?autoplay=1&rel=0"
        allow="autoplay; encrypted-media"
        allowfullscreen
        style="height:${iframeHeight}">
      </iframe>
    </div>`;

  const card = document.getElementById(`card-${id}`);
  const img = card?.querySelector('img')?.src || '';
  const title = card?.querySelector('.card-title')?.textContent || '';
  const channel = card?.querySelector('.card-channel')?.textContent || '';
  showNpb(id, img, title, channel);

  card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeStream(id) {
  const p = document.getElementById(`player-${id}`);
  if (p) p.innerHTML = '';
  activeStreams[id] = null;
  updateCardState(id, null);
  if (currentNpbId === id) stopPlayer();
}

function updateCardState(id, type) {
  const card  = document.getElementById(`card-${id}`);
  const badge = document.getElementById(`badge-${id}`);
  const s3    = document.getElementById(`smp3-${id}`);
  const s4    = document.getElementById(`smp4-${id}`);
  if (!card) return;

  card.classList.toggle('playing', !!type);
  if (badge) badge.style.display = type ? '' : 'none';
  if (s3) {
    s3.classList.toggle('active', type === 'mp3');
    s3.textContent = type === 'mp3' ? '🎵 Playing' : '🎵 Stream MP3';
  }
  if (s4) {
    s4.classList.toggle('active', type === 'mp4');
    s4.textContent = type === 'mp4' ? '🎬 Playing' : '🎬 Stream MP4';
  }
}

// ── DOWNLOAD ──────────────────────────────────────────────────────────────────
function dlVideo(id, type, quality) {
  let url = `${BASE}/download?url=${id}&type=${type}`;
  if (quality && type === 'mp4') url += `&quality=${quality}`;
  window.open(url, '_blank');
}

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
  dlVideo(id, 'mp4', q);
}

// Close quality menus on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.quality-menu.open').forEach(m => m.classList.remove('open'));
});

// ── NOW PLAYING BAR ───────────────────────────────────────────────────────────
function showNpb(id, thumb, title, channel) {
  document.getElementById('npb-thumb').src = thumb;
  document.getElementById('npb-title').textContent = title;
  document.getElementById('npb-channel').textContent = channel;
  document.getElementById('npb-iframe').src =
    `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
  document.getElementById('now-playing-bar').classList.add('visible');
  document.body.classList.add('pb-bar');
}

function stopPlayer() {
  document.getElementById('npb-iframe').src = '';
  document.getElementById('now-playing-bar').classList.remove('visible');
  document.body.classList.remove('pb-bar');
  if (currentNpbId) {
    const p = document.getElementById(`player-${currentNpbId}`);
    if (p) p.innerHTML = '';
    activeStreams[currentNpbId] = null;
    updateCardState(currentNpbId, null);
    currentNpbId = null;
  }
}

// ── PLAYLIST VIEWER ───────────────────────────────────────────────────────────
async function openPlaylist(id, title) {
  document.getElementById('playlist-viewer').classList.add('visible');
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('trending-section').style.display = 'none';
  document.getElementById('playlist-title').textContent = title;
  document.getElementById('playlist-count').textContent = '';

  const grid = document.getElementById('playlist-grid');
  grid.innerHTML = `
    <div class="center-msg" style="grid-column:1/-1">
      <div class="spinner purple"></div>
      <p>Loading playlist…</p>
    </div>`;

  try {
    const params = new URLSearchParams({ id, maxResults: '50' });
    const data = await apiFetch(`${BASE}/playlist?${params}`);
    const items = (data.videos ?? []).map((r, i) => ({
      videoId: r.videoId,
      title: dec(r.title),
      thumbnail: r.thumbnail,
      channelTitle: r.channel ?? '',
      publishedAt: '',
    }));

    document.getElementById('playlist-count').textContent = `(${items.length} tracks)`;
    grid.innerHTML = items.map(v => videoCardHTML(v)).join('');
  } catch (e) {
    grid.innerHTML = `
      <div class="center-msg" style="grid-column:1/-1;color:#e05252">
        Failed to load playlist.
      </div>`;
  }
}

function closePlaylist() {
  document.getElementById('playlist-viewer').classList.remove('visible');
  document.getElementById('results-section').style.display = '';
  if (!currentQuery) {
    document.getElementById('trending-section').style.display = '';
  }
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
      videoId: r.videoId,
      title: dec(r.title),
      thumbnail: r.thumbnail,
      channelTitle: r.channel ?? '',
      publishedAt: '',
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
