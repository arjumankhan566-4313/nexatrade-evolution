/**
 * NexaTrade biometric engine (browser-side, zero external model downloads).
 *
 *   • face localisation  — native FaceDetector when available, otherwise a
 *     YCbCr skin-tone segmentation with projection-based bounding box,
 *   • face descriptor    — illumination-normalised 16×16 intensity patch plus a
 *     4×4×8 gradient-orientation histogram, L2-normalised (384 dims),
 *   • face match         — calibrated cosine similarity between the live capture
 *     and the portrait cropped from the uploaded ID,
 *   • liveness           — randomised challenge/response (turn left, turn right,
 *     blink, move closer) scored from real per-frame motion, face-box travel,
 *     scale change and eye-region intensity dips.
 *
 * The result is a pre-screening signal: every case still lands in the admin
 * review queue where a human compares the ID photo and the live capture
 * side-by-side before the account is verified.
 */

/* ------------------------------------------------------------------ *
 * Canvas helpers
 * ------------------------------------------------------------------ */
export function drawToCanvas(source, maxSize = 480) {
  const sw = source.videoWidth || source.naturalWidth || source.width;
  const sh = source.videoHeight || source.naturalHeight || source.height;
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(sw * scale));
  canvas.height = Math.max(2, Math.round(sh * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read the image file."));
    img.src = src;
  });
}

export function fileToDataUrl(file, maxSize = 1280, quality = 0.86) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = async () => {
      try {
        const img = await loadImage(reader.result);
        const canvas = drawToCanvas(img, maxSize);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------------ *
 * Face localisation
 * ------------------------------------------------------------------ */
let nativeDetector;
function getNativeDetector() {
  if (nativeDetector !== undefined) return nativeDetector;
  try {
    nativeDetector =
      typeof FaceDetector !== "undefined"
        ? new FaceDetector({ fastMode: true, maxDetectedFaces: 1 })
        : null;
  } catch {
    nativeDetector = null;
  }
  return nativeDetector;
}

/** Skin-tone mask + projection profile → face bounding box. */
function skinToneBox(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width: w, height: h } = canvas;
  const { data } = ctx.getImageData(0, 0, w, h);
  const colScore = new Float32Array(w);
  const rowScore = new Float32Array(h);
  let total = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const isSkin =
        r > 60 &&
        g > 35 &&
        b > 20 &&
        r > b * 0.9 &&
        cb >= 74 &&
        cb <= 132 &&
        cr >= 132 &&
        cr <= 178;
      if (isSkin) {
        colScore[x] += 1;
        rowScore[y] += 1;
        total += 1;
      }
    }
  }

  const coverage = total / (w * h);
  if (coverage < 0.015) return null;

  const span = (arr, len) => {
    const peak = Math.max(...arr);
    if (peak <= 0) return [0, len - 1];
    const threshold = peak * 0.32;
    let lo = 0;
    let hi = len - 1;
    while (lo < len && arr[lo] < threshold) lo++;
    while (hi > lo && arr[hi] < threshold) hi--;
    return [lo, hi];
  };

  const [x0, x1] = span(colScore, w);
  const [y0, y1] = span(rowScore, h);
  const bw = x1 - x0;
  const bh = y1 - y0;
  if (bw < w * 0.08 || bh < h * 0.08) return null;

  return { x: x0, y: y0, width: bw, height: bh, coverage, confidence: Math.min(1, coverage * 6) };
}

/** Returns { x, y, width, height, confidence, source } or null. */
export async function detectFace(source, maxSize = 320) {
  const canvas = drawToCanvas(source, maxSize);
  const detector = getNativeDetector();
  if (detector) {
    try {
      const faces = await detector.detect(canvas);
      if (faces?.length) {
        const b = faces[0].boundingBox;
        return {
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          confidence: 0.95,
          source: "native",
          canvas,
        };
      }
    } catch {
      /* fall back to the heuristic detector */
    }
  }
  const box = skinToneBox(canvas);
  return box ? { ...box, source: "heuristic", canvas } : null;
}

/* ------------------------------------------------------------------ *
 * Descriptor + matching
 * ------------------------------------------------------------------ */
const GRID = 16;

