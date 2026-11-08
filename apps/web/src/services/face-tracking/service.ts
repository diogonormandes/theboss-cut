/**
 * Lado da página do detector de rosto: um Worker só, um trabalho de cada vez,
 * fechado depois de 60 s parado (devolve a memória do modelo).
 */
import type { FaceWorkerRequest, FaceWorkerResponse } from "./worker";

export type FaceDetectionResult = Extract<
	FaceWorkerResponse,
	{ type: "result" }
>;

const IDLE_CLOSE_MS = 60_000;

let worker: Worker | null = null;
let nextJobId = 1;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const pending = new Map<
	number,
	{ resolve: (r: FaceDetectionResult) => void; reject: (e: Error) => void }
>();

function failAll(message: string): void {
	for (const job of pending.values()) job.reject(new Error(message));
	pending.clear();
}

function getWorker(): Worker {
	if (idleTimer) {
		clearTimeout(idleTimer);
		idleTimer = null;
	}
	if (worker) return worker;
	const created = new Worker(new URL("./worker.ts", import.meta.url), {
		type: "module",
	});
	created.onmessage = (event: MessageEvent<FaceWorkerResponse>) => {
		const message = event.data;
		const job = pending.get(message.jobId);
		if (!job) return;
		pending.delete(message.jobId);
		if (message.type === "result") job.resolve(message);
		else job.reject(new Error(message.message));
		scheduleIdleClose();
	};
	created.onerror = (event) => {
		failAll(event.message || "worker-error");
		created.terminate();
		if (worker === created) worker = null;
	};
	worker = created;
	return created;
}

function scheduleIdleClose(): void {
	if (pending.size > 0 || idleTimer) return;
	idleTimer = setTimeout(() => {
		idleTimer = null;
		if (pending.size === 0 && worker) {
			worker.terminate();
			worker = null;
		}
	}, IDLE_CLOSE_MS);
}

/** Procura o rosto principal em cada tempo pedido (segundos da fonte). */
export function detectFaces({
	file,
	times,
	scoreThreshold,
}: {
	file: File;
	times: number[];
	scoreThreshold?: number;
}): Promise<FaceDetectionResult> {
	const jobId = nextJobId++;
	return new Promise((resolve, reject) => {
		pending.set(jobId, { resolve, reject });
		getWorker().postMessage({
			type: "detect",
			jobId,
			file,
			times,
			scoreThreshold,
		} satisfies FaceWorkerRequest);
	});
}
