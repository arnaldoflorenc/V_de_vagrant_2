// Autenticação por token assinado.
// O token só carrega o id do usuário; qualquer alteração invalida a assinatura.
const crypto = require("crypto");

const secret = () => process.env.TOKEN_SECRET || process.env.DB_PASSWORD || "dev-secret";

const sign = (payload) =>
    crypto.createHmac("sha256", secret()).update(payload).digest("base64url");

const createToken = (usuarioId) => {
    const payload = Buffer.from(JSON.stringify({ id: usuarioId, iat: Date.now() })).toString("base64url");
    return `${payload}.${sign(payload)}`;
};

// Middleware: valida o token e coloca o id do usuário em req.usuarioId.
// Os controllers usam esse id para filtrar tudo por dono.
const requireAuth = (req, res, next) => {
    const header = req.headers.authorization || "";
    const [payload, signature] = header.replace(/^Bearer /, "").split(".");

    if (!payload || !signature) {
        return res.status(401).json({ error: "Autenticação necessária." });
    }

    const expected = Buffer.from(sign(payload));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
        return res.status(401).json({ error: "Token inválido." });
    }

    try {
        req.usuarioId = JSON.parse(Buffer.from(payload, "base64url").toString()).id;
    } catch {
        return res.status(401).json({ error: "Token inválido." });
    }
    next();
};

module.exports = { createToken, requireAuth };
