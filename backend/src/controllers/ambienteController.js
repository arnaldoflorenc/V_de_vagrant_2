// O banco guarda consumer do ambiente, limites e status.
// Runner executa, e tem seu status copiado.
// Limites: cpu em % (1 core), memória em MB, IO em MB/s.
// Consultas filtram por usuario_id
const db = require("../config/database");
const runner = require("../services/runnerClient");

const FINAL = ["terminado", "erro"];
const SELECT_AMBIENTE =
    "SELECT a.id, a.nome, a.status, a.cpu_limit, a.memory_limit, a.io_limit, a.comando, a.script_id, a.criado_em, " +
    "(SELECT resultado FROM execucoes e WHERE e.ambiente_id = a.id ORDER BY e.id DESC LIMIT 1) AS resultado " +
    "FROM ambiente a";

const toInt = (value, min, max) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

// Atualiza o status do ambiente
const updateStatus = async (id, status, resultado) => {
    await db.query("UPDATE ambiente SET status = ? WHERE id = ?", [status, id]);
    await db.query(
        "UPDATE execucoes SET status = ?, resultado = ?, finalizado_em = IF(? IN ('terminado','erro'), NOW(), NULL) " +
        "WHERE ambiente_id = ? ORDER BY id DESC LIMIT 1",
        [status, resultado ?? null, status, id]
    );
};

// Consulta o runner e reflete o estado real no banco.
const syncAmbiente = async (ambiente) => {
    if (FINAL.includes(ambiente.status)) {
        return ambiente;
    }

    try {
        const env = await runner.getEnv(ambiente.id);
        if (env.status !== ambiente.status) {
            const resultado = env.exitCode !== null && env.exitCode !== undefined
                ? `Código de saída: ${env.exitCode}${env.reason ? ` (${env.reason})` : ""}`
                : env.reason || null;
            await updateStatus(ambiente.id, env.status, resultado);
            return { ...ambiente, status: env.status, resultado };
        }
    } catch (error) {
        if (error.status === 404 && ambiente.status === "em_execucao") {
            await updateStatus(ambiente.id, "erro", "Ambiente não encontrado no runner.");
            return { ...ambiente, status: "erro", resultado: "Ambiente não encontrado no runner." };
        }
        console.error(`Falha ao sincronizar ambiente ${ambiente.id}:`, error.message);
    }
    return ambiente;
};

const findOwned = async (id, usuarioId) => {
    const [rows] = await db.query(`${SELECT_AMBIENTE} WHERE a.id = ? AND a.usuario_id = ?`, [id, usuarioId]);
    return rows[0];
};

const listAmbientes = async (req, res) => {
    try {
        const [rows] = await db.query(`${SELECT_AMBIENTE} WHERE a.usuario_id = ? ORDER BY a.id DESC`, [req.usuarioId]);
        res.json(await Promise.all(rows.map(syncAmbiente)));
    } catch (error) {
        console.error("Erro ao listar ambientes:", error);
        res.status(500).json({ error: "Erro ao listar ambientes." });
    }
};

const getAmbiente = async (req, res) => {
    try {
        const ambiente = await findOwned(req.params.id, req.usuarioId);
        if (!ambiente) {
            return res.status(404).json({ error: "Ambiente não encontrado." });
        }
        res.json(await syncAmbiente(ambiente));
    } catch (error) {
        console.error("Erro ao buscar ambiente:", error);
        res.status(500).json({ error: "Erro ao buscar ambiente." });
    }
};

