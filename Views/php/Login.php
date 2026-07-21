<?php
require_once 'config/functions.php';

// If already logged in, redirect to index
if (isLoggedIn()) {
    redirect('/index.php');
}

$pageTitle = 'Login';
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = $_POST['username'] ?? '';
    $password = $_POST['password'] ?? '';
    
    // This is a simplified example - in production, you'd validate against database
    if ($username === 'admin' && $password === 'password') {
        $_SESSION['user_id'] = 1;
        $_SESSION['username'] = $username;
        $_SESSION['role'] = 'admin';
        $_SESSION['email'] = 'admin@example.com';
        redirect('/index.php', 'Welcome back!', 'success');
    } else {
        $error = 'Invalid username or password';
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WiseRaven - Login</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary-color: #1a1f2b;
            --secondary-color: #2d3748;
            --accent-color: #4a5568;
            --highlight-color: #718096;
            --light-color: #e2e8f0;
            --text-color: #f8fafc;
            --bg-color: #0f1419;
            --card-bg: #1e293b;
            --border-color: #334155;
            --error-color: #ef4444;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
            color: var(--text-color);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .login-container {
            background: var(--card-bg);
            border-radius: 20px;
            padding: 40px;
            width: 100%;
            max-width: 400px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            border: 1px solid var(--border-color);
        }

        .login-header {
            text-align: center;
            margin-bottom: 30px;
        }

        .login-header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            color: var(--light-color);
        }

        .login-header i {
            color: var(--highlight-color);
            margin-right: 10px;
        }

        .login-header p {
            color: var(--highlight-color);
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            color: var(--light-color);
            font-weight: 500;
        }

        .form-input {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid var(--border-color);
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-color);
            font-size: 1rem;
            transition: all 0.3s ease;
        }

        .form-input:focus {
            outline: none;
            border-color: var(--highlight-color);
            box-shadow: 0 0 0 3px rgba(113, 128, 150, 0.3);
        }

        .btn-login {
            width: 100%;
            padding: 12px;
            background: var(--highlight-color);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }

        .btn-login:hover {
            background: var(--light-color);
            color: var(--primary-color);
            transform: translateY(-2px);
        }

        .alert-error {
            background-color: rgba(239, 68, 68, 0.2);
            border-left: 4px solid var(--error-color);
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            color: var(--text-color);
        }

        .demo-credentials {
            margin-top: 20px;
            padding: 15px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
            border: 1px solid var(--border-color);
        }

        .demo-credentials h4 {
            margin-bottom: 10px;
            color: var(--light-color);
        }

        .demo-credentials p {
            font-size: 0.9rem;
            color: var(--highlight-color);
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="login-header">
            <h1><i class="fas fa-crow"></i> Wise-Raven</h1>
            <p>Login to your account</p>
        </div>

        <?php if ($error): ?>
            <div class="alert-error">
                <i class="fas fa-exclamation-circle"></i>
                <?php echo e($error); ?>
            </div>
        <?php endif; ?>

        <?php echo displayFlashMessage(); ?>

        <form method="POST" action="">
            <input type="hidden" name="csrf_token" value="<?php echo generateCSRFToken(); ?>">
            
            <div class="form-group">
                <label for="username">Username</label>
                <input type="text" id="username" name="username" class="form-input" required>
            </div>

            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" class="form-input" required>
            </div>

            <button type="submit" class="btn-login">
                <i class="fas fa-sign-in-alt"></i> Login
            </button>
        </form>

        <div class="demo-credentials">
            <h4>Demo Credentials</h4>
            <p>Username: admin</p>
            <p>Password: password</p>
        </div>
    </div>
</body>
</html>