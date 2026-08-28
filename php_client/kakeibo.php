<?php
// kakeibo.php
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/api.php';
require_login();

$userId = $_SESSION['whatsapp_number'];
$month = $_GET['month'] ?? date('m');
$year = $_GET['year'] ?? date('Y');
$errorMessage = '';

// Handle Budget Update
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'set_budget') {
    $resBudget = send_api_request('POST', '/api/webhook/finance/budget', [
        'userId' => $userId,
        'month' => (int)$month,
        'year' => (int)$year,
        'incomeTarget' => (int)$_POST['incomeTarget'],
        'savingsTarget' => (int)$_POST['savingsTarget']
    ]);
    if ($resBudget['ok']) {
        header("Location: kakeibo.php?month=$month&year=$year&msg=updated");
        exit;
    }
    $errorMessage = $resBudget['error'] ?? 'Budget gagal diperbarui.';
}

// Fetch Kakeibo Data
$res = send_api_request('GET', '/api/webhook/finance/kakeibo', [
    'userId' => $userId,
    'month' => $month,
    'year' => $year
]);

$data = $res['data'] ?? null;
$kakeibo = $data['kakeibo'] ?? ['needs'=>0, 'wants'=>0, 'culture'=>0, 'extras'=>0];
$budget = $data['budget'] ?? ['incomeTarget'=>0, 'savingsTarget'=>0];

$totalExpense = $data['totalExpense'] ?? 0;
$spendingLimit = $budget['incomeTarget'] - $budget['savingsTarget'];
$remainingBudget = $spendingLimit - $totalExpense;

include __DIR__ . '/includes/header.php';
?>

