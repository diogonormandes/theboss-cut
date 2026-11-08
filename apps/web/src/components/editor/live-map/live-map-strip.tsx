"use client";

/**
 * Faixa "Mapa da live" acima da linha do tempo (Etapa 3, passo 3).
 * Aparece quando o projeto tem um vídeo de 10 minutos ou mais.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { t } from "@/i18n";
import type { MediaAsset } from "@/media/types";
import { getClipTimeAtSourceTime, getSourceTimeAtClipTime } from "@/retime/resolve";
import type { RetimeConfig, TimelineTrack, TScene } from "@/timeline/types";
import { pruneOrphanLiveAnalyses } from "@/services/live-analysis/service";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import { buildColumns, drawLiveMap, readMapColors } from "./draw";
import { SilencePreviewLayer } from "./silence-preview";
import { type LiveMapEntry, type LiveMapSource, useLiveMapStore } from "./store";

/** Vídeo a partir do qual o mapa aparece (segundos). */
export const LIVE_MAP_MIN_DURATION_SEC = 600;
const HEIGHT_PX = 56;

export function formatClock(sec: number): string {
	const s = Math.max(0, Math.floor(sec));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const r = s % 60;
	const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
	return `${h > 0 ? `${h}:` : ""}${mm}:${String(r).padStart(2, "0")}`;
}

