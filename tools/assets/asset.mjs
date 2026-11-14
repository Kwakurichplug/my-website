// LetBetAfrika game art rendered with three.js (no AI imagery):
//   ?what=rocket  – white/gold LetBet rocket with green fins and an LB porthole (for Rocket Crash)
//   ?what=ball    – classic 32-panel football (truncated icosahedron) (for Penalty Kick)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? +Q.get(k) : d);
const W = num('w', 512), H = num('h', 512), what = Q.get('what') || 'rocket';

try {
  await document.fonts.load('italic 800 200px Kanit');
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = num('exp', 1);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  const key = new THREE.DirectionalLight(0xffffff, num('key', 2.2)); key.position.set(-3, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffe2a8, 1.4); rim.position.set(4, 2, -3); scene.add(rim);
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const spline = (pts, n) => new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal').getSpacedPoints(n).map(p => V2(Math.max(0, p.x), p.y));
  const GOLD = new THREE.Color().setRGB(1, 0.66, 0.2);
  let cam;

  if (what === 'rocket') {
    const g = new THREE.Group(); scene.add(g);
    const white = new THREE.MeshPhysicalMaterial({ color: 0xf4f5f7, metalness: 0.05, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 });
    const gold = new THREE.MeshPhysicalMaterial({ color: GOLD, metalness: 1, roughness: 0.22 });
    const green = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#0a7d3e'), metalness: 0.1, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 });
    const dark = new THREE.MeshPhysicalMaterial({ color: 0x2a2d33, metalness: 0.9, roughness: 0.35 });
    // fuselage: body (white) + nose cone (gold) + tail skirt (green) + nozzle (dark)
    const body = spline([[0.5, -1.55], [0.58, -1.2], [0.62, -0.4], [0.62, 0.4], [0.58, 0.95], [0.5, 1.3]], 80);
    g.add(new THREE.Mesh(new THREE.LatheGeometry(body, 96), white));
    g.add(new THREE.Mesh(new THREE.LatheGeometry(spline([[0.5, 1.28], [0.44, 1.66], [0.31, 2.06], [0.14, 2.4], [0.0, 2.56]], 60), 96), gold));
    g.add(new THREE.Mesh(new THREE.LatheGeometry([V2(0.625, 0.84), V2(0.625, 0.98)], 96), green));          // stripe under the nose
    g.add(new THREE.Mesh(new THREE.LatheGeometry([V2(0.6, -1.12), V2(0.6, -0.98)], 96), green));        // stripe at the tail
    g.add(new THREE.Mesh(new THREE.LatheGeometry(spline([[0.52, -1.56], [0.46, -1.7], [0.36, -1.82], [0.3, -1.88]], 30), 96), green));
    g.add(new THREE.Mesh(new THREE.LatheGeometry(spline([[0.24, -1.84], [0.3, -2.0], [0.36, -2.16], [0.38, -2.24]], 30), 96), dark));
    // fins
    const fin = new THREE.Shape(); fin.moveTo(0, 0.1); fin.quadraticCurveTo(0.42, -0.25, 0.58, -0.86); fin.lineTo(0.6, -1.32); fin.quadraticCurveTo(0.3, -1.05, 0.0, -0.98); fin.lineTo(0, 0.1);
    const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 });
    finGeo.translate(0, 0, -0.035);
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(finGeo, green); f.position.set(0, -0.72, 0); f.rotation.y = i * Math.PI / 2 + Math.PI / 4; f.translateX(0.54); g.add(f); }
    // porthole with the LB monogram
    const cv = document.createElement('canvas'); cv.width = cv.height = 512; const c2 = cv.getContext('2d');
    const grd = c2.createRadialGradient(200, 180, 20, 256, 256, 260); grd.addColorStop(0, '#2c6b8f'); grd.addColorStop(1, '#071a2a');
    c2.fillStyle = grd; c2.fillRect(0, 0, 512, 512);
    c2.font = 'italic 800 230px Kanit'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillStyle = '#ffc20e'; c2.fillText('LB', 248, 270);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const glass = new THREE.MeshPhysicalMaterial({ map: tex, metalness: 0, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0 });
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.25, 64), glass); win.position.set(0, 0.32, 0.626); g.add(win);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.045, 24, 64), gold); ring.position.copy(win.position); g.add(ring);
    g.rotation.y = num('ry', -0.35); g.rotation.z = num('rz', 0);
    cam = new THREE.PerspectiveCamera(22, W / H, 0.1, 100); cam.position.set(0, 0.6, 15); cam.lookAt(0, 0.12, 0);
  } else {
    // truncated icosahedron, spherified: 12 black pentagons, 20 white hexagons
    const ico = new THREE.IcosahedronGeometry(1, 0), pa = ico.attributes.position, verts = [];
    for (let i = 0; i < pa.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(pa, i); if (!verts.some(u => u.distanceTo(v) < 1e-4)) verts.push(v); }
    const faces = [];
    for (let i = 0; i < pa.count; i += 3) faces.push([0, 1, 2].map(k => verts.findIndex(u => u.distanceTo(new THREE.Vector3().fromBufferAttribute(pa, i + k)) < 1e-4)));
    const at = (a, b) => verts[a].clone().lerp(verts[b], 1 / 3);
    const polys = [];
    verts.forEach((v, i) => {
      const nb = [...new Set(faces.filter(f => f.includes(i)).flat())].filter(j => j !== i);
      const pts = nb.map(j => at(i, j)), n = v.clone().normalize(), t = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0.3)).normalize(), b = new THREE.Vector3().crossVectors(n, t);
      pts.sort((p, q) => Math.atan2(p.dot(b), p.dot(t)) - Math.atan2(q.dot(b), q.dot(t)));
      polys.push({ pts, black: true });
    });
    faces.forEach(([a, b, c]) => polys.push({ pts: [at(a, b), at(b, a), at(b, c), at(c, b), at(c, a), at(a, c)], black: false }));
    const pos = [], col = [], blackC = new THREE.Color(0x15171b), whiteC = new THREE.Color(0xf6f6f2), seamC = new THREE.Color(0x9a9a96);
    const sub = (a, b, c, depth, color) => {
      if (!depth) { for (const p of [a, b, c]) { const q = p.clone().normalize(); pos.push(q.x, q.y, q.z); col.push(color.r, color.g, color.b); } return; }
      const ab = a.clone().add(b).multiplyScalar(0.5), bc = b.clone().add(c).multiplyScalar(0.5), ca = c.clone().add(a).multiplyScalar(0.5);
      sub(a, ab, ca, depth - 1, color); sub(ab, b, bc, depth - 1, color); sub(ca, bc, c, depth - 1, color); sub(ab, bc, ca, depth - 1, color);
    };
    for (const p of polys) {
      const cen = p.pts.reduce((s, x) => s.add(x), new THREE.Vector3()).multiplyScalar(1 / p.pts.length);
      const inner = p.pts.map(x => cen.clone().lerp(x, 0.94));   // a thin seam between panels
      for (let k = 0; k < p.pts.length; k++) {
        const a = inner[k], b = inner[(k + 1) % p.pts.length];
        sub(cen, a, b, 3, p.black ? blackC : whiteC);
        sub(a, p.pts[k], p.pts[(k + 1) % p.pts.length], 2, seamC); sub(a, p.pts[(k + 1) % p.pts.length], b, 2, seamC);
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.slice(), 3));
    const ball = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.25 }));
    ball.rotation.set(num('bx', 0.5), num('by', 0.3), 0); scene.add(ball);
    cam = new THREE.PerspectiveCamera(20, W / H, 0.1, 100); cam.position.set(0, 0, 6.2); cam.lookAt(0, 0, 0);
  }
  renderer.render(scene, cam);
  window.__png = renderer.domElement.toDataURL('image/png');
} catch (e) { window.__err = String(e && e.stack || e); }
