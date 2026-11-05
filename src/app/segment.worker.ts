/**
 * segment.worker.ts
 *
 * Runs entirely in a Web Worker — keeps the main thread responsive.
 * Uses @huggingface/transformers v3 (ONNX) with the Xenova/slimsam-77-uniform
 * model. Prefers WebGPU when available and falls back to WASM automatically.
 *
 * Message protocol (main → worker):
 *   { type: "encode"; imageDataUrl: string }
 *   { type: "decode"; pointX: number; pointY: number }
 *     pointX / pointY are fractions [0..1] relative to the displayed image.
 *
 * Message protocol (worker → main):
 *   { type: "model-loading" }
 *   { type: "model-ready" }
 *   { type: "model-error"; message: string }
 *   { type: "encoding" }
 *   { type: "encoded" }
 *   { type: "mask"; maskData: Uint8ClampedArray; width: number; height: number }
 *   { type: "error"; message: string }
 */

import {
  SamModel,
  AutoProcessor,
  RawImage,
  Tensor,
  type SamImageSegmentationOutput,
  env,
} from "@huggingface/transformers";

// ---------------------------------------------------------------------------
// Types for the image processor output we rely on
// ---------------------------------------------------------------------------

// AutoProcessor.from_pretrained returns Processor, but we use it as SamProcessor.
// The actual runtime object has these fields on the result of processor(image).
interface SamProcessorOutput {
  pixel_values: Tensor;
  original_sizes: [number, number][];
  reshaped_input_sizes: [number, number][];
}

// We use the SamModel's _call interface to run model({...embeddings, input_points, input_labels}).
// The _call method is inherited; SamModel exposes forward(), but the example code calls it
// as a function. Cast to avoid TS errors on the call signature.
type CallableSamModel = {
  get_image_embeddings(args: { pixel_values: Tensor }): Promise<{
    image_embeddings: Tensor;
    image_positional_embeddings: Tensor;
  }>;
  (args: {
    image_embeddings: Tensor;
    image_positional_embeddings: Tensor;
    input_points: Tensor;
    input_labels: Tensor;
  }): Promise<SamImageSegmentationOutput>;
};

type CallableProcessor = {
  (image: RawImage): Promise<SamProcessorOutput>;
  post_process_masks(
    masks: Tensor,
    original_sizes: [number, number][],
    reshaped_input_sizes: [number, number][],
  ): Promise<Tensor[]>;
};

// ---------------------------------------------------------------------------
// Model singleton — loaded once per worker lifetime
// ---------------------------------------------------------------------------

const MODEL_ID = "Xenova/slimsam-77-uniform";

let model: CallableSamModel | null = null;
let processor: CallableProcessor | null = null;

// Cached image embeddings (recomputed only when a new photo is loaded)
let imageProcessed: SamProcessorOutput | null = null;
let imageEmbeddings: {
  image_embeddings: Tensor;
  image_positional_embeddings: Tensor;
} | null = null;

// Prevent concurrent encode/decode calls
let isEncoding = false;
let isDecoding = false;
let pendingDecode: { pointX: number; pointY: number } | null = null;

async function loadModel(): Promise<void> {
  self.postMessage({ type: "model-loading" });

  // Never load from local filesystem inside the browser worker.
  env.allowLocalModels = false;

  // Determine the best available execution device.
  // navigator.gpu is available in secure contexts on Chrome/Edge 113+ and Safari 18+.
  const hasWebGPU =
    typeof navigator !== "undefined" &&
    "gpu" in navigator &&
    navigator.gpu != null;

  const device = hasWebGPU ? ("webgpu" as const) : ("wasm" as const);

  try {
    const rawModel = await SamModel.from_pretrained(MODEL_ID, {
      dtype: device === "webgpu" ? ("fp16" as const) : ("fp32" as const),
      device,
    });
    model = rawModel as unknown as CallableSamModel;

    const rawProcessor = await AutoProcessor.from_pretrained(MODEL_ID);
    processor = rawProcessor as unknown as CallableProcessor;

    self.postMessage({ type: "model-ready" });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error loading model";
    self.postMessage({ type: "model-error", message });
  }
}

// ---------------------------------------------------------------------------
// Encode — extract image embeddings from the photo
// ---------------------------------------------------------------------------

