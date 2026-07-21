<?php
require_once 'config/functions.php';

$pageTitle = 'Notifications';
$currentUser = getCurrentUser();

if (!isLoggedIn()) {
    redirect('/login.php');
}

$extraStyles = '';
$extraScripts = '
    <script src="/assets/js/notifications.js"></script>
';
?>
<?php include 'includes/header.php'; ?>

<div class="container">
    <div class="notification-header">
        <h2 class="notification-title">Notifications</h2>
        <div class="notification-actions">
            <button class="mark-all-read-btn" id="markAllReadBtn">
                <i class="fas fa-check-double"></i> Mark all as read
            </button>
        </div>
    </div>

    <div class="filter-tabs" id="filterTabs">
        <button class="filter-tab active" data-filter="all">All</button>
        <button class="filter-tab" data-filter="unread">Unread</button>
        <button class="filter-tab" data-filter="likes">
            <i class="fas fa-heart"></i> Likes
            <span class="notification-count" id="likeCount">0</span>
        </button>
        <button class="filter-tab" data-filter="comments">
            <i class="fas fa-comment"></i> Comments
            <span class="notification-count" id="commentCount">0</span>
        </button>
        <button class="filter-tab" data-filter="follows">
            <i class="fas fa-user-plus"></i> Follows
            <span class="notification-count" id="followCount">0</span>
        </button>
        <button class="filter-tab" data-filter="mentions">
            <i class="fas fa-at"></i> Mentions
            <span class="notification-count" id="mentionCount">0</span>
        </button>
    </div>

    <div class="notification-list" id="notificationList">
        <!-- Notifications loaded via API -->
        <div class="loading-skeleton">
            <div class="skeleton-avatar"></div>
            <div class="skeleton-content">
                <div class="skeleton-line medium"></div>
                <div class="skeleton-line short"></div>
                <div class="skeleton-line" style="width: 30%;"></div>
            </div>
        </div>
    </div>
</div>

<!-- Alert Container -->
<div id="alertContainer"></div>

<?php include 'includes/footer.php'; ?>