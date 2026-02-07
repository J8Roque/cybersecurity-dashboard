/* CyberShield SOC demo
   Static, simulated, GitHub Pages friendly
*/

const $ = (id) => document.getElementById(id);

const STORAGE_KEY = "cybershield_soc_v2";

const state = {
  theme: "dark",
  paused: false,
  metrics: {
    alertsOpen: 0,
    blockedToday: 0,
    securityScore: 94
  },
  threats: [],
  severityCounts: { critical: 0, high: 0, medium: 0, low: 0 },
  scan: { running: false, progress: 0, results: [] },
  network: { spike: 0 },
  charts: {}
};

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function nowUtcString() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCompact(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;
    if (saved.theme) state.theme = saved.theme;
    if (Array.isArray(saved.threats)) state.threats = saved.threats.slice(0, 80);
    if (saved.severityCounts) state.severityCounts = saved.severityCounts;
    if (typeof saved.blockedToday === "number") state.metrics.blockedToday = saved.blockedToday;
  } catch {
    // ignore
  }
}

function save() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      theme: state.theme,
      threats: state.threats.slice(0, 80),
      severityCounts: state.severityCounts,
      blockedToday: state.metrics.blockedToday
    })
  );
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
  const btn = $("btnTheme");
  if (btn) btn.textContent = theme === "light" ? "☀️" : "🌙";
  save();
  refreshChartTheme();
}

/* Sidebar mobile */
function openSidebar() {
  $("sidebar").classList.add("open");
  $("scrim").classList.add("show");
}
function closeSidebar() {
  $("sidebar").classList.remove("open");
  $("scrim").classList.remove("show");
}

/* Navigation */
function setView(view) {
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add("active");
  $(`view-${view}`)?.classList.add("active");
  closeSidebar();
}

document.addEventListener("click", (e) => {
  const nav = e.target.closest(".nav-item");
  if (nav) setView(nav.dataset.view);
});

/* Charts helpers */
function chartTextColor() {
  return getComputedStyle(document.body).color;
}

function baseChartOptions() {
  const c = chartTextColor();
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        titleColor: c,
        bodyColor: c
      }
    },
    scales: {
      x: { display: false, ticks: { color: c } },
      y: { display: false, ticks: { color: c } }
    }
  };
}

function makeSpark(id, data) {
  const ctx = $(id).getContext("2d");
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: data.map((_, i) => String(i)),
      datasets: [
        {
          data,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2
        }
      ]
    },
    options: {
      ...baseChartOptions()
    }
  });
}

function makeLine(id, labels, data, showAxes = true) {
  const ctx = $(id).getContext("2d");
  const c = chartTextColor();
  return new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Series",
          data,
          tension: 0.28,
          pointRadius: 0,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: showAxes
        ? {
            x: { ticks: { color: c }, grid: { color: "rgba(255,255,255,0.06)" } },
            y: { ticks: { color: c }, grid: { color: "rgba(255,255,255,0.06)" } }
          }
        : {
            x: { display: false },
            y: { display: false }
          }
    }
  });
}

function makeBar(id, labels, datasets) {
  const ctx = $(id).getContext("2d");
  const c = chartTextColor();
  return new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { labels: { color: c } } },
      scales: {
        x: { ticks: { color: c }, grid: { color: "rgba(255,255,255,0.06)" } },
        y: { ticks: { color: c }, grid: { color: "rgba(255,255,255,0.06)" } }
      }
    }
  });
}

