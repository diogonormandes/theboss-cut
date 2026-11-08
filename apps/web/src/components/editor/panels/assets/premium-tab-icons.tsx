"use client";

/* ------------------------------------------------------------------ */
/*  Ícones premium da barra lateral do editor                          */
/*  Pastilha de vidro (inclinação 3D, borda, halo, reflexo) com o      */
/*  ouro metálico em gradiente. Desenhos/animações escolhidos pelo     */
/*  BOSS a partir das opções E (Ouro vivo) e F (Vidro dourado).        */
/*  O CSS fica em app/themes.css, bloco "ícones premium da barra       */
/*  lateral" (classes "tbi-").                                         */
/* ------------------------------------------------------------------ */

import { useId } from "react";
import type {
	ComponentPropsWithRef,
	CSSProperties,
	PointerEvent as ReactPointerEvent,
	ReactNode,
} from "react";
import type { Tab } from "@/components/editor/panels/assets/assets-panel-store";

type CSSVars = CSSProperties & Record<`--${string}`, string>;

/* ---------------- moldura SVG com o gradiente de ouro ---------------- */

type Estilo = "e" | "f";

function IconSvg({
	gradId,
	estilo,
	size,
	className,
	children,
}: {
	gradId: string;
	estilo: Estilo;
	size: number;
	className: string;
	children: ReactNode;
}) {
	const traco = estilo === "f";
	return (
		<svg
			className={`tbi-svg tbi-${estilo} ${className}`}
			viewBox={`0 0 ${size} ${size}`}
			fill={traco ? "none" : "currentColor"}
			stroke={traco ? "currentColor" : undefined}
			strokeWidth={traco ? 2 : undefined}
			strokeLinecap={traco ? "round" : undefined}
			strokeLinejoin={traco ? "round" : undefined}
			aria-hidden="true"
			focusable="false"
			style={{ "--tbi-ouro": `url(#${gradId})` } as CSSVars}
		>
			<defs>
				{/* ouro metálico (paradas da opção E), em coordenadas do desenho */}
				<linearGradient
					id={gradId}
					x1="0"
					y1="0"
					x2={size}
					y2={size}
					gradientUnits="userSpaceOnUse"
				>
					<stop offset="0%" style={{ stopColor: "var(--tb-gold-claro)" }} />
					<stop offset="45%" style={{ stopColor: "var(--tb-gold)" }} />
					<stop offset="60%" style={{ stopColor: "var(--tb-gold-claro)" }} />
					<stop offset="100%" style={{ stopColor: "var(--tb-gold-deep)" }} />
				</linearGradient>
			</defs>
			{children}
		</svg>
	);
}

type IconProps = { gradId: string };

/* ---------------- desenhos da E (Phosphor duotone, 256) ---------------- */

/* Mídias: pasta da E + tampa que abre e folha que sobe (animação da F) */
function IconMidias({ gradId }: IconProps) {
	return (
		<IconSvg gradId={gradId} estilo="e" size={256} className="tbi-ic-media">
			<path
				className="tbi-duo"
				d="M208,88v24H69.77a8,8,0,0,0-7.59,5.47L32,208V64a8,8,0,0,1,8-8H93.33a8,8,0,0,1,4.8,1.6L128,80h72A8,8,0,0,1,208,88Z"
			/>
			<rect className="tbi-sheet" x="72" y="84" width="112" height="22" rx="5" />
			<path d="M245,110.64A16,16,0,0,0,232,104H216V88a16,16,0,0,0-16-16H130.67L102.94,51.2a16.14,16.14,0,0,0-9.6-3.2H40A16,16,0,0,0,24,64V208a8,8,0,0,0,8,8H211.1a8,8,0,0,0,7.59-5.47l28.49-85.47A16.05,16.05,0,0,0,245,110.64ZM93.34,64,123.2,86.4A8,8,0,0,0,128,88h72v16H69.77a16,16,0,0,0-15.18,10.94L40,158.7V64Zm112,136H43.1l26.67-80H232Z" />
			<path className="tbi-lid" d="M69.77,120H232L205.33,200H43.1Z" />
		</IconSvg>
	);
}

