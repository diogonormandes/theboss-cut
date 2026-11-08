// Textos da tela de projetos e das janelas de projeto (renomear, apagar, informações).
const projects = {
	allProjects: "Todos os projetos",
	view: {
		grid: "Ver em grade",
		list: "Ver em lista",
	},
	sort: {
		createdAt: "Criado",
		updatedAt: "Alterado",
		name: "Nome",
		duration: "Duração",
		ascending: "Ordem crescente",
		descending: "Ordem decrescente",
	},
	selectAll: "Selecionar tudo",
	searchPlaceholder: "Buscar…",
	recovery: {
		title: "Seu projeto foi salvo",
		text: "O THEBOSS CUT fechou de repente enquanto \"{name}\" estava aberto. Tudo o que você fez até ali foi salvo automaticamente.",
		textNoName: "O THEBOSS CUT fechou de repente. Tudo o que você fez até ali foi salvo automaticamente.",
		continue: "Continuar editando",
		dismiss: "Agora não",
	},
	start: {
		title: "Começar um projeto",
		subtitle: "Escolha o formato. Dá para mudar depois nas configurações do projeto.",
		recentTitle: "Projetos recentes",
	},
	formats: {
		vertical: { name: "Vertical", hint: "TikTok, Reels e Shorts" },
		horizontal: { name: "Horizontal", hint: "YouTube e lives" },
		square: { name: "Quadrado", hint: "Feed e posts" },
		portrait: { name: "Retrato", hint: "Feed do Instagram" },
		auto: { name: "Automático", hint: "Segue o tamanho do primeiro vídeo" },
	},
	newProjectDialog: {
		title: "Novo projeto",
		description: "Dê um nome e escolha o formato do vídeo.",
		nameLabel: "Nome do projeto",
		formatLabel: "Formato",
		create: "Criar e abrir",
		creating: "Criando…",
	},
	newProject: {
		button: "Novo projeto",
		buttonShort: "Novo",
		defaultName: "Novo projeto",
		createFailed: "Não deu para criar o projeto",
	},
	card: {
		thumbnailAlt: "Capa do projeto",
		createdOn: "Criado em {date}",
	},
	menu: {
		label: "Menu do projeto",
		info: "Informações",
	},
	empty: {
		noResultsTitle: "Nada encontrado",
		noResultsText: "Nenhum projeto com \"{query}\". Tente outra palavra.",
		clearSearch: "Limpar busca",
		noProjectsTitle: "Nenhum projeto ainda",
		noProjectsText:
			"Crie o seu primeiro projeto: traga suas mídias, edite e exporte seus vídeos. Tudo fica no seu computador.",
		createFirst: "Crie o seu primeiro projeto",
	},
	deleteDialog: {
		titleSingleBefore: "Apagar \"",
		titleSingleAfter: "\"?",
		titleMany: "Apagar {count} projetos?",
		warning: "Atenção",
		descriptionSingle:
			"Isso vai apagar \"{name}\" para sempre, junto com todos os arquivos dele.",
		descriptionMany:
			"Isso vai apagar {count} projetos para sempre, junto com todos os arquivos deles.",
		typeToConfirm: "Digite APAGAR para confirmar",
		confirmWord: "APAGAR",
		confirm: "Apagar projeto",
	},
	renameDialog: {
		title: "Renomear projeto",
		newName: "Novo nome",
		placeholder: "Digite o novo nome",
	},
	infoDialog: {
		duration: "Duração",
		created: "Criado",
		updated: "Alterado",
		projectCode: "Código do projeto",
	},
	migration: {
		titleSingle: "Atualizando o projeto",
		titleMany: "Atualizando os projetos",
		descriptionSingle:
			"Preparando \"{name}\" para a versão nova do THEBOSS CUT. Não feche o programa.",
		descriptionMany:
			"Preparando seus projetos para a versão nova do THEBOSS CUT. Não feche o programa.",
	},
};

export default projects;
