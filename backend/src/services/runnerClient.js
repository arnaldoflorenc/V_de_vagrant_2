// Cliente HTTP do runner agent (VM runner, rede 10.1.3.0). 
// O backend nunca executa os programas: 
// só pede ao runner para criar/consultar/parar ambientes.
// Autentica com o token compartilhado (RUNNER_TOKEN) e aborta após 10s.
const baseUrl = () => process.env.RUNNER_URL || "http://10.1.3.20:4000";

const call = async (method, path, body) => {
    const response = await fetch(`${baseUrl()}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.RUNNER_TOKEN || ""}`
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(data.error || `Runner respondeu ${response.status}`);
        error.status = response.status;
        throw error;
    }
    return data;
};

module.exports = {
    createEnv: (env) => call("POST", "/envs", env),
    getEnv: (id) => call("GET", `/envs/${id}`),
    getLogs: (id, offset = 0) => call("GET", `/envs/${id}/logs?offset=${offset}`),
    stopEnv: (id) => call("POST", `/envs/${id}/stop`),
    deleteEnv: (id) => call("DELETE", `/envs/${id}`)
};
