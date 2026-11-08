/**
 * Roteiro determinístico da LIVE FALSA (ferramenta interna da Etapa 3).
 *
 * Tudo aqui é puro e reproduzível: a mesma semente gera sempre os mesmos
 * blocos, o mesmo áudio e a mesma posição da "facecam". Nada usa Math.random.
 */

export type TipoBloco = "silencio" | "fala" | "grito" | "musica";

export type Bloco = {
	tipo: TipoBloco;
	/** segundos */
	inicio: number;
	/** segundos */
	fim: number;
	/** frequência base da voz (fala e grito), em Hz */
	f0: number;
	/** sílabas por segundo (fala) */
	silabasPorSeg: number;
	/** semente própria do bloco (pausas entre palavras, acordes) */
	semente: number;
};

export const SEMENTE_PADRAO = 20261108;

/** Níveis nominais (RMS em dBFS). O gabarito também traz o RMS medido de cada bloco. */
export const NIVEIS_DB = {
	silencio: -60,
	fala: -20,
	grito: -11,
	musica: -35,
} as const;

// ---------------------------------------------------------------------------
// Números pseudoaleatórios com semente
// ---------------------------------------------------------------------------

/** mulberry32: gerador simples, rápido e reproduzível. */
export function criarRng(semente: number): () => number {
	let a = semente >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Mistura dois inteiros num valor entre 0 e 1 (sem estado). */
export function hash01(a: number, b: number): number {
	let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77)) >>> 0;
	h ^= h >>> 16;
	h = Math.imul(h, 0x7feb352d) >>> 0;
	h ^= h >>> 15;
	h = Math.imul(h, 0x846ca68b) >>> 0;
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
}

function entre(rng: () => number, min: number, max: number): number {
	return min + (max - min) * rng();
}

