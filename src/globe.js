import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { feature } from 'topojson-client';
import { geoEquirectangular, geoPath } from 'd3-geo';
import world from 'world-atlas/countries-110m.json';

export const DEFAULT_ROUTE = { from: { lat: 52.52, lon: 13.405 }, to: { lat: 34.775, lon: 32.425 } };
let START = DEFAULT_ROUTE.from, END = DEFAULT_ROUTE.to;
const radius = 2.05;

// Angular distance in radians (haversine). Used to scale the flight arc for short and long routes.
export function routeDistance(a, b) {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function routePoint(t, altitude = 0) {
  // Take the short way around the globe, also across the antimeridian.
  const dLon = ((END.lon - START.lon + 540) % 360) - 180;
  const lat = (START.lat + (END.lat - START.lat) * t) * Math.PI / 180;
  const lon = (START.lon + dLon * t) * Math.PI / 180;
  const arc = 0.04 + 0.16 * Math.min(1, routeDistance(START, END) / 0.55);
  const r = radius + altitude + arc * Math.sin(Math.PI * t);
  return new THREE.Vector3(-r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat), -r * Math.cos(lat) * Math.cos(lon));
}

function texture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#17475b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const countries = feature(world, world.objects.countries).features;
  const projection = geoEquirectangular().scale(canvas.width / (2 * Math.PI)).translate([canvas.width / 2, canvas.height / 2]);
  const draw = geoPath(projection, ctx);
  // D3 clips polygons crossing the antimeridian instead of painting a false polar ring.
  for (const country of countries) {
    ctx.beginPath(); draw(country);
    ctx.fillStyle = '#8db6ad'; ctx.strokeStyle = '#558e92'; ctx.lineWidth = 1.25;
    ctx.fill(); ctx.stroke();
  }
  // Chart-like latitude and longitude lines are deliberately subdued.
  ctx.strokeStyle = 'rgba(188,231,219,.11)'; ctx.lineWidth = 1;
  for (let lon = -150; lon <= 150; lon += 30) { const x = (lon + 180) / 360 * 2048; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1024); ctx.stroke(); }
  for (let lat = -60; lat <= 60; lat += 30) { const y = (90 - lat) / 180 * 1024; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(2048, y); ctx.stroke(); }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  // SphereGeometry places the front meridian at U=.75, not .5.
  // Shift the geographic texture by a quarter turn so pins match countries.
  map.wrapS = THREE.RepeatWrapping; map.offset.x = -.25;
  return map;
}

function makeAirplane() {
  const shape = new THREE.Shape();
  shape.moveTo(0, .22); shape.lineTo(.048, .08); shape.lineTo(.26, -.035);
  shape.lineTo(.26, -.09); shape.lineTo(.045, -.07); shape.lineTo(.038, -.20);
  shape.lineTo(.11, -.255); shape.lineTo(.11, -.285); shape.lineTo(0, -.265);
  shape.lineTo(-.11, -.285); shape.lineTo(-.11, -.255); shape.lineTo(-.038, -.20);
  shape.lineTo(-.045, -.07); shape.lineTo(-.26, -.09); shape.lineTo(-.26, -.035);
  shape.lineTo(-.048, .08); shape.lineTo(0, .22);
  const plane = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: '#ffb07a', side: THREE.DoubleSide }));
  plane.scale.setScalar(.78); return plane;
}

