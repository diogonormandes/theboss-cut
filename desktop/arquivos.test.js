// Testes da parte pura da ponte de arquivos (rodar: npx -y bun@1.2.18 test desktop/arquivos.test.js)
const { describe, expect, test } = require("bun:test");
const path = require("path");
const { sanearNome, sanearNomeArquivo, caminhoLivre, dentroDe } = require("./arquivos");

describe("sanearNome", () => {
  test("troca caracteres proibidos do Windows", () => {
    expect(sanearNome('Live: dia 1/2 "final"?')).toBe("Live- dia 1-2 -final--");
  });
  test("não deixa subir de pasta", () => {
    expect(sanearNome("..\\..\\Windows")).toBe("-..-Windows");
    expect(sanearNome("..")).toBe("Sem nome");
    expect(sanearNome("../x")).toBe("-x");
  });
  test("tira pontos e espaços das pontas e caracteres de controle", () => {
    expect(sanearNome("  meu projeto.  ")).toBe("meu projeto");
    expect(sanearNome("a\u0000b\nc")).toBe("abc");
  });
  test("nomes reservados e vazios viram o padrão", () => {
    expect(sanearNome("CON")).toBe("Sem nome");
    expect(sanearNome("lpt1.txt", "X")).toBe("X");
    expect(sanearNome("", "Projeto")).toBe("Projeto");
    expect(sanearNome(undefined, "Projeto")).toBe("Projeto");
  });
  test("limita o tamanho", () => {
    expect(sanearNome("a".repeat(500)).length).toBe(120);
  });
});

describe("sanearNomeArquivo", () => {
  test("aceita só mp4 e webm", () => {
    expect(sanearNomeArquivo("Corte 01 - Jogada.mp4")).toBe("Corte 01 - Jogada.mp4");
    expect(sanearNomeArquivo("Corte.WEBM")).toBe("Corte.webm");
    expect(sanearNomeArquivo("virus.exe")).toBeNull();
    expect(sanearNomeArquivo("corte.mp4.exe")).toBeNull();
    expect(sanearNomeArquivo("semextensao")).toBeNull();
  });
  test("limpa a parte do nome", () => {
    expect(sanearNomeArquivo("..\\..\\x.mp4")).toBe("-..-x.mp4");
    expect(sanearNomeArquivo("CON.mp4")).toBe("Corte.mp4");
    expect(sanearNomeArquivo(".mp4")).toBeNull();
  });
});

describe("caminhoLivre", () => {
  const pasta = path.join("C:", "Videos", "THEBOSS CUT", "P");
  test("usa o nome quando está livre", () => {
    expect(caminhoLivre(pasta, "Corte.mp4", () => false)).toBe(path.join(pasta, "Corte.mp4"));
  });
  test("nunca sobrescreve: acrescenta (2), (3)", () => {
    const existentes = new Set([path.join(pasta, "Corte.mp4"), path.join(pasta, "Corte (2).mp4")]);
    expect(caminhoLivre(pasta, "Corte.mp4", (p) => existentes.has(p))).toBe(path.join(pasta, "Corte (3).mp4"));
  });
  test("desiste se tudo estiver ocupado", () => {
    expect(caminhoLivre(pasta, "Corte.mp4", () => true)).toBeNull();
  });
});

describe("dentroDe", () => {
  const raiz = path.resolve("C:/Users/x/Videos/THEBOSS CUT");
  test("aceita a raiz e o que está dentro", () => {
    expect(dentroDe(raiz, raiz)).toBe(true);
    expect(dentroDe(raiz, path.join(raiz, "Projeto", "Corte.mp4"))).toBe(true);
  });
  test("recusa fora da raiz", () => {
    expect(dentroDe(raiz, path.join(raiz, "..", "outro.mp4"))).toBe(false);
    expect(dentroDe(raiz, path.resolve("C:/Windows/System32/x.mp4"))).toBe(false);
    expect(dentroDe(raiz, raiz + " 2\\x.mp4")).toBe(false);
    expect(dentroDe(raiz, "D:\\x.mp4")).toBe(false);
  });
  test("recusa valores que não são texto", () => {
    expect(dentroDe(raiz, undefined)).toBe(false);
    expect(dentroDe(raiz, "")).toBe(false);
    expect(dentroDe(raiz, 42)).toBe(false);
  });
});