export function formatShort(sec: number): string {
	if (sec < 60) return `${Math.max(1, Math.round(sec))} s`;
	if (sec < 3600) return `${Math.round(sec / 60)} min`;
	const h = Math.floor(sec / 3600);
	const m = Math.round((sec % 3600) / 60);
	return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

/** Um pedaço do vídeo na linha do tempo (depois de dividir/cortar pode haver vários). */
type Segment = {
	/** onde o pedaço começa e termina na linha do tempo (segundos) */
	startSec: number;
	endSec: number;
	/** trecho do vídeo original que o pedaço mostra (segundos) */
	srcStart: number;
	srcEnd: number;
	retime?: RetimeConfig;
};

/** Onde o vídeo está na linha do tempo, pedaço por pedaço, em ordem de tempo. */
function findSegments(scene: TScene | null, assetId: string): Segment[] {
	if (!scene) return [];
	const tracks: TimelineTrack[] = [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio];
	const out: Segment[] = [];
	for (const track of tracks) {
		for (const el of track.elements) {
			if (!("mediaId" in el) || el.mediaId !== assetId) continue;
			const retime = "retime" in el ? el.retime : undefined;
			const startSec = mediaTimeToSeconds({ time: el.startTime });
			const durationSec = mediaTimeToSeconds({ time: el.duration });
			const srcStart = mediaTimeToSeconds({ time: el.trimStart });
			if (durationSec <= 0) continue;
			out.push({
				startSec,
				endSec: startSec + durationSec,
				srcStart,
				srcEnd: srcStart + getSourceTimeAtClipTime({ clipTime: durationSec, retime }),
				retime,
			});
		}
	}
	return out.sort((a, b) => a.startSec - b.startSec);
}

/** Tempo da live mostrado na linha do tempo em `tl`; null se ali não há pedaço da live. */
function timelineToSource(segments: Segment[], tl: number): number | null {
	for (const seg of segments) {
		if (tl >= seg.startSec && tl <= seg.endSec) {
			return seg.srcStart + getSourceTimeAtClipTime({ clipTime: tl - seg.startSec, retime: seg.retime });
		}
	}
	return null;
}

/**
 * Onde o ponto `src` da live está na linha do tempo. Se esse trecho foi
 * cortado, vai para o próximo pedaço que ficou; null se não sobrou nada depois.
 */
function sourceToTimeline(segments: Segment[], src: number): number | null {
	let next: Segment | null = null;
	for (const seg of segments) {
		if (src >= seg.srcStart && src <= seg.srcEnd) {
			return seg.startSec + getClipTimeAtSourceTime({ sourceTime: src - seg.srcStart, retime: seg.retime });
		}
		if (seg.srcStart > src && (!next || seg.srcStart < next.srcStart)) next = seg;
	}
	return next ? next.startSec : null;
}

export function pickLiveAsset(assets: MediaAsset[], scene: TScene | null): MediaAsset | null {
	const longVideos = assets.filter(
		(a) => a.type === "video" && a.file && (a.duration ?? 0) >= LIVE_MAP_MIN_DURATION_SEC,
	);
	if (longVideos.length === 0) return null;
	const used = longVideos.find((a) => findSegments(scene, a.id).length > 0);
	if (used) return used;
	return longVideos.reduce((a, b) => ((b.duration ?? 0) > (a.duration ?? 0) ? b : a));
}

export function LiveMapStrip() {
	const assets = useEditor((e) => e.media.getAssets());
	const scene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const asset = useMemo(() => pickLiveAsset(assets, scene), [assets, scene]);

	// conferência interna no console (só em desenvolvimento): __mapaDaLive.conferir()
	useEffect(() => {
		if (process.env.NODE_ENV !== "development") return;
		void import("@/services/live-analysis/dev-check").then((m) => m.installLiveMapDevCheck());
	}, []);

	// limpeza dos mapas de mídias que não existem mais (uma vez por sessão, sem pressa)
	const assetsRef = useRef(assets);
	assetsRef.current = assets;
	useEffect(() => {
		const timer = window.setTimeout(() => {
			void pruneOrphanLiveAnalyses(assetsRef.current.map((a) => a.id));
		}, 20_000);
		return () => window.clearTimeout(timer);
	}, []);

	if (!asset) return null;
	return <LiveMapForAsset asset={asset} scene={scene} />;
}

function LiveMapForAsset({ asset, scene }: { asset: MediaAsset; scene: TScene | null }) {
	const source: LiveMapSource = useMemo(
		() => ({ assetId: asset.id, file: asset.file, durationSec: asset.duration ?? 0 }),
		[asset.id, asset.file, asset.duration],
	);
	const entry = useLiveMapStore((s) => s.entries[asset.id]);
	const prepare = useLiveMapStore((s) => s.prepare);
	const start = useLiveMapStore((s) => s.start);
	const cancel = useLiveMapStore((s) => s.cancel);
	const setTrack = useLiveMapStore((s) => s.setTrack);

	useEffect(() => {
		void prepare(source);
	}, [prepare, source]);

	// a faixa saiu da tela (projeto fechado, mídia removida, outro vídeo): para a análise
	useEffect(() => () => cancel(asset.id), [cancel, asset.id]);

	const segments = useMemo(() => findSegments(scene, asset.id), [scene, asset.id]);
	const status = entry?.status ?? "checking";
	const tracks = entry?.tracks ?? [];

	return (
		<div
			className="panel relative flex shrink-0 items-stretch overflow-hidden rounded-sm border"
			style={{
				height: HEIGHT_PX,
				background:
					"linear-gradient(180deg, rgba(var(--tb-gold-rgb), 0.05), transparent 70%), var(--tb-surface)",
				borderColor: "var(--tb-border)",
			}}
			data-tour="live-map"
		>
			<div
				className="flex w-[164px] shrink-0 flex-col justify-center gap-1 border-r px-3"
				style={{ borderColor: "var(--tb-border)" }}
			>
				<span
					className="text-[10.5px] font-semibold tracking-[0.14em] uppercase"
					style={{ color: "var(--tb-gold)" }}
				>
					{t("liveMap.title")}
				</span>
				{tracks.length > 1 && status !== "running" ? (
					<select
						className="h-5 w-full cursor-pointer rounded-sm border bg-transparent px-1 text-[11px] outline-none"
						style={{ borderColor: "var(--tb-border)", color: "var(--tb-text)" }}
						value={entry?.trackIndex ?? 0}
						title={t("liveMap.trackHint")}
						aria-label={t("liveMap.track")}
						onChange={(e) => void setTrack(source, Number(e.target.value))}
					>
						{tracks.map((track, i) => (
							<option key={i} value={i} style={{ background: "var(--tb-surface)" }}>
								{track.name
									? `${t("liveMap.trackNumber", { n: i + 1 })} · ${track.name}`
									: t("liveMap.trackNumber", { n: i + 1 })}
							</option>
						))}
					</select>
				) : (
					<SummaryLine entry={entry} />
				)}
			</div>

			<div className="relative min-w-0 flex-1">
				{status === "done" && entry?.analysis && entry.summary ? (
					<MapCanvas assetId={asset.id} entry={entry} segments={segments} />
				) : status === "running" ? (
					<ProgressView entry={entry} onCancel={() => cancel(asset.id)} />
				) : status === "error" ? (
					<ErrorView entry={entry} onRetry={() => void start(source)} />
				) : status === "idle" ? (
					<IdleView onAnalyze={() => void start(source)} />
				) : null}
			</div>
		</div>
	);
}

function SummaryLine({ entry }: { entry: LiveMapEntry | undefined }) {
	if (!entry?.summary) return null;
	const { shouts, peaks, silenceSec } = entry.summary;
	const text = [
		shouts.length === 1 ? t("liveMap.summaryShoutsOne") : t("liveMap.summaryShouts", { n: shouts.length }),
		peaks.length === 1 ? t("liveMap.summaryPeaksOne") : t("liveMap.summaryPeaks", { n: peaks.length }),
		t("liveMap.summarySilence", { silence: formatShort(silenceSec) }),
	].join(" · ");
	return (
		<span
			className="truncate text-[10.5px] leading-tight"
			style={{ color: "var(--tb-text-muted)" }}
			title={text}
		>
			{text}
		</span>
	);
}

function GoldButton({
	children,
	onClick,
	quiet = false,
}: {
	children: React.ReactNode;
	onClick: () => void;
	quiet?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="h-7 shrink-0 cursor-pointer rounded-sm px-3 text-xs font-semibold transition-[filter,box-shadow] hover:brightness-110"
			style={
				quiet
					? {
							border: "1px solid var(--tb-border-strong)",
							color: "var(--tb-text)",
							background: "transparent",
						}
					: {
							background: "var(--tb-grad)",
							color: "var(--tb-on-gold)",
							boxShadow: "var(--tb-glow)",
						}
			}
		>
			{children}
		</button>
	);
}

function IdleView({ onAnalyze }: { onAnalyze: () => void }) {
	return (
		<div className="flex h-full items-center gap-3 px-4">
			<GoldButton onClick={onAnalyze}>{t("liveMap.analyze")}</GoldButton>
			<span className="truncate text-xs" style={{ color: "var(--tb-text-muted)" }}>
				{t("liveMap.explain")}
			</span>
		</div>
	);
}

function ErrorView({ entry, onRetry }: { entry: LiveMapEntry | undefined; onRetry: () => void }) {
	const key =
		entry?.error === "no-audio"
			? "liveMap.errorNoAudio"
			: entry?.error === "cannot-decode"
				? "liveMap.errorCannotDecode"
				: entry?.error === "offline"
					? "liveMap.errorOffline"
					: "liveMap.errorFailed";
	return (
		<div className="flex h-full items-center gap-3 px-4">
			<span className="min-w-0 flex-1 truncate text-xs" style={{ color: "var(--tb-text)" }} title={t(key)}>
				{t(key)}
			</span>
			{entry?.error !== "no-audio" && (
				<GoldButton quiet onClick={onRetry}>
					{t("liveMap.retry")}
				</GoldButton>
			)}
		</div>
	);
}

function ProgressView({ entry, onCancel }: { entry: LiveMapEntry | undefined; onCancel: () => void }) {
	const done = entry?.processedSec ?? 0;
	const total = Math.max(1, entry?.durationSec ?? 1);
	const pct = Math.max(0, Math.min(1, done / total));
	const elapsed = entry ? (performance.now() - entry.startedAt) / 1000 : 0;
	const remaining = pct > 0.02 && elapsed > 2 ? (elapsed / pct) * (1 - pct) : null;
	return (
		<div className="flex h-full items-center gap-4 px-4">
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<div className="flex items-baseline justify-between gap-3 text-xs">
					<span className="truncate" style={{ color: "var(--tb-text)" }}>
						{done > 0
							? t("liveMap.analyzing", { done: formatClock(done), total: formatClock(total) })
							: t("liveMap.starting")}
					</span>
					<span className="shrink-0 tabular-nums" style={{ color: "var(--tb-text-muted)" }}>
						{remaining !== null ? `${t("liveMap.remaining", { time: formatShort(remaining) })} · ` : ""}
						{Math.round(pct * 100)}%
					</span>
				</div>
				<div
					className="h-1.5 overflow-hidden rounded-full"
					style={{ background: "rgba(var(--tb-gold-rgb), 0.12)" }}
					role="progressbar"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(pct * 100)}
				>
					<div
						className="h-full rounded-full transition-[width] duration-300 ease-out"
						style={{
							width: `${pct * 100}%`,
							background: "var(--tb-grad)",
							boxShadow: "0 0 10px rgba(var(--tb-gold-rgb), 0.55)",
						}}
					/>
				</div>
			</div>
			<GoldButton quiet onClick={onCancel}>
				{t("liveMap.cancel")}
			</GoldButton>
		</div>
	);
}

