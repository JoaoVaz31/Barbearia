## Barbearia – Sistema de Agendamentos Art Of Fade

Aplicação web para gestão de uma barbearia, com **site institucional**, **página de marcação online** e **área de administração**.  
O backend é construído em **Node.js + Express**, com a base de dados em **Supabase (Postgres)**, e o deploy é feito na **Vercel**.

---

### Funcionalidades

- **Site institucional**:
  - Página inicial com apresentação da barbearia Art Of Fade.
  - Secções de **serviços**, **barbeiros**, **sobre**, **espaço**, **testemunhos** e **contactos**.
- **Marcação online**:
  - Página `marcacao.html` para que os clientes possam escolher dia/hora disponíveis e agendar.
  - Validação de horários ocupados (não permite agendar em horários já reservados).
- **Área de administração** (protegida por password):
  - `admin.html` para consulta/cancelamento de reservas e registo de pagamentos.
  - `admin-metricas.html` com faturação mensal (serviços e produtos) por método de pagamento, e registo manual de vendas de produtos.
- **API REST**:
  - Endpoints para listar horários ocupados, dias cheios, criar novas marcações, cancelar reservas, registar pagamentos e vendas de produtos, e consultar métricas.
- **Base de dados Supabase (Postgres)**:
  - Tabelas `marcacoes` e `vendas_produtos`, acedidas via `@supabase/supabase-js`.

---

### Tecnologias utilizadas

- **Backend**
  - Node.js
  - Express
  - CORS
  - cookie-parser (autenticação simples do admin)
  - Supabase (`@supabase/supabase-js`)
- **Frontend**
  - HTML5, CSS3
  - Bootstrap 5
- **Deploy**
  - Vercel (função serverless a embrulhar o Express, ver `api/index.js` e `vercel.json`)

---

### Estrutura do projeto (principal)

- **`server.js`**: servidor Express, configuração de CORS, JSON, rotas de páginas e rotas da API.
- **`database.js`**: cliente Supabase, inicializado a partir de `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`.
- **`api/index.js`**: entrypoint da função serverless usada pela Vercel.
- **`vercel.json`**: configuração de rewrites para a Vercel.
- **`public/`**: ficheiros estáticos (HTML, CSS, imagens).
  - `index.html` – página principal do site.
  - `marcacao.html` – ecrã de agendamento (com seleção de serviço/preço).
  - `admin.html` – área de administração (reservas e pagamentos).
  - `admin-metricas.html` – métricas mensais e registo de vendas de produtos.
  - `admin-login.html` – login do painel de administração.
  - `produtos.html` – catálogo de produtos (informativo, venda só na loja física).
  - `images/` – logótipo, fotos de serviços e espaço.

---

### Requisitos

- **Node.js** instalado (versão 18+ recomendada).
- **npm** (geralmente incluído com o Node).
- Um projeto **Supabase** criado, com a tabela `marcacoes` (ver secção "Base de dados").

---

### Instalação

1. **Clonar o repositório**
   ```bash
   git clone <URL_DO_REPOSITORIO>
   cd Barbearia
   ```

2. **Instalar dependências**
   ```bash
   npm install
   ```

3. **Configurar variáveis de ambiente**
   - Copiar `.env.example` para `.env`.
   - Preencher `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` com os valores do teu projeto Supabase (`Project Settings → API`).
   - Definir `ADMIN_PASSWORD` com a password de acesso ao painel `/admin`.

---

### Como executar o projeto

1. **Iniciar o servidor Node**
   ```bash
   npm start
   ```

2. **Aceder ao site**
   - Abrir o navegador em: `http://localhost:3000`

3. **Páginas principais**
   - **Site institucional**: `http://localhost:3000/`
   - **Marcação online**: `http://localhost:3000/marcacao`
   - **Administração**: `http://localhost:3000/admin`

> **Nota:** o servidor, por omissão, corre na porta **3000** (ver variável `port` em `server.js`).

---

### Base de dados

O projeto usa duas tabelas no Supabase (Postgres), criadas manualmente via SQL Editor:

