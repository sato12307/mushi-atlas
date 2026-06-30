/* ムシアトラス 静的デモ。サーバ不要・全部ブラウザ内。
   集合分布図(canvas)・産地の選択的粗化・記録の公表・共有カード生成・初記録バッジを再現。 */
"use strict";

const SP = MUSHI_DATA.species;
const PREFS = MUSHI_DATA.prefs;
let RECORDS = MUSHI_DATA.records.slice();   // セッション内で追加可
let nextId = Math.max(...RECORDS.map(r => r.id), 0) + 1;

let group = "butterfly";
let curSid = null;

const $ = sel => document.querySelector(sel);
const spById = id => SP.find(s => s.id === id);

// ---- 産地の選択的開示（Pythonの geo.py と同じロジック）----
const ORDER = ["precise", "city", "pref", "hidden"];
function effectiveDisclosure(sp, req) {
  req = ORDER.includes(req) ? req : "pref";
  if (sp.protected) return "hidden";
  if (sp.redlist && ORDER.indexOf(req) < ORDER.indexOf("pref")) return "pref";
  return req;
}
function regionOf(pref) { return PREFS[pref] ? PREFS[pref].region : "不明"; }
function publicPoint(rec, sp) {
  const eff = effectiveDisclosure(sp, rec.disclosure);
  if (eff === "hidden") return null;
  const p = PREFS[rec.pref];
  if (!p) return null;
  // 県代表点に決定論ジッタ（重なり回避）
  const j = (rec.id % 7 - 3) * 0.12, k = ((rec.id * 3) % 7 - 3) * 0.12;
  return { lat: p.lat + k, lon: p.lon + j };
}
function placeLabel(rec, sp) {
  const eff = effectiveDisclosure(sp, rec.disclosure);
  if (eff === "hidden") return regionOf(rec.pref) + "（保護種・地点非公開）";
  if (eff === "pref") return rec.pref + (sp.redlist ? "（県のみ・粗化）" : "");
  return rec.pref;
}

// ---- 年代色（Pythonと同じ）----
function decadeColor(y) {
  if (!y) return "#999";
  if (y < 1980) return "#2c5fa8";
  if (y < 1995) return "#3aa0c8";
  if (y < 2010) return "#7cc36b";
  if (y < 2020) return "#f0a13a";
  return "#e23c3c";
}
const DECADES = [["〜1979", "#2c5fa8"], ["1980-94", "#3aa0c8"], ["1995-2009", "#7cc36b"], ["2010-19", "#f0a13a"], ["2020-", "#e23c3c"]];

// ---- 初記録（県ごと最古）----
function prefFirsts(sid) {
  const m = {};
  RECORDS.filter(r => r.sid === sid && r.year).forEach(r => {
    if (!m[r.pref] || r.year < m[r.pref].year || (r.year === m[r.pref].year && r.id < m[r.pref].id)) m[r.pref] = r;
  });
  const out = {}; Object.values(m).forEach(r => out[r.id] = r.pref); return out;
}
function badgesFor(rec) {
  const sp = spById(rec.sid); const out = [];
  if (prefFirsts(rec.sid)[rec.id]) out.push({ t: rec.pref + " 初記録", c: "first" });
  if (sp.range_shift) out.push({ t: "分布シフト記録", c: "shift" });
  if (sp.redlist) out.push({ t: "希少種記録（産地粗化）", c: "" });
  return out;
}
function frontier(sid) {
  let best = null;
  RECORDS.filter(r => r.sid === sid).forEach(r => {
    const p = PREFS[r.pref]; if (!p) return;
    if (!best || p.lat > best.lat) best = { rec: r, lat: p.lat };
  });
  return best ? best.rec : null;
}

