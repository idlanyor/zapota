<?php
// pesan.php
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/api.php';
require_login();

$msg = '';
$msgType = 'info';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $to = $_POST['to'];
    $text = $_POST['text'] ?? '';
    
    if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
        // Send Document
        $fileData = file_get_contents($_FILES['file']['tmp_name']);
        $data = [
            'to' => $to,
            'data' => base64_encode($fileData),
            'fileName' => $_FILES['file']['name'],
            'mimetype' => $_FILES['file']['type'],
            'caption' => $text
        ];
        $res = send_api_request('POST', '/api/webhook/send-document', $data);
    } else {
        // Send Text
        $data = [
            'to' => $to,
            'text' => $text
        ];
        $res = send_api_request('POST', '/api/webhook/send-text', $data);
    }

    if ($res['ok']) {
        $msg = "Pesan berhasil dikirim ke " . htmlspecialchars($to);
        $msgType = "success";
    } else {
        $msg = "Gagal kirim pesan: " . ($res['error'] ?? 'Unknown error');
        $msgType = "danger";
    }
}

include __DIR__ . '/includes/header.php';
?>

<!-- Content Wrapper. Contains page content -->
<div class="content-wrapper">
  <!-- Content Header (Page header) -->
  <section class="content-header">
    <div class="container-fluid">
      <div class="row mb-2">
        <div class="col-sm-6">
          <h1><i class="fas fa-mobile-alt mr-2"></i>Kirim Pesan WhatsApp</h1>
        </div>
      </div>
    </div>
  </section>

  <!-- Main content -->
  <section class="content">
    <div class="container-fluid">

      <?php if ($msg): ?>
        <div class="alert alert-<?php echo $msgType; ?> alert-dismissible fade show">
          <button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>
          <h5><i class="icon fas fa-<?php echo $msgType === 'success' ? 'check' : 'info'; ?>"></i> Info!</h5>
          <?php echo $msg; ?>
        </div>
      <?php endif; ?>

      <div class="row">
        <div class="col-md-8 col-12">
          <div class="card card-primary card-outline">
            <div class="card-header">
              <h3 class="card-title">Formulir Kirim Pesan</h3>
            </div>
            <!-- /.card-header -->
            <!-- form start -->
            <form method="POST" enctype="multipart/form-data">
              <?php echo csrf_field(); ?>
              <div class="card-body">
                <div class="form-group">
                  <label for="to">Nomor Tujuan / JID</label>
                  <div class="input-group">
                    <div class="input-group-prepend">
                      <span class="input-group-text"><i class="fab fa-whatsapp text-success"></i></span>
                    </div>
                    <input type="text" name="to" class="form-control" id="to" placeholder="Contoh: 628123456789" required>
                  </div>
                  <p class="help-block small">Gunakan format internasional tanpa tanda +.</p>
                </div>
                <div class="form-group">
                  <label for="text">Isi Pesan / Caption</label>
                  <textarea name="text" class="form-control" id="text" rows="5" placeholder="Ketik pesan di sini..."></textarea>
                </div>
                <div class="form-group">
                  <label for="file">Lampiran Dokumen (Opsional)</label>
                  <div class="input-group">
                    <div class="custom-file">
                      <input type="file" name="file" class="custom-file-input" id="file">
                      <label class="custom-file-label" for="file">Pilih file</label>
                    </div>
                  </div>
                </div>
              </div>
              <!-- /.card-body -->

              <div class="card-footer">
                <button type="submit" class="btn btn-primary btn-block">
                  <i class="fas fa-paper-plane mr-2"></i> Kirim Sekarang
                </button>
              </div>
            </form>
          </div>
          <!-- /.card -->
        </div>
      </div>

    </div>
  </section>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
<!-- bs-custom-file-input -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/bs-custom-file-input/1.3.4/bs-custom-file-input.min.js"></script>
<script>
$(function () {
  bsCustomFileInput.init();
});
</script>
