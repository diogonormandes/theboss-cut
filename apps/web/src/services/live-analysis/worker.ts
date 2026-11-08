/**
 * Worker do mapa da live: escuta a faixa de áudio inteira UMA vez, em fluxo.
 *
 * BlobSource (cache de 16 MB) → faixa escolhida → AudioSampleSink.samples()
 * → mono → 16 kHz → quadros de 100 ms (salto de 50 ms) → números pequenos.
 * Cada pedaço decodificado é fechado na hora: a memória fica fixa, seja a
 * live de 10 minutos ou de 5 horas. Só o resultado (8 bytes por quadro) cresce.
 */

import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from "mediabunny";
import { FeatureAccumulator } from "./features";
import { ANALYSIS_RATE, encodeAnalysis, HOP_SEC } from "./format";
import { StreamingResampler } from "./resampler";

export type LiveAnalysisWorkerRequest =
	| { type: "probe"; jobId: number; file: File }
	| {
			type: "analyze";
			jobId: number;
			file: File;
			trackIndex: number;
			/** duração conhecida (segundos); 0 = descobrir */
			durationSec: number;
	  }
	| { type: "cancel"; jobId: number };

export type LiveAnalysisErrorCode = "no-audio" | "cannot-decode" | "read-failed";

export type LiveAnalysisWorkerResponse =
	| {
			type: "probed";
			jobId: number;
			tracks: { name: string | null; languageCode: string; channels: number; sampleRate: number }[];
	  }
	| { type: "progress"; jobId: number; processedSec: number; durationSec: number }
	| {
			type: "done";
			jobId: number;
			buffer: ArrayBuffer;
			elapsedMs: number;
			/** maior memória de JavaScript do Worker vista (bytes), quando o navegador informa */
			peakHeapBytes: number | null;
	  }
	| { type: "cancelled"; jobId: number }
	| { type: "error"; jobId: number; code: LiveAnalysisErrorCode; detail: string };

const cancelled = new Set<number>();

/** memória de JavaScript deste Worker (só Chromium informa) */
function heapBytes(): number | null {
	const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
	return memory && typeof memory.usedJSHeapSize === "number" ? memory.usedJSHeapSize : null;
}

function post(message: LiveAnalysisWorkerResponse, transfer?: Transferable[]): void {
	(self as unknown as Worker).postMessage(message, transfer ?? []);
}

function openInput(file: File): Input {
	return new Input({
		source: new BlobSource(file, { maxCacheSize: 16 * 1024 * 1024 }),
		formats: ALL_FORMATS,
	});
}

async function probe(jobId: number, file: File): Promise<void> {
	const input = openInput(file);
	try {
		const tracks = await input.getAudioTracks();
		post({
			type: "probed",
			jobId,
			tracks: tracks.map((t) => ({
				name: t.name,
				languageCode: t.languageCode,
				channels: t.numberOfChannels,
				sampleRate: t.sampleRate,
			})),
		});
	} catch (error) {
		post({ type: "error", jobId, code: "read-failed", detail: String(error) });
	} finally {
		input.dispose();
	}
}

