"use client";

import { createAudioContext } from "@/media/audio";
import {
	buildSourceWaveformSummary,
	type SourceWaveformSummary,
} from "@/media/waveform-summary";
import { canDecodeWholeAudio } from "@/media/large-media";
import { placeSampleInRange } from "@/media/audio-range";
import { createPeakAccumulator } from "@/media/waveform-stream";
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from "mediabunny";

/** blocos maiores para mídia longa: 4 h a 48 kHz ≈ 5 MB de resumo */
const LARGE_MEDIA_WAVEFORM_BUCKET_SIZE = 512;
/** mídia de até 1 h em fluxo: blocos de 128, como o caminho antigo (≈ 5 MB) */
const STREAM_FINE_BUCKET_SIZE = 128;
const STREAM_FINE_BUCKET_MAX_SECONDS = 60 * 60;
const STREAM_MAX_CHANNELS = 2;
const STREAM_READ_CACHE_BYTES = 16 * 1024 * 1024;

interface GetSourceWaveformSummaryArgs {
	sourceKey: string;
	audioBuffer?: AudioBuffer;
	sourceFile?: File;
	/** duração da mídia de origem (segundos), se conhecida */
	sourceDurationSeconds?: number;
	audioUrl?: string;
}

export class WaveformCache {
	private summaries = new Map<string, Promise<SourceWaveformSummary>>();

	getSourceSummary({
		sourceKey,
		audioBuffer,
		sourceFile,
		sourceDurationSeconds,
		audioUrl,
	}: GetSourceWaveformSummaryArgs): Promise<SourceWaveformSummary> {
		const existing = this.summaries.get(sourceKey);
		if (existing) {
			return existing;
		}

		const promise = this.buildSummary({
			sourceKey,
			audioBuffer,
			sourceFile,
			sourceDurationSeconds,
			audioUrl,
		}).catch((error) => {
			this.summaries.delete(sourceKey);
			throw error;
		});

		this.summaries.set(sourceKey, promise);
		return promise;
	}

	clearSource({ sourceKey }: { sourceKey: string }): void {
		this.summaries.delete(sourceKey);
	}

	clearAll(): void {
		this.summaries.clear();
	}

	private async buildSummary({
		sourceKey,
		audioBuffer,
		sourceFile,
		sourceDurationSeconds,
		audioUrl,
	}: GetSourceWaveformSummaryArgs): Promise<SourceWaveformSummary> {
		if (audioBuffer) {
			return buildSourceWaveformSummary({ sourceKey, buffer: audioBuffer });
		}

		// GUARDA DE MEMÓRIA: mídia longa (live de horas, o áudio separado que
		// aponta para o vídeo da live, ou um m4a/mp3 de horas que é pequeno em
		// disco mas vira GBs decodificado) nunca é decodificada inteira. A
		// decisão é pela DURAÇÃO (`canDecodeWholeAudio`), não só pelo tamanho.
		// Lê em fluxo e guarda só os picos.
		if (
			sourceFile &&
			!canDecodeWholeAudio({
				durationSeconds: sourceDurationSeconds,
				file: sourceFile,
			})
		) {
			const isKnownShort =
				typeof sourceDurationSeconds === "number" &&
				sourceDurationSeconds > 0 &&
				sourceDurationSeconds <= STREAM_FINE_BUCKET_MAX_SECONDS;
			return buildSummaryFromStream({
				sourceKey,
				file: sourceFile,
				bucketSize: isKnownShort
					? STREAM_FINE_BUCKET_SIZE
					: LARGE_MEDIA_WAVEFORM_BUCKET_SIZE,
			});
		}

		let arrayBuffer: ArrayBuffer | null = null;
		if (sourceFile) {
			arrayBuffer = await sourceFile.arrayBuffer();
		} else if (audioUrl) {
			const response = await fetch(audioUrl);
			if (!response.ok) {
				throw new Error(`Failed to fetch waveform source: ${response.status}`);
			}
			arrayBuffer = await response.arrayBuffer();
		}

		if (!arrayBuffer) {
			throw new Error(`No waveform source available for ${sourceKey}`);
		}

		const audioContext = createAudioContext();
		try {
			const buffer = await audioContext.decodeAudioData(arrayBuffer);
			return buildSourceWaveformSummary({ sourceKey, buffer });
		} finally {
			void audioContext.close();
		}
	}
}

/**
 * Resumo de picos lendo o arquivo por fatias (`BlobSource`) e decodificando
 * pedaço por pedaço (`AudioSampleSink`). Memória fixa: um pedaço de áudio por
 * vez + o resumo. Usa a taxa nativa do arquivo (o desenho usa
 * `summary.sampleRate`, então o tempo bate do mesmo jeito).
 */
async function buildSummaryFromStream({
	sourceKey,
	file,
	bucketSize,
}: {
	sourceKey: string;
	file: File;
	bucketSize: number;
}): Promise<SourceWaveformSummary> {
	const input = new Input({
		source: new BlobSource(file, { maxCacheSize: STREAM_READ_CACHE_BYTES }),
		formats: ALL_FORMATS,
	});

	try {
		const audioTrack = await input.getPrimaryAudioTrack();
		if (!audioTrack) {
			throw new Error(`No audio track for waveform ${sourceKey}`);
		}

		const accumulator = createPeakAccumulator({ bucketSize });
		const sink = new AudioSampleSink(audioTrack);
		let sampleRate = 0;
		let scratch: Float32Array[] = [];
		let expectedDestFrame: number | undefined;

		for await (const sample of sink.samples()) {
			try {
				if (sampleRate === 0) sampleRate = sample.sampleRate;
				if (sample.sampleRate !== sampleRate) continue;

				const placement = placeSampleInRange({
					sampleTimestamp: sample.timestamp,
					sampleFrames: sample.numberOfFrames,
					sampleRate,
					rangeStart: 0,
					bufferLength: Number.MAX_SAFE_INTEGER,
					expectedDestFrame,
				});
				if (!placement) continue;

				const { srcFrameOffset, destFrameOffset, frameCount } = placement;
				const channelCount = Math.min(
					STREAM_MAX_CHANNELS,
					sample.numberOfChannels,
				);
				if (scratch.length !== channelCount || scratch[0].length < frameCount) {
					scratch = Array.from(
						{ length: channelCount },
						() => new Float32Array(Math.max(frameCount, 4096)),
					);
				}
				for (let channel = 0; channel < channelCount; channel++) {
					sample.copyTo(scratch[channel].subarray(0, frameCount), {
						planeIndex: channel,
						format: "f32-planar",
						frameOffset: srcFrameOffset,
						frameCount,
					});
				}
				accumulator.add({
					startFrame: destFrameOffset,
					channels: scratch,
					frameCount,
				});
				expectedDestFrame = destFrameOffset + frameCount;
			} finally {
				sample.close();
			}
		}

		if (sampleRate === 0) {
			throw new Error(`No audio decoded for waveform ${sourceKey}`);
		}

		const { amplitudes, totalSamples } = accumulator.finish();
		return {
			sourceKey,
			sampleRate,
			totalSamples,
			bucketSize,
			amplitudes,
		};
	} finally {
		input.dispose();
	}
}

export const waveformCache = new WaveformCache();
