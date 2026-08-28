<?php
// php_client/export_excel.php
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/api.php';
require_once __DIR__ . '/includes/SimpleXLSXGen.php';
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
    die("Gagal mengambil data untuk export.");
}

$report = $res['data'];
$filename = "Laporan_Keuangan_" . date('F_Y', mktime(0,0,0,$month,1,$year)) . ".xlsx";

$data = [
    ['<style bgcolor="#E2E3E5"><b>No</b></style>', '<style bgcolor="#E2E3E5"><b>Tanggal</b></style>', '<style bgcolor="#E2E3E5"><b>Tipe</b></style>', '<style bgcolor="#E2E3E5"><b>Kategori</b></style>', '<style bgcolor="#E2E3E5"><b>Keterangan</b></style>', '<style bgcolor="#E2E3E5"><b>Nominal</b></style>']
];

$i = 1;
foreach ($report['transactions'] as $tx) {
    $typeColor = $tx['type'] === 'income' ? '#D1E7DD' : '#F8D7DA';
    $data[] = [
        $i++,
        date('d/m/Y H:i', strtotime($tx['date'])),
        "<style bgcolor=\"$typeColor\">" . strtoupper($tx['type']) . "</style>",
        $tx['category'],
        $tx['description'],
        (int)$tx['amount']
    ];
}

// Summary
$data[] = ['', '', '', '', '', '']; // Empty row
$data[] = ['', '', '', '', '<b>TOTAL PEMASUKAN</b>', (int)$report['totalIncome']];
$data[] = ['', '', '', '', '<b>TOTAL PENGELUARAN</b>', (int)$report['totalExpense']];
$data[] = ['', '', '', '', '<b>SISA SALDO</b>', '<b>' . (int)$report['balance'] . '</b>'];

// Generate XLSX
$xlsx = Shuchkin\SimpleXLSXGen::fromArray($data);
$xlsx->downloadAs($filename);
exit;
?>
