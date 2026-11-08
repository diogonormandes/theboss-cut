# THEBOSS CUT

O editor de vídeo do **THEBOSSVERSE**: corte, legendas, textos, efeitos e exportação, tudo no seu computador.

- **Seus vídeos ficam com você:** nada é enviado para a internet; os projetos ficam guardados no próprio PC.
- **Sem conta e sem anúncios.**
- **Programa para Windows:** baixe o instalador na página de versões (Releases) ou pelo Hub do THEBOSSVERSE.

## Como é montado

- `apps/web/` — o editor (Next.js), que roda dentro do programa.
- `desktop/` — o programa para Windows (Electron): liga o editor no próprio PC e abre a janela.
- `.github/workflows/instalador.yml` — monta o instalador sozinho a cada nova versão (etiqueta `vX.Y.Z`).

## Licença

Baseado em código aberto sob a licença MIT (veja o arquivo `LICENSE`).