// ---- 地図描画（canvas、大・ミニ共用）----
function project(lat, lon, x, y, w, h) {
  const px = x + (lon - 126) / (146 - 126) * w;
  const py = y + (46 - lat) / (46 - 30) * h;
  return [px, py];
}
function drawMap(ctx, x, y, w, h, sid, highlightId, opts) {
  opts = opts || {};
  ctx.fillStyle = "#ffffff"; ctx.fillRect(x, y, w, h);
  // 下地：都道府県点（日本列島の形）
  ctx.fillStyle = "#dddddd";
  for (const p in PREFS) { const [px, py] = project(PREFS[p].lat, PREFS[p].lon, x, y, w, h); ctx.beginPath(); ctx.arc(px, py, Math.max(1.5, w / 200), 0, 7); ctx.fill(); }
  // 記録
  let hidden = 0;
  RECORDS.filter(r => r.sid === sid).forEach(r => {
    const sp = spById(sid); const pt = publicPoint(r, sp);
    if (!pt) { hidden++; return; }
    const [px, py] = project(pt.lat, pt.lon, x, y, w, h);
    const hi = r.id === highlightId;
    ctx.beginPath(); ctx.arc(px, py, hi ? w / 45 : w / 80, 0, 7);
    ctx.fillStyle = decadeColor(r.year);
    ctx.fill();
    ctx.lineWidth = hi ? 3 : 1; ctx.strokeStyle = hi ? "#000" : "#fff"; ctx.stroke();
  });
  if (opts.title) { ctx.fillStyle = "#222"; ctx.font = `${Math.round(w / 26)}px 'Yu Gothic UI','Meiryo',sans-serif`; ctx.fillText(opts.title, x + 8, y + w / 22); }
  if (opts.legend) {
    const used = new Set(RECORDS.filter(r => r.sid === sid).map(r => { const t = r.year; return t < 1980 ? 0 : t < 1995 ? 1 : t < 2010 ? 2 : t < 2020 ? 3 : 4; }));
    let ly = y + h - 8 - DECADES.length * 16;
    DECADES.forEach((d, i) => { if (!used.has(i)) return; ctx.fillStyle = d[1]; ctx.beginPath(); ctx.arc(x + 14, ly, 5, 0, 7); ctx.fill(); ctx.fillStyle = "#333"; ctx.font = "12px sans-serif"; ctx.fillText(d[0], x + 24, ly + 4); ly += 16; });
  }
  if (opts.hiddenNote && hidden) { ctx.fillStyle = "#999"; ctx.font = "11px sans-serif"; ctx.fillText("※保護種等で非公開: " + hidden + "件", x + 8, y + h - 6); }
  return hidden;
}

// ---- UI ----
function renderSpeciesList() {
  const q = ($("#spsearch") && $("#spsearch").value.trim().toLowerCase()) || "";
  let list = SP.filter(s => s.group === group);
  if (q) list = list.filter(s => (s.wamei || "").toLowerCase().includes(q) || (s.gakumei || "").toLowerCase().includes(q));
  list = list.sort((a, b) => (b.range_shift - a.range_shift) || (b.redlist - a.redlist) || (b.count - a.count));
  const el = $("#splist"); el.innerHTML = "";
  list.forEach(s => {
    const cnt = RECORDS.filter(r => r.sid === s.id).length;
    const d = document.createElement("div");
    d.className = "sp" + (s.id === curSid ? " on" : "");
    d.innerHTML = `<div class="n">${s.wamei}
      ${s.range_shift ? '<span class="tag shift">北上中</span>' : ''}
      ${s.protected ? '<span class="tag prot">保護種</span>' : (s.redlist ? '<span class="tag red">希少</span>' : '')}</div>
      <div class="g">${s.gakumei} ・ ${cnt}件</div>`;
    d.onclick = () => { curSid = s.id; renderSpeciesList(); renderSpecies(); };
    el.appendChild(d);
  });
  if (!list.find(s => s.id === curSid)) { curSid = list[0] ? list[0].id : null; }
}

