"use client";

// Aviso de versão nova (só dentro do programa do Windows; no navegador não aparece).
// O programa baixa a versão nova sozinho; aqui a pessoa escolhe "Atualizar agora" ou "Depois".

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Emblem } from "@/components/brand/emblem";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

type UpdateState = {
	fase: "nada" | "baixando" | "pronta" | "instalando";
	versao: string | null;
	pct: number;
};

type DesktopBridge = {
	aoMudarAtualizacao: (callback: (state: UpdateState) => void) => () => void;
	atualizarAgora: () => Promise<boolean>;
};

function getBridge(): DesktopBridge | null {
	if (typeof window === "undefined") return null;
	return (window as Window & { theBossCut?: DesktopBridge }).theBossCut ?? null;
}

export function UpdateNotice() {
	const [state, setState] = useState<UpdateState | null>(null);
	const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
	const [isInstalling, setIsInstalling] = useState(false);

	useEffect(() => {
		const bridge = getBridge();
		if (!bridge) return;
		return bridge.aoMudarAtualizacao(setState);
	}, []);

	if (!state || state.fase !== "pronta" || !state.versao) return null;
	if (dismissedVersion === state.versao) return null;

	const updateNow = async () => {
		const bridge = getBridge();
		if (!bridge) return;
		setIsInstalling(true);
		const ok = await bridge.atualizarAgora().catch(() => false);
		if (!ok) {
			setIsInstalling(false);
			setDismissedVersion(state.versao);
			toast.error(t("update.failed"));
		}
	};

	const later = () => {
		setDismissedVersion(state.versao);
		toast(t("update.laterHint"));
	};

	return (
		<div className="tb-update" role="status" aria-live="polite">
			<Emblem size={40} />
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<b className="font-display text-lg leading-tight font-semibold tracking-wide">
					{t("update.title")}
				</b>
				<span className="text-sm">
					{t("update.text", { version: state.versao })}
				</span>
				<span className="text-muted-foreground text-xs">
					{t("update.nowHint")}
				</span>
				<div className="mt-2 flex items-center gap-2">
					<Button
						size="sm"
						className="btn-boss px-3"
						onClick={updateNow}
						disabled={isInstalling}
					>
						{isInstalling ? t("update.installing") : t("update.now")}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={later}
						disabled={isInstalling}
					>
						{t("update.later")}
					</Button>
				</div>
			</div>
		</div>
	);
}
