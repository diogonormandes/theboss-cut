"use client";

/**
 * Mídia offline no painel de mídias: a live guardada por referência não foi
 * achada (movida, renomeada, apagada ou sem acesso). Mostra "Mídia offline"
 * e o botão "Localizar arquivo", que reconecta depois de conferir tamanho e
 * duração.
 */

import { useState } from "react";
import { toast } from "sonner";
import { t } from "@/i18n";
import { useEditor } from "@/editor/use-editor";
import type { OfflineMediaAsset } from "@/services/storage/types";
import type { OfflineReason } from "@/services/storage/media-reference";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/utils/ui";

function reasonText(reason: OfflineReason): string {
	if (reason === "permission") return t("media.offline.reasonPermission");
	if (reason === "changed") return t("media.offline.reasonChanged");
	return t("media.offline.reasonMissing");
}

export function useLocateOfflineMedia() {
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActiveOrNull());
	const [busyId, setBusyId] = useState<string | null>(null);

	const locate = async (asset: OfflineMediaAsset) => {
		if (!activeProject || busyId) return;
		setBusyId(asset.id);
		try {
			const result = await editor.media.relinkOfflineAsset({
				projectId: activeProject.metadata.id,
				id: asset.id,
			});
			if (result === "relinked") {
				toast.success(t("media.offline.relinked", { name: asset.name }));
			} else if (result === "mismatch") {
				toast.error(t("media.offline.mismatch"), {
					description: t("media.offline.mismatchHint", { name: asset.name }),
				});
			} else if (result === "failed") {
				toast.error(t("media.offline.failed"));
			}
		} finally {
			setBusyId(null);
		}
	};

	const remove = (asset: OfflineMediaAsset) => {
		if (!activeProject) return;
		void editor.media.removeOfflineAsset({
			projectId: activeProject.metadata.id,
			id: asset.id,
		});
	};

	return { locate, remove, busyId };
}

export function OfflineMediaItem({
	asset,
	variant,
	busy,
	onLocate,
	onRemove,
}: {
	asset: OfflineMediaAsset;
	variant: "grid" | "compact";
	busy: boolean;
	onLocate: () => void;
	onRemove: () => void;
}) {
	const hint = asset.originalPath
		? `${reasonText(asset.reason)}
${t("media.offline.wasAt", { path: asset.originalPath })}`
		: reasonText(asset.reason);
	const locateLabel = busy ? t("media.offline.locating") : t("media.offline.locate");

	const button = (
		<button
			type="button"
			onClick={onLocate}
			disabled={busy}
			className={cn(
				"rounded-sm px-2 py-0.5 text-[0.7rem] font-semibold whitespace-nowrap",
				"bg-[image:var(--tb-grad)] text-[var(--tb-on-gold)] shadow-[var(--tb-glow)]",
				"transition-opacity hover:opacity-90 disabled:opacity-60",
			)}
		>
			{locateLabel}
		</button>
	);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				{variant === "grid" ? (
					<div className="flex w-28 flex-col gap-1" title={`${asset.name}\n${hint}`}>
						<div className="relative aspect-video w-full overflow-hidden rounded-sm border border-dashed border-[var(--tb-border-strong)] bg-[var(--tb-surface-2)]">
							{asset.thumbnailUrl ? (
								// biome-ignore lint/performance/noImgElement: miniatura em data URL
								<img
									src={asset.thumbnailUrl}
									alt=""
									className="absolute inset-0 size-full object-cover opacity-30 grayscale"
								/>
							) : null}
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-1 text-center">
								<span className="text-[0.65rem] font-semibold tracking-wide text-[var(--tb-gold)] uppercase">
									{t("media.offline.badge")}
								</span>
								{button}
							</div>
						</div>
						<span className="w-full truncate text-left text-[0.7rem] text-[var(--tb-text-muted)]">
							{asset.name}
						</span>
					</div>
				) : (
					<div
						className="flex h-8 w-full items-center gap-2 px-1"
						title={hint}
					>
						<span className="shrink-0 rounded-sm border border-dashed border-[var(--tb-border-strong)] px-1 text-[0.6rem] font-semibold text-[var(--tb-gold)] uppercase">
							{t("media.offline.badge")}
						</span>
						<span className="min-w-0 flex-1 truncate text-left text-sm text-[var(--tb-text-muted)]">
							{asset.name}
						</span>
						{button}
					</div>
				)}
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onClick={onLocate}>{t("media.offline.locate")}</ContextMenuItem>
				<ContextMenuItem variant="destructive" onClick={onRemove}>
					{t("media.offline.remove")}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