function renderSpecies() {
  if (!curSid) return;
  const sp = spById(curSid);
  const cv = $("#map"); const ctx = cv.getContext("2d");
  cv.width = 520; cv.height = 620;
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = "#222"; ctx.font = "17px 'Yu Gothic UI','Meiryo',sans-serif";
  ctx.fillText(sp.wamei + " の分布記録" + (sp.range_shift ? "（北上を年代色で）" : ""), 10, 24);
  drawMap(ctx, 10, 34, 500, 560, curSid, null, { legend: true, hiddenNote: true });

  const recs = RECORDS.filter(r => r.sid === curSid);
  const fr = frontier(curSid);
  const have = new Set(recs.map(r => r.pref));
  const gaps = Object.keys(PREFS).filter(p => !have.has(p));
  $("#sidepanel").innerHTML =
    `<h3 style="margin-top:0">${sp.wamei} <span class="gaku">${sp.gakumei}</span></h3>
     ${sp.protected ? '<div class="badge" style="background:#7a1020;color:#fff">種の保存法・保護種＝地点強制非公開</div>' : (sp.redlist ? '<div class="badge red" style="background:#b13;color:#fff">レッドリスト種＝県まで自動粗化</div>' : '')}
     ${fr ? `<p class="frontier">📍 分布前線：${fr.pref}（${fr.year || '年不明'}・${fr.src === 'gbif' ? '公開記録' : '@' + fr.user}）</p>` : ''}
     <p class="gap">記録${recs.length}件 ／ 空白の県：${gaps.slice(0, 6).join("、")}${gaps.length > 6 ? ` ほか${gaps.length - 6}` : ''}</p>
     <div class="reclist">${recs.slice().sort((a, b) => (a.year || 0) - (b.year || 0)).map(r => {
      const bs = badgesFor(r).map(b => `<span class="badge ${b.c}">${b.t}</span>`).join("");
      const who = r.src === "gbif" ? '<span class="gaku">（公開記録）</span>' : `<span class="gaku">@${r.user}</span>`;
      return `<div>${r.year || "—"} ${placeLabel(r, sp)} ${who} ${bs}</div>`;
    }).join("")}</div>`;

  // フォームの種を同期
  $("#f_species").value = sp.wamei;
}

