# Projetos 3D — TEMON

Plataforma web independente, destinada à modelagem, documentação e controle de revisões para **Bambu Lab A1** (256 × 256 × 256 mm, bico nominal de 0,4 mm).

## Arquitetura

- **Frontend**: HTML, CSS e JavaScript ES Modules estáticos. O visualizador 3D usa Three.js via CDN com versão fixa.
- **Banco / autenticação**: Supabase do ambiente TEMON_1700, tabelas de domínio `p3d_`, políticas RLS por proprietário e chave **publicável**, nunca chave secreta.
- **Arquivos CAD**: referências para Google Drive. STL não fica embutido no banco.
- **Hospedagem**: Vercel, projeto `projetos-3d`. **Não é o TEMON Field.**

## Desenvolvimento

Não são necessárias instalações para abrir o site publicado. Para checar o código:

```bash
node --version
npm run check
```

O projeto não necessita `npm install` para o frontend porque utiliza módulos JS importados de CDN via `importmap`. O CI valida a sintaxe JavaScript, os caminhos e os controles estáticos essenciais. A validação não substitui testes de login, browser WebGL, encaixes, fatiamento nem impressão física.

## GitHub + Vercel

1. Use o repositório existente `helderkobayashi/PROJETO-3D` na sua conta GitHub.
2. Faça upload dos arquivos e pastas deste diretório na raiz do novo repositório, mantendo `index.html` na raiz (não dentro de uma pasta extra).
3. No painel do projeto Vercel **projetos-3d**, abra **Settings → Git → Connect Git Repository** e selecione o repositório `PROJETOS-3D` (não o repositório `TEMON-FIELD`).
4. Confirme branch de produção `main`, Framework Preset `Other`, Root Directory `./`. O projeto não exige build command.
5. Aguarde o deploy gerado pelo commit; verifique **Deployments** e o domínio `https://projetos-3d.vercel.app`.

Ao publicar, o Git é a origem da aplicação. Alterações apenas no banco de dados Supabase não geram commits de frontend.

## Segurança e acesso

O modo demonstração não mostra os registros reais. Apenas usuários do **Supabase Auth** que sejam proprietários dos registros `p3d_` podem consultar ou editar seus projetos. O login GitHub ou Vercel não autentica automaticamente no Supabase.

Não armazene senhas, tokens do GitHub, `service_role` ou chaves secretas neste repositório. O arquivo `app.js` contém somente a chave publicável do cliente Supabase, cuja proteção depende de RLS ativo e corretamente configurado.

## R04 — Imagem para STL

- Abra **Imagem → STL**, carregue uma imagem PNG/JPG/WebP (até 12 MB).
- Por padrão, 100 mm de largura e 3 mm de espessura. Fundo transparente usa canal alfa; JPG ou PNG opaco usa recorte por brilho (limiar editável).
- O desenho é processado localmente, sem upload. São extraídos contornos externos, ilhas e furos e então gerados sólidos extrudados com Three.js.
- **Gerar relevo 3D** mostra a prévia; **Exportar STL** baixa STL binário em milímetros. Antes de exportar ocorre verificação topológica básica de arestas.
- A função gera **silhuetas 2,5D**, não IA capaz de inferir laterais e costas; detalhes finos, adesão à mesa, suporte e resistência necessitam de validação no Bambu Studio e impressão de teste.
- Código isolado em `image-to-stl.js` e testes puros em `tests/relief.test.mjs`. `npm run check` executa as nove verificações.

## Estado / limitações

A R03 é uma aplicação funcional em evolução. O botão de STL do gerador cria uma **prévia geométrica**, sem garantir encaixes ou texto em relevo. Use a fonte SCAD para a geometria final e verifique no Bambu Studio. Os arquivos STL de projetos anteriores continuam disponíveis na pasta Google Drive do projeto.


## R05 — Correção de silhuetas complexas

- Novo modo **Objeto inteiro (fundo branco/claro)**: remove áreas claras conectadas à borda e mantém cores internas do personagem como parte da silhueta.
- Modo **Áreas escuras** preservado para desenho em preto e branco.
- Depois de gerar, a imagem 2D mostra o recorte em azul, facilitando verificar o que entrará no STL.
- Implementado mecanismo de reconstrução robusta por pixels (tampas e paredes somente nos limites; índices de vértices compartilhados). Para imagens de fundo claro, usa automaticamente a via robusta. Em desenhos preto e branco, é fallback se a triangulação usual falhar.
- Topologia conferida antes do download; compatibilidade real precisa ser verificada no Bambu Studio.
- A função continua sendo uma **extrusão 2,5D**, não um modelo volumétrico completo tipo IA.

## R05.1 — Publicação e cache

- A interface apresenta explicitamente a revisão **R05.1**.
- `index.html` referencia `styles.css?v=R05.1` e `app.js?v=R05.1`.
- O módulo de conversão é importado como `image-to-stl.js?v=R05.1`, evitando carregar uma cópia antiga da revisão R04/R05 em cache.
- O `vercel.json` exige revalidação dos recursos estáticos com `Cache-Control: no-cache, max-age=0, must-revalidate`.
- Não altera processamento, dados do Supabase nem o TEMON Field.
