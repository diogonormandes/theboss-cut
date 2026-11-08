// Bandeiras dos idiomas (PT = Brasil, EN = Estados Unidos, ES = Espanha), iguais às do THEBOSSVERSE.
// Desenhadas aqui (emoji de bandeira não aparece no Windows). Um reflexo de luz passa por cima
// de tempos em tempos e na hora de passar o mouse. Quem prefere menos movimento vê a bandeira parada.

import type { CSSProperties } from "react";
import type { Locale } from "../locales";

function FlagDrawing({ locale }: { locale: Locale }) {
	if (locale === "pt")
		return (
			<>
				<rect width="30" height="20" fill="#009b3a" />
				<path d="M15 2.6 27 10 15 17.4 3 10z" fill="#fedf00" />
				<circle cx="15" cy="10" r="4.6" fill="#002776" />
				<path
					d="M10.6 9.1c2.9-.7 6.2-.3 8.8 1.3"
					stroke="#fff"
					strokeWidth="1"
					fill="none"
				/>
				<g fill="#fff">
					<circle cx="13.2" cy="11.6" r=".35" />
					<circle cx="15.4" cy="12.4" r=".35" />
					<circle cx="17" cy="11.5" r=".35" />
					<circle cx="14.4" cy="13.4" r=".3" />
				</g>
			</>
		);
	if (locale === "en")
		return (
			<>
				<rect width="30" height="20" fill="#fff" />
				{[0, 2, 4, 6, 8, 10, 12].map((i) => (
					<rect
						key={i}
						y={(i * 20) / 13}
						width="30"
						height={20 / 13}
						fill="#b22234"
					/>
				))}
				<rect width="13" height={(20 / 13) * 7} fill="#3c3b6e" />
				<g fill="#fff">
					{[0, 1, 2, 3].map((row) =>
						[0, 1, 2, 3, 4].map((col) => (
							<circle
								key={`${row}-${col}`}
								cx={1.6 + col * 2.45 + (row % 2) * 1.2}
								cy={1.5 + row * 2.5}
								r=".45"
							/>
						)),
					)}
				</g>
			</>
		);
	return (
		<>
			<rect width="30" height="20" fill="#aa151b" />
			<rect y="5" width="30" height="10" fill="#f1bf00" />
			<g transform="translate(7.2 7)">
				<rect width="3.6" height="4.4" rx=".9" fill="#aa151b" opacity=".85" />
				<rect x="-.9" y="-.2" width=".6" height="4.6" fill="#c8b100" />
				<rect x="3.9" y="-.2" width=".6" height="4.6" fill="#c8b100" />
			</g>
		</>
	);
}

export function Flag({
	locale,
	size = 22,
	delay = 0,
	className,
}: {
	locale: Locale;
	size?: number;
	/** atraso do reflexo (s), para as bandeiras de uma lista não brilharem juntas */
	delay?: number;
	className?: string;
}) {
	return (
		<span
			className={className ? `tb-bd ${className}` : "tb-bd"}
			style={
				{
					width: size,
					height: Math.round(size * (2 / 3)),
					"--bd-atraso": `${delay}s`,
				} as CSSProperties
			}
			aria-hidden="true"
		>
			<svg viewBox="0 0 30 20" preserveAspectRatio="xMidYMid slice">
				<FlagDrawing locale={locale} />
			</svg>
			<span className="tb-bd-reflexo" />
		</span>
	);
}
