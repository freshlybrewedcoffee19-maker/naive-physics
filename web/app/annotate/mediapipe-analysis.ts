import type { HandLandmarkerResult, InteractiveSegmenterLegacyResult, PoseLandmarkerResult } from "@mediapipe/tasks-vision";

export const MEDIAPIPE_VERSION = "1.0.1";
export const MEDIAPIPE_MODELS = {
  hand: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  pose: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  segmenter: "https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite",
} as const;

let runtimePromise: ReturnType<typeof createRuntime> | null = null;
const XNNPACK_INFO = "INFO: Created TensorFlow Lite XNNPACK delegate for CPU.";

function withScopedMediaPipeLogging<T>(run: () => T): T {
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    const message = args.map(String).join(" ").trim();
    if (message === XNNPACK_INFO) return;
    originalError(...args);
  };
  try {
    return run();
  } finally {
    console.error = originalError;
  }
}

async function withScopedMediaPipeLoggingAsync<T>(run: () => Promise<T>): Promise<T> {
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    const message = args.map(String).join(" ").trim();
    if (message === XNNPACK_INFO) return;
    originalError(...args);
  };
  try {
    return await run();
  } finally {
    console.error = originalError;
  }
}

async function createRuntime() {
  const vision = await import("@mediapipe/tasks-vision");
  const fileset = await vision.FilesetResolver.forVisionTasks(
    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`,
  );
  const [hand, pose, segmenter] = await withScopedMediaPipeLoggingAsync(() => Promise.all([
    vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MEDIAPIPE_MODELS.hand },
      runningMode: "IMAGE",
      numHands: 2,
      minHandDetectionConfidence: 0.35,
      minHandPresenceConfidence: 0.35,
      minTrackingConfidence: 0.35,
    }),
    vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MEDIAPIPE_MODELS.pose },
      runningMode: "IMAGE",
      numPoses: 1,
      minPoseDetectionConfidence: 0.35,
      minPosePresenceConfidence: 0.35,
      minTrackingConfidence: 0.35,
    }),
    vision.InteractiveSegmenterLegacy.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MEDIAPIPE_MODELS.segmenter },
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    }),
  ]));
  return { hand, pose, segmenter };
}

export const loadMediaPipe = () => runtimePromise ??= createRuntime();

export function detectHandsAndPose(source: HTMLVideoElement | HTMLCanvasElement) {
  return loadMediaPipe().then(({ hand, pose }) => withScopedMediaPipeLogging(() => ({
    hands: hand.detect(source) as HandLandmarkerResult,
    pose: pose.detect(source) as PoseLandmarkerResult,
  })));
}

export async function segmentFromPoint(source: HTMLCanvasElement, xNormalized: number, yNormalized: number) {
  const { segmenter } = await loadMediaPipe();
  const result = segmenter.segment(source, { keypoint: { x: xNormalized, y: yNormalized } }) as InteractiveSegmenterLegacyResult;
  const mask = result.confidenceMasks?.[0];
  if (!mask) {
    result.close();
    throw new Error("Interactive Segmenter returned no confidence mask.");
  }
  const output = { width: mask.width, height: mask.height, values: new Float32Array(mask.getAsFloat32Array()) };
  result.close();
  return output;
}
