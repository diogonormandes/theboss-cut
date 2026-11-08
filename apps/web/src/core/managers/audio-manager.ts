import type { EditorCore } from "@/core";
import { TICKS_PER_SECOND } from "@/wasm";
import { clampRetimeRate, shouldMaintainPitch } from "@/retime/rate";
import type { AudioClipSource } from "@/media/audio";
import {
	createAudioContext,
	collectAudioClips,
	decodeAudioRange,
	type DecodedAudioRange,
} from "@/media/audio";
import { computeSourceRange, rebaseTrimStart } from "@/media/audio-range";
import {
	buildAudioGainAutomation,
	hasAnimatedVolume,
} from "@/timeline/audio-state";
import { createAudioMasteringChain } from "@/media/audio-mastering";
import {
	getClipTimeAtSourceTime,
	getSourceTimeAtClipTime,
	renderRetimedBuffer,
} from "@/retime";
import {
	ALL_FORMATS,
	AudioBufferSink,
	BlobSource,
	Input,
	type InputAudioTrack,
	type WrappedAudioBuffer,
} from "mediabunny";

/**
 * Clipe com velocidade/tom mantido: até esta duração (na linha do tempo) o
 * buffer preparado é do clipe inteiro, guardado em cache como antes. Acima
 * disso é preparado em janelas a partir do ponto de play, para a memória não
 * crescer com o tamanho do clipe (uma live de horas eram GBs por clipe).
 */
const PREPARED_WHOLE_CLIP_MAX_SECONDS = 60;
/** tamanho de cada janela preparada (no máximo 2 na memória por clipe) */
const PREPARED_WINDOW_SECONDS = 30;

export class AudioManager {
	private audioContext: AudioContext | null = null;
	private masterGain: GainNode | null = null;
	private playbackStartTime = 0;
	private playbackStartContextTime = 0;
	private scheduleTimer: number | null = null;
	private lookaheadSeconds = 2;
	private scheduleIntervalMs = 500;
	private clips: AudioClipSource[] = [];
	private sinks = new Map<string, AudioBufferSink>();
	private inputs = new Map<string, Input>();
	/** faixa de áudio aberta por fonte, usada pelo fluxo E pelo buffer preparado */
	private audioTracks = new Map<string, Promise<InputAudioTrack | null>>();
	private activeClipIds = new Set<string>();
	private clipIterators = new Map<
		string,
		AsyncGenerator<WrappedAudioBuffer, void, unknown>
	>();
	private queuedSources = new Set<AudioBufferSourceNode>();
	private preparedClipBuffers = new Map<string, Promise<AudioBuffer | null>>();
	private playbackSessionId = 0;
	private lastIsPlaying = false;
	private lastVolume = 1;
	private playbackLatencyCompensationSeconds = 0;
	private unsubscribers: Array<() => void> = [];

	constructor(private editor: EditorCore) {
		this.lastVolume = this.editor.playback.getVolume();

		this.unsubscribers.push(
			this.editor.playback.subscribe(this.handlePlaybackChange),
			this.editor.timeline.subscribe(this.handleTimelineChange),
			this.editor.media.subscribe(this.handleTimelineChange),
			this.editor.playback.onSeek(this.handleSeek),
		);
	}

	dispose(): void {
		this.stopPlayback();
		for (const unsub of this.unsubscribers) {
			unsub();
		}
		this.unsubscribers = [];
		this.disposeSinks();
		this.preparedClipBuffers.clear();
		if (this.audioContext) {
			void this.audioContext.close();
			this.audioContext = null;
			this.masterGain = null;
		}
	}

	private handlePlaybackChange = (): void => {
		const isPlaying = this.editor.playback.getIsPlaying();
		const volume = this.editor.playback.getVolume();

		if (volume !== this.lastVolume) {
			this.lastVolume = volume;
			this.updateGain();
		}

		if (isPlaying !== this.lastIsPlaying) {
			this.lastIsPlaying = isPlaying;
			if (isPlaying) {
				void this.startPlayback({
					time: this.editor.playback.getCurrentTime() / TICKS_PER_SECOND,
				});
			} else {
				this.stopPlayback();
			}
		}
	};

