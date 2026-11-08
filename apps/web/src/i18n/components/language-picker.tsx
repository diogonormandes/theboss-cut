"use client";

import { Globe02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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

type BeforeChange = () => Promise<void> | void;

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
			{LOCALES.map((locale) => (
				<DropdownMenuRadioItem key={locale} value={locale} disabled={disabled}>
					{LOCALE_NATIVE_NAMES[locale]}
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
			<DropdownMenuSubTrigger>
				<HugeiconsIcon icon={Globe02Icon} className="size-4" />
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
					className={cn("gap-1.5", className)}
					aria-label={t("language.choose")}
					title={t("language.choose")}
				>
					<HugeiconsIcon icon={Globe02Icon} className="size-4" />
					<span className="uppercase">{current}</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="z-100 w-40">
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
