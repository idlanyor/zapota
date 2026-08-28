<?php
// jadibot.php
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/api.php';
require_login();

$msg = '';
$msgType = 'info';

// Handle Start Session
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'start') {
    $phone = preg_replace('/\D/', '', $_POST['phone']);
    if ($phone) {
        $res = send_api_request('POST', '/api/webhook/jadibot/start', ['phoneNumber' => $phone]);
        if ($res['ok']) {
            $msg = "Sesi diinisialisasi untuk $phone. Silakan scan QR yang muncul.";
            $msgType = "success";
        } else {
            $msg = "Error: " . ($res['error'] ?? 'Gagal memulai sesi');
            $msgType = "danger";
        }
    }
}

// Handle Stop Session
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'stop') {
    $phone = $_POST['phone'];
    $res = send_api_request('POST', '/api/webhook/jadibot/stop', ['phoneNumber' => $phone]);
    if ($res['ok']) {
        $msg = "Sesi dihentikan dan dihapus untuk $phone.";
        $msgType = "success";
    } else {
        $msg = "Error: " . ($res['error'] ?? 'Gagal menghentikan sesi');
        $msgType = "danger";
    }
}

// Fetch sessions (untuk AJAX Polling)
if (isset($_GET['action']) && $_GET['action'] === 'get_sessions') {
    $sessionsRes = send_api_request('GET', '/api/webhook/jadibot/sessions');
    header('Content-Type: application/json');
    echo json_encode($sessionsRes['data'] ?? []);
    exit;
}

// Fetch sessions
$sessionsRes = send_api_request('GET', '/api/webhook/jadibot/sessions');
$sessions = $sessionsRes['data'] ?? [];

include __DIR__ . '/includes/header.php';
?>

<div class="content-wrapper">
  <section class="content-header">
    <div class="container-fluid">
      <div class="row mb-2">
        <div class="col-sm-6">
          <h1><i class="fas fa-robot mr-2"></i>Jadibot Manager</h1>
        </div>
      </div>
    </div>
  </section>

  <section class="content">
    <div class="container-fluid">

      <?php if ($msg): ?>
        <div class="alert alert-<?php echo $msgType; ?> alert-dismissible fade show">
          <button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>
          <?php echo $msg; ?>
        </div>
      <?php endif; ?>

      <div class="row">
        <!-- Start New Session Card -->
        <div class="col-md-4">
          <div class="card card-primary">
            <div class="card-header">
              <h3 class="card-title">Tambah Bot Baru</h3>
            </div>
            <form method="POST">
              <?php echo csrf_field(); ?>
              <input type="hidden" name="action" value="start">
              <div class="card-body">
                <div class="form-group">
                  <label for="phone">Nomor WhatsApp</label>
                  <input type="text" name="phone" class="form-control" id="phone" placeholder="Contoh: 628123456789" required>
                  <p class="help-block small text-muted">Gunakan format internasional tanpa +. Bot akan memunculkan QR Code untuk di-scan.</p>
                </div>
              </div>
              <div class="card-footer">
                <button type="submit" class="btn btn-primary btn-block">Hubungkan Bot</button>
              </div>
            </form>
          </div>
        </div>

        <!-- Active Sessions List -->
        <div class="col-md-8">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Daftar Sub-Bot Aktif</h3>
              <div class="card-tools">
                 <button type="button" class="btn btn-tool" onclick="pollBotSessions()"><i class="fas fa-sync-alt"></i></button>
              </div>
            </div>
            <div class="card-body p-0">
              <table class="table table-striped align-middle">
                <thead>
                  <tr>
                    <th>Nomor HP</th>
                    <th>Status</th>
                    <th>QR Scan</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  <?php foreach ($sessions as $s): ?>
                    <tr>
                      <td><strong><?php echo $s['phoneNumber']; ?></strong></td>
                      <td>
                        <?php if ($s['status'] === 'open'): ?>
                          <span class="badge badge-success">Online</span>
                        <?php elseif ($s['status'] === 'connecting'): ?>
                          <span class="badge badge-warning">Connecting</span>
                        <?php else: ?>
                          <span class="badge badge-secondary"><?php echo ucfirst($s['status']); ?></span>
                        <?php endif; ?>
                      </td>
                      <td style="min-width: 160px;">
                        <?php if (isset($s['qr']) && $s['qr']): ?>
                          <div class="qr-container d-flex flex-column align-items-center" data-qr="<?php echo $s['qr']; ?>"></div>
                          <small class="text-muted d-block text-center mt-1">Scan QR ini</small>
                        <?php elseif (isset($s['pairingCode']) && $s['pairingCode']): ?>
                          <code class="h5 bg-dark p-1 rounded px-2" style="letter-spacing: 2px;"><?php echo $s['pairingCode']; ?></code>
                        <?php elseif ($s['status'] === 'open'): ?>
                          <span class="text-muted text-center d-block"><i class="fas fa-check-circle text-success mr-1"></i> Terhubung</span>
                        <?php else: ?>
                          <span class="text-muted small text-center d-block">Sedang memuat...</span>
                        <?php endif; ?>
                      </td>
                      <td>
                        <form method="POST" onsubmit="return confirm('Hentikan bot?')">
                          <?php echo csrf_field(); ?>
                          <input type="hidden" name="action" value="stop">
                          <input type="hidden" name="phone" value="<?php echo $s['phoneNumber']; ?>">
                          <button type="submit" class="btn btn-outline-danger btn-sm">Hapus</button>
                        </form>
                      </td>
                    </tr>
                  <?php endforeach; ?>
                  <?php if (empty($sessions)): ?>
                    <tr>
                      <td colspan="4" class="text-center py-4 text-muted">Belum ada sub-bot yang terhubung.</td>
                    </tr>
                  <?php endif; ?>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

    </div>
  </section>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>