/* Sons: fone da E + conchas pulsam e ondinhas dos lados (animação da F) */
function IconSons({ gradId }: IconProps) {
	return (
		<IconSvg gradId={gradId} estilo="e" size={256} className="tbi-ic-sounds">
			<path
				className="tbi-duo tbi-cup tbi-cup-l"
				d="M80,144v40a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V128H64A16,16,0,0,1,80,144Z"
			/>
			<path
				className="tbi-duo tbi-cup tbi-cup-r"
				d="M192,128a16,16,0,0,0-16,16v40a16,16,0,0,0,16,16h16a16,16,0,0,0,16-16V128Z"
			/>
			<path d="M201.89,54.66A104.08,104.08,0,0,0,24,128v56a24,24,0,0,0,24,24H64a24,24,0,0,0,24-24V144a24,24,0,0,0-24-24H40.36A88,88,0,0,1,128,40h.67a87.71,87.71,0,0,1,87,80H192a24,24,0,0,0-24,24v40a24,24,0,0,0,24,24h16a24,24,0,0,0,24-24V128A103.41,103.41,0,0,0,201.89,54.66ZM64,136a8,8,0,0,1,8,8v40a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V136Zm152,48a8,8,0,0,1-8,8H192a8,8,0,0,1-8-8V144a8,8,0,0,1,8-8h24Z" />
			<path className="tbi-wave tbi-wave-l" d="M10,150q-10,24 0,48" />
			<path className="tbi-wave tbi-wave-r" d="M246,150q10,24 0,48" />
		</IconSvg>
	);
}

/* Adesivos: desenho e animação da E */
function IconAdesivos({ gradId }: IconProps) {
	return (
		<IconSvg gradId={gradId} estilo="e" size={256} className="tbi-ic-stickers">
			<path className="tbi-duo" d="M216,136c-8,24-56,72-80,80V184a48,48,0,0,1,48-48Z" />
			<path d="M168,32H88A56.06,56.06,0,0,0,32,88v80a56.06,56.06,0,0,0,56,56h48a8.07,8.07,0,0,0,2.53-.41c26.23-8.75,76.31-58.83,85.06-85.06A8.07,8.07,0,0,0,224,136V88A56.06,56.06,0,0,0,168,32ZM48,168V88A40,40,0,0,1,88,48h80a40,40,0,0,1,40,40v40H184a56.06,56.06,0,0,0-56,56v24H88A40,40,0,0,1,48,168Zm96,35.14V184a40,40,0,0,1,40-40h19.14C191,163.5,163.5,191,144,203.14Z" />
		</IconSvg>
	);
}

/* Efeitos: desenho e animação da E (varinha + faíscas, faíscas no botão) */
function IconEfeitos({ gradId }: IconProps) {
	return (
		<IconSvg gradId={gradId} estilo="e" size={256} className="tbi-ic-effects">
			<path
				className="tbi-duo"
				d="M176,112,74.34,213.66a8,8,0,0,1-11.31,0L42.34,193a8,8,0,0,1,0-11.31L144,80Z"
			/>
			<path d="M248,152a8,8,0,0,1-8,8H224v16a8,8,0,0,1-16,0V160H192a8,8,0,0,1,0-16h16V128a8,8,0,0,1,16,0v16h16A8,8,0,0,1,248,152ZM56,72H72V88a8,8,0,0,0,16,0V72h16a8,8,0,0,0,0-16H88V40a8,8,0,0,0-16,0V56H56a8,8,0,0,0,0,16ZM184,192h-8v-8a8,8,0,0,0-16,0v8h-8a8,8,0,0,0,0,16h8v8a8,8,0,0,0,16,0v-8h8a8,8,0,0,0,0-16ZM219.31,80,80,219.31a16,16,0,0,1-22.62,0L36.68,198.63a16,16,0,0,1,0-22.63L176,36.69a16,16,0,0,1,22.63,0l20.68,20.68A16,16,0,0,1,219.31,80Zm-54.63,32L144,91.31l-96,96L68.68,208ZM208,68.69,187.31,48l-32,32L176,100.69Z" />
		</IconSvg>
	);
}

