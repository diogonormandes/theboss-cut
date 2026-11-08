"use client";

// Tour de boas-vindas (primeira vez no editor): escolhe o idioma e mostra, com um destaque na tela,
// as partes principais do editor. Dá para ver de novo pelo menu do tridente ("Ver o tour de novo").

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { Button } from "@/components/ui/button";
import { Flag } from "@/i18n/components/flag";
import {
	changeLocale,
	LOCALE_NATIVE_NAMES,
	LOCALES,
	t,
	type TKey,
	useLocale,
} from "@/i18n";
import { cn } from "@/utils/ui";
import { Emblem } from "../brand/emblem";

const SEEN_KEY = "thebosscut-tour-visto";
export const OPEN_TOUR_EVENT = "thebosscut-abrir-tour";

type TourStep = {
	target: string;
	title: TKey;
	text: TKey;
	/** antes de mostrar o passo (ex.: abrir a aba Legendas) */
	prepare?: () => void;
};

const STEPS: TourStep[] = [
	{
		target: '[data-tour="assets"]',
		title: "tour.assetsTitle",
		text: "tour.assetsText",
		prepare: () => useAssetsPanelStore.getState().setActiveTab("media"),
	},
	{
		target: '[data-tour="tab-captions"]',
		title: "tour.captionsTitle",
		text: "tour.captionsText",
		prepare: () => useAssetsPanelStore.getState().setActiveTab("captions"),
	},
	{ target: '[data-tour="preview"]', title: "tour.previewTitle", text: "tour.previewText" },
	{ target: '[data-tour="timeline"]', title: "tour.timelineTitle", text: "tour.timelineText" },
	{ target: '[data-tour="export"]', title: "tour.exportTitle", text: "tour.exportText" },
	{ target: '[data-tour="logo-menu"]', title: "tour.menuTitle", text: "tour.menuText" },
];

/** Abre o tour de novo (botão no menu do tridente). */
export function openGuidedTour(): void {
	window.dispatchEvent(new Event(OPEN_TOUR_EVENT));
}

function readSeen(): boolean {
	try {
		return localStorage.getItem(SEEN_KEY) === "1";
	} catch {
		return true;
	}
}

function markSeen(): void {
	try {
		localStorage.setItem(SEEN_KEY, "1");
	} catch {
		// sem problema: o tour só aparece de novo
	}
}

type Rect = { top: number; left: number; width: number; height: number };

const CARD_WIDTH = 320;
const GAP = 14;
const PAD = 6;

function placeCard(rect: Rect): { top: number; left: number } {
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const cardHeight = 210;
	const clampLeft = (x: number) => Math.min(Math.max(12, x), vw - CARD_WIDTH - 12);
	const clampTop = (y: number) => Math.min(Math.max(12, y), vh - cardHeight - 12);
	// à direita, à esquerda, embaixo ou em cima do destaque (onde couber)
	if (rect.left + rect.width + GAP + CARD_WIDTH < vw) {
		return { left: rect.left + rect.width + GAP, top: clampTop(rect.top) };
	}
	if (rect.left - GAP - CARD_WIDTH > 0) {
		return { left: rect.left - GAP - CARD_WIDTH, top: clampTop(rect.top) };
	}
	if (rect.top + rect.height + GAP + cardHeight < vh) {
		return { left: clampLeft(rect.left), top: rect.top + rect.height + GAP };
	}
	return { left: clampLeft(rect.left), top: clampTop(rect.top - GAP - cardHeight) };
}

