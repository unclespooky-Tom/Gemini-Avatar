const sourceImage = document.getElementById('source-image');
const avatarCanvas = document.getElementById('avatar-canvas');
const ctx = avatarCanvas.getContext('2d');
const imageUpload = document.getElementById('image-upload');

const uploadPrompt = document.getElementById('upload-prompt');
const statusBtn = document.getElementById('toggle-idle');

const menuToggle = document.getElementById('menu-toggle');
const menuClose = document.getElementById('menu-close');
const sideMenu = document.getElementById('side-menu');
const editorToggle = document.getElementById('editor-toggle');

const dragHandleInner = document.getElementById('drag-handle-inner');
const shapeSelect = document.getElementById('shape-select');
const avatarFrame = document.getElementById('avatar-frame');

const voiceToggle = document.getElementById('voice-toggle');
const voiceSelect = document.getElementById('voice-select');
const panContainer = document.getElementById('pan-container');

// Application State
const state = {
    isSpeaking: false,
    faceLandmarker: null,
    isEditorMode: false
};

let detectedLandmarks = null;
let customMeshPoints = null;
let targetPoints = null;
let delaunayIndices = null;

// ==========================================
// Extension Message Protocols
// ==========================================
window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'GEMINI_SPEAK') {
        speakText(e.data.text);
    }
});

// Settings Overlay Toggles
menuToggle.addEventListener('click', () => {
    sideMenu.classList.add('open');
    if (window.parent) window.parent.postMessage({ type: 'WIDGET_EXPAND', target: 'menu' }, '*');
});
menuClose.addEventListener('click', () => {
    sideMenu.classList.remove('open');
    if (window.parent) window.parent.postMessage({ type: 'WIDGET_COLLAPSE' }, '*');
});

// Shape Selector
shapeSelect.addEventListener('change', (e) => {
    if (e.target.value === 'square') {
        avatarFrame.classList.remove('circle-shape');
        avatarFrame.classList.add('square-shape');
    } else {
        avatarFrame.classList.add('circle-shape');
        avatarFrame.classList.remove('square-shape');
    }
});

// ==========================================
// Embedded Frame Drag Controls
// ==========================================
let isDraggingWidgetFrame = false;
let widgetStartX, widgetStartY;

dragHandleInner.addEventListener('mousedown', (e) => {
    isDraggingWidgetFrame = true;
    widgetStartX = e.screenX;
    widgetStartY = e.screenY;
    if (window.parent) window.parent.postMessage({ type: 'DRAG_START' }, '*');
    e.preventDefault();
});
window.addEventListener('mousemove', (e) => {
    if (isDraggingWidgetFrame) {
        const dx = e.screenX - widgetStartX;
        const dy = e.screenY - widgetStartY;
        widgetStartX = e.screenX;
        widgetStartY = e.screenY;
        if (window.parent) window.parent.postMessage({ type: 'DRAG_MOVE', dx, dy }, '*');
    }
});
window.addEventListener('mouseup', () => {
    if (isDraggingWidgetFrame) {
        isDraggingWidgetFrame = false;
        if (window.parent) window.parent.postMessage({ type: 'DRAG_END' }, '*');
    }
});

// ==========================================
// Image Panning Sub-System (For perfect framing)
// ==========================================
let isPanningImage = false;
let panStartX, panStartY;
let currentPanX = 0, currentPanY = 0;

panContainer.addEventListener('mousedown', (e) => {
    if (state.isEditorMode) return; // Let the editor handle clicks
    isPanningImage = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
});
window.addEventListener('mousemove', (e) => {
    if (isPanningImage) {
        const dx = e.clientX - panStartX;
        const dy = e.clientY - panStartY;
        panStartX = e.clientX;
        panStartY = e.clientY;
        
        currentPanX += dx;
        currentPanY += dy;
        
        sourceImage.style.transform = `translate(${currentPanX}px, ${currentPanY}px)`;
        avatarCanvas.style.transform = `translate(${currentPanX}px, ${currentPanY}px)`;
    }
});
window.addEventListener('mouseup', () => {
    isPanningImage = false;
});