/* Configurações: desenho e animação da E (engrenagem de 6 dentes gira 60°) */
function IconConfiguracoes({ gradId }: IconProps) {
	return (
		<IconSvg gradId={gradId} estilo="e" size={256} className="tbi-ic-settings">
			<path
				className="tbi-duo"
				d="M230.1,108.76,198.25,90.62c-.64-1.16-1.31-2.29-2-3.41l-.12-36A104.61,104.61,0,0,0,162,32L130,49.89c-1.34,0-2.69,0-4,0L94,32A104.58,104.58,0,0,0,59.89,51.25l-.16,36c-.7,1.12-1.37,2.26-2,3.41l-31.84,18.1a99.15,99.15,0,0,0,0,38.46l31.85,18.14c.64,1.16,1.31,2.29,2,3.41l.12,36A104.61,104.61,0,0,0,94,224l32-17.87c1.34,0,2.69,0,4,0L162,224a104.58,104.58,0,0,0,34.08-19.25l.16-36c.7-1.12,1.37-2.26,2-3.41l31.84-18.1A99.15,99.15,0,0,0,230.1,108.76ZM128,168a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z"
			/>
			<path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm109.94-52.79a8,8,0,0,0-3.89-5.4l-29.83-17-.12-33.62a8,8,0,0,0-2.83-6.08,111.91,111.91,0,0,0-36.72-20.67,8,8,0,0,0-6.46.59L128,41.85,97.88,25a8,8,0,0,0-6.47-.6A111.92,111.92,0,0,0,54.73,45.15a8,8,0,0,0-2.83,6.07l-.15,33.65-29.83,17a8,8,0,0,0-3.89,5.4,106.47,106.47,0,0,0,0,41.56,8,8,0,0,0,3.89,5.4l29.83,17,.12,33.63a8,8,0,0,0,2.83,6.08,111.91,111.91,0,0,0,36.72,20.67,8,8,0,0,0,6.46-.59L128,214.15,158.12,231a7.91,7.91,0,0,0,3.9,1,8.09,8.09,0,0,0,2.57-.42,112.1,112.1,0,0,0,36.68-20.73,8,8,0,0,0,2.83-6.07l.15-33.65,29.83-17a8,8,0,0,0,3.89-5.4A106.47,106.47,0,0,0,237.94,107.21Zm-15,34.91-28.57,16.25a8,8,0,0,0-3,3c-.58,1-1.19,2.06-1.81,3.06a7.94,7.94,0,0,0-1.22,4.21l-.15,32.25a95.89,95.89,0,0,1-25.37,14.3L134,199.13a8,8,0,0,0-3.91-1h-.19c-1.21,0-2.43,0-3.64,0a8.1,8.1,0,0,0-4.1,1l-28.84,16.1A96,96,0,0,1,67.88,201l-.11-32.2a8,8,0,0,0-1.22-4.22c-.62-1-1.23-2-1.8-3.06a8.09,8.09,0,0,0-3-3.06l-28.6-16.29a90.49,90.49,0,0,1,0-28.26L61.67,97.63a8,8,0,0,0,3-3c.58-1,1.19-2.06,1.81-3.06a7.94,7.94,0,0,0,1.22-4.21l.15-32.25a95.89,95.89,0,0,1,25.37-14.3L122,56.87a8,8,0,0,0,4.1,1c1.21,0,2.43,0,3.64,0a8,8,0,0,0,4.1-1l28.84-16.1A96,96,0,0,1,188.12,55l.11,32.2a8,8,0,0,0,1.22,4.22c.62,1,1.23,2,1.8,3.06a8.09,8.09,0,0,0,3,3.06l28.6,16.29A90.49,90.49,0,0,1,222.9,142.12Z" />
		</IconSvg>
	);
}

/* ---------------- desenhos da F (traço próprio, 24) ---------------- */

/* Texto: desenho e animação da F (o T dá um pulinho) */
function IconTexto({ gradId }: IconProps) {
	return (
		<IconSvg gradId={gradId} estilo="f" size={24} className="tbi-ic-text">
			<g className="tbi-t">
				<path d="M5 7V5h14v2" />
				<path d="M12 5v14" />
				<path d="M9.5 19h5" />
			</g>
		</IconSvg>
	);
}

/* Transições: desenho e animação da F (setas avançam até a barra) */
function IconTransicoes({ gradId }: IconProps) {
	return (
		<IconSvg gradId={gradId} estilo="f" size={24} className="tbi-ic-transitions">
			<path className="tbi-chev tbi-chev-1" d="M5 7l5 5-5 5" />
			<path className="tbi-chev tbi-chev-2" d="M11.5 7l5 5-5 5" />
			<path d="M20 6.5v11" />
		</IconSvg>
	);
}

/* Legendas: desenho e animação da F (CC liga como TV antiga) */
function IconLegendas({ gradId }: IconProps) {
	return (
		<IconSvg gradId={gradId} estilo="f" size={24} className="tbi-ic-captions">
			<rect x="2.8" y="5" width="18.4" height="14" rx="3" />
			<g className="tbi-screen">
				<path d="M10.4 10.2a2.1 2.1 0 1 0 0 3.6" />
				<path d="M16.4 10.2a2.1 2.1 0 1 0 0 3.6" />
			</g>
		</IconSvg>
	);
}

