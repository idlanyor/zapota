<?php
// includes/header.php
require_once __DIR__ . '/auth.php';
require_login();

$currentPage = basename($_SERVER['PHP_SELF']);

function is_active($page, $current) {
    return $page === $current ? 'active' : '';
}

function get_initials($name) {
    $name = preg_replace('/[^a-zA-Z0-9\s]/', '', $name);
    $words = explode(' ', trim($name));
    if (count($words) >= 2) {
        return strtoupper(substr($words[0], 0, 1) . substr($words[1], 0, 1));
    }
    return strtoupper(substr($name, 0, 2));
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kanata Bot | Dashboard</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=Manrope:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
  <!-- Font Awesome -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <!-- Theme style -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/admin-lte@3.2/dist/css/adminlte.min.css">
  <link rel="stylesheet" href="assets/css/kanata.css?v=1.0.3">
</head>
<body class="hold-transition sidebar-mini page-<?php echo htmlspecialchars(pathinfo($currentPage, PATHINFO_FILENAME)); ?>">
<!-- Site wrapper -->
<div class="wrapper">
  <!-- Navbar -->
  <nav class="main-header navbar navbar-expand kanata-topbar">
    <!-- Left navbar links -->
    <ul class="navbar-nav">
      <li class="nav-item">
        <a class="nav-link menu-trigger" data-widget="pushmenu" href="#" role="button" aria-label="Buka navigasi"><i class="fas fa-bars"></i></a>
      </li>
      <li class="nav-item d-none d-sm-flex align-items-center">
        <span class="page-context"><span class="pulse-dot"></span><?php echo htmlspecialchars(strtoupper(pathinfo($currentPage, PATHINFO_FILENAME)), ENT_QUOTES, 'UTF-8'); ?></span>
      </li>
    </ul>

    <!-- Right navbar links -->
    <ul class="navbar-nav ml-auto">
      <li class="nav-item">
        <form method="POST" action="logout.php" class="logout-form">
          <?php echo csrf_field(); ?>
          <button type="submit" class="nav-link logout-link">
            <span>Keluar</span><i class="fas fa-arrow-right-from-bracket"></i>
          </button>
        </form>
      </li>
    </ul>
  </nav>
  <!-- /.navbar -->

  <!-- Main Sidebar Container -->
  <aside class="main-sidebar kanata-sidebar">
    <!-- Brand Logo -->
    <a href="index.php" class="brand-link">
      <span class="brand-mark"><i class="fas fa-wave-square"></i></span>
      <span class="brand-copy"><strong>KANATA</strong><small>FINANCE OS</small></span>
    </a>

    <!-- Sidebar -->
    <div class="sidebar">
      <!-- Sidebar user (optional) -->
      <div class="user-panel mt-3 pb-3 mb-3 d-flex">
        <div class="image">
          <div class="user-initials">
            <?php echo get_initials($_SESSION['username']); ?>
          </div>
        </div>
        <div class="info">
          <span class="user-kicker">SIGNED IN</span>
          <a href="#" class="d-block"><?php echo htmlspecialchars($_SESSION['username']); ?></a>
        </div>
      </div>

      <!-- Sidebar Menu -->
      <nav class="mt-2">
        <ul class="nav nav-pills nav-sidebar flex-column" data-widget="treeview" role="menu" data-accordion="false">
          <li class="nav-item">
            <a href="index.php" class="nav-link <?php echo is_active('index.php', $currentPage); ?>">
              <i class="nav-icon fas fa-tachometer-alt"></i>
              <p>Dashboard</p>
            </a>
          </li>
          <li class="nav-item">
            <a href="kakeibo.php" class="nav-link <?php echo is_active('kakeibo.php', $currentPage); ?>">
              <i class="nav-icon fas fa-book"></i>
              <p>Kakeibo</p>
            </a>
          </li>
          <li class="nav-item">
            <a href="grafik.php" class="nav-link <?php echo is_active('grafik.php', $currentPage); ?>">
              <i class="nav-icon fas fa-chart-pie"></i>
              <p>Grafik</p>
            </a>
          </li>
          <li class="nav-item">
            <a href="jadibot.php" class="nav-link <?php echo is_active('jadibot.php', $currentPage); ?>">
              <i class="nav-icon fas fa-robot"></i>
              <p>Jadi Bot</p>
            </a>
          </li>
          <li class="nav-item">
            <a href="pesan.php" class="nav-link <?php echo is_active('pesan.php', $currentPage); ?>">
              <i class="nav-icon fas fa-paper-plane"></i>
              <p>Kirim Pesan</p>
            </a>
          </li>
          <?php if (isset($_SESSION['is_owner']) && $_SESSION['is_owner']): ?>
          <li class="nav-header">OWNER CONTROL</li>
          <li class="nav-item">
            <a href="cloudflare.php" class="nav-link <?php echo is_active('cloudflare.php', $currentPage); ?>">
              <i class="nav-icon fas fa-cloud"></i>
              <p>Cloudflare</p>
            </a>
          </li>
          <li class="nav-item">
            <a href="users.php" class="nav-link <?php echo is_active('users.php', $currentPage); ?>">
              <i class="nav-icon fas fa-users"></i>
              <p>User Management</p>
            </a>
          </li>
          <li class="nav-item">
            <a href="settings.php" class="nav-link <?php echo is_active('settings.php', $currentPage); ?>">
              <i class="nav-icon fas fa-cogs"></i>
              <p>Bot Settings</p>
            </a>
          </li>
          <?php endif; ?>
        </ul>
      </nav>
      <!-- /.sidebar-menu -->
    </div>
    <!-- /.sidebar -->
  </aside>
