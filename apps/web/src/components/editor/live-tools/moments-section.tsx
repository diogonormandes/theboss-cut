"use client";

/**
 * Seção "Melhores momentos" da aba Cortes (Etapa 3, passo 6).
 *
 * Lê o resultado da análise que o Mapa da live já fez (nada de áudio aqui),
 * sugere os N melhores trechos (de 15 a 60 s), deixa aceitar/recusar, marca
 * os aceitos como marcadores dourados na cena principal (o marcador É o
 * "aceito") e cria todos os
 * cortes de uma vez (um passo de desfazer), no formato escolhido.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AddBookmarksCommand, CreateScenesFromCutsCommand } from "@/commands/scene";
import { type CutSpec, nextCutNumber } from "@/commands/scene/create-scenes-from-cuts";
import { RemoveBookmarksCommand } from "@/commands/scene/remove-bookmarks";
import { LIVE_MAP_MIN_DURATION_SEC, formatClock } from "@/components/editor/live-map/live-map-strip";
import { useLiveMapStore } from "@/components/editor/live-map/store";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { EditorCore } from "@/core";
import { useEditor } from "@/editor/use-editor";
import { t } from "@/i18n";
import type { MediaAsset } from "@/media/types";
import type { TCanvasSize } from "@/project/types";
import { type SuggestedMoment, suggestMoments } from "@/services/live-analysis/moments";
import type { Bookmark, TScene } from "@/timeline/types";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import { create } from "zustand";
import { applyFraming, type FramingMode } from "@/services/face-tracking/apply-framing";
import { framingMakesSense } from "@/services/face-tracking/framing-math";
import { FramingChooser } from "./framing-chooser";

/* ---------------- decisões ---------------- */

/**
 * "Aceito" NÃO é guardado à parte: vem do próprio marcador do momento na cena
 * principal (assim desfazer, recarregar e trocar de cena ficam sempre de
 * acordo). Só o "recusado" (que não mexe no projeto) fica aqui, na sessão.
 */
type Decision = "accepted" | "rejected" | "created";
type RejectedState = {
	byKey: Record<string, true | undefined>;
	set: (key: string, rejected: boolean) => void;
};
const useRejected = create<RejectedState>((set) => ({
	byKey: {},
	set: (key, rejected) => set((s) => ({ byKey: { ...s.byKey, [key]: rejected ? true : undefined } })),
}));
/** a lista é sempre calculada no máximo; o controle só escolhe quantos mostrar */
const MAX_MOMENTS = 20;
const momentKey = (assetId: string, m: SuggestedMoment) => `${assetId}:${Math.round(m.peak)}`;

/* ---------------- formatos ---------------- */

type FormatId = "vertical" | "wide" | "square";
const FORMATS: { id: FormatId; size: TCanvasSize; ratio: [number, number] }[] = [
	{ id: "vertical", size: { width: 1080, height: 1920 }, ratio: [9, 16] },
	{ id: "wide", size: { width: 1920, height: 1080 }, ratio: [16, 9] },
	{ id: "square", size: { width: 1080, height: 1080 }, ratio: [1, 1] },
];


/** Cor do marcador: o dourado do tema aberto na hora de aceitar. */
function goldColor(): string {
	try {
		return getComputedStyle(document.documentElement).getPropertyValue("--tb-gold").trim() || "#c9a96a";
	} catch {
		return "#c9a96a";
	}
}

/* ---------------- ajudantes ---------------- */

function mainSceneOf(scenes: TScene[]): TScene | null {
	return scenes.find((s) => s.isMain) ?? scenes[0] ?? null;
}

type LiveElement = { start: number; trim: number; srcEnd: number; rate: number };

