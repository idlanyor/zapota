<?php
// index.php
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/api.php';
require_login();

$userId = $_SESSION['whatsapp_number'];
$msg = '';
$msgType = 'info';
$openModal = null;

function post_text($key, $default = '') {
    return trim((string) ($_POST[$key] ?? $default));
}

function valid_transaction_type($value) {
    return in_array($value, ['income', 'expense'], true) ? $value : null;
}

// --- HANDLE ACTIONS ---
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if ($action === 'create_manual') {
        $type = valid_transaction_type(post_text('type'));
        $amount = filter_var($_POST['amount'] ?? null, FILTER_VALIDATE_INT);
        $description = post_text('description');
        if (!$type || $amount === false || $amount <= 0 || $description === '') {
            $msg = 'Lengkapi tipe, nominal di atas nol, dan keterangan transaksi.';
            $msgType = 'danger';
            $openModal = 'createModal';
        } else {
        $data = [
            'userId' => $userId,
            'type' => $type,
            'amount' => $amount,
            'category' => post_text('category') ?: 'General',
            'description' => $description,
            'kakeiboCategory' => post_text('kakeiboCategory') ?: null
        ];
        $res = send_api_request('POST', '/api/webhook/finance/transactions', $data);
        if ($res['ok']) {
            header("Location: index.php?msg=success_create");
            exit;
        } else {
            $msg = "Gagal: " . ($res['error'] ?? 'Unknown error');
            $msgType = "danger";
            $openModal = 'createModal';
        }
        }
    } 
    elseif ($action === 'create_ai') {
        $text = post_text('prompt');
        $fileBase64 = null;
        $mimeType = null;

        if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
            $allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/ogg', 'audio/mp4'];
            $detectedMime = (new finfo(FILEINFO_MIME_TYPE))->file($_FILES['file']['tmp_name']);
            if ($_FILES['file']['size'] > 750 * 1024 || !in_array($detectedMime, $allowedMimeTypes, true)) {
                $msg = 'Lampiran harus berupa JPG, PNG, WebP, MP3, OGG, atau M4A dengan ukuran maksimal 750 KB.';
                $msgType = 'danger';
                $openModal = 'createModal';
            } else {
                $fileData = file_get_contents($_FILES['file']['tmp_name']);
                $fileBase64 = base64_encode($fileData);
                $mimeType = $detectedMime;
            }
        }

        if (!$msg && $text === '' && !$fileBase64) {
            $msg = 'Tulis transaksi atau unggah bukti agar AI dapat memprosesnya.';
            $msgType = 'danger';
            $openModal = 'createModal';
        }

        if (!$msg) {
        $data = [
            'userId' => $userId,
            'text' => $text,
            'fileBase64' => $fileBase64,
            'mimeType' => $mimeType
        ];
        $res = send_api_request('POST', '/api/webhook/finance/catat', $data);
        if ($res['ok']) {
            header("Location: index.php?msg=success_create_ai");
            exit;
        } else {
            $msg = "Gagal AI: " . ($res['error'] ?? $res['data']['error'] ?? 'Unknown error');
            $msgType = "danger";
            $openModal = 'createModal';
        }
        }
    }
    elseif ($action === 'update') {
        $type = valid_transaction_type(post_text('type'));
        $amount = filter_var($_POST['amount'] ?? null, FILTER_VALIDATE_INT);
        $transactionId = post_text('transactionId');
        $description = post_text('description');
        $date = post_text('date');
        if (!$type || $amount === false || $amount <= 0 || $transactionId === '' || $description === '' || $date === '') {
            $msg = 'Data transaksi belum lengkap atau nominal tidak valid.';
            $msgType = 'danger';
            $openModal = 'editModal';
        } else {
        $data = [
            'userId' => $userId,
            'transactionId' => $transactionId,
            'type' => $type,
            'amount' => $amount,
            'category' => post_text('category') ?: 'General',
            'description' => $description,
            'kakeiboCategory' => post_text('kakeiboCategory') ?: null,
            'date' => $date
        ];
        $res = send_api_request('POST', '/api/webhook/finance/update', $data);
        if ($res['ok']) {
            header("Location: index.php?msg=success_update");
            exit;
        } else {
            $msg = "Gagal Update: " . ($res['error'] ?? 'Unknown error');
            $msgType = "danger";
            $openModal = 'editModal';
        }
        }
    }
    elseif ($action === 'delete') {
        $deleteId = post_text('delete_id');
        if ($deleteId === '') {
            $msg = 'ID transaksi tidak valid.';
            $msgType = 'danger';
        } else {
        $delRes = send_api_request('DELETE', '/api/webhook/finance/delete', [
            'userId' => $userId,
            'transactionId' => $deleteId
        ]);
        if ($delRes['ok']) {
            header("Location: index.php?msg=success_delete");
            exit;
        } else {
            $msg = "Gagal hapus: " . ($delRes['error'] ?? 'Unknown error');
            $msgType = "danger";
        }
        }
    }
}

