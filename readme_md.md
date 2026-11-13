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
Abra o terminal na pasta raiz do projeto e execute:
```bash
npm install