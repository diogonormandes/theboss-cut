const editor = {
	save: {
		saving: "Salvando…",
		saved: "Salvo",
		savedHint: "Tudo salvo no seu PC às {time}",
		pending: "Salvando…",
		error: "Não salvo",
		errorHint: "Não deu para salvar. Libere espaço no PC; o THEBOSS CUT tenta de novo sozinho.",
		errorToast: "Não deu para salvar o projeto",
		errorToastText: "Libere espaço no PC (apague arquivos que não usa). O THEBOSS CUT vai tentar salvar de novo sozinho.",
	},
	header: {
		exitProject: "Sair do projeto",
		shortcuts: "Atalhos",
		renameFailed: "Não deu para renomear o projeto",
		deleteFailed: "Não deu para apagar o projeto",
	},
	loader: {
		opening: "Abrindo o projeto…",
		closing: "Saindo do projeto…",
		createFailed:
			"Não deu para criar o projeto. Volte para a lista de projetos e tente de novo.",
		loadFailed:
			"Não deu para abrir o projeto. Volte para a lista de projetos e tente de novo.",
	},
	degradedBanner: "Para a melhor experiência, use o THEBOSS CUT atualizado.",
	storage: {
		incomplete:
			"O armazenamento deste computador não está completo. Algumas funções podem falhar.",
		unknownError: "Algo deu errado ao carregar seus projetos.",
	},
	export: {
		button: "Exportar",
		title: "Exportar projeto",
		titleExporting: "Exportando projeto",
		format: "Formato",
		formatMp4: "MP4 (H.264) - abre em tudo",
		formatWebm: "WebM (VP9) - arquivo menor",
		quality: "Qualidade",
		qualityLow: "Baixa - arquivo menor",
		qualityMedium: "Média - equilibrada",
		qualityHigh: "Alta - recomendada",
		qualityVeryHigh: "Muito alta - arquivo maior",
		audio: "Áudio",
		includeAudio: "Exportar com áudio",
		failed: "Não deu para exportar",
		unknownError: "Algo deu errado. Tente exportar de novo.",
		copy: "Copiar",
		retry: "Tentar de novo",
	},
	mobileGate: {
		title: "Só no computador (por enquanto)",
		text: "O THEBOSS CUT foi feito para o computador. Em telas pequenas a edição fica apertada.",
		continue: "Ver mesmo assim",
	},
	onboarding: {
		welcomeTitle: "Bem-vindo ao THEBOSS CUT",
		welcomeText:
			"O editor de vídeo do THEBOSSVERSE: corte, legende, coloque textos, efeitos e músicas e exporte pronto para postar.",
		localTitle: "Seus vídeos ficam no seu PC",
		localText:
			"Nada é enviado para a internet: os projetos e os arquivos ficam guardados neste computador.",
		localDrag:
			"Arraste vídeos, fotos e músicas para a área de mídias para começar.",
		tipsTitle: "Dicas rápidas",
		tipsText:
			"Espaço toca e pausa. S corta no ponto da agulha. No menu do tridente, no canto de cima, ficam todos os atalhos.",
		start: "Começar a editar",
	},
	scenes: {
		title: "Cenas",
		description: "Troque entre as cenas do seu projeto",
		selectTitle: "Selecionar cenas ({count})",
		selectDescription: "Escolha as cenas que quer apagar",
		select: "Selecionar",
		deleteCount: "Apagar ({count})",
		empty: "Nenhuma cena",
		deleteFailed: "Não deu para apagar a cena",
		deleteTitle: "Apagar cenas",
		deleteConfirmOne: "Quer mesmo apagar 1 cena? Não dá para desfazer depois.",
		deleteConfirmMany:
			"Quer mesmo apagar {count} cenas? Não dá para desfazer depois.",
	},
	timecode: {
		clickToEdit: "Clique para mudar o tempo",
	},
	section: {
		collapse: "Recolher seção",
		expand: "Abrir seção",
	},
	theme: {
		light: "Claro",
		dark: "Escuro",
	},
	icons: {
		video: "Vídeo",
		checkerboard: "Xadrez",
		sliders: "Ajustes",
		social: "Redes sociais",
		textWidth: "Largura do texto",
		textHeight: "Altura do texto",
		font: "Fonte",
		shapes: "Formas",
		mirror: "Espelhar",
		squarePlus: "Adicionar",
		ripple: "Efeito cascata",
	},
};

export default editor;
