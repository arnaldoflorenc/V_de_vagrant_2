#!/bin/bash
# Executar como script Bash dentro de um ambiente criado pelo runner.
# Valida namespaces e limites; so inicia o heartbeat se todos passarem.
# O teste destrutivo de OOM fica em stress-test.mjs, em ambiente separado.
set -euo pipefail

fail() { echo "FAIL: $*" >&2; exit 1; }
[[ $$ -eq 1 ]] || fail "PID esperado: 1; recebido: $$"
[[ $(hostname) =~ ^env-[0-9]+$ ]] || fail "Hostname fora do formato env-<id>"
echo "PASS: PID 1 e hostname $(hostname)"

CG="/sys/fs/cgroup$(awk -F: '$1 == "0" {print $3}' /proc/self/cgroup)"
for file in cpu.max cpu.stat memory.max memory.current io.max; do
    [[ -r "$CG/$file" ]] || fail "Arquivo cgroup ausente: $CG/$file"
done
command -v python3 >/dev/null || fail "Python 3 nao encontrado"
command -v dd >/dev/null || fail "dd nao encontrado"

# Mesmo diretorio do script: usa o volume onde o runner aplica io.max.
IO_FILE=$(mktemp "$(dirname "$0")/io-test.XXXXXX")
trap 'rm -f -- "$IO_FILE"' EXIT

python3 - "$CG" "$IO_FILE" <<'PY'
import pathlib
import subprocess
import sys
import time

cg = pathlib.Path(sys.argv[1])
io_file = sys.argv[2]

def read(name):
    return (cg / name).read_text().strip()

def counters(name):
    return dict(line.split() for line in read(name).splitlines())

def require(condition, message):
    if not condition:
        raise SystemExit(f"FAIL: {message}")

print(f"cpu.max: {read('cpu.max')}", flush=True)
print(f"memory.max: {read('memory.max')}", flush=True)
print(f"io.max: {read('io.max')}", flush=True)

quota, period = read("cpu.max").split()
require(quota != "max", "CPU sem limite")
quota, period = int(quota), int(period)
require(0 < quota <= period, "quota de CPU fora do intervalo do runner")
before = counters("cpu.stat")
start = time.monotonic()
worker = subprocess.Popen(["bash", "-c", "while :; do :; done"])
try:
    time.sleep(5)
finally:
    worker.kill()
    worker.wait()
elapsed = time.monotonic() - start
after = counters("cpu.stat")
used = (int(after["usage_usec"]) - int(before["usage_usec"])) / 1_000_000
expected = elapsed * quota / period
require(expected * 0.5 <= used <= expected * 1.25 + period / 1_000_000,
        f"CPU: {used:.2f}s consumidos; esperado aproximadamente {expected:.2f}s")
if quota < period:
    require(int(after["nr_throttled"]) > int(before["nr_throttled"]),
            "CPU nao registrou throttling")
print(f"PASS: CPU {used:.2f}s em {elapsed:.2f}s", flush=True)

limits = []
for line in read("io.max").splitlines():
    for field in line.split()[1:]:
        if field.startswith("wbps=") and field != "wbps=max":
            limits.append(int(field.split("=")[1]))
require(len(limits) == 1 and limits[0] > 0,
        "esperado um dispositivo com limite de escrita em io.max")
start = time.monotonic()
try:
    subprocess.run(["dd", "if=/dev/zero", f"of={io_file}", "bs=1M", "count=8",
                    "oflag=direct", "conv=fsync", "status=none"],
                   check=True, timeout=30)
except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
    raise SystemExit(f"FAIL: escrita direta: {error}")
elapsed = time.monotonic() - start
size = pathlib.Path(io_file).stat().st_size
require(size == 8 * 1024 * 1024, f"escrita incompleta: {size} bytes")
rate = size / elapsed
require(rate <= limits[0] * 1.3, f"I/O {rate:.0f} B/s excede limite {limits[0]} B/s")
print(f"PASS: I/O {rate / 1024 / 1024:.2f} MiB/s (tolerancia: 30%)", flush=True)

require(read("memory.max") != "max", "memoria sem limite")
limit = int(read("memory.max"))
before = int(read("memory.current"))
allocation = min(32 * 1024 * 1024, (limit - before) // 4)
require(allocation >= 1024 * 1024, "memoria livre insuficiente para teste nao destrutivo")
block = bytearray(allocation)
current = int(read("memory.current"))
require(current <= limit, f"consumo {current} excede memory.max {limit}")
require(current - before >= allocation * 0.75, "alocacao nao refletida no cgroup")
print(f"PASS: memoria: alocados {len(block)} bytes; consumo {current}/{limit}", flush=True)
PY

rm -f -- "$IO_FILE"
trap - EXIT
echo "PASS: todas as verificacoes; iniciando heartbeat (use PARAR para encerrar)"
while true; do
    echo "$(date +%T) ping"
    sleep 2
    echo "$(date +%T) pong"
    sleep 2
done
