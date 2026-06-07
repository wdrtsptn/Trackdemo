// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const EVENT_HIERARCHY = {
  Attack: {
    color: "#e85d3a",
    events: ["Shot", "Cross", "Dribble", "Corner", "Freekick", "Throw In", "Header"],
  },
  Transition: {
    color: "#1e5eff",
    events: ["Pass", "Long Ball", "Counter", "Build Up"],
  },
  Defense: {
    color: "#2eb87a",
    events: ["Tackle", "Interception", "Clearance", "Block", "High Press", "Low Press"],
  },
};

const RESULTS = ["Good", "Needs Work", "Bad"];

const RESULT_COLORS = {
  "Good":       "#2eb87a",
  "Needs Work": "#e8a83a",
  "Bad":        "#e85d3a",
};

// ─── STATE ────────────────────────────────────────────────────────────────────
let state = {
  session: {
    matchName:    "",
    home:         "",
    away:         "",
    analystName:  "",
    teamAnalyzed: "",
    date:         "",
  },
  roster:        { home: [], away: [] },
  events:        [],
  tag:           { category: null, event: null, result: null, player: null, coord: null },
  videoSource:   "local",
  heatmapFilter: "all",
  heatmapTeam:   null,
  selectedTeam:  null,
};

let pitchListenerAdded = false;

// ─── PAGE NAVIGATION ──────────────────────────────────────────────────────────
function showPage(id, btn) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
  document.getElementById("page-" + id).classList.add("active");
  if (btn) btn.classList.add("active");
  if (id === "analysis") renderAnalysis();
  if (id === "tagging") {
    setTimeout(() => { drawPitch(); }, 50);
  }
}

// ─── COLLAPSIBLE ──────────────────────────────────────────────────────────────
function toggleCollapse(id) {
  const body  = document.getElementById(id);
  const arrow = document.getElementById("arrow-" + id);
  if (!body) return;
  const isHidden = body.classList.toggle("hidden");
  if (arrow) arrow.classList.toggle("closed", isHidden);
}

// ─── QUICK ACTION BUTTONS ─────────────────────────────────────────────────────
function undoLast() {
  if (!state.events.length) { toast("Nothing to undo"); return; }
  state.events.shift();
  renderLog();
  toast("↩ Undone");
}

function clearAll() {
  if (!state.events.length) { toast("No events to clear"); return; }
  if (!confirm("Clear all tagged events?")) return;
  state.events = [];
  renderLog();
  drawPitch();
  toast("Cleared");
}

// ─── SETUP / ROSTER ───────────────────────────────────────────────────────────
function initRosters() {
  ["home", "away"].forEach(team => {
    const tbody = document.getElementById(team + "Roster");
    tbody.innerHTML = "";
    for (let i = 1; i <= 11; i++) tbody.appendChild(makePlayerRow(team, false));
  });

  ["home", "away"].forEach(team => {
    const tbody = document.getElementById(team + "SubRoster");
    tbody.innerHTML = "";
    for (let i = 1; i <= 7; i++) tbody.appendChild(makePlayerRow(team, true));
  });
}

function makePlayerRow(team, isSub) {
  const tr        = document.createElement("tr");
  tr.dataset.team = team;
  tr.dataset.sub  = isSub ? "1" : "0";
  tr.innerHTML    = `
    <td><input type="number" min="1" max="99" placeholder="" /></td>
    <td><input type="text" placeholder="" style="text-transform:uppercase;" /></td>
    <td><input type="text" placeholder="" /></td>
  `;
  return tr;
}

function getRoster(team) {
  const players = [];

  document.querySelectorAll(`#${team}Roster tr`).forEach(tr => {
    const inputs = tr.querySelectorAll("input");
    const num    = inputs[0].value.trim();
    const pos    = inputs[1].value.trim().toUpperCase();
    const name   = inputs[2].value.trim();
    if (num) players.push({ number: num, pos: pos || "—", name: name || `#${num}`, team, sub: false });
  });

  document.querySelectorAll(`#${team}SubRoster tr`).forEach(tr => {
    const inputs = tr.querySelectorAll("input");
    const num    = inputs[0].value.trim();
    const pos    = inputs[1].value.trim().toUpperCase();
    const name   = inputs[2].value.trim();
    if (num) players.push({ number: num, pos: pos || "—", name: name || `#${num}`, team, sub: true });
  });

  return players;
}

