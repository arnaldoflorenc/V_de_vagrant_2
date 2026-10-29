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
    tipo ENUM('bash', 'python') NOT NULL DEFAULT 'bash',
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
    tipo ENUM('bash', 'python') NOT NULL DEFAULT 'bash',
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

-- Migração: bancos criados antes do suporte a Python não têm a coluna "tipo"
-- (CREATE TABLE IF NOT EXISTS não altera tabelas existentes). O MySQL não tem
-- "ADD COLUMN IF NOT EXISTS", então a existência é checada no information_schema.
SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = 'vagrantdb' AND TABLE_NAME = 'scripts' AND COLUMN_NAME = 'tipo') = 0,
    "ALTER TABLE scripts ADD COLUMN tipo ENUM('bash','python') NOT NULL DEFAULT 'bash' AFTER nome",
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = 'vagrantdb' AND TABLE_NAME = 'ambiente' AND COLUMN_NAME = 'tipo') = 0,
    "ALTER TABLE ambiente ADD COLUMN tipo ENUM('bash','python') NOT NULL DEFAULT 'bash' AFTER nome",
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE USER IF NOT EXISTS 'app'@'10.1.2.10' IDENTIFIED BY 'senha'; 
GRANT ALL PRIVILEGES ON vagrantdb.* TO 'app'@'10.1.2.10'; 
FLUSH PRIVILEGES;