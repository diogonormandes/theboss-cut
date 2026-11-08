// Atalhos do teclado, ações do editor e avisos do núcleo do editor.
const actions = {
	list: {
		togglePlay: "Tocar/Pausar",
		stopPlayback: "Parar",
		seekForward: "Avançar 1 segundo",
		seekBackward: "Voltar 1 segundo",
		frameStepForward: "Avançar um quadro",
		frameStepBackward: "Voltar um quadro",
		jumpForward: "Avançar 5 segundos",
		jumpBackward: "Voltar 5 segundos",
		gotoStart: "Ir para o começo",
		gotoEnd: "Ir para o fim",
		split: "Cortar na agulha",
		splitLeft: "Cortar e tirar a esquerda",
		splitRight: "Cortar e tirar a direita",
		deleteSelected: "Apagar a seleção",
		copySelected: "Copiar os itens selecionados",
		pasteCopied: "Colar itens na agulha",
		toggleSnapping: "Ligar/desligar encaixe",
		toggleRippleEditing: "Ligar/desligar edição em cascata",
		toggleSourceAudio: "Separar ou recuperar o áudio original",
		selectAll: "Selecionar todos os itens",
		cancelInteraction: "Cancelar a ação atual",
		deselectAll: "Tirar a seleção",
		duplicateSelected: "Duplicar o item selecionado",
		toggleElementsMutedSelected: "Tirar ou pôr o som dos itens selecionados",
		toggleElementsVisibilitySelected: "Mostrar ou esconder os itens selecionados",
		toggleBookmark: "Marcador na agulha",
		undo: "Desfazer",
		redo: "Refazer",
		removeMediaAsset: "Remover mídia",
		removeMediaAssets: "Remover mídias",
	},
	selection: {
		selectableItems: "Itens que podem ser selecionados",
	},
	categories: {
		playback: "Reprodução",
		navigation: "Navegação",
		editing: "Edição",
		selection: "Seleção",
		history: "Histórico",
		timeline: "Linha do tempo",
		controls: "Controles",
		assets: "Mídias",
	},
	shortcutsDialog: {
		title: "Atalhos do teclado",
		resetToDefaults: "Voltar ao padrão",
		or: "ou",
		pressKeys: "Aperte a combinação de teclas…",
		clickToEdit: "Clique para trocar o atalho",
		keyInUse: 'A tecla "{key}" já está sendo usada em "{action}". Escolha outra.',
	},
	elementName: {
		copy: "{name} (cópia)",
		left: "{name} (esquerda)",
		right: "{name} (direita)",
	},
	project: {
		mainScene: "Cena principal",
		createFailed: "Não deu para salvar o projeto novo",
		notFound: "Projeto não encontrado",
		notFoundMany: "Projetos não encontrados",
		someNotFound:
			"Alguns projetos não foram encontrados. Atualize a lista e tente de novo.",
		renameFailed: "Não deu para renomear o projeto",
		duplicateFailed: "Não deu para duplicar os projetos",
	},
	storage: {
		lowSpace: "Pouco espaço para guardar",
		lowSpaceHint: "Apague projetos ou mídias que não usa mais e tente de novo.",
	},
	snapshot: {
		notSupported:
			'Este navegador não deixa copiar imagens. Use "Salvar captura".',
		nothingToCapture: "Abra um projeto para tirar a captura.",
		projectEmpty:
			"O projeto está vazio. Coloque algo na linha do tempo primeiro.",
		imageFailed: "Não deu para criar a imagem. Tente de novo.",
		unknownError: "Algo deu errado. Tente de novo.",
		defaultFileName: "captura",
	},
	export: {
		noProject: "Abra um projeto para exportar.",
		projectEmpty:
			"O projeto está vazio. Coloque algo na linha do tempo antes de exportar.",
		failed: "Não deu para gerar o vídeo. Tente de novo.",
		unknownError: "Algo deu errado ao exportar. Tente de novo.",
	},
};

export default actions;
