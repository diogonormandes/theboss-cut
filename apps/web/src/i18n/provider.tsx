"use client";

import { useEffect } from "react";
import { notifyLocaleListeners, syncLocale, type Locale } from "./index";

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
	// durante o desenho só guarda o idioma; quem precisa redesenhar é avisado logo depois
	syncLocale(locale, { notify: false });
	useEffect(() => {
		notifyLocaleListeners();
	}, [locale]);
	return <>{children}</>;
}