// --- NOTIFICATIONS ---
if (isset($_GET['msg'])) {
    $m = $_GET['msg'];
    if ($m === 'success_create') $msg = "Transaksi berhasil ditambahkan.";
    if ($m === 'success_create_ai') $msg = "AI berhasil memproses transaksi.";
    if ($m === 'success_update') $msg = "Transaksi berhasil diperbarui.";
    if ($m === 'success_delete') $msg = "Transaksi berhasil dihapus.";
    $msgType = "success";
}

// --- FETCH DATA ---
$filterType = $_GET['type'] ?? '';
$filterCategory = $_GET['category'] ?? '';
$startDate = $_GET['startDate'] ?? '';
$endDate = $_GET['endDate'] ?? '';

$reportData = send_api_request('GET', '/api/webhook/finance/report', [
    'userId' => $userId,
    'type' => $filterType,
    'category' => $filterCategory,
    'startDate' => $startDate,
    'endDate' => $endDate
]);
$report = $reportData['data'] ?? null;
$apiError = (isset($reportData['ok']) && !$reportData['ok']) ? ($reportData['error'] ?? 'Unknown error') : null;

include __DIR__ . '/includes/header.php';
?>

<!-- Content Wrapper. Contains page content -->
<div class="content-wrapper">
  <!-- Content Header (Page header) -->
  <section class="content-header">
    <div class="container-fluid">
      <div class="row mb-2">
        <div class="col-sm-6">
          <span class="section-kicker">RINGKASAN / HARI INI</span>
          <h1>Dashboard Keuangan</h1>
          <p class="page-lead">Pantau arus uang dan catat transaksi tanpa kehilangan konteks.</p>
        </div>
        <div class="col-sm-6">
          <ol class="breadcrumb float-sm-right">
            <li class="breadcrumb-item"><a href="#">Home</a></li>
            <li class="breadcrumb-item active">Dashboard</li>
          </ol>
        </div>
      </div>
    </div><!-- /.container-fluid -->
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

      <?php if ($apiError): ?>
        <div class="alert alert-danger">
          <h5><i class="icon fas fa-ban"></i> Error!</h5>
          <?php echo $apiError; ?>
        </div>
      <?php endif; ?>

      <!-- Small boxes (Stat box) -->
      <?php if ($report): ?>
        <div class="row">
          <div class="col-lg-4 col-12">
            <!-- small box -->
            <div class="small-box bg-info">
              <div class="inner">
                <h3>Rp <?php echo number_format($report['balance'], 0, ',', '.'); ?></h3>
                <p>Sisa Saldo</p>
              </div>
              <div class="icon">
                <i class="fas fa-wallet"></i>
              </div>
              <a href="grafik.php" class="small-box-footer">Lihat analisis <i class="fas fa-arrow-circle-right"></i></a>
            </div>
          </div>
          <div class="col-lg-4 col-6">
            <!-- small box -->
            <div class="small-box bg-success">
              <div class="inner">
                <h3>Rp <?php echo number_format($report['totalIncome'], 0, ',', '.'); ?></h3>
                <p>Pemasukan</p>
              </div>
              <div class="icon">
                <i class="fas fa-arrow-trend-up"></i>
              </div>
              <a href="?type=income" class="small-box-footer">Lihat pemasukan <i class="fas fa-arrow-circle-right"></i></a>
            </div>
          </div>
          <div class="col-lg-4 col-6">
            <!-- small box -->
            <div class="small-box bg-danger">
              <div class="inner">
                <h3>Rp <?php echo number_format($report['totalExpense'], 0, ',', '.'); ?></h3>
                <p>Pengeluaran</p>
              </div>
              <div class="icon">
                <i class="fas fa-arrow-trend-down"></i>
              </div>
              <a href="?type=expense" class="small-box-footer">Lihat pengeluaran <i class="fas fa-arrow-circle-right"></i></a>
            </div>
          </div>
        </div>
      <?php endif; ?>

      <div class="row mb-3">
        <div class="col-12">
          <button class="btn btn-primary" data-toggle="modal" data-target="#createModal">
            <i class="fas fa-plus-circle mr-1"></i> Tambah Transaksi
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="card card-default">
        <div class="card-header">
          <h3 class="card-title"><i class="fas fa-filter mr-1"></i> Filter Laporan
            <?php $activeFilterCount = count(array_filter([$startDate, $endDate, $filterType, $filterCategory])); ?>
            <?php if ($activeFilterCount > 0): ?>
              <span class="filter-count"><?php echo $activeFilterCount; ?> aktif</span>
            <?php endif; ?>
          </h3>
          <div class="card-tools">
            <button type="button" class="btn btn-tool" data-card-widget="collapse"><i class="fas fa-minus"></i></button>
          </div>
        </div>
        <div class="card-body">
          <form method="GET" class="row">
            <div class="col-md-3 mb-2">
              <label class="small font-weight-bold">Dari Tanggal</label>
              <input type="date" name="startDate" class="form-control form-control-sm" value="<?php echo htmlspecialchars($startDate, ENT_QUOTES, 'UTF-8'); ?>">
            </div>
            <div class="col-md-3 mb-2">
              <label class="small font-weight-bold">Sampai Tanggal</label>
              <input type="date" name="endDate" class="form-control form-control-sm" value="<?php echo htmlspecialchars($endDate, ENT_QUOTES, 'UTF-8'); ?>">
            </div>
            <div class="col-md-2 mb-2">
              <label class="small font-weight-bold">Tipe</label>
              <select name="type" class="form-control form-control-sm">
                <option value="">Semua</option>
                <option value="income" <?php echo $filterType === 'income' ? 'selected' : ''; ?>>Pemasukan</option>
                <option value="expense" <?php echo $filterType === 'expense' ? 'selected' : ''; ?>>Pengeluaran</option>
              </select>
            </div>
            <div class="col-md-2 mb-2">
              <label class="small font-weight-bold">Kategori</label>
              <input type="text" name="category" class="form-control form-control-sm" placeholder="Cari..." value="<?php echo htmlspecialchars($filterCategory, ENT_QUOTES, 'UTF-8'); ?>">
            </div>
            <div class="col-md-2 mb-2 d-flex align-items-end gap-1">
              <button type="submit" class="btn btn-primary btn-sm btn-block">Filter</button>
              <a href="index.php" class="btn btn-default btn-sm ml-1" aria-label="Hapus semua filter" title="Hapus semua filter"><i class="fas fa-rotate-left"></i></a>
            </div>
          </form>
        </div>
      </div>

      <!-- Transaction List -->
      <div class="card">
        <div class="card-header border-0">
          <h3 class="card-title">Riwayat Transaksi</h3>
        </div>
        <div class="card-body p-0 table-responsive">
          <table class="table table-striped table-valign-middle">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Tipe</th>
                <th>Kategori</th>
                <th>Keterangan</th>
                <th>Nominal</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              <?php if ($report && isset($report['transactions'])): ?>
                <?php foreach ($report['transactions'] as $tx): ?>
                  <tr>
                    <td><?php echo date('d/m/y H:i', strtotime($tx['date'])); ?></td>
                    <td>
                      <span class="badge <?php echo $tx['type'] === 'income' ? 'badge-success' : 'badge-danger'; ?>">
                        <?php echo strtoupper($tx['type']); ?>
                      </span>
                    </td>
                    <td><?php echo htmlspecialchars($tx['category']); ?></td>
                    <td><?php echo htmlspecialchars($tx['description']); ?></td>
                    <td class="font-weight-bold">Rp <?php echo number_format($tx['amount'], 0, ',', '.'); ?></td>
                    <td>
                      <button class="btn btn-info btn-sm" 
                          data-toggle="modal" 
                          data-target="#editModal"
                          data-id="<?php echo $tx['_id']; ?>"
                          data-type="<?php echo $tx['type']; ?>"
                          data-amount="<?php echo $tx['amount']; ?>"
                          data-category="<?php echo htmlspecialchars($tx['category']); ?>"
                          data-description="<?php echo htmlspecialchars($tx['description']); ?>"
                          data-kakeibo="<?php echo $tx['kakeiboCategory'] ?? ''; ?>"
                          data-date="<?php echo date('Y-m-d\TH:i', strtotime($tx['date'])); ?>">
                          <i class="fas fa-edit"></i>
                      </button>
                      <button type="button" class="btn btn-danger btn-sm delete-transaction"
                        data-toggle="modal" data-target="#deleteModal"
                        data-id="<?php echo htmlspecialchars($tx['_id']); ?>"
                        data-description="<?php echo htmlspecialchars($tx['description']); ?>"
                        data-amount="<?php echo number_format($tx['amount'], 0, ',', '.'); ?>">
                        <i class="fas fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                <?php endforeach; ?>
                <?php if (empty($report['transactions'])): ?>
                  <tr><td colspan="6">
                    <div class="empty-state">
                      <span class="empty-icon"><i class="fas fa-receipt"></i></span>
                      <strong><?php echo $activeFilterCount > 0 ? 'Tidak ada transaksi yang cocok' : 'Belum ada transaksi'; ?></strong>
                      <p><?php echo $activeFilterCount > 0 ? 'Ubah atau hapus filter untuk melihat data lainnya.' : 'Catat pemasukan atau pengeluaran pertamamu.'; ?></p>
                      <?php if ($activeFilterCount > 0): ?>
                        <a href="index.php" class="btn btn-default btn-sm">Hapus filter</a>
                      <?php else: ?>
                        <button class="btn btn-primary btn-sm" data-toggle="modal" data-target="#createModal">Tambah transaksi</button>
                      <?php endif; ?>
                    </div>
                  </td></tr>
                <?php endif; ?>
              <?php endif; ?>
            </tbody>
          </table>
        </div>
      </div>

    </div><!-- /.container-fluid -->
  </section>
  <!-- /.content -->