type Hover = { x: number; time: number; label: string } | null;

function MapCanvas({
	assetId,
	entry,
	segments,
}: { assetId: string; entry: LiveMapEntry; segments: Segment[] }) {
	const editor = useEditor();
	const wrapRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const needleRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ w: 0, h: 0, dpr: 1 });
	const [themeTick, setThemeTick] = useState(0);
	const [hover, setHover] = useState<Hover>(null);
	const analysis = entry.analysis;
	const summary = entry.summary;
	const duration = analysis?.durationSec ?? 0;

	// tamanho do canvas (com a densidade de pixels da tela)
	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		const update = () => {
			const rect = el.getBoundingClientRect();
			setSize({ w: Math.round(rect.width), h: Math.round(rect.height), dpr: window.devicePixelRatio || 1 });
		};
		update();
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// troca de tema muda as cores
	useEffect(() => {
		const mo = new MutationObserver(() => setThemeTick((n) => n + 1));
		mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema", "class", "style"] });
		return () => mo.disconnect();
	}, []);

	const deviceWidth = Math.max(1, Math.round(size.w * size.dpr));
	const deviceHeight = Math.max(1, Math.round(size.h * size.dpr));
	const columns = useMemo(
		() => (analysis && summary && size.w > 0 ? buildColumns(analysis, summary, deviceWidth) : null),
		[analysis, summary, deviceWidth, size.w],
	);

	// desenha só quando os dados, o tamanho ou o tema mudam
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !columns || !summary) return;
		canvas.width = deviceWidth;
		canvas.height = deviceHeight;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		drawLiveMap({
			ctx,
			width: deviceWidth,
			height: deviceHeight,
			dpr: size.dpr,
			columns,
			summary,
			durationSec: duration,
			colors: readMapColors(),
		});
	}, [columns, summary, deviceWidth, deviceHeight, size.dpr, duration, themeTick]);

	// vídeo fora da linha do tempo: os tempos são os mesmos da live
	const toTimeline = useCallback(
		(src: number) => (segments.length > 0 ? sourceToTimeline(segments, src) : src),
		[segments],
	);
	const toSource = useCallback(
		(tl: number) => (segments.length > 0 ? timelineToSource(segments, tl) : tl),
		[segments],
	);

	// agulha: anda sem redesenhar o mapa nem a tela (só move um traço)
	useEffect(() => {
		const needle = needleRef.current;
		if (!needle || duration <= 0) return;
		const place = () => {
			const tl = mediaTimeToSeconds({ time: editor.playback.getCurrentTime() });
			const src = toSource(tl);
			const visible = src !== null && src >= 0 && src <= duration && size.w > 0;
			needle.style.opacity = visible ? "1" : "0";
			if (visible) needle.style.transform = `translateX(${(src / duration) * size.w}px)`;
		};
		place();
		const offUpdate = editor.playback.onUpdate(place);
		const offSeek = editor.playback.onSeek(place);
		return () => {
			offUpdate();
			offSeek();
		};
	}, [editor, duration, size.w, toSource]);

	const timeAt = (clientX: number) => {
		const rect = wrapRef.current?.getBoundingClientRect();
		if (!rect || rect.width <= 0) return null;
		const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
		return { x, time: (x / rect.width) * duration };
	};

	const labelAt = (time: number, x: number): string => {
		if (!summary) return "";
		const pxPerSec = size.w / Math.max(1e-9, duration);
		const near = (tt: number) => Math.abs(tt - time) * pxPerSec <= 5;
		if (summary.shouts.some((s) => (time >= s.start && time <= s.end) || near((s.start + s.end) / 2))) {
			return t("liveMap.hoverShout");
		}
		if (summary.peaks.some((p) => near(p.time))) return t("liveMap.hoverPeak");
		if (columns) {
			const c = Math.min(columns.kind.length - 1, Math.floor((x / Math.max(1, size.w)) * columns.kind.length));
			const kind = columns.kind[c];
			return kind === 0
				? t("liveMap.hoverSilence")
				: kind === 1
					? t("liveMap.hoverSpeech")
					: t("liveMap.hoverSound");
		}
		return "";
	};

	return (
		<div
			ref={wrapRef}
			className="absolute inset-0 cursor-pointer"
			title={t("liveMap.clickHint")}
			onMouseMove={(e) => {
				const p = timeAt(e.clientX);
				if (p) setHover({ ...p, label: labelAt(p.time, p.x) });
			}}
			onMouseLeave={() => setHover(null)}
			onClick={(e) => {
				const p = timeAt(e.clientX);
				if (!p) return;
				const target = toTimeline(p.time);
				if (target === null) return;
				const tl = Math.max(0, target);
				editor.playback.seek({ time: mediaTimeFromSeconds({ seconds: tl }) });
			}}
		>
			<canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden />
			<SilencePreviewLayer assetId={assetId} durationSec={duration} width={size.w} height={size.h} dpr={size.dpr} />
			<div
				ref={needleRef}
				className="pointer-events-none absolute top-0 bottom-0 left-0 w-px"
				style={{
					background: "var(--tb-gold-claro)",
					boxShadow: "0 0 6px rgba(var(--tb-gold-rgb), 0.9)",
					opacity: 0,
				}}
			/>
			{hover && (
				<>
					<div
						className="pointer-events-none absolute top-0 bottom-0 w-px"
						style={{ left: hover.x, background: "rgba(var(--tb-gold-rgb), 0.45)" }}
					/>
					<div
						className="pointer-events-none absolute top-1 z-10 rounded-sm px-1.5 py-0.5 text-[10.5px] whitespace-nowrap tabular-nums"
						style={{
							left: Math.min(Math.max(hover.x + 8, 4), Math.max(4, size.w - 120)),
							background: "color-mix(in srgb, var(--tb-bg) 88%, transparent)",
							border: "1px solid rgba(var(--tb-gold-rgb), 0.35)",
							color: "var(--tb-text)",
						}}
					>
						<span style={{ color: "var(--tb-gold-claro)" }}>{formatClock(hover.time)}</span>
						{hover.label ? <span style={{ color: "var(--tb-text-muted)" }}> · {hover.label}</span> : null}
					</div>
				</>
			)}
		</div>
	);
}
