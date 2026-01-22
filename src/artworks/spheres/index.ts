import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x807878);

// Camera
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 5;

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// OrbitControls for camera (직관적인 드래그 방향)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = true;
controls.enablePan = false;
// 상하 회전: 거의 180도까지 (위아래 끝까지 볼 수 있음)
controls.minPolarAngle = 0.01;
controls.maxPolarAngle = Math.PI - 0.01;
// 좌우 회전: 무제한
controls.minAzimuthAngle = -Infinity;
controls.maxAzimuthAngle = Infinity;

// Raycaster for picking
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Custom Shader Material with Noise
const vertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uHighlight;
uniform float uTime;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

// Simplex noise function
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

// FBM
float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
        value += amplitude * snoise(p);
        p *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

void main() {
    // Noise based on position (will change when rotated)
    float noise = fbm(vPosition * 2.0);
    noise = noise * 0.5 + 0.5; // 0 to 1

    // Mix colors based on noise
    vec3 color = mix(uColor1, uColor2, noise);

    // Lighting
    vec3 lightDir = normalize(vec3(-0.5, 1.0, 0.5));
    float diff = max(dot(vNormal, lightDir), 0.0);
    float ambient = 0.4;
    float lighting = ambient + diff * 0.6;

    // Add highlight based on noise and light
    float highlight = pow(max(dot(vNormal, lightDir), 0.0), 3.0);
    color = mix(color, uHighlight, highlight * noise * 0.5);

    color *= lighting;

    // Fresnel effect for edge transparency
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    float fresnel = dot(vNormal, viewDir);
    // 가장자리는 거의 투명, 중앙만 30% 정도
    float alpha = pow(fresnel, 1.5) * 0.3;

    // 아날로그 필름 느낌의 미세 노이즈
    float grain = fract(sin(dot(vUv * 500.0 + vPosition.xy * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
    color += (grain - 0.5) * 0.06;

    gl_FragColor = vec4(color, alpha);
}
`;

// Sphere 1 Material (Top - Pink/Magenta with purple highlight)
const material1 = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
        uColor1: { value: new THREE.Color(0xf24873) },
        uColor2: { value: new THREE.Color(0xd65090) },
        uHighlight: { value: new THREE.Color(0xda59f2) },
        uTime: { value: 0 }
    },
    transparent: true,
    depthWrite: false
});

// Sphere 2 Material (Bottom - Pink)
const material2 = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
        uColor1: { value: new THREE.Color(0xf77c9c) },
        uColor2: { value: new THREE.Color(0xf25580) },
        uHighlight: { value: new THREE.Color(0xffaabb) },
        uTime: { value: 0 }
    },
    transparent: true,
    depthWrite: false
});

// Sphere 1 (Top) - 왼쪽 위, 뒤쪽
const geometry1 = new THREE.SphereGeometry(1, 64, 64);
const sphere1 = new THREE.Mesh(geometry1, material1);
sphere1.position.set(-0.25, 0.55, -0.3);
scene.add(sphere1);

// Sphere 2 (Bottom) - 오른쪽 아래, 앞쪽
const geometry2 = new THREE.SphereGeometry(0.85, 64, 64);
const sphere2 = new THREE.Mesh(geometry2, material2);
sphere2.position.set(0.2, -0.5, 0.35);
scene.add(sphere2);

// Interaction state
let isDragging = false;
let selectedSphere: THREE.Mesh | null = null;
let previousMousePosition = { x: 0, y: 0 };

// 쫀득한 관성 효과를 위한 속도 상태
const sphereVelocities = new Map<THREE.Mesh, { rotX: number; rotY: number; posX: number; posY: number; posZ: number }>();
sphereVelocities.set(sphere1, { rotX: 0, rotY: 0, posX: 0, posY: 0, posZ: 0 });
sphereVelocities.set(sphere2, { rotX: 0, rotY: 0, posX: 0, posY: 0, posZ: 0 });

// 감속 계수 (낮을수록 더 오래 미끄러짐)
const friction = 0.92;

// 목표 값 (마우스 입력)
let targetDeltaX = 0;
let targetDeltaY = 0;

// 호버 상태
let hoveredSphere: THREE.Mesh | null = null;

// Get intersected sphere
function getIntersectedSphere(event: MouseEvent): THREE.Mesh | null {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects([sphere1, sphere2]);

    return intersects.length > 0 ? intersects[0].object as THREE.Mesh : null;
}

// Interaction mode: 'rotate' or 'move'
let interactionMode = 'rotate';

// Mouse events
renderer.domElement.addEventListener('mousedown', (event) => {
    const intersected = getIntersectedSphere(event);

    if (intersected) {
        controls.enabled = false;
        isDragging = true;
        selectedSphere = intersected;
        previousMousePosition = { x: event.clientX, y: event.clientY };
        targetDeltaX = 0;
        targetDeltaY = 0;

        // Shift 누르면 이동 모드
        interactionMode = event.shiftKey ? 'move' : 'rotate';
        renderer.domElement.style.cursor = interactionMode === 'move' ? 'move' : 'grabbing';
    }
});

window.addEventListener('mousemove', (event) => {
    if (!isDragging) {
        const intersected = getIntersectedSphere(event);
        hoveredSphere = intersected;
        if (intersected) {
            renderer.domElement.style.cursor = event.shiftKey ? 'move' : 'grab';
        } else {
            renderer.domElement.style.cursor = 'default';
        }
    }

    if (isDragging && selectedSphere) {
        targetDeltaX = event.clientX - previousMousePosition.x;
        targetDeltaY = event.clientY - previousMousePosition.y;

        const vel = sphereVelocities.get(selectedSphere)!;

        if (interactionMode === 'move') {
            // 부드러운 위치 이동 (둔감하게)
            vel.posX += targetDeltaX * 0.001;
            vel.posY -= targetDeltaY * 0.001;
        } else if (interactionMode === 'depth') {
            // 부드러운 깊이 이동 (둔감하게)
            vel.posZ += targetDeltaY * 0.001;
        } else {
            // 부드러운 회전
            vel.rotY += targetDeltaX * 0.006;
            vel.rotX += targetDeltaY * 0.006;
        }

        previousMousePosition = { x: event.clientX, y: event.clientY };
    }
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    selectedSphere = null;
    controls.enabled = true;
    renderer.domElement.style.cursor = 'default';
});

// Alt + 드래그로 Z축(앞뒤) 이동
window.addEventListener('keydown', (event) => {
    if (event.key === 'Alt' && isDragging && selectedSphere) {
        interactionMode = 'depth';
        renderer.domElement.style.cursor = 'ns-resize';
    }
});

window.addEventListener('keyup', (event) => {
    if (event.key === 'Alt' && isDragging) {
        interactionMode = event.shiftKey ? 'move' : 'rotate';
    }
});

// 호버 떨림을 위한 원본 스케일 저장
const originalScales = new Map<THREE.Mesh, THREE.Vector3>();
originalScales.set(sphere1, sphere1.scale.clone());
originalScales.set(sphere2, sphere2.scale.clone());

// 호버 강도 (부드러운 전환용)
const hoverIntensity = new Map<THREE.Mesh, number>();
hoverIntensity.set(sphere1, 0);
hoverIntensity.set(sphere2, 0);

// 쫀득한 물리 업데이트
let time = 0;
function updateSpherePhysics() {
    time += 0.016;  // 약 60fps 기준

    sphereVelocities.forEach((vel, sphere) => {
        // 회전 적용 (부드럽게)
        sphere.rotation.x += vel.rotX;
        sphere.rotation.y += vel.rotY;

        // 위치 적용 (부드럽게)
        sphere.position.x += vel.posX;
        sphere.position.y += vel.posY;
        sphere.position.z += vel.posZ;

        // 감속 (관성)
        vel.rotX *= friction;
        vel.rotY *= friction;
        vel.posX *= friction;
        vel.posY *= friction;
        vel.posZ *= friction;

        // 아주 작은 값은 0으로
        if (Math.abs(vel.rotX) < 0.0001) vel.rotX = 0;
        if (Math.abs(vel.rotY) < 0.0001) vel.rotY = 0;
        if (Math.abs(vel.posX) < 0.0001) vel.posX = 0;
        if (Math.abs(vel.posY) < 0.0001) vel.posY = 0;
        if (Math.abs(vel.posZ) < 0.0001) vel.posZ = 0;

        // 호버 강도 부드럽게 전환
        const currentIntensity = hoverIntensity.get(sphere)!;
        const targetIntensity = (sphere === hoveredSphere && !isDragging) ? 1 : 0;
        const newIntensity = currentIntensity + (targetIntensity - currentIntensity) * 0.03;
        hoverIntensity.set(sphere, newIntensity);

        // 호버 시 미세한 떨림 효과
        const original = originalScales.get(sphere)!;
        const tremor = Math.sin(time * 8) * 0.008 + Math.sin(time * 13) * 0.005;
        const breathe = Math.sin(time * 2) * 0.015;
        const hoverEffect = (tremor + breathe) * newIntensity;
        sphere.scale.setScalar(original.x * (1 + hoverEffect));
    });
}

// Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animate
function animate() {
    requestAnimationFrame(animate);
    updateSpherePhysics();
    controls.update();
    renderer.render(scene, camera);
}

animate();
