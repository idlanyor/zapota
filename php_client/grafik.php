<?php
// grafik.php
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/api.php';
require_login();

$userId = $_SESSION['whatsapp_number'];
$month = $_GET['month'] ?? date('m');
$year = $_GET['year'] ?? date('Y');

$reportData = send_api_request('GET', '/api/webhook/finance/report', [
    'userId' => $userId,
    'month' => $month,
    'year' => $year
]);

$report = $reportData['data'] ?? null;

// Data processing for charts
$categoryData = [];
$dailyData = [];
$incomeVsExpense = ['income' => 0, 'expense' => 0];

if ($report && isset($report['transactions'])) {
    foreach ($report['transactions'] as $tx) {
        // Category grouping (expenses only)
        if ($tx['type'] === 'expense') {
            $cat = $tx['category'] ?: 'Lainnya';
            $categoryData[$cat] = ($categoryData[$cat] ?? 0) + $tx['amount'];
        }

        // Daily grouping
        $day = date('d', strtotime($tx['date']));
        if (!isset($dailyData[$day])) {
            $dailyData[$day] = ['income' => 0, 'expense' => 0];
        }
        $dailyData[$day][$tx['type']] += $tx['amount'];
        
        // Total summary
        if (isset($incomeVsExpense[$tx['type']])) {
            $incomeVsExpense[$tx['type']] += $tx['amount'];
        }
    }
}

ksort($dailyData);

include __DIR__ . '/includes/header.php';
?>

<!-- Content Wrapper. Contains page content -->
<div class="content-wrapper">
  <!-- Content Header (Page header) -->
  <section class="content-header">
    <div class="container-fluid">
      <div class="row mb-2">
        <div class="col-sm-6">
          <h1><i class="fas fa-chart-area mr-2"></i>Analisis Keuangan</h1>
        </div>
        <div class="col-sm-6">
          <form class="form-inline float-sm-right bg-white p-2 rounded shadow-sm">
            <div class="form-group mr-2">
              <select name="month" class="form-control form-control-sm">
                <?php for($m=1; $m<=12; $m++): ?>
                    <option value="<?php echo $m; ?>" <?php echo $m == $month ? 'selected' : ''; ?>>
                        <?php echo date('F', mktime(0, 0, 0, $m, 1)); ?>
                    </option>
                <?php endfor; ?>
              </select>
            </div>
            <div class="form-group mr-2">
              <select name="year" class="form-control form-control-sm">
                <?php for($y=date('Y'); $y>=date('Y')-2; $y--): ?>
                    <option value="<?php echo $y; ?>" <?php echo $y == $year ? 'selected' : ''; ?>><?php echo $y; ?></option>
                <?php endfor; ?>
              </select>
            </div>
            <button type="submit" class="btn btn-primary btn-sm">Filter</button>
          </form>
        </div>
      </div>
    </div>
  </section>

  <!-- Main content -->
  <section class="content">
    <div class="container-fluid">

      <?php if (!$report || empty($report['transactions'])): ?>
        <div class="alert alert-warning"><i class="fas fa-exclamation-triangle mr-2"></i>Tidak ada data transaksi untuk periode ini.</div>
      <?php else: ?>
        <div class="row">
          <!-- Bar Chart: Harian -->
          <div class="col-lg-8 col-12">
            <div class="card card-success card-outline">
              <div class="card-header">
                <h3 class="card-title"><i class="fas fa-chart-bar mr-1"></i> Tren Transaksi Harian</h3>
              </div>
              <div class="card-body">
                <div class="chart">
                  <canvas id="dailyChart" style="min-height: 250px; height: 250px; max-height: 250px; max-width: 100%;"></canvas>
                </div>
              </div>
            </div>
          </div>

          <!-- Pie Chart: Perbandingan -->
          <div class="col-lg-4 col-12">
            <div class="card card-warning card-outline">
              <div class="card-header">
                <h3 class="card-title"><i class="fas fa-scale-balanced mr-1"></i> Rasio Keuangan</h3>
              </div>
              <div class="card-body">
                <canvas id="ratioChart" style="min-height: 250px; height: 250px; max-height: 250px; max-width: 100%;"></canvas>
              </div>
            </div>
          </div>

          <!-- Pie Chart: Kategori Pengeluaran -->
          <div class="col-lg-6 col-12">
            <div class="card card-danger card-outline">
              <div class="card-header">
                <h3 class="card-title"><i class="fas fa-tags mr-1"></i> Kategori Pengeluaran</h3>
              </div>
              <div class="card-body">
                <canvas id="categoryChart" style="min-height: 250px; height: 250px; max-height: 250px; max-width: 100%;"></canvas>
              </div>
            </div>
          </div>
        </div>
      <?php endif; ?>

    </div>
  </section>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<?php include __DIR__ . '/includes/footer.php'; ?>

<script>
    <?php if ($report && !empty($report['transactions'])): ?>
    // Data dari PHP
    const dailyLabels = <?php echo json_encode(array_keys($dailyData)); ?>;
    const dailyIncome = <?php echo json_encode(array_column($dailyData, 'income')); ?>;
    const dailyExpense = <?php echo json_encode(array_column($dailyData, 'expense')); ?>;
    
    const catLabels = <?php echo json_encode(array_keys($categoryData)); ?>;
    const catValues = <?php echo json_encode(array_values($categoryData)); ?>;

    const ratioData = [<?php echo $incomeVsExpense['income']; ?>, <?php echo $incomeVsExpense['expense']; ?>];

    // Daily Chart
    new Chart(document.getElementById('dailyChart'), {
        type: 'bar',
        data: {
            labels: dailyLabels,
            datasets: [
                { label: 'Pemasukan', data: dailyIncome, backgroundColor: '#28a745' },
                { label: 'Pengeluaran', data: dailyExpense, backgroundColor: '#dc3545' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });

    // Ratio Chart
    new Chart(document.getElementById('ratioChart'), {
        type: 'doughnut',
        data: {
            labels: ['Pemasukan', 'Pengeluaran'],
            datasets: [{
                data: ratioData,
                backgroundColor: ['#28a745', '#dc3545']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // Category Chart
    new Chart(document.getElementById('categoryChart'), {
        type: 'pie',
        data: {
            labels: catLabels,
            datasets: [{
                data: catValues,
                backgroundColor: ['#007bff', '#6610f2', '#6f42c1', '#e83e8c', '#fd7e14', '#ffc107', '#20c997', '#17a2b8']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
    <?php endif; ?>
</script>