function makeDonut(id, values) {
  const ctx = $(id).getContext("2d");
  return new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Flagged", "Not flagged"],
      datasets: [{ data: values, borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "72%",
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function refreshChartTheme() {
  const c = chartTextColor();
  Object.values(state.charts).forEach((ch) => {
    if (!ch) return;
    if (ch.options?.plugins?.legend?.labels) ch.options.plugins.legend.labels.color = c;
    if (ch.options?.scales?.x?.ticks) ch.options.scales.x.ticks.color = c;
    if (ch.options?.scales?.y?.ticks) ch.options.scales.y.ticks.color = c;
    ch.update();
  });
}

/* Render content blocks */
function renderSidebarBrand() {
  $("brandTitle").textContent = window.CONTENT?.app?.name || "CyberShield";
  $("brandSub").textContent = window.CONTENT?.app?.version || "SOC";
}

function renderRiskyUsers() {
  const wrap = $("riskyUsers");
  wrap.innerHTML = "";
  const users = window.CONTENT?.riskyUsers || [];
  for (const u of users.slice(0, 5)) {
    const row = document.createElement("div");
    row.className = "user-row";
    row.innerHTML = `
      <div class="avatar">👤</div>
      <div>
        <div class="user-name">${escapeHtml(u.name)}</div>
        <div class="user-sub">${escapeHtml(u.dept)}</div>
        <div class="user-bar"><div class="user-fill" style="width:${clamp(u.risk,0,100)}%"></div></div>
      </div>
      <div class="user-score">${clamp(u.risk,0,100)}</div>
    `;
    wrap.appendChild(row);
  }
}

function renderAnomalyList() {
  const wrap = $("anomalyList");
  wrap.innerHTML = "";
  const rows = window.CONTENT?.anomaliesQueue || [];
  for (const r of rows) {
    const div = document.createElement("div");
    div.className = "stat-row";
    div.innerHTML = `
      <div>
        <div class="stat-name">${escapeHtml(r.name)}</div>
        <div class="stat-meta">${escapeHtml(r.meta)}</div>
      </div>
      <div class="stat-val">${escapeHtml(String(r.value))}</div>
    `;
    wrap.appendChild(div);
  }
}

function renderIndicators() {
  const wrap = $("indicatorList");
  wrap.innerHTML = "";
  const rows = window.CONTENT?.indicators || [];
  for (const r of rows) {
    const div = document.createElement("div");
    div.className = "ind-row";
    div.innerHTML = `
      <div>
        <div class="ind-name">${escapeHtml(r.name)}</div>
        <div class="muted small">${escapeHtml(String(r.weight))}</div>
      </div>
      <div class="ind-bar"><div class="ind-fill" style="width:${clamp(r.weight,0,100)}%"></div></div>
    `;
    wrap.appendChild(div);
  }
}

/* Threats */
function sevLabel(sev) {
  if (sev === "critical") return "Critical";
  if (sev === "high") return "High";
  if (sev === "medium") return "Medium";
  return "Low";
}

function addThreat(template = null) {
  const t = template || (window.CONTENT?.threatTemplates || [])[randInt(0, (window.CONTENT?.threatTemplates || []).length - 1)];
  if (!t) return;

  const item = {
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    time: nowUtcString(),
    sev: t.sev,
    msg: t.msg,
    src: t.src,
    hint: t.hint,
    status: "Open"
  };

  state.threats.unshift(item);
  state.threats = state.threats.slice(0, 80);
  state.severityCounts[item.sev] = (state.severityCounts[item.sev] || 0) + 1;
  state.metrics.alertsOpen = state.threats.filter((x) => x.status === "Open").length;

  save();
  renderThreats();
  renderKPIs();
}

function closeThreat(id) {
  const t = state.threats.find((x) => x.id === id);
  if (!t) return;
  t.status = "Closed";
  state.metrics.alertsOpen = state.threats.filter((x) => x.status === "Open").length;
  save();
  renderThreats();
  renderKPIs();
}

function renderThreats() {
  const list = $("threatList");
  const empty = $("threatEmpty");
  if (!list || !empty) return;

  const filter = $("threatFilter")?.value || "all";
  const q = ($("threatSearch")?.value || "").trim().toLowerCase();

  list.innerHTML = "";

  const items = state.threats.filter((t) => {
    const matchSev = filter === "all" ? true : t.sev === filter;
    const matchQ = q ? (t.msg + " " + t.src + " " + t.hint).toLowerCase().includes(q) : true;
    return matchSev && matchQ;
  });

  empty.style.display = items.length ? "none" : "block";

  for (const t of items) {
    const div = document.createElement("div");
    div.className = "threat";
    div.innerHTML = `
      <div class="tag ${t.sev}">${sevLabel(t.sev)}</div>
      <div>
        <div class="msg">${escapeHtml(t.msg)} ${t.status === "Closed" ? `<span class="muted">(closed)</span>` : ""}</div>
        <div class="meta">${escapeHtml(t.time)} • ${escapeHtml(t.src)} • Tip: ${escapeHtml(t.hint)}</div>
      </div>
      <button class="btn btn-ghost btn-mini" ${t.status === "Closed" ? "disabled" : ""} data-close="${t.id}">
        ${t.status === "Closed" ? "Closed" : "Close"}
      </button>
    `;
    list.appendChild(div);
  }
}

/* Scanner */
function simulateFindings(profile, scope) {
  const s = window.CONTENT?.scanFindings;
  if (!s) return [];

  const base = [...s.base];
  const add = [];
  if (scope === "cloud") add.push(...s.cloud);
  if (scope === "internal") add.push(...s.internal);
  if (profile === "deep") add.push(...s.deep);

  const all = base.concat(add);
  const count = profile === "quick" ? 3 : profile === "standard" ? 5 : Math.min(7, all.length);
  return all.sort(() => Math.random() - 0.5).slice(0, count);
}

function renderScanResults() {
  const wrap = $("scanResults");
  if (!wrap) return;

  const results = state.scan.results;

  if (!results.length) {
    wrap.className = "empty";
    wrap.textContent = "No results yet. Start a scan.";
    return;
  }

  wrap.className = "";
  wrap.innerHTML = "";

  for (const f of results) {
    const div = document.createElement("div");
    div.className = "finding";
    div.innerHTML = `
      <div class="tag ${f.sev}">${escapeHtml(f.sev.toUpperCase())}</div>
      <div>
        <div class="msg">${escapeHtml(f.title)}</div>
        <div class="meta muted">${escapeHtml(f.detail)}</div>
        <div class="meta muted">Remediation: ${escapeHtml(f.remed)}</div>
      </div>
    `;
    wrap.appendChild(div);
  }
}

function startScan() {
  if (state.scan.running) return;

  const target = ($("scanTarget").value || "").trim() || "Unnamed asset";
  const profile = $("scanProfile").value;
  const scope = $("scanScope").value;

  state.scan.running = true;
  state.scan.progress = 0;
  state.scan.results = [];

  $("scanStatus").textContent = `Starting simulated scan for: ${target}`;
  $("scanBar").style.width = "0%";
  renderScanResults();

  const durationMs = profile === "quick" ? 2000 : profile === "standard" ? 3500 : 5200;
  const stepMs = 120;
  const steps = Math.floor(durationMs / stepMs);

  let i = 0;
  const timer = setInterval(() => {
    i += 1;
    const pct = clamp(Math.round((i / steps) * 100), 0, 100);
    state.scan.progress = pct;
    $("scanBar").style.width = `${pct}%`;

    if (pct < 30) $("scanStatus").textContent = "Checking baseline config...";
    else if (pct < 60) $("scanStatus").textContent = "Evaluating policy signals...";
    else if (pct < 90) $("scanStatus").textContent = "Correlating findings...";
    else $("scanStatus").textContent = "Finalizing...";

    if (i >= steps) {
      clearInterval(timer);
      state.scan.running = false;
      $("scanBar").style.width = "100%";
      $("scanStatus").textContent = "Scan complete (simulated).";

      state.scan.results = simulateFindings(profile, scope);
      renderScanResults();

      const top = state.scan.results[0];
      if (top) {
        addThreat({
          sev: top.sev === "critical" ? "critical" : top.sev === "high" ? "high" : "medium",
          msg: `Scanner result: ${top.title}`,
          src: "Scanner",
          hint: "Review remediation and track in tickets"
        });
      }
    }
  }, stepMs);
}

/* Password */
function estimateCrack(score) {
  if (score <= 0) return "Instant to minutes";
  if (score === 1) return "Minutes to hours";
  if (score === 2) return "Hours to days";
  if (score === 3) return "Days to months";
  return "Months to years";
}

function analyzePassword(pw) {
  if (!pw) {
    $("pwMeter").style.width = "0%";
    $("pwVerdict").textContent = "No input";
    $("pwScore").textContent = "Score: 0/4";
    $("pwFeedback").innerHTML = `<li class="muted">Type a password to see suggestions.</li>`;
    $("pwCrack").textContent = "Estimated crack time: N/A";
    return;
  }

  let score = 0;
  let feedback = [];
  let crack = "N/A";

  if (typeof window.zxcvbn === "function") {
    const res = window.zxcvbn(pw);
    score = res.score;
    crack = res.crack_times_display?.offline_fast_hashing_1e10_per_second || estimateCrack(score);
    if (res.feedback?.warning) feedback.push(res.feedback.warning);
    if (Array.isArray(res.feedback?.suggestions)) feedback = feedback.concat(res.feedback.suggestions);
  } else {
    score = clamp(Math.floor(pw.length / 4), 0, 4);
    crack = estimateCrack(score);
    feedback.push("Use a longer passphrase.");
  }

  const pct = [10, 30, 55, 78, 100][score] || 10;
  $("pwMeter").style.width = `${pct}%`;
  $("pwScore").textContent = `Score: ${score}/4`;

  const verdict = score <= 1 ? "Weak" : score === 2 ? "Fair" : score === 3 ? "Strong" : "Very strong";
  $("pwVerdict").textContent = verdict;

  const uniq = Array.from(new Set(feedback.filter(Boolean))).slice(0, 6);
  $("pwFeedback").innerHTML = uniq.length
    ? uniq.map((x) => `<li>${escapeHtml(x)}</li>`).join("")
    : `<li class="muted">No warnings. Looks solid.</li>`;

  $("pwCrack").textContent = `Estimated crack time: ${crack}`;
}

/* KPIs */
function renderKPIs() {
  const d = window.CONTENT?.dashboard;

  if (d) {
    $("kIncidentsWeek").textContent = String(d.incidentsWeek.value);
    $("kIncidentsDelta").textContent = `+${d.incidentsWeek.deltaPct}%`;
    $("kNewIncidents").textContent = String(d.newIncidents.value);
    $("kNewDelta").textContent = `+${d.newIncidents.deltaPct}%`;
    $("kModels").textContent = String(d.modelsMonthly.value);
    $("kModelsNote").textContent = d.modelsMonthly.note;
  }

  const open = state.threats.filter((t) => t.status === "Open");
  state.metrics.alertsOpen = open.length;

  const blocked = state.metrics.blockedToday;
  $("kBlockedMini").textContent = formatCompact(blocked);
  $("kAlertsMini").textContent = String(state.metrics.alertsOpen);

  // Score gets slightly worse with more open alerts
  const baseScore = 94;
  const score = clamp(Math.round(baseScore - state.metrics.alertsOpen * 0.7), 0, 100);
  state.metrics.securityScore = score;
  $("kScoreMini").textContent = String(score);

  $("sbLiveCount").textContent = String(state.metrics.alertsOpen);

  const sev = open.some((x) => x.sev === "critical")
    ? "Critical"
    : open.some((x) => x.sev === "high")
      ? "High"
      : open.some((x) => x.sev === "medium")
        ? "Medium"
        : "Low";

  $("sbLiveSev").textContent = sev;
}

/* Live ticks */
const sparkA = Array.from({ length: 28 }, () => randInt(15, 45));
const sparkB = Array.from({ length: 28 }, () => randInt(12, 40));
const sparkH = Array.from({ length: 28 }, () => randInt(60, 95));

const lineLabels = Array.from({ length: 24 }, (_, i) => `${i}h`);
const lineCasesData = Array.from({ length: 24 }, () => randInt(8, 26));
const lineModelsData = Array.from({ length: 24 }, () => randInt(12, 36));

const barLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const barOpen = [12, 15, 10, 14, 18, 11, 13];
const barClosed = [9, 13, 12, 10, 15, 14, 12];
const barAccepted = [2, 1, 3, 2, 1, 2, 2];

const netLabels = Array.from({ length: 40 }, (_, i) => String(i));
const ppsSeries = Array.from({ length: 40 }, () => randInt(900, 1600));
const mbpsSeries = Array.from({ length: 40 }, () => randInt(40, 110));

function tickSparks() {
  const shiftPush = (arr, next) => { arr.shift(); arr.push(next); };

  shiftPush(sparkA, clamp(sparkA[sparkA.length - 1] + randInt(-6, 7), 10, 70));
  shiftPush(sparkB, clamp(sparkB[sparkB.length - 1] + randInt(-6, 7), 8, 70));
  shiftPush(sparkH, clamp(sparkH[sparkH.length - 1] + randInt(-4, 4), 40, 98));

  if (state.charts.sparkIncidents) {
    state.charts.sparkIncidents.data.datasets[0].data = [...sparkA];
    state.charts.sparkIncidents.update();
  }
  if (state.charts.sparkNew) {
    state.charts.sparkNew.data.datasets[0].data = [...sparkB];
    state.charts.sparkNew.update();
  }
  if (state.charts.sparkHealth) {
    state.charts.sparkHealth.data.datasets[0].data = [...sparkH];
    state.charts.sparkHealth.update();
  }
}

function tickLines() {
  lineCasesData.shift();
  lineCasesData.push(randInt(8, 26));
  state.charts.lineCases.data.datasets[0].data = [...lineCasesData];
  state.charts.lineCases.update();

  lineModelsData.shift();
  lineModelsData.push(randInt(12, 36));
  state.charts.lineModels.data.datasets[0].data = [...lineModelsData];
  state.charts.lineModels.update();
}

function tickNetwork() {
  const spike = state.network.spike > 0 ? 1.8 : 1.0;
  if (state.network.spike > 0) state.network.spike -= 1;

  ppsSeries.shift();
  mbpsSeries.shift();

  ppsSeries.push(Math.max(0, Math.round(randInt(900, 1600) * spike + randInt(-70, 70))));
  mbpsSeries.push(Math.max(0, Math.round(randInt(40, 110) * spike + randInt(-8, 8))));

  state.charts.chartPps.data.datasets[0].data = [...ppsSeries];
  state.charts.chartMbps.data.datasets[0].data = [...mbpsSeries];
  state.charts.chartPps.update();
  state.charts.chartMbps.update();
}

function tickThreats() {
  if (randInt(1, 100) <= 18) addThreat();
}

function updateClock() {
  $("clock").textContent = nowUtcString();
}

/* Export */
function buildReport() {
  return {
    generatedAt: new Date().toISOString(),
    theme: state.theme,
    metrics: { ...state.metrics },
    severityCounts: { ...state.severityCounts },
    openThreats: state.threats.filter((t) => t.status === "Open").slice(0, 50),
    latestScan: state.scan.results.slice(0, 20),
    notes: ["Simulated demo data only, safe for public hosting."]
  };
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* Bind UI */
function bindUI() {
  $("btnTheme").addEventListener("click", () => setTheme(state.theme === "light" ? "dark" : "light"));
  $("btnExport").addEventListener("click", () => downloadJson("cybershield-report.json", buildReport()));
  $("btnExport2").addEventListener("click", () => downloadJson("cybershield-report.json", buildReport()));

  $("btnOpenSidebar").addEventListener("click", openSidebar);
  $("btnCloseSidebar").addEventListener("click", closeSidebar);
  $("scrim").addEventListener("click", closeSidebar);

  $("btnThreatPause").addEventListener("click", (e) => {
    state.paused = !state.paused;
    e.target.textContent = state.paused ? "Resume" : "Pause";
    $("sbMode").textContent = state.paused ? "Paused" : "Live";
  });

  $("btnThreatClear").addEventListener("click", () => {
    state.threats = [];
    state.metrics.alertsOpen = 0;
    state.severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    save();
    renderThreats();
    renderKPIs();
  });

  $("btnSimIncident").addEventListener("click", () => {
    addThreat({ sev: "critical", msg: "Simulated incident: suspicious encryption activity", src: "EDR", hint: "Isolate and begin containment steps" });
    state.metrics.blockedToday += randInt(40, 180);
    renderKPIs();
  });

  $("threatFilter").addEventListener("change", renderThreats);
  $("threatSearch").addEventListener("input", renderThreats);

  $("threatList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-close]");
    if (!btn) return;
    closeThreat(btn.getAttribute("data-close"));
  });

  $("btnStartScan").addEventListener("click", startScan);
  $("btnScanClear").addEventListener("click", () => {
    state.scan.results = [];
    $("scanBar").style.width = "0%";
    $("scanStatus").textContent = "Idle";
    renderScanResults();
  });

  $("pwInput").addEventListener("input", (e) => analyzePassword(e.target.value));
  $("btnTogglePw").addEventListener("click", () => {
    const input = $("pwInput");
    const isPw = input.type === "password";
    input.type = isPw ? "text" : "password";
    $("btnTogglePw").textContent = isPw ? "Hide" : "Show";
  });

  $("btnNetSpike").addEventListener("click", () => {
    state.network.spike = 18;
    addThreat({ sev: "medium", msg: "Traffic anomaly spike detected (simulated)", src: "NetFlow", hint: "Validate sources and rate limit if needed" });
  });

  $("btnNetReset").addEventListener("click", () => {
    for (let i = 0; i < ppsSeries.length; i += 1) ppsSeries[i] = randInt(900, 1600);
    for (let i = 0; i < mbpsSeries.length; i += 1) mbpsSeries[i] = randInt(40, 110);
    state.charts.chartPps.update();
    state.charts.chartMbps.update();
  });

  $("btnPauseAll").addEventListener("click", (e) => {
    state.paused = !state.paused;
    e.target.textContent = state.paused ? "Resume live" : "Pause live";
    $("sbMode").textContent = state.paused ? "Paused" : "Live";
  });

  $("btnClearAll").addEventListener("click", () => {
    state.threats.forEach((t) => (t.status = "Closed"));
    state.metrics.alertsOpen = 0;
    save();
    renderThreats();
    renderKPIs();
  });

  $("btnResetDemo").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });
}

