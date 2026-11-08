/**
 * Guarda de memória para mídias grandes (lives de horas).
 *
 * REGRA (plano da Etapa 3, risco 1): nenhum caminho pode carregar ou
 * decodificar a mídia inteira quando ela é grande. Para arquivos acima de
 * LARGE_MEDIA_BYTES é proibido:
 *   - `file.arrayBuffer()` / `blob.arrayBuffer()` do arquivo inteiro;
 *   - `decodeAudioData` do arquivo inteiro;
 *   - `sink.buffers(0)` / `sink.samples(0)` sem fim (decodifica tudo).
 * Leia por fatias com mediabunny (`BlobSource` + `AudioSampleSink` com
 * intervalo) e escreva direto no buffer final.
 *
 * Para ÁUDIO o tamanho do arquivo não basta (m4a/mp3 de horas tem menos de
 * 200 MB): decodificar inteiro só quando `canDecodeWholeAudio` (pela duração).
 *
 * Conta de referência: 5 h de áudio estéreo a 48 kHz em float32 ≈ 7 GB
 * por cópia — o PC alvo tem 16 GB e roda a live junto.
 */

/** Acima disso a mídia é tratada como "grande" (≈ 200 MB). */
export const LARGE_MEDIA_BYTES = 200 * 1024 * 1024;

export function isLargeMedia(file: Pick<Blob, "size"> | null | undefined): boolean {
	if (!file) return false;
	return file.size > LARGE_MEDIA_BYTES;
}

/**
 * Teto para decodificar um áudio INTEIRO de uma vez (`decodeAudioData`).
 * O tamanho do arquivo não basta: áudio comprimido de horas (m4a/mp3/opus de
 * uma live) fica bem abaixo de `LARGE_MEDIA_BYTES` e mesmo assim vira GBs ao
 * decodificar. A conta é pela DURAÇÃO: 64 MB ≈ 2,8 min estéreo a 48 kHz.
 */
export const WHOLE_AUDIO_DECODE_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Sem duração conhecida, só arquivo minúsculo pode ir inteiro (1 MB a
 * 32 kbps ≈ 4 min; a maioria dos sons curtos tem bem menos).
 */
export const WHOLE_AUDIO_UNKNOWN_DURATION_MAX_FILE_BYTES = 1024 * 1024;

const DECODE_ESTIMATE_SAMPLE_RATE = 48000;
const DECODE_ESTIMATE_CHANNELS = 2;
const DECODE_ESTIMATE_BYTES_PER_SAMPLE = 4;

/** Memória do áudio decodificado (float32, estéreo, 48 kHz) para uma duração. */
export function estimateDecodedAudioBytes(durationSeconds: number): number {
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
	return (
		durationSeconds *
		DECODE_ESTIMATE_SAMPLE_RATE *
		DECODE_ESTIMATE_CHANNELS *
		DECODE_ESTIMATE_BYTES_PER_SAMPLE
	);
}

/**
 * Pode decodificar o arquivo inteiro? Só quando o resultado cabe no teto
 * (pela duração) e o arquivo não é "grande". Duração desconhecida: só
 * arquivo minúsculo. Fora disso, leia por trechos/fluxo.
 */
export function canDecodeWholeAudio({
	durationSeconds,
	file,
}: {
	durationSeconds: number | null | undefined;
	file: Pick<Blob, "size"> | null | undefined;
}): boolean {
	if (isLargeMedia(file)) return false;
	if (
		typeof durationSeconds === "number" &&
		Number.isFinite(durationSeconds) &&
		durationSeconds > 0
	) {
		return (
			estimateDecodedAudioBytes(durationSeconds) <= WHOLE_AUDIO_DECODE_MAX_BYTES
		);
	}
	return (file?.size ?? 0) <= WHOLE_AUDIO_UNKNOWN_DURATION_MAX_FILE_BYTES;
}