```sql
create table marcacoes (
  id bigint generated always as identity primary key,
  nome text not null,
  telefone text not null,
  data_hora timestamp not null,
  servico text not null default 'Corte',
  preco numeric not null default 0,
  pago boolean not null default false,
  metodo_pagamento text
);

create table vendas_produtos (
  id bigint generated always as identity primary key,
  produto text not null,
  preco numeric not null,
  metodo_pagamento text not null,
  data timestamp not null default now()
);
```

- **`marcacoes`**: cada marcação tem um serviço e um preço fixados no momento em que o cliente agenda (ver `SERVICOS` em `server.js`), e fica `pago = false` até o admin registar o pagamento.
- **`vendas_produtos`**: registo manual de vendas de produtos feitas na loja física (não há checkout online).

O catálogo de serviços/preços e os métodos de pagamento aceites estão centralizados em `server.js` (`SERVICOS` e `METODOS_PAGAMENTO`) e expostos pela rota pública `GET /config`.

---

### Rotas HTTP (API)

Todas as rotas abaixo são expostas pelo servidor Express em `server.js`.

#### Rotas de páginas

- **GET `/`**
  - Devolve a página principal (`public/index.html`).

- **GET `/marcacao`**
  - Devolve a página de marcação (`public/marcacao.html`).

- **GET `/admin`** *(requer sessão de admin)*
  - Devolve a página de administração (`public/admin.html`). Sem sessão válida, redireciona para `/admin-login.html`.

- **GET `/admin-metricas`** *(requer sessão de admin)*
  - Devolve a página de métricas (`public/admin-metricas.html`).

#### Configuração e autenticação

- **GET `/config`**
  - **Descrição**: devolve o catálogo de serviços/preços e os métodos de pagamento aceites.
  - **Resposta (200)**:
    ```json
    { "servicos": { "Corte": 12, "Barba": 8 }, "metodosPagamento": ["Dinheiro", "MBWay"] }
    ```

- **POST `/admin/login`**
  - **Corpo (JSON)**: `{ "senha": "..." }`.
  - Em caso de sucesso, define o cookie `admin_session` (httpOnly) e devolve `{ "success": true }`.
  - **Erros possíveis**: `401` – password incorreta.

- **POST `/admin/logout`**
  - Remove o cookie `admin_session`.

#### Rotas de marcações / reservas

- **GET `/horarios/:data`**
  - **Descrição**: devolve a lista de horas já ocupadas para uma data específica.
  - **Parâmetros de URL**:
    - `data` (obrigatório) – formato `YYYY-MM-DD`.
  - **Resposta (200)**:
    - Array de strings com horas no formato `HH:MM`, por exemplo:
      ```json
      ["09:00", "10:30", "14:00"]
      ```
  - **Erros possíveis**:
    - `400` – formato de data inválido.
    - `500` – erro ao consultar o banco de dados.

- **GET `/dias-ocupados`**
  - **Descrição**: devolve os dias que já atingiram ou ultrapassaram o limite de marcações (no código atual, `>= 8` marcações por dia).
  - **Resposta (200)**:
    - Array de datas em formato `YYYY-MM-DD`, por exemplo:
      ```json
      ["2025-01-10", "2025-01-15"]
      ```

- **GET `/reservas`** *(requer sessão de admin)*
  - **Descrição**: devolve todas as reservas registadas, ordenadas por data/hora descendente.
  - **Resposta (200)**:
    - Array de objetos:
      ```json
      [
        {
          "id": 1,
          "nome": "João Silva",
          "telefone": "910000000",
          "data_hora": "2025-01-10 09:00",
          "servico": "Corte",
          "preco": 12,
          "pago": false,
          "metodo_pagamento": null
        }
      ]
      ```

- **GET `/reservas/:data`** *(requer sessão de admin)*
  - **Descrição**: devolve as reservas de uma data específica.
  - **Parâmetros de URL**:
    - `data` (obrigatório) – formato `YYYY-MM-DD`.
  - **Erros possíveis**:
    - `400` – formato de data inválido.

