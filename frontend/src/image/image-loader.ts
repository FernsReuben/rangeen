import type { PixelBuffer } from "../analysis/pixel-buffer.ts";

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/bmp",
] as const;

export const ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(",");
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_WORKING_SIDE = 4096;

export interface LoadedImage {
  fileName: string;
  /** Size of the decoded original. */
  originalWidth: number;
  originalHeight: number;
  /** Working copy used for display, sampling and analysis. */
  bitmap: ImageBitmap;
  pixels: PixelBuffer;
  scaledDown: boolean;
}

export type ImageLoadErrorCode =
  | "unsupported-type"
  | "too-large"
  | "decode-failed"
  | "empty";

export class ImageLoadError extends Error {
  readonly code: ImageLoadErrorCode;
  constructor(code: ImageLoadErrorCode, message: string) {
    super(message);
    this.name = "ImageLoadError";
    this.code = code;
  }
}

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function loadImageFile(file: File): Promise<LoadedImage> {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    const kind =
      file.type || file.name.split(".").pop()?.toUpperCase() || "this file";
    throw new ImageLoadError(
      "unsupported-type",
      `${kind} isn't supported. Use a JPEG, PNG, WebP, GIF, AVIF or BMP image. (iPhone HEIC photos: export as JPEG first.)`,
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ImageLoadError(
      "too-large",
      `That file is ${formatMb(file.size)}. The limit is ${formatMb(MAX_FILE_BYTES)}.`,
    );
  }
  if (file.size === 0) throw new ImageLoadError("empty", "That file is empty.");

  let original: ImageBitmap;
  try {
    original = await createImageBitmap(file, {
      imageOrientation: "from-image",
      colorSpaceConversion: "default",
    });
  } catch (error) {
    console.error("[image-loader] Decode failed:", error);
    throw new ImageLoadError(
      "decode-failed",
      "This image couldn't be decoded. It may be corrupt or in an unusual format.",
    );
  }

  const originalWidth = original.width;
  const originalHeight = original.height;
  if (originalWidth === 0 || originalHeight === 0) {
    original.close();
    throw new ImageLoadError("empty", "This image has no pixels.");
  }

  const longest = Math.max(originalWidth, originalHeight);
  const scaledDown = longest > MAX_WORKING_SIDE;
  let bitmap = original;
  if (scaledDown) {
    const scale = MAX_WORKING_SIDE / longest;
    bitmap = await createImageBitmap(original, {
      resizeWidth: Math.max(1, Math.round(originalWidth * scale)),
      resizeHeight: Math.max(1, Math.round(originalHeight * scale)),
      resizeQuality: "high",
    });
    original.close();
  }

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", {
    colorSpace: "srgb",
    willReadFrequently: true,
  });
  if (!ctx) {
    bitmap.close();
    throw new ImageLoadError(
      "decode-failed",
      "Your browser couldn't create a canvas to read the image.",
    );
  }
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height, {
    colorSpace: "srgb",
  });

  return {
    fileName: file.name,
    originalWidth,
    originalHeight,
    bitmap,
    pixels: {
      width: imageData.width,
      height: imageData.height,
      data: imageData.data,
    },
    scaledDown,
  };
}

/** Pulls the first image out of a drag-and-drop or paste DataTransfer. */
export function firstImageFile(transfer: DataTransfer | null): File | null {
  if (!transfer) return null;
  for (const file of Array.from(transfer.files)) {
    if (file.type.startsWith("image/")) return file;
  }
  return transfer.files[0] ?? null;
}
