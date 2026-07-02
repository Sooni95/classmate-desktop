/* ============================================================
   ClassMate — 사다리타기 모듈 (ladder.js)
   - app.js 이후에 로드됩니다 (전역 헬퍼에만 의존).
   - 의존 전역: makeDrag, centerOnDockDisplay, setIgnore, splitNames, beep, setPanel, window.cm
     (모두 typeof 가드 → 없으면 조용히 생략, 앱 중단 없음)
   - 진입점: window.openLadder()
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const LCOL = ['#F68C1F', '#5b8def', '#37c871', '#e84d3d', '#a78bfa', '#ffc02e',
                '#4dd0e1', '#ff8a65', '#ba68c8', '#aed581', '#90a4ae', '#f06292'];
  const LPAD = 22, LTOP = 12, MINN = 2, MAXN = 24;

  const wrap = $('ladderWrap');
  if (!wrap) { window.openLadder = function () {}; return; } // 마크업 없으면 비활성
  const cv = $('ladderCv');
  const ctx = cv ? cv.getContext('2d') : null;

  // ---------- 상태 (단일 소스) ----------
  // S = { n, rows, rungs[], names[], results[], revealed, busy, traces[] }
  let S = null;
  let rafId = 0;      // 애니메이션 RAF는 항상 이 하나만
  let lCount = 6;     // step1 인원 선택값
  let resizeT = 0;

  // ---------- 유틸 ----------
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function cancelAnim() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (S) S.busy = false;
    setBusyUI(false);
  }
  function setBusyUI(b) {
    wrap.classList.toggle('lbusy', !!b);
    const info = $('ladderInfo');
    if (info) info.textContent = b ? '경로 따라가는 중…' : (S ? S.n + '명' : '');
  }
  function showStep(n) {
    [1, 2, 3, 4].forEach(i => { const el = $('lstep' + i); if (el) el.classList.toggle('on', i === n); });
  }
  function inStep(n) { const el = $('lstep' + n); return !!(el && el.classList.contains('on')); }

  // ---------- 진입 / 종료 ----------
  function openLadder() {
    try { if (typeof setPanel === 'function') setPanel(null); } catch (_) {}
    cancelAnim();
    wrap.classList.add('on');
    try { if (typeof setIgnore === 'function') setIgnore(false); } catch (_) {}
    lCount = 6;
    const num = $('lcNum'); if (num) num.textContent = lCount;
    showStep(1);
    // 창이 배치된 다음 프레임에 독 모니터 중앙으로
    requestAnimationFrame(() => { try { if (typeof centerOnDockDisplay === 'function') centerOnDockDisplay(wrap); } catch (_) {} });
  }
  function closeLadder() { cancelAnim(); wrap.classList.remove('on'); }
  window.openLadder = openLadder;

  // ---------- 헤더 드래그 ----------
  try {
    if (typeof makeDrag === 'function' && $('ladderHead')) {
      makeDrag($('ladderHead'), (e, s) => {
        if (!s) { const r = wrap.getBoundingClientRect(); return { dx: e.clientX - r.left, dy: e.clientY - r.top }; }
        wrap.style.left = (e.clientX - s.dx) + 'px';
        wrap.style.top = (e.clientY - s.dy) + 'px';
      }, e => e.target.id === 'ladderClose');
    }
  } catch (_) {}
  on('ladderClose', 'click', closeLadder);

  // ---------- Step 1: 인원 설정 ----------
  on('lcMinus', 'click', () => { lCount = Math.max(MINN, lCount - 1); const n = $('lcNum'); if (n) n.textContent = lCount; });
  on('lcPlus', 'click', () => { lCount = Math.min(MAXN, lCount + 1); const n = $('lcNum'); if (n) n.textContent = lCount; });
  on('lstart1', 'click', () => {
    let names = null;
    try {
      const ur = $('ladderUseRoster');
      if (ur && ur.checked && typeof splitNames === 'function') {
        const nl = $('nameList');
        const r = splitNames((nl && nl.value) || '');
        if (r && r.length) { names = r.slice(0, MAXN); lCount = clamp(names.length, MINN, MAXN); }
      }
    } catch (_) {}
    build(lCount, names);
    renderInputs();
    showStep(2);
  });

  // ---------- Step 2: 이름·결과 입력 ----------
  on('lback2', 'click', () => { cancelAnim(); showStep(1); });
  on('lstart2', 'click', () => {
    if (!S) return;
    for (let i = 0; i < S.n; i++) { if (!S.names[i] || !S.names[i].trim()) S.names[i] = '참가' + (i + 1); }
    S.revealed = true; S.traces = [];
    showStep(3);
    requestAnimationFrame(() => { sizeCanvas(); renderLabels(); draw(); });
  });

  // ---------- Step 3: 사다리 ----------
  on('lback3', 'click', () => {                 // 새 사다리 (가로줄 재배치)
    if (!S || S.busy) return;
    S.rungs = genRungs(S.n, S.rows);
    S.traces = [];
    draw();
  });
  on('lstart3', 'click', showAllResults);

  // ---------- Step 4: 전체 결과 ----------
  on('lback4', 'click', () => { showStep(3); requestAnimationFrame(() => { sizeCanvas(); renderLabels(); draw(); }); });
  on('lrestart', 'click', () => { cancelAnim(); showStep(1); });

  // ---------- 사다리 생성 ----------
  function build(n, names) {
    cancelAnim();
    n = clamp((n | 0) || 6, MINN, MAXN);
    const rows = Math.max(8, n + 3);
    S = {
      n, rows,
      rungs: genRungs(n, rows),
      names: Array.from({ length: n }, (_, i) => (names && names[i]) || ''),
      results: Array.from({ length: n }, () => ''),
      revealed: false, busy: false, traces: []
    };
    const info = $('ladderInfo'); if (info) info.textContent = n + '명';
  }
  // 인접 칸 가로줄 겹침을 막아 항상 "유효한" 사다리를 생성 (교차 불가 방지)
  function genRungs(n, rows) {
    const rungs = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < n - 1; c++) {
        if (Math.random() < 0.42 && !rungs.some(g => g.row === r && (g.col === c - 1 || g.col === c + 1))) {
          rungs.push({ row: r, col: c });
        }
      }
    }
    // 순전히 랜덤이라 가로줄이 한 개도 안 나오는 경우가 있음(특히 2명일 때 ~1.4% 확률) —
    // 그러면 사다리가 그냥 일직선이 돼버려 게임이 의미 없어지므로, 최소 1개는 보장
    if (rungs.length === 0 && n >= 2) {
      rungs.push({ row: Math.floor(Math.random() * rows), col: Math.floor(Math.random() * (n - 1)) });
    }
    return rungs;
  }

  // ---------- 입력/라벨 렌더 ----------
  function renderInputs() {
    const tops = $('lInTops'), bots = $('lInBots');
    if (!tops || !bots || !S) return;
    tops.innerHTML = ''; bots.innerHTML = '';
    for (let c = 0; c < S.n; c++) {
      const ti = document.createElement('input');
      ti.className = 'iv'; ti.maxLength = 8; ti.value = S.names[c] || ''; ti.placeholder = '이름' + (c + 1);
      ti.addEventListener('input', () => { S.names[c] = ti.value; });
      tops.appendChild(ti);
      const bi = document.createElement('input');
      bi.className = 'iv'; bi.maxLength = 8; bi.value = S.results[c] || ''; bi.placeholder = '결과' + (c + 1);
      bi.addEventListener('input', () => { S.results[c] = bi.value; });
      bots.appendChild(bi);
    }
  }
  function renderLabels() {
    const tops = $('lTops'), bots = $('lBots');
    if (!tops || !bots || !S) return;
    tops.innerHTML = ''; bots.innerHTML = '';
    for (let c = 0; c < S.n; c++) {
      const t = document.createElement('button');
      t.className = 'llab'; t.type = 'button';
      t.textContent = S.names[c] || ('참가' + (c + 1)); t.title = t.textContent;
      t.style.color = LCOL[c % LCOL.length];
      t.addEventListener('click', () => traceFrom(c));
      tops.appendChild(t);
      const b = document.createElement('button');
      b.className = 'llab lbot'; b.type = 'button';
      b.textContent = S.results[c] || ('결과' + (c + 1)); b.title = b.textContent;
      b.addEventListener('click', () => traceToResult(c));
      bots.appendChild(b);
    }
  }

  // ---------- 캔버스 좌표 ----------
  function sizeCanvas() {
    if (!cv) return;
    cv.width = Math.max(200, (wrap.clientWidth || 600) - 32);
    cv.height = 260;
  }
  const colX = (c) => cv.width * (c + 0.5) / S.n;
  const topY = () => LTOP;
  const botY = () => cv.height - LTOP;
  const rowY = (r) => topY() + (r + 1) * (botY() - topY()) / (S.rows + 1);

  // 시작 열 c → 최종 열, 경로 좌표들 (순수 함수: rungs만 참조 → 결과 항상 일관)
  function pathFor(c) {
    let col = c;
    const pts = [{ x: colX(col), y: topY() }];
    for (let r = 0; r < S.rows; r++) {
      const y = rowY(r);
      pts.push({ x: colX(col), y });
      const left = S.rungs.some(g => g.row === r && g.col === col - 1);
      const right = S.rungs.some(g => g.row === r && g.col === col);
      if (right) { col++; pts.push({ x: colX(col), y }); }
      else if (left) { col--; pts.push({ x: colX(col), y }); }
    }
    pts.push({ x: colX(col), y: botY() });
    return { endCol: col, pts };
  }

  // ---------- 그리기 (에러 격리) ----------
  function draw(extra) {
    if (!ctx || !cv || !S) return;
    try {
      const W = cv.width, H = cv.height;
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#141b22'); bg.addColorStop(1, '#0e1318');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.lineCap = 'round'; ctx.globalAlpha = 1;
      ctx.strokeStyle = '#46586b';
      ctx.lineWidth = Math.max(2, Math.min(4, W / (S.n * 12)));
      for (let c = 0; c < S.n; c++) { ctx.beginPath(); ctx.moveTo(colX(c), topY()); ctx.lineTo(colX(c), botY()); ctx.stroke(); }
      if (S.revealed) {
        S.rungs.forEach(g => { const y = rowY(g.row); ctx.beginPath(); ctx.moveTo(colX(g.col), y); ctx.lineTo(colX(g.col + 1), y); ctx.stroke(); });
      }
      const paths = (S.traces || []).concat(extra ? [extra] : []);
      paths.forEach(h => {
        if (!h || !h.pts || !h.pts.length) return;
        ctx.save();
        ctx.strokeStyle = h.col; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.shadowColor = h.col; ctx.shadowBlur = 12;
        ctx.beginPath();
        h.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.stroke(); ctx.restore();
      });
    } catch (err) { /* 캔버스 오류가 앱을 멈추지 않도록 격리 */ }
  }

  // ---------- 애니메이션 (항상 단일 RAF, 진행 중 입력 차단) ----------
  function animate(path) {
    cancelAnim();                       // 이전 애니메이션을 반드시 취소 → 중첩 불가
    if (!S || !path || !path.pts || path.pts.length < 2) return;
    S.busy = true; setBusyUI(true);
    let prog = 0, last = performance.now();
    const segs = Math.max(1, path.pts.length - 1);
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      prog += dt * 1.4;
      const upto = Math.min(segs, prog * segs);
      const seg = Math.floor(upto), frac = upto - seg;
      const drawn = path.pts.slice(0, seg + 1).map(p => ({ x: p.x, y: p.y }));
      if (seg < segs) { const a = path.pts[seg], b = path.pts[seg + 1]; drawn.push({ x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac }); }
      draw({ col: path.col, pts: drawn });
      if (prog < 1) { rafId = requestAnimationFrame(frame); }
      else {
        rafId = 0; S.busy = false; setBusyUI(false);
        S.traces.push({ col: path.col, pts: path.pts, startCol: path.startCol, endCol: path.endCol });
        draw();
        try { if (typeof beep === 'function') beep(1); } catch (_) {}
      }
    };
    rafId = requestAnimationFrame(frame);
  }

  // ---------- 추적 (단일 진입점 → traceFrom/traceToResult 충돌 제거) ----------
  function traceFrom(c) {
    if (!S || S.busy) return;                    // 진행 중이면 무시 (빠른 연타 안전)
    if (c < 0 || c >= S.n) return;
    const idx = (S.traces || []).findIndex(t => t.startCol === c);
    if (idx >= 0) { S.traces.splice(idx, 1); draw(); return; }  // 같은 줄 재클릭 → 경로 해제(토글)
    const { endCol, pts } = pathFor(c);
    animate({ startCol: c, endCol, pts, col: LCOL[c % LCOL.length] });
  }
  function traceToResult(rc) {
    if (!S || S.busy) return;
    if (rc < 0 || rc >= S.n) return;
    for (let s = 0; s < S.n; s++) { if (pathFor(s).endCol === rc) { traceFrom(s); return; } }
  }

  // ---------- 전체 결과 ----------
  function showAllResults() {
    if (!S || S.busy) return;
    const list = $('lAllResult');
    if (!list) return;
    list.innerHTML = '';
    for (let c = 0; c < S.n; c++) {
      const { endCol } = pathFor(c);
      const row = document.createElement('div');
      row.className = 'lares';
      const b = document.createElement('b'); b.style.color = LCOL[c % LCOL.length];
      b.textContent = S.names[c] || ('참가' + (c + 1));
      const ar = document.createElement('span'); ar.className = 'lar-arrow'; ar.textContent = '→';
      const rr = document.createElement('span'); rr.className = 'lar-res';
      rr.textContent = S.results[endCol] || ('결과' + (endCol + 1));
      row.appendChild(b); row.appendChild(ar); row.appendChild(rr);
      list.appendChild(row);
    }
    showStep(4);
  }

  // ---------- 리사이즈 / 멀티모니터 재배치 ----------
  function onWindowResize() {
    if (!wrap.classList.contains('on')) return;
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (inStep(3)) { sizeCanvas(); draw(); } }, 150);
  }
  function onBounds() { // 모니터 추가/제거 → 스트랜딩 방지: 재배치 + 캔버스 재계산
    if (!wrap.classList.contains('on')) return;
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      try { if (typeof centerOnDockDisplay === 'function') centerOnDockDisplay(wrap); } catch (_) {}
      if (inStep(3)) { sizeCanvas(); draw(); }
    }, 180);
  }
  window.addEventListener('resize', onWindowResize);
  try { if (window.cm && typeof window.cm.onBoundsChanged === 'function') window.cm.onBoundsChanged(onBounds); } catch (_) {}

})();