<!-- QR Code Library -->
<script src="https://cdn.jsdelivr.net/npm/kjua@0.9.0/dist/kjua.min.js"></script>
<script>
    function renderQr(container, text) {
        if (!container || !text) return;
        container.innerHTML = '';
        const qr = kjua({
            render: 'image',
            size: 140,
            text: text,
            fill: '#333',
            back: '#fff',
            rounded: 10
        });
        container.appendChild(qr);
    }

    async function pollBotSessions() {
        try {
            const response = await fetch('jadibot.php?action=get_sessions');
            if (!response.ok) return;
            const sessions = await response.json();
            updateBotTable(sessions);
        } catch (error) {
            console.error("Polling Error:", error);
        }
    }

    function updateBotTable(sessions) {
        const tbody = document.querySelector('table tbody');
        if (sessions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">Belum ada sub-bot yang terhubung.</td></tr>';
            return;
        }

        let html = '';
        sessions.forEach(s => {
            let statusBadge = '';
            if (s.status === 'open') statusBadge = '<span class="badge badge-success">Online</span>';
            else if (s.status === 'connecting') statusBadge = '<span class="badge badge-warning">Connecting</span>';
            else statusBadge = `<span class="badge badge-secondary">${s.status.charAt(0).toUpperCase() + s.status.slice(1)}</span>`;

            let pairingInfo = '';
            if (s.qr) {
                pairingInfo = `<div class="qr-container d-flex flex-column align-items-center" data-qr="${s.qr}"></div><small class="text-muted d-block text-center mt-1">Scan QR ini</small>`;
            } else if (s.pairingCode) {
                pairingInfo = `<code class="h5 bg-dark p-1 rounded px-2" style="letter-spacing: 2px;">${s.pairingCode}</code>`;
            } else if (s.status === 'open') {
                pairingInfo = '<span class="text-muted text-center d-block"><i class="fas fa-check-circle text-success mr-1"></i> Terhubung</span>';
            } else {
                pairingInfo = '<span class="text-muted small text-center d-block">Memuat...</span>';
            }

            html += `
                <tr>
                    <td><strong>${s.phoneNumber}</strong></td>
                    <td>${statusBadge}</td>
                    <td>${pairingInfo}</td>
                    <td>
                        <form method="POST" onsubmit="return confirm('Hentikan bot?')">
                          <?php echo csrf_field(); ?>
                            <input type="hidden" name="action" value="stop">
                            <input type="hidden" name="phone" value="${s.phoneNumber}">
                            <button type="submit" class="btn btn-outline-danger btn-sm">Hapus</button>
                        </form>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
        
        document.querySelectorAll('.qr-container').forEach(el => {
            renderQr(el, el.getAttribute('data-qr'));
        });
    }

    // Initial render
    document.querySelectorAll('.qr-container').forEach(el => {
        renderQr(el, el.getAttribute('data-qr'));
    });

    setInterval(pollBotSessions, 3000);
</script>
