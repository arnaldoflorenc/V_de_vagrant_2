// Runner agent: cria ambientes isolados com namespaces (unshare) + cgroups v2.
// Executar como root. Sem dependências externas.
//
// Cada ambiente = 1 cgroup (/sys/fs/cgroup/ambientes/env-<id>) que limita
// CPU/memória/IO + 1 processo iniciado por "unshare" (PID, mount, UTS e IPC
// próprios). O script pode ser Bash ou Python 3 (campo "tipo"). É a versão "caseira" do que o Docker faz.
// O backend fala com este serviço por HTTP (POST /envs, GET /envs/:id, ...),
// sempre com o token compartilhado RUNNER_TOKEN.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn, execFileSync } = require("child_process");

const PORT = Number(process.env.PORT) || 4000;
const BIND = process.env.BIND || "0.0.0.0";
const TOKEN = process.env.RUNNER_TOKEN || "";
const BASE_DIR = process.env.RUNNER_DIR || "/srv/runner";
const CGROUP_ROOT = process.env.CGROUP_ROOT || "/sys/fs/cgroup";
const CGROUP_DIR = path.join(CGROUP_ROOT, "ambientes");
const SCRIPTS_DIR = path.join(BASE_DIR, "scripts");
const LOGS_DIR = path.join(BASE_DIR, "logs");
const STATE_FILE = path.join(BASE_DIR, "state.json");
const MAX_LOG_CHUNK = 64 * 1024;

// id -> { id, status, pid, exitCode, reason, stopRequested, limits }
const envs = new Map();
const children = new Map();

// Interpretadores permitidos. Só estes valores fixos entram no comando do shell
// (nunca texto vindo do usuário). Python roda com -u (sem buffer) para o log
// aparecer em tempo real, já que a saída vai para arquivo e não para um terminal.
const INTERPRETERS = { bash: "/bin/bash", python: "/usr/bin/python3 -u" };
const EXTENSIONS = { bash: "sh", python: "py" };

const scriptFile = (id, tipo = "bash") => path.join(SCRIPTS_DIR, `env-${id}.${EXTENSIONS[tipo]}`);
const logFile = (id) => path.join(LOGS_DIR, `env-${id}.log`);
const cgroupPath = (id) => path.join(CGROUP_DIR, `env-${id}`);

const publicEnv = ({ stopRequested, ...rest }) => rest;

const saveState = () => {
    fs.writeFileSync(STATE_FILE, JSON.stringify([...envs.values()].map(publicEnv), null, 2));
};

const writeCg = (file, value) => fs.writeFileSync(file, String(value));

// Habilita os controllers cpu/memory/io no cgroup raiz e no "ambientes";
// sem isso os arquivos cpu.max/memory.max/io.max não existem nos filhos.
const setupCgroups = () => {
    fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    if (!fs.existsSync(path.join(CGROUP_ROOT, "cgroup.controllers"))) {
        throw new Error("cgroup v2 não está ativo neste sistema.");
    }
    writeCg(path.join(CGROUP_ROOT, "cgroup.subtree_control"), "+cpu +memory +io");
    fs.mkdirSync(CGROUP_DIR, { recursive: true });
    writeCg(path.join(CGROUP_DIR, "cgroup.subtree_control"), "+cpu +memory +io");
};

// io.max exige o major:minor do disco inteiro que hospeda o runner.
const findBlockDevice = () => {
    try {
        const source = execFileSync("findmnt", ["-no", "SOURCE", "-T", BASE_DIR]).toString().trim();
        const disk = execFileSync("lsblk", ["-no", "PKNAME", source]).toString().trim().split("\n")[0];
        const name = disk || path.basename(source);
        return fs.readFileSync(`/sys/block/${name}/dev`, "utf8").trim();
    } catch (error) {
        console.error("Não foi possível determinar o dispositivo de bloco:", error.message);
        return null;
    }
};
let blockDevice = null;

// cpu.max "quota período": 20% de 1 core = "20000 100000".
// memory.max em bytes; swap desligado para o limite ser real.
// Falha no io.max vira aviso no log (não impede a execução).
const applyLimits = (id, { cpu, memory, io }) => {
    const dir = cgroupPath(id);
    fs.mkdirSync(dir, { recursive: true });
    writeCg(path.join(dir, "cpu.max"), `${cpu * 1000} 100000`);
    writeCg(path.join(dir, "memory.max"), memory * 1024 * 1024);
    if (fs.existsSync(path.join(dir, "memory.swap.max"))) {
        writeCg(path.join(dir, "memory.swap.max"), 0);
    }
    const warnings = [];
    if (blockDevice) {
        const bps = io * 1024 * 1024;
        try {
            writeCg(path.join(dir, "io.max"), `${blockDevice} rbps=${bps} wbps=${bps}`);
        } catch (error) {
            warnings.push(`io.max não aplicado: ${error.message}`);
        }
    } else {
        warnings.push("io.max não aplicado: dispositivo desconhecido");
    }
    return warnings;
};

