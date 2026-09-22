# VoteHope

Questionários de múltipla escolha e enquetes para a sala de aula, hospedados por
você mesmo. Os questionários são escritos no navegador e aplicados de dois modos:
**ao vivo** — as perguntas no projetor e os alunos respondendo pelo celular, depois
de ler um QR code — ou **no próprio ritmo**, em que cada aluno percorre o
questionário sozinho.

Sem contas de usuário, sem assinaturas, sem serviços de terceiros: as perguntas, as
respostas e as imagens ficam na máquina em que você o executa.

*[Read in English](README.md).*

## O que ele faz

- **Sessões ao vivo.** Os alunos entram com um QR code ou um código de 6 dígitos.
  Você mostra uma pergunta de cada vez e a encerra quando quiser; um gráfico das
  respostas aparece no projetor. Os celulares não mostram notas nem certo/errado.
- **Sessões no próprio ritmo.** Cada aluno responde sozinho, com tempo opcional
  para o questionário inteiro ou por pergunta, e confirma antes de enviar.
- **As perguntas** podem ter uma ou várias alternativas corretas, ou ser enquetes
  (sem resposta certa, só popularidade). O texto é Markdown com fórmulas LaTeX
  (`$x^2$`) e imagens.
- **As alternativas são sempre embaralhadas**; a ordem das perguntas também pode
  ser embaralhada nas sessões no próprio ritmo.
- **Resultados** por aluno, por pergunta e em forma de grade, com download em CSV.
- **Interface em português e inglês**, escolhida em cada navegador.

Foi feito para um apresentador e até cerca de 50 alunos por sessão.

## Começando com Docker

Você precisa do [Docker](https://docs.docker.com/get-started/get-docker/) e de um
domínio apontando para a máquina. O `docker-compose.yml` incluído executa o
VoteHope atrás do [Caddy](https://caddyserver.com), que obtém os certificados
HTTPS sozinho.

```bash
git clone <este repositório> votehope && cd votehope
```

1. Troque `quiz.example.org` pelo seu domínio no `docker-compose.yml` e no
   `deploy/Caddyfile`.
2. Escolha uma senha de apresentador e gere o hash dela. O Compose se recusa a
   rodar enquanto o hash não existir, então construa a imagem e chame a ferramenta
   diretamente:

   ```bash
   docker build -t votehope . && docker run --rm votehope npm run hash-password -- 'sua senha'
   ```

3. Coloque a linha impressa num arquivo `.env` ao lado do `docker-compose.yml`:

   ```
   ADMIN_PASSWORD_HASH=scrypt:16384:8:1:...
   ```

4. Suba tudo:

   ```bash
   docker compose up -d --build
   ```

Abra `https://seu.dominio/admin`, entre com a senha e escreva o primeiro
questionário. Os alunos vão a `https://seu.dominio` — ou apenas leem o QR code.

## Na rede da escola, sem domínio

Não é preciso domínio nem certificado: qualquer máquina no mesmo Wi-Fi serve.

```bash
npm install
npm run build
ADMIN_PASSWORD='sua senha' HOST=0.0.0.0 npm start
```

Depois abra a página de administração **pelo endereço de rede do computador**, e
não por `localhost` — por exemplo `http://192.168.1.23:3000/admin`. Os links e os
QR codes copiam o endereço que você estiver usando, de modo que os celulares na
mesma rede conseguem abri-los. (Se o link mostrar `localhost`, o VoteHope avisa:
os celulares não conseguem resolvê-lo.) Para fixar o endereço, use `PUBLIC_URL`:

```bash
PUBLIC_URL=http://192.168.1.23:3000 ADMIN_PASSWORD='sua senha' HOST=0.0.0.0 npm start
```

Em HTTP simples tudo funciona, menos a área de transferência do navegador: o botão
"Copiar link" passa a apenas selecionar o texto.

## A senha do apresentador

Não há contas de usuário. Uma única senha protege tudo o que escreve: criar
questionários, iniciar sessões e ver resultados. Os alunos não precisam de senha —
apenas do código da sessão.

Defina-a com uma das duas variáveis:

- `ADMIN_PASSWORD_HASH` — preferível. Gere com `npm run hash-password`; assim a
  senha em texto puro nunca fica guardada no servidor.
- `ADMIN_PASSWORD` — a própria senha, para uma execução local rápida.

O login é um cookie assinado com uma chave guardada em `DATA_DIR`, e por isso
sobrevive a reinicializações. Trocar a senha invalida todos os logins.

## Configuração

Variáveis de ambiente, ou um arquivo `.env` junto ao projeto:

| Variável | Padrão | Significado |
|---|---|---|
| `ADMIN_PASSWORD_HASH` | — | Hash da senha do apresentador (preferível) |
| `ADMIN_PASSWORD` | — | Senha em texto puro (se não houver hash) |
| `PUBLIC_URL` | endereço no navegador do apresentador | Endereço usado pelos alunos; vai nos links e QR codes |
| `PORT` | `3000` | Porta HTTP |
| `HOST` | `127.0.0.1` (dev) / `0.0.0.0` (produção) | Interface em que escuta |
| `DATA_DIR` | `./data` | Banco de dados, imagens enviadas, segredo de sessão |
| `TRUST_PROXY` | `false` | Use `true` atrás de um proxy reverso |
| `SESSION_SECRET` | gerado | Chave que assina os cookies de login |

## Seus dados

Tudo fica em `DATA_DIR` (o volume `votehope-data` no Docker): `votehope.db`, as
imagens enviadas em `media/` e o `session-secret`.

- **Backup:** pare o servidor e copie esse diretório.

  ```bash
  docker compose stop votehope
  docker run --rm -v votehope_votehope-data:/data -v "$PWD:/backup" busybox \
    tar czf /backup/votehope-backup.tgz -C /data .
  docker compose start votehope
  ```

  O nome do volume começa com o nome da pasta em que você clonou o projeto; o
  `docker volume ls` mostra qual é o da sua máquina.

- **Atualizar:** `git pull && docker compose up -d --build`. O banco migra sozinho
  ao iniciar.
- **Levar um questionário** de uma instalação para outra não exige backup: use
  Exportar e Importar na lista de questionários, o que gera um `.zip` com as
  perguntas e suas imagens.
- Imagens a que nenhum questionário e nenhuma sessão se refere mais são apagadas
  automaticamente, no mínimo um dia depois de terem sido enviadas.
- Nada é enviado para fora. Os alunos são identificados pelo nome (e, se você
  pedir, pelo e-mail) que digitam ao entrar, e você pode apagar uma sessão com
  todas as respostas a qualquer momento.

## Desenvolvimento

Requer Node.js 24 ou mais novo.

```bash
npm install
cp .env.example .env   # depois defina ADMIN_PASSWORD
npm run dev            # API na :3000, aplicação em http://localhost:5173
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor (com reinício automático) + Vite com recarga instantânea |
| `npm test` | Executa os testes |
| `npm run check` | Verifica os tipos do servidor e do código Svelte |
| `npm run build` | Compila o front end em `dist/client` |
| `npm start` | Executa o servidor, servindo o front end compilado na :3000 |
| `npm run hash-password` | Imprime um hash para `ADMIN_PASSWORD_HASH` |

O [SPEC.md](SPEC.md) descreve como o sistema deve se comportar e por quê; o
[CLAUDE.md](CLAUDE.md) reúne as convenções seguidas pelo código.
