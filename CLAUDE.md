# THEBOSS CUT — instruções para o Claude Code

## Com quem você está falando
- O dono é o Diogo, chamado de **BOSS**. Ele **não é programador**.
- Responda sempre em **português do Brasil**, simples e passo a passo.
- Quando ele precisar fazer algo (rodar um arquivo, clicar em algo), diga exatamente o que fazer.
- Antes de mudanças grandes, explique em 2 ou 3 frases o que vai fazer e por quê.

## O que é o THEBOSS CUT
- Editor de vídeo para **Windows** da marca THEBOSSVERSE. O objetivo é chegar ao nível do CapCut e do Premiere:
  - profissional, mas **muito intuitivo**;
  - visual **premium**, preto e dourado (vidro, brilho e transições suaves, sem exagero);
  - nada de roxo.
- É baseado no OpenCut (licença MIT). O aviso da licença fica **só no arquivo LICENSE**. Na interface o nome é só THEBOSS CUT.
- Público: criadores de conteúdo e streamers, que cortam lives, fazem vídeos verticais, legendam e postam.
- **Três idiomas:** português (padrão), inglês e espanhol.
  - Nenhum texto da tela fica escrito direto no código: tudo vem do dicionário de idiomas.
  - Ao criar um texto novo, crie nos 3 idiomas.
- Os textos que o usuário vê não podem ter termos de programador. Mensagens de erro dizem o que a pessoa deve fazer.
- Tudo roda no PC da pessoa: os vídeos não saem do computador, sem conta, sem marca d'água e sem anúncios.
- O PC das lives do BOSS tem 16 GB de RAM: cuidado com memória e desempenho.

## Como o projeto é montado
- `apps/web`: o editor (Next.js, roda com **bun**).
- `desktop/`: o programa Windows (Electron).
  - Ele roda o Next "standalone" na porta 47210 e abre a janela.
  - O `desktop/main.js` acha o servidor em `app/apps/web` ou em `app`.
- `.github/workflows/instalador.yml`: monta o instalador no GitHub.
  - Dispara a cada tag `v*`.
  - Gera `THEBOSS-CUT-Instalador.exe` e publica na página de versões (Releases).
- **NÃO mude** o nome do produto (`THEBOSS CUT`), o nome do arquivo do instalador (`THEBOSS-CUT-Instalador.exe`) nem o `appId`. O programa THEBOSSVERSE depende deles:
  - ele baixa a versão mais nova pelas Releases;
  - instala em silêncio (`/S`);
  - procura o editor em `%LOCALAPPDATA%\Programs\THEBOSS CUT\THEBOSS CUT.exe`.

## Como testar e publicar
- Para testar no navegador: em `apps/web`, rode `bun install` e depois `bun run dev`.
- Para testar como programa: monte e abra o Electron (`desktop/`).
- Sempre teste antes de dizer que está pronto. Se der para mostrar, mostre um print.
- **Publicar** é com a ferramenta do BOSS **24-PUBLICAR-THEBOSS-CUT**, que fica na pasta `ferramentas` do projeto thebossverse. Ela:
  - salva esta pasta no GitHub;
  - sobe a versão do `desktop/package.json` (ou cria a próxima);
  - cria a tag, e o GitHub monta o instalador.
  - Você não publica sozinho: quando terminar uma rodada, diga ao BOSS para rodar o 24.
- O BOSS prefere juntar várias melhorias e publicar uma vez, em vez de gerar versão nova toda hora.
- O repositório é **público**: nunca coloque chaves, senhas, tokens ou dados pessoais nos arquivos.

## Arquivos que você mantém atualizados
- `PLANO.md`: o plano de evolução. Marque `[x]` no que ficar pronto e acrescente ideias novas.
- `NOVIDADES.md`: o que mudou em cada versão, em linguagem simples para o público (com "• ", sem termos técnicos).
- Quando um recurso novo ficar pronto, avise o BOSS. A página do THEBOSS CUT no site (Hub) mostra a lista de recursos, e quem atualiza o site é o Claude do app.