const readOomKills = (id) => {
    try {
        const events = fs.readFileSync(path.join(cgroupPath(id), "memory.events"), "utf8");
        return Number((events.match(/oom_kill (\d+)/) || [])[1] || 0);
    } catch {
        return 0;
    }
};

// cgroup.kill (kernel 5.14+) mata todos os processos do ambiente de uma vez;
// o fallback lê cgroup.procs e envia SIGKILL a cada um.
const killCgroup = (id) => {
    const dir = cgroupPath(id);
    if (!fs.existsSync(dir)) return;
    try {
        writeCg(path.join(dir, "cgroup.kill"), 1);
    } catch {
        const pids = fs.readFileSync(path.join(dir, "cgroup.procs"), "utf8").split("\n").filter(Boolean);
        for (const pid of pids) {
            try { process.kill(Number(pid), "SIGKILL"); } catch { /* já finalizado */ }
        }
    }
};

const removeCgroup = (id) => {
    try { fs.rmdirSync(cgroupPath(id)); } catch { /* ainda ocupado ou inexistente */ }
};

const cgroupIsEmpty = (id) => {
    try {
        return fs.readFileSync(path.join(cgroupPath(id), "cgroup.procs"), "utf8").trim() === "";
    } catch {
        return true;
    }
};

// Estado final do ambiente: registra o resultado, libera o cgroup e persiste.
const finish = (env, status, exitCode, reason) => {
    env.status = status;
    env.exitCode = exitCode;
    env.reason = reason;
    env.pid = null;
    children.delete(env.id);
    removeCgroup(env.id);
    saveState();
};

// stdout/stderr vão direto para o arquivo de log (o agent não segura a saída em
// memória), então serviços de longa duração não crescem o consumo do agent.
// O script do usuário é salvo em arquivo e executado pelo interpretador do seu
// tipo (bash ou python3): nunca é interpolado em um comando, o que evita injeção de shell.
const startEnv = ({ id, cpu, memory, io, script, net, tipo }) => {
    const env = { id, tipo, status: "em_execucao", pid: null, exitCode: null, reason: null, stopRequested: false, limits: { cpu, memory, io } };
    const warnings = applyLimits(id, env.limits);

    const file = scriptFile(id, tipo);
    fs.writeFileSync(file, script.replace(/\r\n/g, "\n"), { mode: 0o700 });
    const logFd = fs.openSync(logFile(id), "a");
    warnings.forEach((w) => fs.writeSync(logFd, `[runner] ${w}\n`));

    // O shell entra no cgroup antes do exec; descendentes herdam os limites.
    const unshareArgs = ["--pid", "--fork", "--mount-proc", "--uts", "--ipc"];
    if (net) unshareArgs.push("--net");
    const inner = `hostname env-${id}; exec ${INTERPRETERS[tipo]} "$1"`;
    const wrapper = `echo $$ > "$1/cgroup.procs"; shift; exec unshare "$@"`;

    const child = spawn(
        "/bin/sh",
        ["-c", wrapper, "sh", cgroupPath(id), ...unshareArgs, "--", "/bin/sh", "-c", inner, "sh", file],
        { stdio: ["ignore", logFd, logFd], detached: true }
    );
    fs.closeSync(logFd);

    env.pid = child.pid;
    envs.set(id, env);
    children.set(id, child);
    saveState();

    child.on("error", (error) => finish(env, "erro", null, `Falha ao iniciar: ${error.message}`));
    // Como o término foi classificado: parada pedida pelo usuário > OOM > código de saída
    child.on("exit", (code, signal) => {
        const oom = readOomKills(id) > 0;
        if (env.stopRequested) {
            finish(env, "terminado", code, "Encerrado pelo usuário");
        } else if (oom) {
            finish(env, "erro", code, "Encerrado por falta de memória (OOM)");
        } else if (code === 0) {
            finish(env, "terminado", 0, null);
        } else {
            finish(env, "erro", code, signal ? `Sinal ${signal}` : null);
        }
    });
    return env;
};

