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
- **Área de administração**:
  - Página `admin.html` (servida pelo backend) para consulta e gestão das reservas.
- **API REST**:
  - Endpoints para listar horários ocupados, dias cheios, criar novas marcações e cancelar reservas.
- **Base de dados Supabase (Postgres)**:
  - Tabela `marcacoes`, acedida via `@supabase/supabase-js`.

---

### Tecnologias utilizadas

- **Backend**
  - Node.js
  - Express
  - CORS
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
  - `marcacao.html` – ecrã de agendamento.
  - `admin.html` – área de administração.
  - `style.css` – estilos adicionais.
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

O projeto usa uma tabela `marcacoes` no Supabase (Postgres), criada manualmente via SQL Editor:

```sql
create table marcacoes (
  id bigint generated always as identity primary key,
  nome text not null,
  telefone text not null,
  data_hora timestamp not null
);
```

- **`id`**: identidade, chave primária.
- **`nome`**: texto, nome do cliente.
- **`telefone`**: texto, telefone de contacto.
- **`data_hora`**: `timestamp`, data e hora da marcação.

---

### Rotas HTTP (API)

Todas as rotas abaixo são expostas pelo servidor Express em `server.js`.

#### Rotas de páginas

- **GET `/`**
  - Devolve a página principal (`public/index.html`).

- **GET `/marcacao`**
  - Devolve a página de marcação (`public/marcacao.html`).

- **GET `/admin`**
  - Devolve a página de administração (`public/admin.html`).

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

- **GET `/reservas`**
  - **Descrição**: devolve todas as reservas registadas, ordenadas por data/hora descendente.
  - **Resposta (200)**:
    - Array de objetos:
      ```json
      [
        {
          "id": 1,
          "nome": "João Silva",
          "telefone": "910000000",
          "data_hora": "2025-01-10 09:00"
        }
      ]
      ```

- **GET `/reservas/:data`**
  - **Descrição**: devolve as reservas de uma data específica.
  - **Parâmetros de URL**:
    - `data` (obrigatório) – formato `YYYY-MM-DD`.
  - **Resposta (200)**:
    - Array de objetos com `id`, `nome`, `telefone` e `data_hora`.
  - **Erros possíveis**:
    - `400` – formato de data inválido.

- **DELETE `/reservas/:id`**
  - **Descrição**: cancela (apaga) uma reserva.
  - **Parâmetros de URL**:
    - `id` (obrigatório) – ID numérico da reserva.
  - **Resposta (200)**:
    - ```json
      { "success": true, "message": "Reserva cancelada com sucesso" }
      ```
  - **Erros possíveis**:
    - `400` – ID inválido.
    - `404` – reserva não encontrada.
    - `500` – erro ao cancelar a reserva.

- **POST `/agendar`**
  - **Descrição**: cria um novo agendamento, desde que o horário esteja disponível.
  - **Corpo (JSON)**:
    ```json
    {
      "nome": "João Silva",
      "telefone": "910000000",
      "data_hora": "2025-01-10 09:00"
    }
    ```
  - **Validações**:
    - Todos os campos são obrigatórios.
    - `data_hora` deve estar no formato `"YYYY-MM-DD HH:MM"`.
    - Verifica se já existe marcação na mesma data/hora.
  - **Resposta (200)** em caso de sucesso:
    ```json
    {
      "success": true,
      "id": 1
    }
    ```
  - **Erros possíveis**:
    - `400` – campos em falta, formato de data ou hora inválidos, ou horário já ocupado.
    - `500` – erro ao verificar disponibilidade ou criar a marcação.

---

### Fluxo típico de utilização

- **Cliente** acede a `http://localhost:3000/` e navega até `marcacao.html` para escolher data/hora e efetuar a marcação.
- O **frontend** consulta os endpoints `/horarios/:data` e `/dias-ocupados` para desativar horários/dias ocupados.
- O **admin** utiliza a página `/admin` para:
  - Ver todas as reservas (`/reservas` ou `/reservas/:data`).
  - Cancelar reservas (`DELETE /reservas/:id`).

---

### Deploy na Vercel

1. Importar o repositório no [dashboard da Vercel](https://vercel.com).
2. Em `Project → Settings → Environment Variables`, adicionar `SUPABASE_URL` e `SUPABASE_SERVICE_KEY`.
3. O ficheiro `vercel.json` encaminha todos os pedidos para `api/index.js`, que exporta o mesmo `app` Express usado localmente.
4. Cada `git push` para a branch ligada ao projeto faz deploy automático.

---

### Próximos melhoramentos (sugestões)

- **Autenticação** para a área de administração.
- **Envio de SMS ou e‑mail** de confirmação (há já dependência de `twilio` instalada no projeto).
- **Testes automatizados** (unitários e de integração).
