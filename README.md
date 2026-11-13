# 🏥 Sistema de Controle de Atendimento para Laboratório de Clínicas

Sistema completo de gerenciamento de filas e atendimento desenvolvido em **Node.js (Express)** com banco de dados relacional **MySQL 8.0**, implementando concorrência segura, autenticação com perfis, controle de estados, relatórios gerenciais com indicadores de desempenho (KPIs) e síntese de voz nativa.

---

## 👥 Equipe e Informações Acadêmicas
* **Autora:** Giovanna Tavares
* **Instituição:** UNINASSAU
* **Disciplina:** Back-End Frameworks (Prof. Eduardo Hernandes) & Front-End (Prof. João Ferreira)
* **Curso:** Sistemas de Informação

---

## 🛠️ Tecnologias e Versões Utilizadas
* **Node.js:** Versão LTS 22.x (ou superior)
* **Express:** Framework web (v4.21+)
* **MySQL Server:** Versão 8.0 (via XAMPP)
* **MySQL2 Driver:** Conector assíncrono para Node.js
* **Bcrypt.js:** Criptografia e hash seguro de senhas (LGPD)

---

## 📦 Dependências Declaradas (`package.json`)
As dependências do projeto estão declaradas no arquivo `package.json` na raiz da aplicação:
* `express`: Construção da API REST e rotas.
* `mysql2`: Conexão e manipulação do banco de dados relacional.
* `bcryptjs`: Hash seguro para autenticação de usuários (Atendente e Gestor).

---

## ⚙️ Pré-requisitos de Instalação
Certifique-se de ter instalado em sua máquina local:
1. **Node.js** (LTS recomendado).
2. **XAMPP** (com o serviço **MySQL / MariaDB** ativo na porta padrão `3306`).

---

## 🚀 Passo a Passo de Instalação e Execução

### 1. Clonar o Repositório e Instalar Dependências
Abra o terminal na pasta raiz do projeto (`sistema-atendimento`) e execute:
```bash
npm install
```

### 2. Configurar o Banco de Dados (MySQL / XAMPP)
1. Certifique-se de que o **XAMPP** está com o **MySQL** iniciado.
2. Abra o **MySQL Workbench** (ou phpMyAdmin), abra uma nova aba de Query (`Ctrl + T`) e execute o script SQL abaixo para criar o banco de dados e as tabelas:

```sql
CREATE DATABASE IF NOT EXISTS controle_atendimento_lab;
USE controle_atendimento_lab;

CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    perfil ENUM('ATENDENTE', 'GESTOR') NOT NULL
);

CREATE TABLE IF NOT EXISTS senhas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    tipo ENUM('SP', 'SG', 'SE') NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'AGUARDANDO',
    guiche_id INT NULL,
    atendente_id INT NULL,
    data_hora_emissao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_hora_primeira_chamada DATETIME NULL,
    data_hora_segunda_chamada DATETIME NULL,
    data_hora_inicio_atendimento DATETIME NULL,
    data_hora_fim_atendimento DATETIME NULL,
    FOREIGN KEY (atendente_id) REFERENCES usuarios(id)
);
```

### 3. Executar a Aplicação
Inicie o servidor backend executando:
```bash
node src/index.js
```
O terminal exibirá a confirmação de conexão com o MySQL e que o servidor está rodando na porta 3000.

### 4. Acessar o Sistema
Abra o seu navegador e acesse:
👉 **`http://localhost:3000`**

---

## 🔑 Usuários de Teste (Seed Data)
O sistema cria automaticamente os seguintes usuários no primeiro start (com senha criptografada via hash seguro):

* **Perfil Gestor (Acesso a Relatórios, KPIs e Auditoria):**
  * **E-mail:** `gestor@lab.com`
  * **Senha:** `123`
* **Perfil Atendente (Acesso aos Guichês 1, 2 e 3):**
  * **E-mail:** `atendente@lab.com`
  * **Senha:** `123`
* **Cliente (AC):** Interage de forma anônima e exclusiva através do Totem na tela inicial.

---

## 🏛️ Decisões de Arquitetura e Estratégia de Concorrência
* **Arquitetura em Camadas:** Separação clara entre rotas da API REST, persistência relacional e interface web integrada para testes rápidos.
* **Prevenção de Race Conditions (Concorrência):** Para evitar que dois atendentes puxem a mesma senha simultaneamente em horários de pico, implementamos **transações SQL com bloqueio pessimista (`SELECT ... FOR UPDATE`)**. Quando um guichê requisita a próxima senha, o SGBD realiza o bloqueio exclusivo da linha até o `COMMIT`, garantindo isolamento total de concorrência.

---

## 📊 Funcionalidades Implementadas
1. **Emissão de Senhas (Totem):** Geração automática no padrão rígido `YYMMDD-PPSQ` para Prioritária (`SP`), Geral (`SG`) e Exames (`SE`).
2. **Área dos Atendentes:** Múltiplos guichês com alternância inteligente de filas e transações seguras.
3. **Painel de Chamados:** Atualização em tempo real e síntese de voz nativa (`SpeechSynthesis`) com recursos de "Chamar Novamente" (*Última chamada*).
4. **Segurança e LGPD (Item 5.3):** Autenticação por perfis, hash de senhas com `bcryptjs` e anonimização do cliente no totem.
5. **Relatórios, Auditoria e KPIs (Itens 5.4 e 5.6):** Quantitativo geral, segmentado por tipo, Tempo Médio de Espera (TE), Tempo de Atendimento (TAT), produtividade por atendente/guichê e trilha detalhada de auditoria.
6. **Disponibilidade (Item 5.5):** Rota `/health` para monitoramento de integridade do banco e recuperação de falhas com resiliência visual no front-end.

---

## ❌ Funcionalidades Não Implementadas
* Envio de notificações push via SMS/WhatsApp para os pacientes (fora do escopo acadêmico atual).