const stopEnv = async (env) => {
    if (env.status !== "em_execucao") return;
    env.stopRequested = true;
    killCgroup(env.id);
    for (let i = 0; i < 50 && env.status === "em_execucao"; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (env.status === "em_execucao") {
        finish(env, "terminado", null, "Encerrado pelo usuário");
    }
};

// Após reinício do agent: processos ainda no cgroup continuam sendo monitorados.
const reconcile = () => {
    if (fs.existsSync(STATE_FILE)) {
        for (const env of JSON.parse(fs.readFileSync(STATE_FILE, "utf8"))) {
            envs.set(env.id, { ...env, stopRequested: false });
            if (env.status === "em_execucao" && cgroupIsEmpty(env.id)) {
                finish(envs.get(env.id), "erro", null, "Runner reiniciado; processo não encontrado");
            }
        }
    }
    setInterval(() => {
        for (const env of envs.values()) {
            if (env.status === "em_execucao" && !children.has(env.id) && cgroupIsEmpty(env.id)) {
                finish(env, "terminado", null, "Finalizado (código de saída desconhecido)");
            }
        }
    }, 2000);
};

// Leitura parcial do log a partir de "offset" (no máximo 64KB por chamada).
// Devolve o novo offset para o cliente continuar de onde parou.
const readLogs = (id, offset) => {
    const file = logFile(id);
    if (!fs.existsSync(file)) return { content: "", offset: 0, size: 0 };
    const { size } = fs.statSync(file);
    const start = Math.min(Math.max(offset, 0), size);
    const length = Math.min(size - start, MAX_LOG_CHUNK);
    const buffer = Buffer.alloc(length);
    const fd = fs.openSync(file, "r");
    try {
        fs.readSync(fd, buffer, 0, length, start);
    } finally {
        fs.closeSync(fd);
    }
    return { content: buffer.toString("utf8"), offset: start + length, size };
};

// Token compartilhado com o backend, comparado em tempo constante.
// Sem RUNNER_TOKEN configurado, toda requisição é recusada.
const authorized = (req) => {
    const given = Buffer.from((req.headers.authorization || "").replace(/^Bearer /, ""));
    const expected = Buffer.from(TOKEN);
    return TOKEN !== "" && given.length === expected.length && crypto.timingSafeEqual(given, expected);
};

const readBody = (req) =>
    new Promise((resolve, reject) => {
        let raw = "";
        req.on("data", (chunk) => {
            raw += chunk;
            if (raw.length > 2 * 1024 * 1024) reject(new Error("Corpo muito grande"));
        });
        req.on("end", () => {
            try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("JSON inválido")); }
        });
    });

const send = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
};

const validLimit = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

const handle = async (req, res) => {
    if (!authorized(req)) return send(res, 401, { error: "Não autorizado" });

    const url = new URL(req.url, "http://runner");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "envs") return send(res, 404, { error: "Rota não encontrada" });

    if (parts.length === 1) {
        if (req.method === "GET") return send(res, 200, [...envs.values()].map(publicEnv));
        if (req.method === "POST") {
            const body = await readBody(req);
            const { id, cpu, memory, io, script } = body;
            const tipo = body.tipo === undefined ? "bash" : body.tipo;
            if (!Number.isInteger(id) || id < 1 || typeof script !== "string" || !script.trim()
                || !Object.hasOwn(INTERPRETERS, tipo) || !validLimit(cpu, 1, 100) || !validLimit(memory, 16, 3072) || !validLimit(io, 1, 1000)) {
                return send(res, 400, { error: "Parâmetros inválidos" });
            }
            if (envs.has(id)) return send(res, 409, { error: "Ambiente já existe" });
            return send(res, 201, publicEnv(startEnv({ ...body, tipo, net: body.net === true })));
        }
        return send(res, 405, { error: "Método não permitido" });
    }

    const id = Number(parts[1]);
    if (!Number.isInteger(id)) return send(res, 400, { error: "Id inválido" });
    const env = envs.get(id);
    if (!env) return send(res, 404, { error: "Ambiente não encontrado" });
    const action = parts[2];

    if (!action && req.method === "GET") return send(res, 200, publicEnv(env));
    if (action === "logs" && req.method === "GET") {
        return send(res, 200, readLogs(id, Number(url.searchParams.get("offset")) || 0));
    }
    if (action === "stop" && req.method === "POST") {
        await stopEnv(env);
        return send(res, 200, publicEnv(env));
    }
    if (!action && req.method === "DELETE") {
        await stopEnv(env);
        removeCgroup(id);
        const files = [...Object.keys(EXTENSIONS).map((t) => scriptFile(id, t)), logFile(id)];
        for (const file of files) fs.rmSync(file, { force: true });
        envs.delete(id);
        saveState();
        return send(res, 200, { message: "Removido" });
    }
    return send(res, 405, { error: "Método não permitido" });
};

setupCgroups();
blockDevice = findBlockDevice();
reconcile();

http.createServer((req, res) => {
    handle(req, res).catch((error) => {
        console.error(error);
        send(res, 500, { error: error.message });
    });
}).listen(PORT, BIND, () => console.log(`Runner agent em ${BIND}:${PORT}`));
