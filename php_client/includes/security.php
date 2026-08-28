<?php

function csrf_token() {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function csrf_field() {
    return '<input type="hidden" name="csrf_token" value="' . htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8') . '">';
}

function verify_csrf_or_abort() {
    $submitted = (string) ($_POST['csrf_token'] ?? '');
    if ($submitted !== '' && hash_equals(csrf_token(), $submitted)) {
        return;
    }

    http_response_code(419);
    header('Content-Type: text/html; charset=UTF-8');
    echo '<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
    echo '<title>Sesi kedaluwarsa</title><body style="font-family:system-ui;padding:3rem;max-width:42rem;margin:auto">';
    echo '<h1>Sesi formulir kedaluwarsa</h1><p>Muat ulang halaman, lalu ulangi tindakanmu.</p>';
    echo '<p><a href="javascript:history.back()">Kembali</a></p></body></html>';
    exit;
}

function login_client_key($credential) {
    $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    if (!filter_var($ip, FILTER_VALIDATE_IP)) {
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    }
    return hash('sha256', $ip . '|' . strtolower(trim((string) $credential)));
}

function login_rate_state($key) {
    $path = sys_get_temp_dir() . '/kanata-login-' . $key . '.json';
    $state = ['attempts' => [], 'blocked_until' => 0];
    if (is_file($path)) {
        $decoded = json_decode((string) file_get_contents($path), true);
        if (is_array($decoded)) $state = array_merge($state, $decoded);
    }
    return [$path, $state];
}

function login_rate_status($credential) {
    $key = login_client_key($credential);
    [, $state] = login_rate_state($key);
    $now = time();
    if (($state['blocked_until'] ?? 0) > $now) {
        return ['allowed' => false, 'retry_after' => $state['blocked_until'] - $now];
    }
    return ['allowed' => true, 'retry_after' => 0];
}

function record_login_failure($credential) {
    $key = login_client_key($credential);
    [$path, $state] = login_rate_state($key);
    $now = time();
    $windowStart = $now - 15 * 60;
    $attempts = array_values(array_filter($state['attempts'] ?? [], fn($time) => $time >= $windowStart));
    $attempts[] = $now;
    $blockedUntil = count($attempts) >= 5 ? $now + 15 * 60 : 0;
    file_put_contents($path, json_encode(['attempts' => $attempts, 'blocked_until' => $blockedUntil]), LOCK_EX);
    @chmod($path, 0600);
}

function clear_login_failures($credential) {
    $key = login_client_key($credential);
    [$path] = login_rate_state($key);
    if (is_file($path)) @unlink($path);
}
?>
