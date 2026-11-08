"use client";

// Seção "Cortar silêncios" da aba Cortes (passo 5 da Etapa 3).
// Usa a análise que o mapa da live já fez (não lê a live de novo): mexer nos
// controles só refaz a conta dos silêncios (milissegundos) e a prévia no mapa.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	KeepRangesCommand,
	KeepRangesInNewSceneCommand,
} from "@/commands/timeline/element";
import { useSilencePreviewStore } from "@/components/editor/live-map/silence-preview";
import {
	formatShort,
	pickLiveAsset,
} from "@/components/editor/live-map/live-map-strip";
import { type LiveMapSource, useLiveMapStore } from "@/components/editor/live-map/store";
import { Slider } from "@/components/ui/slider";
import { useEditor } from "@/editor/use-editor";
import { getLocaleTag, t, useLocale } from "@/i18n";
import {
	clipRanges,
	detectSilences,
	type TimeRange,
	totalSeconds,
} from "@/services/live-analysis/silence";
import type { TimelineElement, TimelineTrack, TScene } from "@/timeline/types";
import { mediaTimeToSeconds } from "@/wasm";

/** Intensidade 0 (suave) a 100 (forte) → delta acima do ruído de fundo: 15 → 3 dB. */
const deltaFromStrength = (strength: number) => 15 - (strength / 100) * 12;
/** Menor pedaço de fala que fica (segundos). */
const MIN_KEEP_SEC = 0.3;

type Target = {
	trackId: string;
	element: TimelineElement & { mediaId: string };
	srcStart: number;
	srcEnd: number;
};

function allTracks(scene: TScene): TimelineTrack[] {
	return [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio];
}

/** Clipe da live a limpar: o selecionado; sem seleção, o único clipe da live na cena. */
function findTarget(
	scene: TScene | null,
	assetId: string,
	selected: { trackId: string; elementId: string }[],
): Target | null {
	if (!scene) return null;
	const candidates: { trackId: string; element: TimelineElement }[] = [];
	for (const track of allTracks(scene)) {
		for (const element of track.elements) {
			if ("mediaId" in element && element.mediaId === assetId) {
				candidates.push({ trackId: track.id, element });
			}
		}
	}
	const chosen =
		candidates.find((c) =>
			selected.some((s) => s.trackId === c.trackId && s.elementId === c.element.id),
		) ??
		(candidates.filter((c) => c.element.type === "video").length === 1
			? candidates.find((c) => c.element.type === "video")
			: undefined) ??
		(candidates.length === 1 ? candidates[0] : undefined);
	if (!chosen) return null;
	const srcStart = mediaTimeToSeconds({ time: chosen.element.trimStart });
	return {
		trackId: chosen.trackId,
		element: chosen.element as Target["element"],
		srcStart,
		srcEnd: srcStart + mediaTimeToSeconds({ time: chosen.element.duration }),
	};
}

