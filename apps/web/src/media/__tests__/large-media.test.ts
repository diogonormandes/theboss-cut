import { describe, expect, test } from "bun:test";
import {
	canDecodeWholeAudio,
	estimateDecodedAudioBytes,
	LARGE_MEDIA_BYTES,
	WHOLE_AUDIO_DECODE_MAX_BYTES,
	WHOLE_AUDIO_UNKNOWN_DURATION_MAX_FILE_BYTES,
} from "@/media/large-media";

const MB = 1024 * 1024;

describe("estimateDecodedAudioBytes", () => {
	test("estéreo float32 a 48 kHz", () => {
		expect(estimateDecodedAudioBytes(1)).toBe(48000 * 2 * 4);
		// 4 h ≈ 5,5 GB: o motivo da guarda
		expect(estimateDecodedAudioBytes(4 * 3600)).toBeGreaterThan(5 * 1024 * MB);
	});

	test("duração inválida vira 0", () => {
		expect(estimateDecodedAudioBytes(Number.NaN)).toBe(0);
		expect(estimateDecodedAudioBytes(-3)).toBe(0);
	});
});

describe("canDecodeWholeAudio", () => {
	test("som curto pode ir inteiro (caminho antigo)", () => {
		expect(
			canDecodeWholeAudio({ durationSeconds: 30, file: { size: 500 * 1024 } }),
		).toBe(true);
	});

	test("m4a de 4 h a 96 kbps (≈ 173 MB, abaixo de 200 MB) NÃO vai inteiro", () => {
		const size = Math.round((4 * 3600 * 96000) / 8);
		expect(size).toBeLessThan(LARGE_MEDIA_BYTES);
		expect(canDecodeWholeAudio({ durationSeconds: 4 * 3600, file: { size } })).toBe(
			false,
		);
	});

	test("limite pela duração decodificada (~2,8 min)", () => {
		const limitSeconds = WHOLE_AUDIO_DECODE_MAX_BYTES / (48000 * 2 * 4);
		expect(
			canDecodeWholeAudio({ durationSeconds: limitSeconds - 1, file: { size: MB } }),
		).toBe(true);
		expect(
			canDecodeWholeAudio({ durationSeconds: limitSeconds + 1, file: { size: MB } }),
		).toBe(false);
	});

	test("arquivo grande nunca vai inteiro, mesmo com duração curta informada", () => {
		expect(
			canDecodeWholeAudio({
				durationSeconds: 10,
				file: { size: LARGE_MEDIA_BYTES + 1 },
			}),
		).toBe(false);
	});

	test("sem duração: só arquivo minúsculo", () => {
		expect(
			canDecodeWholeAudio({
				durationSeconds: undefined,
				file: { size: WHOLE_AUDIO_UNKNOWN_DURATION_MAX_FILE_BYTES },
			}),
		).toBe(true);
		expect(
			canDecodeWholeAudio({
				durationSeconds: Number.NaN,
				file: { size: WHOLE_AUDIO_UNKNOWN_DURATION_MAX_FILE_BYTES + 1 },
			}),
		).toBe(false);
	});
});