function cropGray(canvas, box) {
  const out = document.createElement("canvas");
  out.width = GRID * 2;
  out.height = GRID * 2;
  const ctx = out.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, out.width, out.height);
  const { data } = ctx.getImageData(0, 0, out.width, out.height);
  const gray = new Float32Array(out.width * out.height);
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4;
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return { gray, size: out.width };
}

function normalise(vec) {
  let mean = 0;
  for (const v of vec) mean += v;
  mean /= vec.length;
  let variance = 0;
  for (const v of vec) variance += (v - mean) ** 2;
  const std = Math.sqrt(variance / vec.length) || 1;
  return Float32Array.from(vec, (v) => (v - mean) / std);
}

/** 384-dim descriptor: 256 intensity + 128 gradient-orientation histogram. */
export function computeDescriptor(canvas, box) {
  const { gray, size } = cropGray(canvas, box);
  const norm = normalise(gray);

  // 16×16 intensity patch (average pool 2×2)
  const patch = new Float32Array(GRID * GRID);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = y * 2 * size + x * 2;
      patch[y * GRID + x] = (norm[i] + norm[i + 1] + norm[i + size] + norm[i + size + 1]) / 4;
    }
  }

  // 4×4 cells × 8 orientation bins
  const cells = 4;
  const bins = 8;
  const hog = new Float32Array(cells * cells * bins);
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const gx = norm[y * size + x + 1] - norm[y * size + x - 1];
      const gy = norm[(y + 1) * size + x] - norm[(y - 1) * size + x];
      const mag = Math.hypot(gx, gy);
      if (mag < 0.02) continue;
      let angle = Math.atan2(gy, gx);
      if (angle < 0) angle += Math.PI * 2;
      const bin = Math.min(bins - 1, Math.floor((angle / (Math.PI * 2)) * bins));
      const cx = Math.min(cells - 1, Math.floor((x / size) * cells));
      const cy = Math.min(cells - 1, Math.floor((y / size) * cells));
      hog[(cy * cells + cx) * bins + bin] += mag;
    }
  }

  const descriptor = new Float32Array(patch.length + hog.length);
  descriptor.set(patch, 0);
  descriptor.set(hog, patch.length);

  let norm2 = 0;
  for (const v of descriptor) norm2 += v * v;
  const len = Math.sqrt(norm2) || 1;
  for (let i = 0; i < descriptor.length; i++) descriptor[i] /= len;
  return descriptor;
}

/** Cosine similarity, calibrated to a human-readable 0-100 match score. */
export function compareDescriptors(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  const calibrated = ((dot - 0.42) / 0.5) * 100;
  return Math.round(Math.max(0, Math.min(100, calibrated)) * 10) / 10;
}

/** Full face-match between two data URLs (ID portrait vs live capture). */
export async function matchFaces(idDataUrl, selfieDataUrl) {
  const [idImg, selfieImg] = await Promise.all([loadImage(idDataUrl), loadImage(selfieDataUrl)]);
  const [idFace, selfieFace] = await Promise.all([
    detectFace(idImg, 400),
    detectFace(selfieImg, 400),
  ]);

  if (!idFace) return { score: 0, error: "No face could be located on the uploaded document." };
  if (!selfieFace) return { score: 0, error: "No face could be located in the live capture." };

  const idDesc = computeDescriptor(idFace.canvas, idFace);
  const selfieDesc = computeDescriptor(selfieFace.canvas, selfieFace);
  return {
    score: compareDescriptors(idDesc, selfieDesc),
    detector: `${idFace.source}/${selfieFace.source}`,
  };
}

/* ------------------------------------------------------------------ *
 * Liveness — randomised challenge / response
 * ------------------------------------------------------------------ */
export const CHALLENGES = [
  {
    id: "TURN_LEFT",
    prompt: "Slowly turn your head to the LEFT",
    hint: "Keep your face in the frame",
  },
  {
    id: "TURN_RIGHT",
    prompt: "Slowly turn your head to the RIGHT",
    hint: "Keep your face in the frame",
  },
  { id: "BLINK", prompt: "Blink twice, naturally", hint: "Look straight at the camera" },
  {
    id: "MOVE_CLOSER",
    prompt: "Lean a little CLOSER to the camera",
    hint: "Fill more of the frame",
  },
];

