-- ─────────────────────────────────────────
-- Inicialização do banco de dados
-- Executado uma única vez na criação do container
-- ─────────────────────────────────────────

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- Busca full-text eficiente
CREATE EXTENSION IF NOT EXISTS "unaccent";   -- Busca sem acentos

-- Configurações de performance para desenvolvimento
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET max_connections = '100';

SELECT pg_reload_conf();