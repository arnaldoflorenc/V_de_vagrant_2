Vagrant.configure("2") do |config|
  is_arm = RUBY_PLATFORM.include?("arm64") ||
           RUBY_PLATFORM.include?("aarch64")

  box_name = is_arm ? "bento/ubuntu-22.04" : "ubuntu/jammy64"
  repo_url = "https://github.com/arnaldoflorenc/V_de_vagrant_2.git"
  branch = "main"

  config.vm.boot_timeout = 600
  config.vm.synced_folder ".", "/vagrant", disabled: true

  config.vm.provider "virtualbox" do |vb|
    vb.gui = false
    vb.memory = 2048
    vb.cpus = 1

    vb.customize ["modifyvm", :id, "--natdnshostresolver1", "on"]
    vb.customize ["modifyvm", :id, "--nested-hw-virt", "off"]
  end

  provision_code = <<-SHELL # Área de provisionamento comum a todas as vms apenas muda a especificidade daquilo que é necessário
    set -e

    REPO="/home/vagrant/work"
    MARKER="/etc/vagrant_provisioned"
    COMPONENT="COMPONENT_PLACEHOLDER"

    export DEBIAN_FRONTEND=noninteractive

    apt-get update
    apt-get install -y curl net-tools git

    if [ ! -d "$REPO/.git" ]; then
      rm -rf "$REPO"
      git clone --filter=blob:none --no-checkout "#{repo_url}" "$REPO"
      cd "$REPO"
      git sparse-checkout init --cone
      git sparse-checkout set "$COMPONENT"
      git checkout "#{branch}"
    else
      cd "$REPO"
      git fetch origin "#{branch}"
      git reset --hard "origin/#{branch}"
      git checkout -B "#{branch}" "origin/#{branch}"
      git sparse-checkout set "$COMPONENT"
    fi
  SHELL

  # front
  config.vm.define "frontend" do |vm|
    vm.vm.box = box_name
    vm.vm.hostname = "frontend"

    vm.vm.network "forwarded_port",
      guest: 5173, host: 5173, auto_correct: true

    vm.vm.network "private_network",
      ip: "10.1.1.10", virtualbox__intnet: "front_back"

    vm.vm.provision "file",
      source: "frontend/vite.config.js",
      destination: "/tmp/vite.config.js"

    script = provision_code.gsub("COMPONENT_PLACEHOLDER", "frontend")

    script += <<-SHELL
      if ! command -v node >/dev/null 2>&1; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs build-essential
      fi

      cd /home/vagrant/work/frontend
      install -o vagrant -g vagrant -m 644 /tmp/vite.config.js ./vite.config.js
      npm install
      chown -R vagrant:vagrant /home/vagrant/work/frontend

      cat > /etc/systemd/system/frontend.service <<'EOF'
[Unit]
Description=React Frontend
After=network.target

[Service]
User=vagrant
WorkingDirectory=/home/vagrant/work/frontend
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=NODE_ENV=development
ExecStart=/usr/bin/npm run dev -- --host 0.0.0.0
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

      systemctl daemon-reload
      systemctl enable frontend
      systemctl restart frontend
      touch "$MARKER"
    SHELL

    vm.vm.provision "shell", inline: script
  end

  # Back
  config.vm.define "backend" do |vm|
    vm.vm.box = box_name
    vm.vm.hostname = "backend"

    vm.vm.network "forwarded_port",
      guest: 4000, host: 4000, auto_correct: true

    vm.vm.network "private_network",
      ip: "10.1.1.2", virtualbox__intnet: "front_back"

    vm.vm.network "private_network",
      ip: "10.1.2.10", virtualbox__intnet: "back_db"

    vm.vm.network "private_network",
      ip: "10.1.3.10", virtualbox__intnet: "back_runner"

    unless File.file?(".env")
      raise "Arquivo .env não encontrado no diretório do Vagrant."
    end

    vm.vm.provision "file",
      source: ".env",
      destination: "/tmp/backend.env"

    script = provision_code.gsub("COMPONENT_PLACEHOLDER", "backend")

    script += <<-SHELL
      if ! command -v node >/dev/null 2>&1; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs build-essential
      fi

      cd /home/vagrant/work/backend
      npm install

      cp /tmp/backend.env /home/vagrant/work/backend/.env
      chown -R vagrant:vagrant /home/vagrant/work/backend
      chmod 600 /home/vagrant/work/backend/.env

      cat > /etc/systemd/system/backend.service <<'EOF'
[Unit]
Description=Node.js Backend
After=network.target

[Service]
User=vagrant
WorkingDirectory=/home/vagrant/work/backend
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=NODE_ENV=development
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

      systemctl daemon-reload
      systemctl enable backend
      systemctl restart backend
      touch "$MARKER"
    SHELL

    vm.vm.provision "shell", inline: script
  end

  # DB
  config.vm.define "db" do |vm|
    vm.vm.box = box_name
    vm.vm.hostname = "db"

    vm.vm.network "private_network",
      ip: "10.1.2.2", virtualbox__intnet: "back_db"

    script = provision_code.gsub("COMPONENT_PLACEHOLDER", "db")

    script += <<-SHELL
      if ! command -v mysql >/dev/null 2>&1; then
        apt-get install -y mysql-server
      fi

      systemctl enable --now mysql

      sed -i 's/^bind-address.*/bind-address = 0.0.0.0/' \
        /etc/mysql/mysql.conf.d/mysqld.cnf

      systemctl restart mysql

      if [ -f /home/vagrant/work/db/schema.sql ]; then
        mysql < /home/vagrant/work/db/schema.sql
      fi

      touch "$MARKER"
    SHELL

    vm.vm.provision "shell", inline: script
  end

  # Runner
  config.vm.define "runner" do |vm|
    vm.vm.box = box_name
    vm.vm.hostname = "runner"

    vm.vm.provider "virtualbox" do |vb|
      vb.memory = 4096
      vb.cpus = 1
    end

    vm.vm.network "private_network",
      ip: "10.1.3.20", virtualbox__intnet: "back_runner"

    if File.file?("runner.env")
      vm.vm.provision "file",
        source: "runner.env",
        destination: "/tmp/runner.env"
    end

    script = provision_code.gsub("COMPONENT_PLACEHOLDER", "runner")

    script += <<-SHELL
      if [ ! -f /tmp/runner.env ]; then
        echo "Arquivo runner.env não encontrado; crie-o com RUNNER_TOKEN para provisionar o runner." >&2
        exit 1
      fi

      if ! command -v node >/dev/null 2>&1; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
      fi

      if ! grep -Eq '^RUNNER_TOKEN=[^[:space:]#]+$' /tmp/runner.env; then
        echo "Arquivo runner.env inválido: defina RUNNER_TOKEN sem espaços." >&2
        exit 1
      fi

      install -d -m 755 /etc/runner
      install -m 600 -o root -g root /tmp/runner.env /etc/runner/runner.env

      mkdir -p /srv/runner/scripts /srv/runner/logs
      chmod 755 /srv/runner/scripts /srv/runner/logs

      cat > /etc/systemd/system/runner.service <<'EOF'
[Unit]
Description=Vagrant Runner Agent
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/vagrant/work/runner
EnvironmentFile=/etc/runner/runner.env
Environment=PORT=4000
ExecStart=/usr/bin/node /home/vagrant/work/runner/agent.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

      systemctl daemon-reload
      systemctl enable --now runner
    SHELL

    vm.vm.provision "shell", inline: script
  end
end