// ==========================================
// Text-to-Speech logic
// ==========================================
let speechVoices = [];
window.speechSynthesis.onvoiceschanged = () => {
    speechVoices = window.speechSynthesis.getVoices();
    voiceSelect.innerHTML = '';
    speechVoices.forEach((v, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${v.name} (${v.lang})`;
        // Default to a female English voice
        if (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('zira')) {
            option.selected = true;
        }
        voiceSelect.appendChild(option);
    });
};

function speakText(text) {
    if (!voiceToggle.checked) return;
    
    // Basic text cleanup for clear speech
    const cleanText = text.replace(/[*_#]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    if (speechVoices.length > 0 && voiceSelect.value) {
        utterance.voice = speechVoices[voiceSelect.value];
    }
    
    utterance.onstart = () => {
        state.isSpeaking = true;
    };
    
    utterance.onend = () => {
        state.isSpeaking = false;
    };
    
    window.speechSynthesis.speak(utterance);
}

// ==========================================
// File Management & Pipeline
// ==========================================
imageUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        sourceImage.src = event.target.result;
        uploadPrompt.style.display = 'none';
        
        // Reset pan vectors on new image
        currentPanX = 0; currentPanY = 0;
        sourceImage.style.transform = 'translate(0px, 0px)';
        avatarCanvas.style.transform = 'translate(0px, 0px)';
        
        // Reveal the source image safely behind the canvas for processing geometry bounds
        sourceImage.classList.remove('hidden-layer');
        
        await processImageForAvatar();
    };
    reader.readAsDataURL(file);
});

async function processImageForAvatar() {
    if (!state.faceLandmarker) {
        statusBtn.textContent = 'Status: AI not ready';
        return;
    }
    
    statusBtn.textContent = 'Status: Detecting Face...';
    
    // Ensure image is loaded in DOM memory before processing
    await new Promise(resolve => {
        if (sourceImage.complete) resolve();
        else sourceImage.onload = resolve;
    });

    const results = state.faceLandmarker.detect(sourceImage);
    
    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        statusBtn.textContent = 'Status: Face Detected!';
        
        // Resize canvas to natural image bounds
        const w = sourceImage.naturalWidth || sourceImage.width;
        const h = sourceImage.naturalHeight || sourceImage.height;
        avatarCanvas.width = w;
        avatarCanvas.height = h;
        
        // Setup initial meshes geometry
        detectedLandmarks = results.faceLandmarks[0];
        customMeshPoints = detectedLandmarks.map(p => ({ x: p.x, y: p.y }));
        
        generateDelaunayMesh(w, h);
        
        // Soft hide the source image so we only see the warping canvas
        sourceImage.classList.add('hidden-layer');
        avatarCanvas.classList.remove('hidden-layer');
        
        requestAnimationFrame(drawAvatar);
    } else {
        statusBtn.textContent = 'Status: No Face Found';
        sourceImage.classList.remove('hidden-layer');
        avatarCanvas.classList.add('hidden-layer');
    }
}

function generateDelaunayMesh(width, height) {
    // Inject bounding anchor points so the edges of the image do not warp
    const anchors = [
        { x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 },
        { x: 0, y: 0.5 }, { x: 1, y: 0.5 },
        { x: 0, y: 1 }, { x: 0.5, y: 1 }, { x: 1, y: 1 }
    ];
    
    targetPoints = [...customMeshPoints, ...anchors];
    
    const coords = targetPoints.flatMap(p => [p.x, p.y]);
    const delaunay = new Delaunator(coords);
    delaunayIndices = delaunay.triangles;
}

// ==========================================
// Face Mesh Animation & Rendering
// ==========================================
// Standard mouth geometry indices in MediaPipe
const LOWER_LIP = [14, 15, 16, 17, 18, 200, 201, 314, 315, 316, 317, 318, 324, 325, 402, 403, 404, 405, 415, 416, 417];
const JAW = [148, 149, 150, 152, 176, 377, 378, 379];
const LOWER_MOUTH_MAP = new Set([...LOWER_LIP, ...JAW]);

let animationTime = 0;

function drawAvatar() {
    if (!delaunayIndices || !targetPoints) return;
    
    const w = avatarCanvas.width;
    const h = avatarCanvas.height;
    
    if (state.isEditorMode) {
        // Redraw only the source image and the points overlay
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(sourceImage, 0, 0, w, h);
        
        // Draw standard landmarks in slightly faded red
        ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
        for (let i = 0; i < detectedLandmarks.length; i++) {
            const p = customMeshPoints[i];
            ctx.beginPath();
            ctx.arc(p.x * w, p.y * h, 2, 0, 2 * Math.PI);
            ctx.fill();
        }
        
        // Highlight active drag point
        if (activePointIndex !== null) {
            ctx.fillStyle = 'chartreuse';
            const p = customMeshPoints[activePointIndex];
            ctx.beginPath();
            ctx.arc(p.x * w, p.y * h, 5, 0, 2 * Math.PI);
            ctx.fill();
        }
        
        requestAnimationFrame(drawAvatar);
        return;
    }
    
    // Normal rendering loop
    ctx.clearRect(0, 0, w, h);
    
    // Animate the target points structure
    const animatedPoints = targetPoints.map((pt, index) => {
        let newY = pt.y;
        if (state.isSpeaking && LOWER_MOUTH_MAP.has(index)) {
            // Apply sine wave bounce for synthetic lipsync
            newY += (Math.sin(animationTime * 0.4) * 0.015) + 0.005; 
        }
        return { x: pt.x, y: newY };
    });
    
    if (state.isSpeaking) {
        animationTime++;
    }

    // Warp and draw each triangle
    for (let i = 0; i < delaunayIndices.length; i += 3) {
        const i0 = delaunayIndices[i];
        const i1 = delaunayIndices[i+1];
        const i2 = delaunayIndices[i+2];

        const srcTris = [
            { x: targetPoints[i0].x * w, y: targetPoints[i0].y * h },
            { x: targetPoints[i1].x * w, y: targetPoints[i1].y * h },
            { x: targetPoints[i2].x * w, y: targetPoints[i2].y * h }
        ];

        const dstTris = [
            { x: animatedPoints[i0].x * w, y: animatedPoints[i0].y * h },
            { x: animatedPoints[i1].x * w, y: animatedPoints[i1].y * h },
            { x: animatedPoints[i2].x * w, y: animatedPoints[i2].y * h }
        ];

        drawTexturedTriangle(
            ctx, sourceImage,
            srcTris[0], srcTris[1], srcTris[2],
            dstTris[0], dstTris[1], dstTris[2]
        );
    }
    
    requestAnimationFrame(drawAvatar);
}

// Mathematics for affine transform matrix applied to canvas
function drawTexturedTriangle(ctx, img, p0, p1, p2, t0, t1, t2) {
    ctx.save();
    
    // Clip to target projection path
    ctx.beginPath();
    ctx.moveTo(t0.x, t0.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.lineTo(t2.x, t2.y);
    ctx.closePath();
    ctx.clip();
    
    // Linear system for transform: [x'] = [a c e][x]
    //                              [y'] = [b d f][y]
    //                              [1 ]   [0 0 1][1]
    const d = p0.x * (p1.y - p2.y) + p1.x * (p2.y - p0.y) + p2.x * (p0.y - p1.y);
    if (d === 0) { ctx.restore(); return; }
    
    const a = (t0.x * (p1.y - p2.y) + t1.x * (p2.y - p0.y) + t2.x * (p0.y - p1.y)) / d;
    const b = (t0.y * (p1.y - p2.y) + t1.y * (p2.y - p0.y) + t2.y * (p0.y - p1.y)) / d;
    const c = (t0.x * (p2.x - p1.x) + t1.x * (p0.x - p2.x) + t2.x * (p1.x - p0.x)) / d;
    const d2 = (t0.y * (p2.x - p1.x) + t1.y * (p0.x - p2.x) + t2.y * (p1.x - p0.x)) / d;
    const e = (t0.x * (p1.x * p2.y - p2.x * p1.y) + t1.x * (p2.x * p0.y - p0.x * p2.y) + t2.x * (p0.x * p1.y - p1.x * p0.y)) / d;
    const f = (t0.y * (p1.x * p2.y - p2.x * p1.y) + t1.y * (p2.x * p0.y - p0.x * p2.y) + t2.y * (p0.x * p1.y - p1.x * p0.y)) / d;
    
    ctx.transform(a, b, c, d2, e, f);
    ctx.drawImage(img, 0, 0);
    
    ctx.restore();
}

// ==========================================
// Motion Editor Interactivity
// ==========================================
let activePointIndex = null;

editorToggle.addEventListener('click', () => {
    state.isEditorMode = !state.isEditorMode;
    if (state.isEditorMode) {
        editorToggle.textContent = 'Save Landmarks';
        editorToggle.classList.add('primary');
        statusBtn.textContent = 'Status: Editor Mode';
        
        // Disable shape/container logic purely so interactions hit canvas properly
        avatarFrame.classList.remove('square-shape', 'circle-shape');
    } else {
        editorToggle.textContent = 'Motion Editor (Align Face)';
        editorToggle.classList.remove('primary');
        statusBtn.textContent = 'Status: Ready';
        
        // Re-apply chosen shape
        const shape = shapeSelect.value;
        if (shape === 'square') avatarFrame.classList.add('square-shape');
        else avatarFrame.classList.add('circle-shape');
        
        // Retriangulate based on new points
        const w = avatarCanvas.width;
        const h = avatarCanvas.height;
        generateDelaunayMesh(w, h);
    }
});

avatarCanvas.addEventListener('mousedown', (e) => {
    if (!state.isEditorMode) return;
    
    const rect = avatarCanvas.getBoundingClientRect();
    const scaleX = avatarCanvas.width / rect.width;
    const scaleY = avatarCanvas.height / rect.height;
    
    // We must invert the currentPan translations so our click maps back to natural canvas coords
    const clickX = ((e.clientX - rect.left) - currentPanX) * scaleX;
    const clickY = ((e.clientY - rect.top) - currentPanY) * scaleY;
    
    const w = avatarCanvas.width;
    const h = avatarCanvas.height;
    
    // Find closest landmark point
    let minDist = Infinity;
    let closestIdx = -1;
    
    for (let i = 0; i < customMeshPoints.length; i++) {
        const px = customMeshPoints[i].x * w;
        const py = customMeshPoints[i].y * h;
        
        const dist = Math.hypot(clickX - px, clickY - py);
        if (dist < 20 * Math.max(scaleX, scaleY) && dist < minDist) {
            minDist = dist;
            closestIdx = i;
        }
    }
    
    if (closestIdx !== -1) {
        activePointIndex = closestIdx;
    }
});

avatarCanvas.addEventListener('mousemove', (e) => {
    if (!state.isEditorMode || activePointIndex === null) return;
    
    const rect = avatarCanvas.getBoundingClientRect();
    const scaleX = avatarCanvas.width / rect.width;
    const scaleY = avatarCanvas.height / rect.height;
    
    const clickX = ((e.clientX - rect.left) - currentPanX) * scaleX;
    const clickY = ((e.clientY - rect.top) - currentPanY) * scaleY;
    
    customMeshPoints[activePointIndex].x = clickX / avatarCanvas.width;
    customMeshPoints[activePointIndex].y = clickY / avatarCanvas.height;
});

avatarCanvas.addEventListener('mouseup', () => {
    activePointIndex = null;
});

// ==========================================
// Extension Loading and Asset Resolvers
// ==========================================
window.addEventListener('DOMContentLoaded', async () => {
    try {
        statusBtn.textContent = 'Status: Fetching AI...';
        
        let mp;
        const hasChrome = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
        const hasBrowser = typeof browser !== 'undefined' && browser.runtime && browser.runtime.id;
        const isExtension = hasBrowser || hasChrome;
        
        const getExtURL = (path) => {
            if (hasBrowser) return browser.runtime.getURL(path);
            if (hasChrome) return chrome.runtime.getURL(path);
            return path;
        };
        
        if (isExtension) {
            // Use locally downloaded module to bypass Extension Content Security Policy
            mp = await import(getExtURL("assets/vision_bundle.js"));
            console.log("Loaded MediaPipe via local Extension assets.");
        } else {
            // Use CDN module to bypass file:// CORS restrictions and manual browser testing blocks
            mp = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3");
            console.log("Loaded MediaPipe via CDN network.");
        }
        
        if (!mp || !mp.FilesetResolver || !mp.FaceLandmarker) {
            throw new Error("Failed to extract MediaPipe Modules.");
        }
        
        window.FilesetResolver = mp.FilesetResolver;
        window.FaceLandmarker = mp.FaceLandmarker;
        
        statusBtn.textContent = 'Status: Loading Models...';
        
        const visionWasmPath = isExtension ? getExtURL("assets/wasm") : "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm";
        const modelAssetPath = isExtension ? getExtURL("assets/face_landmarker.task") : "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
        
        const vision = await FilesetResolver.forVisionTasks(visionWasmPath);
        state.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: modelAssetPath,
                delegate: "GPU"
            },
            outputFaceBlendshapes: true,
            runningMode: "IMAGE",
            numFaces: 1
        });
        statusBtn.textContent = 'Status: Ready';
    } catch (e) {
        console.error("Failed to load local/online AI files:", e);
        statusBtn.textContent = 'Status: Load Error (See Console)';
    }
});
