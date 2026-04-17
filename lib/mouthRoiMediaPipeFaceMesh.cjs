/**
 * Mouth ROI from MediaPipe Face Mesh (TensorFlow.js implementation of the same
 * model as MediaPipe Face Mesh — see @tensorflow-models/face-landmarks-detection).
 *
 * Used server-side in Node (no browser DOM). Returns a tight crop around lips/teeth
 * before any AI / whitening pipeline runs.
 */

'use strict';

// @tensorflow/tfjs and face-landmarks-detection reference `navigator` in some builds.
// Polyfill before tfjs loads so Node/Railway never throws ReferenceError on navigator/window.
const os = require('os');
const _navPoly = {
  userAgent: 'Node.js',
  hardwareConcurrency: Math.max(1, (os.cpus() && os.cpus().length) || 4),
};
if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = _navPoly;
}
if (typeof global !== 'undefined' && typeof global.navigator === 'undefined') {
  global.navigator = globalThis.navigator || _navPoly;
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

// Same entry as index.cjs: use @tensorflow/tfjs-node only (no bare @tensorflow/tfjs).
const sharp = require('sharp');

/** Shared tf from tfjs-node (registers Node + re-exports tfjs). */
function getTf() {
  return require('@tensorflow/tfjs-node');
}

let tfBackendInitPromise = null;

/**
 * tfjs-node defaults to the native "tensorflow" backend after tf.ready(). MediaPipe Face Mesh
 * (tfjs runtime) needs kernels (e.g. Transform) that are not registered there — use CPU.
 * IMPORTANT: call setBackend *before* tf.ready(), or the native backend is already bound.
 */
async function ensureTfBackendForFaceMesh() {
  if (!tfBackendInitPromise) {
    tfBackendInitPromise = (async () => {
      const tf = getTf();
      const want = String(process.env.SIM_TF_BACKEND || 'cpu').trim();
      const target = want === 'tensorflow' ? 'cpu' : want || 'cpu';
      if (want === 'tensorflow') {
        console.warn(
          '[TF] SIM_TF_BACKEND=tensorflow ignored for MediaPipe Face Mesh; using cpu (Transform op).'
        );
      }
      let ok = await tf.setBackend(target);
      if (!ok) {
        console.warn('[TF] setBackend("' + target + '") failed, trying cpu');
        ok = await tf.setBackend('cpu');
      }
      await tf.ready();
      if (tf.getBackend() === 'tensorflow') {
        const cpuOk = await tf.setBackend('cpu');
        if (cpuOk) await tf.ready();
        if (tf.getBackend() === 'tensorflow') {
          console.warn('[TF] Could not leave tensorflow backend; MediaPipe may fail (Transform).');
        } else {
          console.warn(
            '[TF] Switched tensorflow → cpu: native backend omits ops (e.g. Transform) required by MediaPipe.'
          );
        }
      }
      console.log('TF BACKEND:', tf.getBackend());
      return tf;
    })();
  }
  return tfBackendInitPromise;
}

/** Lip contour vertices (same topology as MediaPipe Face Mesh). */
const LIP_VERTEX_INDICES = [
  0, 13, 14, 17, 37, 39, 40, 61, 78, 80, 81, 82, 84, 87, 88, 91, 95, 146, 178, 181,
  185, 191, 267, 269, 270, 291, 308, 310, 311, 312, 314, 317, 318, 321, 324, 375,
  402, 405, 409, 415,
];

const IDX_UPPER_LIP_MID = 13;
const IDX_LOWER_LIP_MID = 14;

const MIN_CROP_W = 96;
const MIN_CROP_H = 72;

let detectorPromise = null;

function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      await ensureTfBackendForFaceMesh();
      const tf = getTf();
      const fld = require('@tensorflow-models/face-landmarks-detection');
      await tf.ready();
      return fld.createDetector(fld.SupportedModels.MediaPipeFaceMesh, {
        runtime: 'tfjs',
        maxFaces: 1,
        refineLandmarks: true,
      });
    })();
  }
  return detectorPromise;
}

function tensor3dFromRgbRaw(data, width, height) {
  const tf = getTf();
  return tf.tensor3d(new Uint8Array(data), [height, width, 3]);
}

/**
 * @param {Buffer} imageBuf - full image (JPEG/PNG)
 * @returns {Promise<{
 *   ok: boolean,
 *   reason?: string,
 *   cropLeft: number,
 *   cropTop: number,
 *   cropWidth: number,
 *   cropHeight: number,
 *   mouthOpenPx?: number,
 *   debug?: object
 * }>}
 */