	private handleSeek = (time: number): void => {
		if (this.editor.playback.getIsScrubbing()) {
			this.stopPlayback();
			return;
		}

		if (this.editor.playback.getIsPlaying()) {
			void this.startPlayback({ time: time / TICKS_PER_SECOND });
			return;
		}

		this.stopPlayback();
	};

	private handleTimelineChange = (): void => {
		this.disposeSinks();
		this.preparedClipBuffers.clear();

		if (!this.editor.playback.getIsPlaying()) return;

		void this.startPlayback({
			time: this.editor.playback.getCurrentTime() / TICKS_PER_SECOND,
		});
	};

	private ensureAudioContext(): AudioContext | null {
		if (this.audioContext) return this.audioContext;
		if (typeof window === "undefined") return null;

		this.audioContext = createAudioContext();
		const { input } = createAudioMasteringChain({
			audioContext: this.audioContext,
			destination: this.audioContext.destination,
		});
		this.masterGain = input;
		this.masterGain.gain.value = this.lastVolume;
		return this.audioContext;
	}

	private updateGain(): void {
		if (!this.masterGain) return;
		this.masterGain.gain.value = this.lastVolume;
	}

	private getPlaybackTime(): number {
		if (!this.audioContext) return this.playbackStartTime;
		const elapsed =
			this.audioContext.currentTime - this.playbackStartContextTime;
		return this.playbackStartTime + elapsed;
	}