export function createGlobe(container, labelLayer) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
  catch { container.classList.add('no-webgl'); return { setEntries() {}, setRoute(route) { START = route.from; END = route.to; }, focus() {}, destroy() {} }; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor('#0d293b');
  container.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 40);
  let aim = routePoint(.45).normalize();
  camera.position.copy(aim.clone().multiplyScalar(7.65)); camera.lookAt(0, 0, 0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = .055;
  controls.minDistance = 5.6; controls.maxDistance = 10; controls.minPolarAngle = .35; controls.maxPolarAngle = Math.PI - .35;
  const ambient = new THREE.AmbientLight('#d7f4e9', 1.65); scene.add(ambient);
  const light = new THREE.DirectionalLight('#fff1c7', 2.65); light.position.set(-3, 5, 5); scene.add(light);
  const map = texture();
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 }));
  scene.add(sphere);
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(radius + .038, 64, 48), new THREE.MeshBasicMaterial({ color: '#74d1ca', transparent: true, opacity: .07, side: THREE.BackSide })));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(radius + .22, 64, 48), new THREE.MeshBasicMaterial({ color: '#83e4d7', transparent: true, opacity: .065, side: THREE.BackSide })); scene.add(halo);
  const routeGroup = new THREE.Group(); scene.add(routeGroup);
  const markerGeometry = new THREE.SphereGeometry(.042, 16, 12);
  const endpointMaterial = new THREE.MeshBasicMaterial({ color: '#ffd99c' });
  function buildRoute() {
    for (const child of [...routeGroup.children]) { routeGroup.remove(child); if (child.geometry !== markerGeometry) child.geometry.dispose(); if (child.material !== endpointMaterial) child.material.dispose(); }
    const points = Array.from({ length: 100 }, (_, i) => routePoint(i / 99, .012));
    routeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#ffd7a0', transparent: true, opacity: .97 })));
    const glow = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#f59a78', transparent: true, opacity: .25 })); glow.scale.setScalar(1.009); routeGroup.add(glow);
    for (const t of [0, 1]) {
      const dot = new THREE.Mesh(markerGeometry, endpointMaterial); dot.position.copy(routePoint(t, .02)); routeGroup.add(dot);
      const ring = new THREE.Mesh(new THREE.RingGeometry(.074, .088, 32), new THREE.MeshBasicMaterial({ color: '#ffe6b6', side: THREE.DoubleSide, transparent: true, opacity: .75 }));
      ring.position.copy(routePoint(t, .023)); ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ring.position.clone().normalize()); routeGroup.add(ring);
    }
  }
  buildRoute();
  const plane = makeAirplane(); scene.add(plane);
  const memoryGroup = new THREE.Group(); scene.add(memoryGroup);
  let entries = [], selectedId = null, frame, lastWidth = 0, lastHeight = 0;
  const labelEls = Array.from(labelLayer.querySelectorAll('[data-globe-label]'));
  const memoryLabels = new Map();
  function setEntries(next, selected) {
    entries = next; selectedId = selected;
    for (const child of [...memoryGroup.children]) { memoryGroup.remove(child); child.geometry.dispose(); child.material.dispose(); }
    for (const el of memoryLabels.values()) el.remove(); memoryLabels.clear();
    entries.forEach(entry => {
      const material = new THREE.MeshBasicMaterial({ color: entry.id === selectedId ? '#ffffff' : '#ffad78' });
      const pin = new THREE.Mesh(new THREE.SphereGeometry(entry.id === selectedId ? .064 : .044, 16, 12), material);
      pin.position.copy(routePoint(Number(entry.position), .025)); memoryGroup.add(pin);
      const el = document.createElement('span'); el.className = 'map-memory-label'; el.textContent = entry.title; labelLayer.append(el); memoryLabels.set(entry.id, el);
    });
  }
  function setRoute(route) {
    START = route.from; END = route.to;
    buildRoute();
    aim = routePoint(.45).normalize();
    labelEls[0].querySelector('strong').textContent = (route.from.name || 'Start').toUpperCase();
    labelEls[1].querySelector('strong').textContent = (route.to.name || 'Ziel').toUpperCase();
    setEntries(entries, selectedId);
    focus();
  }
  function focus() { camera.position.copy(aim.clone().multiplyScalar(7.65)); controls.target.set(0, 0, 0); controls.update(); }
  function placeLabel(el, point) {
    const projected = point.clone().project(camera);
    const facing = point.clone().normalize().dot(camera.position.clone().normalize()) > .14;
    const visible = facing && projected.z < 1 && projected.x > -1.15 && projected.x < 1.15 && projected.y > -1.1 && projected.y < 1.1;
    el.style.display = visible ? '' : 'none';
    if (visible) { el.style.left = `${(projected.x + 1) * 50}%`; el.style.top = `${(-projected.y + 1) * 50}%`; }
  }
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width; lastHeight = height;
    if (!width || !height) return;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const started = performance.now();
  function tick(now) {
    frame = requestAnimationFrame(tick);
    if (document.hidden) return;
    controls.update();
    const t = reduced.matches ? .5 : .5 + .46 * Math.sin((now - started) / 6500 - Math.PI / 2);
    const p = routePoint(t, .06);
    plane.position.copy(p);
    const tangent = routePoint(Math.min(1, t + .005), .06).sub(routePoint(Math.max(0, t - .005), .06)).normalize();
    const normal = p.clone().normalize();
    const right = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    const matrix = new THREE.Matrix4().makeBasis(right, tangent, normal);
    plane.quaternion.setFromRotationMatrix(matrix);
    plane.rotateZ(Math.PI / 2);
    renderer.render(scene, camera);
    placeLabel(labelEls[0], routePoint(0, .08)); placeLabel(labelEls[1], routePoint(1, .08));
    entries.forEach(entry => { const el = memoryLabels.get(entry.id); if (el) placeLabel(el, routePoint(Number(entry.position), .12)); });
  }
  frame = requestAnimationFrame(tick);
  return {
    setEntries, setRoute, focus,
    destroy() { cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); map.dispose(); sphere.geometry.dispose(); sphere.material.dispose(); renderer.dispose(); renderer.domElement.remove(); }
  };
}
