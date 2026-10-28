// Tipos de script aceitos e a extensão do arquivo gerado no runner.
// Precisa ficar igual ao INTERPRETERS/EXTENSIONS de runner/agent.js
// e ao ENUM "tipo" das tabelas scripts/ambiente (db/schema.sql).
const EXTENSAO = { bash: "sh", python: "py" };
const TIPOS = Object.keys(EXTENSAO);
const TIPO_PADRAO = "bash";

module.exports = { EXTENSAO, TIPOS, TIPO_PADRAO };