function liveElements(scene: TScene | null, assetId: string): LiveElement[] {
	if (!scene) return [];
	const out: LiveElement[] = [];
	for (const track of [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio]) {
		for (const el of track.elements) {
			if (!("mediaId" in el) || el.mediaId !== assetId) continue;
			const start = mediaTimeToSeconds({ time: el.startTime });
			const dur = mediaTimeToSeconds({ time: el.duration });
			const trim = mediaTimeToSeconds({ time: el.trimStart });
			const rate = "retime" in el && el.retime ? (el.retime as { rate?: number }).rate ?? 1 : 1;
			out.push({ start, trim, srcEnd: trim + dur * rate, rate });
		}
	}
	return out;
}

/**
 * Onde o trecho [srcStart, srcEnd] da live está na linha do tempo da cena
 * principal: só a parte que sobrou (depois de cortes, silêncios tirados e
 * velocidade). `null` quando nada do trecho está na cena.
 */
function sourceRangeToMainTimeline(
	elements: LiveElement[],
	srcStart: number,
	srcEnd: number,
): { start: number; end: number } | null {
	let start = Number.POSITIVE_INFINITY;
	let end = Number.NEGATIVE_INFINITY;
	for (const el of elements) {
		const a = Math.max(srcStart, el.trim);
		const b = Math.min(srcEnd, el.srcEnd);
		if (b <= a) continue;
		start = Math.min(start, el.start + (a - el.trim) / el.rate);
		end = Math.max(end, el.start + (b - el.trim) / el.rate);
	}
	return end > start ? { start, end } : null;
}

/** Marcador do momento na cena principal (perto do começo dele, com duração). */
function findMomentBookmark(bookmarks: Bookmark[], tlStart: number): Bookmark | null {
	for (const b of bookmarks) {
		if (b.duration === undefined) continue;
		if (Math.abs(mediaTimeToSeconds({ time: b.time }) - tlStart) < 0.5) return b;
	}
	return null;
}

/** Já existe uma cena de corte com este trecho da live? (vem das cenas: desfazer fica de acordo) */
function hasCutFor(scenes: TScene[], assetId: string, m: SuggestedMoment): boolean {
	return scenes.some(
		(s) =>
			s.kind === "corte" &&
			s.sourceRange?.mediaId === assetId &&
			Math.abs(s.sourceRange.srcStart - m.start) < 0.5 &&
			Math.abs(s.sourceRange.srcEnd - m.end) < 0.5,
	);
}

function pickLive(assets: MediaAsset[], main: TScene | null): MediaAsset | null {
	const longVideos = assets.filter(
		(a) => a.type === "video" && a.file && (a.duration ?? 0) >= LIVE_MAP_MIN_DURATION_SEC,
	);
	if (longVideos.length === 0) return null;
	const used = longVideos.find((a) => liveElements(main, a.id).length > 0);
	if (used) return used;
	return longVideos.reduce((a, b) => ((b.duration ?? 0) > (a.duration ?? 0) ? b : a));
}

