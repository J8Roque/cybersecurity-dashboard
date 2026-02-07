/* Cybersecurity Dashboard SPA (safe simulated demo)
   Runs on GitHub Pages with no build tools required.
*/

const $ = (id) => document.getElementById(id);

const STORAGE_KEY = "cybersec_dash_v1";
const state = {
  paused: false,
  theme: "dark",
  metrics: {
    blocked: 0,
    blockedTrend: "Stable",
    alerts: 0,
    alertsSev: "Medium",
    patch: 92,
    auth: 96
  },
  severityCounts: { critical: 1, high: 2, medium: 3, low: 4 },
  threats: [],
  scan: {
    running: false,
    progress: 0,
    results: []
  },
  network: {
    spike: 0
  }
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;
    if (saved.theme) state.theme = saved.theme;
    if (saved.threats) state.threats = saved.threats.slice(0, 50);
    if (saved.severityCounts) state.severityCounts = saved.severityCounts;
  } catch {
    // ignore
  }
}

function saveState() {
  const payload = {
    theme: state.theme,
    threats: state.threats.slice(0, 50),
    severityCounts: state.severityCounts
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
  saveState();
}

function nowTime() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function severityLabel(sev) {
  if (sev === "critical") return "Critical";
  if (sev === "high") return "High";
  if (sev === "medium") return "Medium";
  return "Low";
}

function severityPillClass(sev) {
  if (sev === "critical") return "bad";
  if (sev === "high") return "bad";
  if (sev === "medium") return "warn";
  return "ok";
}

/* SPA navigation */
function setView(view) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelector(`.tab[data-view="${view}"]`)?.classList.add("active");
  $(`view-${view}`)?.classList.add("active");
}

document.addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  setView(tab.dataset.view);
});

/* Charts */
let chartSeverity = null;
let chartEvents = null;
let chartPps = null;
let chartMbps = null;

const eventSeries = [];
const eventLabels = [];
const ppsSeries = [];
const mbpsSeries = [];
const netLabels = [];

function initCharts() {
  const sevCtx = $("chartSeverity").getContext("2d");
  chartSeverity = new Chart(sevCtx, {
    type: "doughnut",
    data: {
      labels: ["Critical", "High", "Medium", "Low"],
      datasets: [
        {
          data: [
            state.severityCounts.critical,
            state.severityCounts.high,
            state.severityCounts.medium,
            state.severityCounts.low
          ]
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: getComputedStyle(document.body).color } } }
    }
  });

  const evtCtx = $("chartEvents").getContext("2d");
  chartEvents = new Chart(evtCtx, {
    type: "line",
    data: {
      labels: eventLabels,
      datasets: [
        {
          label: "Events",
          data: eventSeries,
          tension: 0.25
        }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      scales: {
        x: { ticks: { color: getComputedStyle(document.body).color } },
        y: { ticks: { color: getComputedStyle(document.body).color } }
      },
      plugins: { legend: { labels: { color: getComputedStyle(document.body).color } } }
    }
  });

  const ppsCtx = $("chartPps").getContext("2d");
  chartPps = new Chart(ppsCtx, {
    type: "line",
    data: {
      labels: netLabels,
      datasets: [{ label: "Packets/sec", data: ppsSeries, tension: 0.25 }]
    },
    options: {
      responsive: true,
      animation: false,
      scales: {
        x: { ticks: { color: getComputedStyle(document.body).color } },
        y: { ticks: { color: getComputedStyle(document.body).color } }
      },
      plugins: { legend: { labels: { color: getComputedStyle(document.body).color } } }
    }
  });

  const mbpsCtx = $("chartMbps").getContext("2d");
  chartMbps = new Chart(mbpsCtx, {
    type: "line",
    data: {
      labels: netLabels,
      datasets: [{ label: "Mbps", data: mbpsSeries, tension: 0.25 }]
    },
    options: {
      responsive: true,
      animation: false,
      scales: {
        x: { ticks: { color: getComputedStyle(document.body).color } },
        y: { ticks: { color: getComputedStyle(document.body).color } }
      },
      plugins: { legend: { labels: { color: getComputedStyle(document.body).color } } }
    }
  });
}

