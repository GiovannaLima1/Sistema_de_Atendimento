const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());

// Conexão com o MySQL do XAMPP
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'controle_atendimento_lab'
});

db.connect((err) => {
    if (err) {
        console.error('[ERRO CRÍTICO] Falha ao conectar ao MySQL:', err.message);
        return;
    }
    console.log('Conectado ao banco de dados MySQL com sucesso!');
    inicializarBancoCompleto();
});

// Criar tabelas e estrutura completa para suportar os Indicadores de Desempenho
function inicializarBancoCompleto() {
    const sqlUsuarios = `
        CREATE TABLE IF NOT EXISTS usuarios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL UNIQUE,
            senha_hash VARCHAR(255) NOT NULL,
            perfil ENUM('ATENDENTE', 'GESTOR') NOT NULL
        )
    `;
    db.query(sqlUsuarios, async (err) => {
        if (!err) {
            const senhaHash = await bcrypt.hash('123', 10);
            db.query(`INSERT IGNORE INTO usuarios (nome, email, senha_hash, perfil) VALUES ('Gestor Geral', 'gestor@lab.com', ?, 'GESTOR')`, [senhaHash]);
            db.query(`INSERT IGNORE INTO usuarios (nome, email, senha_hash, perfil) VALUES ('Atendente 01', 'atendente@lab.com', ?, 'ATENDENTE')`, [senhaHash]);
        }
    });

    const sqlSenhas = `
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
        )
    `;
    db.query(sqlSenhas);
}

// 📌 Health Check (Disponibilidade 5.5)
app.get('/health', (req, res) => {
    db.ping((err) => {
        if (err) {
            return res.status(503).json({ status: 'UNHEALTHY', banco_dados: 'OFFLINE' });
        }
        res.json({ status: 'HEALTHY', banco_dados: 'ONLINE', timestamp: new Date() });
    });
});

// 📌 ROTA DE LOGIN (Segurança 5.3)
app.post('/login', (req, res) => {
    const { email, senha } = req.body;
    const query = `SELECT * FROM usuarios WHERE email = ?`;
    db.query(query, [email], async (err, results) => {
        if (err || results.length === 0) return res.status(401).json({ erro: 'Credenciais inválidas!' });
        const usuario = results[0];
        const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
        if (!senhaValida) return res.status(401).json({ erro: 'Credenciais inválidas!' });
        res.json({
            mensagem: 'Login realizado com sucesso!',
            usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil }
        });
    });
});

// 📌 EMISSÃO DE SENHAS (Totem Anônimo)
app.post('/senhas', (req, res) => {
    const { tipo } = req.body; 
    if (!['SP', 'SG', 'SE'].includes(tipo)) return res.status(400).json({ erro: 'Tipo de senha inválido!' });

    const agora = new Date();
    const yy = String(agora.getFullYear()).slice(-2);
    const mm = String(agora.getMonth() + 1).padStart(2, '0');
    const dd = String(agora.getDate()).padStart(2, '0');
    const dataPrefixo = `${yy}${mm}${dd}`;

    const queryCount = `SELECT COUNT(*) as total FROM senhas WHERE tipo = ? AND DATE(data_hora_emissao) = CURDATE()`;
    db.query(queryCount, [tipo], (err, results) => {
        if (err) return res.status(503).json({ erro: 'Erro ao gerar senha.' });

        const sequencial = results[0].total + 1;
        const seqFormatado = String(sequencial).padStart(3, '0');
        const codigoSenha = `${dataPrefixo}-${tipo}${seqFormatado}`;

        const queryInsert = `INSERT INTO senhas (codigo, tipo, status) VALUES (?, ?, 'AGUARDANDO')`;
        db.query(queryInsert, [codigoSenha, tipo], (err) => {
            if (err) return res.status(503).json({ erro: 'Erro ao salvar senha.' });
            res.status(201).json({ mensagem: 'Senha emitida!', senha: { codigo: codigoSenha, tipo, status: 'AGUARDANDO' } });
        });
    });
});

