import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const POSITIONS_URL = "brain_positions.json";
const DECAY = 0.90;

const ROLE_COLOR = {
  visual_input: [0.42, 0.82, 0.97],
  dn_output: [1.0, 0.4, 0.4],
  relay: [0.58, 0.64, 0.8],
};
const ROLE_SIZE = {
  visual_input: 2.1,
  dn_output: 4.4,
  relay: 1.5,
};
const ROLE_BASE_ALPHA = {
  visual_input: 0.42,
  dn_output: 0.65,
  relay: 0.4,
};

const VERTEX_SHADER = `
  attribute vec3 baseColor;
  attribute float baseSize;
  attribute float baseAlpha;
  attribute float activity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = mix(baseColor, vec3(1.0, 0.96, 0.82), activity);
    vAlpha = clamp(baseAlpha + activity * 0.6, 0.0, 1.0);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp((baseSize + activity * 4.0) * (9.0 / -mvPosition.z), 1.0, 40.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = length(c);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.0, d) * vAlpha;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

export class BrainView {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 0, 9);
    this.group = new THREE.Group();
    this.group.rotation.set(-0.18, 0.45, 0.05);
    this.scene.add(this.group);

    this.ready = false;
    this.nodeIndexToArrayIndex = new Map();
    this.activity = null;

    this._resize();
    window.addEventListener("resize", () => this._resize());
    this._load();
  }

  _resize() {
    const size = this.canvas.clientWidth || 240;
    this.renderer.setSize(size, size, false);
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
  }

  async _load() {
    const res = await fetch(POSITIONS_URL);
    const nodes = await res.json();
    const n = nodes.length;

    const positions = new Float32Array(n * 3);
    const baseColor = new Float32Array(n * 3);
    const baseSize = new Float32Array(n);
    const baseAlpha = new Float32Array(n);
    this.activity = new Float32Array(n);

    nodes.forEach((node, i) => {
      positions[i * 3] = node.x;
      positions[i * 3 + 1] = node.y;
      positions[i * 3 + 2] = node.z;
      const c = ROLE_COLOR[node.role] || ROLE_COLOR.relay;
      baseColor[i * 3] = c[0];
      baseColor[i * 3 + 1] = c[1];
      baseColor[i * 3 + 2] = c[2];
      baseSize[i] = ROLE_SIZE[node.role] || ROLE_SIZE.relay;
      baseAlpha[i] = ROLE_BASE_ALPHA[node.role] ?? ROLE_BASE_ALPHA.relay;
      this.nodeIndexToArrayIndex.set(node.index, i);
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("baseColor", new THREE.BufferAttribute(baseColor, 3));
    geometry.setAttribute("baseSize", new THREE.BufferAttribute(baseSize, 1));
    geometry.setAttribute("baseAlpha", new THREE.BufferAttribute(baseAlpha, 1));
    geometry.setAttribute("activity", new THREE.BufferAttribute(this.activity, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
    });

    this.points = new THREE.Points(geometry, material);
    this.group.add(this.points);
    this.ready = true;
  }

  applySpikes(indices) {
    if (!this.ready || !indices || !indices.length) return;
    for (const idx of indices) {
      const arrIdx = this.nodeIndexToArrayIndex.get(idx);
      if (arrIdx !== undefined) this.activity[arrIdx] = 1.0;
    }
  }

  render() {
    if (!this.ready) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const activity = this.activity;
    for (let i = 0; i < activity.length; i++) {
      activity[i] = activity[i] > 0.001 ? activity[i] * DECAY : 0;
    }
    this.points.geometry.attributes.activity.needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }
}