async function computeMouthCropFromImageBuffer(imageBuf) {
  await ensureTfBackendForFaceMesh();
  const tf = getTf();
  const maxDim = Number(process.env.SIM_FACE_MAX_DIM);
  const maxDimSafe = Number.isFinite(maxDim) && maxDim >= 320 ? maxDim : 960;
  const minOpenFrac = Number(process.env.SIM_MIN_MOUTH_OPEN_FRAC);
  const mouthOpenMin =
    Number.isFinite(minOpenFrac) && minOpenFrac > 0 ? minOpenFrac : 0.011;

  const meta = await sharp(imageBuf).metadata();
  const origW = meta.width;
  const origH = meta.height;
  if (!origW || !origH) {
    return { ok: false, reason: 'bad_image_meta', cropLeft: 0, cropTop: 0, cropWidth: 0, cropHeight: 0 };
  }

  let scale = 1;
  let workBuf = imageBuf;
  if (Math.max(origW, origH) > maxDimSafe) {
    scale = maxDimSafe / Math.max(origW, origH);
    workBuf = await sharp(imageBuf)
      .resize({
        width: Math.max(1, Math.round(origW * scale)),
        height: Math.max(1, Math.round(origH * scale)),
      })
      .jpeg({ quality: 92 })
      .toBuffer();
  }

  const wm = await sharp(workBuf).metadata();
  const w = wm.width;
  const h = wm.height;
  const { data, info } = await sharp(workBuf).raw().toBuffer({ resolveWithObject: true });

  const t = tensor3dFromRgbRaw(data, info.width, info.height);
  let faces;
  try {
    const detector = await getDetector();
    faces = await detector.estimateFaces(t, { flipHorizontal: false, staticImageMode: true });
  } finally {
    t.dispose();
  }

  if (!faces || faces.length === 0) {
    return {
      ok: false,
      reason: 'no_face_detected',
      cropLeft: 0,
      cropTop: 0,
      cropWidth: 0,
      cropHeight: 0,
      debug: { origW, origH, scale },
    };
  }

  const face = faces[0];
  const kp = face.keypoints;
  if (!kp || kp.length < 400) {
    return {
      ok: false,
      reason: 'insufficient_landmarks',
      cropLeft: 0,
      cropTop: 0,
      cropWidth: 0,
      cropHeight: 0,
      debug: { origW, origH, scale, keypointCount: kp?.length },
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const idx of LIP_VERTEX_INDICES) {
    const p = kp[idx];
    if (!p) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  const lipW = maxX - minX;
  const lipH = maxY - minY;
  if (lipW < 4 || lipH < 4) {
    return {
      ok: false,
      reason: 'lip_landmarks_degenerate',
      cropLeft: 0,
      cropTop: 0,
      cropWidth: 0,
      cropHeight: 0,
      debug: { origW, origH, scale, lipW, lipH },
    };
  }

  const upper = kp[IDX_UPPER_LIP_MID];
  const lower = kp[IDX_LOWER_LIP_MID];
  const mouthOpenDet = upper && lower ? Math.abs(lower.y - upper.y) : lipH;
  const inv = 1 / scale;
  const mouthOpenOrig = mouthOpenDet * inv;

  if (mouthOpenOrig < mouthOpenMin * origH) {
    return {
      ok: false,
      reason: 'mouth_closed_teeth_not_visible',
      cropLeft: 0,
      cropTop: 0,
      cropWidth: 0,
      cropHeight: 0,
      mouthOpenPx: mouthOpenOrig,
      debug: { origW, origH, scale, mouthOpenOrig, threshold: mouthOpenMin * origH },
    };
  }

  const sMinX = minX * inv;
  const sMaxX = maxX * inv;
  const sMinY = minY * inv;
  const sMaxY = maxY * inv;
  const lipWOrig = lipW * inv;
  const lipHOrig = lipH * inv;

  const marginTop = Math.max(0.06 * origH, 0.42 * lipHOrig);
  const marginBot = Math.max(0.07 * origH, 0.58 * lipHOrig);
  const marginSide = Math.max(0.04 * origW, 0.14 * lipWOrig);

  let left = Math.floor(sMinX - marginSide);
  let top = Math.floor(sMinY - marginTop);
  let right = Math.ceil(sMaxX + marginSide);
  let bottom = Math.ceil(sMaxY + marginBot);

  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(origW, right);
  bottom = Math.min(origH, bottom);

  let cropWidth = right - left;
  let cropHeight = bottom - top;

  let expandPass = 0;
  while ((cropWidth < MIN_CROP_W || cropHeight < MIN_CROP_H) && expandPass < 2) {
    expandPass++;
    const padX = Math.max(0, (MIN_CROP_W - cropWidth) / 2) + 0.035 * origW * expandPass;
    const padY = Math.max(0, (MIN_CROP_H - cropHeight) / 2) + 0.035 * origH * expandPass;
    left = Math.max(0, Math.floor(left - padX));
    top = Math.max(0, Math.floor(top - padY));
    right = Math.min(origW, Math.ceil(right + padX));
    bottom = Math.min(origH, Math.ceil(bottom + padY));
    cropWidth = right - left;
    cropHeight = bottom - top;
  }

  if (cropWidth < MIN_CROP_W * 0.85 || cropHeight < MIN_CROP_H * 0.85) {
    return {
      ok: false,
      reason: 'crop_too_small_after_expand',
      cropLeft: left,
      cropTop: top,
      cropWidth,
      cropHeight,
      mouthOpenPx: mouthOpenOrig,
      debug: { origW, origH, scale, expandPass },
    };
  }

  const wr = cropWidth / origW;
  const hr = cropHeight / origH;
  if (wr > 0.92 || hr > 0.48) {
    return {
      ok: false,
      reason: 'crop_too_large_suspect_full_face',
      cropLeft: left,
      cropTop: top,
      cropWidth,
      cropHeight,
      debug: { origW, origH, wr, hr },
    };
  }

  return {
    ok: true,
    cropLeft: left,
    cropTop: top,
    cropWidth,
    cropHeight,
    mouthOpenPx: mouthOpenOrig,
    debug: {
      origW,
      origH,
      scale,
      faceW: w,
      faceH: h,
      lipBoxDet: { minX, minY, maxX, maxY },
      expandPass,
    },
  };
}

module.exports = {
  computeMouthCropFromImageBuffer,
  getDetector,
};
