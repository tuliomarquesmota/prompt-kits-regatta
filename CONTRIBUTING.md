# Como trabalhamos

Dois sócios programando juntos, cada um com sua conta do GitHub e sua IA. Sem fork: os dois são colaboradores deste repositório.

## As três peças

- **`main`**: a versão oficial, a que vai para o ar. Ninguém envia direto para ela.
- **Branch**: um rascunho separado para cada tarefa. Cada um trabalha no seu sem atrapalhar o outro.
- **Pull Request (PR)**: o pedido para juntar o rascunho na `main`. O GitHub roda as verificações e o outro sócio revisa.

## Passo a passo de uma tarefa

1. **Escolha a tarefa** nas [Issues](../../issues) e coloque seu nome nela (Assignees), para o outro saber que você está nela
2. **Atualize** sua cópia: `git checkout main && git pull`
3. **Crie o branch**: `git checkout -b feat/tela-stock`
   - `feat/` funcionalidade nova · `fix/` correção · `docs/` documentação
4. **Trabalhe** com a sua IA. Ela deve seguir o [`AGENTS.md`](AGENTS.md)
5. **Verifique**: `npm run check` e `npm run build`. Se a formatação falhar, `npm run format`
6. **Envie**: `git add -A && git commit -m "Adiciona tela de stock" && git push -u origin feat/tela-stock`
7. **Abra o PR** no GitHub (aparece um botão "Compare & pull request"). Preencha o modelo e escreva `Fecha #12` com o número da issue
8. **Espere a verificação** ficar verde ✅. Se ficar vermelha ❌, abra os detalhes, corrija e envie de novo no mesmo branch
9. **O outro sócio revisa** e aprova (ou pede ajustes)
10. **Junte** com "Squash and merge" e apague o branch

Pela interface do GitHub (sem terminal) também dá: edite o arquivo no site, escolha "Create a new branch" na hora de salvar e o GitHub já oferece abrir o PR.

## Para não pisar no pé do outro

- **Dividam por área.** Exemplo: Túlio nas telas e no visual; Adriano nas regras do negócio, fornecedores, etiquetas e números
- **Tarefas pequenas.** Um PR por tela ou por fornecedor. PR pequeno é revisado rápido e quase nunca dá conflito
- **Migrations**: antes de criar `00X_algo.sql`, avise o outro, para os dois não usarem o mesmo número
- **Conflito** ("This branch has conflicts"): o GitHub mostra as linhas em disputa. Resolvam juntos, numa chamada se precisar

## Revisando o PR do outro

- A verificação está verde?
- A mudança faz o que a issue pedia?
- Segue o `AGENTS.md`? (stack, idioma, `org_id`/RLS, teste para fornecedor novo)
- Mudou tela: tem print? Funciona no celular?
- Na dúvida, comente na linha e pergunte. Revisar é proteger o código dos dois

## Onde fica cada coisa

| O quê                                | Onde                                         |
| ------------------------------------ | -------------------------------------------- |
| Código do sistema                    | este repositório                             |
| Regras para pessoas e IAs            | [`AGENTS.md`](AGENTS.md)                     |
| Plano de fases e decisões            | [`docs/plano.md`](docs/plano.md)             |
| Etiquetas de cada fornecedor e fotos | [`docs/etiquetas.md`](docs/etiquetas.md)     |
| Protótipos (referência visual)       | [`docs/prototipos/`](docs/prototipos/)       |
| Como usar Claude ou ChatGPT          | [`docs/usar-com-ia.md`](docs/usar-com-ia.md) |
| Lista de tarefas                     | [Issues](../../issues)                       |
