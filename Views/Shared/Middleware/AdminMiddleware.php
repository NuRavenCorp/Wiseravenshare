<?php
// Start session if not already started
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Include auth system
require_once __DIR__ . '/admin_auth.php';

// Initialize auth
$db = getDBConnection();
$auth = new AdminAuth($db);

// Check if current user is admin
function isAdmin() {
    global $auth;
    if (!$auth->isAuthenticated()) {
        return false;
    }
    
    $user = $auth->getCurrentUser();
    return $user && $user['role'] === 'admin';
}

// Check if current user is moderator or admin
function isModerator() {
    global $auth;
    if (!$auth->isAuthenticated()) {
        return false;
    }
    
    $user = $auth->getCurrentUser();
    return $user && in_array($user['role'], ['admin', 'moderator']);
}

// Get current user with admin check
function getAdminUser() {
    global $auth;
    if (!$auth->isAuthenticated()) {
        return null;
    }
    
    $user = $auth->getCurrentUser();
    if ($user && in_array($user['role'], ['admin', 'moderator'])) {
        return $user;
    }
    
    return null;
}

// Add admin controls to pages if user is admin
function renderAdminControls($page = null) {
    $user = getAdminUser();
    if (!$user) return '';
    
    $controls = '';
    
    switch ($page) {
        case 'index':
            $controls = '
                <div class="admin-quick-actions">
                    <button class="btn btn-sm btn-outline-warning" onclick="adminToggleEditMode()">
                        <i class="fas fa-edit"></i> Edit Mode
                    </button>
                    <button class="btn btn-sm btn-outline-info" onclick="adminViewAnalytics()">
                        <i class="fas fa-chart-bar"></i> Analytics
                    </button>
                    <a href="/admin/index.php" class="btn btn-sm btn-outline-primary">
                        <i class="fas fa-cog"></i> Admin Panel
                    </a>
                </div>
            ';
            break;
            
        case 'planner':
            $controls = '
                <div class="admin-quick-actions">
                    <button class="btn btn-sm btn-outline-warning" onclick="adminExportPlannerData()">
                        <i class="fas fa-download"></i> Export Data
                    </button>
                    <button class="btn btn-sm btn-outline-info" onclick="adminViewUserGoals()">
                        <i class="fas fa-eye"></i> View All Goals
                    </button>
                </div>
            ';
            break;
            
        case 'messages':
            $controls = '
                <div class="admin-quick-actions">
                    <button class="btn btn-sm btn-outline-warning" onclick="adminMonitorConversations()">
                        <i class="fas fa-shield-alt"></i> Monitor
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="adminFlagConversation()">
                        <i class="fas fa-flag"></i> Flag
                    </button>
                </div>
            ';
            break;
            
        case 'notifications':
            $controls = '
                <div class="admin-quick-actions">
                    <button class="btn btn-sm btn-outline-warning" onclick="adminClearAllNotifications()">
                        <i class="fas fa-trash"></i> Clear All
                    </button>
                    <button class="btn btn-sm btn-outline-info" onclick="adminNotificationStats()">
                        <i class="fas fa-chart-pie"></i> Stats
                    </button>
                </div>
            ';
            break;
            
        default:
            $controls = '
                <div class="admin-quick-actions">
                    <a href="/admin/index.php" class="btn btn-sm btn-outline-primary">
                        <i class="fas fa-cog"></i> Admin Panel
                    </a>
                </div>
            ';
    }
    
    return '
        <div class="admin-controls-overlay">
            <div class="admin-controls">
                <span class="admin-badge">' . htmlspecialchars($user['role']) . '</span>
                ' . $controls . '
            </div>
        </div>
    ';
}

