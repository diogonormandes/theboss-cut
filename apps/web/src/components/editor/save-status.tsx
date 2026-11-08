"use client";

// Indicador no topo do editor: "Salvando…", "Salvo" ou "Não salvo" (com aviso do que fazer).

import {
	Alert02Icon,
	CloudSavingDone01Icon,
	Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { EditorCore } from "@/core";
import type { SaveStatus as TSaveStatus } from "@/core/managers/save-manager";
import { getLocaleTag, t } from "@/i18n";
import { cn } from "@/utils/ui";

function useSaveStatus(): TSaveStatus {
	const save = EditorCore.getInstance().save;
	return useSyncExternalStore(
		(listener) => save.subscribe(listener),
		() => save.getStatus(),
		() => "saved",
	);
}

export function SaveStatus() {
	const status = useSaveStatus();
	const previous = useRef<TSaveStatus>(status);

	// avisa uma vez quando o salvamento passa a dar errado
	useEffect(() => {
		if (status === "error" && previous.current !== "error") {
			toast.error(t("editor.save.errorToast"), {
				description: t("editor.save.errorToastText"),
				duration: 10_000,
			});
		}
		previous.current = status;
	}, [status]);

	const lastSavedAt = EditorCore.getInstance().save.getLastSavedAt();
	const isBusy = status === "saving" || status === "pending";

	const label =
		status === "error"
			? t("editor.save.error")
			: isBusy
				? t("editor.save.saving")
				: t("editor.save.saved");

	const hint =
		status === "error"
			? t("editor.save.errorHint")
			: lastSavedAt
				? t("editor.save.savedHint", {
						time: lastSavedAt.toLocaleTimeString(getLocaleTag(), {
							hour: "2-digit",
							minute: "2-digit",
						}),
					})
				: label;

	return (
		<span
			className={cn(
				"flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs select-none transition-colors",
				status === "error"
					? "bg-destructive/15 text-destructive"
					: "text-muted-foreground",
			)}
			title={hint}
			role="status"
			aria-live="polite"
		>
			<HugeiconsIcon
				icon={
					status === "error"
						? Alert02Icon
						: isBusy
							? Loading03Icon
							: CloudSavingDone01Icon
				}
				className={cn("size-3.5", isBusy && "animate-spin")}
			/>
			{label}
		</span>
	);
}