// 📌 CHAMAR PRÓXIMA SENHA (Com Transação, Bloqueio pessimista FOR UPDATE e marcação de início de atendimento)
app.post('/chamar', (req, res) => {
    const { guiche_id, atendente_id } = req.body;
    if (!guiche_id) return res.status(400).json({ erro: 'Informe o ID do guichê.' });

    db.beginTransaction((err) => {
        if (err) return res.status(503).json({ erro: 'Erro na transação.' });

        const queryBusca = `
            SELECT * FROM senhas 
            WHERE status = 'AGUARDANDO' 
            ORDER BY CASE WHEN tipo = 'SP' THEN 1 WHEN tipo = 'SE' THEN 2 WHEN tipo = 'SG' THEN 3 END ASC, id ASC 
            LIMIT 1 FOR UPDATE
        `;

        db.query(queryBusca, (err, results) => {
            if (err || results.length === 0) {
                return db.rollback(() => res.status(404).json({ erro: 'Não há senhas aguardando.' }));
            }

            const senha = results[0];
            const agora = new Date();
            const campoChamada = senha.data_hora_primeira_chamada ? 'data_hora_segunda_chamada' : 'data_hora_primeira_chamada';
            
            const queryUpdate = `
                UPDATE senhas 
                SET status = 'EM_ATENDIMENTO', guiche_id = ?, atendente_id = ?, ${campoChamada} = ?, data_hora_inicio_atendimento = ? 
                WHERE id = ?
            `;

            db.query(queryUpdate, [guiche_id, atendente_id || null, agora, agora, senha.id], (err) => {
                if (err) return res.rollback(() => res.status(503).json({ erro: 'Erro ao atualizar senha.' }));

                db.commit((err) => {
                    if (err) return res.rollback(() => res.status(503).json({ erro: 'Erro no commit.' }));
                    res.json({ mensagem: 'Senha chamada e em atendimento!', senha: { ...senha, status: 'EM_ATENDIMENTO', guiche_id } });
                });
            });
        });
    });
});

// 📌 ENCERRAR ATENDIMENTO (Fecha o ciclo e registra o tempo de atendimento)
app.post('/encerrar', (req, res) => {
    const { senha_id } = req.body;
    if (!senha_id) return res.status(400).json({ erro: 'ID da senha obrigatório.' });

    const agora = new Date();
    const query = `UPDATE senhas SET status = 'ATENDIDA', data_hora_fim_atendimento = ? WHERE id = ?`;
    db.query(query, [agora, senha_id], (err) => {
        if (err) return res.status(503).json({ erro: 'Erro ao encerrar atendimento.' });
        res.json({ mensagem: 'Atendimento encerrado com sucesso!' });
    });
});

// 📌 PAINEL PÚBLICO
app.get('/painel', (req, res) => {
    db.query(`SELECT * FROM senhas WHERE status IN ('EM_ATENDIMENTO', 'ATENDIDA') ORDER BY id DESC LIMIT 5`, (err, results) => {
        if (err) return res.status(503).json({ erro: 'Erro no painel.' });
        res.json(results);
    });
});

