<?php
// users.php
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

    if ($action === 'update_user') {
        $data = [
            'userId' => $userId,
            'targetJid' => $_POST['targetJid'],
            'name' => $_POST['name'],
            'role' => $_POST['role'],
            'balance' => (int)$_POST['balance']
        ];
        $res = send_api_request('POST', '/api/webhook/users/update', $data);
        if ($res['ok']) {
            $msg = "Data user berhasil diperbarui.";
            $msgType = "success";
        } else {
            $msg = "Gagal update user: " . ($res['error'] ?? 'Unknown error');
            $msgType = "danger";
        }
    }
}

// --- FETCH DATA ---
$page = $_GET['page'] ?? 1;
$search = $_GET['search'] ?? '';

$usersData = send_api_request('GET', '/api/webhook/users/list', [
    'userId' => $userId,
    'page' => $page,
    'search' => $search,
    'limit' => 20
]);

$users = $usersData['data']['users'] ?? [];
$total = $usersData['data']['total'] ?? 0;
$totalPages = $usersData['data']['totalPages'] ?? 1;

// Normalisasi field Core (snake_case) -> field yang dirender PHP (camelCase)
foreach ($users as &$u) {
    if (!isset($u['name']) && isset($u['display_name'])) $u['name'] = $u['display_name'];
    if (!isset($u['jid']) || $u['jid'] === null) $u['jid'] = $u['id'] ?? '';
    if (!isset($u['phoneNumber']) || $u['phoneNumber'] === null) $u['phoneNumber'] = '';
    if (!isset($u['createdAt']) && isset($u['created_at'])) $u['createdAt'] = $u['created_at'];
}
unset($u);

include __DIR__ . '/includes/header.php';
?>

<div class="content-wrapper">
  <section class="content-header">
    <div class="container-fluid">
      <div class="row mb-2">
        <div class="col-sm-6">
          <h1>User Management</h1>
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

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Daftar Pengguna Bot</h3>
          <div class="card-tools">
            <form method="GET" class="input-group input-group-sm" style="width: 250px;">
              <input type="text" name="search" class="form-control float-right" placeholder="Cari JID atau Nama..." value="<?php echo htmlspecialchars($search); ?>">
              <div class="input-group-append">
                <button type="submit" class="btn btn-default">
                  <i class="fas fa-search"></i>
                </button>
              </div>
            </form>
          </div>
        </div>
        <div class="card-body p-0 table-responsive">
          <table class="table table-hover text-nowrap">
            <thead>
              <tr>
                <th>Nama</th>
                <th>WhatsApp JID</th>
                <th>Nomor WA</th>
                <th>Role</th>
                <th>Saldo</th>
                <th>Terdaftar</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              <?php if (empty($users)): ?>
                <tr><td colspan="7" class="text-center py-4">Tidak ada data user ditemukan.</td></tr>
              <?php else: ?>
                <?php foreach ($users as $u): ?>
                  <tr>
                    <td><?php echo htmlspecialchars($u['name'] ?: 'No Name'); ?></td>
                    <td><code><?php echo htmlspecialchars($u['jid']); ?></code></td>
                    <td><?php echo htmlspecialchars($u['phoneNumber'] ?? '-'); ?></td>
                    <td>
                      <span class="badge <?php echo $u['role'] === 'admin' ? 'badge-primary' : 'badge-secondary'; ?>">
                        <?php echo strtoupper($u['role']); ?>
                      </span>
                    </td>
                    <td class="font-weight-bold">Rp <?php echo number_format($u['balance'], 0, ',', '.'); ?></td>
                    <td><?php echo date('d/m/y', strtotime($u['createdAt'])); ?></td>
                    <td>
                      <button class="btn btn-info btn-sm" 
                        data-toggle="modal" 
                        data-target="#editUserModal"
                        data-jid="<?php echo $u['jid']; ?>"
                        data-name="<?php echo htmlspecialchars($u['name']); ?>"
                        data-role="<?php echo $u['role']; ?>"
                        data-balance="<?php echo $u['balance']; ?>">
                        <i class="fas fa-edit"></i>
                      </button>
                    </td>
                  </tr>
                <?php endforeach; ?>
              <?php endif; ?>
            </tbody>
          </table>
        </div>
        <div class="card-footer clearfix">
          <ul class="pagination pagination-sm m-0 float-right">
            <?php for ($i = 1; $i <= $totalPages; $i++): ?>
              <li class="page-item <?php echo $i == $page ? 'active' : ''; ?>">
                <a class="page-link" href="?page=<?php echo $i; ?>&search=<?php echo urlencode($search); ?>"><?php echo $i; ?></a>
              </li>
            <?php endfor; ?>
          </ul>
        </div>
      </div>
    </div>
  </section>
</div>

<!-- MODAL EDIT USER -->
<div class="modal fade" id="editUserModal">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h4 class="modal-title">Edit User</h4>
        <button type="button" class="close" data-dismiss="modal">&times;</button>
      </div>
      <form method="POST">
        <?php echo csrf_field(); ?>
        <div class="modal-body">
          <input type="hidden" name="action" value="update_user">
          <input type="hidden" name="targetJid" id="edit-jid">
          
          <div class="form-group">
            <label>JID</label>
            <input type="text" id="display-jid" class="form-control" disabled>
          </div>

          <div class="form-group">
            <label>Nama</label>
            <input type="text" name="name" id="edit-name" class="form-control">
          </div>

          <div class="form-group">
            <label>Role</label>
            <select name="role" id="edit-role" class="form-control" required>
              <option value="user">USER</option>
              <option value="admin">ADMIN</option>
            </select>
          </div>

          <div class="form-group">
            <label>Saldo (Rp)</label>
            <input type="number" name="balance" id="edit-balance" class="form-control" required>
          </div>
        </div>
        <div class="modal-footer justify-content-between">
          <button type="button" class="btn btn-default" data-dismiss="modal">Batal</button>
          <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
        </div>
      </form>
    </div>
  </div>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
<script>
  $('#editUserModal').on('show.bs.modal', function (event) {
    var button = $(event.relatedTarget);
    $('#edit-jid').val(button.data('jid'));
    $('#display-jid').val(button.data('jid'));
    $('#edit-name').val(button.data('name'));
    $('#edit-role').val(button.data('role'));
    $('#edit-balance').val(button.data('balance'));
  });
</script>