</div>
<!-- /.content-wrapper -->

<!-- MODAL CREATE -->
<div class="modal fade" id="createModal">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h4 class="modal-title">Tambah Transaksi</h4>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
            <div class="modal-body">
                <ul class="nav nav-pills mb-3" id="pills-tab" role="tablist">
                    <li class="nav-item">
                        <a class="nav-link active" id="pills-manual-tab" data-toggle="pill" href="#manual-form" role="tab">Manual</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" id="pills-ai-tab" data-toggle="pill" href="#ai-form" role="tab">AI Gemini</a>
                    </li>
                </ul>
                <div class="tab-content" id="pills-tabContent">
                    <div class="tab-pane fade show active" id="manual-form" role="tabpanel">
                        <form method="POST" class="transaction-form">
                            <?php echo csrf_field(); ?>
                            <input type="hidden" name="action" value="create_manual">
                            <div class="form-group">
                                <label>Tipe</label>
                                <select name="type" class="form-control" required>
                                    <option value="expense">Pengeluaran</option>
                                    <option value="income">Pemasukan</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Nominal (Rp)</label>
                                <input type="number" name="amount" class="form-control" placeholder="10000" min="1" step="1" inputmode="numeric" required>
                            </div>
                            <div class="form-group">
                                <label>Kategori</label>
                                <input type="text" name="category" class="form-control" placeholder="Makanan, Transportasi..." maxlength="60">
                            </div>
                            <div class="form-group">
                                <label>Keterangan</label>
                                <input type="text" name="description" class="form-control" placeholder="Beli apa?" maxlength="160" required>
                            </div>
                            <div class="form-group">
                                <label>Kategori Kakeibo (Opsional)</label>
                                <select name="kakeiboCategory" class="form-control">
                                    <option value="">-- Pilih Pilar Kakeibo --</option>
                                    <option value="needs">Survival (Pokok)</option>
                                    <option value="wants">Optional (Keinginan)</option>
                                    <option value="culture">Culture (Wawasan)</option>
                                    <option value="extras">Extras (Lain-lain)</option>
                                </select>
                            </div>
                            <button type="submit" class="btn btn-primary btn-block">Simpan Transaksi</button>
                        </form>
                    </div>
                    <div class="tab-pane fade" id="ai-form" role="tabpanel">
                        <form method="POST" enctype="multipart/form-data" class="transaction-form">
                            <?php echo csrf_field(); ?>
                            <input type="hidden" name="action" value="create_ai">
                            <div class="form-group">
                                <label>Teks / Suara</label>
                                <textarea name="prompt" class="form-control" rows="3" maxlength="500" placeholder="Contoh: tadi beli bakso 15rb"></textarea>
                                <small class="form-text text-muted">Tulis transaksi, unggah bukti, atau gunakan keduanya.</small>
                            </div>
                            <div class="form-group">
                                <label>Lampiran (Struk/Screenshot/VN)</label>
                                <input type="file" name="file" class="form-control-file" accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/ogg,audio/mp4">
                                <small class="form-text text-muted">JPG, PNG, WebP, MP3, OGG, atau M4A. Maksimal 750 KB.</small>
                            </div>
                            <button type="submit" class="btn btn-info btn-block text-white">Proses dengan AI</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- MODAL EDIT -->