- **DELETE `/reservas/:id`** *(requer sessão de admin)*
  - **Descrição**: cancela (apaga) uma reserva.
  - **Parâmetros de URL**:
    - `id` (obrigatório) – ID numérico da reserva.
  - **Erros possíveis**:
    - `400` – ID inválido.
    - `404` – reserva não encontrada.
    - `500` – erro ao cancelar a reserva.

- **PATCH `/reservas/:id/pagamento`** *(requer sessão de admin)*
  - **Descrição**: marca uma reserva como paga.
  - **Corpo (JSON)**: `{ "metodo_pagamento": "Dinheiro" }` (ou `"MBWay"`).
  - **Erros possíveis**: `400` – ID ou método inválido. `404` – reserva não encontrada.

- **POST `/agendar`**
  - **Descrição**: cria um novo agendamento, desde que o horário esteja disponível. O preço é calculado no servidor a partir do `servico` (nunca confia num preço vindo do cliente).
  - **Corpo (JSON)**:
    ```json
    {
      "nome": "João Silva",
      "telefone": "910000000",
      "data_hora": "2025-01-10 09:00",
      "servico": "Corte"
    }
    ```
  - **Validações**:
    - Todos os campos são obrigatórios, incluindo `servico` (deve existir no catálogo `SERVICOS`).
    - `data_hora` deve estar no formato `"YYYY-MM-DD HH:MM"`.
    - Verifica se já existe marcação na mesma data/hora.
  - **Erros possíveis**:
    - `400` – campos em falta, serviço inválido, formato de data/hora inválido, ou horário já ocupado.
    - `500` – erro ao verificar disponibilidade ou criar a marcação.

#### Vendas de produtos e métricas

- **POST `/vendas-produtos`** *(requer sessão de admin)*
  - **Corpo (JSON)**: `{ "produto": "Pomada", "preco": 15, "metodo_pagamento": "Dinheiro" }`.
  - **Erros possíveis**: `400` – produto, preço ou método inválidos.

- **GET `/admin/metricas?mes=YYYY-MM`** *(requer sessão de admin)*
  - **Descrição**: agrega faturação de marcações pagas e vendas de produtos do mês indicado (omitir `mes` usa o mês atual).
  - **Resposta (200)**:
    ```json
    {
      "mes": "2026-06",
      "marcacoes": { "total": 120, "quantidade": 10, "porMetodo": {"Dinheiro": 80, "MBWay": 40}, "porServico": {"Corte": 96, "Barba": 24} },
      "produtos": { "total": 45, "quantidade": 3, "porMetodo": {"Dinheiro": 45} },
      "totalGeral": 165
    }
    ```

---

### Fluxo típico de utilização

- **Cliente** acede a `http://localhost:3000/` e navega até `marcacao.html` para escolher serviço, data/hora e efetuar a marcação.
- O **frontend** consulta os endpoints `/config`, `/horarios/:data` e `/dias-ocupados` para preencher o serviço e desativar horários/dias ocupados.
- O **admin** faz login em `/admin-login.html` e usa:
  - `/admin` para ver reservas, cancelá-las (`DELETE /reservas/:id`) e marcar pagamentos (`PATCH /reservas/:id/pagamento`).
  - `/admin-metricas` para ver a faturação mensal e registar vendas de produtos (`POST /vendas-produtos`).

---

### Deploy na Vercel

1. Importar o repositório no [dashboard da Vercel](https://vercel.com).
2. Em `Project → Settings → Environment Variables`, adicionar `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` e `ADMIN_PASSWORD`.
3. O ficheiro `vercel.json` encaminha todos os pedidos para `api/index.js`, que exporta o mesmo `app` Express usado localmente.
4. Cada `git push` para a branch ligada ao projeto faz deploy automático.

---

### Próximos melhoramentos (sugestões)

- **Envio de SMS ou e‑mail** de confirmação (há já dependência de `twilio` instalada no projeto).
- **Testes automatizados** (unitários e de integração).
