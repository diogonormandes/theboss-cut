"use client";

/**
 * Escolha do enquadramento 9:16 dos cortes: Centralizado, Dividido (câmera em
 * cima, jogo embaixo) ou Seguir rosto. Cada opção tem uma mini-ilustração.
 * Quem usa liga o valor em `applyFraming` (services/face-tracking).
 */
import { t } from "@/i18n";
import type { FramingMode } from "@/services/face-tracking/apply-framing";

export type { FramingMode };

const OPTIONS: {
	mode: FramingMode;
	label: () => string;
	hint: () => string;
}[] = [
	{
		mode: "centered",
		label: () => t("framing.centered"),
		hint: () => t("framing.centeredHint"),
	},
	{
		mode: "split",
		label: () => t("framing.split"),
		hint: () => t("framing.splitHint"),
	},
	{
		mode: "follow",
		label: () => t("framing.follow"),
		hint: () => t("framing.followHint"),
	},
];

export function FramingChooser({
	value,
	onChange,
	disabled = false,
}: {
	value: FramingMode;
	onChange: (mode: FramingMode) => void;
	disabled?: boolean;
}) {
	return (
		<fieldset className="flex flex-col gap-2" disabled={disabled}>
			<legend
				className="mb-1 text-[11px] font-semibold tracking-[0.14em] uppercase"
				style={{ color: "var(--tb-gold-claro)" }}
			>
				{t("framing.title")}
			</legend>
			<div role="radiogroup" className="grid grid-cols-3 gap-2">
				{OPTIONS.map((option) => {
					const selected = option.mode === value;
					return (
						<button
							key={option.mode}
							type="button"
							role="radio"
							aria-checked={selected}
							title={option.hint()}
							onClick={() => onChange(option.mode)}
							className="flex cursor-pointer flex-col items-center gap-1.5 rounded-sm border px-1.5 py-2 text-center transition-[border-color,background-color] disabled:cursor-not-allowed disabled:opacity-50"
							style={{
								borderColor: selected ? "var(--tb-gold)" : "var(--tb-border)",
								background: selected
									? "rgba(var(--tb-gold-rgb), 0.10)"
									: "var(--tb-surface-2)",
								color: "var(--tb-text)",
							}}
						>
							<FramingIllustration mode={option.mode} active={selected} />
							<span className="text-xs font-semibold leading-tight">
								{option.label()}
							</span>
							<span
								className="text-[10.5px] leading-snug"
								style={{ color: "var(--tb-text-muted)" }}
							>
								{option.hint()}
							</span>
						</button>
					);
				})}
			</div>
		</fieldset>
	);
}

/** Mini tela 9:16 desenhada com as cores do tema. */
function FramingIllustration({
	mode,
	active,
}: {
	mode: FramingMode;
	active: boolean;
}) {
	const stroke = active ? "var(--tb-gold)" : "var(--tb-border-strong)";
	const fill = "var(--tb-surface)";
	const accent = active ? "var(--tb-gold-claro)" : "var(--tb-text-muted)";
	return (
		<svg
			width="36"
			height="64"
			viewBox="0 0 36 64"
			aria-hidden="true"
			className="shrink-0"
		>
			<rect
				x="1"
				y="1"
				width="34"
				height="62"
				rx="3"
				fill={fill}
				stroke={stroke}
				strokeWidth="1.5"
			/>
			{mode === "centered" && (
				<>
					{/* quadro largo no meio */}
					<rect
						x="3"
						y="22"
						width="30"
						height="20"
						rx="1.5"
						fill={accent}
						opacity="0.35"
					/>
					<circle cx="18" cy="32" r="4" fill={accent} />
				</>
			)}
			{mode === "split" && (
				<>
					{/* câmera em cima */}
					<rect
						x="3"
						y="3"
						width="30"
						height="28"
						rx="1.5"
						fill={accent}
						opacity="0.25"
					/>
					<circle cx="18" cy="14" r="5" fill={accent} />
					<path d="M10 28 q8 -9 16 0" fill={accent} />
					<line
						x1="2"
						y1="32"
						x2="34"
						y2="32"
						stroke={stroke}
						strokeWidth="1"
					/>
					{/* jogo embaixo */}
					<rect
						x="3"
						y="33"
						width="30"
						height="28"
						rx="1.5"
						fill={accent}
						opacity="0.12"
					/>
					<path d="M6 55 l7 -9 l5 6 l4 -4 l8 7 z" fill={accent} opacity="0.6" />
				</>
			)}
			{mode === "follow" && (
				<>
					<circle cx="18" cy="26" r="7" fill={accent} />
					<path d="M7 50 q11 -16 22 0" fill={accent} />
					{/* setas: acompanha para os lados */}
					<path d="M4 26 l3 -3 v6 z M32 26 l-3 -3 v6 z" fill={stroke} />
				</>
			)}
		</svg>
	);
}
