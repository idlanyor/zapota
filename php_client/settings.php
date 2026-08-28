<?php
// settings.php
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/api.php';
require_login();

// Pastikan hanya owner yang bisa akses
if (!isset($_SESSION['is_owner']) || !$_SESSION['is_owner']) {
    header("Location: index.php");
    exit;
}

$userId = $_SESSION['user_id'];
$msg = '';
$msgType = 'info';

// --- HANDLE ACTIONS ---
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if ($action === 'update_settings') {
        $data = [
            'userId' => $userId,
            'mode' => $_POST['mode'],
            'autoStatusRead' => isset($_POST['autoStatusRead']),
            'autoAiPrivate' => isset($_POST['autoAiPrivate']),
            'mustJoinGroup' => isset($_POST['mustJoinGroup']),
            'groupInviteLink' => $_POST['groupInviteLink'],
            'privateAiPersona' => $_POST['privateAiPersona']
        ];
        $res = send_api_request('POST', '/api/webhook/settings/update', $data);
        if ($res['ok']) {
            $msg = "Konfigurasi bot berhasil diperbarui.";
            $msgType = "success";
        } else {
            $msg = "Gagal update konfigurasi: " . ($res['error'] ?? 'Unknown error');
            $msgType = "danger";
        }
    }
}

// --- FETCH DATA ---
$settingsData = send_api_request('GET', '/api/webhook/settings', ['userId' => $userId]);
$s = $settingsData['data'] ?? [];

include __DIR__ . '/includes/header.php';
?>

<div class="content-wrapper">
  <section class="content-header">
    <div class="container-fluid">
      <div class="row mb-2">
        <div class="col-sm-6">
          <h1>Bot Settings</h1>
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
        <div class="col-md-8">
          <div class="card card-primary">
            <div class="card-header">
              <h3 class="card-title">Konfigurasi Global</h3>
            </div>
            <form method="POST">
              <?php echo csrf_field(); ?>
              <input type="hidden" name="action" value="update_settings">
              <div class="card-body">
                
                <div class="form-group">
                  <label>Mode Bot</label>
                  <select name="mode" class="form-control">
                    <option value="public" <?php echo ($s['mode'] ?? '') === 'public' ? 'selected' : ''; ?>>PUBLIC (Respons Semua)</option>
                    <option value="self" <?php echo ($s['mode'] ?? '') === 'self' ? 'selected' : ''; ?>>SELF (Respons Owner Saja)</option>
                    <option value="group" <?php echo ($s['mode'] ?? '') === 'group' ? 'selected' : ''; ?>>GROUP ONLY</option>
                  </select>
                  <small class="text-muted">Tentukan siapa yang bisa menggunakan bot.</small>
                </div>

                <hr>

                <div class="form-group">
                  <div class="custom-control custom-switch">
                    <input type="checkbox" name="autoStatusRead" class="custom-control-input" id="autoStatusRead" <?php echo ($s['autoStatusRead'] ?? false) ? 'checked' : ''; ?>>
                    <label class="custom-control-label" for="autoStatusRead">Auto Read Status (Story)</label>
                  </div>
                </div>

                <div class="form-group">
                  <div class="custom-control custom-switch">
                    <input type="checkbox" name="autoAiPrivate" class="custom-control-input" id="autoAiPrivate" <?php echo ($s['autoAiPrivate'] ?? false) ? 'checked' : ''; ?>>
                    <label class="custom-control-label" for="autoAiPrivate">Auto AI Chat (Private)</label>
                  </div>
                </div>

                <hr>

                <div class="form-group">
                  <div class="custom-control custom-switch">
                    <input type="checkbox" name="mustJoinGroup" class="custom-control-input" id="mustJoinGroup" <?php echo ($s['mustJoinGroup'] ?? false) ? 'checked' : ''; ?>>
                    <label class="custom-control-label" for="mustJoinGroup">Wajib Gabung Grup (Must Join)</label>
                  </div>
                </div>

                <div class="form-group">
                  <label>Link Invite Grup</label>
                  <input type="text" name="groupInviteLink" class="form-control" placeholder="https://chat.whatsapp.com/..." value="<?php echo htmlspecialchars($s['groupInviteLink'] ?? ''); ?>">
                </div>

                <hr>

                <div class="form-group">
                  <label>AI Persona (Private Chat)</label>
                  <textarea name="privateAiPersona" class="form-control" rows="4" placeholder="Contoh: Kamu adalah asisten yang ramah..."><?php echo htmlspecialchars($s['privateAiPersona'] ?? ''); ?></textarea>
                  <small class="text-muted">Instruksi sistem untuk AI saat merespon chat pribadi.</small>
                </div>

              </div>
              <div class="card-footer">
                <button type="submit" class="btn btn-primary float-right">Simpan Perubahan</button>
              </div>
            </form>
          </div>
        </div>

        <div class="col-md-4">
          <div class="card card-info">
            <div class="card-header">
              <h3 class="card-title">Info Bot</h3>
            </div>
            <div class="card-body">
              <strong><i class="fas fa-robot mr-1"></i> Status</strong>
              <p class="text-muted">Bot sedang berjalan di PM2.</p>
              <hr>
              <strong><i class="fas fa-link mr-1"></i> Webhook API</strong>
              <p class="text-muted">Connected to :8787</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
