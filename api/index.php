<?php

declare(strict_types=1);

$storageDir = realpath(__DIR__ . '/../storage');
$config = loadJson($storageDir . '/config.json', [
    'siteName' => 'Projet E6 - Bassin Connecte',
    'auth' => [
        'salt' => 'e6-salt-2026',
        'sessionName' => 'e6_session',
    ],
    'metrics' => [
        'historyLimit' => 120,
        'sampleIntervalSeconds' => 10,
    ],
]);

if (!empty($config['auth']['sessionName'])) {
    session_name((string) $config['auth']['sessionName']);
}

session_start();

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$path = preg_replace('#^/api#', '', $path);
$segments = array_values(array_filter(explode('/', trim($path, '/'))));

if (count($segments) === 0 || $segments[0] !== 'v1') {
    errorResponse('Unknown API version', 404);
}

$resource = $segments[1] ?? '';
$sub = $segments[2] ?? '';
$sub2 = $segments[3] ?? '';

switch ($resource) {
    case 'metrics':
        handleMetrics($method, $sub, $storageDir, $config);
        break;
    case 'thresholds':
        handleThresholds($method, $storageDir);
        break;
    case 'actuators':
        handleActuators($method, $sub, $storageDir);
        break;
    case 'alerts':
        handleAlerts($method, $storageDir);
        break;
    case 'auth':
        handleAuth($method, $sub, $storageDir, $config);
        break;
    case 'logs':
        handleLogs($method, $sub, $storageDir);
        break;
    default:
        errorResponse('Unknown endpoint', 404);
}

function handleMetrics(string $method, string $sub, string $storageDir, array $config): void
{
    if ($method !== 'GET') {
        errorResponse('Method not allowed', 405);
    }

    if ($sub === 'latest') {
        $metric = createMetricSample($storageDir, $config);
        jsonResponse($metric);
    }

    if ($sub === 'history') {
        $history = loadJson($storageDir . '/metrics.json', []);
        $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 60;
        if ($limit > 0) {
            $history = array_slice($history, -$limit);
        }
        jsonResponse(['items' => $history]);
    }

    errorResponse('Unknown metrics endpoint', 404);
}

function handleThresholds(string $method, string $storageDir): void
{
    if ($method === 'GET') {
        $thresholds = loadJson($storageDir . '/thresholds.json', []);
        jsonResponse($thresholds);
    }

    if ($method === 'POST') {
        requireAuth();
        $payload = requestJson();
        if (!is_array($payload)) {
            errorResponse('Invalid payload', 400);
        }
        $validated = normalizeThresholds($payload);
        saveJson($storageDir . '/thresholds.json', $validated);
        jsonResponse(['status' => 'ok', 'thresholds' => $validated]);
    }

    errorResponse('Method not allowed', 405);
}

function handleActuators(string $method, string $device, string $storageDir): void
{
    if (!in_array($device, ['pump', 'heater'], true)) {
        errorResponse('Unknown actuator', 404);
    }

    $actuators = loadJson($storageDir . '/actuators.json', []);
    $current = $actuators[$device] ?? [
        'state' => 'off',
        'mode' => 'auto',
        'lastChanged' => gmdate('Y-m-d\TH:i:s\Z'),
    ];

    if ($method === 'GET') {
        jsonResponse($current);
    }

    if ($method === 'POST') {
        requireAuth();
        $payload = requestJson();
        if (!is_array($payload)) {
            errorResponse('Invalid payload', 400);
        }

        $state = isset($payload['state']) ? (string) $payload['state'] : $current['state'];
        $mode = isset($payload['mode']) ? (string) $payload['mode'] : $current['mode'];
        $state = $state === 'on' ? 'on' : 'off';
        $mode = $mode === 'manual' ? 'manual' : 'auto';

        $updated = [
            'state' => $state,
            'mode' => $mode,
            'lastChanged' => gmdate('Y-m-d\TH:i:s\Z'),
        ];

        $actuators[$device] = $updated;
        saveJson($storageDir . '/actuators.json', $actuators);

        $user = $_SESSION['user']['username'] ?? 'system';
        logActuator($storageDir . '/logs/actuators.log', $device, $state, $mode, $user);

        jsonResponse(['status' => 'ok', 'actuator' => $updated]);
    }

    errorResponse('Method not allowed', 405);
}