// Add admin CSS
function addAdminStyles() {
    return '
        <style>
            .admin-controls-overlay {
                position: fixed;
                top: 10px;
                right: 10px;
                z-index: 9999;
            }
            
            .admin-controls {
                background: rgba(26, 31, 43, 0.9);
                border: 1px solid #4a5568;
                border-radius: 8px;
                padding: 10px;
                backdrop-filter: blur(10px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            }
            
            .admin-badge {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 0.8rem;
                font-weight: bold;
                margin-right: 10px;
            }
            
            .admin-quick-actions {
                display: inline-flex;
                gap: 5px;
            }
            
            .admin-quick-actions .btn {
                font-size: 0.75rem;
                padding: 3px 8px;
            }
            
            .admin-edit-mode .editable {
                outline: 2px dashed rgba(245, 158, 11, 0.5);
                position: relative;
            }
            
            .admin-edit-mode .editable:hover::after {
                content: "✏️ Editable";
                position: absolute;
                top: -20px;
                right: 0;
                background: #f59e0b;
                color: white;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 0.7rem;
            }
        </style>
    ';
}

// Add admin JavaScript functions
function addAdminScripts() {
    return '
        <script>
            // Admin functions
            function adminToggleEditMode() {
                document.body.classList.toggle("admin-edit-mode");
                const isEditMode = document.body.classList.contains("admin-edit-mode");
                alert("Edit mode " + (isEditMode ? "enabled" : "disabled"));
            }
            
            function adminViewAnalytics() {
                window.open("/admin/analytics.php", "_blank");
            }
            
            function adminExportPlannerData() {
                fetch("/admin/api/export-planner.php", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": "Bearer " + localStorage.getItem("admin_token")
                    }
                })
                .then(response => response.blob())
                .then(blob => {
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "planner-data-export.csv";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                })
                .catch(error => console.error("Export failed:", error));
            }
            
            function adminMonitorConversations() {
                const modal = document.createElement("div");
                modal.className = "admin-modal";
                modal.innerHTML = `
                    <div class="admin-modal-content">
                        <h3>Conversation Monitor</h3>
                        <div id="conversation-monitor"></div>
                        <button onclick="this.closest(\'.admin-modal\').remove()">Close</button>
                    </div>
                `;
                document.body.appendChild(modal);
                
                // Fetch conversation data
                fetch("/admin/api/monitor-conversations.php")
                    .then(response => response.json())
                    .then(data => {
                        // Display conversation data
                        console.log("Conversation data:", data);
                    });
            }
            
            // Initialize admin token
            if (localStorage.getItem("wise-raven-token")) {
                fetch("/admin/api/verify-admin.php", {
                    headers: {
                        "Authorization": "Bearer " + localStorage.getItem("wise-raven-token")
                    }
                })
                .then(response => response.json())
                .then(data => {
                    if (data.isAdmin) {
                        localStorage.setItem("admin_token", data.adminToken);
                    }
                });
            }
            
            // Make elements editable in edit mode
            document.addEventListener("click", function(e) {
                if (document.body.classList.contains("admin-edit-mode") && 
                    e.target.classList.contains("editable")) {
                    const currentText = e.target.textContent;
                    const newText = prompt("Edit content:", currentText);
                    if (newText !== null) {
                        e.target.textContent = newText;
                        
                        // Save to server
                        fetch("/admin/api/save-content.php", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                elementId: e.target.id,
                                content: newText,
                                page: window.location.pathname
                            })
                        });
                    }
                }
            });
        </script>
    ';
}

// Check if current page should show admin controls
$currentPage = basename($_SERVER['PHP_SELF']);
$pagesWithAdmin = ['index.php', 'planner.php', 'messages.php', 'notification.php'];

if (in_array($currentPage, $pagesWithAdmin) && getAdminUser()) {
    // Add admin controls to page
    echo addAdminStyles();
    echo renderAdminControls(str_replace('.php', '', $currentPage));
    
    // Add admin scripts before closing body tag
    function addAdminScriptsToFooter() {
        echo addAdminScripts();
    }
    
    // Register shutdown function to add scripts
    register_shutdown_function('addAdminScriptsToFooter');
}
?>