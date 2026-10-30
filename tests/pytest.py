"""Exemplo Python para cadastrar e executar na aplicacao; nao usa pytest."""

import os
import socket
import time
from pathlib import Path


print("Iniciando exemplo Python", flush=True)
print(f"PID: {os.getpid()}", flush=True)
print(f"Hostname: {socket.gethostname()}", flush=True)

cgroup = Path("/proc/self/cgroup")
if cgroup.is_file():
    print(f"Cgroup: {cgroup.read_text().strip()}", flush=True)

total = sum(range(1, 1001))
assert total == 500500, f"Resultado inesperado: {total}"
print(f"PASS: soma de 1 a 1000 = {total}", flush=True)

for step in range(1, 6):
    print(f"Etapa {step}/5", flush=True)
    time.sleep(1)

print("PASS: execucao concluida normalmente", flush=True)
