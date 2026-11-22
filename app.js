/* Pit Wall Analyst - charts and interactions. Plain JavaScript, no libraries. */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (v, d = 0) => v == null ? "–" : Number(v).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v, d = 0) => v == null ? "–" : (v * 100).toFixed(d) + "%";
const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];
const teamColor = id => F1.team_color[id] || "#8f8e86";
const NS = "http://www.w3.org/2000/svg";

/* ---------- tooltip ---------- */
const tip = $("#tooltip");
function showTip(html, ev) {
  tip.innerHTML = html; tip.style.display = "block";
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + w > innerWidth - 8) x = ev.clientX - w - 14;
  if (y + h > innerHeight - 8) y = ev.clientY - h - 14;
  tip.style.left = x + "px"; tip.style.top = y + "px";
}
const hideTip = () => { tip.style.display = "none"; };
const row = (k, v) => `<div class="t-row"><span>${k}</span><b>${v}</b></div>`;

/* ---------- table view toggles ---------- */
const tableViews = {};
document.addEventListener("click", e => {
  const b = e.target.closest(".view-toggle");
  if (!b) return;
  const el = document.getElementById(b.dataset.for);
  const showingTable = el.dataset.mode === "table";
  if (showingTable) { el.innerHTML = el.dataset.chart; el.dataset.mode = "chart"; b.textContent = "Table view"; bindHits(el); }
  else { el.dataset.chart = el.innerHTML; el.innerHTML = tableViews[b.dataset.for]; el.dataset.mode = "table"; b.textContent = "Chart view"; }
});
function simpleTable(head, rows) {
  return `<div class="table-wrap"><table><tr>${head.map((h, i) => `<th class="${i ? "num" : ""}">${h}</th>`).join("")}</tr>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${i ? "num" : ""}">${c}</td>`).join("")}</tr>`).join("")}</table></div>`;
}

/* Hover handlers are attached through data-tip attributes so they survive table/chart toggles */
function bindHits(root) {
  root.querySelectorAll("[data-tip]").forEach(n => {
    n.addEventListener("mousemove", ev => showTip(n.dataset.tip, ev));
    n.addEventListener("mouseleave", hideTip);
  });
}

/* ---------- horizontal bar chart ---------- */
function hbar(el, rows, { format = v => fmt(v), width = 560, rowH = 30, max } = {}) {
  const labelW = 130, valueW = 56, plotW = width - labelW - valueW;
  const top = max ?? Math.max(...rows.map(r => r.value));
  const h = rows.length * rowH + 6;
  let s = `<svg class="chart" viewBox="0 0 ${width} ${h}" role="img">`;
  s += `<line class="baseline" x1="${labelW}" x2="${labelW}" y1="0" y2="${h - 4}"/>`;
  rows.forEach((r, i) => {
    const y = i * rowH + 5, bh = rowH - 10, w = Math.max(2, (r.value / top) * plotW);
    const rr = Math.min(4, w / 2);
    s += `<text x="${labelW - 10}" y="${y + bh / 2 + 4}" text-anchor="end">${esc(r.label)}</text>`;
    s += `<path d="M${labelW},${y} h${w - rr} a${rr},${rr} 0 0 1 ${rr},${rr} v${bh - 2 * rr} a${rr},${rr} 0 0 1 -${rr},${rr} h-${w - rr} z" fill="${r.color || "var(--series-1)"}"/>`;
    s += `<text class="value-label" x="${labelW + w + 6}" y="${y + bh / 2 + 4}">${format(r.value)}</text>`;
    s += `<rect class="hit" x="0" y="${y - 3}" width="${width}" height="${rowH}" data-tip="${esc(r.tip || `<div class='t-title'>${esc(r.label)}</div>` + row("Value", format(r.value)))}"/>`;
  });
  el.innerHTML = s + "</svg>";
  bindHits(el);
}

