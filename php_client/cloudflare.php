<?php
// cloudflare.php
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

    if ($action === 'add_dns') {
        $data = [
            'userId' => $userId,
            'zoneId' => $_POST['zoneId'],
            'type' => $_POST['type'],
            'name' => $_POST['name'],
            'content' => $_POST['content'],
            'proxied' => isset($_POST['proxied'])
        ];
        $res = send_api_request('POST', '/api/webhook/cloudflare/dns', $data);
        if ($res['ok']) {
            $msg = "DNS Record berhasil ditambahkan.";
            $msgType = "success";
        } else {
            $msg = "Gagal tambah DNS: " . ($res['error'] ?? 'Unknown error');
            $msgType = "danger";
        }
    } 
    elseif ($action === 'add_rule') {
        $data = [
            'userId' => $userId,
            'ip' => $_POST['ip'],
            'mode' => $_POST['mode'],
            'notes' => $_POST['notes']
        ];
        $res = send_api_request('POST', '/api/webhook/cloudflare/rules', $data);
        if ($res['ok']) {
            $msg = "Firewall Rule berhasil ditambahkan.";
            $msgType = "success";
        } else {
            $msg = "Gagal tambah Rule: " . ($res['error'] ?? 'Unknown error');
            $msgType = "danger";
        }
    }
    elseif ($action === 'delete_rule') {
        $data = [
            'userId' => $userId,
            'ip' => $_POST['ip']
        ];
        $res = send_api_request('DELETE', '/api/webhook/cloudflare/rules', $data);
        if ($res['ok']) {
            $msg = "Firewall Rule berhasil dihapus.";
            $msgType = "success";
        } else {
            $msg = "Gagal hapus Rule: " . ($res['error'] ?? 'Unknown error');
            $msgType = "danger";
        }
    }
}

// --- FETCH DATA ---
$tab = $_GET['tab'] ?? 'rules';
$zoneId = $_GET['zoneId'] ?? '';

$zonesData = send_api_request('GET', '/api/webhook/cloudflare/zones', ['userId' => $userId]);
$zones = $zonesData['data'] ?? [];

$dnsRecords = [];
if ($tab === 'dns' && $zoneId) {
    $dnsData = send_api_request('GET', '/api/webhook/cloudflare/dns', ['userId' => $userId, 'zoneId' => $zoneId]);
    $dnsRecords = $dnsData['data'] ?? [];
}

$rules = [];
if ($tab === 'rules') {
    $rulesData = send_api_request('GET', '/api/webhook/cloudflare/rules', ['userId' => $userId]);
    $rules = $rulesData['data'] ?? [];
}

include __DIR__ . '/includes/header.php';
?>

