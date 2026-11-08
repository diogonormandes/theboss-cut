"use client";

import { PaintBoardIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n";
import { cn } from "@/utils/ui";
import { getThemeOptions, setAppTheme, useAppTheme } from "../index";

/** Janela "Aparência" com os cartões dos temas (iguais aos do THEBOSSVERSE). */
export function ThemeDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useT();
	const current = useAppTheme();
	const options = getThemeOptions();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle className="font-display text-2xl font-semibold tracking-wide">
						{t("theme.dialogTitle")}
					</DialogTitle>
					<DialogDescription>{t("theme.dialogDescription")}</DialogDescription>
				</DialogHeader>
				<div
					className="tb-temas max-h-[60vh] overflow-y-auto p-1 scrollbar-thin"
					role="radiogroup"
					aria-label={t("theme.title")}
				>
					{options.map((option) => {
						const isOn = option.id === current;
						return (
							<button
								key={option.id}
								type="button"
								role="radio"
								aria-checked={isOn}
								className={cn("tb-tema", isOn && "is-on")}
								onClick={() => setAppTheme(option.id)}
								style={
									{
										"--t-bg": option.swatches[0],
										"--t-sf": option.swatches[1],
										"--t-a": option.swatches[2],
										"--t-b": option.swatches[3],
									} as React.CSSProperties
								}
							>
								<span className="tb-tema-mini" aria-hidden="true">
									<i className="tb-mini-side" />
									<i className="tb-mini-card" />
									<i className="tb-mini-card is-2" />
									<i className="tb-mini-btn" />
								</span>
								<span className="tb-tema-nome">
									<b>{option.name}</b>
									<small>{option.description}</small>
								</span>
								{isOn && (
									<span className="tb-tema-check">
										<HugeiconsIcon icon={Tick02Icon} className="size-3.5" />
									</span>
								)}
							</button>
						);
					})}
				</div>
			</DialogContent>
		</Dialog>
	);
}

/** Botão de paleta que abre a janela de temas. */
export function ThemeButton({ className }: { className?: string }) {
	const t = useT();
	const [open, setOpen] = useState(false);

	return (
		<>
			<Button
				variant="ghost"
				size="icon"
				className={cn("size-8", className)}
				onClick={() => setOpen(true)}
				aria-label={t("theme.choose")}
				title={t("theme.choose")}
			>
				<HugeiconsIcon icon={PaintBoardIcon} className="!size-[1.1rem]" />
			</Button>
			<ThemeDialog open={open} onOpenChange={setOpen} />
		</>
	);
}