function startSession() {
  state.session = {
    matchName:    document.getElementById("matchName").value.trim()    || "",
    home:         document.getElementById("homeTeam").value.trim()     || "Home",
    away:         document.getElementById("awayTeam").value.trim()     || "Away",
    analystName:  document.getElementById("analystName").value.trim()  || "",
    teamAnalyzed: document.getElementById("teamAnalyzed").value.trim() || "",
    date:         document.getElementById("matchDate").value           || new Date().toISOString().split("T")[0],
  };

  state.roster.home = getRoster("home");
  state.roster.away = getRoster("away");
  state.selectedTeam = null;

  buildTagPanel();
  renderPlayerGrid();

  setTimeout(() => {
    drawPitch();
    initPitchListener();
  }, 50);

  // Collapse match info after applying
  const body  = document.getElementById("matchInfo");
  const arrow = document.getElementById("arrow-matchInfo");
  if (body && !body.classList.contains("hidden")) {
    body.classList.add("hidden");
    if (arrow) arrow.classList.add("closed");
  }

  toast("✓ Roster applied");
}

// ─── TAG PANEL ────────────────────────────────────────────────────────────────
function buildTagPanel() {
  const catGrid = document.getElementById("catGrid");
  catGrid.innerHTML = "";
  Object.entries(EVENT_HIERARCHY).forEach(([cat, data]) => {
    const btn       = document.createElement("button");
    btn.className   = "cat-btn";
    btn.textContent = cat;
    btn.onclick     = () => selectCategory(cat, btn, data.color);
    catGrid.appendChild(btn);
  });

  const resGrid = document.getElementById("resGrid");
  resGrid.innerHTML = "";
  RESULTS.forEach(res => {
    const btn       = document.createElement("button");
    btn.className   = "res-btn";
    btn.textContent = res;
    btn.onclick     = () => selectResult(res, btn);
    resGrid.appendChild(btn);
  });
}

function selectCategory(cat, btn, color) {
  state.tag.category = cat;
  state.tag.event    = null;

  document.querySelectorAll(".cat-btn").forEach(b => {
    b.classList.remove("selected");
    b.style.background  = "";
    b.style.borderColor = "";
  });
  btn.classList.add("selected");
  btn.style.background  = color;
  btn.style.borderColor = color;

  const evGrid = document.getElementById("evGrid");
  evGrid.innerHTML = "";
  EVENT_HIERARCHY[cat].events.forEach(ev => {
    const b       = document.createElement("button");
    b.className   = "ev-btn";
    b.textContent = ev;
    b.onclick     = () => selectEvent(ev, b);
    evGrid.appendChild(b);
  });

  updateSteps();
}

function selectEvent(ev, btn) {
  state.tag.event = ev;
  document.querySelectorAll(".ev-btn").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
  updateSteps();
}

function selectResult(res, btn) {
  state.tag.result = res;
  document.querySelectorAll(".res-btn").forEach(b => {
    b.classList.remove("selected");
    b.style.background  = "";
    b.style.borderColor = "";
    b.style.color       = "";
  });
  btn.classList.add("selected");
  btn.style.background  = RESULT_COLORS[res];
  btn.style.borderColor = RESULT_COLORS[res];
  updateSteps();
}

