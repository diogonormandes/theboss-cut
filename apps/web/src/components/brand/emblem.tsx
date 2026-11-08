"use client";

// Emblema do THEBOSSVERSE: o tridente de ouro com aura girando em loop (o mesmo do site).
// O programa usa o Chromium, que toca o vídeo com fundo transparente de verdade.
// Para quem pede menos movimento no Windows, mostra a imagem parada (também transparente).

import { useEffect, useState } from "react";

const BASE = "/emblem/emblema-160";

export function Emblem({
	size = 28,
	className,
}: {
	size?: number;
	className?: string;
}) {
	const [still, setStill] = useState(false);

	useEffect(() => {
		setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
	}, []);

	return (
		<span
			className={className ? `tb-emblem ${className}` : "tb-emblem"}
			style={{ width: size, height: size }}
			aria-hidden="true"
		>
			{still ? (
				<img src={`${BASE}-alpha.webp`} alt="" />
			) : (
				<video
					src={`${BASE}.webm`}
					poster={`${BASE}-alpha.webp`}
					autoPlay
					muted
					loop
					playsInline
					preload="auto"
				/>
			)}
		</span>
	);
}

/** Nome da marca como logotipo: THE em marfim, BOSS em ouro (igual ao THEBOSSVERSE). */
export function Wordmark({ className }: { className?: string }) {
	return (
		<span
			className={className ? `tb-wordmark ${className}` : "tb-wordmark"}
			aria-label="THEBOSS CUT"
		>
			<span className="wm-the" aria-hidden="true">
				THE
			</span>
			<span className="wm-boss" aria-hidden="true">
				BOSS
			</span>
			<span className="wm-the" aria-hidden="true">
				&nbsp;CUT
			</span>
		</span>
	);
}
