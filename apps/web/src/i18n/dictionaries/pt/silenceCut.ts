// Etapa 3 (silenceCut): seção "Cortar silêncios".
const silenceCut = {
	title: "Cortar silêncios",
	explain: "Tira as pausas sem fala do vídeo. O vermelho no mapa mostra o que vai sair.",
	strength: "Intensidade",
	soft: "Suave",
	strong: "Forte",
	strengthHint: "Suave tira só o silêncio total. Forte tira também as partes bem baixas.",
	minSilence: "Pausa mínima",
	minSilenceHint: "Só corta pausas com pelo menos este tempo.",
	seconds: "{n} s",
	willCutOne: "Vai cortar 1 trecho ({time})",
	willCut: "Vai cortar {n} trechos ({time})",
	nothing: "Nenhum silêncio com esse ajuste. Tente uma intensidade mais forte.",
	apply: "Cortar silêncios",
	needAnalysis: "Para achar os silêncios, primeiro analise a live.",
	analyzing: "Analisando a live… o resultado aparece aqui quando terminar.",
	noLive: "Coloque uma live (vídeo de 10 minutos ou mais) na linha do tempo para usar.",
	noClip: "Selecione na linha do tempo o pedaço da live que quer limpar.",
	retimed: "Este pedaço está com a velocidade mudada. Volte a velocidade ao normal para cortar os silêncios.",
	doneOne: "Pronto: 1 silêncio cortado. Para voltar, use Desfazer (Ctrl+Z).",
	done: "Pronto: {n} silêncios cortados. Para voltar, use Desfazer (Ctrl+Z).",
	newScene: "Sem silêncios",
	newSceneDone: "Criamos a cena \"Sem silêncios\" com a live limpa. A cena principal ficou intacta.",
	failed: "Não deu para cortar. Selecione o pedaço da live de novo e tente outra vez.",
};

export default silenceCut;
