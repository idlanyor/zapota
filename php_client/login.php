<?php
// login.php
require_once __DIR__ . '/includes/auth.php';

if (check_auth()) {
    header("Location: index.php");
    exit;
}

$error = '';
if (isset($_GET['expired'])) {
    $error = "Sesi berakhir setelah 30 menit tidak aktif. Silakan masuk kembali.";
}
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf_or_abort();
    $username = $_POST['username'] ?? '';
    $password = $_POST['password'] ?? '';

    $rateStatus = login_rate_status($username);
    if (!$rateStatus['allowed']) {
        http_response_code(429);
        $minutes = max(1, (int) ceil($rateStatus['retry_after'] / 60));
        $error = "Terlalu banyak percobaan. Coba lagi dalam {$minutes} menit.";
    } else {
      $loginResult = login($username, $password);
      if ($loginResult['ok']) {
        clear_login_failures($username);
        header("Location: index.php");
        exit;
      } elseif (($loginResult['http_code'] ?? 0) >= 500) {
        $error = "Layanan login sedang bermasalah. Silakan coba kembali beberapa saat lagi.";
      } else {
        record_login_failure($username);
        $error = "Nomor WA atau password salah! Pastikan kamu sudah mengatur password melalui bot dengan perintah <code>.integrate</code>";
      }
    }
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kanata Bot | Log in</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=Manrope:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
  <!-- Font Awesome -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <!-- Theme style -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/admin-lte@3.2/dist/css/adminlte.min.css">
  <link rel="stylesheet" href="assets/css/kanata.css?v=1.0.3">
</head>
<body class="hold-transition login-page kanata-login-page">
<main class="login-shell">
  <section class="login-story" aria-label="Kanata Finance OS">
    <div class="story-topline"><span class="pulse-dot"></span> PERSONAL FINANCE / WHATSAPP NATIVE</div>
    <div class="story-copy">
      <div class="brand-lockup"><span class="brand-mark"><i class="fas fa-wave-square"></i></span><span>KANATA</span></div>
      <h1>Uangmu punya<br><em>ritme.</em></h1>
      <p>Catat dari WhatsApp. Baca polanya di sini. Satu ruang tenang untuk keputusan finansial yang lebih jernih.</p>
    </div>
    <div class="ledger-pulse" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
  </section>

  <section class="login-panel">
    <div class="login-box">
      <div class="login-heading">
        <span class="login-index">ACCESS / 01</span>
        <h2>Selamat datang kembali.</h2>
        <p>Masuk dengan identitas WhatsApp yang terhubung.</p>
      </div>
      <div class="card login-card">
        <div class="card-body login-card-body">

      <?php if ($error): ?>
          <div class="alert alert-danger small"><?php echo $error; ?></div>
      <?php endif; ?>

      <form method="post" class="login-form">
        <?php echo csrf_field(); ?>
        <label for="username">Nomor WhatsApp atau LID</label>
        <div class="input-group mb-4">
          <input id="username" type="text" name="username" class="form-control" placeholder="628••••••••••" autocomplete="username" inputmode="numeric" required autofocus>
          <div class="input-group-append">
            <div class="input-group-text">
              <span class="fab fa-whatsapp"></span>
            </div>
          </div>
        </div>
        <label for="password">Password integrasi</label>
        <div class="input-group mb-4">
          <input id="password" type="password" name="password" class="form-control" placeholder="Masukkan password" autocomplete="current-password" required>
          <div class="input-group-append">
            <div class="input-group-text">
              <span class="fas fa-lock"></span>
            </div>
          </div>
        </div>
        <div class="row">
          <div class="col-12">
            <button type="submit" class="btn btn-primary btn-block login-submit">Masuk <i class="fas fa-arrow-right"></i></button>
          </div>
          <!-- /.col -->
        </div>
      </form>

      <div class="login-help">
          <span><i class="fab fa-whatsapp"></i></span>
          <div><strong>Belum terhubung?</strong><br>Kirim <code>.integrate password_kamu</code> ke bot.</div>
      </div>
        </div>
      </div>
      <p class="login-meta">SECURE SESSION <span>•</span> KANATA FINANCE OS</p>
    </div>
  </section>
</main>

<!-- jQuery -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>
<!-- Bootstrap 4 -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/4.6.1/js/bootstrap.bundle.min.js"></script>
<!-- AdminLTE App -->
<script src="https://cdn.jsdelivr.net/npm/admin-lte@3.2/dist/js/adminlte.min.js"></script>
</body>
</html>
