import type {
	AudioElement,
	VideoElement,
	LibraryAudioElement,
	RetimeConfig,
	SceneTracks,
} from "@/timeline";
import { shouldMaintainPitch } from "@/retime/rate";
import type { MediaAsset } from "@/media/types";
import { applyAudioMasteringToBuffer } from "@/media/audio-mastering";
import type { AudioCapableElement } from "@/timeline/audio-state";
import {
	hasAnimatedVolume,
	isElementMuted,
	resolveEffectiveAudioGain,
} from "@/timeline/audio-state";
import { doesElementHaveEnabledAudio } from "@/timeline/audio-separation";
import { canElementHaveAudio, hasMediaId } from "@/timeline/element-utils";
import { canTrackHaveAudio } from "@/timeline";
import { mediaSupportsAudio } from "@/media/media-utils";
import { getSourceTimeAtClipTime, renderRetimedBuffer } from "@/retime";
import {
	Input,
	ALL_FORMATS,
	BlobSource,
	AudioSampleSink,
	type InputAudioTrack,
} from "mediabunny";
import { TICKS_PER_SECOND } from "@/wasm";
import {
	computeSourceRange,
	getRangeFrameCount,
	placeSampleInRange,
	rebaseTrimStart,
	type SourceRange,
} from "@/media/audio-range";
import { canDecodeWholeAudio } from "@/media/large-media";
import {
	computeRmsBuckets,
	type SampleBucket,
} from "@/media/waveform-summary";

const MAX_AUDIO_CHANNELS = 2;
const EXPORT_SAMPLE_RATE = 44100;

export interface CollectedAudioElement {
	timelineElement: AudioCapableElement;
	/**
	 * Só o trecho da fonte que o elemento usa (com folga), não a mídia inteira.
	 * A amostra 0 de `buffer` = `bufferStartTime` segundos da fonte.
	 */
	buffer: AudioBuffer;
	bufferStartTime: number;
	startTime: number;
	duration: number;
	/** segundos da FONTE (não do buffer); use `rebaseTrimStart` para o buffer */
	trimStart: number;
	trimEnd: number;
	volume: number;
	muted: boolean;
	retime?: RetimeConfig;
}

