#!/bin/bash
# Testes manuais do runner agent. Executar DENTRO da VM runner:
#   RUNNER_TOKEN=<token> bash /home/vagrant/work/runner/test.sh
set -u
API=${API:-http://localhost:4000}
AUTH="Authorization: Bearer ${RUNNER_TOKEN:?defina RUNNER_TOKEN}"

post() { curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' "$API$1" -d "$2"; echo; }
get()  { curl -s -H "$AUTH" "$API$1"; echo; }

echo "== 1. termina com sucesso (esperado: terminado)"
post /envs '{"id":9001,"cpu":50,"memory":64,"io":10,"script":"echo ola; sleep 1"}'
sleep 3; get /envs/9001; get /envs/9001/logs

echo "== 2. exit 1 (esperado: erro)"
post /envs '{"id":9002,"cpu":50,"memory":64,"io":10,"script":"echo falhou; exit 1"}'
sleep 2; get /envs/9002

echo "== 3. serviço infinito + CPU limitada a 20% (confira com top/systemd-cgtop)"
post /envs '{"id":9003,"cpu":20,"memory":64,"io":10,"script":"while true; do :; done"}'
sleep 3; get /envs/9003
echo "cpu.max: $(cat /sys/fs/cgroup/ambientes/env-9003/cpu.max)"
echo "pid ns (deve diferir do host): $(sudo ls -l "/proc/$(tail -n 1 /sys/fs/cgroup/ambientes/env-9003/cgroup.procs)/ns/pid")"

echo "== 4. estouro de memória (esperado: erro/OOM)"
post /envs '{"id":9004,"cpu":50,"memory":32,"io":10,"script":"python3 -c \"x=bytearray(200*1024*1024); print(len(x))\""}'
sleep 4; get /envs/9004

echo "== 5. parar e remover"
post /envs/9003/stop '{}'; get /envs/9003
for id in 9001 9002 9003 9004; do curl -s -X DELETE -H "$AUTH" "$API/envs/$id"; echo; done
ls /sys/fs/cgroup/ambientes/
