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
