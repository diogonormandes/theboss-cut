/**
 * Resumo de picos da forma de onda montado em fluxo (pedaço por pedaço),
 * para mídias grandes em que não dá para decodificar o arquivo inteiro.
 *
 * Puro (sem DOM/mediabunny) para testar com bun:test. A memória é só o
 * próprio resumo: um float por bloco de `bucketSize` amostras (4 h a 48 kHz
 * com blocos de 512 ≈ 5 MB), nunca o áudio.
 */

const INITIAL_BUCKET_CAPACITY = 4096;

export interface PeakAccumulator {
	/**
	 * Soma um pedaço de áudio. `startFrame` é a posição (em amostras por canal,
	 * desde o tempo 0 da fonte) da primeira amostra de `channels[*][0]`.
	 */
	add(args: {
		startFrame: number;
		channels: Float32Array[];
		frameCount: number;
	}): void;
	finish(): { amplitudes: Float32Array; totalSamples: number };
}

export function createPeakAccumulator({
	bucketSize,
}: {
	bucketSize: number;
}): PeakAccumulator {
	const safeBucketSize = Math.max(1, Math.floor(bucketSize));
	let amplitudes = new Float32Array(INITIAL_BUCKET_CAPACITY);
	let totalSamples = 0;

	const ensureCapacity = (bucketCount: number) => {
		if (bucketCount <= amplitudes.length) return;
		let capacity = amplitudes.length;
		while (capacity < bucketCount) capacity *= 2;
		const grown = new Float32Array(capacity);
		grown.set(amplitudes);
		amplitudes = grown;
	};

	return {
		add({ startFrame, channels, frameCount }) {
			if (frameCount <= 0 || channels.length === 0) return;
			const firstFrame = Math.max(0, Math.floor(startFrame));
			const endFrame = firstFrame + frameCount;
			ensureCapacity(Math.ceil(endFrame / safeBucketSize));

			for (let channel = 0; channel < channels.length; channel++) {
				const data = channels[channel];
				let frame = firstFrame;
				while (frame < endFrame) {
					const bucket = Math.floor(frame / safeBucketSize);
					const bucketEnd = Math.min(endFrame, (bucket + 1) * safeBucketSize);
					let peak = amplitudes[bucket];
					for (let f = frame; f < bucketEnd; f++) {
						const value = data[f - firstFrame];
						const abs = value < 0 ? -value : value;
						if (abs > peak) peak = abs;
					}
					amplitudes[bucket] = peak;
					frame = bucketEnd;
				}
			}

			if (endFrame > totalSamples) totalSamples = endFrame;
		},
		finish() {
			const bucketCount = Math.max(1, Math.ceil(totalSamples / safeBucketSize));
			ensureCapacity(bucketCount);
			return {
				amplitudes: amplitudes.slice(0, bucketCount),
				totalSamples,
			};
		},
	};
}
