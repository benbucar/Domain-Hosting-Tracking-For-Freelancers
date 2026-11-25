<?php
require_once __DIR__ . '/config.php';

session_name(SESSION_NAME);
session_start();

header('Content-Type: application/json; charset=utf-8');

function send_json($status, $payload) {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function is_authenticated() {
    if (!empty($_SESSION['authenticated']) && $_SESSION['authenticated'] === true) {
        return true;
    }
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $m)) {
        if (hash_equals(API_TOKEN, trim($m[1]))) {
            return true;
        }
    }
    return false;
}

function ensure_data_file() {
    $dir = dirname(DATA_FILE);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    if (!file_exists(DATA_FILE)) {
        $initial = [
            'settings' => ['defaultUsdRate' => 50.6, 'reminderDays' => 30],
            'records' => [],
        ];
        file_put_contents(DATA_FILE, json_encode($initial, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    }
}

function read_data() {
    ensure_data_file();
    $raw = file_get_contents(DATA_FILE);
    $parsed = json_decode($raw, true);
    if (!is_array($parsed)) {
        return ['settings' => ['defaultUsdRate' => 50.6, 'reminderDays' => 30], 'records' => []];
    }
    if (!isset($parsed['records']) || !is_array($parsed['records'])) $parsed['records'] = [];
    if (!isset($parsed['settings']) || !is_array($parsed['settings'])) {
        $parsed['settings'] = ['defaultUsdRate' => 50.6, 'reminderDays' => 30];
    }
    return $parsed;
}

function write_data($data) {
    ensure_data_file();
    file_put_contents(DATA_FILE, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
}

function get_json_body() {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function fetch_live_usd_rate() {
    $ctx = stream_context_create([
        'http' => ['timeout' => 4, 'ignore_errors' => true],
    ]);
    $raw = @file_get_contents('https://open.er-api.com/v6/latest/USD', false, $ctx);
    if (!$raw) return null;
    $json = json_decode($raw, true);
    if (isset($json['rates']['TRY']) && is_numeric($json['rates']['TRY'])) {
        return ['rate' => round((float)$json['rates']['TRY'], 2), 'source' => 'live'];
    }
    return null;
}

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// Login / Logout
if ($route === 'login' && $method === 'POST') {
    $body = get_json_body();
    $password = (string)($body['password'] ?? '');
    if (hash_equals(PANEL_PASSWORD, $password)) {
        $_SESSION['authenticated'] = true;
        send_json(200, ['ok' => true]);
    }
    send_json(401, ['error' => 'Hatalı şifre']);
}

if ($route === 'logout' && $method === 'POST') {
    $_SESSION = [];
    session_destroy();
    send_json(200, ['ok' => true]);
}

if (!is_authenticated()) {
    send_json(401, ['error' => 'Oturum gerekli']);
}

if ($route === 'records' && $method === 'GET') {
    send_json(200, read_data());
}

if ($route === 'settings' && $method === 'PUT') {
    $body = get_json_body();
    $data = read_data();
    if (isset($body['defaultUsdRate']) && is_numeric($body['defaultUsdRate'])) {
        $data['settings']['defaultUsdRate'] = (float)$body['defaultUsdRate'];
    }
    if (isset($body['reminderDays']) && is_numeric($body['reminderDays'])) {
        $data['settings']['reminderDays'] = (int)$body['reminderDays'];
    }
    write_data($data);
    send_json(200, $data['settings']);
}

if ($route === 'usd-rate' && $method === 'GET') {
    $live = fetch_live_usd_rate();
    $data = read_data();
    if ($live) {
        $data['settings']['defaultUsdRate'] = $live['rate'];
        write_data($data);
        send_json(200, $live);
    }
    send_json(200, [
        'rate' => $data['settings']['defaultUsdRate'] ?? 50.6,
        'source' => 'saved',
    ]);
}

if ($route === 'clients/rename' && $method === 'PUT') {
    $body = get_json_body();
    $oldName = trim((string)($body['oldName'] ?? ''));
    $newName = trim((string)($body['newName'] ?? ''));
    if (!$oldName || !$newName) {
        send_json(400, ['error' => 'Eski ve yeni müşteri adı gerekli']);
    }
    $data = read_data();
    $updatedCount = 0;
    $now = gmdate('c');
    foreach ($data['records'] as &$r) {
        if (trim((string)($r['clientName'] ?? '')) === $oldName) {
            $r['clientName'] = $newName;
            $r['updatedAt'] = $now;
            $updatedCount++;
        }
    }
    unset($r);
    write_data($data);
    send_json(200, ['updatedCount' => $updatedCount]);
}

if ($route === 'records' && $method === 'POST') {
    $body = get_json_body();
    $data = read_data();
    $now = gmdate('c');
    $usdPrice = (float)($body['usdPrice'] ?? 0);
    $usdRate = (float)($body['usdRate'] ?? ($data['settings']['defaultUsdRate'] ?? 50.6));
    $tryAmount = (isset($body['tryAmount']) && $body['tryAmount'] !== '')
        ? (float)$body['tryAmount']
        : round($usdPrice * $usdRate, 2);

    $record = [
        'id' => bin2hex(random_bytes(6)),
        'clientName' => trim((string)($body['clientName'] ?? '')),
        'phone' => trim((string)($body['phone'] ?? '')),
        'domain' => strtolower(trim((string)($body['domain'] ?? ''))),
        'serviceType' => trim((string)($body['serviceType'] ?? 'Hosting + Domain')),
        'provider' => trim((string)($body['provider'] ?? '')),
        'startDate' => trim((string)($body['startDate'] ?? '')),
        'renewalDate' => trim((string)($body['renewalDate'] ?? '')),
        'usdPrice' => $usdPrice,
        'usdRate' => $usdRate,
        'tryAmount' => $tryAmount,
        'paymentStatus' => (($body['paymentStatus'] ?? '') === 'odendi') ? 'odendi' : 'bekliyor',
        'paidDate' => trim((string)($body['paidDate'] ?? '')),
        'notes' => trim((string)($body['notes'] ?? '')),
        'history' => is_array($body['history'] ?? null) ? $body['history'] : [],
        'createdAt' => $now,
        'updatedAt' => $now,
    ];

    $data['records'][] = $record;
    write_data($data);
    send_json(201, $record);
}

if (preg_match('#^records/([^/]+)/renew$#', $route, $m) && $method === 'POST') {
    $id = $m[1];
    $body = get_json_body();
    $data = read_data();
    $foundIdx = -1;
    foreach ($data['records'] as $idx => $r) {
        if ((string)$r['id'] === $id) {
            $foundIdx = $idx;
            break;
        }
    }
    if ($foundIdx === -1) send_json(404, ['error' => 'Kayıt bulunamadı']);

    $current = $data['records'][$foundIdx];
    $historyEntry = [
        'date' => $current['startDate'] ?: ($current['renewalDate'] ?: date('Y-m-d')),
        'period' => (substr($current['startDate'] ?? '', 0, 4) ?: '?') . ' - ' . (substr($current['renewalDate'] ?? '', 0, 4) ?: '?'),
        'usdPrice' => $current['usdPrice'] ?? 0,
        'usdRate' => $current['usdRate'] ?? 0,
        'tryAmount' => $current['tryAmount'] ?? 0,
        'paymentStatus' => $current['paymentStatus'] ?? 'bekliyor',
        'paidDate' => $current['paidDate'] ?? '',
        'note' => ($current['notes'] ?? '') ?: 'Önceki dönem',
    ];

    $newUsdPrice = isset($body['usdPrice']) ? (float)$body['usdPrice'] : (float)($current['usdPrice'] ?? 0);
    $newUsdRate = isset($body['usdRate']) ? (float)$body['usdRate'] : (float)($data['settings']['defaultUsdRate'] ?? 50.6);
    $newTryAmount = (isset($body['tryAmount']) && $body['tryAmount'] !== '')
        ? (float)$body['tryAmount']
        : round($newUsdPrice * $newUsdRate, 2);

    $existingHistory = is_array($current['history'] ?? null) ? $current['history'] : [];
    array_unshift($existingHistory, $historyEntry);

    $updated = array_merge($current, [
        'startDate' => trim((string)($body['startDate'] ?? date('Y-m-d'))),
        'renewalDate' => trim((string)($body['renewalDate'] ?? ($current['renewalDate'] ?? ''))),
        'usdPrice' => $newUsdPrice,
        'usdRate' => $newUsdRate,
        'tryAmount' => $newTryAmount,
        'paymentStatus' => (($body['paymentStatus'] ?? '') === 'odendi') ? 'odendi' : 'bekliyor',
        'paidDate' => trim((string)($body['paidDate'] ?? '')),
        'notes' => array_key_exists('notes', $body) ? trim((string)$body['notes']) : ($current['notes'] ?? ''),
        'history' => $existingHistory,
        'updatedAt' => gmdate('c'),
    ]);

    $data['records'][$foundIdx] = $updated;
    write_data($data);
    send_json(200, $updated);
}

if (preg_match('#^records/([^/]+)$#', $route, $m) && $method === 'PUT') {
    $id = $m[1];
    $body = get_json_body();
    $data = read_data();
    $foundIdx = -1;
    foreach ($data['records'] as $idx => $r) {
        if ((string)$r['id'] === $id) {
            $foundIdx = $idx;
            break;
        }
    }
    if ($foundIdx === -1) send_json(404, ['error' => 'Kayıt bulunamadı']);

    $current = $data['records'][$foundIdx];
    $usdPrice = array_key_exists('usdPrice', $body) ? (float)$body['usdPrice'] : (float)($current['usdPrice'] ?? 0);
    $usdRate = array_key_exists('usdRate', $body) ? (float)$body['usdRate'] : (float)($current['usdRate'] ?? 0);
    $tryAmount = (isset($body['tryAmount']) && $body['tryAmount'] !== '')
        ? (float)$body['tryAmount']
        : round($usdPrice * $usdRate, 2);

    $fields = ['clientName', 'phone', 'serviceType', 'provider', 'startDate', 'renewalDate', 'paidDate', 'notes'];
    foreach ($fields as $f) {
        if (array_key_exists($f, $body)) {
            $current[$f] = trim((string)$body[$f]);
        }
    }
    if (array_key_exists('domain', $body)) {
        $current['domain'] = strtolower(trim((string)$body['domain']));
    }
    if (array_key_exists('paymentStatus', $body)) {
        $current['paymentStatus'] = ($body['paymentStatus'] === 'odendi') ? 'odendi' : 'bekliyor';
    }
    $current['usdPrice'] = $usdPrice;
    $current['usdRate'] = $usdRate;
    $current['tryAmount'] = $tryAmount;
    $current['updatedAt'] = gmdate('c');

    $data['records'][$foundIdx] = $current;
    write_data($data);
    send_json(200, $current);
}

if (preg_match('#^records/([^/]+)$#', $route, $m) && $method === 'DELETE') {
    $id = $m[1];
    $data = read_data();
    $before = count($data['records']);
    $data['records'] = array_values(array_filter($data['records'], fn($r) => (string)$r['id'] !== $id));
    if (count($data['records']) === $before) {
        send_json(404, ['error' => 'Kayıt bulunamadı']);
    }
    write_data($data);
    send_json(200, ['deleted' => true]);
}

send_json(404, ['error' => 'Bilinmeyen endpoint']);
