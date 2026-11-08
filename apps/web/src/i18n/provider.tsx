"use client";

import { syncLocale, type Locale } from "./index";

/**
 * Coloca o idioma lido do cookie (pelo servidor) antes de qualquer texto aparecer,
 * para o servidor e a janela mostrarem o mesmo idioma.
 */
export function LocaleProvider({
	locale,
	children,
}: {
	locale: Locale;
	children: React.ReactNode;
}) {
	syncLocale(locale);
	return <>{children}</>;
}