function refreshChartTheme() {
  const color = getComputedStyle(document.body).color;
  [chartSeverity, chartEvents, chartPps, chartMbps].forEach((ch) => {
    if (!ch) return;
    if (ch.options?.plugins?.legend?.labels) ch.options.plugins.legend.labels.color = color;
    if (ch.options?.scales?.x?.ticks) ch.options.scales.x.ticks.color = color;
    if (ch.options?.scales?.y?.ticks) ch.options.scales.y.ticks.color = color;
    ch.update();
  });
}

/* Dashboard rendering */
function renderMetrics() {
  $("mBlocked").textContent = state.metrics.blocked.toLocaleString();
  $("mBlockedTrend").textContent = state.metrics.blockedTrend;

  $("mAlerts").textContent = state.metrics.alerts.toLocaleString();
  $("mAlertsSev").textContent = state.metrics.alertsSev;

  $("mPatch").textContent = `${state.metrics.patch}%`;
  $("mPatchStatus").textContent = state.metrics.patch >= 95 ? "OK" : "Needs work";
  $("mPatchStatus").className = `pill ${state.metrics.patch >= 95 ? "ok" : "warn"}`;

  $("mAuth").textContent = `${state.metrics.auth}%`;
  $("mAuthStatus").textContent = state.metrics.auth >= 95 ? "Stable" : "Investigate";
  $("mAuthStatus").className = `pill ${state.metrics.auth >= 95 ? "" : "warn"}`;
}

function updateSeverityChart() {
  if (!chartSeverity) return;
  chartSeverity.data.datasets[0].data = [
    state.severityCounts.critical,
    state.severityCounts.high,
    state.severityCounts.medium,
    state.severityCounts.low
  ];
  chartSeverity.update();
}

function pushRolling(labels, series, label, value, max = 60) {
  labels.push(label);
  series.push(value);
  while (labels.length > max) labels.shift();
  while (series.length > max) series.shift();
}

/* Threat feed */
const THREAT_TEMPLATES = [
  { sev: "critical", msg: "Possible ransomware behavior detected", src: "EDR", hint: "Isolate host, confirm backup status" },
  { sev: "high", msg: "Suspicious PowerShell execution pattern", src: "SIEM", hint: "Review command line and parent process" },
  { sev: "high", msg: "Multiple failed MFA prompts", src: "IdP", hint: "Check for push fatigue, enforce number matching" },
  { sev: "medium", msg: "Phishing email reported by user", src: "Mailbox", hint: "Quarantine, search and purge similar messages" },
  { sev: "medium", msg: "New admin role assignment", src: "IAM", hint: "Validate change request and approval trail" },
  { sev: "low", msg: "New device enrolled", src: "MDM", hint: "Confirm compliance policy and encryption" },
  { sev: "low", msg: "DNS anomaly resolved", src: "NetOps", hint: "Monitor recurrence" }
];

function addThreat(custom = null) {
  const t = custom || THREAT_TEMPLATES[randInt(0, THREAT_TEMPLATES.length - 1)];
  const item = {
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    time: nowTime(),
    sev: t.sev,
    msg: t.msg,
    src: t.src,
    hint: t.hint,
    status: "Open"
  };
  state.threats.unshift(item);
  state.threats = state.threats.slice(0, 60);

  state.severityCounts[item.sev] = (state.severityCounts[item.sev] || 0) + 1;
  state.metrics.alerts = state.threats.filter((x) => x.status === "Open").length;

  const openSevs = state.threats.filter((x) => x.status === "Open").map((x) => x.sev);
  state.metrics.alertsSev = openSevs.includes("critical")
    ? "Critical"
    : openSevs.includes("high")
      ? "High"
      : openSevs.includes("medium")
        ? "Medium"
        : "Low";

  saveState();
  renderThreats();
  updateSeverityChart();
  renderMetrics();
}

function closeThreat(id) {
  const t = state.threats.find((x) => x.id === id);
  if (!t) return;
  t.status = "Closed";
  state.metrics.alerts = state.threats.filter((x) => x.status === "Open").length;
  saveState();
  renderThreats();
  renderMetrics();
}

