<?php

declare(strict_types=1);

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/';

if (strpos($path, '/api/') === 0) {
    require __DIR__ . '/api/index.php';
    return true;
}

$publicPath = __DIR__ . '/public' . $path;

if ($path !== '/' && is_file($publicPath)) {
    return false;
}

require __DIR__ . '/public/index.php';
