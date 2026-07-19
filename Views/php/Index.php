<?php
require_once 'config/functions.php';

$pageTitle = 'Feed';
$currentUser = getCurrentUser();

// If not logged in, redirect to login
if (!isLoggedIn()) {
    redirect('/login.php');
}

$extraStyles = '';
$extraScripts = '
    <script src="/assets/js/feed.js"></script>
';
?>
<?php include 'includes/header.php'; ?>

<div class="container">
    <nav class="left-column">
        <div class="user-profile">
            <img id="profile-picture" src="<?php echo e($currentUser['avatar'] ?? '/assets/images/default-avatar.jpg'); ?>" 
                 alt="Profile Picture" class="profile-pic">
            <h3 id="profile-name"><?php echo e($currentUser['username']); ?></h3>
            <div class="stats">
                <span><i class="fas fa-users"></i> <span id="follower-count">0</span> followers</span>
                <span><i class="fas fa-user-friends"></i> <span id="following-count">0</span> following</span>
            </div>
        </div>
        <ul class="nav-menu">
            <li><a href="index.php" class="active" data-section="feed"><i class="fas fa-home"></i> Feed</a></li>
            <li><a href="discover.php" data-section="discover" id="discover-link"><i class="fas fa-compass"></i> Discover</a></li>
            <li><a href="notifications.php" data-section="notifications"><i class="fas fa-bell"></i> Notifications</a></li>
            <li><a href="messages.php" data-section="messages"><i class="fas fa-envelope"></i> Messages</a></li>
            <li><a href="bookmarks.php" data-section="bookmarks" id="bookmarks-link"><i class="fas fa-bookmark"></i> Bookmarks</a></li>
            <li><a href="profile.php" data-section="profile"><i class="fas fa-user"></i> Profile</a></li>
            <li><a href="planner.php" data-section="planner"><i class="fas fa-tasks"></i> Planner</a></li>
        </ul>
    </nav>

    <section class="middle-column">
        <!-- Alert Messages -->
        <div id="alert-container">
            <?php echo displayFlashMessage(); ?>
        </div>

        <div class="post-creator">
            <div class="post-input">
                <img id="current-user-avatar" src="<?php echo e($currentUser['avatar'] ?? '/assets/images/default-avatar.jpg'); ?>" 
                     alt="Your profile" class="small-profile-pic">
                <textarea placeholder="What wisdom do you share today?" id="post-content" maxlength="500"></textarea>
            </div>

            <div class="file-upload-options">
                <div class="upload-option" data-type="photo">
                    <i class="fas fa-image"></i>
                    <span>Photo</span>
                </div>
                <div class="upload-option" data-type="video">
                    <i class="fas fa-video"></i>
                    <span>Video</span>
                </div>
                <div class="upload-option" data-type="audio">
                    <i class="fas fa-music"></i>
                    <span>Audio</span>
                </div>
                <div class="upload-option" data-type="document">
                    <i class="fas fa-file"></i>
                    <span>Document</span>
                </div>
            </div>

            <div class="file-preview" id="file-preview"></div>

            <div class="post-actions">
                <div class="character-count">
                    <span id="char-count">0</span>/500
                </div>
                <button id="create-post-btn"><i class="fas fa-feather-alt"></i> Post</button>
            </div>
        </div>

        <div class="feed" id="post-feed">
            <!-- Posts loaded via API -->
            <div class="skeleton-post">
                <div class="post">
                    <div class="post-header">
                        <div class="skeleton skeleton-avatar"></div>
                        <div style="flex: 1; margin-left: 10px;">
                            <div class="skeleton skeleton-text" style="width: 30%;"></div>
                            <div class="skeleton skeleton-text" style="width: 20%;"></div>
                        </div>
                    </div>
                    <div class="post-content">
                        <div class="skeleton skeleton-text"></div>
                        <div class="skeleton skeleton-text"></div>
                        <div class="skeleton skeleton-text" style="width: 60%;"></div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <aside class="right-column">
        <div class="search-box">
            <input type="text" placeholder="Search Wise-Raven..." id="search-input">
            <button id="search-btn"><i class="fas fa-search"></i></button>
        </div>

        <div class="trending-section">
            <h3>Trending Now</h3>
            <div class="trending-topics" id="trending-topics">
                <!-- Loaded via API -->
            </div>
            <div class="algorithm-info">
                <i class="fas fa-brain"></i> Powered by Trend Analysis Algorithm
            </div>
        </div>

        <div class="suggested-users">
            <h3>Who to Follow</h3>
            <div class="user-suggestions" id="user-suggestions">
                <!-- Loaded via API -->
            </div>
            <div class="algorithm-info">
                <i class="fas fa-code-branch"></i> Based on your interests & network
            </div>
        </div>

        <div class="quick-stats">
            <h3>Your Activity</h3>
            <div class="stats-grid">
                <div class="stat-item">
                    <i class="fas fa-fire"></i>
                    <span>Weekly Engagement: <strong id="weekly-engagement">0</strong></span>
                </div>
                <div class="stat-item">
                    <i class="fas fa-trend-up"></i>
                    <span>Trending Score: <strong id="trending-score">0</strong></span>
                </div>
            </div>
        </div>
    </aside>
</div>

<!-- File Upload Modal -->
<div id="file-upload-modal" class="modal">
    <div class="modal-content">
        <span class="close-btn">&times;</span>
        <h3>Upload File</h3>
        <div id="upload-options">
            <div class="upload-method">
                <h4>Select Upload Method</h4>
                <div class="upload-options-grid">
                    <div class="upload-method-option" data-method="device">
                        <i class="fas fa-mobile-alt"></i>
                        <span>Device Storage</span>
                    </div>
                    <div class="upload-method-option" data-method="bluetooth">
                        <i class="fas fa-bluetooth"></i>
                        <span>Bluetooth</span>
                    </div>
                    <div class="upload-method-option" data-method="wifi">
                        <i class="fas fa-wifi"></i>
                        <span>Wi-Fi Direct</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<?php include 'includes/footer.php'; ?>