function renderThreats() {
  const filter = $("threatFilter").value;
  const q = $("threatSearch").value.trim().toLowerCase();

  const list = $("threatList");
  list.innerHTML = "";

  const items = state.threats.filter((t) => {
    const matchSev = filter === "all" ? true : t.sev === filter;
    const matchQ = q
      ? (t.msg + " " + t.src + " " + t.hint).toLowerCase().includes(q)
      : true;
    return matchSev && matchQ;
  });

  $("threatEmpty").style.display = items.length ? "none" : "block";

  for (const t of items) {
    const div = document.createElement("div");
    div.className = "threat";

    const tag = document.createElement("div");
    tag.className = `tag ${t.sev}`;
    tag.textContent = severityLabel(t.sev);

    const body = document.createElement("div");
    body.innerHTML = `
      <div class="msg">${escapeHtml(t.msg)} ${t.status === "Closed" ? `<span class="muted">(closed)</span>` : ""}</div>
      <div class="meta">${escapeHtml(t.time)} • ${escapeHtml(t.src)} • Tip: ${escapeHtml(t.hint)}</div>
    `;

    const btn = document.createElement("button");
    btn.className = "btn btn-ghost";
    btn.textContent = t.status === "Closed" ? "Closed" : "Close";
    btn.disabled = t.status === "Closed";
    btn.addEventListener("click", () => closeThreat(t.id));

    div.appendChild(tag);
    div.appendChild(body);
    div.appendChild(btn);
    list.appendChild(div);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* Vuln scanner simulation */
function simulateFindings(profile, scope) {
  const base = [
    {
      sev: "high",
      title: "Missing HTTP security headers",
      detail: "CSP, X-Content-Type-Options, or Referrer-Policy not consistently set.",
      remed: "Add headers at the reverse proxy or app layer and validate with CI checks."
    },
    {
      sev: "medium",
      title: "TLS configuration could be hardened",
      detail: "Legacy cipher suites or suboptimal TLS settings detected (simulated).",
      remed: "Disable legacy suites, prefer TLS 1.2/1.3, enable HSTS where appropriate."
    },
    {
      sev: "medium",
      title: "Outdated dependency detected",
      detail: "A library version appears behind on security patches (simulated).",
      remed: "Pin versions, enable dependabot, patch and regression test."
    },
    {
      sev: "low",
      title: "Verbose server banner",
      detail: "Service reveals version details that aid fingerprinting (simulated).",
      remed: "Remove or minimize banners and error detail in production."
    },
    {
      sev: "high",
      title: "Weak authentication policy risk",
      detail: "Password or session policy may allow higher risk behavior (simulated).",
      remed: "Enforce MFA, strong session handling, and lockout or risk based controls."
    }
  ];

  const extras = [];
  if (scope === "cloud") {
    extras.push({
      sev: "high",
      title: "Cloud storage access review needed",
      detail: "Public access controls may be misconfigured (simulated).",
      remed: "Audit bucket policies, enforce least privilege, enable logging and alerts."
    });
  }
  if (scope === "internal") {
    extras.push({
      sev: "medium",
      title: "Lateral movement exposure",
      detail: "Internal segmentation appears permissive (simulated).",
      remed: "Apply network segmentation, restrict admin shares, monitor east west traffic."
    });
  }
  if (profile === "deep") {
    extras.push({
      sev: "critical",
      title: "Credential reuse indicator",
      detail: "Simulated signal suggests reused credentials in logs.",
      remed: "Force reset, investigate sign-ins, deploy password manager and MFA."
    });
  }

  const all = base.concat(extras);
  const count = profile === "quick" ? 3 : profile === "standard" ? 5 : Math.min(7, all.length);
  const shuffled = all.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function renderScanResults() {
  const wrap = $("scanResults");
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

    const left = document.createElement("div");
    left.innerHTML = `
      <div class="sev">${severityLabel(f.sev)}</div>
      <div class="muted">Severity</div>
    `;
    left.classList.add(severityPillClass(f.sev));

    const right = document.createElement("div");
    right.innerHTML = `
      <div class="title">${escapeHtml(f.title)}</div>
      <div class="muted">${escapeHtml(f.detail)}</div>
      <div class="remed">Remediation: ${escapeHtml(f.remed)}</div>
    `;

    div.appendChild(left);
    div.appendChild(right);
    wrap.appendChild(div);
  }
}

function startScan() {
  if (state.scan.running) return;

  const target = $("scanTarget").value.trim() || "Unnamed asset";
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

    if (pct < 30) $("scanStatus").textContent = "Checking headers and baseline config...";
    else if (pct < 60) $("scanStatus").textContent = "Evaluating policy signals and dependencies...";
    else if (pct < 90) $("scanStatus").textContent = "Correlating findings and generating report...";
    else $("scanStatus").textContent = "Finalizing...";

    if (i >= steps) {
      clearInterval(timer);
      state.scan.running = false;
      state.scan.progress = 100;
      $("scanBar").style.width = "100%";
      $("scanStatus").textContent = "Scan complete (simulated).";

      state.scan.results = simulateFindings(profile, scope);
      renderScanResults();

      // Add a related alert to the feed
      const top = state.scan.results[0];
      addThreat({
        sev: top.sev === "critical" ? "critical" : top.sev === "high" ? "high" : "medium",
        msg: `Scanner result: ${top.title}`,
        src: "Scanner",
        hint: "Review remediation steps and track in ticket system"
      });
    }
  }, stepMs);
}

