"use client";

// Dica que aparece ao parar o mouse num botão que só tem ícone (com o atalho do teclado, se houver).
// Também vira o nome do botão para leitores de tela.

import { cloneElement, isValidElement, type ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export function Tip({
	label,
	shortcut,
	side = "top",
	children,
}: {
	label: string;
	shortcut?: string;
	side?: "top" | "bottom" | "left" | "right";
	children: ReactElement<{ "aria-label"?: string }>;
}) {
	const trigger = isValidElement(children)
		? cloneElement(children, {
				"aria-label": children.props["aria-label"] ?? label,
			})
		: children;
	return (
		<Tooltip>
			<TooltipTrigger asChild>{trigger}</TooltipTrigger>
			<TooltipContent side={side}>
				<span className="flex items-center gap-2">
					{label}
					{shortcut && (
						<kbd className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-sans text-[0.7rem]">
							{shortcut}
						</kbd>
					)}
				</span>
			</TooltipContent>
		</Tooltip>
	);
}
