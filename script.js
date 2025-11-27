import Lenis from 'lenis';
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// --- VARIÁVEIS GLOBAIS ---
let scrollSpeed = 0; 
let frameCount = 0; 

// --- OTIMIZAÇÃO: DETECTAR MOBILE ---
const isMobile = window.innerWidth < 768;

// --- 1. SETUP LENIS (SCROLL SUAVE) ---
const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), 
    smooth: true,
    direction: 'vertical',
});

gsap.registerPlugin(ScrollTrigger);

lenis.on('scroll', (e) => { 
    ScrollTrigger.update(e); 
    scrollSpeed = e.velocity; 
});

gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
});
gsap.ticker.lagSmoothing(0);

// --- 2. SETUP CENA ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000); 
scene.fog = new THREE.Fog(0x000000, 15, 60); 

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 18); 

const renderer = new THREE.WebGLRenderer({ 
    canvas: document.querySelector('#webgl'), 
    antialias: false, 
    alpha: false,
    powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);

// OTIMIZAÇÃO: Menor PixelRatio no Mobile para ganhar FPS
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.0 : 1.5)); 

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0; 
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// --- 3. POST-PROCESSING ---
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// OTIMIZAÇÃO: Bloom ajustado para Mobile
const bloomStrength = isMobile ? 0.2 : 0.35; // Menos brilho no mobile
const bloomRadius = isMobile ? 0.3 : 0.5;

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.85; 
bloomPass.strength = bloomStrength; 
bloomPass.radius = bloomRadius;    
composer.addPass(bloomPass);

const outputPass = new OutputPass(); 
composer.addPass(outputPass); 

// --- 4. ÁUDIO INTERATIVO ---
const hoverSound = new Audio('./assets/chime.mp3'); 
hoverSound.volume = 0.2; 

function playRandomChime() {
    // Verifica se o usuário interagiu antes de tentar tocar (Política de browsers)
    if(!hoverSound.paused) {
        hoverSound.currentTime = 0; 
    }
    hoverSound.playbackRate = 0.8 + Math.random() * 0.4; 
    hoverSound.play().catch(() => {}); // Catch para evitar erro se não houve interação
}

// --- 5. ILUMINAÇÃO ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.05); 
scene.add(ambientLight);

const spotLight = new THREE.SpotLight(0xffeebb, 800); 
spotLight.position.set(15, 25, 15); 
spotLight.angle = 0.4; 
spotLight.penumbra = 1; 
spotLight.castShadow = true;
spotLight.shadow.mapSize.width = 1024; 
spotLight.shadow.mapSize.height = 1024; 
spotLight.shadow.bias = -0.0001; 
scene.add(spotLight);

const spotLightTarget = new THREE.Object3D(); 
spotLightTarget.position.set(0, 0, 0); 
scene.add(spotLightTarget); 
spotLight.target = spotLightTarget; 

const blueRim = new THREE.PointLight(0x0044ff, 100); 
blueRim.position.set(-10, 0, -10); 
scene.add(blueRim);

const goldFill = new THREE.PointLight(0xffaa00, 60); 
goldFill.position.set(10, -5, 5); 
scene.add(goldFill);

// --- 6. SHADERS & MATERIAIS ---

function getSoftGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)'); 
    grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
    grad.addColorStop(0.5, 'rgba(255, 215, 0, 0.2)'); 
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