/* ---------- multi-line chart with crosshair ---------- */
function lineChart(el, labels, fullLabels, series, { width = 1080, height = 330, yTitle = "" } = {}) {
  const m = { l: 46, r: 70, t: 10, b: 34 }, W = width - m.l - m.r, H = height - m.t - m.b;
  const maxY = Math.max(...series.flatMap(s => s.values));
  const step = maxY > 300 ? 100 : 50, top = Math.ceil(maxY / step) * step;
  const x = i => m.l + (labels.length === 1 ? 0 : (i / (labels.length - 1)) * W);
  const y = v => m.t + H - (v / top) * H;
  let s = `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">`;
  for (let v = 0; v <= top; v += step) {
    s += `<line class="${v ? "gridline" : "baseline"}" x1="${m.l}" x2="${m.l + W}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  labels.forEach((l, i) => { if (labels.length < 14 || i % 2 === 0 || i === labels.length - 1) s += `<text x="${x(i)}" y="${height - 12}" text-anchor="middle">${esc(l)}</text>`; });
  s += `<text class="axis-title" x="${m.l}" y="${height}" >Round</text>`;
  series.forEach((sr, k) => {
    const d = sr.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    s += `<path d="${d}" fill="none" stroke="${SERIES[k]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  });
  // end labels, nudged apart so they never overlap
  const ends = series.map((sr, k) => ({ k, name: sr.name, y: y(sr.values.at(-1)), v: sr.values.at(-1) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
  ends.forEach(e => {
    s += `<circle cx="${x(labels.length - 1)}" cy="${y(series[e.k].values.at(-1))}" r="4" fill="${SERIES[e.k]}" stroke="var(--surface-1)" stroke-width="2"/>`;
    s += `<text class="series-label" x="${x(labels.length - 1) + 10}" y="${e.y + 4}">${esc(e.name)} ${fmt(e.v)}</text>`;
  });
  s += `<line id="xhair" x1="0" x2="0" y1="${m.t}" y2="${m.t + H}" stroke="#6b6b64" stroke-width="1" stroke-dasharray="3 3" style="display:none"/>`;
  s += `<g id="xdots"></g><rect class="hit" x="${m.l}" y="${m.t}" width="${W}" height="${H}" id="xhit"/>`;
  el.innerHTML = s + "</svg>";
  const svg = el.querySelector("svg"), hit = el.querySelector("#xhit"), xh = el.querySelector("#xhair"), dots = el.querySelector("#xdots");
  hit.addEventListener("mousemove", ev => {
    const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const i = Math.max(0, Math.min(labels.length - 1, Math.round(((p.x - m.l) / W) * (labels.length - 1))));
    xh.setAttribute("x1", x(i)); xh.setAttribute("x2", x(i)); xh.style.display = "";
    dots.innerHTML = series.map((sr, k) => `<circle cx="${x(i)}" cy="${y(sr.values[i])}" r="4.5" fill="${SERIES[k]}" stroke="var(--surface-1)" stroke-width="2"/>`).join("");
    const order = series.map((sr, k) => ({ sr, k })).sort((a, b) => b.sr.values[i] - a.sr.values[i]);
    showTip(`<div class="t-title">Round ${labels[i]} · ${esc(fullLabels[i])}</div>` +
      order.map(o => `<div class="t-row"><span><i style="background:${SERIES[o.k]}"></i>${esc(o.sr.name)}</span><b>${fmt(o.sr.values[i])}</b></div>`).join(""), ev);
  });
  hit.addEventListener("mouseleave", () => { xh.style.display = "none"; dots.innerHTML = ""; hideTip(); });
}

/* ---------- dumbbell: avg grid -> avg finish ---------- */
function dumbbell(el, rows, { width = 1080 } = {}) {
  const labelW = 130, m = { r: 30, t: 22 }, rowH = 32, maxP = 20;
  const W = width - labelW - m.r, h = m.t + rows.length * rowH + 30;
  const x = p => labelW + ((p - 1) / (maxP - 1)) * W;
  let s = `<svg class="chart" viewBox="0 0 ${width} ${h}" role="img">`;
  [1, 5, 10, 15, 20].forEach(p => { s += `<line class="gridline" x1="${x(p)}" x2="${x(p)}" y1="${m.t - 6}" y2="${h - 26}"/><text x="${x(p)}" y="${h - 10}" text-anchor="middle">P${p}</text>`; });
  s += `<text class="axis-title" x="${labelW}" y="12">← better position</text>`;
  rows.forEach((r, i) => {
    const y = m.t + i * rowH + rowH / 2;
    s += `<text x="${labelW - 12}" y="${y + 4}" text-anchor="end">${esc(r.name)}</text>`;
    s += `<line x1="${x(r.avg_grid)}" x2="${x(r.avg_finish)}" y1="${y}" y2="${y}" stroke="#6b6b64" stroke-width="2"/>`;
    s += `<circle cx="${x(r.avg_grid)}" cy="${y}" r="6" fill="var(--surface-1)" stroke="var(--text-secondary)" stroke-width="2"/>`;
    s += `<circle cx="${x(r.avg_finish)}" cy="${y}" r="6.5" fill="var(--series-1)" stroke="var(--surface-1)" stroke-width="2"/>`;
    const t = `<div class='t-title'>${esc(r.name)}</div>` + row("Avg grid", fmt(r.avg_grid, 1)) + row("Avg finish", fmt(r.avg_finish, 1)) +
      row("Places gained / race", (r.pos_gained > 0 ? "+" : "") + fmt(r.pos_gained, 2)) + row("Starts", r.starts);
    s += `<rect class="hit" x="0" y="${y - rowH / 2}" width="${width}" height="${rowH}" data-tip="${esc(t)}"/>`;
  });
  el.innerHTML = s + "</svg>";
  bindHits(el);
}

/* ---------- vertical bars ---------- */
function vbar(el, rows, { width = 560, height = 240, format = v => fmt(v), highlight = -1 } = {}) {
  const m = { l: 10, r: 10, t: 22, b: 30 }, W = width - m.l - m.r, H = height - m.t - m.b;
  const max = Math.max(...rows.map(r => r.value)), slot = W / rows.length, bw = slot - 6;
  let s = `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img"><line class="baseline" x1="${m.l}" x2="${m.l + W}" y1="${m.t + H}" y2="${m.t + H}"/>`;
  rows.forEach((r, i) => {
    const bh = Math.max(2, (r.value / max) * H), x = m.l + i * slot + 3, y = m.t + H - bh, rr = Math.min(4, bw / 2, bh);
    s += `<path d="M${x},${m.t + H} v-${bh - rr} a${rr},${rr} 0 0 1 ${rr},-${rr} h${bw - 2 * rr} a${rr},${rr} 0 0 1 ${rr},${rr} v${bh - rr} z" fill="${i === highlight ? "var(--series-1)" : "#5598e7"}" opacity="${i === highlight ? 1 : .55}"/>`;
    s += `<text x="${x + bw / 2}" y="${height - 10}" text-anchor="middle">${esc(r.label)}</text>`;
    if (i < 3 || i === rows.length - 1) s += `<text class="value-label" x="${x + bw / 2}" y="${y - 6}" text-anchor="middle">${format(r.value)}</text>`;
    s += `<rect class="hit" x="${x - 3}" y="${m.t}" width="${slot}" height="${H}" data-tip="${esc(r.tip)}"/>`;
  });
  el.innerHTML = s + "</svg>";
  bindHits(el);
}

/* ================= SEASON ================= */
function renderSeason() {
  const d = F1.drivers, leader = d[0], second = d[1];
  $("#heroSeasons").textContent = F1.seasons;
  $("#heroRows").textContent = `${fmt(F1.n_races)} races · ${fmt(F1.n_rows)} results`;
  $("#seasonTitle").textContent = `${F1.season} season`;
  $("#seasonSub").textContent = `After round ${F1.last_round} (${F1.last_gp}, ${F1.updated}).`;
  const teamLead = F1.teams[0];
  $("#seasonStats").innerHTML = [
    ["Leader", leader.name, `${fmt(leader.points)} pts · ${leader.team}`, true],
    ["Lead", `${fmt(leader.points - second.points)} pts`, `over ${second.name}`],
    ["Most wins", `${Math.max(...d.map(x => x.wins))}`, d.filter(x => x.wins === Math.max(...d.map(z => z.wins))).map(x => x.name).join(", ")],
    ["Constructors' leader", teamLead.name, `${fmt(teamLead.points)} pts`],
  ].map(([l, v, s, hl]) => `<div class="card stat ${hl ? "hl" : ""}"><div class="label">${l}</div><div class="value">${esc(v)}</div><div class="small">${esc(s)}</div></div>`).join("");

  const P = F1.progress;
  const series = P.series.map(s => ({ name: s.code, values: s.pts }));
  $("#progressLegend").innerHTML = P.series.map((s, k) => `<span><i style="background:${SERIES[k]}"></i>${esc(F1.drivers.find(x => x.code === s.code)?.name || s.code)}</span>`).join("");
  lineChart($("#progressChart"), P.rounds, P.gps, series);
  tableViews.progressChart = simpleTable(["Round", ...P.series.map(s => s.code)], P.rounds.map((r, i) => [`${r} · ${esc(P.gps[i])}`, ...P.series.map(s => fmt(s.pts[i]))]));

  $("#driverTable").innerHTML = `<tr><th class="pos">#</th><th>Driver</th><th>Team</th><th class="num">Pts</th><th class="num">Wins</th><th class="num">Podiums</th></tr>` +
    d.slice(0, 12).map((x, i) => `<tr><td class="pos">${i + 1}</td><td><span class="swatch" style="background:${teamColor(x.team_id)}"></span>${esc(x.name)}</td><td style="color:var(--text-secondary)">${esc(x.team)}</td><td class="num"><b>${fmt(x.points)}</b></td><td class="num">${x.wins}</td><td class="num">${x.podiums}</td></tr>`).join("");

  hbar($("#teamChart"), F1.teams.map(t => ({ label: t.name, value: t.points })), { width: 520, rowH: 28 });
  tableViews.teamChart = simpleTable(["Team", "Points"], F1.teams.map(t => [esc(t.name), fmt(t.points)]));
}

/* ================= TEAMS ================= */
function renderTeams() {
  $("#teamsSub").textContent = `${F1.season - 1}–${F1.season} seasons combined (teams with at least 20 starts), pit stops for ${F1.season}.`;
  const craft = [...F1.craft].sort((a, b) => a.avg_finish - b.avg_finish);
  dumbbell($("#craftChart"), craft);
  tableViews.craftChart = simpleTable(["Team", "Avg grid", "Avg finish", "Places gained", "Starts"],
    craft.map(r => [esc(r.name), fmt(r.avg_grid, 1), fmt(r.avg_finish, 1), (r.pos_gained > 0 ? "+" : "") + fmt(r.pos_gained, 2), r.starts]));

  $("#pitTitle").textContent = `Pit-lane time, ${F1.season}`;
  const fastest = F1.pit[0].median_s;
  hbar($("#pitChart"), F1.pit.map((p, i) => ({
    label: p.name, value: +(p.median_s - fastest).toFixed(2), color: i === 0 ? "var(--series-1)" : "#5598e7",
    tip: `<div class='t-title'>${esc(p.name)}</div>` + row("Median pit-lane time", p.median_s.toFixed(2) + " s") + row("vs fastest", "+" + (p.median_s - fastest).toFixed(2) + " s") + row("Slow stops (90th pct)", p.p90_s.toFixed(2) + " s") + row("Stops", p.stops)
  })), { width: 520, rowH: 27, max: Math.max(0.5, F1.pit.at(-1).median_s - fastest), format: v => v === 0 ? `fastest · ${fastest.toFixed(2)}s` : "+" + v.toFixed(2) + "s" });
  tableViews.pitChart = simpleTable(["Team", "Median (s)", "90th pct (s)", "Stops"], F1.pit.map(p => [esc(p.name), p.median_s.toFixed(2), p.p90_s.toFixed(2), p.stops]));

  const dnf = [...F1.craft].sort((a, b) => a.dnf_rate - b.dnf_rate);
  hbar($("#dnfChart"), dnf.map(r => ({ label: r.name, value: r.dnf_rate, tip: `<div class='t-title'>${esc(r.name)}</div>` + row("Retired", pct(r.dnf_rate, 1)) + row("Starts", r.starts) })),
    { width: 520, rowH: 27, format: v => pct(v, 1) });
  tableViews.dnfChart = simpleTable(["Team", "Retirement rate", "Starts"], dnf.map(r => [esc(r.name), pct(r.dnf_rate, 1), r.starts]));
}

/* ================= DRIVERS ================= */
let consSort = { key: "avg_finish", dir: 1 };
function renderDrivers() {
  $("#driversSub").textContent = `${F1.season} season, drivers with at least ${Math.max(5, Math.floor(F1.last_round / 2))} starts.`;
  const cols = [["name", "Driver", false], ["starts", "Starts", true], ["avg_finish", "Avg finish", true], ["sd_finish", "Spread", true], ["pos_gained", "Places gained / race", true], ["dnfs", "DNFs", true]];
  const rows = [...F1.consistency].sort((a, b) => {
    const A = a[consSort.key], B = b[consSort.key];
    return (typeof A === "string" ? A.localeCompare(B) : (A ?? 99) - (B ?? 99)) * consSort.dir;
  });
  $("#consTable").innerHTML = `<tr>${cols.map(([k, t, n]) => `<th class="sortable ${n ? "num" : ""}" data-k="${k}">${t}${consSort.key === k ? (consSort.dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}</tr>` +
    rows.map(r => `<tr><td><span class="swatch" style="background:${teamColor(r.team_id)}"></span>${esc(r.name)}</td><td class="num">${r.starts}</td><td class="num">${fmt(r.avg_finish, 1)}</td><td class="num">${fmt(r.sd_finish, 1)}</td><td class="num">${r.pos_gained > 0 ? "+" : ""}${fmt(r.pos_gained, 1)}</td><td class="num">${r.dnfs}</td></tr>`).join("");
  $("#consTable").querySelectorAll("th").forEach(th => th.onclick = () => {
    const k = th.dataset.k; consSort = { key: k, dir: consSort.key === k ? -consSort.dir : 1 }; renderDrivers();
  });
}

/* ================= MODEL ================= */
const M = F1.model;
function podiumProb(grid, gap, driverForm, teamForm) {
  const x = [Math.log(grid), Math.min(gap, 5), driverForm, teamForm];
  const z = M.intercept + x.reduce((s, v, i) => s + M.coef[i] * (v - M.mean[i]) / M.scale[i], 0);
  return 1 / (1 + Math.exp(-z));
}
function renderModel() {
  $("#modelSub").textContent = `Logistic regression. Trained on ${M.train} (${fmt(M.train_rows)} driver-races), tested on ${M.test}: ${M.test_races} races it never saw.`;
  $("#versusDesc").textContent = `For each of the ${M.test_races} test races, both methods named three drivers. How many of the ${M.places} real podium places did each get right?`;
  $("#hitsModel").textContent = M.hits_model;
  $("#hitsGrid").textContent = M.hits_grid;
  $("#versusNote").textContent = `${pct(M.hits_model / M.places, 1)} vs ${pct(M.hits_grid / M.places, 1)} correct. A real but modest gain: starting position already carries most of the signal.`;

  const names = { log_grid: "Starting position (log)", quali_gap_pct: "Qualifying gap to pole", driver_form: "Driver form (last 3)", team_form: "Team form (last 3)" };
  const w = M.features.map((f, i) => ({ f, w: M.coef[i] })).sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
  hbar($("#weightChart"), w.map(x => ({
    label: names[x.f], value: Math.abs(x.w), color: "var(--series-1)",
    tip: `<div class='t-title'>${names[x.f]}</div>` + row("Weight", x.w.toFixed(2)) + row("Effect", x.w < 0 ? "higher value → lower podium chance" : "higher value → higher podium chance")
  })), { width: 520, rowH: 34, format: v => v.toFixed(2) });
  $("#weightChart svg").insertAdjacentHTML("afterend", `<p class="note">Starting position and qualifying gap lower the chance as they grow; form raises it.</p>`);

  $("#metricStats").innerHTML = [
    ["Ranking quality (AUC)", M.auc_model.toFixed(3), `grid rule alone: ${M.auc_grid.toFixed(3)} · 1.0 = perfect`],
    ["Probability error (log loss)", M.logloss_model.toFixed(3), `grid-only model: ${M.logloss_grid.toFixed(3)} · lower is better`],
    ["Test set", `${M.test_races} races`, `${fmt(M.test_rows)} driver-races, never used in training`],
  ].map(([l, v, s]) => `<div class="card stat"><div class="label">${l}</div><div class="value">${v}</div><div class="small">${s}</div></div>`).join("");

  // calculator
  const sel = $("#calcDriver");
  sel.innerHTML = F1.calculator.map((c, i) => `<option value="${i}">${esc(c.name)} · ${esc(c.team)}</option>`).join("");
  const update = () => {
    const c = F1.calculator[sel.value], g = +$("#calcGrid").value, gap = +$("#calcGap").value;
    $("#gridOut").textContent = "P" + g; $("#gapOut").textContent = gap.toFixed(2) + "%";
    const p = podiumProb(g, gap, c.driver_form, c.team_form);
    $("#calcPct").textContent = Math.round(p * 100) + "%";
    $("#calcBar").style.width = (p * 100).toFixed(1) + "%";
    $("#calcNote").textContent = `${c.name}: ${fmt(c.driver_form, 1)} pts/race recently; ${c.team}: ${fmt(c.team_form, 1)} pts per car. A pole-sitter is usually 0% behind; P10 is often 0.5–1% behind.`;
  };
  ["#calcDriver", "#calcGrid", "#calcGap"].forEach(s => $(s).addEventListener("input", update));
  update();

  // backtest explorer
  const bt = $("#btRace");
  bt.innerHTML = [...F1.backtest].reverse().map((r, i) => `<option value="${F1.backtest.length - 1 - i}">${r.year} R${r.round} · ${esc(r.gp)}</option>`).join("");
  const showRace = () => {
    const r = F1.backtest[bt.value];
    $("#btPicks").innerHTML = r.picks.map(([code, grid, p, hit]) => `<li><span>${hit ? '<span class="yes">✓</span>' : '<span class="no">·</span>'} ${esc(code)} <span class="meta">from P${grid}</span></span><span class="meta">${Math.round(p * 100)}%</span></li>`).join("");
    $("#btPodium").innerHTML = r.podium.map(([code, grid], i) => `<li><span>P${i + 1} ${esc(code)}</span><span class="meta">started P${grid}</span></li>`).join("");
  };
  bt.addEventListener("input", showRace); showRace();

  // wins by grid
  const wg = Object.entries(F1.wins_by_grid), total = wg.reduce((s, [, v]) => s + v, 0);
  $("#winGridDesc").textContent = `Where the ${total} race winners since ${F1.seasons.slice(0, 4)} started. ${pct(F1.wins_by_grid["1"] / total)} of races were won from pole.`;
  vbar($("#winGridChart"), wg.map(([k, v]) => ({ label: k === "11+" ? "P11+" : "P" + k, value: v, tip: `<div class='t-title'>Started ${k === "11+" ? "P11 or lower" : "P" + k}</div>` + row("Wins", v) + row("Share", pct(v / total, 1)) })),
    { width: 520, highlight: 0 });
  tableViews.winGridChart = simpleTable(["Grid", "Wins", "Share"], wg.map(([k, v]) => ["P" + k, v, pct(v / total, 1)]));

  $("#calibTable").innerHTML = `<tr><th>Model said</th><th class="num">Driver-races</th><th class="num">Avg predicted</th><th class="num">Actually podium</th></tr>` +
    F1.calibration.map(c => `<tr><td>${c.range}</td><td class="num">${c.n}</td><td class="num">${pct(c.pred)}</td><td class="num">${pct(c.actual)}</td></tr>`).join("");
}

/* ================= ABOUT / FOOTER ================= */
function renderAbout() {
  $("#aboutData").textContent = `${fmt(F1.n_rows)} driver results from ${fmt(F1.n_races)} Grands Prix (${F1.seasons}), plus every pit stop, reshaped into two tables: f1_results.csv and f1_pit_stops.csv.`;
  $("#footerData").textContent = `Data through ${F1.last_gp} GP, ${F1.updated} · Source: F1DB (CC BY 4.0)`;
}

/* ================= TABS ================= */
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === t));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === t.dataset.tab));
  history.replaceState(null, "", "#" + t.dataset.tab);
}));
const start = location.hash.slice(1);
if (start && document.getElementById(start)) document.querySelector(`.tab[data-tab="${start}"]`)?.click();

renderSeason(); renderTeams(); renderDrivers(); renderModel(); renderAbout();