// ─── PLAYER GRID ──────────────────────────────────────────────────────────────
function renderPlayerGrid() {
  const grid = document.getElementById("playerGrid");
  grid.innerHTML = "";

  const teams = [
    { key: "home", label: state.session.home || "Home" },
    { key: "away", label: state.session.away || "Away" },
  ];

  teams.forEach(({ key, label }) => {
    const btn       = document.createElement("button");
    btn.className   = "pl-btn team-btn" + (state.selectedTeam === key ? " selected" : "");
    btn.textContent = label;
    btn.onclick     = () => selectTeam(key);
    grid.appendChild(btn);
  });

  if (state.selectedTeam) {
    const players = state.roster[state.selectedTeam];
    if (!players.length) return;

    const div         = document.createElement("div");
    div.style.cssText = "width:100%; height:1px; background:rgba(255,255,255,0.08); margin:6px 0;";
    grid.appendChild(div);

    players.forEach(p => {
      const btn       = document.createElement("button");
      btn.className   = "pl-btn" + (state.tag.player?.number === p.number && state.tag.player?.team === p.team ? " selected" : "");
      btn.textContent = `#${p.number} ${p.name}`;
      if (p.sub) btn.style.opacity = "0.65";
      btn.onclick     = () => selectPlayer(p, btn);
      grid.appendChild(btn);
    });
  }
}

function selectTeam(teamKey) {
  state.selectedTeam = state.selectedTeam === teamKey ? null : teamKey;
  if (state.tag.player && state.tag.player.team !== teamKey) {
    state.tag.player = null;
    updateSteps();
  }
  renderPlayerGrid();
}

function selectPlayer(player, btn) {
  state.tag.player = player;
  renderPlayerGrid();
  updateSteps();
}

// ─── STEPS INDICATOR ─────────────────────────────────────────────────────────
function updateSteps() {
  const t     = state.tag;
  const flags = [true, !!t.category, !!t.event, !!t.result, !!t.player];
  const done  = flags.filter(Boolean).length;

  flags.forEach((filled, i) => {
    const dot = document.getElementById("dot" + i);
    if (!dot) return;
    dot.classList.remove("active", "done");
    if (i < done - 1)        dot.classList.add("done");
    else if (i === done - 1) dot.classList.add("active");
  });

  const hint  = document.getElementById("pitchHint");
  const ready = t.category && t.event && t.result && t.player;
  if (hint) {
    hint.textContent   = ready ? "✓ Click pitch to tag event" : "Complete all steps above first";
    hint.style.color   = ready ? "#2eb87a" : "#ffffff";
    hint.style.opacity = ready ? "0.9" : "0.35";
  }
}

// ─── PITCH MAP ────────────────────────────────────────────────────────────────
function initPitchListener() {
  if (pitchListenerAdded) return;
  pitchListenerAdded = true;

  const wrap = document.getElementById("pitchWrap");
  wrap.addEventListener("click", function (e) {
    const t     = state.tag;
    const ready = t.category && t.event && t.result && t.player;

    if (!ready) {
      toast("Complete category, event, result & player first");
      return;
    }

    const rect      = this.getBoundingClientRect();
    const x         = ((e.clientX - rect.left)  / rect.width)  * 100;
    const y         = ((e.clientY - rect.top)   / rect.height) * 100;
    state.tag.coord = { x: Math.round(x), y: Math.round(y) };

    const canvas = document.getElementById("pitchCanvas");
    const ctx    = canvas.getContext("2d");
    renderPitchLines(ctx, canvas.width, canvas.height);
    drawMarker(ctx, e.clientX - rect.left, e.clientY - rect.top);

    submitEvent();
  });
}

function drawPitch() {
  const canvas  = document.getElementById("pitchCanvas");
  const wrap    = document.getElementById("pitchWrap");
  if (!canvas || !wrap) return;
  canvas.width  = wrap.offsetWidth;
  canvas.height = wrap.offsetHeight;
  const ctx     = canvas.getContext("2d");
  renderPitchLines(ctx, canvas.width, canvas.height);
}

function renderPitchLines(ctx, W, H) {
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth   = 1;

  ctx.strokeRect(4, 4, W - 8, H - 8);

  ctx.beginPath();
  ctx.moveTo(W / 2, 4);
  ctx.lineTo(W / 2, H - 4);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(W / 2, H / 2, W * 0.08, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 2, 0, Math.PI * 2);
  ctx.fill();

  const paW = W * 0.16;
  const paH = H * 0.5;
  const gaW = W * 0.05;
  const gaH = H * 0.22;

  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.strokeRect(4, (H - paH) / 2, paW, paH);
  ctx.strokeRect(4, (H - gaH) / 2, gaW, gaH);
  ctx.strokeRect(W - 4 - paW, (H - paH) / 2, paW, paH);
  ctx.strokeRect(W - 4 - gaW, (H - gaH) / 2, gaW, gaH);
}

