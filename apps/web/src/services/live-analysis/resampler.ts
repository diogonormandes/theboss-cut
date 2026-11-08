/**
 * Reamostrador em fluxo para a análise da live: qualquer taxa → 16 kHz.
 *
 * Filtro passa-baixa de seno cardinal com janela Blackman (64 pontos, corte 6,56 kHz):
 *  - 48 kHz → 16 kHz: divisão exata por 3 (uma fase só da tabela);
 *  - 44,1 kHz → 16 kHz: reamostragem fracionária (tabela de 512 fases).
 * Guarda só os últimos pontos do filtro: a memória não cresce com a duração.
 */

const TAPS = 64;
const HALF = TAPS / 2;
const PHASES = 512;

function sinc(x: number): number {
	if (Math.abs(x) < 1e-9) return 1;
	const px = Math.PI * x;
	return Math.sin(px) / px;
}

export class StreamingResampler {
	readonly inRate: number;
	readonly outRate: number;
	private readonly step: number;
	private readonly phases: number;
	private readonly table: Float32Array;
	/** amostras de entrada guardadas; buf[0] é a amostra de índice absoluto `bufStart` */
	private buf: Float32Array;
	private bufStart: number;
	private bufLen: number;
	/** índice da próxima amostra de saída */
	private nextOut = 0;
	/** quantas amostras de entrada de verdade chegaram (sem os zeros do fim) */
	private received = 0;
	private out: Float32Array;

	constructor(inRate: number, outRate: number) {
		this.inRate = inRate;
		this.outRate = outRate;
		this.step = inRate / outRate;
		const integer = Number.isInteger(this.step);
		this.phases = integer ? 1 : PHASES;
		// corte em 41% da taxa de saída (6,56 kHz para 16 kHz): com 64 pontos o que
		// passa de 8 kHz (pratos, tiros, chiado do jogo) cai mais de 60 dB e não
		// volta dobrado entre 6 e 8 kHz, o que subiria o centróide e criaria
		// "gritos" falsos. Sem reduzir a taxa, só interpola.
		const cutoff = Math.min(0.41 * outRate, 0.45 * inRate);
		const fc = (2 * cutoff) / inRate; // em ciclos por meia amostra de entrada
		this.table = new Float32Array(this.phases * TAPS);
		for (let p = 0; p < this.phases; p++) {
			const frac = p / this.phases;
			let soma = 0;
			for (let j = 0; j < TAPS; j++) {
				const t = j - HALF + 1 - frac;
				const w =
					Math.abs(t) >= HALF
						? 0
						: 0.42 +
							0.5 * Math.cos((Math.PI * t) / HALF) +
							0.08 * Math.cos((2 * Math.PI * t) / HALF);
				const h = fc * sinc(fc * t) * w;
				this.table[p * TAPS + j] = h;
				soma += h;
			}
			// ganho 1 em sinal constante
			for (let j = 0; j < TAPS; j++) this.table[p * TAPS + j] /= soma;
		}
		// começa com zeros antes da amostra 0 (o filtro é centrado)
		this.buf = new Float32Array(8192);
		this.bufStart = -HALF;
		this.bufLen = HALF;
		this.out = new Float32Array(4096);
	}

	/**
	 * Recebe `count` amostras de entrada e devolve as de saída já prontas.
	 * O array devolvido é reaproveitado na próxima chamada: copie se precisar guardar.
	 */
	push(input: Float32Array, count = input.length): Float32Array {
		this.append(input, count);
		this.received += count;
		return this.drain(Number.POSITIVE_INFINITY);
	}

	/** Completa o fim com zeros e devolve o que faltava sair. */
	flush(): Float32Array {
		this.append(new Float32Array(TAPS), TAPS);
		return this.drain(this.received);
	}

	private append(input: Float32Array, count: number): void {
		if (this.bufLen + count > this.buf.length) {
			let cap = this.buf.length;
			while (cap < this.bufLen + count) cap *= 2;
			const next = new Float32Array(cap);
			next.set(this.buf.subarray(0, this.bufLen));
			this.buf = next;
		}
		this.buf.set(input.subarray(0, count), this.bufLen);
		this.bufLen += count;
	}

	/** `limit`: posição de entrada (exclusiva) até onde pode sair amostra. */
	private drain(limit: number): Float32Array {
		const step = this.step;
		const phases = this.phases;
		const table = this.table;
		const buf = this.buf;
		const end = this.bufStart + this.bufLen; // primeiro índice absoluto que ainda não chegou
		const maxOut = Math.max(0, Math.ceil((this.bufLen + 2) / step) + 2);
		if (this.out.length < maxOut) this.out = new Float32Array(maxOut * 2);
		const out = this.out;
		let produced = 0;

		for (;;) {
			const x = this.nextOut * step;
			if (x >= limit) break;
			let n0 = Math.floor(x);
			let p = Math.round((x - n0) * phases);
			if (p >= phases) {
				p = 0;
				n0 += 1;
			}
			if (n0 + HALF >= end) break;
			const base = n0 - HALF + 1 - this.bufStart;
			const row = p * TAPS;
			let y = 0;
			for (let j = 0; j < TAPS; j++) y += buf[base + j] * table[row + j];
			out[produced++] = y;
			this.nextOut += 1;
		}

		// descarta o que não será mais usado
		const nextX = this.nextOut * step;
		const keepFrom = Math.floor(nextX) - HALF + 1 - this.bufStart;
		if (keepFrom > 0) {
			const drop = Math.min(keepFrom, this.bufLen);
			buf.copyWithin(0, drop, this.bufLen);
			this.bufLen -= drop;
			this.bufStart += drop;
		}
		return out.subarray(0, produced);
	}
}
