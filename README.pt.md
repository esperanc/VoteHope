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

Não é preciso domínio nem certificado: qualquer máquina no mesmo Wi-Fi serve, e os
alunos chegam a ela pelo endereço que ela tem nessa rede. Um único comando faz tudo:

```bash
npm install
npm run serve:lan
```

Ele descobre o endereço da máquina na rede, compila o front end se isso ainda não
tiver sido feito, pede uma senha de apresentador na primeira vez — guardando apenas
o hash, no `.env` — e então mostra o que abrir:

```
──────────────────────────────────────────────────────────
  VoteHope is running on this network.

  Students     http://192.168.1.23:3000
  Presenter    http://192.168.1.23:3000/admin
──────────────────────────────────────────────────────────
```

Os links e os QR codes levam esse endereço, de modo que os celulares no Wi-Fi
conseguem abri-los. O endereço é descoberto de novo a cada início: quando o
roteador der outro à máquina, basta parar com Ctrl+C e rodar o comando de novo.

Algumas coisas que vale saber sobre esse modo:

- Em HTTP simples tudo funciona, menos a área de transferência do navegador: o
  botão "Copiar link" passa a apenas selecionar o texto.
- A máquina precisa ficar ligada e na mesma rede durante toda a sessão.
- Na primeira vez, o macOS pergunta se o "node" pode aceitar conexões de rede, e é
  preciso permitir. Se for negado, os celulares não conseguem conectar enquanto o
  navegador do próprio apresentador — que não sai da máquina — funciona
  perfeitamente, de modo que tudo parece certo visto da frente da sala. Para
  desfazer: Ajustes do Sistema → Rede → Firewall → Opções. No Linux, abra a porta
  como de costume (`sudo ufw allow 3000`).
- O mesmo sintoma — os celulares não conectam, esta máquina sim — também aparece em
  redes de escola que impedem os aparelhos de conversarem entre si ("isolamento de
  clientes"). Nesse caso, usar o celular como roteador resolve na hora.

Para fazer à mão — com endereço fixo, ou com um nome do DNS da própria escola —
defina `PUBLIC_URL` e sirva o front end já compilado:

```bash
npm run build
PUBLIC_URL=http://192.168.1.23:3000 ADMIN_PASSWORD='sua senha' HOST=0.0.0.0 npm start
```

Abrir a página de administração pelo endereço de rede da máquina, e não por
`localhost`, já basta mesmo sem `PUBLIC_URL`: os links copiam o endereço que você
estiver usando. Se algum deles mostrar `localhost`, o VoteHope avisa, já que os
celulares não conseguem resolvê-lo.

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

## Escrevendo questionários sem o editor

Um questionário também pode ser escrito como arquivo — à mão, ou por um script que
transforme material já existente em perguntas — e trazido com **Importar**, na lista
de questionários. Ele então abre no editor, que aponta o que ainda estiver incompleto
(uma alternativa faltando, nenhuma resposta certa marcada) antes que possa ser aplicado.

Um arquivo de questionário é um `quiz.json`, sozinho ou num zip junto com as imagens.
Só o título, as perguntas e suas alternativas são obrigatórios:

```json
{
  "title": "Derivadas: aquecimento",
  "questions": [
    {
      "body": "Qual é a derivada de $x^2$?",
      "options": [
        { "body": "$x$" },
        { "body": "$2x$", "correct": true },
        { "body": "$\\frac{x^3}{3}$" }
      ]
    },
    {
      "body": "Quais funções são contínuas em todos os números reais?",
      "options": [
        { "body": "$\\sin x$", "correct": true },
        { "body": "$|x|$", "correct": true },
        { "body": "$\\frac{1}{x}$" }
      ]
    },
    {
      "kind": "poll",
      "body": "Quão seguro você se sente com a regra da cadeia?",
      "timeLimitS": 20,
      "options": [
        { "body": "Muito" },
        { "body": "Mais ou menos" },
        { "body": "Ainda não" }
      ]
    }
  ]
}
```

**Barras invertidas.** Em JSON, toda barra invertida é escrita duas vezes: `\\frac`,
`\\theta`, `\\sqrt`. Com uma só, alguns comandos tornam o arquivo inválido (`\sqrt`,
`\sin`), enquanto outros viram, sem aviso, caracteres invisíveis (`\frac`, `\theta`,
`\times`, `\nabla`). A importação pega os casos comuns e diz onde estão. Uma quebra de
linha dentro de um texto é escrita `\n`.

### Campos

**Questionário**

| Campo | Se omitido | Significado |
|---|---|---|
| `title` | obrigatório | Até 200 caracteres |
| `questions` | obrigatório | Até 200 perguntas |
| `description` | vazio | Observações sobre o questionário, até 2000 caracteres |
| `defaultTimeLimitS` | `30` | Segundos para cada pergunta, de 5 a 600, nas sessões ao vivo e nas sessões no próprio ritmo com tempo por pergunta |

**Pergunta**

| Campo | Se omitido | Significado |
|---|---|---|
| `body` | obrigatório | A pergunta: Markdown com fórmulas `$…$` e `$$…$$`, até 10 000 caracteres |
| `options` | obrigatório | De 2 a 10 alternativas |
| `kind` | `"quiz"` | `"quiz"` tem alternativas corretas; `"poll"` (enquete) não tem, e só se mostra quantos escolheram cada alternativa |
| `selection` | decorre das alternativas | `"single"` (o aluno escolhe uma alternativa) ou `"multiple"` (uma ou mais). Se omitido, é `"multiple"` quando há mais de uma alternativa correta |
| `timeLimitS` | o do questionário | Segundos só para esta pergunta |

**Alternativa**

| Campo | Se omitido | Significado |
|---|---|---|
| `body` | obrigatório | Markdown com fórmulas, até 2000 caracteres |
| `correct` | `false` | Se escolhê-la está certo. Uma pergunta só conta como certa quando exatamente as alternativas corretas são escolhidas |

Perguntas e alternativas também podem ter um `id`; quando falta, um é criado.

### Imagens

Coloque as imagens numa pasta `media` ao lado do `quiz.json`, mostre-as com
`![descrição](media/grafico.png)` e junte os dois num zip:

```
derivadas/
├── quiz.json
└── media/
    ├── grafico.png
    └── circuito.svg
```

```bash
cd derivadas && zip -r ../derivadas.zip quiz.json media
```

Comprimir a pasta pelo Finder ou pelo Explorador do Windows também funciona. São
aceitas imagens PNG, JPEG, WebP, GIF e SVG de até 15 MB, tratadas como as adicionadas
no editor: fotos são reduzidas e perdem os metadados.

### Quando algo está errado

A importação lista cada problema que encontrar, com o lugar onde está — por exemplo
`Pergunta 3 › alternativa 2 › correct: Invalid input: expected boolean, received string`.
Um arquivo com problemas não é importado; um questionário apenas incompleto é
importado, e o editor mostra o que falta.

**Exportar**, na lista de questionários, gera o mesmo formato, com todos os `id`
preenchidos e o questionário envolvido em `{"format": "votehope-quiz", "version": 1, "quiz": …}`.
As duas formas podem ser importadas, então um questionário exportado também é um bom
ponto de partida para escrever outros.

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