function handleAlerts(string $method, string $storageDir): void
{
    if ($method !== 'GET') {
        errorResponse('Method not allowed', 405);
    }

    $alerts = loadJson($storageDir . '/alerts.json', []);
    $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 50;
    if ($limit > 0) {
        $alerts = array_slice($alerts, -$limit);
    }
    jsonResponse(['items' => $alerts]);
}

function handleAuth(string $method, string $sub, string $storageDir, array $config): void
{
    if ($sub === 'me' && $method === 'GET') {
        $user = $_SESSION['user'] ?? null;
        jsonResponse(['user' => $user]);
    }

    if ($sub === 'login' && $method === 'POST') {
        $payload = requestJson();
        if (!is_array($payload)) {
            errorResponse('Invalid payload', 400);
        }

        $username = trim((string) ($payload['username'] ?? ''));
        $password = (string) ($payload['password'] ?? '');
        if ($username === '' || $password === '') {
            errorResponse('Missing credentials', 400);
        }

        $users = loadJson($storageDir . '/users.json', []);
        $user = null;
        foreach ($users as $candidate) {
            if (isset($candidate['username']) && strtolower($candidate['username']) === strtolower($username)) {
                $user = $candidate;
                break;
            }
        }

        if (!$user) {
            errorResponse('Invalid credentials', 401);
        }

        $salt = (string) ($config['auth']['salt'] ?? 'e6-salt-2026');
        $hash = hash('sha256', $salt . $password);
        if (!hash_equals((string) ($user['passwordHash'] ?? ''), $hash)) {
            errorResponse('Invalid credentials', 401);
        }

        session_regenerate_id(true);
        $_SESSION['user'] = [
            'username' => $user['username'],
            'role' => $user['role'] ?? 'viewer',
            'displayName' => $user['displayName'] ?? $user['username'],
        ];

        jsonResponse(['status' => 'ok', 'user' => $_SESSION['user']]);
    }

    if ($sub === 'logout' && $method === 'POST') {
        $_SESSION = [];
        if (session_id() !== '') {
            session_destroy();
        }
        jsonResponse(['status' => 'ok']);
    }

    errorResponse('Unknown auth endpoint', 404);
}

function handleLogs(string $method, string $sub, string $storageDir): void
{
    if ($method !== 'GET') {
        errorResponse('Method not allowed', 405);
    }

    if ($sub !== 'actuators') {
        errorResponse('Unknown log', 404);
    }

    $logPath = $storageDir . '/logs/actuators.log';
    $lines = [];
    if (is_file($logPath)) {
        $content = trim((string) file_get_contents($logPath));
        if ($content !== '') {
            $lines = array_slice(explode("\n", $content), -80);
        }
    }

    jsonResponse(['items' => $lines]);
}

function createMetricSample(string $storageDir, array $config): array
{
    $history = loadJson($storageDir . '/metrics.json', []);
    $last = end($history);
    if (!is_array($last)) {
        $last = [
            'temperature' => 24.0,
            'ph' => 7.2,
            'turbidity' => 14.0,
            'water_level' => 78.0,
            'humidity' => 52.0,
        ];
    }

    $metric = [
        'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
        'temperature' => clamp($last['temperature'] + randFloat(-0.4, 0.5), 20.0, 30.0),
        'ph' => clamp($last['ph'] + randFloat(-0.06, 0.06), 6.5, 8.2),
        'turbidity' => clamp($last['turbidity'] + randFloat(-1.2, 1.3), 6.0, 35.0),
        'water_level' => clamp($last['water_level'] + randFloat(-1.5, 1.2), 40.0, 95.0),
        'humidity' => clamp($last['humidity'] + randFloat(-2.2, 2.0), 30.0, 80.0),
    ];

    foreach ($metric as $key => $value) {
        if ($key !== 'timestamp') {
            $metric[$key] = round((float) $value, 2);
        }
    }

    $history[] = $metric;
    $limit = (int) ($config['metrics']['historyLimit'] ?? 120);
    if ($limit > 0 && count($history) > $limit) {
        $history = array_slice($history, -$limit);
    }

    saveJson($storageDir . '/metrics.json', $history);
    refreshAlerts($storageDir, $metric);

    return $metric;
}

