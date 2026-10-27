// Cadastro e login. A senha guardada como hash; o login devolve
// um token assinado que o frontend usa nas requisições.
const bcrypt = require("bcryptjs");
const db = require("../config/database");
const { createToken } = require("../middleware/auth");

const register = async (req, res) => {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {
        return res.status(400).json({
            error: "Nome, e-mail e senha são obrigatórios."
        });
    }

    const nomeFormatado = String(nome).trim();
    const emailFormatado = String(email).trim().toLowerCase();

    if (nomeFormatado.length < 2) {
        return res.status(400).json({
            error: "O nome deve ter pelo menos 2 caracteres."
        });
    }

    if (senha.length < 6) {
        return res.status(400).json({
            error: "A senha deve ter pelo menos 6 caracteres."
        });
    }

    try {
        const [usuariosExistentes] = await db.query(
            "SELECT id FROM usuarios WHERE email = ? LIMIT 1",
            [emailFormatado]
        );

        if (usuariosExistentes.length > 0) {
            return res.status(409).json({
                error: "Este e-mail já está cadastrado."
            });
        }

        const senhaHash = await bcrypt.hash(String(senha), 10);

        const [resultado] = await db.query(
            "INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)",
            [nomeFormatado, emailFormatado, senhaHash]
        );

        const [usuarioCriado] = await db.query(
            "SELECT id, nome, email FROM usuarios WHERE id = ? LIMIT 1",
            [resultado.insertId]
        );

        return res.status(201).json({
            message: "Cadastro realizado com sucesso.",
            usuario: usuarioCriado[0]
        });
    } catch (error) {
        console.error("Erro ao cadastrar usuário:", error);

        return res.status(500).json({
            error: "Erro interno ao cadastrar usuário."
        });
    }
};

const login = async (req, res) => {
    const { email, senha } = req.body;

    if (!email || !senha) {
        return res.status(400).json({
            error: "E-mail e senha são obrigatórios."
        });
    }

    try {
        const [rows] = await db.query(
            "SELECT id, nome, email, senha FROM usuarios WHERE email = ? LIMIT 1",
            [String(email).trim().toLowerCase()]
        );

        const usuario = rows[0];

        if (!usuario) {
            return res.status(401).json({
                error: "Credenciais inválidas."
            });
        }

        const senhaValida = await bcrypt.compare(String(senha), usuario.senha);

        if (!senhaValida) {
            return res.status(401).json({
                error: "Credenciais inválidas."
            });
        }

        // remove hash das respostas
        const { senha: senhaDoUsuario, ...dadosUsuario } = usuario;

        return res.status(200).json({
            message: "Login realizado com sucesso.",
            usuario: dadosUsuario,
            token: createToken(usuario.id)
        });
    } catch (error) {
        console.error("Erro ao autenticar usuário:", error);

        return res.status(500).json({
            error: "Erro interno ao autenticar usuário."
        });
    }
};

module.exports = {
    register,
    login
};