/** Arredonda para milissegundos (o gabarito fica legível e exato). */
function ms(valor: number): number {
	return Math.round(valor * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Roteiro em blocos
// ---------------------------------------------------------------------------

/**
 * Monta a sequência de blocos da live. Padrão parecido com uma live real:
 * fala com pausas curtas, gritos curtos no meio da fala, trechos só de música
 * (intervalo) e, às vezes, um silêncio longo (pessoa ausente).
 */
export function montarRoteiro({
	duracaoSeg,
	semente = SEMENTE_PADRAO,
}: {
	duracaoSeg: number;
	semente?: number;
}): Bloco[] {
	const rng = criarRng(semente);
	const blocos: Bloco[] = [];
	let t = 0;
	let contador = 0;

	const adicionar = (tipo: TipoBloco, duracao: number, extra?: Partial<Bloco>) => {
		if (t >= duracaoSeg) return;
		const inicio = ms(t);
		const fim = ms(Math.min(duracaoSeg, t + duracao));
		if (fim - inicio < 0.05) {
			t = duracaoSeg;
			return;
		}
		contador += 1;
		blocos.push({
			tipo,
			inicio,
			fim,
			f0: extra?.f0 ?? 0,
			silabasPorSeg: extra?.silabasPorSeg ?? 0,
			semente: (semente ^ Math.imul(contador, 0x27d4eb2d)) >>> 0,
		});
		t = fim;
	};

	// começo da live: 2 s de silêncio
	adicionar("silencio", 2);

	while (t < duracaoSeg) {
		const sorteio = rng();
		if (sorteio < 0.05) {
			// intervalo só com música
			adicionar("musica", entre(rng, 20, 120));
			adicionar("silencio", entre(rng, 0.8, 3));
		} else if (sorteio < 0.08) {
			// pessoa saiu da frente da câmera
			adicionar("silencio", entre(rng, 10, 60));
		} else {
			const f0 = entre(rng, 95, 220);
			const silabasPorSeg = entre(rng, 3.4, 4.8);
			adicionar("fala", entre(rng, 4, 30), { f0, silabasPorSeg });
			if (rng() < 0.15) {
				// grito no meio da fala e a fala continua
				adicionar("grito", entre(rng, 0.5, 1.5), { f0: entre(rng, 330, 520) });
				adicionar("fala", entre(rng, 2, 12), { f0, silabasPorSeg });
			}
			adicionar("silencio", entre(rng, 0.4, 6));
		}
	}

	return blocos;
}

/** Junta blocos vizinhos do mesmo tipo em intervalos [inicio, fim]. */
export function intervalosPorTipo(blocos: Bloco[]): Record<TipoBloco, [number, number][]> {
	const saida: Record<TipoBloco, [number, number][]> = {
		silencio: [],
		fala: [],
		grito: [],
		musica: [],
	};
	for (const bloco of blocos) {
		const lista = saida[bloco.tipo];
		const ultimo = lista[lista.length - 1];
		if (ultimo && Math.abs(ultimo[1] - bloco.inicio) < 1e-6) {
			ultimo[1] = bloco.fim;
		} else {
			lista.push([bloco.inicio, bloco.fim]);
		}
	}
	return saida;
}

/** Acha o índice do bloco em `t` (busca binária). */
export function indiceDoBloco(blocos: Bloco[], t: number): number {
	let lo = 0;
	let hi = blocos.length - 1;
	while (lo < hi) {
		const meio = (lo + hi + 1) >> 1;
		if (blocos[meio].inicio <= t) lo = meio;
		else hi = meio - 1;
	}
	return lo;
}

// ---------------------------------------------------------------------------
// "Facecam" desenhada
// ---------------------------------------------------------------------------

/** Raio da facecam em fração da altura do vídeo. */
export const FACECAM_RAIO = 0.13;

/** Centro da facecam (0 a 1 na largura e na altura). Move devagar no canto superior direito. */
export function posicaoFacecam(t: number): { x: number; y: number } {
	return {
		x: 0.82 + 0.06 * Math.sin((2 * Math.PI * t) / 97),
		y: 0.27 + 0.08 * Math.sin((2 * Math.PI * t) / 131 + 1),
	};
}

// ---------------------------------------------------------------------------
// Síntese de áudio (mono, Float32)
// ---------------------------------------------------------------------------

const TAMANHO_TABELA = 4096;

/** Uma volta da forma de onda com harmônicos (pico normalizado em 1). */
function criarTabela(pesos: (harmonico: number) => number, harmonicos: number): Float32Array {
	const tabela = new Float32Array(TAMANHO_TABELA);
	let pico = 0;
	for (let i = 0; i < TAMANHO_TABELA; i++) {
		const fase = (2 * Math.PI * i) / TAMANHO_TABELA;
		let v = 0;
		for (let h = 1; h <= harmonicos; h++) v += pesos(h) * Math.sin(h * fase);
		tabela[i] = v;
		pico = Math.max(pico, Math.abs(v));
	}
	for (let i = 0; i < TAMANHO_TABELA; i++) tabela[i] /= pico;
	return tabela;
}

const formante = (freq: number, centro: number, largura: number) =>
	Math.exp(-(((freq - centro) / largura) ** 2));

// voz: harmônicos de ~150 Hz realçados perto de 500 Hz e 1,5 kHz (parece "vogal")
const TABELA_VOZ = criarTabela(
	(h) =>
		(1 / h) *
		(0.4 + 2 * formante(h * 150, 550, 250) + 1.2 * formante(h * 150, 1500, 450)),
	16,
);
// grito: mais brilhante (energia alta acima de 1 kHz)
const TABELA_GRITO = criarTabela(
	(h) => (1 / Math.sqrt(h)) * (0.5 + 2 * formante(h * 420, 1800, 900)),
	14,
);
const TABELA_SENO = criarTabela((h) => (h === 1 ? 1 : 0), 1);

// acordes da "música": lá menor, fá, dó, sol (Hz)
const ACORDES = [
	[220, 261.63, 329.63],
	[174.61, 220, 261.63],
	[261.63, 329.63, 392],
	[196, 246.94, 293.66],
];

/** Amplitudes para chegar perto dos níveis nominais. */
const AMP_RUIDO_FUNDO = 0.0017; // ruído branco uniforme: RMS ≈ 0,577·amp ≈ −60 dBFS
const AMP_FALA = 0.54;
const AMP_GRITO = 0.95;
const AMP_MUSICA = 0.022;

/**
 * Gera o áudio em pedaços, em ordem. Guarda só o estado das fases e do ruído:
 * a memória não cresce com a duração da live.
 */
export class SintetizadorAudio {
	private readonly blocos: Bloco[];
	private readonly taxa: number;
	private indice = 0;
	private faseVoz = 0;
	private faseNotas = [0, 0, 0];
	private ruido: number;
	/** soma dos quadrados por índice de bloco (faixa principal) */
	readonly medidas: { soma: number; amostras: number }[];

	constructor({ blocos, taxa, semente }: { blocos: Bloco[]; taxa: number; semente: number }) {
		this.blocos = blocos;
		this.taxa = taxa;
		this.ruido = (semente | 1) >>> 0;
		this.medidas = blocos.map(() => ({ soma: 0, amostras: 0 }));
	}

	private proximoRuido(): number {
		// xorshift32
		let x = this.ruido;
		x ^= x << 13;
		x ^= x >>> 17;
		x ^= x << 5;
		this.ruido = x >>> 0;
		return (this.ruido / 4294967296) * 2 - 1;
	}

	/**
	 * Preenche `saida` com as amostras a partir de `amostraInicial`.
	 * Se `saidaMicrofone` vier, preenche também uma segunda faixa só com a voz
	 * (a música vira silêncio), como a faixa do microfone no OBS.
	 */
	preencher({
		amostraInicial,
		saida,
		saidaMicrofone,
	}: {
		amostraInicial: number;
		saida: Float32Array;
		saidaMicrofone?: Float32Array;
	}): void {
		const taxa = this.taxa;
		const blocos = this.blocos;
		const n = saida.length;
		const mascara = TAMANHO_TABELA - 1;

		for (let i = 0; i < n; i++) {
			const t = (amostraInicial + i) / taxa;
			while (this.indice < blocos.length - 1 && t >= blocos[this.indice].fim) {
				this.indice += 1;
			}
			const bloco = blocos[this.indice];
			const local = t - bloco.inicio;
			const fundo = this.proximoRuido() * AMP_RUIDO_FUNDO;
			let valor = fundo;
			let ehMusica = false;

			if (bloco.tipo === "fala") {
				// envelope silábico: sin² por sílaba; ~20% das sílabas são pausas
				const silabaReal = local * bloco.silabasPorSeg;
				const silaba = Math.floor(silabaReal);
				const pausa = hash01(bloco.semente, silaba) < 0.2;
				let envelope = 0;
				if (!pausa) {
					const p = silabaReal - silaba;
					const s = TABELA_SENO[((p * 0.5 * TAMANHO_TABELA) | 0) & mascara];
					envelope = s * s;
				}
				// entonação: a altura varia devagar
				const f0 =
					bloco.f0 *
					(1 + 0.08 * TABELA_SENO[((local * 0.7 * TAMANHO_TABELA) | 0) & mascara]);
				this.faseVoz += f0 / taxa;
				this.faseVoz -= Math.floor(this.faseVoz);
				const tonal = TABELA_VOZ[(this.faseVoz * TAMANHO_TABELA) | 0];
				valor += AMP_FALA * envelope * (0.85 * tonal + 0.15 * this.proximoRuido());
			} else if (bloco.tipo === "grito") {
				const duracao = bloco.fim - bloco.inicio;
				const ataque = Math.min(1, local / 0.03);
				const queda = Math.min(1, Math.max(0, (duracao - local) / 0.08));
				const envelope = ataque * queda;
				this.faseVoz += (bloco.f0 * (1 + 0.04 * local)) / taxa;
				this.faseVoz -= Math.floor(this.faseVoz);
				const tonal = TABELA_GRITO[(this.faseVoz * TAMANHO_TABELA) | 0];
				valor += AMP_GRITO * envelope * (0.6 * tonal + 0.4 * this.proximoRuido());
			} else if (bloco.tipo === "musica") {
				ehMusica = true;
				const tempo = local / 2; // troca de acorde a cada 2 s
				const acorde = ACORDES[Math.floor(tempo) % ACORDES.length];
				const batida = local * 2 - Math.floor(local * 2); // 120 BPM
				const pulso = 0.55 + 0.45 * Math.exp(-batida * 6);
				let soma = 0;
				for (let k = 0; k < 3; k++) {
					this.faseNotas[k] += acorde[k] / taxa;
					this.faseNotas[k] -= Math.floor(this.faseNotas[k]);
					soma += TABELA_SENO[(this.faseNotas[k] * TAMANHO_TABELA) | 0];
				}
				valor += AMP_MUSICA * pulso * soma;
			}

			saida[i] = valor;
			if (saidaMicrofone) saidaMicrofone[i] = ehMusica ? fundo : valor;
			const medida = this.medidas[this.indice];
			medida.soma += valor * valor;
			medida.amostras += 1;
		}
	}

	/** RMS medido (dBFS) de cada bloco, depois de gerar o áudio inteiro. */
	rmsDbPorBloco(): number[] {
		return this.medidas.map(({ soma, amostras }) =>
			amostras > 0
				? Math.round(10 * Math.log10(soma / amostras + 1e-12) * 10) / 10
				: -120,
		);
	}
}

// ---------------------------------------------------------------------------
// Gabarito
// ---------------------------------------------------------------------------

export type Gabarito = {
	versao: 1;
	arquivo: string;
	semente: number;
	duracaoSeg: number;
	video: { largura: number; altura: number; fps: number; codec: string };
	audio: { taxa: number; canais: 1; codec: string; faixas: string[] };
	niveisNominaisDb: typeof NIVEIS_DB;
	/** intervalos em segundos, [inicio, fim] */
	intervalos: Record<TipoBloco, [number, number][]>;
	blocos: { tipo: TipoBloco; inicio: number; fim: number; rmsDb: number }[];
	facecam: {
		raio: number;
		descricao: string;
		/** uma amostra por segundo: [t, x, y], x e y de 0 a 1 */
		amostras: [number, number, number][];
	};
};

export function montarGabarito({
	arquivo,
	semente,
	duracaoSeg,
	blocos,
	rmsDb,
	video,
	audio,
}: {
	arquivo: string;
	semente: number;
	duracaoSeg: number;
	blocos: Bloco[];
	rmsDb: number[];
	video: Gabarito["video"];
	audio: Gabarito["audio"];
}): Gabarito {
	const amostras: [number, number, number][] = [];
	for (let t = 0; t <= duracaoSeg; t += 1) {
		const { x, y } = posicaoFacecam(t);
		amostras.push([t, Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000]);
	}
	return {
		versao: 1,
		arquivo,
		semente,
		duracaoSeg,
		video,
		audio,
		niveisNominaisDb: NIVEIS_DB,
		intervalos: intervalosPorTipo(blocos),
		blocos: blocos.map((b, i) => ({
			tipo: b.tipo,
			inicio: b.inicio,
			fim: b.fim,
			rmsDb: rmsDb[i] ?? -120,
		})),
		facecam: {
			raio: FACECAM_RAIO,
			descricao:
				"x = 0.82 + 0.06·sin(2πt/97), y = 0.27 + 0.08·sin(2πt/131 + 1); raio em fração da altura",
			amostras,
		},
	};
}