function drawMarker(ctx, x, y) {
  ctx.fillStyle   = "#1e5eff";
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "white";
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.stroke();
}

window.addEventListener("resize", () => {
  drawPitch();
  if (document.getElementById("page-analysis").classList.contains("active")) {
    renderHeatmap();
  }
});

// ─── SUBMIT EVENT ─────────────────────────────────────────────────────────────
function getTimestamp() {
  const video = document.querySelector("#videoWrapper video");
  if (video && !isNaN(video.currentTime)) {
    const t = Math.floor(video.currentTime);
    const m = String(Math.floor(t / 60)).padStart(2, "0");
    const s = String(t % 60).padStart(2, "0");
    return `${m}:${s}`;
  }
  return "--:--";
}

function submitEvent() {
  const t = state.tag;
  if (!t.category || !t.event || !t.result || !t.player || !t.coord) return;

  const ev = {
    id:        Date.now(),
    timestamp: getTimestamp(),
    team:      t.player.team,
    player:    { number: t.player.number, pos: t.player.pos, name: t.player.name },
    category:  t.category,
    event:     t.event,
    result:    t.result,
    coord:     t.coord,
    notes:     document.getElementById("notesInput").value.trim(),
  };

  state.events.unshift(ev);
  renderLog();
  resetTag();
  toast("✓ Tagged");
}

function resetTag() {
  state.tag          = { category: null, event: null, result: null, player: null, coord: null };
  state.selectedTeam = null;

  document.querySelectorAll(".cat-btn, .ev-btn, .res-btn").forEach(b => {
    b.classList.remove("selected");
    b.style.background  = "";
    b.style.borderColor = "";
    b.style.color       = "";
  });

  document.getElementById("evGrid").innerHTML = `
    <div class="empty-state" style="grid-column:1/-1; padding:12px 0; font-size:11px">
      Select category first
    </div>`;
  document.getElementById("notesInput").value = "";

  renderPlayerGrid();
  drawPitch();
  updateSteps();
}