// 📌 5.6 RELATÓRIOS E INDICADORES DE DESEMPENHO (KPIs)
app.get('/relatorios', (req, res) => {
    const relatorio = {};

    // 1. Quantitativo geral e Taxa de Não Comparecimento / Conclusão
    db.query(`SELECT COUNT(*) as total_emitidas, 
                     SUM(CASE WHEN status = 'ATENDIDA' THEN 1 ELSE 0 END) as total_atendidas,
                     SUM(CASE WHEN status = 'AGUARDANDO' THEN 1 ELSE 0 END) as total_pendentes
              FROM senhas`, (err, resGeral) => {
        if (err) return res.status(503).json({ erro: 'Erro relatório geral.' });
        relatorio.geral = resGeral[0];

        // 2. Indicadores de Tempo Médio de Espera (TE) e Tempo de Atendimento (TAT)
        const queryKPIs = `
            SELECT 
                ROUND(AVG(TIMESTAMPDIFF(MINUTE, data_hora_emissao, data_hora_primeira_chamada)), 2) as tempo_medio_espera_min,
                ROUND(AVG(TIMESTAMPDIFF(MINUTE, data_hora_inicio_atendimento, data_hora_fim_atendimento)), 2) as tempo_medio_atendimento_min
            FROM senhas 
            WHERE data_hora_primeira_chamada IS NOT NULL
        `;
        db.query(queryKPIs, (err, resKPIs) => {
            if (err) return res.status(503).json({ erro: 'Erro nos KPIs.' });
            relatorio.indicadores_desempenho = resKPIs[0];

            // 3. Produtividade por Atendente / Guichê
            const queryProdutividade = `
                u.nome as atendente, s.guiche_id, COUNT(s.id) as total_atendimentos
                FROM senhas s
                LEFT JOIN usuarios u ON s.atendente_id = u.id
                WHERE s.status = 'ATENDIDA'
                GROUP BY s.atendente_id, s.guiche_id
            `;
            db.query(`SELECT ${queryProdutividade}`, (err, resProd) => {
                if (err) return res.status(503).json({ erro: 'Erro produtividade.' });
                relatorio.produtividade_por_guiche = resProd;

                // 4. Auditoria Completa
                const queryAuditoria = `
                    SELECT s.id, s.codigo, s.tipo, s.status, s.guiche_id, u.nome as atendente,
                           s.data_hora_emissao, s.data_hora_primeira_chamada, s.data_hora_segunda_chamada, 
                           s.data_hora_inicio_atendimento, s.data_hora_fim_atendimento
                    FROM senhas s
                    LEFT JOIN usuarios u ON s.atendente_id = u.id
                    ORDER BY s.id DESC LIMIT 30
                `;
                db.query(queryAuditoria, (err, resAuditoria) => {
                    if (err) return res.status(503).json({ erro: 'Erro auditoria.' });
                    relatorio.auditoria = resAuditoria;

                    res.json(relatorio);
                });
            });
        });
    });
});

