import { describe, expect, test } from "bun:test";
import { createPeakAccumulator } from "@/media/waveform-stream";

describe("createPeakAccumulator", () => {
	test("picos por bloco iguais ao cálculo com o áudio inteiro", () => {
		const total = 10_000;
		const left = new Float32Array(total);
		const right = new Float32Array(total);
		for (let i = 0; i < total; i++) {
			left[i] = Math.sin(i * 0.01) * ((i % 997) / 997);
			right[i] = -Math.cos(i * 0.013) * 0.5;
		}

		const bucketSize = 128;
		const accumulator = createPeakAccumulator({ bucketSize });
		// pedaços de tamanho irregular, como o decodificador entrega
		const sizes = [1024, 333, 4096, 7, 2000];
		let position = 0;
		let s = 0;
		while (position < total) {
			const frames = Math.min(sizes[s++ % sizes.length], total - position);
			accumulator.add({
				startFrame: position,
				channels: [
					left.subarray(position, position + frames),
					right.subarray(position, position + frames),
				],
				frameCount: frames,
			});
			position += frames;
		}
		const { amplitudes, totalSamples } = accumulator.finish();

		expect(totalSamples).toBe(total);
		expect(amplitudes.length).toBe(Math.ceil(total / bucketSize));
		for (let b = 0; b < amplitudes.length; b++) {
			let peak = 0;
			for (let i = b * bucketSize; i < Math.min(total, (b + 1) * bucketSize); i++) {
				peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
			}
			expect(amplitudes[b]).toBeCloseTo(peak, 6);
		}
	});

	test("buraco no meio (timestamp pulou) fica em silêncio no lugar certo", () => {
		const accumulator = createPeakAccumulator({ bucketSize: 10 });
		accumulator.add({
			startFrame: 0,
			channels: [new Float32Array(10).fill(0.5)],
			frameCount: 10,
		});
		accumulator.add({
			startFrame: 30,
			channels: [new Float32Array(10).fill(-0.8)],
			frameCount: 10,
		});
		const { amplitudes, totalSamples } = accumulator.finish();
		expect(totalSamples).toBe(40);
		expect(Array.from(amplitudes)).toEqual([0.5, 0, 0, Math.fround(0.8)]);
	});

	test("cresce além da capacidade inicial", () => {
		const accumulator = createPeakAccumulator({ bucketSize: 1 });
		accumulator.add({
			startFrame: 100_000,
			channels: [new Float32Array([0.25])],
			frameCount: 1,
		});
		const { amplitudes, totalSamples } = accumulator.finish();
		expect(totalSamples).toBe(100_001);
		expect(amplitudes[100_000]).toBe(0.25);
	});
});
