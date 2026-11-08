// Parte do tema que o servidor também usa (sem nada de tela): aplicar o tema antes de desenhar.

export const DEFAULT_THEME = "dourado";
export const THEME_STORAGE_KEY = "thebosscut-tema";

/** Roda no <head> antes da tela aparecer: aplica o tema guardado. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t&&t!=="${DEFAULT_THEME}")document.documentElement.setAttribute("data-tema",t)}catch(e){}`;