function refreshAlerts(string $storageDir, array $metric): void
{
    $thresholds = loadJson($storageDir . '/thresholds.json', []);
    $alerts = loadJson($storageDir . '/alerts.json', []);

    $newAlerts = [];
    $now = gmdate('Y-m-d\TH:i:s\Z');
    $cooldownSeconds = 300;

    $checks = [
        'temperature' => ['label' => 'Temperature', 'min' => $thresholds['temperature']['min'] ?? null, 'max' => $thresholds['temperature']['max'] ?? null],
        'ph' => ['label' => 'pH', 'min' => $thresholds['ph']['min'] ?? null, 'max' => $thresholds['ph']['max'] ?? null],
        'turbidity' => ['label' => 'Turbidity', 'min' => null, 'max' => $thresholds['turbidity']['max'] ?? null],
        'water_level' => ['label' => 'Water level', 'min' => $thresholds['water_level']['min'] ?? null, 'max' => $thresholds['water_level']['max'] ?? null],
        'humidity' => ['label' => 'Humidity', 'min' => $thresholds['humidity']['min'] ?? null, 'max' => $thresholds['humidity']['max'] ?? null],
    ];

    foreach ($checks as $key => $meta) {
        $value = $metric[$key] ?? null;
        if ($value === null) {
            continue;
        }

        $min = $meta['min'];
        $max = $meta['max'];
        $out = false;
        $direction = '';

        if ($min !== null && $value < $min) {
            $out = true;
            $direction = 'low';
        }
        if ($max !== null && $value > $max) {
            $out = true;
            $direction = 'high';
        }

        if (!$out) {
            continue;
        }

        $lastAlert = findLastAlert($alerts, $key);
        if ($lastAlert && (time() - strtotime($lastAlert['timestamp'])) < $cooldownSeconds) {
            continue;
        }

        $severity = 'warning';
        if (($min !== null && $value < $min * 0.9) || ($max !== null && $value > $max * 1.1)) {
            $severity = 'critical';
        }

        $message = $meta['label'] . ' is ' . $direction . ' (' . $value . ')';
        $newAlerts[] = [
            'id' => uniqid('alert_', true),
            'timestamp' => $now,
            'type' => $key,
            'severity' => $severity,
            'message' => $message,
        ];
    }

    if (!empty($newAlerts)) {
        $alerts = array_merge($alerts, $newAlerts);
        if (count($alerts) > 200) {
            $alerts = array_slice($alerts, -200);
        }
        saveJson($storageDir . '/alerts.json', $alerts);
    }
}

function findLastAlert(array $alerts, string $type): ?array
{
    for ($i = count($alerts) - 1; $i >= 0; $i--) {
        if (($alerts[$i]['type'] ?? '') === $type) {
            return $alerts[$i];
        }
    }
    return null;
}

function logActuator(string $path, string $device, string $state, string $mode, string $user): void
{
    $line = gmdate('Y-m-d\TH:i:s\Z') . "\t" . $device . "\t" . $state . "\t" . $mode . "\t" . $user . "\n";
    file_put_contents($path, $line, FILE_APPEND | LOCK_EX);
}

function normalizeThresholds(array $payload): array
{
    $keys = ['temperature', 'ph', 'turbidity', 'water_level', 'humidity'];
    $units = [
        'temperature' => 'C',
        'turbidity' => 'NTU',
        'water_level' => '%',
        'humidity' => '%',
    ];

    $normalized = [];
    foreach ($keys as $key) {
        $entry = $payload[$key] ?? [];
        if (!is_array($entry)) {
            $entry = [];
        }

        $min = isset($entry['min']) ? (float) $entry['min'] : null;
        $max = isset($entry['max']) ? (float) $entry['max'] : null;
        if ($min !== null && $max !== null && $min > $max) {
            $tmp = $min;
            $min = $max;
            $max = $tmp;
        }

        $normalized[$key] = array_filter([
            'min' => $min,
            'max' => $max,
            'unit' => $units[$key] ?? null,
        ], static fn ($value) => $value !== null);
    }

    return $normalized;
}

function requestJson(): ?array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function requireAuth(): void
{
    if (empty($_SESSION['user'])) {
        errorResponse('Unauthorized', 401);
    }
}

function loadJson(string $path, $default)
{
    if (!is_file($path)) {
        return $default;
    }
    $raw = file_get_contents($path);
    if ($raw === false) {
        return $default;
    }
    $decoded = json_decode($raw, true);
    return $decoded === null ? $default : $decoded;
}

function saveJson(string $path, $data): void
{
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    file_put_contents($path, $json . "\n", LOCK_EX);
}

function jsonResponse($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

function errorResponse(string $message, int $status): void
{
    jsonResponse(['error' => $message], $status);
}

function clamp(float $value, float $min, float $max): float
{
    return max($min, min($max, $value));
}

function randFloat(float $min, float $max): float
{
    return $min + (mt_rand() / mt_getrandmax()) * ($max - $min);
}