<div class="modal fade" id="editModal">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h4 class="modal-title">Edit Transaksi</h4>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
            <form method="POST" class="transaction-form">
                <?php echo csrf_field(); ?>
                <div class="modal-body">
                    <input type="hidden" name="action" value="update">
                    <input type="hidden" name="transactionId" id="edit-id">
                    <div class="form-group">
                        <label>Tipe</label>
                        <select name="type" id="edit-type" class="form-control" required>
                            <option value="expense">Pengeluaran</option>
                            <option value="income">Pemasukan</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Nominal (Rp)</label>
                        <input type="number" name="amount" id="edit-amount" class="form-control" min="1" step="1" inputmode="numeric" required>
                    </div>
                    <div class="form-group">
                        <label>Kategori</label>
                        <input type="text" name="category" id="edit-category" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Keterangan</label>
                        <input type="text" name="description" id="edit-description" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>Kategori Kakeibo</label>
                        <select name="kakeiboCategory" id="edit-kakeibo" class="form-control">
                            <option value="">-- Otomatis --</option>
                            <option value="needs">Survival (Pokok)</option>
                            <option value="wants">Optional (Keinginan)</option>
                            <option value="culture">Culture (Wawasan)</option>
                            <option value="extras">Extras (Lain-lain)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Tanggal</label>
                        <input type="datetime-local" name="date" id="edit-date" class="form-control" required>
                    </div>
                </div>
                <div class="modal-footer justify-content-between">
                    <button type="button" class="btn btn-default" data-dismiss="modal">Batal</button>
                    <button type="submit" class="btn btn-primary">Update Transaksi</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- MODAL DELETE -->
