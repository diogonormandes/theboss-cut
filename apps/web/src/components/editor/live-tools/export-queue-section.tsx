"use client";

// Seção "Exportar cortes" (passo 7 da Etapa 3): marca os cortes e exporta em
// fila, um de cada vez. No programa do Windows vai direto para
// Vídeos\THEBOSS CUT\<projeto>; no navegador, um download por corte.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { getDesktopFilesBridge } from "@/core/managers/export-queue-manager";
import type { ExportQueueItem } from "@/core/managers/export-queue-manager";
import { useEditor } from "@/editor/use-editor";
import { t } from "@/i18n";

export function ExportQueueSection() {
	const editor = useEditor();
	const queue = editor.exportQueue;
	const snapshot = useSyncExternalStore(
		queue.subscribe,
		queue.getSnapshot,
		queue.getSnapshot,
	);
	const scenes = useEditor((e) => e.scenes.getScenes());
	const projectName = useEditor((e) => e.project.getActive()?.metadata.name ?? "");
	const cuts = useMemo(
		() => scenes.filter((scene) => scene.kind === "corte"),
		[scenes],
	);
	const [selected, setSelected] = useState<Set<string>>(() => new Set());
	const [hasBridge, setHasBridge] = useState(false);

	useEffect(() => {
		setHasBridge(getDesktopFilesBridge() !== null);
	}, []);

	// Tira da seleção cortes que deixaram de existir (ex.: Desfazer).
	useEffect(() => {
		setSelected((current) => {
			const ids = new Set(cuts.map((scene) => scene.id));
			const next = new Set([...current].filter((id) => ids.has(id)));
			return next.size === current.size ? current : next;
		});
	}, [cuts]);

	// Aviso ao terminar a fila.
	const wasRunning = useRef(false);
	useEffect(() => {
		if (wasRunning.current && !snapshot.running) {
			const done = snapshot.items.filter((item) => item.estado === "pronto").length;
			if (done > 0) toast.success(t("exportQueue.allDone", { n: done }));
		}
		wasRunning.current = snapshot.running;
	}, [snapshot.running, snapshot.items]);

	const toggle = (id: string) => {
		setSelected((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const allSelected = cuts.length > 0 && selected.size === cuts.length;
	const count = selected.size;

	const start = () => {
		const project = editor.project.getActive();
		if (!project || count === 0) return;
		const picked = cuts
			.map((scene, index) => ({ scene, numero: index + 1 }))
			.filter(({ scene }) => selected.has(scene.id))
			.map(({ scene, numero }) => ({
				sceneId: scene.id,
				nome: scene.name,
				numero,
			}));
		queue.enqueue({
			cuts: picked,
			options: {
				format: "mp4",
				quality: "high",
				fps: project.settings.fps,
				includeAudio: true,
			},
		});
		setSelected(new Set());
	};

	const finished = snapshot.items.filter(
		(item) => item.estado !== "aguardando" && item.estado !== "exportando",
	);
	const anyDone = snapshot.items.some((item) => item.estado === "pronto");

	return (
		<section className="flex flex-col gap-2" data-tour="export-queue">
			<h3
				className="text-[11px] font-semibold tracking-[0.14em] uppercase"
				style={{ color: "var(--tb-gold)" }}
			>
				{t("exportQueue.title")}
			</h3>
			<p className="text-xs leading-snug" style={{ color: "var(--tb-text-muted)" }}>
				{t("exportQueue.explain")}
			</p>

			{cuts.length === 0 ? (
				<Note>{t("exportQueue.empty")}</Note>
			) : (
				<div className="flex flex-col gap-1.5">
					<button
						type="button"
						className="self-end cursor-pointer text-[11px] underline-offset-2 hover:underline"
						style={{ color: "var(--tb-gold-claro)" }}
						onClick={() =>
							setSelected(
								allSelected ? new Set() : new Set(cuts.map((scene) => scene.id)),
							)
						}
					>
						{allSelected ? t("exportQueue.selectNone") : t("exportQueue.selectAll")}
					</button>
					<ul className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
						{cuts.map((scene, index) => (
							<li key={scene.id}>
								<label
									className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs"
									style={{
										color: "var(--tb-text)",
										background: selected.has(scene.id)
											? "rgba(var(--tb-gold-rgb), 0.08)"
											: "transparent",
									}}
								>
									<input
										type="checkbox"
										checked={selected.has(scene.id)}
										onChange={() => toggle(scene.id)}
										style={{ accentColor: "var(--tb-gold)" }}
									/>
									<span className="tabular-nums" style={{ color: "var(--tb-text-muted)" }}>
										{String(index + 1).padStart(2, "0")}
									</span>
									<span className="truncate">{scene.name}</span>
								</label>
							</li>
						))}
					</ul>
					<GoldButton onClick={start} disabled={count === 0}>
						{count === 1
							? t("exportQueue.exportOne")
							: t("exportQueue.exportMany", { n: count })}
					</GoldButton>
					<Hint>
						{hasBridge
							? t("exportQueue.folderHint", { project: projectName })
							: t("exportQueue.browserHint")}
					</Hint>
				</div>
			)}

			{snapshot.items.length > 0 ? (
				<div className="flex flex-col gap-1.5 pt-1">
					{snapshot.running ? <Hint>{t("exportQueue.running")}</Hint> : null}
					<ul className="flex flex-col gap-1.5">
						{snapshot.items.map((item) => (
							<QueueRow
								key={item.id}
								item={item}
								canShow={hasBridge}
								onCancel={() => queue.cancel(item.id)}
								onShow={() => void queue.showFolder(item.caminho)}
							/>
						))}
					</ul>
					<div className="flex flex-wrap gap-2">
						{snapshot.running ? (
							<SmallButton onClick={() => queue.cancelAll()}>
								{t("exportQueue.cancelAll")}
							</SmallButton>
						) : null}
						{hasBridge && anyDone && snapshot.pasta ? (
							<SmallButton onClick={() => void queue.showFolder()}>
								{t("exportQueue.openFolder")}
							</SmallButton>
						) : null}
						{finished.length > 0 && !snapshot.running ? (
							<SmallButton onClick={() => queue.clearFinished()}>
								{t("exportQueue.clear")}
							</SmallButton>
						) : null}
					</div>
				</div>
			) : null}
		</section>
	);
}

function QueueRow({
	item,
	canShow,
	onCancel,
	onShow,
}: {
	item: ExportQueueItem;
	canShow: boolean;
	onCancel: () => void;
	onShow: () => void;
}) {
	const pct = Math.round(item.progresso * 100);
	const label =
		item.estado === "aguardando"
			? t("exportQueue.waiting")
			: item.estado === "exportando"
				? t("exportQueue.exporting", { pct })
				: item.estado === "pronto"
					? t("exportQueue.done")
					: item.estado === "erro"
						? t("exportQueue.failed")
						: t("exportQueue.cancelled");
	const color =
		item.estado === "pronto"
			? "var(--tb-gold-claro)"
			: item.estado === "erro"
				? "var(--tb-danger, #e5484d)"
				: "var(--tb-text-muted)";
	const active = item.estado === "aguardando" || item.estado === "exportando";

	return (
		<li
			className="flex flex-col gap-1 rounded-sm border px-2 py-1.5 text-xs"
			style={{ borderColor: "rgba(var(--tb-gold-rgb), 0.18)" }}
		>
			<div className="flex items-center justify-between gap-2">
				<span className="truncate" style={{ color: "var(--tb-text)" }} title={item.nome}>
					{item.nome}
				</span>
				{active ? (
					<button
						type="button"
						className="shrink-0 cursor-pointer text-[11px] hover:underline"
						style={{ color: "var(--tb-text-muted)" }}
						onClick={onCancel}
					>
						{t("exportQueue.cancel")}
					</button>
				) : item.estado === "pronto" && canShow && item.caminho ? (
					<button
						type="button"
						className="shrink-0 cursor-pointer text-[11px] hover:underline"
						style={{ color: "var(--tb-gold-claro)" }}
						onClick={onShow}
					>
						{t("exportQueue.showFile")}
					</button>
				) : null}
			</div>
			<div className="flex items-center gap-2">
				<div
					className="h-1 flex-1 overflow-hidden rounded-full"
					style={{ background: "rgba(var(--tb-gold-rgb), 0.12)" }}
				>
					<div
						className="h-full"
						style={{
							width: `${item.estado === "pronto" ? 100 : pct}%`,
							background: "var(--tb-grad)",
							transition: "width 200ms linear",
						}}
					/>
				</div>
				<span className="shrink-0 text-[10.5px] tabular-nums" style={{ color }}>
					{label}
				</span>
			</div>
			{item.estado === "erro" && item.erro ? (
				<p className="text-[10.5px] leading-snug" style={{ color: "var(--tb-text-muted)" }}>
					{item.erro}
				</p>
			) : null}
		</li>
	);
}

function Note({ children }: { children: React.ReactNode }) {
	return (
		<p className="text-xs leading-snug" style={{ color: "var(--tb-text)" }}>
			{children}
		</p>
	);
}

function Hint({ children }: { children: React.ReactNode }) {
	return (
		<p className="text-[11px] leading-snug" style={{ color: "var(--tb-text-muted)" }}>
			{children}
		</p>
	);
}

function SmallButton({
	children,
	onClick,
}: {
	children: React.ReactNode;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="h-7 cursor-pointer rounded-sm border px-2.5 text-[11px] transition-[filter] hover:brightness-125"
			style={{
				borderColor: "rgba(var(--tb-gold-rgb), 0.35)",
				color: "var(--tb-text)",
			}}
		>
			{children}
		</button>
	);
}

function GoldButton({
	children,
	onClick,
	disabled,
}: {
	children: React.ReactNode;
	onClick: () => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="h-8 w-full cursor-pointer rounded-sm px-3 text-xs font-semibold transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
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
