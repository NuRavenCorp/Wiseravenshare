<?php
require_once __DIR__ . '/../config/functions.php';
$currentUser = getCurrentUser();

if (!isLoggedIn()) {
    redirect('/login.php', 'Please login to continue', 'warning');
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WiseRaven - <?php echo $pageTitle ?? 'Dashboard'; ?></title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="/assets/css/style.css">
    <?php if (isset($extraStyles)) echo $extraStyles; ?>
</head>
<body>
    <header>
        <div class="header-container">
            <h1><i class="fas fa-crow"></i> Wise-Raven</h1>
            <div class="user-controls">
                <?php if ($currentUser): ?>
                    <?php if (isAdmin()): ?>
                        <span class="admin-badge">
                            <i class="fas fa-shield-alt"></i> <?php echo e($currentUser['role']); ?>
                        </span>
                    <?php endif; ?>
                    <span id="username-display">Welcome, <?php echo e($currentUser['username']); ?></span>
                    <?php if (isAdmin()): ?>
                        <a href="/admin/index.php" class="btn-admin">
                            <i class="fas fa-cog"></i> Admin
                        </a>
                    <?php endif; ?>
                    <button id="logout-btn" onclick="logout()">Logout</button>
                <?php endif; ?>
            </div>
        </div>
    </header>
    <main>