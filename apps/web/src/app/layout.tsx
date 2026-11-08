import { ThemeProvider } from "next-themes";
import Script from "next/script";
import "./globals.css";
import "./themes.css";
import { Toaster } from "../components/ui/sonner";
import { TooltipProvider } from "../components/ui/tooltip";
import { baseMetaData } from "./metadata";
import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google";
import { THEME_BOOT_SCRIPT } from "@/theme/boot";
import { cookies } from "next/headers";
import { LOCALE_STORAGE_KEY, LOCALE_TAGS, parseLocale } from "@/i18n/locales";
import { LocaleProvider } from "@/i18n/provider";
import { UpdateNotice } from "@/components/update-notice";

// As mesmas fontes do THEBOSSVERSE: Geist no texto e Cormorant Garamond nos títulos e na marca.
const sans = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const display = Cormorant_Garamond({
	subsets: ["latin"],
	variable: "--font-cormorant",
});

export const metadata = baseMetaData;

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const locale = parseLocale(
		(await cookies()).get(LOCALE_STORAGE_KEY)?.value,
	);

	return (
		<html
			lang={LOCALE_TAGS[locale]}
			className={`dark ${sans.variable} ${mono.variable} ${display.variable}`}
			suppressHydrationWarning
		>
			<head>
				{/* aplica o tema escolhido antes de desenhar a tela (sem piscar a cor antiga) */}
				<script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
				{process.env.NODE_ENV === "development" && (
					<>
						<Script
							src="//unpkg.com/react-scan/dist/auto.global.js"
							crossOrigin="anonymous"
							strategy="beforeInteractive"
						/>
					</>
				)}
			</head>
			<body className="font-sans antialiased">
				<ThemeProvider
					attribute="class"
					defaultTheme="dark"
					forcedTheme="dark"
					disableTransitionOnChange={true}
				>
					<LocaleProvider locale={locale}>
						<TooltipProvider>
							<Toaster />
							{children}
							<UpdateNotice />
						</TooltipProvider>
					</LocaleProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
