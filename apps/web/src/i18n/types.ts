import type { pt } from "./dictionaries/pt";

// O português é a referência: inglês e espanhol precisam ter exatamente as mesmas chaves.
type Widen<T> = {
	[K in keyof T]: T[K] extends string ? string : Widen<T[K]>;
};

export type Dictionary = Widen<typeof pt>;

type Paths<T, P extends string = ""> = {
	[K in keyof T & string]: T[K] extends string
		? `${P}${K}`
		: Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Chave de um texto, ex.: "projects.newProject". */
export type TKey = Paths<Dictionary>;

/** Valores para trocar no texto, ex.: { count: 3 } troca "{count}". */
export type TVars = Record<string, string | number>;
