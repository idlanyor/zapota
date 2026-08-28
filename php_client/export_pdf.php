<?php
// php_client/export_pdf.php
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/api.php';
require_login();

$userId = $_SESSION['whatsapp_number'];
$month = $_GET['month'] ?? date('m');
$year = $_GET['year'] ?? date('Y');

$res = send_api_request('GET', '/api/webhook/finance/report', [
    'userId' => $userId,
    'month' => $month,
    'year' => $year
]);

if (!$res['ok']) {
    die("Gagal mengambil data.");
}

$report = $res['data'];
$periode = date('F Y', mktime(0,0,0,$month,1,$year));
?>
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <title>Report_<?php echo str_replace(' ', '_', $periode); ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
        body { 
            font-family: 'Inter', sans-serif; 
            background-color: #f0f2f5; 
            color: #334155;
            -webkit-print-color-adjust: exact;
        }
        .paper {
            background: #fff;
            width: 210mm;
            min-height: 297mm;
            padding: 20mm;
            margin: 20px auto;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
            position: relative;
        }
        @media print {
            @page{
                margin:5mm;
            }
            body { background: none; padding: 0; }
            .paper { margin: 0; box-shadow: none; width: 100%; }
            .no-print { display: none; }
        }
        
        .header-brand { 
            color: #4f46e5; 
            font-weight: 800; 
            font-size: 1.5rem; 
            letter-spacing: -0.5px;
            margin-bottom: 5px;
        }
        .report-title {
            font-weight: 800;
            font-size: 2.2rem;
            color: #1e293b;
            letter-spacing: -1px;
            text-transform: uppercase;
        }
        .summary-card {
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 20px;
            height: 100%;
        }
        .summary-label {
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 5px;
            display: block;
        }
        .summary-value {
            font-size: 1.4rem;
            font-weight: 700;
            margin: 0;
        }
        .table thead th {
            background-color: #f8fafc;
            border-bottom: 2px solid #e2e8f0;
            color: #475569;
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
            padding: 12px;
        }
        .table tbody td {
            padding: 12px;
            border-bottom: 1px solid #f1f5f9;
            font-size: 0.9rem;
        }
        .badge-type {
            font-size: 0.7rem;
            font-weight: 700;
            padding: 5px 10px;
            border-radius: 6px;
            text-transform: uppercase;
        }
        .footer {
            margin-top: 50px;
            border-top: 1px solid #e2e8f0;
            padding-top: 20px;
            font-size: 0.8rem;
            color: #94a3b8;
        }
    </style>
</head>
<body onload="window.print()">
    <div class="no-print container mt-4 text-center">
        <button onclick="window.close()" class="btn btn-dark rounded-pill px-4">Tutup</button>
        <button onclick="window.print()" class="btn btn-primary rounded-pill px-4 ms-2">Cetak / Save PDF</button>
    </div>

    <div class="paper">
        <!-- Header -->
        <div class="row align-items-start mb-5">
            <div class="col-7">
                <div class="header-brand">KANATA BOT</div>
                <h1 class="report-title">Financial<br>Statement</h1>
            </div>
            <div class="col-5 text-end">
                <div class="mb-4">
                    <span class="summary-label">Periode Laporan</span>
                    <h5 class="fw-bold"><?php echo $periode; ?></h5>
                </div>
                <div>
                    <span class="summary-label">Nama Pengguna</span>
                    <h6 class="fw-bold mb-0"><?php echo htmlspecialchars($_SESSION['username']); ?></h6>
                    <small class="text-muted"><?php echo $_SESSION['user_id']; ?></small>
                </div>
            </div>
        </div>

        <!-- Summary Grid -->
        <div class="row g-3 mb-5">
            <div class="col-4">
                <div class="summary-card">
                    <span class="summary-label">Total Pemasukan</span>
                    <p class="summary-value text-success">Rp <?php echo number_format($report['totalIncome'], 0, ',', '.'); ?></p>
                </div>
            </div>
            <div class="col-4">
                <div class="summary-card">
                    <span class="summary-label">Total Pengeluaran</span>
                    <p class="summary-value text-danger">Rp <?php echo number_format($report['totalExpense'], 0, ',', '.'); ?></p>
                </div>
            </div>
            <div class="col-4">
                <div class="summary-card bg-light border-0">
                    <span class="summary-label">Sisa Saldo</span>
                    <p class="summary-value text-primary">Rp <?php echo number_format($report['balance'], 0, ',', '.'); ?></p>
                </div>
            </div>
        </div>

        <!-- Table -->
        <h6 class="fw-bold mb-3 text-uppercase small text-muted" style="letter-spacing: 1px;">Detail Transaksi</h6>
        <table class="table align-middle">
            <thead>
                <tr>
                    <th width="40">#</th>
                    <th width="100">Tanggal</th>
                    <th width="90">Tipe</th>
                    <th>Kategori & Keterangan</th>
                    <th class="text-end">Nominal</th>
                </tr>
            </thead>
            <tbody>
                <?php $i = 1; foreach ($report['transactions'] as $tx): ?>
                    <tr>
                        <td class="text-muted small"><?php echo $i++; ?></td>
                        <td>
                            <div class="fw-bold small"><?php echo date('d M Y', strtotime($tx['date'])); ?></div>
                            <div class="text-muted" style="font-size: 0.7rem;"><?php echo date('H:i', strtotime($tx['date'])); ?></div>
                        </td>
                        <td>
                            <span class="badge-type <?php echo $tx['type'] === 'income' ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'; ?>">
                                <?php echo $tx['type'] === 'income' ? 'Masuk' : 'Keluar'; ?>
                            </span>
                        </td>
                        <td>
                            <div class="fw-bold"><?php echo htmlspecialchars($tx['category']); ?></div>
                            <div class="text-muted small"><?php echo htmlspecialchars($tx['description']); ?></div>
                        </td>
                        <td class="text-end fw-bold">
                            Rp <?php echo number_format($tx['amount'], 0, ',', '.'); ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>

        <!-- Footer -->
        <div class="footer d-flex justify-content-between">
            <div>
                Laporan ini dibuat otomatis oleh sistem <strong>Kanata Bot</strong>.
            </div>
            <div>
                Dicetak: <?php echo date('d/m/Y H:i'); ?>
            </div>
        </div>
    </div>
</body>
</html>