function publishRecord(e) {
  e.preventDefault();
  const sp = SP.find(s => s.wamei === $("#f_species").value.trim()) || spById(curSid);
  const rec = {
    id: nextId++, sid: sp.id, pref: $("#f_pref").value,
    year: parseInt($("#f_year").value) || null, user: ($("#f_handle").value.trim() || "guest"),
    disclosure: $("#f_disc").value,
  };
  if (!rec.pref) { alert("都道府県を選んでください"); return; }
  RECORDS.push(rec);
  curSid = sp.id;
  renderSpeciesList(); renderSpecies(); renderLeaders();
  renderCard(rec);
  $("#cardout").scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderCard(rec) {
  const sp = spById(rec.sid);
  const cv = document.createElement("canvas");
  cv.width = 1200; cv.height = 630;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#0f1b2d"; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "#163a5f"; ctx.fillRect(0, 0, 1200, 64);
  ctx.fillStyle = "#cfe6ff"; ctx.font = "28px 'Yu Gothic UI','Meiryo',sans-serif";
  ctx.fillText("ムシアトラス  —  飛ぶ虫の分布シフト", 28, 42);
  // 写真枠
  ctx.strokeStyle = "#3b5f86"; ctx.lineWidth = 3; ctx.strokeRect(40, 96, 430, 444);
  ctx.fillStyle = "#13243b"; ctx.fillRect(42, 98, 426, 440);
  ctx.fillStyle = "#5a7ba0"; ctx.font = "32px 'Yu Gothic UI','Meiryo',sans-serif";
  ctx.fillText("［ 標本写真 ］", 150, 330);
  // 見出し
  ctx.fillStyle = "#fff"; ctx.font = "62px 'Yu Gothic UI','Meiryo',sans-serif"; ctx.fillText(sp.wamei, 500, 168);
  ctx.fillStyle = "#9fc0e6"; ctx.font = "italic 32px 'Yu Gothic UI','Meiryo',sans-serif"; ctx.fillText(sp.gakumei, 502, 212);
  ctx.fillStyle = "#e7f0fb"; ctx.font = "27px 'Yu Gothic UI','Meiryo',sans-serif";
  ctx.fillText(`${placeLabel(rec, sp)} / ${rec.year || "----"}年`, 500, 262);
  // バッジ
  let by = 296;
  badgesFor(rec).slice(0, 3).forEach(b => {
    const col = b.c === "first" ? "#e23c3c" : (b.c === "shift" ? "#f0a13a" : "#6fa8dc");
    ctx.font = "23px 'Yu Gothic UI','Meiryo',sans-serif";
    const w = ctx.measureText(b.t).width + 28;
    ctx.fillStyle = col; roundRect(ctx, 500, by, w, 38, 9); ctx.fill();
    ctx.fillStyle = b.c === "shift" ? "#1a1300" : "#fff"; ctx.fillText(b.t, 514, by + 27);
    by += 48;
  });
  // ミニ分布図
  drawMap(ctx, 840, 300, 330, 300, rec.sid, rec.id, {});
  ctx.strokeStyle = "#3b5f86"; ctx.strokeRect(840, 300, 330, 300);
  // フッタ
  ctx.fillStyle = "#9fc0e6"; ctx.font = "23px 'Yu Gothic UI','Meiryo',sans-serif";
  ctx.fillText(`記録者: @${rec.user}    #ムシアトラス  地図を埋めよう`, 500, 596);

  const out = $("#cardout");
  out.innerHTML = "<h3>✓ 公表しました — 共有カード</h3><p class='muted'>このカードをXや同好会に貼ると、見た人が地図の空白を埋めに来ます（自己拡散ループ）。</p>";
  out.appendChild(cv);
  const a = document.createElement("a");
  a.className = "btn"; a.textContent = "カードをダウンロード"; a.style.marginTop = "10px";
  a.href = cv.toDataURL("image/png"); a.download = `mushi_${sp.wamei}_${rec.pref}.png`;
  out.appendChild(document.createElement("br")); out.appendChild(a);
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

function renderLeaders() {
  // 公開記録(GBIFベースライン)は除き、ユーザーの貢献だけを集計＝堀になる"記録者の網"
  const users = {};
  RECORDS.filter(r => r.src !== "gbif").forEach(r => {
    const u = users[r.user] || (users[r.user] = { records: 0, species: new Set(), first: 0 });
    u.records++; u.species.add(r.sid);
  });
  Object.keys(users).forEach(h => {
    SP.forEach(s => { const f = prefFirsts(s.id); RECORDS.filter(r => r.user === h && r.src !== "gbif" && f[r.id]).forEach(() => users[h].first++); });
  });
  const rows = Object.entries(users).map(([h, u]) => ({ h, records: u.records, species: u.species.size, first: u.first }))
    .sort((a, b) => (b.first - a.first) || (b.records - a.records)).slice(0, 12);
  const tb = $("#leaders tbody");
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="5" class="muted" style="padding:14px">まだ記録者がいません。下のフォームから<b>最初の貢献者</b>になりましょう — あなたの名前がここに最初に刻まれます。</td></tr>`;
    return;
  }
  tb.innerHTML = rows.map((r, i) =>
    `<tr><td>${i + 1}</td><td>@${r.h}</td><td class="hi">${r.first}</td><td>${r.records}</td><td>${r.species}</td></tr>`).join("");
}

function initForm() {
  $("#f_pref").innerHTML = '<option value="">都道府県</option>' + Object.keys(PREFS).map(p => `<option>${p}</option>`).join("");
  const dl = $("#f_specieslist");
  dl.innerHTML = SP.map(s => `<option value="${s.wamei}">${s.gakumei}</option>`).join("");
  $("#pubform").addEventListener("submit", publishRecord);
  const sb = $("#spsearch");
  if (sb) sb.addEventListener("input", () => { renderSpeciesList(); renderSpecies(); });
}

document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => {
  group = b.dataset.g; curSid = null;
  document.querySelectorAll(".tabs button").forEach(x => x.classList.toggle("on", x === b));
  renderSpeciesList(); renderSpecies();
});

initForm();
renderSpeciesList();
renderSpecies();
renderLeaders();
