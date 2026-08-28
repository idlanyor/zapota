<?php
// php_client/includes/api.php
require_once __DIR__ . '/config.php';

/**
 * Petakan path webhook lama ke endpoint Kanata Core.
 * Endpoint adapter (cloudflare, settings, send-text, jadibot) tetap ke bot webhook
 * (bukan Core) — Core hanya sumber data + auth.
 */
function map_core_endpoint($endpoint) {
    // Endpoint adapter yang tetap di bot webhook (bukan data Core)
    $botOnly = [
        '/api/webhook/cloudflare/zones', '/api/webhook/cloudflare/dns',
        '/api/webhook/cloudflare/rules', '/api/webhook/settings',
        '/api/webhook/settings/update', '/api/webhook/send-text',
        '/api/webhook/send-document', '/api/webhook/jadibot/start',
        '/api/webhook/jadibot/stop', '/api/webhook/jadibot/sessions',
        '/api/webhook/finance/catat', // AI (Gemini) tetap di bot
    ];
    if (in_array($endpoint, $botOnly, true)) return $endpoint;

    // Finance: /api/webhook/finance/... -> /v1/finance/...
    if (strpos($endpoint, '/api/webhook/finance/') === 0) {
        $rest = substr($endpoint, strlen('/api/webhook/finance/'));
        $map = [
            'report' => '/v1/finance/report',
            'kakeibo' => '/v1/finance/kakeibo',
            'catat' => '/v1/finance/transactions',
            'budget' => '/v1/finance/budget',
            'delete' => '/v1/finance/transactions',
            'update' => '/v1/finance/transactions',
            'detail' => '/v1/finance/transactions',
        ];
        return $map[$rest] ?? '/v1/finance/' . $rest;
    }
    // Auth: /api/webhook/auth/login -> /v1/auth/login
    if ($endpoint === '/api/webhook/auth/login') return '/v1/auth/login';
    if ($endpoint === '/api/webhook/auth/logout') return '/v1/auth/logout';
    // Users: /api/webhook/users/list -> /v1/users
    if ($endpoint === '/api/webhook/users/list') return '/v1/users';
    // Users update: /api/webhook/users/update -> /v1/users/:id
    if ($endpoint === '/api/webhook/users/update') return '/v1/users';
    // Fallback: ganti prefix umum
    if (strpos($endpoint, '/api/webhook/') === 0) {
        return '/v1/' . substr($endpoint, strlen('/api/webhook/'));
    }
    return $endpoint;
}

/**
 * Sign HMAC request Kanata Core (service auth).
 */
function core_signature($method, $path, $body) {
    $clientId = KANATA_CORE_CLIENT_ID;
    $secret = KANATA_CORE_CLIENT_SECRET;
    $timestamp = (string) time();
    $nonce = bin2hex(random_bytes(16));
    $canonical = $timestamp . '.' . $nonce . '.' . strtoupper($method) . '.' . $path . '.' . hash('sha256', $body);
    $signature = hash_hmac('sha256', $canonical, $secret);
    return [$clientId, $timestamp, $nonce, $signature];
}

/**
 * Normalisasi transaksi Core (snake_case) -> shape lama yang dirender PHP.
 */
function normalize_transaction($tx) {
    if (!is_array($tx)) return $tx;
    if (!isset($tx['_id']) && isset($tx['id'])) $tx['_id'] = $tx['id'];
    if (isset($tx['kakeibo_category'])) {
        $tx['kakeiboCategory'] = $tx['kakeibo_category'];
    } elseif (!isset($tx['kakeiboCategory'])) {
        $tx['kakeiboCategory'] = null;
    }
    return $tx;
}

function normalize_core_report($data) {
    if (!is_array($data)) return $data;
    if (isset($data['transactions']) && is_array($data['transactions'])) {
        $data['transactions'] = array_map('normalize_transaction', $data['transactions']);
    }
    return $data;
}