function formatDuration(sec: number): string {
	const s = Math.round(sec);
	return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/* ---------------- seção ---------------- */

export function MomentsSection() {
	const assets = useEditor((e) => e.media.getAssets());
	const scenes = useEditor((e) => e.scenes.getScenes());
	const main = useMemo(() => mainSceneOf(scenes), [scenes]);
	const asset = useMemo(() => pickLive(assets, main), [assets, main]);

	return (
		<section className="flex flex-col gap-3 rounded-md border p-3" style={{ borderColor: "var(--tb-border)" }}>
			<header className="flex flex-col gap-1">
				<h3 className="text-sm font-semibold" style={{ color: "var(--tb-gold-claro)" }}>
					{t("moments.title")}
				</h3>
				<p className="text-xs" style={{ color: "var(--tb-text-muted)" }}>
					{t("moments.explain")}
				</p>
			</header>
			{asset ? (
				<MomentsForAsset asset={asset} main={main} scenes={scenes} />
			) : (
				<p className="text-xs" style={{ color: "var(--tb-text-muted)" }}>
					{t("moments.noLive")}
				</p>
			)}
		</section>
	);
}

function MomentsForAsset({
	asset,
	main,
	scenes,
}: {
	asset: MediaAsset;
	main: TScene | null;
	scenes: TScene[];
}) {
	const editor = useEditor();
	const entry = useLiveMapStore((s) => s.entries[asset.id]);
	const [count, setCount] = useState(10);
	const [showRejected, setShowRejected] = useState(false);
	const [dialogOpen, setDialogOpen] = useState(false);
	const rejectedKeys = useRejected((s) => s.byKey);
	const setRejected = useRejected((s) => s.set);

	const analysis = entry?.status === "done" ? entry.analysis : null;
	const summary = entry?.status === "done" ? entry.summary : null;
	// sempre no máximo: os N primeiros da escolha são os mesmos com qualquer N
	const allMoments = useMemo(() => {
		if (!analysis || !summary) return [];
		return suggestMoments(analysis, {
			silences: summary.silences,
			shouts: summary.shouts,
			options: { count: MAX_MOMENTS },
		});
	}, [analysis, summary]);
	const elements = useMemo(() => liveElements(main, asset.id), [main, asset.id]);
	/** onde cada momento está na cena principal e o marcador dele (se aceito) */
	const placed = useMemo(
		() =>
			allMoments.map((m) => {
				const range = sourceRangeToMainTimeline(elements, m.start, m.end);
				const bookmark = range && main ? findMomentBookmark(main.bookmarks, range.start) : null;
				return { range, bookmark };
			}),
		[allMoments, elements, main],
	);

	if (!analysis || !summary) {
		return (
			<p className="text-xs" style={{ color: "var(--tb-text-muted)" }}>
				{t("moments.needMap")}
			</p>
		);
	}
	if (allMoments.length === 0) {
		return (
			<p className="text-xs" style={{ color: "var(--tb-text-muted)" }}>
				{t("moments.none")}
			</p>
		);
	}

	const keyOf = (m: SuggestedMoment) => momentKey(asset.id, m);
	const indexOf = new Map(allMoments.map((m, i) => [m, i]));
	const placeOf = (m: SuggestedMoment) => placed[indexOf.get(m) ?? -1];
	const decisionOf = (m: SuggestedMoment): Decision | undefined => {
		if (hasCutFor(scenes, asset.id, m)) return "created";
		if (placeOf(m)?.bookmark) return "accepted";
		return rejectedKeys[keyOf(m)] ? "rejected" : undefined;
	};
	// os N do controle + os aceitos que ficaram de fora (nunca somem da lista)
	const moments = allMoments.filter((m, i) => {
		const d = decisionOf(m);
		return i < count || d === "accepted" || d === "created";
	});
	const rejected = moments.filter((m) => decisionOf(m) === "rejected");
	const accepted = moments.filter((m) => decisionOf(m) === "accepted");
	const created = moments.filter((m) => decisionOf(m) === "created");
	// nunca cria de novo um momento que já virou corte
	const toCreate =
		accepted.length > 0
			? accepted
			: created.length > 0
				? []
				: moments.filter((m) => decisionOf(m) === undefined);
	const visible = showRejected ? moments : moments.filter((m) => decisionOf(m) !== "rejected");

	const play = async (m: SuggestedMoment) => {
		if (!main) return;
		const range = placeOf(m)?.range;
		if (!range) {
			toast.error(t("moments.notInMain"));
			return;
		}
		if (editor.scenes.getActiveSceneOrNull()?.id !== main.id) {
			await editor.scenes.switchToScene({ sceneId: main.id });
		}
		editor.playback.seek({ time: mediaTimeFromSeconds({ seconds: range.start }) });
		editor.playback.play();
	};

	const accept = (m: SuggestedMoment) => {
		const range = placeOf(m)?.range;
		if (!main || !range) {
			toast.error(t("moments.notInMain"));
			return;
		}
		editor.command.execute({
			command: new AddBookmarksCommand({
				sceneId: main.id,
				bookmarks: [
					{
						time: mediaTimeFromSeconds({ seconds: range.start }),
						duration: mediaTimeFromSeconds({ seconds: range.end - range.start }),
						color: goldColor(),
						note: t("moments.bookmarkNote", { reason: t(`moments.reason.${m.reason}`) }),
					},
				],
			}),
		});
	};

	const unaccept = (m: SuggestedMoment) => {
		const bookmark = placeOf(m)?.bookmark;
		// só põe o passo no histórico se o marcador existe mesmo
		if (!main || !bookmark) return;
		editor.command.execute({
			command: new RemoveBookmarksCommand({ sceneId: main.id, times: [bookmark.time] }),
		});
	};

	return (
		<div className="flex flex-col gap-3">
			<label className="flex items-center gap-2 text-xs" style={{ color: "var(--tb-text-muted)" }}>
				<span className="shrink-0">{t("moments.howMany")}</span>
				<input
					type="range"
					min={5}
					max={20}
					step={1}
					value={count}
					onChange={(e) => setCount(Number(e.target.value))}
					className="flex-1"
					style={{ accentColor: "var(--tb-gold)" }}
				/>
				<span className="w-6 text-right tabular-nums" style={{ color: "var(--tb-text)" }}>
					{count}
				</span>
			</label>

			<ul className="flex flex-col gap-2">
				{visible.map((m, i) => (
					<MomentRow
						key={keyOf(m)}
						index={(indexOf.get(m) ?? 0) + 1}
						moment={m}
						decision={decisionOf(m)}
						onPlay={() => void play(m)}
						onAccept={() => accept(m)}
						onUnaccept={() => unaccept(m)}
						onReject={() => setRejected(keyOf(m), true)}
						onRestore={() => setRejected(keyOf(m), false)}
						first={i === 0}
					/>
				))}
			</ul>

			{rejected.length > 0 && (
				<button
					type="button"
					className="self-start text-xs underline-offset-2 hover:underline"
					style={{ color: "var(--tb-text-muted)" }}
					onClick={() => setShowRejected((v) => !v)}
				>
					{rejected.length === 1
						? t("moments.rejectedCountOne")
						: t("moments.rejectedCount", { n: rejected.length })} ·{" "}
					{showRejected ? t("moments.hideRejected") : t("moments.showRejected")}
				</button>
			)}

			<div className="flex flex-col gap-1.5">
				<button
					type="button"
					disabled={toCreate.length === 0}
					onClick={() => setDialogOpen(true)}
					className="h-9 rounded-md text-sm font-semibold transition-[filter] hover:brightness-110 disabled:opacity-50"
					style={{ background: "var(--tb-grad)", color: "var(--tb-on-gold)" }}
				>
					{toCreate.length === 0
						? t("moments.dialog.confirm")
						: toCreate.length === 1
							? t("moments.createOne")
							: t("moments.create", { n: toCreate.length })}
				</button>
				<p className="text-[11px]" style={{ color: "var(--tb-text-muted)" }}>
					{accepted.length > 0
						? t("moments.createHintAccepted")
						: created.length > 0
							? t("moments.createHintNone")
							: t("moments.createHintAll")}
				</p>
			</div>

			<CreateCutsDialog
				firstNumber={nextCutNumber(scenes)}
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				editor={editor}
				asset={asset}
				moments={[...toCreate].sort((a, b) => a.start - b.start)}
			/>
		</div>
	);
}

function MomentRow({
	index,
	moment: m,
	decision,
	onPlay,
	onAccept,
	onUnaccept,
	onReject,
	onRestore,
}: {
	index: number;
	moment: SuggestedMoment;
	decision: Decision | undefined;
	onPlay: () => void;
	onAccept: () => void;
	onUnaccept: () => void;
	onReject: () => void;
	onRestore: () => void;
	first: boolean;
}) {
	const isCreated = decision === "created";
	const isAccepted = decision === "accepted" || isCreated;
	const isRejected = decision === "rejected";
	return (
		<li
			className="flex flex-col gap-1.5 rounded-md border p-2 transition-colors"
			style={{
				borderColor: isAccepted ? "var(--tb-gold)" : "var(--tb-border)",
				background: isAccepted ? "rgba(var(--tb-gold-rgb), 0.08)" : "var(--tb-surface)",
				opacity: isRejected ? 0.5 : 1,
			}}
		>
			<button
				type="button"
				onClick={onPlay}
				title={t("moments.play")}
				className="flex items-center gap-2 text-left"
			>
				<span
					className="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums"
					style={{ background: "rgba(var(--tb-gold-rgb), 0.15)", color: "var(--tb-gold-claro)" }}
				>
					{index}
				</span>
				<span className="flex min-w-0 flex-1 flex-col">
					<span className="truncate text-xs font-medium" style={{ color: "var(--tb-text)" }}>
						{t(`moments.reason.${m.reason}`)}
					</span>
					<span className="text-[11px] tabular-nums" style={{ color: "var(--tb-text-muted)" }}>
						{formatClock(m.start)} · {formatDuration(m.end - m.start)}
					</span>
				</span>
				<ScoreBar score={m.score} />
			</button>
			<div className="flex gap-1.5">
				{isCreated ? (
					<span
						className="flex h-7 flex-1 items-center justify-center rounded-md border text-xs"
						style={{ borderColor: "var(--tb-gold)", color: "var(--tb-gold-claro)" }}
					>
						✓ {t("moments.created")}
					</span>
				) : isRejected ? (
					<Button variant="ghost" size="sm" className="h-7 flex-1 text-xs" onClick={onRestore}>
						{t("moments.undoReject")}
					</Button>
				) : (
					<>
						<Button
							variant="outline"
							size="sm"
							className="h-7 flex-1 text-xs"
							style={isAccepted ? { borderColor: "var(--tb-gold)", color: "var(--tb-gold-claro)" } : undefined}
							onClick={isAccepted ? onUnaccept : onAccept}
							aria-pressed={isAccepted}
						>
							{isAccepted ? `✓ ${t("moments.accepted")}` : t("moments.accept")}
						</Button>
						{!isAccepted && (
							<Button variant="ghost" size="sm" className="h-7 flex-1 text-xs" onClick={onReject}>
								{t("moments.reject")}
							</Button>
						)}
					</>
				)}
			</div>
		</li>
	);
}

function ScoreBar({ score }: { score: number }) {
	return (
		<span className="flex w-16 shrink-0 flex-col items-end gap-1" title={t("moments.scoreLabel", { score })}>
			<span className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--tb-gold-claro)" }}>
				{score}
			</span>
			<span className="h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--tb-surface-2)" }}>
				<span
					className="block h-full rounded-full"
					style={{ width: `${score}%`, background: "var(--tb-grad)" }}
				/>
			</span>
		</span>
	);
}

