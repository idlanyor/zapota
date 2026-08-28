CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    display_name VARCHAR(255) NOT NULL DEFAULT '',
    role ENUM('user', 'admin', 'owner') NOT NULL DEFAULT 'user',
    status ENUM('active', 'suspended', 'deleted') NOT NULL DEFAULT 'active',
    password_hash VARCHAR(255) NULL,
    web_enabled TINYINT(1) NOT NULL DEFAULT 0,
    balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4

CREATE TABLE IF NOT EXISTS user_identities (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    type ENUM('phone', 'whatsapp_jid', 'whatsapp_lid') NOT NULL,
    value VARCHAR(255) NOT NULL,
    normalized_value VARCHAR(255) NOT NULL,
    is_primary TINYINT(1) NOT NULL DEFAULT 0,
    verified_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_identity_type_value (type, normalized_value),
    KEY idx_identities_user (user_id),
    KEY idx_identities_user_primary (user_id, is_primary),
    CONSTRAINT fk_identities_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4

CREATE TABLE IF NOT EXISTS service_clients (
    id VARCHAR(36) PRIMARY KEY,
    client_id VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    secret_encrypted TEXT NOT NULL,
    scopes JSON NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4

CREATE TABLE IF NOT EXISTS request_nonces (
    client_id VARCHAR(64) NOT NULL,
    nonce VARCHAR(128) NOT NULL,
    expires_at DATETIME NOT NULL,
    PRIMARY KEY (client_id, nonce),
    KEY idx_nonces_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_type VARCHAR(32) NOT NULL,
    actor_id VARCHAR(64) NOT NULL,
    action VARCHAR(128) NOT NULL,
    resource_type VARCHAR(128) NULL,
    resource_id VARCHAR(64) NULL,
    metadata JSON NOT NULL,
    ip_address VARCHAR(45) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_audit_actor (actor_type, actor_id),
    KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4

CREATE TABLE IF NOT EXISTS web_sessions (
    session_token_hash CHAR(64) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    expires_at DATETIME NOT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_sessions_user (user_id),
    KEY idx_sessions_expiry (expires_at),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4

CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    user_name VARCHAR(255) NULL,
    type ENUM('income', 'expense') NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    category VARCHAR(64) NOT NULL DEFAULT 'General',
    source ENUM('finance', 'store', 'smm', 'general', 'other') NOT NULL DEFAULT 'other',
    description VARCHAR(255) NULL,
    kakeibo_category ENUM('needs', 'wants', 'culture', 'extras') NULL,
    date DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_transactions_user (user_id),
    KEY idx_transactions_source (source),
    CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4

CREATE TABLE IF NOT EXISTS budgets (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    month TINYINT NOT NULL,
    year SMALLINT NOT NULL,
    income_target DECIMAL(15, 2) NOT NULL DEFAULT 0,
    savings_target DECIMAL(15, 2) NOT NULL DEFAULT 0,
    note VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_budgets_user_month (user_id, month, year),
    CONSTRAINT fk_budgets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