async function analyze({
	jobId,
	file,
	trackIndex,
	durationSec,
}: {
	jobId: number;
	file: File;
	trackIndex: number;
	durationSec: number;
}): Promise<void> {
	const started = performance.now();
	const input = openInput(file);
	try {
		const tracks = await input.getAudioTracks();
		const track = tracks[trackIndex];
		if (!track) {
			post({ type: "error", jobId, code: "no-audio", detail: "sem faixa de áudio" });
			return;
		}
		if (!(await track.canDecode())) {
			post({ type: "error", jobId, code: "cannot-decode", detail: String(track.codec) });
			return;
		}
		const total = durationSec > 0 ? durationSec : await track.computeDuration();
		const rate = track.sampleRate;
		const resampler = new StreamingResampler(rate, ANALYSIS_RATE);
		const acc = new FeatureAccumulator(total / HOP_SEC);

		let mono = new Float32Array(4096);
		let plane = new Float32Array(4096);
		/** amostras já enviadas à análise (reais + zeros), na taxa original */
		let sent = 0;
		/** tremido aceito entre o tempo do pedaço e o que já foi enviado (±1 ms no MKV) */
		const tolerance = Math.max(1, Math.round(rate * 0.002));
		let lastPost = 0;
		let processedSec = 0;
		let peakHeap = heapBytes();

		const pushMono = (data: Float32Array, count: number) => {
			const out = resampler.push(data, count);
			acc.push(out, out.length);
		};
		const pushZeros = (count: number) => {
			const zeros = new Float32Array(Math.min(count, rate));
			let left = count;
			while (left > 0) {
				const n = Math.min(left, zeros.length);
				pushMono(zeros, n);
				left -= n;
			}
		};

		for await (const sample of new AudioSampleSink(track).samples()) {
			try {
				if (cancelled.has(jobId)) break;
				if (sample.sampleRate !== rate) continue; // troca de taxa no meio: raro, ignora
				const frames = sample.numberOfFrames;
				const startPos = Math.round(sample.timestamp * rate);
				let skip = 0;
				// compara com o total já enviado (e não com o fim do pedaço anterior):
				// assim nenhum atraso fica acumulado, nem com pacotes perdidos de 20 ms
				const gap = startPos - sent;
				if (gap > tolerance) {
					// buraco na gravação: completa com silêncio para o tempo não escorregar
					const fill = Math.min(gap, rate * 3600);
					pushZeros(fill);
					sent += fill;
				} else if (gap < -tolerance) {
					// pedaço repetido/sobreposto: pula a parte que já foi
					skip = Math.min(frames, -gap);
				}
				const count = frames - skip;
				if (count > 0) {
					if (mono.length < count) mono = new Float32Array(count * 2);
					if (plane.length < count) plane = new Float32Array(count * 2);
					const channels = Math.max(1, sample.numberOfChannels);
					for (let ch = 0; ch < channels; ch++) {
						const target = ch === 0 ? mono : plane;
						sample.copyTo(target.subarray(0, count), {
							planeIndex: ch,
							format: "f32-planar",
							frameOffset: skip,
							frameCount: count,
						});
						if (ch > 0) for (let i = 0; i < count; i++) mono[i] += plane[i];
					}
					if (channels > 1) {
						const k = 1 / channels;
						for (let i = 0; i < count; i++) mono[i] *= k;
					}
					pushMono(mono, count);
				}
				if (count > 0) sent += count;
				processedSec = sent / rate;
			} finally {
				sample.close();
			}
			const now = performance.now();
			if (now - lastPost > 200) {
				lastPost = now;
				const heap = heapBytes();
				if (heap !== null && (peakHeap === null || heap > peakHeap)) peakHeap = heap;
				post({ type: "progress", jobId, processedSec, durationSec: total });
			}
		}

		if (cancelled.has(jobId)) {
			post({ type: "cancelled", jobId });
			return;
		}
		const tail = resampler.flush();
		acc.push(tail, tail.length);
		const analysis = acc.finish({
			durationSec: Math.max(total, processedSec),
			sourceRate: rate,
			trackIndex,
			trackCount: tracks.length,
		});
		const buffer = encodeAnalysis(analysis);
		post(
			{
				type: "done",
				jobId,
				buffer,
				elapsedMs: performance.now() - started,
				peakHeapBytes: peakHeap,
			},
			[buffer],
		);
	} catch (error) {
		if (cancelled.has(jobId)) post({ type: "cancelled", jobId });
		else post({ type: "error", jobId, code: "read-failed", detail: String(error) });
	} finally {
		cancelled.delete(jobId);
		input.dispose();
	}
}

self.onmessage = (event: MessageEvent<LiveAnalysisWorkerRequest>) => {
	const message = event.data;
	if (message.type === "cancel") {
		cancelled.add(message.jobId);
	} else if (message.type === "probe") {
		void probe(message.jobId, message.file);
	} else if (message.type === "analyze") {
		void analyze(message);
	}
};
