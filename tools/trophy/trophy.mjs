// LetBetAfrika trophy – modelled and rendered with three.js (no AI imagery).
// Gold cup with the LB monogram + ball engraved on the front, big-ear handles,
// knob stem, and a green lacquer plinth carrying the LetBet|Afrika wordmark.
import * as THREE from 'three';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? +Q.get(k) : d);
const SIZE = num('size', 1400);

try {
  await document.fonts.load('italic 800 200px Kanit');
  if (!document.fonts.check('italic 800 200px Kanit')) throw new Error('Kanit not loaded');

  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = num('tm', 1) ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = num('exp', 1);

  const scene = new THREE.Scene();

  /* ---------------- studio lighting (environment for reflections) ---------------- */
  function studio() {
    const env = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.SphereGeometry(90, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP; void main(){ float h = vP.y;
        vec3 top = vec3(${num('rt', 0.16)}, ${num('rt', 0.16) * 0.92}, ${num('rt', 0.16) * 0.82});
        vec3 mid = vec3(${num('rm', 0.035)}, ${num('rm', 0.035) * 0.9}, ${num('rm', 0.035) * 0.78});
        vec3 bot = vec3(${num('rb', 0.20)}, ${num('rb', 0.20) * 0.72}, ${num('rb', 0.20) * 0.40});
        vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.9, h)) : mix(mid, bot, smoothstep(0.0, 0.9, -h));
        gl_FragColor = vec4(c, 1.0); }`,
    }));
    env.add(room);
    const panel = (w, h, I, pos, tint = [1, 1, 1], look = [0, 6, 0]) => {
      const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      m.color.setRGB(tint[0] * I, tint[1] * I, tint[2] * I);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(...pos); p.lookAt(...look); env.add(p);
    };
    const S = num('panels', 1);
    panel(46, 16, 3.0 * S, [0, 48, 6]);                         // top softbox
    panel(6, 64, 10 * S, [-27, 8, 16], [1, 0.93, 0.82]);                          // left strip
    panel(6, 64, 10 * S, [27, 8, 16], [1, 0.93, 0.82]);                           // right strip
    panel(9, 56, 6 * S, [-21, 6, -24], [1, 0.82, 0.55]);         // warm back-left rim
    panel(9, 56, 6 * S, [21, 6, -24], [1, 0.82, 0.55]);          // warm back-right rim
    panel(56, 12, 1.2 * S, [0, 3, 46]);                          // soft front fill
    panel(14, 14, 2.4 * S, [-10, 18, 40]);                       // key highlight front-left
    panel(70, 70, 0.7 * S, [0, -34, 0], [1, 0.78, 0.45]);        // warm floor bounce
    return env;
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio(), 0.02).texture;

  /* ---------------- materials ---------------- */
  const GOLD = new THREE.Color().setRGB(num('gr', 1.0), num('gg', 0.70), num('gb', 0.27));
  const gold = (o = {}) => new THREE.MeshPhysicalMaterial({ color: GOLD, metalness: 1, roughness: num('rough', 0.17), envMapIntensity: num('envi', 1), ...o });
  const goldHex = '#' + GOLD.getHexString();

  /* ---------------- helpers ---------------- */
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const spline = (pts, n) => new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal')
    .getSpacedPoints(n).map(p => V2(Math.max(0, p.x), p.y));
  const SEG = 320;
  let parent = scene;
  const UP = num('up', 0.34);
  const lathe = (points, mat) => { const m = new THREE.Mesh(new THREE.LatheGeometry(points, SEG, Math.PI, Math.PI * 2), mat); parent.add(m); return m; };
  const ring = (R, r, y, mat) => { const m = new THREE.Mesh(new THREE.TorusGeometry(R, r, 32, SEG), mat); m.rotation.x = Math.PI / 2; m.position.y = y; parent.add(m); return m; };
  function vtube(curve, n, radial, rfn, mat, flat = 1) {
    const fr = curve.computeFrenetFrames(n, false), pos = [], nor = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, P = curve.getPointAt(t), N = fr.normals[i], B = fr.binormals[i], r = rfn(t);
      for (let j = 0; j <= radial; j++) {
        const a = j / radial * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), ra = r * flat, rb = r;
        const px = c * ra * N.x + s * rb * B.x, py = c * ra * N.y + s * rb * B.y, pz = c * ra * N.z + s * rb * B.z;
        let nx = c / ra * N.x + s / rb * B.x, ny = c / ra * N.y + s / rb * B.y, nz = c / ra * N.z + s / rb * B.z; const nl = Math.hypot(nx, ny, nz);
        pos.push(P.x + px, P.y + py, P.z + pz); nor.push(nx / nl, ny / nl, nz / nl); uv.push(t, j / radial);
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = (i + 1) * (radial + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, mat); parent.add(m); return m;
  }
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true; return t; };

  /* ---------------- brand artwork ---------------- */
  function pentagon(g, x, y, r, rot = -Math.PI / 2) {
    g.beginPath();
    for (let k = 0; k < 5; k++) { const a = rot + k * 2 * Math.PI / 5; g[k ? 'lineTo' : 'moveTo'](x + r * Math.cos(a), y + r * Math.sin(a)); }
    g.closePath();
  }
  // football as in the app icon: outline, centre pentagon, seams, rim patches
  function ball(g, x, y, R, lw) {
    g.save();
    g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.clip();
    pentagon(g, x, y, R * 0.36); g.fill();
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + k * 2 * Math.PI / 5;
      g.beginPath(); g.lineWidth = lw; g.moveTo(x + R * 0.36 * Math.cos(a), y + R * 0.36 * Math.sin(a)); g.lineTo(x + R * 0.86 * Math.cos(a), y + R * 0.86 * Math.sin(a)); g.stroke();
      pentagon(g, x + R * 1.02 * Math.cos(a), y + R * 1.02 * Math.sin(a), R * 0.30, a + Math.PI); g.fill();
    }
    g.restore();
    g.beginPath(); g.lineWidth = lw; g.arc(x, y, R - lw / 2, 0, Math.PI * 2); g.stroke();
  }
  // LB monogram + ball (composition of the app icon); returns nothing, draws white on transparent
  function drawMonogram(g, w, h, laurel) {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    let fs = h * 0.62;
    g.font = `italic 800 ${fs}px Kanit`;
    let m = g.measureText('LB');
    const tw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, th = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    const R = th * 0.30;                                   // ball radius (icon proportion)
    const compW = tw + R * 0.45, compH = th + R * 1.15;    // ball sits above the B's right shoulder
    const k = Math.min((w * (laurel ? 0.62 : 0.86)) / compW, (h * (laurel ? 0.66 : 0.9)) / compH);
    fs *= k; g.font = `italic 800 ${fs}px Kanit`; m = g.measureText('LB');
    const TW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, TH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, BR = TH * 0.30;
    const left = (w - (TW + BR * 0.45)) / 2, top = (h - (TH + BR * 1.15)) / 2 + BR * 1.15 - (laurel ? h * 0.04 : 0);
    const x = left + m.actualBoundingBoxLeft, y = top + m.actualBoundingBoxAscent;
    g.fillText('LB', x, y);
    ball(g, left + TW - BR * 0.25, top - BR * 0.42, BR, BR * 0.13);
    if (laurel) {
      const leaf = (px, py, len, wid, ang) => { g.save(); g.translate(px, py); g.rotate(ang); g.beginPath(); g.moveTo(0, 0);
        g.quadraticCurveTo(len * 0.45, -wid, len, 0); g.quadraticCurveTo(len * 0.45, wid, 0, 0); g.fill(); g.restore(); };
      const cx = w / 2, cy = h * 0.40, R = Math.min(w * 0.40, h * 0.46);
      for (const side of [-1, 1]) {
        // canvas angles: PI/2 = straight down. Branch runs from the bottom centre up each side.
        const a0 = Math.PI / 2 + side * 0.22, a1 = Math.PI / 2 + side * 1.95, N = 9;
        const P = a => [cx + R * Math.cos(a), cy + R * Math.sin(a)];
        g.beginPath(); g.lineWidth = h * 0.011;
        for (let i = 0; i <= 50; i++) { const [px, py] = P(a0 + (a1 - a0) * i / 50); i ? g.lineTo(px, py) : g.moveTo(px, py); }
        g.stroke();
        for (let i = 0; i < N; i++) {
          const f = (i + 0.6) / N, a = a0 + (a1 - a0) * f, [px, py] = P(a), size = 1 - f * 0.45;
          const tang = a + side * Math.PI / 2;                       // direction toward the tip
          leaf(px, py, h * 0.085 * size, h * 0.024 * size, tang - 0.62);
          leaf(px, py, h * 0.085 * size, h * 0.024 * size, tang + 0.62);
        }
        const [tx, ty] = P(a1); leaf(tx, ty, h * 0.06, h * 0.018, a1 + side * Math.PI / 2);
      }
    }
  }

  /* ---------------- plinth (green lacquer + gold bands + wordmark) ---------------- */
  const PR = 2.74, W0 = 0.17, W1 = 1.19 + UP;
  lathe([V2(2.76, 0), V2(2.84, 0.02), V2(2.87, 0.085), V2(2.84, 0.15), V2(2.76, 0.17)], gold());
  lathe([V2(2.76, W1), V2(2.84, W1 + 0.02), V2(2.87, W1 + 0.085), V2(2.84, W1 + 0.15), V2(2.76, W1 + 0.17)], gold());
  { const top = new THREE.Mesh(new THREE.RingGeometry(0, 2.78, SEG), gold({ roughness: 0.28 })); top.rotation.x = -Math.PI / 2; top.position.y = W1 + 0.168; scene.add(top); }
  {
    const circ = 2 * Math.PI * PR, TW = 8192, TH = Math.round(TW * (W1 - W0) / circ);
    const col = canvas(TW, TH), orm = canvas(TW, TH), bmp = canvas(TW, TH);
    const gc = col.getContext('2d'), go = orm.getContext('2d'), gb = bmp.getContext('2d');
    gc.fillStyle = '#08743a'; gc.fillRect(0, 0, TW, TH);
    go.fillStyle = 'rgb(0,90,0)'; go.fillRect(0, 0, TW, TH);            // G=roughness .35, B=metal 0
    gb.fillStyle = '#000'; gb.fillRect(0, 0, TW, TH);
    // gold pinstripes
    for (const yy of [0.13, 0.87]) {
      gc.fillStyle = goldHex; gc.fillRect(0, TH * yy - TH * 0.018, TW, TH * 0.036);
      go.fillStyle = 'rgb(0,50,255)'; go.fillRect(0, TH * yy - TH * 0.018, TW, TH * 0.036);
      gb.fillStyle = '#fff'; gb.fillRect(0, TH * yy - TH * 0.018, TW, TH * 0.036);
    }
    // wordmark LetBet (white enamel) + Afrika (gold) + ball, like the site header
    const fs = TH * num('wfs', 0.5);
    for (const g of [gc, go, gb]) g.font = `italic 800 ${fs}px Kanit`;
    const a = gc.measureText('LetBet'), b = gc.measureText('Afrika'), gap = fs * 0.12, bR = fs * 0.36;
    const total = a.width + gap + b.width + fs * 0.16 + bR * 2;
    const x0 = TW / 2 - total / 2, base = TH / 2 + (a.actualBoundingBoxAscent - a.actualBoundingBoxDescent) / 2;
    gc.fillStyle = '#f4f4f0'; gc.fillText('LetBet', x0, base);
    gc.fillStyle = goldHex; gc.fillText('Afrika', x0 + a.width + gap, base);
    go.fillStyle = 'rgb(0,70,0)'; go.fillText('LetBet', x0, base);
    go.fillStyle = 'rgb(0,45,255)'; go.fillText('Afrika', x0 + a.width + gap, base);
    gb.fillStyle = '#fff'; gb.fillText('LetBet', x0, base); gb.fillText('Afrika', x0 + a.width + gap, base);
    const bx = x0 + a.width + gap + b.width + fs * 0.16 + bR, by = base - a.actualBoundingBoxAscent * 0.52;
    gc.fillStyle = '#f4f4f0'; gc.beginPath(); gc.arc(bx, by, bR, 0, 7); gc.fill();
    gc.fillStyle = '#16181c'; gc.strokeStyle = '#16181c'; ball(gc, bx, by, bR, bR * 0.12);
    go.fillStyle = 'rgb(0,70,0)'; go.beginPath(); go.arc(bx, by, bR, 0, 7); go.fill();
    gb.fillStyle = '#fff'; gb.beginPath(); gb.arc(bx, by, bR, 0, 7); gb.fill();
    const bl = canvas(TW, TH), gbl = bl.getContext('2d'); gbl.filter = 'blur(2px)'; gbl.drawImage(bmp, 0, 0);
    const mat = new THREE.MeshPhysicalMaterial({ map: tex(col, true), roughnessMap: tex(orm), metalnessMap: tex(orm), roughness: 1, metalness: 1,
      clearcoat: 1, clearcoatRoughness: 0.06, bumpMap: tex(bl), bumpScale: num('pbump', 1.5) });
    lathe([V2(PR, W0), V2(PR, W1)], mat);
  }

  /* ---------------- foot, stem, knob ---------------- */
  const cup = new THREE.Group(); cup.position.y = UP; scene.add(cup); parent = cup;
  { const d = new THREE.Mesh(new THREE.CylinderGeometry(2.38, 2.42, 0.1, SEG), gold()); d.position.y = 1.41; parent.add(d); }
  lathe(spline([[2.30, 1.46], [2.27, 1.53], [2.05, 1.62], [1.62, 1.80], [1.18, 2.08], [0.84, 2.45], [0.62, 2.84], [0.50, 3.12], [0.45, 3.28]], 160), gold());
  ring(0.52, 0.085, 3.33, gold());
  ring(2.2, 0.05, 1.55, gold());
  lathe(spline([[0.44, 3.36], [0.50, 3.44], [0.64, 3.56], [0.77, 3.74], [0.80, 3.88], [0.76, 4.02], [0.62, 4.16], [0.48, 4.25], [0.42, 4.30]], 120), gold());
  ring(0.47, 0.075, 4.33, gold());
  lathe(spline([[0.41, 4.36], [0.45, 4.44], [0.56, 4.52], [0.62, 4.56]], 40), gold());

  /* ---------------- bowl ---------------- */
  const outer = spline([[0.60, 4.52], [0.88, 4.64], [1.38, 4.92], [1.97, 5.34], [2.47, 5.88], [2.82, 6.58], [3.03, 7.38], [3.14, 8.18], [3.21, 8.86], [3.31, 9.36], [3.47, 9.72]], 400);
  {
    const s = [0]; for (let i = 1; i < outer.length; i++) s.push(s[i - 1] + outer[i].distanceTo(outer[i - 1]));
    const L = s[s.length - 1], n = outer.length - 1;
    const rAt = sv => { const f = Math.max(0, Math.min(n - 1e-6, sv / L * n)), i = Math.floor(f), t = f - i; return outer[i].x * (1 - t) + outer[i + 1].x * t; };
    const sAtY = y => { for (let i = 1; i <= n; i++) if (outer[i].y >= y) { const t = (y - outer[i - 1].y) / (outer[i].y - outer[i - 1].y); return s[i - 1] + t * (s[i] - s[i - 1]); } return L; };
    const TW = 4096, TH = 2048, LW = num('lw', 3.3), LH = num('lh', 2.6), sC = sAtY(num('ly', 7.25)), laurel = num('laurel', 1);
    const art = canvas(1600, Math.round(1600 * LH / LW)), ga = art.getContext('2d');
    drawMonogram(ga, art.width, art.height, laurel);
    const A = ga.getImageData(0, 0, art.width, art.height).data, AW = art.width, AH = art.height;
    const samp = (px, py) => {
      const x0 = Math.floor(px - 0.5), y0 = Math.floor(py - 0.5), fx = px - 0.5 - x0, fy = py - 0.5 - y0;
      const at = (x, y) => (x < 0 || y < 0 || x >= AW || y >= AH) ? 0 : A[(y * AW + x) * 4 + 3] / 255;
      return at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
    };
    const mask = new Float32Array(TW * TH);
    for (let y = 0; y < TH; y++) {
      const v = 1 - (y + 0.5) / TH, sv = v * L;
      // engraved hairline bands near the rim and above the foot
      const yy = outer[Math.round(v * n)].y;
      if (Math.abs(yy - 9.30) < 0.018 || Math.abs(yy - 9.40) < 0.010 || Math.abs(yy - 5.02) < 0.016) { for (let x = 0; x < TW; x++) mask[y * TW + x] = 1; continue; }
      if (Math.abs(sv - sC) > LH / 2) continue;
      const circ = 2 * Math.PI * rAt(sv), py = (0.5 - (sv - sC) / LH) * AH;
      for (let x = 0; x < TW; x++) {
        const a = ((x + 0.5) / TW - 0.5) * circ; if (Math.abs(a) > LW / 2) continue;
        mask[y * TW + x] = samp((a / LW + 0.5) * AW, py);
      }
    }
    const col = canvas(TW, TH), rgh = canvas(TW, TH), bmp = canvas(TW, TH);
    const ic = col.getContext('2d').createImageData(TW, TH), ir = rgh.getContext('2d').createImageData(TW, TH), ib = bmp.getContext('2d').createImageData(TW, TH);
    const E = [num('er', 0.62), num('eg', 0.47), num('eb', 0.33)], R0 = num('rough', 0.17), R1 = num('erough', 0.42);
    for (let i = 0; i < TW * TH; i++) {
      const m = mask[i], o = i * 4;
      ic.data[o] = 255 * (1 - m + m * E[0]); ic.data[o + 1] = 255 * (1 - m + m * E[1]); ic.data[o + 2] = 255 * (1 - m + m * E[2]); ic.data[o + 3] = 255;
      ir.data[o] = 0; ir.data[o + 1] = 255 * (R0 + (R1 - R0) * m); ir.data[o + 2] = 0; ir.data[o + 3] = 255;
      const hgt = 255 * (1 - m); ib.data[o] = ib.data[o + 1] = ib.data[o + 2] = hgt; ib.data[o + 3] = 255;
    }
    col.getContext('2d').putImageData(ic, 0, 0); rgh.getContext('2d').putImageData(ir, 0, 0); bmp.getContext('2d').putImageData(ib, 0, 0);
    const bl = canvas(TW, TH), gbl = bl.getContext('2d'); gbl.filter = `blur(${num('bblur', 1.6)}px)`; gbl.drawImage(bmp, 0, 0);
    const mat = new THREE.MeshPhysicalMaterial({ color: GOLD, metalness: 1, roughness: 1, map: tex(col, true), roughnessMap: tex(rgh), bumpMap: tex(bl), bumpScale: num('bump', 3) });
    lathe(outer, mat);
  }
  ring(3.385, 0.115, 9.765, gold());                                           // rolled rim
  lathe(spline([[3.29, 9.79], [3.19, 9.42], [3.08, 8.78], [2.97, 7.98], [2.76, 7.02], [2.31, 6.12], [1.56, 5.42], [0.72, 5.07], [0.0, 5.0]], 300), gold({ roughness: 0.22 }));

  /* ---------------- handles (big ears) ---------------- */
  const HP = [[3.02, 9.34], [3.58, 9.74], [4.26, 9.82], [4.80, 9.46], [5.02, 8.84], [4.92, 8.12], [4.56, 7.46], [4.04, 6.90], [3.48, 6.42], [2.98, 6.08], [2.50, 5.90]];
  for (const sx of [1, -1]) {
    const c = new THREE.CatmullRomCurve3(HP.map(([x, y]) => new THREE.Vector3(sx * x, y, 0)), false, 'centripetal');
    vtube(c, 260, 40, t => num('hr', 0.19) + 0.11 * Math.pow(1 - t, 1.4) + 0.06 * Math.exp(-Math.pow((t - 0.985) / 0.03, 2)), gold(), num('hflat', 0.55));
    // small finial where the handle curls outward
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.2, 48, 24), gold()); f.position.copy(c.getPointAt(0.30)).add(new THREE.Vector3(sx * 0.18, 0.04, 0));
    if (num('finial', 0)) parent.add(f);
  }

  /* ---------------- light inside the cup ---------------- */
  if (num('glow', 1)) {
    const gcv = canvas(512, 512), gg = gcv.getContext('2d'), rg = gg.createRadialGradient(256, 256, 0, 256, 256, 256);
    rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.35, '#fff6d6'); rg.addColorStop(0.75, '#ffd77a'); rg.addColorStop(1, '#f0a020');
    gg.fillStyle = rg; gg.fillRect(0, 0, 512, 512);
    const gm = new THREE.MeshBasicMaterial({ map: tex(gcv, true) }); gm.color.setScalar(num('gi', 6));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.25, SEG), gm);
    disc.rotation.x = -Math.PI / 2; disc.position.y = num('gy', 9.35); parent.add(disc);
    const pl = new THREE.PointLight(0xffd27a, num('pli', 60), 8, 2); pl.position.set(0, 9.9, 0.2); parent.add(pl);
  }

  /* ---------------- camera + render ---------------- */
  const el = num('el', 8) * Math.PI / 180, dist = num('dist', 36), ty = num('ty', 5.0);
  const cam = new THREE.PerspectiveCamera(num('fov', 19), 1, 0.1, 200);
  cam.position.set(0, ty + Math.sin(el) * dist, Math.cos(el) * dist); cam.lookAt(0, ty, 0);
  renderer.render(scene, cam);
  const proj = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(cam); return [Math.round((v.x + 1) / 2 * SIZE), Math.round((1 - v.y) / 2 * SIZE)]; };
  window.__info = { mouth: proj(0, 9.8 + UP, 0), rimL: proj(-3.5, 9.8 + UP, 0), rimR: proj(3.5, 9.8 + UP, 0), base: proj(0, 0, 2.8), ptop: proj(0, 1.19 + UP + 0.17, 2.85), lhandle: proj(-4.95, 8.9 + UP, 0), rhandle: proj(4.95, 8.9 + UP, 0) };
  window.__png = renderer.domElement.toDataURL('image/png');
} catch (e) { window.__err = String(e && e.stack || e); }