export function createAudioContext({
	sampleRate,
}: {
	sampleRate?: number;
} = {}): AudioContext {
	const AudioContextConstructor =
		window.AudioContext ||
		(window as typeof window & { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext;

	return new AudioContextConstructor(sampleRate ? { sampleRate } : undefined);
}

export interface DecodedAudio {
	samples: Float32Array;
	sampleRate: number;
}

/**
 * ATENÇÃO (memória): carrega e decodifica o blob INTEIRO. Use só com áudio
 * curto/pequeno (ver `canDecodeWholeAudio`). Para a legenda da linha do tempo use
 * `extractTimelineAudioSamples` (media/mediabunny.ts), que não passa por WAV.
 */
export async function decodeAudioToFloat32({
	audioBlob,
	sampleRate,
}: {
	audioBlob: Blob;
	sampleRate?: number;
}): Promise<DecodedAudio> {
	const audioContext = createAudioContext({ sampleRate });
	let audioBuffer: AudioBuffer;
	try {
		const arrayBuffer = await audioBlob.arrayBuffer();
		audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
	} finally {
		// o AudioBuffer continua válido depois do close
		void audioContext.close();
	}

	// mix down to mono
	const numChannels = audioBuffer.numberOfChannels;
	const length = audioBuffer.length;
	const samples = new Float32Array(length);

	for (let i = 0; i < length; i++) {
		let sum = 0;
		for (let channel = 0; channel < numChannels; channel++) {
			sum += audioBuffer.getChannelData(channel)[i];
		}
		samples[i] = sum / numChannels;
	}

	return { samples, sampleRate: audioBuffer.sampleRate };
}

export interface AudibleElementCandidate {
	element: AudioElement | VideoElement;
	mediaAsset: MediaAsset | null;
}

export function collectAudibleCandidates({
	tracks,
	mediaAssets,
}: {
	tracks: SceneTracks;
	mediaAssets: MediaAsset[];
}): AudibleElementCandidate[] {
	const allTracks = [...tracks.overlay, tracks.main, ...tracks.audio];
	const mediaMap = new Map(mediaAssets.map((a) => [a.id, a]));
	const candidates: AudibleElementCandidate[] = [];

	for (const track of allTracks) {
		if (canTrackHaveAudio(track) && track.muted) continue;

		for (const element of track.elements) {
			if (!canElementHaveAudio(element)) continue;
			if (element.duration <= 0) continue;

			const mediaAsset = hasMediaId(element)
				? (mediaMap.get(element.mediaId) ?? null)
				: null;
			if (!doesElementHaveEnabledAudio({ element, mediaAsset })) continue;

			candidates.push({ element, mediaAsset });
		}
	}

	return candidates;
}

export function timelineHasAudio({
	tracks,
	mediaAssets,
}: {
	tracks: SceneTracks;
	mediaAssets: MediaAsset[];
}): boolean {
	return collectAudibleCandidates({ tracks, mediaAssets }).some(
		({ element }) => !isElementMuted({ element }),
	);
}

export async function collectAudioElements({
	tracks,
	mediaAssets,
	audioContext,
}: {
	tracks: SceneTracks;
	mediaAssets: MediaAsset[];
	audioContext: BaseAudioContext;
}): Promise<CollectedAudioElement[]> {
	const audioElements: CollectedAudioElement[] = [];
	for await (const element of iterateAudioElements({
		tracks,
		mediaAssets,
		audioContext,
	})) {
		audioElements.push(element);
	}
	return audioElements;
}

/**
 * Decodifica o áudio de cada elemento UM DE CADA VEZ (nunca em paralelo) e só
 * o trecho da fonte que o elemento usa. Quem consome pode mixar e soltar cada
 * buffer antes de pedir o próximo, mantendo só um no pico de memória.
 *
 * Elementos mudos são pulados ANTES de decodificar (não somam nada na mistura,
 * e decodificar a live inteira só para jogar fora custava GBs). Por isso
 * `muted` dos itens gerados é sempre `false`.
 *
 * `trackPool`: um `Input` por arquivo durante a passada (vários cortes da
 * mesma live não reabrem nem remontam o índice do arquivo de horas).
 */
async function* iterateAudioElements({
	tracks,
	mediaAssets,
	audioContext,
	trackPool,
}: {
	tracks: SceneTracks;
	mediaAssets: MediaAsset[];
	audioContext: BaseAudioContext;
	trackPool?: AudioTrackPool;
}): AsyncGenerator<CollectedAudioElement, void, unknown> {
	const candidates = collectAudibleCandidates({ tracks, mediaAssets });
	const mediaMap = new Map<string, MediaAsset>(
		mediaAssets.map((media) => [media.id, media]),
	);

	for (const { element, mediaAsset } of candidates) {
		// GUARDA DE MEMÓRIA: elemento mudo não é decodificado
		if (isElementMuted({ element })) continue;

		const trimStart = element.trimStart / TICKS_PER_SECOND;
		const duration = element.duration / TICKS_PER_SECOND;
		const range = computeSourceRange({
			trimStart,
			duration,
			retime: element.retime,
		});

		let decoded: DecodedAudioRange | null = null;
		if (element.type === "audio") {
			decoded = await resolveAudioBufferForElement({
				element,
				mediaMap,
				audioContext,
				range,
				trackPool,
			});
		} else if (element.type === "video") {
			if (!mediaAsset || !mediaSupportsAudio({ media: mediaAsset })) continue;
			decoded = await resolveAudioBufferForAsset({
				asset: mediaAsset,
				audioContext,
				range,
				trackPool,
			});
		}
		if (!decoded) continue;

		yield {
			timelineElement: element,
			buffer: decoded.buffer,
			bufferStartTime: decoded.startTime,
			startTime: element.startTime / TICKS_PER_SECOND,
			duration,
			trimStart,
			trimEnd: element.trimEnd / TICKS_PER_SECOND,
			volume: resolveEffectiveAudioGain({
				element,
				trackMuted: false,
				localTime: 0,
			}),
			muted: false,
			retime: element.retime,
		};
	}
}

async function resolveAudioBufferForElement({
	element,
	mediaMap,
	audioContext,
	range,
	trackPool,
}: {
	element: AudioElement;
	mediaMap: Map<string, MediaAsset>;
	audioContext: BaseAudioContext;
	range: SourceRange;
	trackPool?: AudioTrackPool;
}): Promise<DecodedAudioRange | null> {
	try {
		if (element.sourceType === "upload") {
			const asset = mediaMap.get(element.mediaId);
			if (!asset) return null;
			return await resolveAudioBufferForAsset({
				asset,
				audioContext,
				range,
				trackPool,
			});
		}

		// áudio da biblioteca: arquivo curto, vem inteiro (buffer começa em 0)
		if (element.buffer) return { buffer: element.buffer, startTime: 0 };

		const response = await fetch(element.sourceUrl);
		if (!response.ok) {
			throw new Error(`Library audio fetch failed: ${response.status}`);
		}

		const arrayBuffer = await response.arrayBuffer();
		return {
			buffer: await audioContext.decodeAudioData(arrayBuffer.slice(0)),
			startTime: 0,
		};
	} catch (error) {
		console.warn("Failed to decode audio:", error);
		return null;
	}
}

/**
 * Áudio de uma mídia importada, só no intervalo `range` da fonte.
 *
 * - Áudio puro CURTO (ver `canDecodeWholeAudio`: decide pela duração, não só
 *   pelo tamanho do arquivo): decodifica inteiro como sempre fez
 *   (`decodeAudioData`, buffer começa em 0) — mesmo resultado de antes.
 * - Vídeo, ou áudio longo (ex.: m4a/mp3 de horas, pequeno em disco mas GBs
 *   decodificado): lê por fatias e decodifica só `range` (memória
 *   proporcional ao trecho, não à live inteira).
 */
async function resolveAudioBufferForAsset({
	asset,
	audioContext,
	range,
	trackPool,
}: {
	asset: MediaAsset;
	audioContext: BaseAudioContext;
	range: SourceRange;
	trackPool?: AudioTrackPool;
}): Promise<DecodedAudioRange | null> {
	// GUARDA DE MEMÓRIA: arrayBuffer() + decodeAudioData do arquivo inteiro só
	// para áudio curto (pela duração estimada já decodificada).
	if (
		asset.type === "audio" &&
		canDecodeWholeAudio({ durationSeconds: asset.duration, file: asset.file })
	) {
		try {
			const arrayBuffer = await asset.file.arrayBuffer();
			return {
				buffer: await audioContext.decodeAudioData(arrayBuffer),
				startTime: 0,
			};
		} catch (error) {
			console.warn("Failed to decode audio asset:", error);
			return null;
		}
	}

	return await decodeAudioRange({
		file: asset.file,
		range,
		audioContext,
		audioTrack: trackPool ? await trackPool.getTrack(asset.file) : undefined,
	});
}

/**
 * Um `Input` (e a faixa de áudio dele) por arquivo, reaproveitado durante uma
 * passada inteira (exportação, legenda). Abrir o arquivo de uma live de horas
 * monta o índice do contêiner (tabelas do MP4, cues do MKV); com vários cortes
 * da mesma live isso era refeito a cada corte. Chame `dispose()` no fim.
 */
export interface AudioTrackPool {
	getTrack(file: File): Promise<InputAudioTrack | null>;
	dispose(): void;
}

export function createAudioTrackPool(): AudioTrackPool {
	const entries = new Map<
		File,
		{ input: Input; track: Promise<InputAudioTrack | null> }
	>();
	return {
		getTrack(file) {
			let entry = entries.get(file);
			if (!entry) {
				const input = new Input({
					source: new BlobSource(file),
					formats: ALL_FORMATS,
				});
				const track = input.getPrimaryAudioTrack().catch((error) => {
					console.warn("Failed to open audio track:", error);
					return null;
				});
				entry = { input, track };
				entries.set(file, entry);
			}
			return entry.track;
		},
		dispose() {
			for (const { input } of entries.values()) input.dispose();
			entries.clear();
		},
	};
}

export interface DecodedAudioRange {
	/** áudio na taxa do `audioContext`; amostra 0 = `startTime` da fonte */
	buffer: AudioBuffer;
	/** em segundos da fonte */
	startTime: number;
}

/**
 * Decodifica só `[range.start, range.end)` do áudio de um arquivo, lendo por
 * fatias (`BlobSource`) e escrevendo cada pedaço direto no lugar certo do
 * buffer (pelo timestamp, o mesmo relógio da prévia), sem guardar lista de
 * pedaços nem cópia do arquivo. Depois reamostra para a taxa do
 * `audioContext` com o mesmo reamostrador de antes (`OfflineAudioContext`),
 * só quando a taxa é diferente.
 *
 * ATENÇÃO (memória): o custo é proporcional ao tamanho de `range`. Não chame
 * com o intervalo da mídia inteira de uma live longa.
 *
 * `audioTrack`: faixa já aberta deste mesmo `file` (de um `AudioTrackPool` ou
 * do `AudioManager`), para não reabrir o arquivo. Quem passou é o dono dela e
 * descarta; sem ela, abre e descarta um `Input` só para esta chamada.
 */
export async function decodeAudioRange({
	file,
	range,
	audioContext,
	maxChannels = MAX_AUDIO_CHANNELS,
	audioTrack: providedTrack,
}: {
	file: File;
	range: SourceRange;
	audioContext: BaseAudioContext;
	maxChannels?: number;
	audioTrack?: InputAudioTrack | null;
}): Promise<DecodedAudioRange | null> {
	const input = providedTrack
		? null
		: new Input({
				source: new BlobSource(file),
				formats: ALL_FORMATS,
			});

	try {
		const audioTrack =
			providedTrack ?? (input ? await input.getPrimaryAudioTrack() : null);
		if (!audioTrack) return null;

		const sink = new AudioSampleSink(audioTrack);
		let nativeBuffer: AudioBuffer | null = null;
		let channelData: Float32Array[] = [];
		let expectedDestFrame: number | undefined;

		for await (const sample of sink.samples(range.start, range.end)) {
			try {
				if (!nativeBuffer) {
					const numChannels = Math.max(
						1,
						Math.min(maxChannels, sample.numberOfChannels),
					);
					const created = audioContext.createBuffer(
						numChannels,
						getRangeFrameCount({ range, sampleRate: sample.sampleRate }),
						sample.sampleRate,
					);
					nativeBuffer = created;
					channelData = Array.from({ length: numChannels }, (_, channel) =>
						created.getChannelData(channel),
					);
				}
				// troca de taxa no meio do arquivo: raro; ignora o pedaço
				if (sample.sampleRate !== nativeBuffer.sampleRate) continue;

				const placement = placeSampleInRange({
					sampleTimestamp: sample.timestamp,
					sampleFrames: sample.numberOfFrames,
					sampleRate: nativeBuffer.sampleRate,
					rangeStart: range.start,
					bufferLength: nativeBuffer.length,
					expectedDestFrame,
				});
				if (!placement) continue;

				const { srcFrameOffset, destFrameOffset, frameCount } = placement;
				for (let channel = 0; channel < channelData.length; channel++) {
					sample.copyTo(
						channelData[channel].subarray(
							destFrameOffset,
							destFrameOffset + frameCount,
						),
						{
							planeIndex: Math.min(channel, sample.numberOfChannels - 1),
							format: "f32-planar",
							frameOffset: srcFrameOffset,
							frameCount,
						},
					);
				}
				expectedDestFrame = destFrameOffset + frameCount;
			} finally {
				sample.close();
			}
		}

		if (!nativeBuffer) return null;

		const targetSampleRate = audioContext.sampleRate;
		if (nativeBuffer.sampleRate === targetSampleRate) {
			return { buffer: nativeBuffer, startTime: range.start };
		}

		// reamostragem de qualidade para a taxa de saída (como antes)
		const offlineContext = new OfflineAudioContext(
			nativeBuffer.numberOfChannels,
			Math.ceil(
				nativeBuffer.length * (targetSampleRate / nativeBuffer.sampleRate),
			),
			targetSampleRate,
		);
		const sourceNode = offlineContext.createBufferSource();
		sourceNode.buffer = nativeBuffer;
		sourceNode.connect(offlineContext.destination);
		sourceNode.start(0);

		return {
			buffer: await offlineContext.startRendering(),
			startTime: range.start,
		};
	} catch (error) {
		console.warn("Failed to decode asset audio:", error);
		return null;
	} finally {
		input?.dispose();
	}
}

interface AudioMixSource {
	timelineElement: AudioCapableElement;
	file: File;
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
	volume: number;
	retime?: RetimeConfig;
}

export interface AudioClipSource {
	timelineElement: AudioCapableElement;
	id: string;
	sourceKey: string;
	file: File;
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
	volume: number;
	muted: boolean;
	retime?: RetimeConfig;
}

async function fetchLibraryAudioSource({
	element,
	volume,
}: {
	element: LibraryAudioElement;
	volume: number;
}): Promise<AudioMixSource | null> {
	try {
		const response = await fetch(element.sourceUrl);
		if (!response.ok) {
			throw new Error(`Library audio fetch failed: ${response.status}`);
		}

		const blob = await response.blob();
		const file = new File([blob], `${element.name}.mp3`, {
			type: "audio/mpeg",
		});

		return {
			timelineElement: element,
			file,
			startTime: element.startTime / TICKS_PER_SECOND,
			duration: element.duration / TICKS_PER_SECOND,
			trimStart: element.trimStart / TICKS_PER_SECOND,
			trimEnd: element.trimEnd / TICKS_PER_SECOND,
			volume,
			retime: element.retime,
		};
	} catch (error) {
		console.warn("Failed to fetch library audio:", error);
		return null;
	}
}

async function fetchLibraryAudioClip({
	element,
	muted,
	volume,
}: {
	element: LibraryAudioElement;
	muted: boolean;
	volume: number;
}): Promise<AudioClipSource | null> {
	try {
		const response = await fetch(element.sourceUrl);
		if (!response.ok) {
			throw new Error(`Library audio fetch failed: ${response.status}`);
		}

		const blob = await response.blob();
		const file = new File([blob], `${element.name}.mp3`, {
			type: "audio/mpeg",
		});

		return {
			timelineElement: element,
			id: element.id,
			sourceKey: element.id,
			file,
			// em segundos, como `collectMediaAudioClip` (antes ia em ticks)
			startTime: element.startTime / TICKS_PER_SECOND,
			duration: element.duration / TICKS_PER_SECOND,
			trimStart: element.trimStart / TICKS_PER_SECOND,
			trimEnd: element.trimEnd / TICKS_PER_SECOND,
			volume,
			muted,
			retime: element.retime,
		};
	} catch (error) {
		console.warn("Failed to fetch library audio:", error);
		return null;
	}
}

function collectMediaAudioSource({
	element,
	mediaAsset,
	volume,
}: {
	element: AudioCapableElement;
	mediaAsset: MediaAsset;
	volume: number;
}): AudioMixSource {
	return {
		timelineElement: element,
		file: mediaAsset.file,
		startTime: element.startTime / TICKS_PER_SECOND,
		duration: element.duration / TICKS_PER_SECOND,
		trimStart: element.trimStart / TICKS_PER_SECOND,
		trimEnd: element.trimEnd / TICKS_PER_SECOND,
		volume,
		retime: element.retime,
	};
}

function collectMediaAudioClip({
	element,
	mediaAsset,
	muted,
	volume,
}: {
	element: AudioCapableElement;
	mediaAsset: MediaAsset;
	muted: boolean;
	volume: number;
}): AudioClipSource {
	return {
		timelineElement: element,
		id: element.id,
		sourceKey: mediaAsset.id,
		file: mediaAsset.file,
		startTime: element.startTime / TICKS_PER_SECOND,
		duration: element.duration / TICKS_PER_SECOND,
		trimStart: element.trimStart / TICKS_PER_SECOND,
		trimEnd: element.trimEnd / TICKS_PER_SECOND,
		volume,
		muted,
		retime: element.retime,
	};
}

export async function collectAudioMixSources({
	tracks,
	mediaAssets,
}: {
	tracks: SceneTracks;
	mediaAssets: MediaAsset[];
}): Promise<AudioMixSource[]> {
	const orderedTracks = [...tracks.overlay, tracks.main, ...tracks.audio];
	const audioMixSources: AudioMixSource[] = [];
	const mediaMap = new Map<string, MediaAsset>(
		mediaAssets.map((asset) => [asset.id, asset]),
	);
	const pendingLibrarySources: Array<Promise<AudioMixSource | null>> = [];

	for (const track of orderedTracks) {
		if (canTrackHaveAudio(track) && track.muted) continue;

		for (const element of track.elements) {
			if (!canElementHaveAudio(element)) continue;
			if (isElementMuted({ element })) continue;
			const mediaAsset = hasMediaId(element)
				? (mediaMap.get(element.mediaId) ?? null)
				: null;
			if (!doesElementHaveEnabledAudio({ element, mediaAsset })) continue;
			const volume = resolveEffectiveAudioGain({
				element,
				localTime: 0,
			});

			if (element.type === "audio") {
				if (element.sourceType === "upload") {
					const mediaAsset = mediaMap.get(element.mediaId);
					if (!mediaAsset) continue;

					audioMixSources.push(
						collectMediaAudioSource({ element, mediaAsset, volume }),
					);
				} else {
					pendingLibrarySources.push(
						fetchLibraryAudioSource({ element, volume }),
					);
				}
				continue;
			}

			if (element.type === "video") {
				if (mediaAsset && mediaSupportsAudio({ media: mediaAsset })) {
					audioMixSources.push(
						collectMediaAudioSource({ element, mediaAsset, volume }),
					);
				}
			}
		}
	}

	const resolvedLibrarySources = await Promise.all(pendingLibrarySources);
	for (const source of resolvedLibrarySources) {
		if (source) audioMixSources.push(source);
	}

	return audioMixSources;
}

export async function collectAudioClips({
	tracks,
	mediaAssets,
}: {
	tracks: SceneTracks;
	mediaAssets: MediaAsset[];
}): Promise<AudioClipSource[]> {
	const orderedTracks = [...tracks.overlay, tracks.main, ...tracks.audio];
	const clips: AudioClipSource[] = [];
	const mediaMap = new Map<string, MediaAsset>(
		mediaAssets.map((asset) => [asset.id, asset]),
	);
	const pendingLibraryClips: Array<Promise<AudioClipSource | null>> = [];

	for (const track of orderedTracks) {
		const isTrackMuted = canTrackHaveAudio(track) && track.muted;

		for (const element of track.elements) {
			if (!canElementHaveAudio(element)) continue;

			const mediaAsset = hasMediaId(element)
				? (mediaMap.get(element.mediaId) ?? null)
				: null;
			if (!doesElementHaveEnabledAudio({ element, mediaAsset })) continue;

			const muted = isTrackMuted || isElementMuted({ element });
			const volume = resolveEffectiveAudioGain({
				element,
				trackMuted: isTrackMuted,
				localTime: 0,
			});

			if (element.type === "audio") {
				if (element.sourceType === "upload") {
					const mediaAsset = mediaMap.get(element.mediaId);
					if (!mediaAsset) continue;

					clips.push(
						collectMediaAudioClip({
							element,
							mediaAsset,
							muted,
							volume,
						}),
					);
				} else {
					pendingLibraryClips.push(
						fetchLibraryAudioClip({ element, muted, volume }),
					);
				}
				continue;
			}

			if (element.type === "video") {
				if (mediaAsset && mediaSupportsAudio({ media: mediaAsset })) {
					clips.push(
						collectMediaAudioClip({
							element,
							mediaAsset,
							muted,
							volume,
						}),
					);
				}
			}
		}
	}

	const resolvedLibraryClips = await Promise.all(pendingLibraryClips);
	for (const clip of resolvedLibraryClips) {
		if (clip) clips.push(clip);
	}

	return clips;
}

export async function createTimelineAudioBuffer({
	tracks,
	mediaAssets,
	duration,
	sampleRate = EXPORT_SAMPLE_RATE,
	audioContext,
}: {
	tracks: SceneTracks;
	mediaAssets: MediaAsset[];
	duration: number;
	sampleRate?: number;
	audioContext?: BaseAudioContext;
}): Promise<AudioBuffer | null> {
	// Sem contexto de fora: um OfflineAudioContext basta (só cria buffers e
	// decodifica). Não abre thread de áudio nem dispositivo e não precisa de
	// close() — antes, um AudioContext real ficava vivo a cada exportação/legenda.
	const context =
		audioContext ??
		new OfflineAudioContext({ numberOfChannels: 2, length: 1, sampleRate });
	const trackPool = createAudioTrackPool();
	try {
		return await mixTimelineAudio({
			tracks,
			mediaAssets,
			duration,
			sampleRate,
			context,
			trackPool,
		});
	} finally {
		trackPool.dispose();
	}
}

async function mixTimelineAudio({
	tracks,
	mediaAssets,
	duration,
	sampleRate,
	context,
	trackPool,
}: {
	tracks: SceneTracks;
	mediaAssets: MediaAsset[];
	duration: number;
	sampleRate: number;
	context: BaseAudioContext;
	trackPool: AudioTrackPool;
}): Promise<AudioBuffer | null> {
	const outputChannels = 2;
	const durationSeconds = duration / TICKS_PER_SECOND;
	const outputLength = Math.ceil(durationSeconds * sampleRate);
	let outputBuffer: AudioBuffer | null = null;

	// Um elemento por vez: decodifica só o trecho dele, mixa e solta o buffer
	// antes de decodificar o próximo (pico = saída + 1 trecho).
	for await (const element of iterateAudioElements({
		tracks,
		mediaAssets,
		audioContext: context,
		trackPool,
	})) {
		outputBuffer ??= context.createBuffer(
			outputChannels,
			outputLength,
			sampleRate,
		);

		// SINCRONIA: o buffer começa em `bufferStartTime` na fonte, então o
		// ponto da fonte que cai em `startTime` da linha do tempo é
		// `trimStart - bufferStartTime` dentro do buffer.
		const bufferTrimStart = rebaseTrimStart({
			trimStart: element.trimStart,
			bufferStart: element.bufferStartTime,
		});

		const renderedBuffer = shouldMaintainPitch({
			rate: element.retime?.rate ?? 1,
			maintainPitch: element.retime?.maintainPitch,
		})
			? await renderRetimedBuffer({
					audioContext: context,
					sourceBuffer: element.buffer,
					trimStart: bufferTrimStart,
					clipDuration: element.duration,
					retime: element.retime,
					maintainPitch: true,
				})
			: undefined;

		mixAudioChannels({
			element,
			buffer: renderedBuffer ?? element.buffer,
			trimStart: renderedBuffer ? 0 : bufferTrimStart,
			retime: renderedBuffer ? undefined : element.retime,
			outputBuffer,
			outputLength,
			sampleRate,
		});
	}

	if (!outputBuffer) {
		// Só havia elementos mudos (pulados sem decodificar): devolve silêncio,
		// como antes, em vez de "sem áudio".
		const hasMutedCandidate = collectAudibleCandidates({
			tracks,
			mediaAssets,
		}).some(({ element }) => isElementMuted({ element }));
		if (!hasMutedCandidate) return null;
		return context.createBuffer(outputChannels, outputLength, sampleRate);
	}

	return await applyAudioMasteringToBuffer({ audioBuffer: outputBuffer });
}

function collectPeakRange({
	buffer,
	count,
	startSample,
	endSample,
}: {
	buffer: AudioBuffer;
	count: number;
	startSample: number;
	endSample: number;
}): Float32Array {
	const channels = buffer.numberOfChannels;
	const peaks = new Float32Array(count);

	for (let c = 0; c < channels; c++) {
		const data = buffer.getChannelData(c);
		for (let i = 0; i < count; i++) {
			const { bucketStart: start, bucketEnd: end } = getSampleBucketRange({
				startSample,
				endSample,
				bucketIndex: i,
				bucketCount: count,
			});
			for (let j = start; j < end; j++) {
				const abs = Math.abs(data[j]);
				if (abs > peaks[i]) peaks[i] = abs;
			}
		}
	}

	return peaks;
}

export function extractPeakRange({
	buffer,
	count,
	startSample,
	endSample,
}: {
	buffer: AudioBuffer;
	count: number;
	startSample: number;
	endSample: number;
}): number[] {
	return Array.from(
		collectPeakRange({
			buffer,
			count,
			startSample,
			endSample,
		}),
	);
}

export function getSampleBucketRange({
	startSample,
	endSample,
	bucketIndex,
	bucketCount,
}: {
	startSample: number;
	endSample: number;
	bucketIndex: number;
	bucketCount: number;
}): {
	bucketStart: number;
	bucketEnd: number;
} {
	const rangeLength = Math.max(0, endSample - startSample);
	const bucketStart =
		startSample + Math.floor((bucketIndex * rangeLength) / bucketCount);
	const bucketEnd =
		startSample + Math.floor(((bucketIndex + 1) * rangeLength) / bucketCount);
	return {
		bucketStart,
		bucketEnd: Math.max(bucketStart, bucketEnd),
	};
}

export function extractRmsBuckets({
	buffer,
	buckets,
}: {
	buffer: AudioBuffer;
	buckets: SampleBucket[];
}): number[] {
	return computeRmsBuckets({ buffer, buckets });
}

/**
 * Computes per-bucket waveform amplitude using the maximum RMS over a short
 * analysis window inside each bucket.
 *
 * A naive mean-RMS over a whole bucket averages silence together with nearby
 * sound, which smears transitions (e.g. the onset of speech) across the
 * bucket and makes the waveform respond late. Taking the max over fixed
 * short windows (~20 ms) preserves the smooth, non-jittery RMS character
 * while making transitions land where they actually happen in the audio.
 *
 * Channels are combined per-window before taking the max, so the measure
 * reflects total energy regardless of stereo layout.
 */
export function extractRmsRange({
	buffer,
	count,
	startSample,
	endSample,
}: {
	buffer: AudioBuffer;
	count: number;
	startSample: number;
	endSample: number;
}): number[] {
	return extractRmsBuckets({
		buffer,
		buckets: Array.from({ length: count }, (_, bucketIndex) =>
			getSampleBucketRange({
				startSample,
				endSample,
				bucketIndex,
				bucketCount: count,
			}),
		),
	});
}

function mixAudioChannels({
	element,
	buffer,
	trimStart,
	retime,
	outputBuffer,
	outputLength,
	sampleRate,
}: {
	element: CollectedAudioElement;
	buffer: AudioBuffer;
	trimStart: number;
	retime?: RetimeConfig;
	outputBuffer: AudioBuffer;
	outputLength: number;
	sampleRate: number;
}): void {
	const { startTime, duration: elementDuration } = element;

	const outputStartSample = Math.floor(startTime * sampleRate);
	const renderedLength = Math.ceil(elementDuration * sampleRate);

	const outputChannels = 2;
	for (let channel = 0; channel < outputChannels; channel++) {
		const outputData = outputBuffer.getChannelData(channel);
		const sourceChannel = Math.min(channel, buffer.numberOfChannels - 1);
		const sourceData = buffer.getChannelData(sourceChannel);

		for (let i = 0; i < renderedLength; i++) {
			const outputIndex = outputStartSample + i;
			if (outputIndex >= outputLength) break;

			const clipTime = i / sampleRate;
			const sourceTime =
				trimStart + getSourceTimeAtClipTime({ clipTime, retime });
			const sourceIndex = sourceTime * buffer.sampleRate;
			if (sourceIndex >= sourceData.length) break;

			const lowerIndex = Math.floor(sourceIndex);
			const upperIndex = Math.min(sourceData.length - 1, lowerIndex + 1);
			const fraction = sourceIndex - lowerIndex;
			const gain = hasAnimatedVolume({ element: element.timelineElement })
				? resolveEffectiveAudioGain({
						element: element.timelineElement,
						localTime: clipTime,
					})
				: element.volume;
			outputData[outputIndex] +=
				(sourceData[lowerIndex] * (1 - fraction) +
					sourceData[upperIndex] * fraction) *
				gain;
		}
	}
}