/* Ajustes: desenho e animação da F (botões deslizam nos trilhos) */
function IconAjustes({ gradId }: IconProps) {
	return (
		<IconSvg gradId={gradId} estilo="f" size={24} className="tbi-ic-adjustment">
			<path
				className="tbi-rail"
				d="M3.5 6h17M3.5 12h17M3.5 18h17"
				strokeWidth={1.7}
			/>
			<circle
				className="tbi-knob tbi-knob-1"
				cx="8"
				cy="6"
				r="2.3"
				fill="currentColor"
				stroke="none"
				style={{ "--tbi-dx": "7px" } as CSSVars}
			/>
			<circle
				className="tbi-knob tbi-knob-2"
				cx="15.5"
				cy="12"
				r="2.3"
				fill="currentColor"
				stroke="none"
				style={{ "--tbi-dx": "-7px" } as CSSVars}
			/>
			<circle
				className="tbi-knob tbi-knob-3"
				cx="10"
				cy="18"
				r="2.3"
				fill="currentColor"
				stroke="none"
				style={{ "--tbi-dx": "5px" } as CSSVars}
			/>
		</IconSvg>
	);
}

/* Cortes (F): tesoura com estrelinha; as lâminas fecham e a estrela brilha */
function IconCortes({ gradId }: IconProps) {
	return (
		<IconSvg gradId={gradId} estilo="f" size={24} className="tbi-ic-cuts">
			<g className="tbi-blade tbi-blade-a">
				<circle cx="6" cy="6" r="2.8" />
				<path d="M8.1 8.1 20 20" />
			</g>
			<g className="tbi-blade tbi-blade-b">
				<circle cx="6" cy="18" r="2.8" />
				<path d="M8.1 15.9 20 4" />
			</g>
			<path
				className="tbi-spark"
				d="M20.6 9.4l.62 1.48 1.48.62-1.48.62-.62 1.48-.62-1.48-1.48-.62 1.48-.62z"
				fill="currentColor"
				stroke="none"
			/>
		</IconSvg>
	);
}

const ICONES: Record<Tab, (p: IconProps) => ReactNode> = {
	media: IconMidias,
	cuts: IconCortes,
	sounds: IconSons,
	text: IconTexto,
	stickers: IconAdesivos,
	effects: IconEfeitos,
	transitions: IconTransicoes,
	captions: IconLegendas,
	adjustment: IconAjustes,
	settings: IconConfiguracoes,
};

/* ---------------- inclinação 3D barata (só CSS vars) ---------------- */

let reduzMovimento: MediaQueryList | null = null;
function prefereMenosMovimento(): boolean {
	if (typeof window === "undefined") return true;
	reduzMovimento ??= window.matchMedia("(prefers-reduced-motion: reduce)");
	return reduzMovimento.matches;
}

function inclinar(e: ReactPointerEvent<HTMLButtonElement>) {
	if (e.pointerType !== "mouse" || prefereMenosMovimento()) return;
	const el = e.currentTarget;
	const r = el.getBoundingClientRect();
	const nx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
	const ny = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
	el.style.setProperty("--tbi-ry", `${(nx * 12).toFixed(1)}deg`);
	el.style.setProperty("--tbi-rx", `${(-ny * 12).toFixed(1)}deg`);
}

function endireitar(e: ReactPointerEvent<HTMLButtonElement>) {
	e.currentTarget.style.removeProperty("--tbi-ry");
	e.currentTarget.style.removeProperty("--tbi-rx");
}

/* ---------------- botão da aba ---------------- */

type PremiumTabButtonProps = Omit<ComponentPropsWithRef<"button">, "children"> & {
	tabKey: Tab;
	active: boolean;
};

/**
 * Botão de aba da barra lateral: pastilha de vidro + ícone em ouro.
 * Repassa ref e props (o TooltipTrigger com asChild injeta as dele).
 */
export function PremiumTabButton({
	tabKey,
	active,
	className,
	onPointerMove,
	onPointerLeave,
	type,
	...rest
}: PremiumTabButtonProps) {
	const gradId = `tbi-ouro-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
	const Icone = ICONES[tabKey];

	return (
		<button
			{...rest}
			type={type ?? "button"}
			aria-pressed={active}
			className={className ? `tbi-btn ${className}` : "tbi-btn"}
			onPointerMove={(e) => {
				onPointerMove?.(e);
				inclinar(e);
			}}
			onPointerLeave={(e) => {
				onPointerLeave?.(e);
				endireitar(e);
			}}
		>
			<span className="tbi-stage" aria-hidden="true">
				<span className="tbi-pill">
					<span className="tbi-sheen" />
					<Icone gradId={gradId} />
					{tabKey === "effects" && (
						<>
							<span className="tbi-faisca tbi-f1" />
							<span className="tbi-faisca tbi-f2" />
							<span className="tbi-faisca tbi-f3" />
						</>
					)}
				</span>
			</span>
		</button>
	);
}
