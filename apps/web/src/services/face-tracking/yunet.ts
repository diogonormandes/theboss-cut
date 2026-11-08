/**
 * Partes puras do YuNet (OpenCV Zoo, MIT): preparo da imagem e leitura das
 * saídas. A sessão do onnxruntime fica no worker.
 *
 * O modelo 2023mar tem entrada fixa [1, 3, 640, 640], BGR, valores 0–255.
 * O quadro (ex.: 640×360) vai no canto de cima à esquerda; o resto fica preto.
 */

export const YUNET_INPUT = 640;
export const YUNET_STRIDES = [8, 16, 32] as const;

export interface PixelDetection {
	/** centro e tamanho em pixels da imagem de entrada */
	cx: number;
	cy: number;
	w: number;
	h: number;
	score: number;
}

/** RGBA (ImageData) → tensor BGR planar 640×640. Reaproveita `out`. */
export function rgbaToYunetInput({
	rgba,
	width,
	height,
	out,
}: {
	rgba: Uint8ClampedArray;
	width: number;
	height: number;
	out?: Float32Array;
}): Float32Array {
	const S = YUNET_INPUT;
	const plane = S * S;
	const data = out ?? new Float32Array(3 * plane);
	data.fill(0);
	const w = Math.min(width, S);
	const h = Math.min(height, S);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const src = (y * width + x) * 4;
			const dst = y * S + x;
			data[dst] = rgba[src + 2]; // B
			data[plane + dst] = rgba[src + 1]; // G
			data[2 * plane + dst] = rgba[src]; // R
		}
	}
	return data;
}

type Outputs = Record<string, { data: ArrayLike<number> } | undefined>;

function iou(a: PixelDetection, b: PixelDetection): number {
	const x1 = Math.max(a.cx - a.w / 2, b.cx - b.w / 2);
	const y1 = Math.max(a.cy - a.h / 2, b.cy - b.h / 2);
	const x2 = Math.min(a.cx + a.w / 2, b.cx + b.w / 2);
	const y2 = Math.min(a.cy + a.h / 2, b.cy + b.h / 2);
	const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
	const union = a.w * a.h + b.w * b.h - inter;
	return union > 0 ? inter / union : 0;
}

/**
 * Lê as saídas do YuNet (mesma conta do `FaceDetectorYN` do OpenCV) e tira as
 * caixas repetidas. Devolve da maior nota para a menor.
 */
export function decodeYunet(
	outputs: Outputs,
	{
		scoreThreshold = 0.6,
		nmsThreshold = 0.3,
		maxFaces = 5,
		inputSize = YUNET_INPUT,
	}: {
		scoreThreshold?: number;
		nmsThreshold?: number;
		maxFaces?: number;
		inputSize?: number;
	} = {},
): PixelDetection[] {
	const found: PixelDetection[] = [];
	for (const stride of YUNET_STRIDES) {
		const cls = outputs[`cls_${stride}`]?.data;
		const obj = outputs[`obj_${stride}`]?.data;
		const bbox = outputs[`bbox_${stride}`]?.data;
		if (!cls || !obj || !bbox) continue;
		const cols = Math.floor(inputSize / stride);
		for (let i = 0; i < cls.length; i++) {
			const c = Math.min(1, Math.max(0, cls[i]));
			const o = Math.min(1, Math.max(0, obj[i]));
			const score = Math.sqrt(c * o);
			if (score < scoreThreshold) continue;
			const row = Math.floor(i / cols);
			const col = i % cols;
			found.push({
				cx: (col + bbox[i * 4]) * stride,
				cy: (row + bbox[i * 4 + 1]) * stride,
				w: Math.exp(bbox[i * 4 + 2]) * stride,
				h: Math.exp(bbox[i * 4 + 3]) * stride,
				score,
			});
		}
	}
	found.sort((a, b) => b.score - a.score);
	const kept: PixelDetection[] = [];
	for (const det of found) {
		if (kept.every((k) => iou(k, det) <= nmsThreshold)) kept.push(det);
		if (kept.length >= maxFaces) break;
	}
	return kept;
}

/** Escolhe o rosto principal: o maior, com desempate pela nota. */
export function pickMainFace(faces: PixelDetection[]): PixelDetection | null {
	let best: PixelDetection | null = null;
	for (const face of faces) {
		if (!best || face.w * face.h * face.score > best.w * best.h * best.score) {
			best = face;
		}
	}
	return best;
}