// Fluxo: valida -> grava no banco -> Runner inicia ambiente -> marca em_execucao.
// Se o runner falhar, o ambiente apresenta um erro e motivo.
// O conteúdo executado pode vir do script passado ou do campo de texto.
const createAmbiente = async (req, res) => {
    const nome = String(req.body.nome || "").trim();
    const cpu = toInt(req.body.cpu, 1, 100);
    const memoria = toInt(req.body.memoria, 16, 3072);
    const io = toInt(req.body.io, 1, 1000);
    const comando = String(req.body.comando || "").trim();
    const scriptId = req.body.script_id ? Number(req.body.script_id) : null;

    if (!nome || cpu === null || memoria === null || io === null) {
        return res.status(400).json({
            error: "Informe nome, CPU (1-100%), memória (16-3072 MB) e IO (1-1000 MB/s)."
        });
    }
    if (!scriptId && !comando) {
        return res.status(400).json({ error: "Informe um script salvo ou um comando/programa a executar." });
    }

    let id;
    try {
        let conteudo = comando;
        if (scriptId) {
            const [scripts] = await db.query(
                "SELECT conteudo FROM scripts WHERE id = ? AND usuario_id = ?",
                [scriptId, req.usuarioId]
            );
            if (scripts.length === 0) {
                return res.status(404).json({ error: "Script não encontrado." });
            }
            conteudo = scripts[0].conteudo;
        }

        const [result] = await db.query(
            "INSERT INTO ambiente (usuario_id, script_id, nome, cpu_limit, memory_limit, io_limit, script_path, comando) " +
            "VALUES (?, ?, ?, ?, ?, ?, '', ?)",
            [req.usuarioId, scriptId, nome.slice(0, 100), cpu, memoria, io, scriptId ? null : comando]
        );
        id = result.insertId;
        await db.query(
            "UPDATE ambiente SET script_path = ? WHERE id = ?",
            [`/srv/runner/scripts/env-${id}.sh`, id]
        );
        await db.query(
            "INSERT INTO execucoes (ambiente_id, status, iniciado_em) VALUES (?, 'pendente', NOW())",
            [id]
        );

        await runner.createEnv({ id, cpu, memory: memoria, io, script: conteudo });
        await updateStatus(id, "em_execucao", null);

        res.status(201).json(await findOwned(id, req.usuarioId));
    } catch (error) {
        console.error("Erro ao criar ambiente:", error);
        if (id) {
            await updateStatus(id, "erro", `Falha ao iniciar no runner: ${error.message}`).catch(() => {});
        }
        res.status(502).json({ error: `Erro ao criar ambiente: ${error.message}` });
    }
};

// Logs ficam no runner; aqui só repassamos o trecho a partir de
// "offset", assim serviços que nunca terminam podem ser lidos aos poucos.
const getLogs = async (req, res) => {
    try {
        const ambiente = await findOwned(req.params.id, req.usuarioId);
        if (!ambiente) {
            return res.status(404).json({ error: "Ambiente não encontrado." });
        }
        res.json(await runner.getLogs(ambiente.id, Number(req.query.offset) || 0));
    } catch (error) {
        console.error("Erro ao buscar logs:", error);
        res.status(error.status === 404 ? 404 : 502).json({ error: "Logs indisponíveis." });
    }
};

const stopAmbiente = async (req, res) => {
    try {
        const ambiente = await findOwned(req.params.id, req.usuarioId);
        if (!ambiente) {
            return res.status(404).json({ error: "Ambiente não encontrado." });
        }
        await runner.stopEnv(ambiente.id);
        await updateStatus(ambiente.id, "terminado", "Encerrado pelo usuário.");
        res.json({ message: "Ambiente encerrado." });
    } catch (error) {
        console.error("Erro ao parar ambiente:", error);
        res.status(502).json({ error: `Erro ao parar ambiente: ${error.message}` });
    }
};

// Remove no runner (para o processo e apaga cgroup/log) e depois no banco.
// 404 do runner é ignorado: o ambiente pode já ter sido limpo lá.
const deleteAmbiente = async (req, res) => {
    try {
        const ambiente = await findOwned(req.params.id, req.usuarioId);
        if (!ambiente) {
            return res.status(404).json({ error: "Ambiente não encontrado." });
        }
        await runner.deleteEnv(ambiente.id).catch((error) => {
            if (error.status !== 404) throw error;
        });
        await db.query("DELETE FROM ambiente WHERE id = ?", [ambiente.id]);
        res.json({ message: "Ambiente removido." });
    } catch (error) {
        console.error("Erro ao remover ambiente:", error);
        res.status(502).json({ error: `Erro ao remover ambiente: ${error.message}` });
    }
};

module.exports = {
    listAmbientes,
    getAmbiente,
    createAmbiente,
    getLogs,
    stopAmbiente,
    deleteAmbiente
};
