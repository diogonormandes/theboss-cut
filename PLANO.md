# THEBOSS CUT — plano de evolução

Meta: nível CapCut/Premiere, muito intuitivo, premium (preto e dourado), em português, inglês e espanhol.
Ordem sugerida: cada etapa vira uma versão publicada (ferramenta 24).

## O que já existe (base OpenCut)
- [x] Linha do tempo com várias faixas, cortar/dividir/juntar, textos, adesivos, áudio com forma de onda
- [x] Máscaras, efeitos, velocidade, animação básica, exportar MP4
- [x] Transcrição de fala no próprio PC (base para legendas automáticas) e importar/exportar SRT
- [x] Programa para Windows com instalador automático pelo GitHub

## Etapa 1 — Cara de THEBOSSVERSE + 3 idiomas
- [x] Sistema de idiomas (PT padrão, EN, ES) com seletor de bandeiras premium (com reflexo de luz, iguais às do THEBOSSVERSE) na tela de projetos e no menu do logo do editor; 100% da interface traduzida
- [x] Perguntar o idioma na primeira vez que o programa abre (bandeiras na tela de boas-vindas do tour)
- [x] Temas iguais aos do THEBOSSVERSE (14 temas, Dourado BOSS como padrão) aplicados em tudo (botões, painéis, linha do tempo, diálogos), com botão de paleta na tela de projetos e no editor
- [x] Fontes do THEBOSSVERSE (Geist no texto, Cormorant Garamond na marca e nos títulos) e o tridente 3D girando no lugar do logo
- [x] Ícones premium animados na barra lateral: pastilha de vidro com inclinação 3D + ouro metálico; cada ícone tem um movimento próprio ao passar o mouse; parados não gastam nada do PC (escolha do BOSS: mistura das opções E e F)
- [ ] Ideia: levar o mesmo estilo de ícone para a barra da linha do tempo e os menus
- [ ] Ideia: o THEBOSS CUT abrir com o mesmo tema escolhido no programa THEBOSSVERSE
- [x] Tela inicial premium: projetos recentes com miniatura, "Novo projeto" com formatos prontos (9:16, 16:9, 1:1, 4:5 e Automático); o formato escolhido fica travado (o primeiro vídeo não muda o tamanho)
- [x] Tirar da interface links, textos e logos do OpenCut (aviso só no LICENSE) — conferido; apagados os logos de patrocinadores que sobraram sem uso
- [x] Tour de boas-vindas curto (primeira vez, 6 passos com destaque na tela) e dicas nos botões que só têm ícone (com o atalho do teclado); "Ver o tour de novo" no menu do tridente
- [x] Salvamento automático e recuperar projeto se o PC desligar (salva menos de 1 s depois de cada mudança, salva ao fechar a janela, indicador "Salvo" no topo, aviso de recuperação na tela inicial, aviso se faltar espaço)
- [x] Atualização automática do editor (confere a página de versões ao abrir e a cada 6 h, baixa em segundo plano, "Atualizar agora" salva/instala/reabre, "Depois" instala ao fechar) — vale a partir da próxima versão publicada

## Etapa 2 — Legendas automáticas estilo CapCut
- [x] Transcrição em português/inglês/espanhol com escolha de qualidade (Rápida ~300 MB × Precisa ~760 MB, baixa só na 1ª vez) e tempo exato de cada palavra
- [x] Legenda palavra por palavra com destaque da palavra falada (cor, caixa ou karaokê; a palavra cresce) — na prévia e no vídeo exportado
- [x] Modelos de legenda prontos (BOSS dourado, neon, clássico, karaokê, caixa) e personalização (fonte, tamanho, cor, destaque, contorno, sombra, animação de entrada)
- [x] Editar o texto da legenda direto na tela e corrigir palavras (o destaque continua certo e as linhas se arrumam sozinhas) + dicionário de correções ("Bosch" → "BOSS") aplicado sozinho nas próximas legendas
- [x] Posição segura para vertical (a legenda nasce acima dos botões e da descrição do TikTok/Reels/Shorts)

- [ ] Ideia: lista com o texto de todas as legendas para corrigir rápido (como no CapCut)
- [ ] Ideia: escolher quantas palavras por legenda (1 a 6) e LETRAS MAIÚSCULAS
- [ ] Ideia: modelos de legenda com emoji automático

## Etapa 3 — Corte de live (o diferencial)
Decisões do BOSS (08/11/2026): o formato 9:16 (Dividido ou Seguir rosto) é perguntado a cada vez que os cortes são criados; a live NÃO é copiada para dentro do programa (aviso de "mídia offline" com "Localizar arquivo" se ela sumir); cortes sugeridos de até 60 s, exportados em Vídeos\THEBOSS CUT\<nome do projeto>.
Antes de liberar: testar com uma gravação real do OBS do BOSS.
- [x] Base: exportar, legendar e separar áudio de live longa sem estourar a memória (lê só o trecho usado; teste: corte de 60 s de uma live de 4 h em 0,5 s, pico de ~110–150 MB, áudio sincronizado em até 20 ms)
- [x] Importar live longa SEM copiar (arquivo continua onde o OBS salvou; "Mídia offline" + "Localizar arquivo" se ele sumir; exportar com mídia offline avisa em vez de sair preto)
- [x] Mapa da live: faixa acima da linha do tempo com fala, gritos, picos e silêncio; clicar leva ao ponto; fica guardado (teste: live de 4 h analisada em ~80 s, 73 MB de memória, 90 de 90 gritos achados)
- [ ] Risadas no mapa (classificador de áudio só nos melhores trechos — fase 2)
- [x] Base dos vários cortes: desfazer (Ctrl+Z) sempre na cena certa; criar várias cenas a partir de trechos num passo só
- [ ] Cortar silêncios automaticamente (com ajuste de intensidade)
- [ ] Sugerir os melhores momentos e montar vários cortes de uma vez
- [ ] Enquadramento automático 9:16 seguindo o rosto
- [ ] Exportar vários cortes em fila

- [ ] Arrumar 5 testes automáticos antigos que já vinham quebrados do projeto original (máscaras, posicionamento, atalhos)
- [ ] Testar no programa do Windows: permissão para reabrir a live sem copiar depois de fechar o programa

## Etapa 4 — Efeitos, transições e modelos
- [ ] Pacote de efeitos (zoom, tremida, flash, brilho, desfoque, câmera lenta suave)
- [ ] Transições prontas com prévia ao passar o mouse
- [ ] Modelos THEBOSSVERSE: abertura, encerramento, nome na tela, "segue o BOSS"
- [ ] Importar a própria pasta de efeitos sonoros e arquivos .mov (com transparência)
- [ ] Músicas e efeitos sonoros: ajuste de volume, fade e redução automática da música quando há fala

## Etapa 5 — Ferramentas profissionais
- [ ] Quadros-chave (keyframes) visuais fáceis para posição, tamanho, giro e opacidade
- [ ] Correção de cor e filtros (LUT), ajustes de brilho/contraste/saturação
- [ ] Chroma key (fundo verde) e remover fundo
- [ ] Curva de velocidade e congelar quadro
- [ ] Melhorar voz / tirar ruído
- [ ] Atalhos de teclado iguais aos editores famosos, com tela de atalhos

## Etapa 6 — Exportação
- [ ] Modelos de exportação: TikTok, Reels, Shorts, YouTube, Story
- [ ] Escolha de qualidade e tamanho estimado do arquivo; fila de exportação
- [ ] Usar a placa de vídeo quando disponível para exportar mais rápido
