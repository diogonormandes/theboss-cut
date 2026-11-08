"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/ui";
import {
	changeLocale,
	LOCALE_NATIVE_NAMES,
	LOCALES,
	type Locale,
	parseLocale,
	useLocale,
	useT,
} from "../index";
import { Flag } from "./flag";

type BeforeChange = () => Promise<unknown> | void;

function useChangeLocale(beforeChange?: BeforeChange) {
	const [isChanging, setIsChanging] = useState(false);
	const current = useLocale();

	const select = async (value: string) => {
		const locale: Locale = parseLocale(value);
		if (locale === current || isChanging) return;
		setIsChanging(true);
		try {
			await beforeChange?.();
		} catch (error) {
			console.error("Failed to save before changing language:", error);
		}
		changeLocale(locale);
	};

	return { current, isChanging, select };
}

function LocaleOptions({
	current,
	onSelect,
	disabled,
}: {
	current: Locale;
	onSelect: (value: string) => void;
	disabled: boolean;
}) {
	return (
		<DropdownMenuRadioGroup value={current} onValueChange={onSelect}>
			{LOCALES.map((locale, index) => (
				<DropdownMenuRadioItem
					key={locale}
					value={locale}
					disabled={disabled}
					className="tb-lang-item gap-2.5"
				>
					<Flag locale={locale} size={22} delay={0.12 * index} />
					<span>{LOCALE_NATIVE_NAMES[locale]}</span>
					<span className="tb-lang-code">{locale}</span>
				</DropdownMenuRadioItem>
			))}
		</DropdownMenuRadioGroup>
	);
}

/** Item "Idioma" com submenu, para usar dentro de um menu que já existe. */
export function LanguageSubmenu({
	beforeChange,
}: {
	beforeChange?: BeforeChange;
}) {
	const t = useT();
	const { current, isChanging, select } = useChangeLocale(beforeChange);

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger className="tb-lang-btn gap-2">
				<Flag locale={current} size={18} />
				{isChanging ? t("language.reloading") : t("language.title")}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="z-100">
				<LocaleOptions
					current={current}
					onSelect={select}
					disabled={isChanging}
				/>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

/** Botão com o globo e o idioma atual, para cabeçalhos. */
export function LanguageButton({ className }: { className?: string }) {
	const t = useT();
	const { current, isChanging, select } = useChangeLocale();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className={cn("tb-lang-btn gap-2", className)}
					aria-label={t("language.choose")}
					title={t("language.choose")}
				>
					<Flag locale={current} size={22} />
					<span className="text-xs font-semibold tracking-wider uppercase">
						{current}
					</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="z-100 w-48">
				<DropdownMenuLabel>
					{isChanging ? t("language.reloading") : t("language.title")}
				</DropdownMenuLabel>
				<LocaleOptions
					current={current}
					onSelect={select}
					disabled={isChanging}
				/>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
