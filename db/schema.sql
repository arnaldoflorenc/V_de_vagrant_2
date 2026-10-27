-- Schema do projeto. É reaplicado a cada provisionamento da VM db,
-- por isso tudo usa IF NOT EXISTS (idempotente).
--   usuarios   -> contas registradas
--   scripts    -> scripts enviados pelo usuário, guardados para reuso
--   ambiente   -> cada ambiente isolado (namespaces/cgroups) com seus limites
--   execucoes  -> histórico/resultado da execução de cada ambiente
CREATE DATABASE IF NOT EXISTS vagrantdb;

USE vagrantdb;

CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scripts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    nome VARCHAR(100) NOT NULL,
    conteudo MEDIUMTEXT NOT NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- cpu_limit: % de 1 core | memory_limit: MB | io_limit: MB/s
CREATE TABLE IF NOT EXISTS ambiente (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    script_id INT NULL,
    nome VARCHAR(100) NOT NULL,
    status ENUM('pendente', 'em_execucao', 'terminado', 'erro')
        NOT NULL DEFAULT 'pendente',
    cpu_limit VARCHAR(255) NOT NULL,
    memory_limit VARCHAR(255) NOT NULL,
    io_limit VARCHAR(255) NOT NULL,
    script_path VARCHAR(255) NOT NULL,
    comando TEXT NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS execucoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ambiente_id INT NOT NULL,
    status ENUM('pendente', 'em_execucao', 'terminado', 'erro')
        NOT NULL DEFAULT 'pendente',
    resultado TEXT,
    iniciado_em TIMESTAMP NULL,
    finalizado_em TIMESTAMP NULL,
    FOREIGN KEY (ambiente_id) REFERENCES ambiente(id) ON DELETE CASCADE
);

CREATE USER IF NOT EXISTS 'app'@'10.1.2.10' IDENTIFIED BY 'senha'; 
GRANT ALL PRIVILEGES ON vagrantdb.* TO 'app'@'10.1.2.10'; 
FLUSH PRIVILEGES;