export function SilenceSection() {
	const editor = useEditor();
	const assets = useEditor((e) => e.media.getAssets());
	const scene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const selected = useEditor((e) => e.selection.getSelectedElements());
	const asset = useMemo(() => pickLiveAsset(assets, scene), [assets, scene]);
	const entry = useLiveMapStore((s) => (asset ? s.entries[asset.id] : undefined));
	const prepare = useLiveMapStore((s) => s.prepare);
	const start = useLiveMapStore((s) => s.start);
	const setPreview = useSilencePreviewStore((s) => s.setPreview);

	const locale = useLocale();
	const [strength, setStrength] = useState(50);
	const [minSilence, setMinSilence] = useState(0.6);

	const source: LiveMapSource | null = useMemo(
		() =>
			asset ? { assetId: asset.id, file: asset.file, durationSec: asset.duration ?? 0 } : null,
		[asset],
	);
	useEffect(() => {
		if (source) void prepare(source);
	}, [prepare, source]);

	const analysis = entry?.status === "done" ? entry.analysis : null;
	const result = useMemo(
		() =>
			analysis
				? detectSilences(analysis, {
						deltaDb: deltaFromStrength(strength),
						minSilenceSec: minSilence,
						minKeepSec: MIN_KEEP_SEC,
					})
				: null,
		[analysis, strength, minSilence],
	);
	const target = useMemo(
		() => (asset ? findTarget(scene, asset.id, selected) : null),
		[scene, asset, selected],
	);

	// trechos que saem / ficam, só dentro do clipe escolhido
	const retimed = !!target && "retime" in target.element && !!target.element.retime;

	const plan = useMemo(() => {
		// velocidade mudada: não corta, então também não mostra prévia no mapa
		if (!result || !target || retimed) return null;
		const keeps = clipRanges(result.keeps, target.srcStart, target.srcEnd, MIN_KEEP_SEC);
		const cuts: TimeRange[] = [];
		let cursor = target.srcStart;
		for (const [s, e] of keeps) {
			if (s - cursor > 0.01) cuts.push([cursor, s]);
			cursor = e;
		}
		if (target.srcEnd - cursor > 0.01) cuts.push([cursor, target.srcEnd]);
		return { keeps, cuts, cutSec: totalSeconds(cuts) };
	}, [result, target, retimed]);

	// prévia no mapa
	useEffect(() => {
		setPreview(asset?.id ?? null, plan?.cuts ?? null);
	}, [setPreview, asset?.id, plan]);
	useEffect(() => () => setPreview(null, null), [setPreview]);

	// número no jeito do idioma (0,6 / 0.6); useLocale redesenha ao trocar
	const localeTag = locale ? getLocaleTag() : "pt-BR";
	const numberFormat = useMemo(
		() =>
			new Intl.NumberFormat(localeTag, {
				minimumFractionDigits: 1,
				maximumFractionDigits: 1,
			}),
		[localeTag],
	);

	const apply = () => {
		if (!asset || !target || !plan || plan.cuts.length === 0 || plan.keeps.length === 0) return;
		try {
			// Cena principal: nunca é picada. Cria a cena "Sem silêncios" com o
			// mesmo trecho da live que o clipe mostra e corta lá.
			if (scene?.isMain) {
				const element = target.element;
				const sourceDuration =
					asset.duration && asset.duration > 0
						? asset.duration
						: element.sourceDuration !== undefined
							? mediaTimeToSeconds({ time: element.sourceDuration })
							: undefined;
				const cut = {
					name: t("silenceCut.newScene"),
					mediaId: asset.id,
					srcStart: target.srcStart,
					srcEnd: target.srcEnd,
					sourceDuration,
				};
				// confere antes: não deixa passo vazio no histórico
				if (KeepRangesInNewSceneCommand.countPieces({ cut, keeps: plan.keeps }) === 0) {
					throw new Error("nothing to cut");
				}
				const command = new KeepRangesInNewSceneCommand({ cut, keeps: plan.keeps });
				editor.command.execute({ command });
				const sceneId = command.getTargetSceneId();
				if (!sceneId || command.getPieceCount() === 0) throw new Error("nothing cut");
				void editor.scenes.switchToScene({ sceneId });
				toast.success(t("silenceCut.newSceneDone"));
				return;
			}
			const spec = {
				trackId: target.trackId,
				elementId: target.element.id,
				keeps: plan.keeps,
			};
			if (KeepRangesCommand.countPieces(spec) === 0) throw new Error("nothing to cut");
			const command = new KeepRangesCommand(spec);
			editor.command.execute({ command });
			if (command.getPieceCount() === 0) throw new Error("nothing cut");
			toast.success(
				plan.cuts.length === 1
					? t("silenceCut.doneOne")
					: t("silenceCut.done", { n: plan.cuts.length }),
			);
		} catch (error) {
			console.error("Cortar silêncios:", error);
			toast.error(t("silenceCut.failed"));
		}
	};

	let body: React.ReactNode;
	if (!asset || !source) {
		body = <Note>{t("silenceCut.noLive")}</Note>;
	} else if (entry?.status === "running") {
		body = <Note>{t("silenceCut.analyzing")}</Note>;
	} else if (!analysis) {
		body = (
			<div className="flex flex-col gap-2">
				<Note>{t("silenceCut.needAnalysis")}</Note>
				{entry?.status === "idle" || entry?.status === "error" ? (
					<GoldButton onClick={() => void start(source)}>{t("liveMap.analyze")}</GoldButton>
				) : null}
			</div>
		);
	} else {
		body = (
			<div className="flex flex-col gap-3">
				<Field
					label={t("silenceCut.strength")}
					hint={t("silenceCut.strengthHint")}
					value={null}
				>
					<Slider
						value={[strength]}
						min={0}
						max={100}
						step={1}
						onValueChange={([v]) => setStrength(v)}
						aria-label={t("silenceCut.strength")}
					/>
					<div className="flex justify-between text-[10.5px]" style={{ color: "var(--tb-text-muted)" }}>
						<span>{t("silenceCut.soft")}</span>
						<span>{t("silenceCut.strong")}</span>
					</div>
				</Field>
				<Field
					label={t("silenceCut.minSilence")}
					hint={t("silenceCut.minSilenceHint")}
					value={t("silenceCut.seconds", { n: numberFormat.format(minSilence) })}
				>
					<Slider
						value={[minSilence]}
						min={0.3}
						max={1.5}
						step={0.1}
						onValueChange={([v]) => setMinSilence(Math.round(v * 10) / 10)}
						aria-label={t("silenceCut.minSilence")}
					/>
				</Field>
				{!target ? (
					<Note>{t("silenceCut.noClip")}</Note>
				) : retimed ? (
					<Note>{t("silenceCut.retimed")}</Note>
				) : plan && plan.cuts.length > 0 ? (
					<>
						<div
							className="rounded-sm border px-3 py-2 text-xs tabular-nums"
							style={{
								borderColor: "rgba(var(--tb-gold-rgb), 0.3)",
								background: "rgba(var(--tb-gold-rgb), 0.06)",
								color: "var(--tb-text)",
							}}
						>
							{plan.cuts.length === 1
								? t("silenceCut.willCutOne", { time: formatShort(plan.cutSec) })
								: t("silenceCut.willCut", {
										n: plan.cuts.length,
										time: formatShort(plan.cutSec),
									})}
						</div>
						<GoldButton onClick={apply}>{t("silenceCut.apply")}</GoldButton>
					</>
				) : (
					<Note>{t("silenceCut.nothing")}</Note>
				)}
			</div>
		);
	}

	return (
		<section className="flex flex-col gap-2" data-tour="silence-cut">
			<h3
				className="text-[11px] font-semibold tracking-[0.14em] uppercase"
				style={{ color: "var(--tb-gold)" }}
			>
				{t("silenceCut.title")}
			</h3>
			<p className="text-xs leading-snug" style={{ color: "var(--tb-text-muted)" }}>
				{t("silenceCut.explain")}
			</p>
			{body}
		</section>
	);
}

function Note({ children }: { children: React.ReactNode }) {
	return (
		<p className="text-xs leading-snug" style={{ color: "var(--tb-text)" }}>
			{children}
		</p>
	);
}

function Field({
	label,
	hint,
	value,
	children,
}: {
	label: string;
	hint: string;
	value: string | null;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5" title={hint}>
			<div className="flex items-baseline justify-between text-xs">
				<span style={{ color: "var(--tb-text)" }}>{label}</span>
				{value ? (
					<span className="tabular-nums" style={{ color: "var(--tb-gold-claro)" }}>
						{value}
					</span>
				) : null}
			</div>
			{children}
		</div>
	);
}

function GoldButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="h-8 w-full cursor-pointer rounded-sm px-3 text-xs font-semibold transition-[filter] hover:brightness-110"
			style={{
				background: "var(--tb-grad)",
				color: "var(--tb-on-gold)",
				boxShadow: "var(--tb-glow)",
			}}
		>
			{children}
		</button>
	);
}