/* Password analyzer */
function estimateCrackTime(score) {
  // Very rough user friendly estimate
  if (score <= 0) return "Instant to minutes";
  if (score === 1) return "Minutes to hours";
  if (score === 2) return "Hours to days";
  if (score === 3) return "Days to months";
  return "Months to years";
}

function fallbackScore(pw) {
  let score = 0;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length >= 16) score = Math.min(4, score + 1);
  return clamp(score, 0, 4);
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
    score = res.score; // 0..4
    crack = res.crack_times_display?.offline_fast_hashing_1e10_per_second || estimateCrackTime(score);

    if (res.feedback?.warning) feedback.push(res.feedback.warning);
    if (Array.isArray(res.feedback?.suggestions)) feedback = feedback.concat(res.feedback.suggestions);
  } else {
    score = fallbackScore(pw);
    crack = estimateCrackTime(score);
    feedback.push("Tip: Use a longer passphrase (multiple words) for better security.");
    if (!/\d/.test(pw)) feedback.push("Add a number if appropriate.");
    if (!/[^A-Za-z0-9]/.test(pw)) feedback.push("Add a symbol if policy requires it.");
  }

  const pct = [10, 30, 55, 78, 100][score] || 10;
  $("pwMeter").style.width = `${pct}%`;
  $("pwScore").textContent = `Score: ${score}/4`;

  const verdict =
    score <= 1 ? "Weak" : score === 2 ? "Fair" : score === 3 ? "Strong" : "Very strong";
  $("pwVerdict").textContent = verdict;
  $("pwVerdict").className = `pill ${score <= 1 ? "bad" : score === 2 ? "warn" : "ok"}`;

  const unique = Array.from(new Set(feedback.filter(Boolean))).slice(0, 6);
  $("pwFeedback").innerHTML =
    unique.length
      ? unique.map((x) => `<li>${escapeHtml(x)}</li>`).join("")
      : `<li class="muted">No warnings. This looks solid.</li>`;

  $("pwCrack").textContent = `Estimated crack time: ${crack}`;
}

/* Live simulation loops */
function tickMetrics() {
  if (state.paused) return;

  const delta = randInt(0, 7);
  state.metrics.blocked = clamp(state.metrics.blocked + delta, 0, 999999);

  const trendRoll = randInt(1, 100);
  state.metrics.blockedTrend =
    trendRoll < 20 ? "Down" : trendRoll < 75 ? "Stable" : "Up";

  // Compliance and auth wiggle
  state.metrics.patch = clamp(state.metrics.patch + randInt(-1, 1), 86, 99);
  state.metrics.auth = clamp(state.metrics.auth + randInt(-1, 1), 90, 99);

  renderMetrics();

  // Events chart
  const eventsNow = randInt(8, 26);
  pushRolling(eventLabels, eventSeries, nowTime(), eventsNow, 60);
  chartEvents?.update();

  // Occasionally create a threat
  const roll = randInt(1, 100);
  if (roll <= 18) addThreat();
}

function tickNetwork() {
  if (state.paused) return;

  const basePps = randInt(900, 1600);
  const baseMbps = randInt(40, 110);

  const spikeFactor = state.network.spike > 0 ? 1.8 : 1.0;
  const pps = Math.round(basePps * spikeFactor + randInt(-70, 70));
  const mbps = Math.round(baseMbps * spikeFactor + randInt(-8, 8));

  pushRolling(netLabels, ppsSeries, nowTime(), Math.max(0, pps), 60);
  pushRolling(netLabels, mbpsSeries, nowTime(), Math.max(0, mbps), 60);

  if (state.network.spike > 0) state.network.spike -= 1;

  chartPps?.update();
  chartMbps?.update();
}

