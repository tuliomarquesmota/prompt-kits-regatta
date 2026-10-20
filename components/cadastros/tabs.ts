// Abas de Cadastros. Empresa e Equipe têm rota própria (/empresa, /equipe); Equipe fica dentro de Empresa.
export const CADASTRO_TABS = [
  { key: "", label: "Produtos" },
  { key: "fornecedores", label: "Fornecedores" },
  { key: "camaras", label: "Câmaras" },
  { key: "empresa", label: "Empresa" },
];

/** Dentro de Empresa: dados que vão na invoice e a equipe com acesso. */
export const EMPRESA_TABS = [
  { key: "empresa", label: "Dados da empresa" },
  { key: "equipe", label: "Equipe" },
];

export function cadastroHref(key: string): string {
  if (key === "empresa" || key === "equipe") return `/${key}`;
  return key ? `/cadastros?aba=${key}` : "/cadastros";
}