// ─── EVENT LOG ────────────────────────────────────────────────────────────────
function renderLog() {
  const log = document.getElementById("eventLog");
  document.getElementById("logCount").textContent = state.events.length;

  if (!state.events.length) {
    log.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:24px; color:#ffffff; opacity:0.35; font-size:12px; letter-spacing:1px;">
          No events tagged yet
        </td>
      </tr>`;
    return;
  }

  log.innerHTML = state.events.map((ev, i) => `
    <tr>
      <td class="lt-num">${state.events.length - i}</td>
      <td class="lt-time">${ev.timestamp}</td>
      <td class="lt-cat">
        <span class="log-cat-badge" style="
          background: ${EVENT_HIERARCHY[ev.category]?.color}22;
          color: ${EVENT_HIERARCHY[ev.category]?.color}">
          ${ev.category}
        </span>
      </td>
      <td class="lt-desc">
        <div class="log-desc-text">
          <span style="font-weight:600; color:#ffffff">${ev.event}</span>
          <span class="log-result-badge" style="
            background: ${RESULT_COLORS[ev.result]}22;
            color: ${RESULT_COLORS[ev.result]}">
            ${ev.result}
          </span>
          <span style="color:#ffffff; opacity:0.6; font-size:10px">#${ev.player.number} ${ev.player.name}</span>
        </div>
      </td>
      <td class="lt-notes" style="color:#ffffff; opacity:0.7">${ev.notes || "—"}</td>
      <td class="lt-del">
        <button class="log-del" onclick="deleteEvent(${ev.id})">✕</button>
      </td>
    </tr>
  `).join("");
}

function deleteEvent(id) {
  state.events = state.events.filter(e => e.id !== id);
  renderLog();
}

// ─── VIDEO ────────────────────────────────────────────────────────────────────
function setSource(src) {
  state.videoSource = src;
  document.getElementById("srcLocal").classList.toggle("active", src === "local");
  document.getElementById("srcYT").classList.toggle("active",    src === "youtube");
  document.getElementById("localRow").style.display = src === "local"   ? "flex" : "none";
  document.getElementById("ytRow").style.display    = src === "youtube" ? "flex" : "none";
}

function loadLocal() {
  const file = document.getElementById("localFile").files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  document.getElementById("videoWrapper").innerHTML = `<video controls src="${url}"></video>`;
}

function loadYouTube() {
  const url = document.getElementById("ytUrl").value.trim();
  let videoId = "";
  const m1 = url.match(/[?&]v=([^&]+)/);
  const m2 = url.match(/youtu\.be\/([^?]+)/);
  if (m1)      videoId = m1[1];
  else if (m2) videoId = m2[1];

  if (!videoId) { toast("Invalid YouTube URL"); return; }

  document.getElementById("videoWrapper").innerHTML = `
    <iframe
      src="https://www.youtube.com/embed/${videoId}?enablejsapi=1"
      allowfullscreen>
    </iframe>`;
}

// ─── ANALYSIS ─────────────────────────────────────────────────────────────────
function renderAnalysis() {
  renderHeatmapFilters();
  renderHeatmap();
  renderStats();
}

function renderHeatmapFilters() {
  const wrap = document.getElementById("heatmapFilters");
  wrap.innerHTML = "";

  const allBtn       = document.createElement("button");
  allBtn.className   = "filter-btn" + (state.heatmapFilter === "all" && !state.heatmapTeam ? " active" : "");
  allBtn.textContent = "All";
  allBtn.onclick     = () => {
    state.heatmapFilter = "all";
    state.heatmapTeam   = null;
    renderHeatmapFilters();
    renderHeatmap();
  };
  wrap.appendChild(allBtn);

  const teams = [
    { key: "home", label: state.session.home || "Home" },
    { key: "away", label: state.session.away || "Away" },
  ];

  teams.forEach(({ key, label }) => {
    const teamBtn       = document.createElement("button");
    teamBtn.className   = "filter-btn" + (state.heatmapTeam === key ? " active" : "");
    teamBtn.textContent = label;
    teamBtn.onclick     = () => {
      if (state.heatmapTeam === key) {
        state.heatmapTeam   = null;
        state.heatmapFilter = "all";
      } else {
        state.heatmapTeam   = key;
        state.heatmapFilter = "team-" + key;
      }
      renderHeatmapFilters();
      renderHeatmap();
    };
    wrap.appendChild(teamBtn);
  });

  if (state.heatmapTeam) {
    const players = state.roster[state.heatmapTeam] || [];
    if (players.length) {
      const div         = document.createElement("div");
      div.style.cssText = "width:100%; height:1px; background:rgba(255,255,255,0.08); margin:6px 0;";
      wrap.appendChild(div);

      players.forEach(p => {
        const key       = `${p.team}-${p.number}`;
        const btn       = document.createElement("button");
        btn.className   = "filter-btn" + (state.heatmapFilter === key ? " active" : "");
        btn.textContent = `#${p.number} ${p.name}`;
        btn.onclick     = () => {
          state.heatmapFilter = key;
          renderHeatmapFilters();
          renderHeatmap();
        };
        wrap.appendChild(btn);
      });
    }
  }
}