function send_api_request($method, $endpoint, $data = null) {
    $isBotOnly = false;
    $mapped = map_core_endpoint($endpoint);
    if ($mapped === $endpoint && strpos($endpoint, '/api/webhook/') === 0) {
        $isBotOnly = true;
    }
    $endpoint = $mapped;

    // Normalisasi POST /v1/finance/budget (set) -> PUT
    if ($method === 'POST' && $endpoint === '/v1/finance/budget') {
        $method = 'PUT';
    }
    // finance/update (POST) -> PATCH /v1/finance/transactions/:id
    if ($endpoint === '/v1/finance/transactions' && $method === 'POST' && !$isBotOnly) {
        if (!empty($data['transactionId'])) {
            $endpoint .= '/' . $data['transactionId'];
            $method = 'PATCH';
            unset($data['transactionId']);
            if (isset($data['kakeiboCategory'])) {
                $data['kakeibo_category'] = $data['kakeiboCategory'];
                unset($data['kakeiboCategory']);
            }
        }
    }
    // finance/detail (GET) -> GET /v1/finance/transactions/:id
    if ($endpoint === '/v1/finance/transactions' && $method === 'GET' && !$isBotOnly) {
        if (!empty($data['transactionId'])) {
            $endpoint .= '/' . $data['transactionId'];
            unset($data['transactionId']);
        }
    }
    // finance/transactions POST (create manual) -> kakeiboCategory -> kakeibo_category
    if ($endpoint === '/v1/finance/transactions' && $method === 'POST' && !$isBotOnly) {
        if (isset($data['kakeiboCategory'])) {
            $data['kakeibo_category'] = $data['kakeiboCategory'];
            unset($data['kakeiboCategory']);
        }
    }
    // finance/delete (DELETE) -> DELETE /v1/finance/transactions/:id atau /last
    if ($endpoint === '/v1/finance/transactions' && $method === 'DELETE' && !$isBotOnly) {
        if (!empty($data['transactionId'])) {
            $endpoint .= '/' . $data['transactionId'];
            unset($data['transactionId']);
        } else {
            $endpoint .= '/last';
        }
    }
    // users/update (POST) -> PATCH /v1/users/:id
    if ($endpoint === '/v1/users' && $method === 'POST' && !$isBotOnly) {
        if (!empty($data['targetJid'])) {
            $endpoint .= '/' . $data['targetJid'];
            $method = 'PATCH';
            unset($data['targetJid']);
            // Map field bot lama -> field Core
            if (isset($data['name']) && !isset($data['display_name'])) {
                $data['display_name'] = $data['name'];
            }
            unset($data['name'], $data['userId']);
        }
    }

    // Endpoint bot-only: arahkan ke webhook bot (8787) dengan Bearer token bot
    if ($isBotOnly) {
        $url = KANATA_BOT_URL . $endpoint;
        if ($method === 'GET' && $data) {
            $url .= '?' . http_build_query($data);
        }
        $bodyStr = '';
        if ($data !== null && in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'])) {
            $bodyStr = json_encode($data);
        }
        $botToken = getenv('KANATA_BOT_WEBHOOK_TOKEN') ?: getenv('BOT_WEBHOOK_TOKEN');
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        $headers = ['Content-Type: application/json'];
        if ($botToken) $headers[] = 'Authorization: Bearer ' . $botToken;
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        if ($bodyStr !== '') curl_setopt($ch, CURLOPT_POSTFIELDS, $bodyStr);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        if (curl_errno($ch)) {
            $error_msg = curl_error($ch);
            curl_close($ch);
            return ['ok' => false, 'error' => "cURL Error: $error_msg"];
        }
        curl_close($ch);
        $decoded = json_decode($response, true);
        if (!$decoded) {
            return ['ok' => false, 'error' => "Invalid API Response", 'details' => $response, 'http_code' => $httpCode];
        }
        $decoded['http_code'] = $httpCode;
        return $decoded;
    }

    // Jalur Core: bangun URL + body, tambah query utk GET
    $url = API_BASE_URL . $endpoint;
    if ($method === 'GET' && $data) {
        $url .= '?' . http_build_query($data);
        $endpoint .= '?' . http_build_query($data);
    }
    $bodyStr = '';
    if ($data !== null && in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'])) {
        $bodyStr = json_encode($data);
    }

    [$clientId, $timestamp, $nonce, $signature] = core_signature($method, $endpoint, $bodyStr);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5); // Timeout 5 detik untuk koneksi
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);        // Timeout 15 detik untuk eksekusi

    $headers = [
        'Content-Type: application/json',
        'X-Kanata-Client: ' . $clientId,
        'X-Kanata-Timestamp: ' . $timestamp,
        'X-Kanata-Nonce: ' . $nonce,
        'X-Kanata-Signature: ' . $signature,
    ];
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    if ($bodyStr !== '') {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $bodyStr);
    }

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    if (curl_errno($ch)) {
        $error_msg = curl_error($ch);
        error_log("cURL Error: $error_msg");
        curl_close($ch);
        return ['ok' => false, 'error' => "cURL Error: $error_msg"];
    }

    curl_close($ch);

    $decoded = json_decode($response, true);
    if (!$decoded) {
        error_log("Invalid API Response: $response (HTTP $httpCode)");
        return ['ok' => false, 'error' => "Invalid API Response", 'details' => $response, 'http_code' => $httpCode];
    }

    if (isset($decoded['ok']) && !$decoded['ok']) {
        error_log("API returned error: " . json_encode($decoded));
    }

    // Normalisasi response Core ke shape lama yang dirender halaman PHP
    if (!$isBotOnly && isset($decoded['data'])) {
        if (strpos($endpoint, '/v1/finance/report') === 0 || strpos($endpoint, '/v1/finance/kakeibo') === 0) {
            $decoded['data'] = normalize_core_report($decoded['data']);
        } elseif (strpos($endpoint, '/v1/finance/transactions') === 0) {
            $decoded['data'] = normalize_transaction($decoded['data']);
        }
    }

    $decoded['http_code'] = $httpCode;
    return $decoded;
}
?>
