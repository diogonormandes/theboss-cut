/**
 * Contas puras do enquadramento 9:16 (sem editor, sem navegador).
 *
 * Convenções:
 * - Caixas e centros "normalizados" vão de 0 a 1 na largura/altura do quadro.
 * - Posição do elemento é em pixels do canvas, a partir do centro (y cresce
 *   para baixo), como em `rendering/index.ts`.
 * - O vídeo é colocado com "contain" (`containScale = min(cW/sW, cH/sH)`) e
 *   depois multiplicado por `scale` (ver `frame-descriptor.ts`).
 */

export interface Size {
	width: number;
	height: number;
}

/** Caixa normalizada: centro (cx, cy) e tamanho (w, h), tudo de 0 a 1. */
export interface NormBox {
	cx: number;
	cy: number;
	w: number;
	h: number;
}

export interface ElementPlacement {
	scale: number;
	positionX: number;
	positionY: number;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1
		? sorted[mid]
		: (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Caixa média da facecam a partir de várias detecções (uma por quadro).
 * Usa a mediana de cada coordenada e descarta as que estão longe dela (outro
 * rosto no jogo, falso positivo); depois tira a média das que sobraram.
 * `null` sem detecções.
 */
export function averageBox(boxes: NormBox[]): NormBox | null {
	if (boxes.length === 0) return null;
	const mcx = median(boxes.map((b) => b.cx));
	const mcy = median(boxes.map((b) => b.cy));
	const mw = median(boxes.map((b) => b.w));
	const near = boxes.filter(
		(b) => Math.abs(b.cx - mcx) <= mw && Math.abs(b.cy - mcy) <= mw * 2,
	);
	const use = near.length > 0 ? near : boxes;
	const mean = (pick: (b: NormBox) => number) =>
		use.reduce((sum, b) => sum + pick(b), 0) / use.length;
	return {
		cx: mean((b) => b.cx),
		cy: mean((b) => b.cy),
		w: mean((b) => b.w),
		h: mean((b) => b.h),
	};
}

/** Escala de "contain" usada pelo compositor. */
export function containScale(canvas: Size, source: Size): number {
	return Math.min(canvas.width / source.width, canvas.height / source.height);
}

/**
 * "Seguir rosto": escala que faz o vídeo cobrir o canvas inteiro e a
 * largura W do vídeo já escalado.
 */
export function coverPlacement(
	canvas: Size,
	source: Size,
): { scale: number; renderedWidth: number; renderedHeight: number } {
	const c = containScale(canvas, source);
	const scale = Math.max(
		canvas.width / (source.width * c),
		canvas.height / (source.height * c),
	);
	return {
		scale,
		renderedWidth: source.width * c * scale,
		renderedHeight: source.height * c * scale,
	};
}

/**
 * positionX = (0,5 − fx)·W, limitado a ±(W − largura do canvas)/2 para o
 * vídeo nunca deixar borda vazia.
 */
export function followPositionX({
	fx,
	renderedWidth,
	canvasWidth,
}: {
	fx: number;
	renderedWidth: number;
	canvasWidth: number;
}): number {
	const limit = Math.max(0, (renderedWidth - canvasWidth) / 2);
	const value = clamp((0.5 - fx) * renderedWidth, -limit, limit);
	// evita "-0" nos keyframes
	return value === 0 ? 0 : value;
}

/**
 * Região da câmera a partir da caixa do rosto: mais larga que o rosto (pega
 * o enquadramento da facecam) e com o formato da metade de cima do canvas.
 * Tudo em fração do quadro; fica dentro do quadro.
 */
export function camRegionFromFace({
	face,
	source,
	targetAspect,
	widthFactor = 2.4,
}: {
	face: NormBox;
	source: Size;
	/** largura / altura da área de destino (ex.: 1080 / 960). */
	targetAspect: number;
	widthFactor?: number;
}): NormBox {
	let wPx = face.w * source.width * widthFactor;
	let hPx = wPx / targetAspect;
	if (hPx > source.height) {
		hPx = source.height;
		wPx = hPx * targetAspect;
	}
	if (wPx > source.width) {
		wPx = source.width;
		hPx = wPx / targetAspect;
	}
	const w = wPx / source.width;
	const h = hPx / source.height;
	// rosto um pouco acima do centro da região (fica mais natural)
	const cx = clamp(face.cx, w / 2, 1 - w / 2);
	const cy = clamp(face.cy + h * 0.1, h / 2, 1 - h / 2);
	return { cx, cy, w, h };
}

/**
 * Coloca o vídeo para que `region` (fração do quadro) preencha a área
 * `area` do canvas (centro em pixels a partir do centro do canvas). A posição
 * é limitada para o vídeo cobrir a área toda (sem borda vazia).
 */
export function placeRegionInArea({
	region,
	source,
	canvas,
	area,
}: {
	region: NormBox;
	source: Size;
	canvas: Size;
	area: { centerX: number; centerY: number; width: number; height: number };
}): ElementPlacement {
	const c = containScale(canvas, source);
	const baseW = source.width * c;
	const baseH = source.height * c;
	const scale = Math.max(
		area.width / (region.w * baseW),
		area.height / (region.h * baseH),
	);
	const ew = baseW * scale;
	const eh = baseH * scale;
	const rawX = area.centerX - (region.cx - 0.5) * ew;
	const rawY = area.centerY - (region.cy - 0.5) * eh;
	// cobrir a área: borda esquerda do vídeo <= borda esquerda da área, etc.
	const minX = area.centerX + area.width / 2 - ew / 2;
	const maxX = area.centerX - area.width / 2 + ew / 2;
	const minY = area.centerY + area.height / 2 - eh / 2;
	const maxY = area.centerY - area.height / 2 + eh / 2;
	return {
		scale,
		positionX: clamp(rawX, Math.min(minX, maxX), Math.max(minX, maxX)),
		positionY: clamp(rawY, Math.min(minY, maxY), Math.max(minY, maxY)),
	};
}

/**
 * "Dividido": câmera na metade de cima, jogo (centro do quadro) na metade de
 * baixo. O jogo vai numa faixa acima da câmera; como ele tem a altura exata
 * da metade de baixo (vídeo mais largo que alto), cobre o que a câmera
 * ampliada deixaria vazar para baixo.
 */
export function splitLayout({
	face,
	source,
	canvas,
}: {
	face: NormBox;
	source: Size;
	canvas: Size;
}): { cam: ElementPlacement; game: ElementPlacement; camRegion: NormBox } {
	const half = canvas.height / 2;
	const topArea = {
		centerX: 0,
		centerY: -half / 2,
		width: canvas.width,
		height: half,
	};
	const bottomArea = {
		centerX: 0,
		centerY: half / 2,
		width: canvas.width,
		height: half,
	};
	const camRegion = camRegionFromFace({
		face,
		source,
		targetAspect: canvas.width / half,
	});
	const cam = placeRegionInArea({
		region: camRegion,
		source,
		canvas,
		area: topArea,
	});
	const game = placeRegionInArea({
		region: { cx: 0.5, cy: 0.5, w: 1, h: 1 },
		source,
		canvas,
		area: bottomArea,
	});
	return { cam, game, camRegion };
}

// ---------------------------------------------------------------------------
// Suavização da "câmera" (Seguir rosto)
// ---------------------------------------------------------------------------

export interface FaceSample {
	/** segundos desde o início do corte */
	t: number;
	/** centro do rosto principal (0 a 1) ou null quando não achou */
	fx: number | null;
	/**
	 * Centros de todos os rostos achados no quadro (opcional). Quando vem,
	 * a trilha segue o rosto mais perto de onde ela está, não o maior (um
	 * rosto grande do jogo não rouba a câmera).
	 */
	candidates?: number[];
}

export interface SmoothOptions {
	/** quanto anda em direção ao rosto a cada segundo (0 a 1). */
	followPerSecond?: number;
	/** zona morta: parado, só começa a andar se o rosto saiu mais que isso. */
	deadZone?: number;
	/** andando, para quando chega a menos que isso do rosto. */
	settle?: number;
	/** salto maior que isso = troca de cena (corte seco), se confirmado. */
	jump?: number;
	/** amostras seguidas no lugar novo para aceitar um salto (padrão 2). */
	confirmSamples?: number;
	/** segundos sem rosto antes de voltar devagar ao centro (padrão 4). */
	holdSeconds?: number;
}

export interface TrackPoint {
	t: number;
	x: number;
	/** true: a imagem pula para cá (corte seco) em vez de deslizar. */
	cut?: boolean;
}

function pickCandidate(sample: FaceSample, x: number): number | null {
	const list =
		sample.candidates && sample.candidates.length > 0
			? sample.candidates
			: sample.fx !== null
				? [sample.fx]
				: [];
	let best: number | null = null;
	for (const c of list) {
		if (best === null || Math.abs(c - x) < Math.abs(best - x)) best = c;
	}
	return best;
}

/**
 * Média exponencial com zona morta (histerese): parado, só começa a andar
 * quando o rosto sai mais que `deadZone`; andando, segue até ficar a menos
 * de `settle` do rosto (termina centralizado). Salto grande só vale se
 * repetir em `confirmSamples` amostras seguidas (um ponto solto conta como
 * "sem rosto"); confirmado, vira corte seco desde a primeira amostra do
 * lugar novo. Sem rosto: segura e, depois de `holdSeconds`, volta devagar ao
 * centro. Devolve o centro suavizado (0 a 1) em cada amostra.
 */
export function smoothFaceTrack(
	samples: FaceSample[],
	{
		followPerSecond = 0.85,
		deadZone = 0.05,
		settle = 0.01,
		jump = 0.35,
		confirmSamples = 2,
		holdSeconds = 4,
	}: SmoothOptions = {},
): TrackPoint[] {
	const out: TrackPoint[] = [];
	const first = samples.find((s) => s.fx !== null);
	let x = first?.fx ?? 0.5;
	let lastSeen = first ? first.t : Number.NEGATIVE_INFINITY;
	let prevT = samples[0]?.t ?? 0;
	let moving = false;
	// salto esperando confirmação: índice da 1ª amostra e onde está o rosto
	let pending: { index: number; fx: number; count: number } | null = null;
	for (const sample of samples) {
		const dt = Math.max(0, sample.t - prevT);
		prevT = sample.t;
		// fração do caminho a andar neste intervalo
		const k = 1 - (1 - followPerSecond) ** dt;
		let fx = pickCandidate(sample, x);
		if (fx !== null && Math.abs(fx - x) >= jump) {
			if (pending && Math.abs(fx - pending.fx) < jump / 2) {
				pending = { index: pending.index, fx, count: pending.count + 1 };
			} else {
				pending = { index: out.length, fx, count: 1 };
			}
			if (pending.count >= confirmSamples) {
				// corte seco desde a primeira amostra do lugar novo
				x = fx;
				for (let i = pending.index; i < out.length; i++) out[i].x = x;
				const cutIndex = pending.index;
				pending = null;
				moving = false;
				lastSeen = sample.t;
				out.push({ t: sample.t, x });
				out[cutIndex].cut = true;
				continue;
			}
			fx = null; // ponto solto: trata como sem rosto
		} else if (fx !== null) {
			pending = null;
		}
		if (fx !== null) {
			lastSeen = sample.t;
			const diff = fx - x;
			if (!moving && Math.abs(diff) > deadZone) moving = true;
			if (moving) {
				x += k * diff;
				if (Math.abs(fx - x) < settle) moving = false;
			}
		} else if (sample.t - lastSeen > holdSeconds) {
			x += k * 0.25 * (0.5 - x);
		}
		out.push({ t: sample.t, x });
	}
	return out;
}

function reducePoints(
	track: TrackPoint[],
	stepSeconds: number,
	minChange: number,
): TrackPoint[] {
	if (track.length === 0) return [];
	const picked: TrackPoint[] = [track[0]];
	let nextT = track[0].t + stepSeconds;
	for (let i = 1; i < track.length; i++) {
		if (track[i].t + 1e-6 >= nextT || i === track.length - 1) {
			picked.push(track[i]);
			nextT = track[i].t + stepSeconds;
		}
	}
	// tira pontos do meio que não mudam nada (reta entre vizinhos)
	const out: TrackPoint[] = [picked[0]];
	for (let i = 1; i < picked.length - 1; i++) {
		const prev = out[out.length - 1];
		const next = picked[i + 1];
		const cur = picked[i];
		const ratio = (cur.t - prev.t) / Math.max(1e-9, next.t - prev.t);
		const expected = prev.x + (next.x - prev.x) * ratio;
		if (Math.abs(cur.x - expected) >= minChange) out.push(cur);
	}
	if (picked.length > 1) out.push(picked[picked.length - 1]);
	return out;
}

export interface KeyPoint {
	t: number;
	x: number;
	/** true: segura o valor até o próximo ponto (corte seco ali). */
	hold?: boolean;
}

/**
 * Reduz a trilha suavizada para cerca de 1 ponto por segundo e tira os pontos
 * repetidos (mudança menor que `minChange`). Sempre mantém o primeiro e o
 * último. Em cada corte seco, o ponto de antes fica com `hold` (segura o
 * valor até o corte) e o ponto do corte é mantido.
 */
export function toKeyPoints(
	track: TrackPoint[],
	{
		stepSeconds = 1,
		minChange = 0.002,
	}: { stepSeconds?: number; minChange?: number } = {},
): KeyPoint[] {
	const out: KeyPoint[] = [];
	let segStart = 0;
	for (let i = 1; i <= track.length; i++) {
		if (i < track.length && !track[i].cut) continue;
		const part: KeyPoint[] = reducePoints(
			track.slice(segStart, i),
			stepSeconds,
			minChange,
		).map((p) => ({ t: p.t, x: p.x }));
		if (i < track.length && part.length > 0) part[part.length - 1].hold = true;
		out.push(...part);
		segStart = i;
	}
	return out;
}

/** Valor da trilha de pontos num tempo (linear, ou segurando no `hold`). */
function keyValueAt(points: KeyPoint[], t: number): { x: number; hold: boolean } {
	if (t <= points[0].t) return { x: points[0].x, hold: false };
	for (let i = 0; i < points.length - 1; i++) {
		const a = points[i];
		const b = points[i + 1];
		if (t >= a.t && t < b.t) {
			if (a.hold) return { x: a.x, hold: true };
			const ratio = (t - a.t) / Math.max(1e-9, b.t - a.t);
			return { x: a.x + (b.x - a.x) * ratio, hold: false };
		}
	}
	return { x: points[points.length - 1].x, hold: false };
}

/**
 * Pontos de um pedaço do corte: o valor na borda de início, os pontos que
 * caem dentro de [start, end] (segundos da fonte) e o valor na borda do fim,
 * com o tempo local do pedaço (t − start).
 */
export function keyPointsForPiece(
	points: KeyPoint[],
	start: number,
	end: number,
): KeyPoint[] {
	if (points.length === 0) return [];
	const eps = 1e-6;
	const startValue = keyValueAt(points, start);
	const out: KeyPoint[] = [
		startValue.hold ? { t: 0, x: startValue.x, hold: true } : { t: 0, x: startValue.x },
	];
	for (const p of points) {
		if (p.t > start + eps && p.t < end - eps) {
			out.push(p.hold ? { t: p.t - start, x: p.x, hold: true } : { t: p.t - start, x: p.x });
		}
	}
	if (end - start > eps) out.push({ t: end - start, x: keyValueAt(points, end).x });
	return out;
}

/** Tempos de amostra (segundos da fonte) espalhados num intervalo. */
export function sampleTimes({
	start,
	end,
	perSecond,
	maxCount = 2000,
}: {
	start: number;
	end: number;
	perSecond: number;
	maxCount?: number;
}): number[] {
	const span = Math.max(0, end - start);
	const count = Math.min(maxCount, Math.max(1, Math.floor(span * perSecond)));
	const step = span / count;
	const times: number[] = [];
	for (let i = 0; i < count; i++) times.push(start + step * (i + 0.5));
	return times;
}