export function GuidedTour() {
	// -1 = boas-vindas; 0..n = passos com destaque
	const [step, setStep] = useState<number | null>(null);
	const [rect, setRect] = useState<Rect | null>(null);
	const locale = useLocale();

	useEffect(() => {
		if (!readSeen()) setStep(-1);
		const open = () => setStep(-1);
		window.addEventListener(OPEN_TOUR_EVENT, open);
		return () => window.removeEventListener(OPEN_TOUR_EVENT, open);
	}, []);

	const close = useCallback(() => {
		markSeen();
		setStep(null);
		setRect(null);
	}, []);

	const current = step !== null && step >= 0 ? STEPS[step] : null;

	// mede onde está a parte da tela deste passo (e acompanha se a janela mudar de tamanho)
	useLayoutEffect(() => {
		if (!current) return;
		current.prepare?.();
		let frame = 0;
		const measure = () => {
			const element = document.querySelector(current.target);
			if (!element) {
				setRect(null);
				return;
			}
			const box = element.getBoundingClientRect();
			setRect({
				top: box.top - PAD,
				left: box.left - PAD,
				width: box.width + PAD * 2,
				height: box.height + PAD * 2,
			});
		};
		frame = requestAnimationFrame(measure);
		window.addEventListener("resize", measure);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("resize", measure);
		};
	}, [current]);

	const next = useCallback(() => {
		setStep((value) => {
			if (value === null) return value;
			if (value + 1 >= STEPS.length) {
				markSeen();
				return null;
			}
			return value + 1;
		});
	}, []);

	useEffect(() => {
		if (step === null) return;
		const onKey = (event: KeyboardEvent) => {
			// enquanto o tour está aberto, as teclas são só dele (não mexem no vídeo por trás)
			if (["Escape", "ArrowRight", "ArrowLeft", " "].includes(event.key)) {
				event.stopImmediatePropagation();
			}
			if (event.key === "Escape") {
				event.preventDefault();
				close();
			} else if (event.key === "ArrowRight" && step >= 0) {
				event.preventDefault();
				next();
			} else if (event.key === "ArrowLeft" && step > 0) {
				event.preventDefault();
				setStep(step - 1);
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [step, close, next]);

	if (step === null || typeof document === "undefined") return null;

	if (step === -1) {
		return createPortal(
			<div className="tb-tour-backdrop" role="dialog" aria-modal="true" aria-labelledby="tb-tour-title">
				<div className="tb-tour-card is-welcome">
					<div className="flex items-center gap-3">
						<Emblem size={48} />
						<h2 id="tb-tour-title" className="font-display text-2xl font-semibold tracking-wide">
							{t("tour.welcomeTitle")}
						</h2>
					</div>
					<p className="text-muted-foreground text-sm">{t("tour.welcomeText")}</p>
					<div className="flex flex-col gap-2">
						<span className="text-xs font-medium">{t("tour.chooseLanguage")}</span>
						<div className="grid grid-cols-3 gap-2">
							{LOCALES.map((code, index) => (
								<button
									key={code}
									type="button"
									onClick={() => code !== locale && changeLocale(code)}
									className={cn("tb-tour-lang tb-lang-item", code === locale && "is-on")}
									data-state={code === locale ? "checked" : undefined}
									aria-pressed={code === locale}
								>
									<Flag locale={code} size={26} delay={0.12 * index} />
									<span className="text-xs">{LOCALE_NATIVE_NAMES[code]}</span>
								</button>
							))}
						</div>
					</div>
					<div className="flex items-center justify-between gap-2 pt-1">
						<Button variant="ghost" onClick={close}>
							{t("tour.skip")}
						</Button>
						<Button className="btn-boss px-5" onClick={() => setStep(0)} autoFocus>
							{t("tour.startTour")}
						</Button>
					</div>
				</div>
			</div>,
			document.body,
		);
	}

	const position = rect ? placeCard(rect) : { top: 80, left: 80 };
	const isLast = step === STEPS.length - 1;

	return createPortal(
		<div className="tb-tour-layer" role="dialog" aria-modal="true" aria-labelledby="tb-tour-step-title">
			{rect ? (
				<div
					className="tb-tour-spot"
					style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
				/>
			) : (
				<div className="tb-tour-backdrop" />
			)}
			<div className="tb-tour-card" style={{ top: position.top, left: position.left, width: CARD_WIDTH }}>
				<span className="text-primary text-xs font-semibold tracking-wide">
					{t("tour.stepOf", { current: step + 1, total: STEPS.length })}
				</span>
				<h3 id="tb-tour-step-title" className="font-display text-xl font-semibold tracking-wide">
					{current ? t(current.title) : ""}
				</h3>
				<p className="text-muted-foreground text-sm leading-relaxed">
					{current ? t(current.text) : ""}
				</p>
				<div className="tb-tour-dots" aria-hidden="true">
					{STEPS.map((item, index) => (
						<i key={item.target} className={cn(index === step && "is-on")} />
					))}
				</div>
				<div className="flex items-center justify-between gap-2">
					<Button variant="ghost" size="sm" onClick={close}>
						{t("tour.skip")}
					</Button>
					<div className="flex items-center gap-2">
						{step > 0 && (
							<Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
								{t("tour.back")}
							</Button>
						)}
						<Button size="sm" className="btn-boss px-4" onClick={isLast ? close : next} autoFocus>
							{isLast ? t("tour.finish") : t("tour.next")}
						</Button>
					</div>
				</div>
			</div>
		</div>,
		document.body,
	);
}