	private async startPlayback({ time }: { time: number }): Promise<void> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) return;

		this.stopPlayback();
		this.playbackSessionId++;
		this.playbackLatencyCompensationSeconds = 0;

		const tracks = this.editor.scenes.getActiveScene().tracks;
		const mediaAssets = this.editor.media.getAssets();
		const duration = this.editor.timeline.getTotalDuration();

		if (duration <= 0) return;

		if (audioContext.state === "suspended") {
			await audioContext.resume();
		}

		this.clips = await collectAudioClips({ tracks, mediaAssets });
		if (!this.editor.playback.getIsPlaying()) return;

		this.playbackStartTime = time;
		this.playbackStartContextTime = audioContext.currentTime;

		this.scheduleUpcomingClips();

		if (typeof window !== "undefined") {
			this.scheduleTimer = window.setInterval(() => {
				this.scheduleUpcomingClips();
			}, this.scheduleIntervalMs);
		}
	}

	private scheduleUpcomingClips(): void {
		if (!this.editor.playback.getIsPlaying()) return;

		const currentTime = this.getPlaybackTime();
		const windowEnd = currentTime + this.lookaheadSeconds;

		for (const clip of this.clips) {
			if (clip.muted) continue;
			if (this.activeClipIds.has(clip.id)) continue;

			const clipEnd = clip.startTime + clip.duration;
			if (clipEnd <= currentTime) continue;
			if (clip.startTime > windowEnd) continue;

			this.activeClipIds.add(clip.id);
			if (this.shouldUsePreparedClipBuffer({ clip })) {
				void this.schedulePreparedClip({
					clip,
					startTime: currentTime,
					sessionId: this.playbackSessionId,
				});
			} else {
				void this.runClipIterator({
					clip,
					startTime: currentTime,
					sessionId: this.playbackSessionId,
				});
			}
		}
	}

	private stopPlayback(): void {
		if (this.scheduleTimer && typeof window !== "undefined") {
			window.clearInterval(this.scheduleTimer);
		}
		this.scheduleTimer = null;

		for (const iterator of this.clipIterators.values()) {
			void iterator.return();
		}
		this.clipIterators.clear();
		this.activeClipIds.clear();

		for (const source of this.queuedSources) {
			try {
				source.stop();
			} catch {}
			source.disconnect();
		}
		this.queuedSources.clear();
	}

	private async runClipIterator({
		clip,
		startTime,
		sessionId,
	}: {
		clip: AudioClipSource;
		startTime: number;
		sessionId: number;
	}): Promise<void> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) return;

		const sink = await this.getAudioSink({ clip });
		if (!sink || !this.editor.playback.getIsPlaying()) return;
		if (sessionId !== this.playbackSessionId) return;

		const clipStart = clip.startTime;
		const clipEnd = clip.startTime + clip.duration;
		const playbackTimeAfterSinkReady = this.getPlaybackTime();
		const iteratorStartTime = Math.max(
			startTime,
			clipStart,
			playbackTimeAfterSinkReady,
		);
		if (iteratorStartTime >= clipEnd) {
			return;
		}
		const sourceStartTime =
			clip.trimStart +
			getSourceTimeAtClipTime({
				clipTime: iteratorStartTime - clip.startTime,
				retime: clip.retime,
			});

		const iterator = sink.buffers(sourceStartTime);
		this.clipIterators.set(clip.id, iterator);
		let consecutiveDroppedBufferCount = 0;
		// volume animado também toca em fluxo: a curva é aplicada pedaço a
		// pedaço no ganho, sem decodificar o clipe inteiro antes
		const animatedVolume = hasAnimatedVolume({ element: clip.timelineElement });
		const playbackRate = clip.retime
			? clampRetimeRate({ rate: clip.retime.rate })
			: 1;

		for await (const { buffer, timestamp } of iterator) {
			if (!this.editor.playback.getIsPlaying()) return;
			if (sessionId !== this.playbackSessionId) return;

			const timelineTime =
				clip.startTime +
				getClipTimeAtSourceTime({
					sourceTime: timestamp - clip.trimStart,
					retime: clip.retime,
				});
			if (timelineTime >= clipEnd) break;

			const node = audioContext.createBufferSource();
			node.buffer = buffer;
			if (clip.retime) {
				node.playbackRate.value = playbackRate;
			}
			const clipGain = audioContext.createGain();
			clipGain.gain.value = clip.volume;
			node.connect(clipGain);
			clipGain.connect(this.masterGain ?? audioContext.destination);

			const startTimestamp =
				this.playbackStartContextTime +
				this.playbackLatencyCompensationSeconds +
				(timelineTime - this.playbackStartTime);
			const bufferLocalStart = timelineTime - clip.startTime;
			const bufferLocalEnd = Math.min(
				clip.duration,
				bufferLocalStart + buffer.duration / playbackRate,
			);

			if (startTimestamp >= audioContext.currentTime) {
				node.start(startTimestamp);
				consecutiveDroppedBufferCount = 0;
				if (animatedVolume) {
					this.scheduleClipGainAutomation({
						audioContext,
						clip,
						clipGain,
						startTimestamp,
						startLocalTime: bufferLocalStart,
						endLocalTime: bufferLocalEnd,
					});
				}
			} else {
				const offset = audioContext.currentTime - startTimestamp;
				if (offset < buffer.duration) {
					node.start(audioContext.currentTime, offset);
					consecutiveDroppedBufferCount = 0;
					if (animatedVolume) {
						this.scheduleClipGainAutomation({
							audioContext,
							clip,
							clipGain,
							startTimestamp: audioContext.currentTime,
							startLocalTime: Math.min(bufferLocalEnd, bufferLocalStart + offset),
							endLocalTime: bufferLocalEnd,
						});
					}
				} else {
					consecutiveDroppedBufferCount += 1;
					if (consecutiveDroppedBufferCount >= 5) {
						const nextCompensationSeconds = Math.max(
							this.playbackLatencyCompensationSeconds,
							Math.min(0.25, offset + 0.01),
						);
						if (
							nextCompensationSeconds >
							this.playbackLatencyCompensationSeconds + 0.001
						) {
							this.playbackLatencyCompensationSeconds = nextCompensationSeconds;
						}
						const resyncStartTime = this.getPlaybackTime();
						this.clipIterators.delete(clip.id);
						void this.runClipIterator({
							clip,
							startTime: resyncStartTime,
							sessionId,
						});
						return;
					}
					continue;
				}
			}

			this.queuedSources.add(node);
			node.addEventListener("ended", () => {
				node.disconnect();
				clipGain.disconnect();
				this.queuedSources.delete(node);
			});

			const aheadTime = timelineTime - this.getPlaybackTime();
			if (aheadTime >= 1) {
				await this.waitUntilCaughtUp({ timelineTime, targetAhead: 1 });
				if (sessionId !== this.playbackSessionId) return;
			}
		}

		this.clipIterators.delete(clip.id);
		// don't remove from activeClipIds - prevents scheduler from restarting this clip
		// the set is cleared on stopPlayback anyway
	}

	private async schedulePreparedClip({
		clip,
		startTime,
		sessionId,
	}: {
		clip: AudioClipSource;
		startTime: number;
		sessionId: number;
	}): Promise<void> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) return;

		if (clip.duration > PREPARED_WHOLE_CLIP_MAX_SECONDS) {
			await this.schedulePreparedClipWindows({ clip, startTime, sessionId });
			return;
		}

		const buffer = await this.getPreparedClipBuffer({ clip });
		if (!buffer || !this.isSessionActive({ sessionId })) return;

		this.startPreparedBuffer({
			audioContext,
			clip,
			buffer,
			bufferLocalStart: 0,
			bufferLocalEnd: clip.duration,
			fromTimelineTime: startTime,
		});
	}

	/**
	 * Clipe longo com velocidade/tom mantido: prepara janelas de
	 * `PREPARED_WINDOW_SECONDS` a partir do ponto de play. A próxima janela só
	 * começa a ser preparada quando a atual começa a tocar, então ficam no
	 * máximo 2 por clipe na memória (nada vai para o cache).
	 */
	private async schedulePreparedClipWindows({
		clip,
		startTime,
		sessionId,
	}: {
		clip: AudioClipSource;
		startTime: number;
		sessionId: number;
	}): Promise<void> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) return;

		let localStart = Math.max(
			0,
			Math.max(startTime, this.getPlaybackTime()) - clip.startTime,
		);
		if (localStart >= clip.duration) return;

		let localEnd = Math.min(clip.duration, localStart + PREPARED_WINDOW_SECONDS);
		let pending = this.renderClipWindow({ clip, localStart, localEnd });

		while (true) {
			const buffer = await pending;
			if (!this.isSessionActive({ sessionId })) return;

			if (buffer) {
				this.startPreparedBuffer({
					audioContext,
					clip,
					buffer,
					bufferLocalStart: localStart,
					bufferLocalEnd: localEnd,
					fromTimelineTime: clip.startTime + localStart,
				});
			}
			if (localEnd >= clip.duration) return;

			// espera esta janela começar a tocar antes de preparar a próxima
			await this.waitUntilCaughtUp({
				timelineTime: clip.startTime + localEnd,
				targetAhead: localEnd - localStart,
			});
			if (!this.isSessionActive({ sessionId })) return;

			localStart = localEnd;
			localEnd = Math.min(clip.duration, localStart + PREPARED_WINDOW_SECONDS);
			pending = this.renderClipWindow({ clip, localStart, localEnd });
		}
	}

	/**
	 * Toca um buffer preparado que cobre `[bufferLocalStart, bufferLocalEnd)`
	 * do clipe (tempo local da linha do tempo), a partir de `fromTimelineTime`
	 * ou de onde a reprodução já estiver, se estiver atrasado.
	 */
	private startPreparedBuffer({
		audioContext,
		clip,
		buffer,
		bufferLocalStart,
		bufferLocalEnd,
		fromTimelineTime,
	}: {
		audioContext: AudioContext;
		clip: AudioClipSource;
		buffer: AudioBuffer;
		bufferLocalStart: number;
		bufferLocalEnd: number;
		fromTimelineTime: number;
	}): void {
		const bufferTimelineStart = clip.startTime + bufferLocalStart;
		const bufferTimelineEnd = clip.startTime + bufferLocalEnd;
		const effectiveStartTime = Math.max(
			fromTimelineTime,
			bufferTimelineStart,
			this.getPlaybackTime(),
		);
		if (effectiveStartTime >= bufferTimelineEnd) {
			return;
		}

		const node = audioContext.createBufferSource();
		node.buffer = buffer;
		const clipGain = audioContext.createGain();
		node.connect(clipGain);
		clipGain.connect(this.masterGain ?? audioContext.destination);

		const startTimestamp =
			this.playbackStartContextTime +
			this.playbackLatencyCompensationSeconds +
			(effectiveStartTime - this.playbackStartTime);
		const bufferOffset = effectiveStartTime - bufferTimelineStart;
		let actualStartTimestamp = startTimestamp;
		let actualBufferOffset = bufferOffset;

		if (startTimestamp >= audioContext.currentTime) {
			node.start(startTimestamp, bufferOffset);
		} else {
			const lateOffset = audioContext.currentTime - startTimestamp;
			actualStartTimestamp = audioContext.currentTime;
			actualBufferOffset = bufferOffset + lateOffset;
			node.start(actualStartTimestamp, actualBufferOffset);
		}

		this.scheduleClipGainAutomation({
			audioContext,
			clip,
			clipGain,
			startTimestamp: actualStartTimestamp,
			startLocalTime: bufferLocalStart + actualBufferOffset,
			endLocalTime: bufferLocalEnd,
		});

		this.queuedSources.add(node);
		node.addEventListener("ended", () => {
			node.disconnect();
			clipGain.disconnect();
			this.queuedSources.delete(node);
		});
	}

	private isSessionActive({ sessionId }: { sessionId: number }): boolean {
		return (
			this.editor.playback.getIsPlaying() &&
			sessionId === this.playbackSessionId
		);
	}

	private waitUntilCaughtUp({
		timelineTime,
		targetAhead,
	}: {
		timelineTime: number;
		targetAhead: number;
	}): Promise<void> {
		return new Promise((resolve) => {
			const checkInterval = setInterval(() => {
				if (!this.editor.playback.getIsPlaying()) {
					clearInterval(checkInterval);
					resolve();
					return;
				}

				const playbackTime = this.getPlaybackTime();
				if (timelineTime - playbackTime < targetAhead) {
					clearInterval(checkInterval);
					resolve();
				}
			}, 100);
		});
	}

	private disposeSinks(): void {
		for (const iterator of this.clipIterators.values()) {
			void iterator.return();
		}
		this.clipIterators.clear();
		this.activeClipIds.clear();

		for (const input of this.inputs.values()) {
			input.dispose();
		}
		this.inputs.clear();
		this.sinks.clear();
		this.audioTracks.clear();
	}

	private shouldUsePreparedClipBuffer({
		clip,
	}: {
		clip: AudioClipSource;
	}): boolean {
		// Volume animado sozinho NÃO precisa de buffer preparado: toca em fluxo
		// (runClipIterator) com a curva aplicada no ganho. Preparar decodificava
		// o clipe inteiro (uma live de horas eram GBs).
		return (
			this.hasCurveRetime({ clip }) ||
			shouldMaintainPitch({
				rate: clip.retime?.rate ?? 1,
				maintainPitch: clip.retime?.maintainPitch,
			})
		);
	}

	private hasCurveRetime({ clip }: { clip: AudioClipSource }): boolean {
		const mode = (clip.retime as { mode?: unknown } | undefined)?.mode;
		return mode === "curve";
	}

	private scheduleClipGainAutomation({
		audioContext,
		clip,
		clipGain,
		startTimestamp,
		startLocalTime,
		endLocalTime = clip.duration,
	}: {
		audioContext: AudioContext;
		clip: AudioClipSource;
		clipGain: GainNode;
		startTimestamp: number;
		startLocalTime: number;
		/** até onde agendar a curva (padrão: fim do clipe) */
		endLocalTime?: number;
	}): void {
		clipGain.gain.cancelScheduledValues(startTimestamp);
		clipGain.gain.setValueAtTime(clip.volume, startTimestamp);

		if (!hasAnimatedVolume({ element: clip.timelineElement })) {
			return;
		}

		const points = buildAudioGainAutomation({
			element: clip.timelineElement,
			fromLocalTime: startLocalTime,
			toLocalTime: Math.min(clip.duration, endLocalTime),
		});

		if (points.length === 0) {
			return;
		}

		clipGain.gain.setValueAtTime(points[0].gain, startTimestamp);
		for (let index = 1; index < points.length; index++) {
			const point = points[index];
			const pointTimestamp =
				startTimestamp + (point.localTime - startLocalTime);
			if (pointTimestamp < audioContext.currentTime) {
				continue;
			}

			clipGain.gain.linearRampToValueAtTime(point.gain, pointTimestamp);
		}
	}

	private buildPreparedClipCacheKey({
		clip,
	}: {
		clip: AudioClipSource;
	}): string {
		return JSON.stringify({
			id: clip.id,
			sourceKey: clip.sourceKey,
			startTime: clip.startTime,
			duration: clip.duration,
			trimStart: clip.trimStart,
			trimEnd: clip.trimEnd,
			retime: clip.retime ?? null,
		});
	}

	private async getPreparedClipBuffer({
		clip,
	}: {
		clip: AudioClipSource;
	}): Promise<AudioBuffer | null> {
		const cacheKey = this.buildPreparedClipCacheKey({ clip });
		const existing = this.preparedClipBuffers.get(cacheKey);
		if (existing) {
			return existing;
		}

		const promise = this.renderClipWindow({
			clip,
			localStart: 0,
			localEnd: clip.duration,
		});

		this.preparedClipBuffers.set(cacheKey, promise);
		return promise;
	}

	/**
	 * Buffer com velocidade/tom mantido de `[localStart, localEnd)` do clipe
	 * (tempo local da linha do tempo). A velocidade é constante, então o
	 * trecho da fonte é `trimStart + localStart × velocidade`.
	 */
	private async renderClipWindow({
		clip,
		localStart,
		localEnd,
	}: {
		clip: AudioClipSource;
		localStart: number;
		localEnd: number;
	}): Promise<AudioBuffer | null> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) {
			return null;
		}

		const windowDuration = Math.max(0, localEnd - localStart);
		const windowTrimStart =
			clip.trimStart +
			getSourceTimeAtClipTime({ clipTime: localStart, retime: clip.retime });

		const decoded = await this.decodeClipRange({
			clip,
			trimStart: windowTrimStart,
			duration: windowDuration,
		});
		if (!decoded) {
			return null;
		}

		// SINCRONIA: o buffer começa em `decoded.startTime` na fonte
		return await renderRetimedBuffer({
			audioContext,
			sourceBuffer: decoded.buffer,
			trimStart: rebaseTrimStart({
				trimStart: windowTrimStart,
				bufferStart: decoded.startTime,
			}),
			clipDuration: windowDuration,
			retime: clip.retime,
			maintainPitch: clip.retime?.maintainPitch === true,
		});
	}

	/**
	 * Áudio só do trecho da fonte pedido (com folga). Não decodifica a mídia
	 * inteira: com uma live de horas isso eram GBs por arquivo. Reaproveita a
	 * faixa já aberta desta fonte (mesma do fluxo), sem reabrir o arquivo.
	 */
	private async decodeClipRange({
		clip,
		trimStart,
		duration,
	}: {
		clip: AudioClipSource;
		trimStart: number;
		duration: number;
	}): Promise<DecodedAudioRange | null> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) {
			return null;
		}

		const audioTrack = await this.getAudioTrack({ clip });
		if (!audioTrack) {
			return null;
		}

		return await decodeAudioRange({
			file: clip.file,
			range: computeSourceRange({
				trimStart,
				duration,
				retime: clip.retime,
			}),
			audioContext,
			audioTrack,
		});
	}

	private async getAudioSink({
		clip,
	}: {
		clip: AudioClipSource;
	}): Promise<AudioBufferSink | null> {
		const existingSink = this.sinks.get(clip.sourceKey);
		if (existingSink) return existingSink;

		const audioTrack = await this.getAudioTrack({ clip });
		if (!audioTrack) return null;

		const raceSink = this.sinks.get(clip.sourceKey);
		if (raceSink) return raceSink;
		const sink = new AudioBufferSink(audioTrack);
		this.sinks.set(clip.sourceKey, sink);
		return sink;
	}

	/**
	 * Um `Input` por fonte, compartilhado pelo fluxo e pelos buffers preparados
	 * (vários clipes da mesma live não reabrem o arquivo nem remontam o índice).
	 * Descartado em `disposeSinks`.
	 */
	private getAudioTrack({
		clip,
	}: {
		clip: AudioClipSource;
	}): Promise<InputAudioTrack | null> {
		const existing = this.audioTracks.get(clip.sourceKey);
		if (existing) return existing;

		const input = new Input({
			source: new BlobSource(clip.file),
			formats: ALL_FORMATS,
		});
		this.inputs.set(clip.sourceKey, input);
		const promise = input.getPrimaryAudioTrack().catch((error) => {
			console.warn("Failed to initialize audio sink:", error);
			return null;
		});
		this.audioTracks.set(clip.sourceKey, promise);
		return promise;
	}
}