// GOD RAYS
const raysVertexShader = `varying vec2 vUv; varying vec3 vPosition; void main() { vUv = uv; vPosition = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const raysFragmentShader = `uniform float uTime; varying vec2 vUv; float noise(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); } void main() { float angle = vUv.x * 20.0; float ray = sin(angle + uTime * 0.5) * 0.5 + 0.5; float dust = noise(vUv * 10.0 + vec2(0.0, -uTime * 0.8)); float fade = smoothstep(0.0, 0.3, vUv.y) * (1.0 - smoothstep(0.8, 1.0, vUv.y)); gl_FragColor = vec4(vec3(1.0, 0.9, 0.7), (ray * 0.3 + dust * 0.2) * fade * 0.4); }`;
const godRaysMaterial = new THREE.ShaderMaterial({ vertexShader: raysVertexShader, fragmentShader: raysFragmentShader, uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });

// CAUSTICS
const causticsVertexShader = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const causticsFragmentShader = `uniform float uTime; varying vec2 vUv; float caustic(vec2 uv) { vec2 p = mod(uv * 6.28, 6.28) - 250.0; float c = 1.0; for (int n = 0; n < 5; n++) { float t = uTime * (1.0 - (3.5 / float(n+1))); p += vec2(cos(t - p.x) + sin(t + p.y), sin(t - p.y) + cos(t + p.x)); c += 1.0/length(vec2(p.x / (sin(p.x+t)/0.005),p.y / (cos(p.y+t)/0.005))); } return pow(abs(1.17 - pow(c/5.0, 1.4)), 8.0); } void main() { float val = caustic(vUv * vec2(8.0, 4.0)); float mask = 1.0 - smoothstep(0.1, 0.45, distance(vec2(vUv.x * 0.3, vUv.y), vec2(0.15, 0.5))); gl_FragColor = vec4(vec3(0.8, 0.6, 0.2) * val, val * mask * 0.6); }`;
const causticsMaterial = new THREE.ShaderMaterial({ vertexShader: causticsVertexShader, fragmentShader: causticsFragmentShader, uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

// HALO
const haloVertexShader = `varying vec3 vNormal; void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const haloFragmentShader = `varying vec3 vNormal; void main() { float intensity = pow(0.6 - dot(vNormal, vec3(0,0,1)), 4.0); gl_FragColor = vec4(1.0, 0.7, 0.2, 1.0) * intensity * 1.5; }`;
const haloMaterial = new THREE.ShaderMaterial({ vertexShader: haloVertexShader, fragmentShader: haloFragmentShader, blending: THREE.AdditiveBlending, side: THREE.FrontSide, transparent: true, depthWrite: false });