/* Init charts */
function initCharts() {
  state.charts.sparkIncidents = makeSpark("sparkIncidents", sparkA);
  state.charts.sparkNew = makeSpark("sparkNew", sparkB);
  state.charts.sparkHealth = makeSpark("sparkHealth", sparkH);

  const an = window.CONTENT?.dashboard?.anomaliesDonut || { flagged: 40, notFlagged: 60 };
  state.charts.donutAnoms = makeDonut("donutAnoms", [an.flagged, an.notFlagged]);

  state.charts.lineCases = makeLine("lineCases", lineLabels, lineCasesData, true);
  state.charts.lineModels = makeLine("lineModels", lineLabels, lineModelsData, true);

  state.charts.barActions = makeBar("barActions", barLabels, [
    { label: "Open", data: barOpen },
    { label: "Closed", data: barClosed },
    { label: "Risk accepted", data: barAccepted }
  ]);

  state.charts.chartPps = makeLine("chartPps", netLabels, ppsSeries, false);
  state.charts.chartMbps = makeLine("chartMbps", netLabels, mbpsSeries, false);
}

/* Boot */
function boot() {
  loadSaved();

  const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  if (!localStorage.getItem(STORAGE_KEY)) state.theme = prefersLight ? "light" : "dark";
  setTheme(state.theme);

  renderSidebarBrand();
  renderRiskyUsers();
  renderAnomalyList();
  renderIndicators();

  if (state.threats.length === 0) {
    addThreat({ sev: "medium", msg: "Baseline monitoring enabled", src: "SIEM", hint: "Review thresholds and dashboards" });
    addThreat({ sev: "low", msg: "MFA policy audit scheduled", src: "IAM", hint: "Confirm privileged coverage" });
  } else {
    state.metrics.alertsOpen = state.threats.filter((t) => t.status === "Open").length;
  }

  const initBlocked = randInt(1800, 3800);
  state.metrics.blockedToday = Math.max(state.metrics.blockedToday, initBlocked);

  initCharts();
  bindUI();
  renderThreats();
  renderScanResults();
  renderKPIs();

  updateClock();
  setInterval(updateClock, 1000);

  setInterval(() => {
    if (state.paused) return;
    state.metrics.blockedToday = clamp(state.metrics.blockedToday + randInt(0, 20), 0, 999999);
    renderKPIs();
    tickSparks();
    tickLines();
    tickNetwork();
    tickThreats();
  }, 1200);
}

document.addEventListener("DOMContentLoaded", boot);