/* Export report */
function buildReport() {
  return {
    generatedAt: new Date().toISOString(),
    metrics: { ...state.metrics },
    severityCounts: { ...state.severityCounts },
    openThreats: state.threats.filter((t) => t.status === "Open").slice(0, 50),
    latestScan: state.scan.results.slice(0, 20),
    notes: [
      "This report is generated from simulated demo data.",
      "No real vulnerability scanning was performed."
    ]
  };
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* Wire UI */
function bindUI() {
  $("btnTheme").addEventListener("click", () => {
    setTheme(state.theme === "light" ? "dark" : "light");
    refreshChartTheme();
  });

  $("btnExport").addEventListener("click", () => {
    const report = buildReport();
    downloadJson("cybersecurity-dashboard-report.json", report);
  });

  $("btnPause").addEventListener("click", (e) => {
    state.paused = !state.paused;
    e.target.textContent = state.paused ? "Resume Live Updates" : "Pause Live Updates";
  });

  $("btnSimIncident").addEventListener("click", () => {
    addThreat({ sev: "critical", msg: "Simulated incident: suspicious encryption activity", src: "EDR", hint: "Isolate and start incident playbook" });
    state.metrics.blocked += randInt(40, 120);
    renderMetrics();
  });

  $("btnClearAlerts").addEventListener("click", () => {
    state.threats.forEach((t) => (t.status = "Closed"));
    state.metrics.alerts = 0;
    saveState();
    renderThreats();
    renderMetrics();
  });

  $("btnStartScan").addEventListener("click", startScan);

  $("pwInput").addEventListener("input", (e) => analyzePassword(e.target.value));
  $("btnTogglePw").addEventListener("click", () => {
    const input = $("pwInput");
    const isPw = input.type === "password";
    input.type = isPw ? "text" : "password";
    $("btnTogglePw").textContent = isPw ? "Hide" : "Show";
  });

  $("threatFilter").addEventListener("change", renderThreats);
  $("threatSearch").addEventListener("input", renderThreats);

  $("btnThreatPause").addEventListener("click", (e) => {
    state.paused = !state.paused;
    e.target.textContent = state.paused ? "Resume" : "Pause";
    $("btnPause").textContent = state.paused ? "Resume Live Updates" : "Pause Live Updates";
  });

  $("btnThreatClear").addEventListener("click", () => {
    state.threats = [];
    state.metrics.alerts = 0;
    state.severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    saveState();
    renderThreats();
    updateSeverityChart();
    renderMetrics();
  });

  $("btnNetSpike").addEventListener("click", () => {
    state.network.spike = 20;
    addThreat({ sev: "medium", msg: "Traffic anomaly spike detected (simulated)", src: "NetFlow", hint: "Validate source IPs and rate limit if needed" });
  });

  $("btnNetReset").addEventListener("click", () => {
    netLabels.length = 0;
    ppsSeries.length = 0;
    mbpsSeries.length = 0;
    chartPps?.update();
    chartMbps?.update();
  });
}

/* Boot */
function boot() {
  loadState();
  setTheme(state.theme);

  // Seed a few threats on first run
  if (state.threats.length === 0) {
    addThreat({ sev: "medium", msg: "Baseline monitoring enabled", src: "SIEM", hint: "Review dashboards and set alert thresholds" });
    addThreat({ sev: "low", msg: "MFA policy audit scheduled", src: "IAM", hint: "Confirm coverage for privileged accounts" });
  } else {
    // Recalculate open alerts
    state.metrics.alerts = state.threats.filter((t) => t.status === "Open").length;
  }

  // Seed series for charts
  for (let i = 0; i < 20; i += 1) {
    pushRolling(eventLabels, eventSeries, nowTime(), randInt(8, 20), 60);
    pushRolling(netLabels, ppsSeries, nowTime(), randInt(950, 1500), 60);
    pushRolling(netLabels, mbpsSeries, nowTime(), randInt(45, 100), 60);
  }

  renderMetrics();
  initCharts();
  refreshChartTheme();
  renderThreats();
  renderScanResults();
  bindUI();

  // Live loops
  setInterval(tickMetrics, 1200);
  setInterval(tickNetwork, 1000);
}

document.addEventListener("DOMContentLoaded", boot);