async function encode(imageDataUrl: string): Promise<void> {
  if (!model || !processor) return;
  if (isEncoding) return;

  isEncoding = true;
  self.postMessage({ type: "encoding" });

  try {
    const imageInput = await RawImage.fromURL(imageDataUrl);
    imageProcessed = await processor(imageInput);
    imageEmbeddings = await model.get_image_embeddings({
      pixel_values: imageProcessed.pixel_values,
    });
    self.postMessage({ type: "encoded" });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error encoding image";
    self.postMessage({ type: "error", message });
  } finally {
    isEncoding = false;
  }
}

// ---------------------------------------------------------------------------
// Decode — run the mask decoder given a click point [0..1] normalised
// ---------------------------------------------------------------------------

async function decode(pointX: number, pointY: number): Promise<void> {
  if (!model || !processor || !imageProcessed || !imageEmbeddings) return;

  if (isDecoding) {
    // Queue the most-recent decode; run it after the current one finishes.
    pendingDecode = { pointX, pointY };
    return;
  }

  isDecoding = true;

  try {
    // SAM expects absolute coordinates in the reshaped image space.
    // reshaped_input_sizes[0] = [height, width]
    const [reshapedH, reshapedW] = imageProcessed.reshaped_input_sizes[0];
    const absX = pointX * reshapedW;
    const absY = pointY * reshapedH;

    // Shape: [batch=1, point_batch=1, num_points=1, coords=2]
    const input_points = new Tensor("float32", [absX, absY], [1, 1, 1, 2]);
    // Shape: [batch=1, point_batch=1, num_points=1]
    const input_labels = new Tensor("int64", [BigInt(1)], [1, 1, 1]);

    const output = await model({
      image_embeddings: imageEmbeddings.image_embeddings,
      image_positional_embeddings: imageEmbeddings.image_positional_embeddings,
      input_points,
      input_labels,
    });

    const { pred_masks, iou_scores } = output;

    // post_process_masks returns Tensor[] — one Tensor per image in the batch.
    // Each Tensor has shape [num_predicted_masks, H, W] (after binarising).
    const masks = await processor.post_process_masks(
      pred_masks,
      imageProcessed.original_sizes,
      imageProcessed.reshaped_input_sizes,
    );

    // iou_scores.data is a typed array with one score per predicted mask (typically 3)
    const scores = iou_scores.data as Float32Array;
    const numMasks = scores.length;
    let bestIndex = 0;
    for (let i = 1; i < numMasks; i++) {
      if (scores[i] > scores[bestIndex]) bestIndex = i;
    }

    // masks[0] has shape [numMasks, H, W]. Read the raw tensor directly —
    // RawImage.fromTensor would convert it to RGBA and scramble the indexing.
    const maskTensor = masks[0];
    const dims = maskTensor.dims as number[];
    const maskCount = dims[0];
    const height = dims[1];
    const width = dims[2];
    const raw = maskTensor.data as unknown as Float32Array | Uint8Array;

    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const value = raw[bestIndex * width * height + i];
      if (value > 0.5) {
        const base = i * 4;
        rgba[base] = 255;
        rgba[base + 1] = 255;
        rgba[base + 2] = 255;
        rgba[base + 3] = 255;
      }
    }
    void maskCount;

    // Transfer the buffer zero-copy via structured clone with transfer list
    self.postMessage(
      { type: "mask", maskData: rgba, width, height },
      { transfer: [rgba.buffer] },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error during segmentation";
    self.postMessage({ type: "error", message });
  } finally {
    isDecoding = false;
    if (pendingDecode) {
      const { pointX: px, pointY: py } = pendingDecode;
      pendingDecode = null;
      decode(px, py);
    }
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

interface WorkerInMessage {
  type: string;
  imageDataUrl?: string;
  pointX?: number;
  pointY?: number;
}

self.addEventListener("message", (event: MessageEvent<WorkerInMessage>) => {
  const { type } = event.data;
  if (type === "encode" && event.data.imageDataUrl != null) {
    encode(event.data.imageDataUrl);
  } else if (
    type === "decode" &&
    event.data.pointX != null &&
    event.data.pointY != null
  ) {
    decode(event.data.pointX, event.data.pointY);
  }
});

// Start loading the model immediately when the worker is created.
loadModel();