function setHeatmapFilter(key, btn) {
  state.heatmapFilter = key;
  document.querySelectorAll("#heatmapFilters .filter-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderHeatmap();
}

function renderHeatmap() {
  const canvas  = document.getElementById("heatmapCanvas");
  const wrap    = canvas.parentElement;
  canvas.width  = wrap.offsetWidth;
  canvas.height = wrap.offsetHeight;
  const ctx     = canvas.getContext("2d");

  renderHeatmapPitch(ctx, canvas.width, canvas.height);

  let evs = state.events.filter(e => e.coord);

  if (state.heatmapFilter === "all") {
    // semua event
  } else if (state.heatmapFilter.startsWith("team-")) {
    const teamKey = state.heatmapFilter.replace("team-", "");
    evs = evs.filter(e => e.team === teamKey);
  } else {
    const [team, num] = state.heatmapFilter.split("-");
    evs = evs.filter(e => e.team === team && String(e.player.number) === num);
  }

  if (!evs.length) return;

  evs.forEach(ev => {
    const px = ev.coord.x / 100 * canvas.width;
    const py = ev.coord.y / 100 * canvas.height;
    const r  = Math.min(canvas.width, canvas.height) * 0.1;
    const g  = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0,   "rgba(255, 50,  50,  0.35)");
    g.addColorStop(0.4, "rgba(255, 200, 0,   0.15)");
    g.addColorStop(1,   "rgba(0,   100, 255, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function renderHeatmapPitch(ctx, W, H) {
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth   = 1;

  ctx.strokeRect(4, 4, W - 8, H - 8);

  ctx.beginPath();
  ctx.moveTo(W / 2, 4);
  ctx.lineTo(W / 2, H - 4);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(W / 2, H / 2, W * 0.08, 0, Math.PI * 2);
  ctx.stroke();

  const paW = W * 0.16;
  const paH = H * 0.5;
  const gaW = W * 0.05;
  const gaH = H * 0.22;

  ctx.strokeRect(4, (H - paH) / 2, paW, paH);
  ctx.strokeRect(4, (H - gaH) / 2, gaW, gaH);
  ctx.strokeRect(W - 4 - paW, (H - paH) / 2, paW, paH);
  ctx.strokeRect(W - 4 - gaW, (H - gaH) / 2, gaW, gaH);
}

// ─── STATS ────────────────────────────────────────────────────────────────────
function renderStats() {
  const evs       = state.events;
  const statsGrid = document.getElementById("statsGrid");
  const breakdown = document.getElementById("eventBreakdown");

  if (!evs.length) {
    statsGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">No events to analyze</div>`;
    breakdown.innerHTML = `<div class="empty-state">No events to analyze</div>`;
    return;
  }

  const total      = evs.length;
  const passes     = evs.filter(e => e.event === "Pass" || e.event === "Long Ball");
  const goodPasses = passes.filter(e => e.result === "Good");
  const passAcc    = passes.length ? Math.round(goodPasses.length / passes.length * 100) : 0;
  const shots      = evs.filter(e => e.event === "Shot").length;
  const defensive  = evs.filter(e => ["Tackle","Interception","Clearance","Block"].includes(e.event)).length;

  statsGrid.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total Events</div>
      <div class="stat-value">${total}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Pass Accuracy</div>
      <div class="stat-value">${passAcc}<span style="font-size:14px; opacity:0.6">%</span></div>
      <div class="stat-sub">${goodPasses.length} / ${passes.length} passes</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Shots</div>
      <div class="stat-value">${shots}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Defensive Actions</div>
      <div class="stat-value">${defensive}</div>
    </div>
  `;

  const counts = {};
  evs.forEach(e => { counts[e.event] = (counts[e.event] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max    = sorted[0]?.[1] || 1;

  breakdown.innerHTML = sorted.map(([ev, count]) => `
    <div class="breakdown-row">
      <span class="breakdown-label">${ev}</span>
      <div class="breakdown-bar-wrap">
        <div class="breakdown-bar" style="width:${count / max * 100}%"></div>
      </div>
      <span class="breakdown-count">${count}</span>
    </div>
  `).join("");
}

// ─── EXPORT JSON ──────────────────────────────────────────────────────────────
function exportJSON() {
  if (!state.events.length) { toast("No events to export"); return; }

  const data = {
    session:     state.session,
    roster:      state.roster,
    events:      [...state.events].reverse(),
    exported_at: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = `noltrax-track_${state.session.home}-vs-${state.session.away}_${state.session.date}.json`;
  a.click();
  toast("Exported");
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
  initRosters();
  buildTagPanel();
  updateSteps();
  setTimeout(() => { drawPitch(); initPitchListener(); }, 100);
});