<!-- Content Wrapper. Contains page content -->
<div class="content-wrapper">
  <!-- Content Header (Page header) -->
  <section class="content-header">
    <div class="container-fluid">
      <div class="row mb-2">
        <div class="col-sm-6">
          <h1><i class="fas fa-book mr-2"></i>Metode Kakeibo</h1>
        </div>
        <div class="col-sm-6 text-right">
          <button class="btn btn-primary" data-toggle="modal" data-target="#budgetModal">
            <i class="fas fa-sliders-h mr-1"></i> Atur Budget
          </button>
        </div>
      </div>
    </div>
  </section>

  <!-- Main content -->
  <section class="content">
    <div class="container-fluid">
      <?php if ($errorMessage): ?>
        <div class="alert alert-danger alert-dismissible fade show">
          <button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>
          <?php echo htmlspecialchars($errorMessage, ENT_QUOTES, 'UTF-8'); ?>
        </div>
      <?php endif; ?>

      <!-- Budget Summary -->
      <div class="row">
        <div class="col-lg-4 col-12">
          <div class="small-box bg-primary">
            <div class="inner">
              <h3>Rp <?php echo number_format($budget['savingsTarget'], 0, ',', '.'); ?></h3>
              <p>Target Tabungan (Pemasukan: Rp <?php echo number_format($budget['incomeTarget'], 0, ',', '.'); ?>)</p>
            </div>
            <div class="icon">
              <i class="fas fa-piggy-bank"></i>
            </div>
          </div>
        </div>
        <div class="col-lg-4 col-6">
          <div class="small-box bg-info">
            <div class="inner">
              <h3>Rp <?php echo number_format($spendingLimit, 0, ',', '.'); ?></h3>
              <p>Batas Pengeluaran</p>
              <?php 
                  $percent = $spendingLimit > 0 ? ($totalExpense / $spendingLimit) * 100 : 0;
                  $color = $percent > 90 ? 'bg-danger' : ($percent > 70 ? 'bg-warning' : 'bg-success');
              ?>
              <div class="progress progress-xs">
                <div class="progress-bar bg-white" style="width: <?php echo min($percent, 100); ?>%"></div>
              </div>
              <small>Terpakai <?php echo round($percent); ?>%</small>
            </div>
            <div class="icon">
              <i class="fas fa-calculator"></i>
            </div>
          </div>
        </div>
        <div class="col-lg-4 col-6">
          <div class="small-box <?php echo $remainingBudget < 0 ? 'bg-danger' : 'bg-success'; ?>">
            <div class="inner">
              <h3>Rp <?php echo number_format($remainingBudget, 0, ',', '.'); ?></h3>
              <p><?php echo $remainingBudget < 0 ? 'Waduh, over budget!' : 'Sisa Anggaran'; ?></p>
            </div>
            <div class="icon">
              <i class="fas <?php echo $remainingBudget < 0 ? 'fa-triangle-exclamation' : 'fa-smile'; ?>"></i>
            </div>
          </div>
        </div>
      </div>

      <!-- Kakeibo Categories -->
      <h5 class="mb-3">4 Pilar Pengeluaran Kakeibo</h5>
      <div class="row">
        <!-- NEEDS -->
        <div class="col-md-3 col-6">
          <div class="card card-outline card-success">
            <div class="card-header">
              <h3 class="card-title"><i class="fas fa-home mr-1 text-success"></i> Survival</h3>
            </div>
            <div class="card-body">
              <small class="text-muted d-block mb-1">Kebutuhan Pokok</small>
              <h4 class="font-weight-bold">Rp <?php echo number_format($kakeibo['needs'], 0, ',', '.'); ?></h4>
            </div>
          </div>
        </div>
        <!-- WANTS -->
        <div class="col-md-3 col-6">
          <div class="card card-outline card-warning">
            <div class="card-header">
              <h3 class="card-title"><i class="fas fa-shopping-bag mr-1 text-warning"></i> Optional</h3>
            </div>
            <div class="card-body">
              <small class="text-muted d-block mb-1">Keinginan/Hiburan</small>
              <h4 class="font-weight-bold">Rp <?php echo number_format($kakeibo['wants'], 0, ',', '.'); ?></h4>
            </div>
          </div>
        </div>
        <!-- CULTURE -->
        <div class="col-md-3 col-6">
          <div class="card card-outline card-info">
            <div class="card-header">
              <h3 class="card-title"><i class="fas fa-book-open mr-1 text-info"></i> Culture</h3>
            </div>
            <div class="card-body">
              <small class="text-muted d-block mb-1">Wawasan/Ilmu</small>
              <h4 class="font-weight-bold">Rp <?php echo number_format($kakeibo['culture'], 0, ',', '.'); ?></h4>
            </div>
          </div>
        </div>
        <!-- EXTRAS -->
        <div class="col-md-3 col-6">
          <div class="card card-outline card-danger">
            <div class="card-header">
              <h3 class="card-title"><i class="fas fa-bolt mr-1 text-danger"></i> Extras</h3>
            </div>
            <div class="card-body">
              <small class="text-muted d-block mb-1">Tak Terduga</small>
              <h4 class="font-weight-bold">Rp <?php echo number_format($kakeibo['extras'], 0, ',', '.'); ?></h4>
            </div>
          </div>
        </div>
      </div>

    </div>
  </section>
</div>

<!-- BUDGET MODAL -->
<div class="modal fade" id="budgetModal">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h4 class="modal-title">Set Target Bulanan</h4>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
            <form method="POST">
              <?php echo csrf_field(); ?>
                <input type="hidden" name="action" value="set_budget">
                <div class="modal-body">
                    <div class="form-group">
                        <label>Estimasi Pemasukan (Total)</label>
                        <div class="input-group">
                            <div class="input-group-prepend">
                                <span class="input-group-text">Rp</span>
                            </div>
                            <input type="number" name="incomeTarget" class="form-control" value="<?php echo $budget['incomeTarget']; ?>" required>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Target Tabungan</label>
                        <div class="input-group">
                            <div class="input-group-prepend">
                                <span class="input-group-text">Rp</span>
                            </div>
                            <input type="number" name="savingsTarget" class="form-control" value="<?php echo $budget['savingsTarget']; ?>" required>
                        </div>
                        <p class="help-block small">Berapa yang ingin kamu simpan bulan ini?</p>
                    </div>
                </div>
                <div class="modal-footer justify-content-between">
                    <button type="button" class="btn btn-default" data-dismiss="modal">Batal</button>
                    <button type="submit" class="btn btn-primary">Simpan Target</button>
                </div>
            </form>
        </div>
    </div>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
