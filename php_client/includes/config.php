<?php
// php_client/includes/config.php

function required_env(string $name): string {
    $value = trim((string) getenv($name));
    if ($value === '') {
        throw new RuntimeException("Environment variable {$name} belum dikonfigurasi.");
    }
    return $value;
}

// Kanata Core — sumber data dan auth. Ganti dari webhook bot (8787) ke core (8790).
define('API_BASE_URL', rtrim(getenv('KANATA_CORE_URL') ?: 'http://127.0.0.1:8790', '/'));
define('KANATA_BOT_URL', rtrim(getenv('KANATA_BOT_WEBHOOK_URL') ?: 'http://127.0.0.1:8787', '/'));
define('KANATA_CORE_CLIENT_ID', required_env('KANATA_CORE_CLIENT_ID'));
define('KANATA_CORE_CLIENT_SECRET', required_env('KANATA_CORE_CLIENT_SECRET'));

define('DB_PATH', __DIR__ . '/../db/database.sqlite');

// Session security
ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
ini_set('session.cookie_samesite', 'Strict');
ini_set('session.cookie_secure', 1);
ini_set('session.use_strict_mode', 1);

if (!headers_sent()) {
    header('Permissions-Policy: camera=(), geolocation=(), microphone=()');
    header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    }
}
?>