<div class="modal fade" id="deleteModal" tabindex="-1" aria-labelledby="deleteModalTitle" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content">
            <div class="modal-body delete-dialog">
                <span class="delete-icon"><i class="fas fa-trash-can"></i></span>
                <span class="section-kicker">TINDAKAN PERMANEN</span>
                <h4 id="deleteModalTitle">Hapus transaksi?</h4>
                <p><strong id="delete-description"></strong><br><span id="delete-amount"></span></p>
                <p class="text-muted small">Transaksi yang dihapus tidak dapat dipulihkan.</p>
                <form method="POST" class="transaction-form">
                    <?php echo csrf_field(); ?>
                    <input type="hidden" name="action" value="delete">
                    <input type="hidden" name="delete_id" id="delete-id">
                    <div class="d-flex mt-4">
                        <button type="button" class="btn btn-default flex-fill mr-2" data-dismiss="modal">Batal</button>
                        <button type="submit" class="btn btn-danger flex-fill">Hapus</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
<script>
    // --- FILTER PERSISTENCE (LocalStorage) ---
    const filterFields = ['startDate', 'endDate', 'type', 'category'];
    const urlParams = new URLSearchParams(window.location.search);
    
    // Save filters if they are present in the URL
    let hasFilterInUrl = false;
    const currentFilters = {};
    filterFields.forEach(field => {
        if (urlParams.has(field) && urlParams.get(field) !== '') {
            currentFilters[field] = urlParams.get(field);
            hasFilterInUrl = true;
        }
    });

    if (hasFilterInUrl) {
        localStorage.setItem('kanata_filters', JSON.stringify(currentFilters));
    } else if (window.location.search === '' || (urlParams.has('msg') && Array.from(urlParams.keys()).length === 1)) {
        // If bare index.php OR just a success message, try to restore filters
        const savedFilters = localStorage.getItem('kanata_filters');
        if (savedFilters) {
            const filters = JSON.parse(savedFilters);
            const newParams = new URLSearchParams(filters);
            // Preserve msg if it exists
            if (urlParams.has('msg')) newParams.set('msg', urlParams.get('msg'));
            window.location.href = 'index.php?' + newParams.toString();
        }
    }

    function resetFilters() {
        localStorage.removeItem('kanata_filters');
        window.location.href = 'index.php';
    }

    // Populate Edit Modal
    $('#editModal').on('show.bs.modal', function (event) {
        var button = $(event.relatedTarget);
        $('#edit-id').val(button.data('id'));
        $('#edit-type').val(button.data('type'));
        $('#edit-amount').val(button.data('amount'));
        $('#edit-category').val(button.data('category'));
        $('#edit-description').val(button.data('description'));
        $('#edit-kakeibo').val(button.data('kakeibo'));
        $('#edit-date').val(button.data('date'));
    });

    $('#deleteModal').on('show.bs.modal', function (event) {
        const button = $(event.relatedTarget);
        $('#delete-id').val(button.data('id'));
        $('#delete-description').text(button.data('description') || 'Tanpa keterangan');
        $('#delete-amount').text('Rp ' + button.data('amount'));
    });

    $('.transaction-form').on('submit', function () {
        const button = this.querySelector('button[type="submit"]');
        if (!button || !this.checkValidity()) return;
        button.disabled = true;
        button.dataset.originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i>Memproses';
    });

    <?php if ($openModal): ?>
    $('#<?php echo $openModal; ?>').modal('show');
    <?php endif; ?>
</script>