// 📌 INTERFACE WEB INTEGRADA (Com botões de Atendimento e Encerramento de Ciclo)
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Sistema de Atendimento - Laboratório</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; margin: 20px; background: #f4f4f9; }
                    .card { background: white; padding: 20px; margin: 15px auto; width: 70%; border-radius: 8px; box-shadow: 0px 0px 10px rgba(0,0,0,0.1); }
                    button { padding: 10px 18px; font-size: 15px; margin: 5px; cursor: pointer; border: none; border-radius: 5px; color: white; }
                    .sp { background-color: #d9534f; }
                    .sg { background-color: #0275d8; }
                    .se { background-color: #5cb85c; }
                    .g1 { background-color: #f0ad4e; color: black; font-weight: bold; }
                    .g2 { background-color: #5bc0de; color: black; font-weight: bold; }
                    .g3 { background-color: #337ab7; }
                    .novamente { background-color: #d9534f; color: white; font-weight: bold; }
                    .encerrar { background-color: #28a745; color: white; font-weight: bold; }
                    .relatorio-btn { background-color: #333; }
                    .login-box { background: #fff; padding: 15px; margin: 10px auto; width: 300px; border-radius: 5px; border: 1px solid #ccc; }
                    input { padding: 8px; margin: 5px; width: 90%; }
                    ul { list-style: none; padding: 0; font-size: 18px; }
                    li { background: #e7e7e7; margin: 5px; padding: 10px; border-radius: 4px; }
                    .hidden { display: none; }
                    #status-sistema { font-weight: bold; padding: 5px; border-radius: 4px; margin-bottom: 10px; display: inline-block; }
                    .online { background: #d4edda; color: #155724; }
                    .offline { background: #f8d7da; color: #721c24; }
                </style>
            </head>
            <body>
                <h1>🏥 Sistema de Controle de Atendimento</h1>
                <div id="status-sistema" class="online">🔄 Verificando status...</div>

                <div id="secao-login" class="card">
                    <h2>🔐 Acesso Restrito</h2>
                    <div class="login-box">
                        <input type="email" id="email" value="gestor@lab.com"><br>
                        <input type="password" id="senha" value="123"><br>
                        <button style="background: #28a745;" onclick="fazerLogin()">Entrar</button>
                    </div>
                    <p id="msg-login" style="color: red; font-weight: bold;"></p>
                    <hr>
                    <h3>Totem (Cliente AC - Anônimo)</h3>
                    <button class="sp" onclick="emitir('SP')">Prioritária (SP)</button>
                    <button class="sg" onclick="emitir('SG')">Geral (SG)</button>
                    <button class="se" onclick="emitir('SE')">Exames (SE)</button>
                    <p id="msg-totem" style="font-weight: bold; margin-top: 10px;"></p>
                </div>

                <div id="secao-sistema" class="card hidden">
                    <h2 id="titulo-perfil">Painel</h2>
                    <button style="background: #6c757d;" onclick="fazerLogout()">Sair</button>

                    <div id="painel-atendente" class="hidden" style="margin-top: 20px;">
                        <h3>Área dos Atendentes</h3>
                        <button class="g1" onclick="chamarProxima(1)">Chamar Guichê 1</button>
                        <button class="g2" onclick="chamarProxima(2)">Chamar Guichê 2</button>
                        <button class="g3" onclick="chamarProxima(3)">Chamar Guichê 3</button>
                        <br>
                        <button class="novamente" onclick="chamarNovamente()">Chamar Novamente (Última)</button>
                        <button class="encerrar" onclick="encerrarAtendimento()">Encerrar Atendimento Atual</button>
                        <p id="msg-atendente" style="font-size: 18px; font-weight: bold; color: #d9534f; margin-top: 10px;"></p>
                    </div>

                    <div id="painel-gestor" class="hidden" style="margin-top: 20px;">
                        <h3>Indicadores de Desempenho (KPIs) & Relatórios</h3>
                        <button class="relatorio-btn" onclick="carregarRelatorios()">Carregar KPIs & Auditoria</button>
                        <pre id="box-relatorio" style="text-align: left; background: #eee; padding: 10px; margin-top: 10px; border-radius: 5px; max-height: 250px; overflow-y: auto;"></pre>
                    </div>
                </div>

                <div class="card">
                    <h2>Painel de Chamados</h2>
                    <ul id="lista-painel">Carregando...</ul>
                </div>

                <script>
                    let usuarioLogado = null;
                    let ultimaSenhaChamada = null;

                    function falarTexto(texto) {
                        if ('speechSynthesis' in window) {
                            const utterance = new SpeechSynthesisUtterance(texto);
                            utterance.lang = 'pt-BR';
                            utterance.rate = 1.0;
                            window.speechSynthesis.speak(utterance);
                        }
                    }

                    async function verificarSaude() {
                        try {
                            const res = await fetch('/health');
                            const data = await res.json();
                            const statusDiv = document.getElementById('status-sistema');
                            if (res.ok && data.status === 'HEALTHY') {
                                statusDiv.innerText = "🟢 Sistema Operacional (Online)";
                                statusDiv.className = "online";
                            } else {
                                statusDiv.innerText = "🔴 Alerta: Banco Instável";
                                statusDiv.className = "offline";
                            }
                        } catch (e) {
                            document.getElementById('status-sistema').innerText = "🔴 Erro: Servidor Fora do Ar";
                            document.getElementById('status-sistema').className = "offline";
                        }
                    }

                    async function fazerLogin() {
                        const email = document.getElementById('email').value;
                        const senha = document.getElementById('senha').value;
                        try {
                            const res = await fetch('/login', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ email, senha })
                            });
                            const data = await res.json();
                            if (res.ok) {
                                usuarioLogado = data.usuario;
                                document.getElementById('secao-login').classList.add('hidden');
                                document.getElementById('secao-sistema').classList.remove('hidden');
                                document.getElementById('titulo-perfil').innerText = "Logado como: " + usuarioLogado.nome + " (" + usuarioLogado.perfil + ")";
                                if (usuarioLogado.perfil === 'ATENDENTE') document.getElementById('painel-atendente').classList.remove('hidden');
                                if (usuarioLogado.perfil === 'GESTOR') document.getElementById('painel-gestor').classList.remove('hidden');
                            } else {
                                document.getElementById('msg-login').innerText = data.erro;
                            }
                        } catch (err) {
                            document.getElementById('msg-login').innerText = "Erro de conexão.";
                        }
                    }

                    function fazerLogout() {
                        usuarioLogado = null;
                        document.getElementById('secao-sistema').classList.add('hidden');
                        document.getElementById('secao-login').classList.remove('hidden');
                        document.getElementById('painel-atendente').classList.add('hidden');
                        document.getElementById('painel-gestor').classList.add('hidden');
                    }

                    async function emitir(tipo) {
                        try {
                            const res = await fetch('/senhas', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ tipo })
                            });
                            const data = await res.json();
                            if (res.ok) document.getElementById('msg-totem').innerText = "Emitida: " + data.senha.codigo;
                            atualizarPainel();
                        } catch (e) {
                            document.getElementById('msg-totem').innerText = "Erro de conexão.";
                        }
                    }

                    async function chamarProxima(guicheId) {
                        try {
                            const res = await fetch('/chamar', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ guiche_id: guicheId, atendente_id: usuarioLogado.id })
                            });
                            const data = await res.json();
                            if (res.ok) {
                                ultimaSenhaChamada = data.senha;
                                document.getElementById('msg-atendente').innerText = "Em atendimento: " + data.senha.codigo + " (Guichê " + data.senha.guiche_id + ")";
                                falarTexto("Senha " + data.senha.codigo + ", dirigir-se ao Guichê " + data.senha.guiche_id);
                            } else {
                                document.getElementById('msg-atendente').innerText = data.erro;
                            }
                            atualizarPainel();
                        } catch (e) {
                            document.getElementById('msg-atendente').innerText = "Erro de comunicação.";
                        }
                    }

                    function chamarNovamente() {
                        if (!ultimaSenhaChamada) return alert("Nenhuma senha chamada.");
                        document.getElementById('msg-atendente').innerText = "ÚLTIMA CHAMADA: " + ultimaSenhaChamada.codigo;
                        falarTexto("Última chamada. Senha " + ultimaSenhaChamada.codigo + ", dirigir-se ao Guichê " + ultimaSenhaChamada.guiche_id);
                    }

                    async function encerrarAtendimento() {
                        if (!ultimaSenhaChamada) return alert("Nenhum atendimento ativo.");
                        try {
                            const res = await fetch('/encerrar', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ senha_id: ultimaSenhaChamada.id })
                            });
                            const data = await res.json();
                            if (res.ok) {
                                document.getElementById('msg-atendente').innerText = "Atendimento encerrado com sucesso!";
                                ultimaSenhaChamada = null;
                            }
                            atualizarPainel();
                        } catch (e) {
                            alert("Erro ao encerrar.");
                        }
                    }

                    async function atualizarPainel() {
                        try {
                            const res = await fetch('/painel');
                            if (!res.ok) return;
                            const senhas = await res.json();
                            const lista = document.getElementById('lista-painel');
                            lista.innerHTML = "";
                            senhas.forEach(s => {
                                const li = document.createElement('li');
                                li.innerText = \`Senha: \${s.codigo} | Status: \${s.status} | Guichê: \${s.guiche_id || 'N/A'}\`;
                                lista.appendChild(li);
                            });
                        } catch (e) {}
                    }

                    async function carregarRelatorios() {
                        try {
                            const res = await fetch('/relatorios');
                            const data = await res.json();
                            document.getElementById('box-relatorio').innerText = JSON.stringify(data, null, 2);
                        } catch (e) {
                            document.getElementById('box-relatorio').innerText = "Erro ao carregar KPIs.";
                        }
                    }

                    setInterval(atualizarPainel, 3000);
                    setInterval(verificarSaude, 5000);
                    atualizarPainel();
                    verificarSaude();
                </script>
            </body>
        </html>
    `);
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});