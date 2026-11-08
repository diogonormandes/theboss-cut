/// <reference lib="webworker" />
/**
 * Worker do detector de rosto (YuNet + onnxruntime-web, tudo local).
 *
 * Recebe o arquivo e uma lista de tempos (segundos da fonte), lê só esses
 * quadros reduzidos para 640 px de largura (CanvasSink com 2 telas) e devolve
 * o rosto principal de cada um, em fração do quadro.
 * Um trabalho de cada vez; a sessão do modelo é criada uma vez e reaproveitada.
 */
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
import * as ort from "onnxruntime-web/wasm";
import type { NormBox } from "./framing-math";
import {
	decodeYunet,
	pickMainFace,
	rgbaToYunetInput,
	YUNET_INPUT,
} from "./yunet";

export type FaceWorkerRequest = {
	type: "detect";
	jobId: number;
	file: File;
	times: number[];
	scoreThreshold?: number;
};

export type FaceWorkerResponse =
	| {
			type: "result";
			jobId: number;
			sourceWidth: number;
			sourceHeight: number;
			frames: FaceFrame[];
			decodeMs: number;
			detectMs: number;
	  }
	| { type: "error"; jobId: number; message: string };

/**
 * Um quadro analisado: o rosto principal (o maior) e o centro X de todos os
 * rostos achados (para seguir o mais perto da trilha, não o maior).
 */
export type FaceFrame = {
	t: number;
	face: (NormBox & { score: number }) | null;
	candidates?: number[];
};

const MODEL_URL = "/models/face_detection_yunet_2023mar.onnx";
const SAMPLE_WIDTH = 640;

let sessionPromise: Promise<ort.InferenceSession> | null = null;

function getSession(): Promise<ort.InferenceSession> {
	if (!sessionPromise) {
		// .mjs e .wasm servidos de public/ort (funciona sem internet)
		ort.env.wasm.wasmPaths = new URL("/ort/", self.location.origin).href;
		// sem threads: não exige isolamento de origem e gasta menos memória
		ort.env.wasm.numThreads = 1;
		sessionPromise = ort.InferenceSession.create(
			new URL(MODEL_URL, self.location.origin).href,
			{
				executionProviders: ["wasm"],
				graphOptimizationLevel: "all",
			},
		).catch((error) => {
			sessionPromise = null;
			throw error;
		});
	}
	return sessionPromise;
}

function post(message: FaceWorkerResponse): void {
	(self as unknown as DedicatedWorkerGlobalScope).postMessage(message);
}

async function detect(request: FaceWorkerRequest): Promise<void> {
	const session = await getSession();
	const input = new Input({
		source: new BlobSource(request.file, { maxCacheSize: 16 * 1024 * 1024 }),
		formats: ALL_FORMATS,
	});
	try {
		const track = await input.getPrimaryVideoTrack();
		if (!track) throw new Error("no-video");
		if (!(await track.canDecode())) throw new Error("cannot-decode");
		const sourceWidth = track.displayWidth;
		const sourceHeight = track.displayHeight;
		const width = SAMPLE_WIDTH;
		const height = Math.min(
			YUNET_INPUT,
			Math.max(2, Math.round((SAMPLE_WIDTH * sourceHeight) / sourceWidth)),
		);
		const sink = new CanvasSink(track, {
			width,
			height,
			fit: "fill",
			poolSize: 2,
		});
		const times = [...request.times].sort((a, b) => a - b);
		const tensorData = new Float32Array(3 * YUNET_INPUT * YUNET_INPUT);
		const frames: FaceFrame[] = [];
		let decodeMs = 0;
		let detectMs = 0;
		let mark = performance.now();
		let index = 0;
		for await (const wrapped of sink.canvasesAtTimestamps(times)) {
			const t = times[index++];
			decodeMs += performance.now() - mark;
			if (!wrapped) {
				frames.push({ t, face: null });
				mark = performance.now();
				continue;
			}
			const startDetect = performance.now();
			const canvas = wrapped.canvas as OffscreenCanvas;
			const ctx = canvas.getContext("2d", {
				willReadFrequently: true,
			}) as OffscreenCanvasRenderingContext2D | null;
			if (!ctx) throw new Error("no-2d");
			const image = ctx.getImageData(0, 0, width, height);
			rgbaToYunetInput({ rgba: image.data, width, height, out: tensorData });
			const tensor = new ort.Tensor("float32", tensorData, [
				1,
				3,
				YUNET_INPUT,
				YUNET_INPUT,
			]);
			const outputs = await session.run({ input: tensor });
			const all = decodeYunet(
				outputs as unknown as Parameters<typeof decodeYunet>[0],
				{ scoreThreshold: request.scoreThreshold ?? 0.6 },
			);
			const main = pickMainFace(all);
			for (const value of Object.values(outputs)) value.dispose?.();
			frames.push({
				t,
				face: main
					? {
							cx: main.cx / width,
							cy: main.cy / height,
							w: main.w / width,
							h: main.h / height,
							score: main.score,
						}
					: null,
				candidates: all.map((face) => face.cx / width),
			});
			detectMs += performance.now() - startDetect;
			mark = performance.now();
		}
		post({
			type: "result",
			jobId: request.jobId,
			sourceWidth,
			sourceHeight,
			frames,
			decodeMs: Math.round(decodeMs),
			detectMs: Math.round(detectMs),
		});
	} finally {
		input.dispose();
	}
}

let queue: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<FaceWorkerRequest>) => {
	const request = event.data;
	if (request?.type !== "detect") return;
	queue = queue.then(() =>
		detect(request).catch((error: unknown) => {
			post({
				type: "error",
				jobId: request.jobId,
				message: error instanceof Error ? error.message : String(error),
			});
		}),
	);
};