<div class="content-wrapper">
  <section class="content-header">
    <div class="container-fluid">
      <div class="row mb-2">
        <div class="col-sm-6">
          <h1>Cloudflare Management</h1>
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

      <div class="card card-primary card-outline card-tabs">
        <div class="card-header p-0 pt-1 border-bottom-0">
          <ul class="nav nav-tabs" id="cf-tabs" role="tablist">
            <li class="nav-item">
              <a class="nav-link <?php echo $tab === 'rules' ? 'active' : ''; ?>" href="?tab=rules">Firewall Rules</a>
            </li>
            <li class="nav-item">
              <a class="nav-link <?php echo $tab === 'dns' ? 'active' : ''; ?>" href="?tab=dns">DNS Management</a>
            </li>
          </ul>
        </div>
        <div class="card-body">
          <div class="tab-content">
            
            <!-- TAB FIREWALL RULES -->
            <?php if ($tab === 'rules'): ?>
            <div class="tab-pane fade show active">
              <div class="row mb-3">
                <div class="col-12">
                  <button class="btn btn-primary" data-toggle="modal" data-target="#addRuleModal">
                    <i class="fas fa-plus mr-1"></i> Add Rule
                  </button>
                </div>
              </div>
              <div class="table-responsive">
                <table class="table table-hover text-nowrap">
                  <thead>
                    <tr>
                      <th>Value (IP)</th>
                      <th>Mode</th>
                      <th>Notes</th>
                      <th>Created</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    <?php if (empty($rules)): ?>
                      <tr><td colspan="5" class="text-center">No rules found.</td></tr>
                    <?php else: ?>
                      <?php foreach ($rules as $rule): ?>
                        <tr>
                          <td><?php echo htmlspecialchars($rule['configuration']['value']); ?></td>
                          <td>
                            <span class="badge <?php 
                              echo $rule['mode'] === 'block' ? 'badge-danger' : 
                                  ($rule['mode'] === 'whitelist' ? 'badge-success' : 'badge-warning'); 
                            ?>">
                              <?php echo strtoupper($rule['mode']); ?>
                            </span>
                          </td>
                          <td><?php echo htmlspecialchars($rule['notes'] ?? '-'); ?></td>
                          <td><?php echo date('d/m/y H:i', strtotime($rule['created_on'])); ?></td>
                          <td>
                            <form method="POST" class="d-inline" onsubmit="return confirm('Delete this rule?')">
                              <?php echo csrf_field(); ?>
                              <input type="hidden" name="action" value="delete_rule">
                              <input type="hidden" name="ip" value="<?php echo $rule['configuration']['value']; ?>">
                              <button type="submit" class="btn btn-danger btn-sm"><i class="fas fa-trash"></i></button>
                            </form>
                          </td>
                        </tr>
                      <?php endforeach; ?>
                    <?php endif; ?>
                  </tbody>
                </table>
              </div>
            </div>
            <?php endif; ?>

            <!-- TAB DNS MANAGEMENT -->
            <?php if ($tab === 'dns'): ?>
            <div class="tab-pane fade show active">
              <div class="row mb-3">
                <div class="col-md-4">
                  <form method="GET">
                    <input type="hidden" name="tab" value="dns">
                    <div class="input-group">
                      <select name="zoneId" class="form-control" onchange="this.form.submit()">
                        <option value="">-- Select Zone --</option>
                        <?php foreach ($zones as $z): ?>
                          <option value="<?php echo $z['id']; ?>" <?php echo $zoneId === $z['id'] ? 'selected' : ''; ?>>
                            <?php echo $z['name']; ?>
                          </option>
                        <?php endforeach; ?>
                      </select>
                    </div>
                  </form>
                </div>
                <?php if ($zoneId): ?>
                <div class="col-md-8 text-right">
                  <button class="btn btn-primary" data-toggle="modal" data-target="#addDnsModal">
                    <i class="fas fa-plus mr-1"></i> Add DNS Record
                  </button>
                </div>
                <?php endif; ?>
              </div>

              <?php if ($zoneId): ?>
                <div class="table-responsive">
                  <table class="table table-hover text-nowrap">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Name</th>
                        <th>Content</th>
                        <th>Proxied</th>
                        <th>TTL</th>
                      </tr>
                    </thead>
                    <tbody>
                      <?php if (empty($dnsRecords)): ?>
                        <tr><td colspan="5" class="text-center">No DNS records found.</td></tr>
                      <?php else: ?>
                        <?php foreach ($dnsRecords as $dns): ?>
                          <tr>
                            <td><span class="badge badge-info"><?php echo $dns['type']; ?></span></td>
                            <td><?php echo htmlspecialchars($dns['name']); ?></td>
                            <td><?php echo htmlspecialchars($dns['content']); ?></td>
                            <td>
                              <i class="fas <?php echo $dns['proxied'] ? 'fa-cloud text-orange' : 'fa-cloud text-gray'; ?>"></i>
                            </td>
                            <td><?php echo $dns['ttl'] === 1 ? 'Auto' : $dns['ttl']; ?></td>
                          </tr>
                        <?php endforeach; ?>
                      <?php endif; ?>
                    </tbody>
                  </table>
                </div>
              <?php else: ?>
                <div class="text-center py-5 text-muted">
                  <i class="fas fa-globe fa-3x mb-3"></i>
                  <p>Please select a zone to manage DNS records.</p>
                </div>
              <?php endif; ?>
            </div>
            <?php endif; ?>

          </div>
        </div>
      </div>
    </div>
  </section>
</div>

<!-- MODAL ADD RULE -->
<div class="modal fade" id="addRuleModal">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h4 class="modal-title">Add Firewall Rule</h4>
        <button type="button" class="close" data-dismiss="modal">&times;</button>
      </div>
      <form method="POST">
        <?php echo csrf_field(); ?>
        <div class="modal-body">
          <input type="hidden" name="action" value="add_rule">
          <div class="form-group">
            <label>IP Address</label>
            <input type="text" name="ip" class="form-control" placeholder="1.2.3.4" required>
          </div>
          <div class="form-group">
            <label>Mode</label>
            <select name="mode" class="form-control" required>
              <option value="block">Block</option>
              <option value="whitelist">Whitelist</option>
              <option value="challenge">JS Challenge</option>
              <option value="managed_challenge">Managed Challenge</option>
            </select>
          </div>
          <div class="form-group">
            <label>Notes</label>
            <input type="text" name="notes" class="form-control" placeholder="Optional notes">
          </div>
        </div>
        <div class="modal-footer">
          <button type="submit" class="btn btn-primary">Add Rule</button>
        </div>
      </form>
    </div>
  </div>
</div>

<!-- MODAL ADD DNS -->
<div class="modal fade" id="addDnsModal">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h4 class="modal-title">Add DNS Record</h4>
        <button type="button" class="close" data-dismiss="modal">&times;</button>
      </div>
      <form method="POST">
        <?php echo csrf_field(); ?>
        <div class="modal-body">
          <input type="hidden" name="action" value="add_dns">
          <input type="hidden" name="zoneId" value="<?php echo htmlspecialchars($zoneId, ENT_QUOTES, 'UTF-8'); ?>">
          <div class="form-group">
            <label>Type</label>
            <select name="type" class="form-control" required>
              <option value="A">A</option>
              <option value="AAAA">AAAA</option>
              <option value="CNAME">CNAME</option>
              <option value="TXT">TXT</option>
              <option value="MX">MX</option>
            </select>
          </div>
          <div class="form-group">
            <label>Name (e.g. sub.domain.com or @)</label>
            <input type="text" name="name" class="form-control" required>
          </div>
          <div class="form-group">
            <label>Content (IP or Target)</label>
            <input type="text" name="content" class="form-control" required>
          </div>
          <div class="form-check">
            <input type="checkbox" name="proxied" class="form-check-input" id="proxiedCheck" checked>
            <label class="form-check-label" for="proxiedCheck">Proxied</label>
          </div>
        </div>
        <div class="modal-footer">
          <button type="submit" class="btn btn-primary">Add DNS</button>
        </div>
      </form>
    </div>
  </div>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
