<?php
// php_client/logout.php
require_once __DIR__ . '/includes/auth.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: index.php');
    exit;
}
verify_csrf_or_abort();
logout();
header("Location: login.php");
exit;
?>
