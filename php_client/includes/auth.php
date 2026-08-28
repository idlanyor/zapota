<?php
// php_client/includes/auth.php
require_once __DIR__ . '/api.php';

session_start();
require_once __DIR__ . '/security.php';

/**
 * Melakukan login dengan memverifikasi kredensial ke Bot API
 */
function login($username, $password) {
    $res = send_api_request('POST', '/api/webhook/auth/login', [
        'username' => $username,
        'password' => $password
    ]);

    if (isset($res['ok']) && $res['ok'] && isset($res['data'])) {
        session_regenerate_id(true);
        $userData = $res['data'];
        $_SESSION['user_id'] = $userData['userId'];
        $_SESSION['username'] = $userData['username'];
        $_SESSION['whatsapp_number'] = $userData['userId']; // JID Lengkap (misal: 62812@s.whatsapp.net)
        $_SESSION['is_owner'] = $userData['isOwner'] ?? false;
        return ['ok' => true];
    }
    return [
        'ok' => false,
        'error' => $res['error'] ?? 'Login gagal',
        'http_code' => $res['http_code'] ?? 0
    ];
}

/**
 * Menghapus session untuk logout
 */
function logout() {
    $_SESSION = array();
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $params['path'],
            'domain' => $params['domain'],
            'secure' => $params['secure'],
            'httponly' => $params['httponly'],
            'samesite' => 'Strict'
        ]);
    }
    session_destroy();
}

/**
 * Mengecek apakah user sudah terautentikasi di session
 */
function check_auth() {
    return isset($_SESSION['user_id']);
}

/**
 * Memastikan user login, jika tidak redirect ke login.php
 */
function require_login() {
    if (!check_auth()) {
        header("Location: login.php");
        exit;
    }
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        verify_csrf_or_abort();
    }
    $now = time();
    if (!empty($_SESSION['last_activity']) && $now - $_SESSION['last_activity'] > 30 * 60) {
        logout();
        header('Location: login.php?expired=1');
        exit;
    }
    $_SESSION['last_activity'] = $now;
}
?>