function CreateCutsDialog({
	firstNumber,
	open,
	onOpenChange,
	editor,
	asset,
	moments,
}: {
	firstNumber: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	editor: EditorCore;
	asset: MediaAsset;
	moments: SuggestedMoment[];
}) {
	const [format, setFormat] = useState<FormatId>("vertical");
	const [framing, setFraming] = useState<FramingMode>("centered");
	const n = moments.length;
	const canvas = FORMATS.find((f) => f.id === format)?.size ?? FORMATS[0].size;
	const canFrame = framingMakesSense(asset, canvas);
	// aviso só quando a live já é em pé (o texto fala disso); nos outros casos o seletor some sem aviso
	const sourceFits = !canFrame && (asset.height ?? 0) > (asset.width ?? 0);

	const create = () => {
		const size = canvas;
		const cuts: CutSpec[] = moments.map((m, i) => ({
			name: t("moments.cutName", {
				n: String(firstNumber + i).padStart(2, "0"),
				reason: t(`moments.reason.${m.reason}`),
			}),
			mediaId: asset.id,
			srcStart: m.start,
			srcEnd: m.end,
			canvasSize: size,
			sourceDuration: asset.duration,
		}));
		if (!CreateScenesFromCutsCommand.hasScenesToCreate({ cuts })) {
			toast.error(t("moments.failed"));
			return;
		}
		const command = new CreateScenesFromCutsCommand({ cuts });
		editor.command.execute({ command });
		const ids = command.getSceneIds();
		onOpenChange(false);
		// enquadramento escolhido (Dividido / Seguir rosto): roda depois de criar, com aviso de andamento
		if (canFrame && framing !== "centered" && ids.length > 0) {
			void applyChosenFraming({ editor, sceneIds: ids, mode: framing });
		}
		toast.success(ids.length === 1 ? t("moments.doneOne") : t("moments.done", { n: ids.length }), {
			duration: 10_000,
			action: ids[0]
				? {
						label: t("moments.openFirst"),
						onClick: () => void editor.scenes.switchToScene({ sceneId: ids[0] }),
					}
				: undefined,
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>{n === 1 ? t("moments.dialog.titleOne") : t("moments.dialog.title", { n })}</DialogTitle>
					<DialogDescription>{t("moments.dialog.formatQuestion")}</DialogDescription>
				</DialogHeader>
				<DialogBody className="flex flex-col gap-4">
					<div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("moments.dialog.formatQuestion")}>
						{FORMATS.map((f) => {
							const active = f.id === format;
							const [w, h] = f.ratio;
							const scale = 34 / Math.max(w, h);
							return (
								<button
									key={f.id}
									type="button"
									role="radio"
									aria-checked={active}
									onClick={() => setFormat(f.id)}
									className="flex flex-col items-center gap-2 rounded-md border p-3 transition-colors"
									style={{
										borderColor: active ? "var(--tb-gold)" : "var(--tb-border)",
										background: active ? "rgba(var(--tb-gold-rgb), 0.08)" : "transparent",
									}}
								>
									<span className="flex h-10 items-center justify-center">
										<span
											className="block rounded-[3px] border-2"
											style={{
												width: w * scale,
												height: h * scale,
												borderColor: active ? "var(--tb-gold)" : "var(--tb-border-strong)",
											}}
										/>
									</span>
									<span className="text-xs font-medium" style={{ color: "var(--tb-text)" }}>
										{t(`moments.dialog.${f.id}`)}
									</span>
									<span className="text-[10px]" style={{ color: "var(--tb-text-muted)" }}>
										{t(`moments.dialog.${f.id}Hint`)}
									</span>
								</button>
							);
						})}
					</div>

					{canFrame ? (
						<FramingChooser value={framing} onChange={setFraming} />
					) : sourceFits ? (
						<p
							className="rounded-md border px-3 py-2 text-xs"
							style={{ borderColor: "var(--tb-border)", color: "var(--tb-text-muted)" }}
						>
							{t("framing.alreadyFits")}
						</p>
					) : null}
				</DialogBody>
				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						{t("moments.dialog.cancel")}
					</Button>
					<button
						type="button"
						onClick={create}
						disabled={n === 0}
						className="h-9 rounded-md px-4 text-sm font-semibold hover:brightness-110 disabled:opacity-50"
						style={{ background: "var(--tb-grad)", color: "var(--tb-on-gold)" }}
					>
						{t("moments.dialog.confirm")}
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** Aplica o enquadramento nas cenas novas, com aviso de andamento e do resultado. */
async function applyChosenFraming({
	editor,
	sceneIds,
	mode,
}: {
	editor: EditorCore;
	sceneIds: string[];
	mode: FramingMode;
}): Promise<void> {
	const toastId = toast.loading(t("framing.working"));
	try {
		const result = await applyFraming({ editor, sceneIds, mode });
		toast.dismiss(toastId);
		if (result.applied.length > 0) {
			toast.success(
				result.applied.length === 1
					? t("framing.doneOne")
					: t("framing.done", { n: result.applied.length }),
			);
		}
		if (result.noFace.length > 0) toast.warning(t("framing.noFace"));
		if (result.unreadable.length > 0) toast.warning(t("framing.cannotRead"));
	} catch (error) {
		console.error("Failed to apply framing:", error);
		toast.dismiss(toastId);
		toast.error(t("framing.cannotRead"));
	}
}