// LIQUID GOLD
const liquidVertexShader = `varying vec2 vUv; varying vec3 vPosition; varying vec3 vNormal; void main() { vUv = uv; vPosition = position; vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const liquidFragmentShader = `uniform float uTime; uniform vec3 uColorA; uniform vec3 uColorB; varying vec2 vUv; varying vec3 vPosition; varying vec3 vNormal; float noise(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); } void main() { float n = noise(vUv * 4.0 + uTime * 0.2); float fresnel = pow(1.0 - dot(normalize(cameraPosition - vPosition), vNormal), 3.0); vec3 color = mix(uColorA, uColorB, n) + vec3(1.0, 0.9, 0.5) * fresnel * 1.5; gl_FragColor = vec4(color, 1.0); }`;
const customGoldMaterial = new THREE.ShaderMaterial({ vertexShader: liquidVertexShader, fragmentShader: liquidFragmentShader, uniforms: { uTime: { value: 0 }, uColorA: { value: new THREE.Color(0xAA6C39) }, uColorB: { value: new THREE.Color(0xFFD700) } } });

// DUST PARTICLES
const dustVertexShader = `uniform float uTime; uniform float uSize; varying vec3 vWorldPos; void main() { vec4 worldPosition = modelMatrix * vec4(position, 1.0); vWorldPos = worldPosition.xyz; vec4 mvPosition = viewMatrix * worldPosition; gl_Position = projectionMatrix * mvPosition; gl_PointSize = uSize * (120.0 / -mvPosition.z); }`;
const dustFragmentShader = `uniform vec3 uLightPos; uniform vec3 uLightTarget; uniform float uTime; varying vec3 vWorldPos; void main() { vec2 coord = gl_PointCoord - vec2(0.5); float dist = length(coord); if(dist > 0.5) discard; float circle = 1.0 - smoothstep(0.3, 0.5, dist); vec3 lightDir = normalize(uLightTarget - uLightPos); vec3 toPart = normalize(vWorldPos - uLightPos); float angle = dot(lightDir, toPart); float inLight = smoothstep(0.92, 0.98, angle); float twinkle = sin(uTime * 5.0 + vWorldPos.x * 10.0) * 0.5 + 0.5; vec3 baseColor = vec3(0.7, 0.5, 0.2); vec3 litColor = vec3(1.0, 1.0, 0.9); vec3 finalColor = mix(baseColor, litColor, inLight); float alpha = mix(0.2, 0.8 + (twinkle * 0.2), inLight); gl_FragColor = vec4(finalColor, alpha * circle); }`;
const dustMaterial = new THREE.ShaderMaterial({ vertexShader: dustVertexShader, fragmentShader: dustFragmentShader, uniforms: { uTime: { value: 0 }, uSize: { value: 0.18 }, uLightPos: { value: new THREE.Vector3() }, uLightTarget: { value: new THREE.Vector3() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

// --- MATERIAIS PADRÃO ---
const envMapLoader = new RGBELoader();
let envMap;
const goldPolished = new THREE.MeshPhysicalMaterial({ color: 0xffd700, metalness: 1.0, roughness: 0.1, clearcoat: 1.0, envMapIntensity: 3.0 });
const goldBrushed = new THREE.MeshPhysicalMaterial({ color: 0xaa8800, metalness: 1.0, roughness: 0.65, envMapIntensity: 1.5 });
const crystalMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.0, transmission: 1.0, thickness: 2.5, ior: 1.8, envMapIntensity: 4.0 });
const lightCoreMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 1.0 });
const mainGroup = new THREE.Group(); 
scene.add(mainGroup);

// --- 7. OBJETOS ---
const raysMesh = new THREE.Mesh(new THREE.CylinderGeometry(5, 12, 40, 32, 1, true), godRaysMaterial);
raysMesh.position.set(15, 25, 15); raysMesh.rotation.x = Math.PI / 2; scene.add(raysMesh);
const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(100, 40), causticsMaterial);
floorMesh.rotation.x = -Math.PI / 2; floorMesh.position.y = -10; scene.add(floorMesh);

function createLuxuryBell(pos, scale) {
    const group = new THREE.Group(); group.position.copy(pos); group.scale.set(scale, scale, scale);
    const hitbox = new THREE.Mesh(new THREE.SphereGeometry(1.2), new THREE.MeshBasicMaterial({visible:false})); group.add(hitbox); group.userData.hitbox = hitbox;
    const points = []; for (let i = 0; i < 10; i++) points.push(new THREE.Vector2(Math.sin(i * 0.2) * 0.5 + 0.3, (i - 5) * 0.2)); points.push(new THREE.Vector2(1.0, -1.2)); points.push(new THREE.Vector2(1.1, -1.3)); points.push(new THREE.Vector2(0.9, -1.3));
    const bell = new THREE.Mesh(new THREE.LatheGeometry(points, 64), goldBrushed); group.add(bell);
    const handle = new THREE.Mesh(new THREE.TorusKnotGeometry(0.25, 0.05, 64, 8, 2, 3), goldPolished); handle.position.y = 1.0; group.add(handle);
    const clapper = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 16).translate(0, -0.25, 0), crystalMat); clapper.add(new THREE.Mesh(new THREE.SphereGeometry(0.2), crystalMat)); clapper.children[0].position.y = 0.25; clapper.position.y = -0.8; group.add(clapper);
    group.userData.rotateSpeed = (Math.random() * 0.01) + 0.005; group.userData.initialY = pos.y; group.userData.clapper = clapper; group.userData.type = 'bell'; 
    return group;
}
function createCrystalStar(pos, scale) {
    const group = new THREE.Group(); group.position.copy(pos); group.scale.set(scale, scale, scale);
    const hitbox = new THREE.Mesh(new THREE.SphereGeometry(1.3), new THREE.MeshBasicMaterial({visible:false})); group.add(hitbox); group.userData.hitbox = hitbox;
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), crystalMat); group.add(core);
    const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), goldPolished.clone()); wire.material.wireframe = true; group.add(wire);
    const spikeGeo = new THREE.ConeGeometry(0.1, 2.2, 8); const directions = new THREE.IcosahedronGeometry(1,0).attributes.position.array;
    for (let i = 0; i < directions.length; i += 3) { const dir = new THREE.Vector3(directions[i], directions[i+1], directions[i+2]).normalize(); const mat = (i % 2 === 0) ? crystalMat : goldPolished; const spike = new THREE.Mesh(spikeGeo, mat); spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); spike.position.copy(dir.multiplyScalar(0.7)); group.add(spike); }
    core.add(new THREE.Mesh(new THREE.SphereGeometry(0.3), lightCoreMat));
    group.userData.rotateSpeed = (Math.random() * 0.015) + 0.005; group.userData.initialY = pos.y; group.userData.type = 'star';
    return group;
}
function createFacetedBauble(pos, scale, baseMat) {
    const group = new THREE.Group(); group.position.copy(pos); group.scale.set(scale, scale, scale);
    const hitbox = new THREE.Mesh(new THREE.SphereGeometry(1.2), new THREE.MeshBasicMaterial({visible:false})); group.add(hitbox); group.userData.hitbox = hitbox;
    const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 8), baseMat); sphere.castShadow = true; sphere.receiveShadow = true; group.add(sphere);
    const cage = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 2), goldPolished.clone()); cage.material.wireframe = true; group.add(cage);
    const ringGeo = new THREE.TorusGeometry(1.1, 0.015, 16, 64); const ring1 = new THREE.Mesh(ringGeo, goldPolished); ring1.rotation.x = Math.PI / 2; group.add(ring1); const ring2 = new THREE.Mesh(ringGeo, goldPolished); ring2.rotation.y = Math.PI / 2.5; group.add(ring2);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.20, 0.25, 16), goldPolished); cap.position.y = 0.85; group.add(cap); const hook = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 16), goldPolished); hook.position.y = 1.0; hook.rotation.y = Math.PI / 2; group.add(hook);
    group.userData.rotateSpeed = (Math.random() * 0.005) + 0.002; group.userData.initialY = pos.y; group.userData.rings = [cage, ring1, ring2]; group.userData.type = 'bauble';
    return group;
}

// --- CARREGAMENTO ---
// Mude de 'assets/env.hdr' para:
envMapLoader.load('./assets/env.hdr', function (texture) {
    envMap = texture; envMap.mapping = THREE.EquirectangularReflectionMapping; scene.environment = envMap; scene.environmentRotation = new THREE.Euler(0,0,0); 
    const heroBauble = createFacetedBauble(new THREE.Vector3(0, -2.5, -2), 3.2, customGoldMaterial); 
    heroBauble.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 4), haloMaterial));
    mainGroup.add(heroBauble);
    const star1 = createCrystalStar(new THREE.Vector3(-6, 5, -4), 1.7); mainGroup.add(star1);
    const bell1 = createLuxuryBell(new THREE.Vector3(8, -2, -2), 1.5); mainGroup.add(bell1);
    const bauble2 = createFacetedBauble(new THREE.Vector3(-5, -5, 2), 1.4, goldBrushed); mainGroup.add(bauble2);
    const star2 = createCrystalStar(new THREE.Vector3(-6, 0, -1), 1.1); mainGroup.add(star2);
    const bell2 = createLuxuryBell(new THREE.Vector3(6, 8, -2), 1.2); mainGroup.add(bell2);
    const bauble3 = createFacetedBauble(new THREE.Vector3(3, -4, -5), 1.8, crystalMat); mainGroup.add(bauble3);
    mainGroup.userData.themedObjects = [heroBauble, star1, bell1, bauble2, star2, bell2, bauble3]; mainGroup.userData.hero = heroBauble;
    document.querySelector('.preloader .line').style.width = '100%';
    setTimeout(() => { document.querySelector('.preloader').style.transform = 'translateY(-100%)'; setTimeout(() => initScrollAnimations(), 500); }, 1000);
});

// --- PARTICULAS DE FUNDO (OTIMIZADO) ---
const pGeo = new THREE.BufferGeometry(); 
// OTIMIZAÇÃO: Menos partículas no mobile
const pCount = isMobile ? 800 : 3000; 
const pPos = new Float32Array(pCount * 3); 
const pOriginalPos = new Float32Array(pCount * 3); 
const pVel = []; 
for(let i=0; i<pCount; i++) { 
    const x = (Math.random() - 0.5) * 70; const y = (Math.random() - 0.5) * 70; const z = (Math.random() - 0.5) * 50;
    pPos[i*3] = x; pPos[i*3+1] = y; pPos[i*3+2] = z;
    pOriginalPos[i*3] = x; pOriginalPos[i*3+1] = y; pOriginalPos[i*3+2] = z;
    pVel.push({ y: (Math.random() * 0.02) + 0.005, x: (Math.random() - 0.5) * 0.01, z: (Math.random() - 0.5) * 0.01 }); 
}
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const particles = new THREE.Points(pGeo, dustMaterial); scene.add(particles);

// --- RASTRO MINIMALISTA ---
const trailCount = isMobile ? 30 : 60; // Reduz rastro no mobile
const trailGeo = new THREE.BufferGeometry();
const trailPos = new Float32Array(trailCount * 3);
const trailSizes = new Float32Array(trailCount);
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
trailGeo.setAttribute('size', new THREE.BufferAttribute(trailSizes, 1));

const trailMat = new THREE.PointsMaterial({
    color: 0xffeebb, 
    map: getSoftGlowTexture(),
    transparent: true,
    opacity: 0.5,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});
const trail = new THREE.Points(trailGeo, trailMat);
scene.add(trail);

const trailData = [];
for(let i=0; i<trailCount; i++) {
    trailData.push({
        vx: (Math.random() - 0.5) * 0.01, 
        vy: (Math.random() - 0.5) * 0.01,
        vz: (Math.random() - 0.5) * 0.01,
        life: 0, 
        maxLife: 0.5 + Math.random() * 0.5 
    });
    trailPos[i*3] = 9999;
}

// --- LOOP & LÓGICA DE INTERAÇÃO ---
const raycaster = new THREE.Raycaster(); 
const mouseVector = new THREE.Vector2();
let mouseX = 0, mouseY = 0; let targetMouseX = 0, targetMouseY = 0; 
let currentIntersects = []; 

window.addEventListener('mousemove', (e) => { 
    targetMouseX = (e.clientX / window.innerWidth - 0.5) * 2; 
    targetMouseY = (e.clientY / window.innerHeight - 0.5) * 2; 
    mouseVector.x = (e.clientX / window.innerWidth) * 2 - 1; 
    mouseVector.y = -(e.clientY / window.innerHeight) * 2 + 1; 
});

// GIROSCÓPIO MOBILE
if (isMobile && window.DeviceOrientationEvent) {
    window.addEventListener("deviceorientation", (event) => {
        const tiltX = (event.gamma || 0) / 45; 
        const tiltY = (event.beta || 0) / 45;  
        targetMouseX = Math.max(-1, Math.min(1, tiltX));
        targetMouseY = Math.max(-1, Math.min(1, tiltY));
    }, true);
}

function animate() {
    requestAnimationFrame(animate); 
    frameCount++;

    let time = performance.now() * 0.001;
    if(customGoldMaterial.uniforms) customGoldMaterial.uniforms.uTime.value = time;
    if(godRaysMaterial.uniforms) godRaysMaterial.uniforms.uTime.value = time;
    if(causticsMaterial.uniforms) causticsMaterial.uniforms.uTime.value = time;
    if(dustMaterial.uniforms) {
        dustMaterial.uniforms.uTime.value = time; dustMaterial.uniforms.uLightPos.value.copy(spotLight.position); dustMaterial.uniforms.uLightTarget.value.copy(spotLightTarget.position);
        dustMaterial.uniforms.uSize.value = 0.18 + Math.min(Math.abs(scrollSpeed) * 0.002, 0.05); 
    }
    
    if (scene.environment) {
        scene.environmentRotation.y = (time * 0.05) + (mouseX * 1.5);
        scene.environmentRotation.x = (Math.sin(time * 0.2) * 0.1) - (mouseY * 0.8);
        scene.environmentRotation.z = Math.cos(time * 0.15) * 0.05;
    }

    // Camera Smooth
    const noiseX = (Math.sin(time * 0.5) * 0.5) + (Math.cos(time * 0.2) * 0.5); 
    const noiseY = (Math.cos(time * 0.3) * 0.5) + (Math.sin(time * 0.15) * 0.5);
    const zoomBreathing = Math.sin(time * 0.2); 
    const targetFOV = 45 + (zoomBreathing * 1.5); 
    camera.fov += (targetFOV - camera.fov) * 0.02; 
    camera.updateProjectionMatrix(); 
    
    camera.position.x += ((mouseX * 0.5 + noiseX) - camera.position.x) * 0.05; 
    camera.position.y += ((mouseY * 0.3 + noiseY) - camera.position.y) * 0.05;
    camera.lookAt(noiseX * 2.0, noiseY * 1.0, 0); 
    camera.rotation.z = Math.sin(time * 0.1) * 0.02;

    // Mouse Smooth
    mouseX += (targetMouseX - mouseX) * 0.05; 
    mouseY += (targetMouseY - mouseY) * 0.05;

    // Light Follow
    spotLight.position.x = 15 + (mouseX * 12); 
    spotLight.position.y = 25 + (-mouseY * 8); 
    spotLightTarget.position.x = mouseX * 8; 
    spotLightTarget.position.y = -mouseY * 8;
    raysMesh.position.copy(spotLight.position); 
    raysMesh.lookAt(spotLightTarget.position); 
    raysMesh.rotateX(Math.PI / 2); 
    
    mainGroup.rotation.y += 0.002; 
    mainGroup.rotation.x += (-mouseY * 0.15 - mainGroup.rotation.x) * 0.05; 
    mainGroup.rotation.y += (mouseX * 0.15 - mainGroup.rotation.y * 0.05) * 0.05;

    // Particles Update
    const pPosArr = particles.geometry.attributes.position.array; 
    const mouseWorldX = mouseX * 25; 
    const mouseWorldY = mouseY * 15;
    const turbulence = 1.0 + Math.abs(scrollSpeed) * 2.0; 

    for(let i=0; i<pCount; i++) { 
        const ix = i * 3; const iy = i * 3 + 1; const iz = i * 3 + 2;
        pPosArr[iy] -= pVel[i].y; 
        pPosArr[iy] += scrollSpeed * 0.005; 
        pPosArr[ix] += Math.sin(time * turbulence + pPosArr[iy] * 0.05) * 0.005; 
        
        const dx = mouseWorldX - pPosArr[ix]; 
        const dy = mouseWorldY - pPosArr[iy]; 
        const distSq = dx*dx + dy*dy; 
        
        if (distSq < 16.0) { 
            const dist = Math.sqrt(distSq);
            const force = (4.0 - dist) / 4.0; 
            const angle = Math.atan2(dy, dx); 
            pPosArr[ix] -= Math.cos(angle) * force * 0.5; 
            pPosArr[iy] -= Math.sin(angle) * force * 0.5; 
        } else { 
            pPosArr[ix] += (pOriginalPos[ix] - pPosArr[ix]) * 0.02; 
            pPosArr[iz] += (pOriginalPos[iz] - pPosArr[iz]) * 0.02; 
        }
        
        if (pPosArr[iy] < -35) { 
            pPosArr[iy] = 35; pPosArr[ix] = (Math.random() - 0.5) * 70; pPosArr[iz] = (Math.random() - 0.5) * 50; 
            pOriginalPos[ix] = pPosArr[ix]; pOriginalPos[iz] = pPosArr[iz]; 
        }
        if (pPosArr[iy] > 35) pPosArr[iy] = -35;
    }
    particles.geometry.attributes.position.needsUpdate = true;

    // --- LOGICA RASTRO MINIMALISTA ---
    raycaster.setFromCamera(mouseVector, camera);
    const trailPoint = new THREE.Vector3();
    raycaster.ray.at(15, trailPoint); 

    let particlesSpawned = 0;
    
    for(let i=0; i<trailCount; i++) {
        if (trailData[i].life <= 0 && particlesSpawned < 2) { 
            trailData[i].life = trailData[i].maxLife;
            
            trailPos[i*3] = trailPoint.x + (Math.random()-0.5)*0.05;
            trailPos[i*3+1] = trailPoint.y + (Math.random()-0.5)*0.05;
            trailPos[i*3+2] = trailPoint.z + (Math.random()-0.5)*0.05;
            particlesSpawned++;
        }

        if (trailData[i].life > 0) {
            trailData[i].life -= 0.02; 
            trailPos[i*3] += trailData[i].vx;
            trailPos[i*3+1] += trailData[i].vy; 
            trailPos[i*3+2] += trailData[i].vz;

            const normLife = trailData[i].life / trailData[i].maxLife;
            
            trailSizes[i] = Math.sin(normLife * Math.PI) * 0.15; 
        } else {
            trailSizes[i] = 0; 
        }
    }
    trail.geometry.attributes.position.needsUpdate = true;
    trail.geometry.attributes.size.needsUpdate = true;

    // Raycaster Otimizado + SOM
    if (frameCount % 5 === 0) {
        raycaster.setFromCamera(mouseVector, camera); 
        currentIntersects = raycaster.intersectObjects(mainGroup.children, true);
    }

    if (mainGroup.userData.themedObjects) {
        const hero = mainGroup.userData.hero; 
        hero.rotation.y += 0.005; 
        hero.position.y = hero.userData.initialY + Math.sin(time * 0.8) * 0.5;
        
        if(hero.userData.rings) { 
            hero.userData.rings[0].rotation.y -= 0.01; 
            hero.userData.rings[0].rotation.z += 0.005; 
            hero.userData.rings[1].rotation.x += 0.01; 
            hero.userData.rings[2].rotation.y -= 0.015; 
        }
        
        mainGroup.userData.themedObjects.forEach((group) => {
            let isHovered = false; 
            if (group.userData.hitbox) { 
                for (let hit of currentIntersects) { 
                    if (hit.object === group.userData.hitbox) isHovered = true; 
                } 
            }
            
            if (isHovered) {
                if (!group.userData.wasHovered) {
                    playRandomChime(); 
                    group.userData.wasHovered = true;
                }
            } else {
                group.userData.wasHovered = false;
            }

            const targetScale = isHovered ? 1.15 : 1.0; 
            group.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
            
            if (group !== hero) {
                if (group.userData.type === 'bell') { 
                    const swing = isHovered ? Math.sin(time * 15) * 0.3 : Math.sin(time * 3) * 0.1; 
                    group.rotation.z += (swing - group.rotation.z) * 0.1; 
                    group.userData.clapper.rotation.z = swing * 1.5; 
                } else if (group.userData.type === 'star') { 
                    group.rotation.y += group.userData.rotateSpeed * (isHovered?4:1); 
                    group.rotation.z += isHovered ? 0.05 : 0; 
                } else { 
                    group.rotation.y += (group.userData.rotateSpeed / 2) * (isHovered?4:1); 
                }
            }
        });
    }
    
    composer.render();
}
animate();

window.addEventListener('resize', () => { 
    camera.aspect = window.innerWidth/window.innerHeight; 
    camera.updateProjectionMatrix(); 
    renderer.setSize(window.innerWidth, window.innerHeight); 
    composer.setSize(window.innerWidth, window.innerHeight); 
    bloomPass.resolution.set(window.innerWidth, window.innerHeight); 
});

function splitTextIntoSpans(s) { document.querySelectorAll(s).forEach(el => { const t = el.innerText; el.innerHTML = ''; t.split('').forEach(c => { const span = document.createElement('span'); span.innerHTML = c === ' ' ? '&nbsp;' : c; el.appendChild(span); }); }); }

function initScrollAnimations() {
    gsap.to(".scroll-progress", { width: "100%", ease: "none", scrollTrigger: { trigger: "body", start: "top top", end: "bottom bottom", scrub: 0 } });
    gsap.to(camera.position, { z: 8, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 1 } });
    
    const tl = gsap.timeline({ defaults: { ease: "power4.out" } });
    const ids = ['#t1 span','#t2 span','#t3 span','#t4 span','#t5 span']; 
    if(document.querySelector(ids[0])) tl.fromTo(ids, { y: '110%' }, { y: '0%', duration: 1.8, stagger: 0.1 }, 0.1);
    
    if(mainGroup.userData.hero) gsap.from(mainGroup.scale, { duration: 2.5, x:0, y:0, z:0, ease: "elastic.out(1, 0.5)" });
    
    gsap.to(mainGroup.rotation, { y: Math.PI * 2, scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 1 } });
    
    splitTextIntoSpans('.editorial-section h2');
    
    document.querySelectorAll('.content-row').forEach((row) => { 
        const c = row.querySelectorAll('h2 span'); 
        const p = row.querySelector('p'); 
        const t = gsap.timeline({ scrollTrigger: { trigger: row, start: "top 75%", toggleActions: "play none none reverse" } }); 
        t.fromTo(c, { y: 100, rotationX: -90, opacity: 0, filter: "blur(10px)" }, { y: 0, rotationX: 0, opacity: 1, filter: "blur(0px)", stagger: 0.03, duration: 1.2, ease: "power4.out" }).to(p, { y: 0, opacity: 1, filter: "blur(0px)", duration: 1.5, ease: "power2.out" }, "-=0.8"); 
    });
    
    document.querySelectorAll('.quote-container').forEach(q => { 
        gsap.fromTo(q, { opacity: 0, scale: 0.9, y: 50 }, { opacity: 1, scale: 1, y: 0, duration: 2, ease: "power2.out", scrollTrigger: { trigger: q, start: "top 75%", end: "bottom 20%", toggleActions: "play none none reverse" } }); 
    });
    
    document.querySelectorAll('.finale-img-container').forEach((c) => { 
        const i = c.querySelector('img'); 
        const l = c.querySelector('.img-label'); 
        const t = gsap.timeline({ scrollTrigger: { trigger: c, start: "top 85%", end: "bottom 20%", toggleActions: "play none none reverse" } }); 
        t.fromTo(c, { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 1.5, ease: "expo.out" }).fromTo(i, { scale: 1.4 }, { scale: 1.0, duration: 2, ease: "power2.out" }, "<").fromTo(l, { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1, ease: "back.out(1.7)" }, "-=1.5"); 
        gsap.to(i, { y: "20%", ease: "none", scrollTrigger: { trigger: c, start: "top bottom", end: "bottom top", scrub: true } }); 
    });
}

// LOGICA DE SOM (CORRIGIDA)
const sb = document.getElementById('sound-btn'); 
const am = document.getElementById('ambient-music'); 
let ip = false;
if (sb && am) { 
    am.volume = 0.5; 
    sb.addEventListener('click', () => { 
        if (!ip) { 
            // Toca a música
            am.play().then(() => { 
                ip = true; 
                sb.classList.add('sound-active'); 
                sb.querySelector('.sound-text').innerText = "SOM ON"; 
                gsap.fromTo(am, {volume: 0}, {volume: 0.5, duration: 2}); 
            }).catch(e => console.error("Erro ao tocar áudio:", e)); 
        } else { 
            // Pausa a música
            gsap.to(am, { volume: 0, duration: 1.0, onComplete: () => { 
                am.pause(); 
                ip = false; 
                sb.classList.remove('sound-active'); 
                sb.querySelector('.sound-text').innerText = "SOM OFF"; 
            }}); 
        } 
    }); 
}

// CURSOR CUSTOMIZADO (LÓGICA JS)
const cr = document.querySelector('.custom-cursor'); 
const fl = document.querySelector('.cursor-follower');
if (cr && fl) {
    window.addEventListener('mousemove', (e) => { 
        gsap.to(cr, { x: e.clientX, y: e.clientY, duration: 0 }); 
        gsap.to(fl, { x: e.clientX, y: e.clientY, duration: 0.5, ease: "power2.out" }); 
    });

    document.querySelectorAll('a, button, .finale-img-container, .sound-toggle').forEach(el => { 
        el.addEventListener('mouseenter', () => { document.body.classList.add('cursor-hover'); }); 
        el.addEventListener('mouseleave', () => { document.body.classList.remove('cursor-hover'); }); 
    });
}