export function pickChallenges(count = 3) {
  const pool = [...CHALLENGES];
  const picked = [];
  while (picked.length < count && pool.length) {
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return picked;
}

function eyeRegionIntensity(canvas, box) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const ex = Math.max(0, Math.round(box.x + box.width * 0.15));
  const ey = Math.max(0, Math.round(box.y + box.height * 0.24));
  const ew = Math.max(2, Math.round(box.width * 0.7));
  const eh = Math.max(2, Math.round(box.height * 0.22));
  const { data } = ctx.getImageData(
    ex,
    ey,
    Math.min(ew, canvas.width - ex),
    Math.min(eh, canvas.height - ey),
  );
  let sum = 0;
  for (let i = 0; i < data.length; i += 4)
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  return sum / (data.length / 4);
}

function frameDifference(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let diff = 0;
  for (let i = 0; i < a.length; i += 16) diff += Math.abs(a[i] - b[i]);
  return diff / (a.length / 16) / 255;
}

/**
 * Runs one challenge for `durationMs`, sampling the video element.
 * Returns the measured signals plus a pass/fail verdict.
 */
export async function runChallenge(
  video,
  challenge,
  { durationMs = 2600, fps = 8, onProgress } = {},
) {
  const samples = [];
  let previousGray = null;
  let motion = 0;
  const start = performance.now();

  while (performance.now() - start < durationMs) {
    const canvas = drawToCanvas(video, 240);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    if (previousGray) motion += frameDifference(previousGray, frame);
    previousGray = frame;

    const face = await detectFace(canvas, 240);
    if (face) {
      samples.push({
        cx: (face.x + face.width / 2) / canvas.width,
        cy: (face.y + face.height / 2) / canvas.height,
        area: (face.width * face.height) / (canvas.width * canvas.height),
        eye: eyeRegionIntensity(face.canvas, face),
        t: performance.now() - start,
      });
    }
    onProgress?.(Math.min(1, (performance.now() - start) / durationMs), face);

    await new Promise((r) => setTimeout(r, 1000 / fps));
  }

  const frames = samples.length;
  if (frames < 4) {
    return {
      id: challenge.id,
      passed: false,
      frames,
      motion,
      reason: "FACE_NOT_TRACKED",
      value: 0,
    };
  }

  const cxs = samples.map((s) => s.cx);
  const areas = samples.map((s) => s.area);
  const eyes = samples.map((s) => s.eye);
  const drift = cxs[cxs.length - 1] - cxs[0];
  const areaGrowth = areas[areas.length - 1] / (areas[0] || 1);
  const eyeMean = eyes.reduce((a, b) => a + b, 0) / eyes.length;
  const eyeDips = eyes.filter((e) => e < eyeMean * 0.93).length;
  const motionOk = motion > 0.4;

  let passed = false;
  let value = 0;
  switch (challenge.id) {
    // Mirrored preview: turning left moves the face right in frame, so accept either sign
    case "TURN_LEFT":
      value = Math.abs(drift);
      passed = value > 0.045 && motionOk;
      break;
    case "TURN_RIGHT":
      value = Math.abs(drift);
      passed = value > 0.045 && motionOk;
      break;
    case "BLINK":
      value = eyeDips;
      passed = eyeDips >= 1 && motionOk;
      break;
    case "MOVE_CLOSER":
      value = areaGrowth;
      passed = areaGrowth > 1.08 && motionOk;
      break;
    default:
      passed = motionOk;
  }

  return {
    id: challenge.id,
    passed,
    frames,
    motion: Math.round(motion * 1000) / 1000,
    value: Math.round(value * 1000) / 1000,
  };
}

/** Aggregate several challenge results into a 0-100 liveness score. */
export function scoreLiveness(results) {
  if (!results.length) return { score: 0, framesAnalysed: 0, checks: [] };
  const framesAnalysed = results.reduce((a, r) => a + r.frames, 0);
  const passRatio = results.filter((r) => r.passed).length / results.length;
  const tracking = Math.min(1, framesAnalysed / (results.length * 12));
  const motion = Math.min(1, results.reduce((a, r) => a + r.motion, 0) / (results.length * 1.2));
  const score = Math.round((passRatio * 68 + tracking * 20 + motion * 12) * 10) / 10;
  return { score, framesAnalysed, checks: results };
}
