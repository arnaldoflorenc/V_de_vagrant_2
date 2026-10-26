// Scripts do usuário são salvos no banco para futura reutilização em
// outros ambientes. O arquivo é lido no navegador e enviado
// como texto em um JSON único.
// Consultas filtram por usuario_id
const db = require("../config/database");

const MAX_SCRIPT_BYTES = 512 * 1024;

const listScripts = async (req, res) => {
    try {
        const [scripts] = await db.query(
            "SELECT id, nome, LENGTH(conteudo) AS tamanho, criado_em FROM scripts WHERE usuario_id = ? ORDER BY id DESC",
            [req.usuarioId]
        );
        res.json(scripts);
    } catch (error) {
        console.error("Erro ao listar scripts:", error);
        res.status(500).json({ error: "Erro ao listar scripts." });
    }
};

const createScript = async (req, res) => {
    const nome = String(req.body.nome || "").trim();
    const conteudo = req.body.conteudo;

    if (!nome || typeof conteudo !== "string" || !conteudo.trim()) {
        return res.status(400).json({ error: "Nome e conteúdo do script são obrigatórios." });
    }
    if (Buffer.byteLength(conteudo) > MAX_SCRIPT_BYTES) {
        return res.status(413).json({ error: "Script excede 512KB." });
    }

    try {
        const [result] = await db.query(
            "INSERT INTO scripts (usuario_id, nome, conteudo) VALUES (?, ?, ?)",
            [req.usuarioId, nome.slice(0, 100), conteudo]
        );
        res.status(201).json({ id: result.insertId, nome });
    } catch (error) {
        console.error("Erro ao salvar script:", error);
        res.status(500).json({ error: "Erro ao salvar script." });
    }
};

const deleteScript = async (req, res) => {
    try {
        const [result] = await db.query(
            "DELETE FROM scripts WHERE id = ? AND usuario_id = ?",
            [req.params.id, req.usuarioId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Script não encontrado." });
        }
        res.json({ message: "Script removido." });
    } catch (error) {
        console.error("Erro ao remover script:", error);
        res.status(500).json({ error: "Erro ao remover script." });
    }
};

module.exports = { listScripts, createScript, deleteScript };
