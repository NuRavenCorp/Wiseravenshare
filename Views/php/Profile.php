<?php
require_once 'config/functions.php';

$pageTitle = 'Profile';
$currentUser = getCurrentUser();

if (!isLoggedIn()) {
    redirect('/login.php');
}

// Get profile user ID from URL parameter or show current user
$profileUserId = isset($_GET['id']) ? (int)$_GET['id'] : $currentUser['id'];

$extraStyles = '';
$extraScripts = '
    <script src="/assets/js/profile.js"></script>
';
?>
<?php include 'includes/header.php'; ?>

<div class="container">
    <div class="profile-header">
        <div class="profile-picture-container">
            <img id="profilePicture" src="<?php echo e($currentUser['avatar'] ?? '/assets/images/default-avatar.jpg'); ?>" 
                 alt="Profile Picture" class="profile-picture">
            <button class="change-photo-btn" id="changePhotoBtn">+</button>
        </div>

        <div class="profile-info">
            <h1 class="profile-name" id="userName"><?php echo e($currentUser['username']); ?></h1>
            <p class="profile-bio" id="userBio">Digital creator | Photography enthusiast | Exploring the world one pixel at a time</p>

            <div class="profile-stats">
                <div class="stat-item">
                    <div class="stat-number" id="postCount">247</div>
                    <div class="stat-label">Posts</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number" id="followerCount">1.2K</div>
                    <div class="stat-label">Followers</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number" id="followingCount">583</div>
                    <div class="stat-label">Following</div>
                </div>
            </div>

            <div class="action-buttons">
                <button class="btn btn-primary" id="editProfileBtn">Edit Profile</button>
                <button class="btn btn-secondary" id="takePhotoBtn">Take Photo</button>
            </div>
        </div>
    </div>

    <div class="profile-content">
        <div class="sidebar">
            <div class="sidebar-section">
                <h3 class="sidebar-title">About</h3>
                <div id="userAbout">
                    <p><strong>Location:</strong> San Francisco, CA</p>
                    <p><strong>Joined:</strong> January 2023</p>
                    <p><strong>Interests:</strong> Photography, Travel, Technology</p>
                </div>
            </div>

            <div class="sidebar-section">
                <h3 class="sidebar-title">Links</h3>
                <div id="userLinks">
                    <p><a href="#" target="_blank" style="color: var(--highlight-color);">portfolio.example.com</a></p>
                    <p><a href="#" target="_blank" style="color: var(--highlight-color);">twitter.com/wiseraven</a></p>
                </div>
            </div>

            <div class="sidebar-section">
                <h3 class="sidebar-title">Connected Devices</h3>
                <div id="connectedDevices">
                    <p><i class="fas fa-laptop" style="color: var(--highlight-color); margin-right: 8px;"></i> MacBook Pro</p>
                    <p><i class="fas fa-mobile-alt" style="color: var(--highlight-color); margin-right: 8px;"></i> iPhone 13</p>
                    <p><i class="fas fa-tablet-alt" style="color: var(--highlight-color); margin-right: 8px;"></i> iPad Air</p>
                </div>
            </div>
        </div>

        <div class="main-content">
            <div class="photo-section">
                <h3 class="sidebar-title">Recent Photos</h3>
                <div class="photo-grid" id="photoGrid">
                    <!-- Photos will be loaded here dynamically -->
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Profile Picture Upload Modal -->
<div class="modal" id="profilePicModal">
    <div class="modal-content">
        <span class="close-modal">&times;</span>
        <h3 class="modal-title">Update Profile Picture</h3>

        <div class="upload-options">
            <div class="upload-option" data-type="device">
                <i class="fas fa-folder-open"></i>
                <span>Device</span>
            </div>
            <div class="upload-option" data-type="camera">
                <i class="fas fa-camera"></i>
                <span>Camera</span>
            </div>
            <div class="upload-option" data-type="bluetooth">
                <i class="fas fa-bluetooth"></i>
                <span>Bluetooth</span>
            </div>
            <div class="upload-option" data-type="wifi">
                <i class="fas fa-wifi"></i>
                <span>Wi-Fi</span>
            </div>
        </div>

        <div id="cameraSection" style="display: none;">
            <video id="cameraPreview" autoplay playsinline></video>
            <img id="capturedProfileImage" style="display: none; max-width: 100%; border-radius: 8px;">
            <div class="modal-buttons">
                <button class="btn btn-primary" id="captureProfilePhoto">Capture</button>
                <button class="btn btn-secondary" id="retakeProfilePhoto" style="display: none;">Retake</button>
                <button class="btn btn-primary" id="saveProfilePhoto" style="display: none;">Save</button>
            </div>
        </div>

        <div id="uploadSection" style="display: none;">
            <input type="file" id="profilePhotoUpload" accept="image/*" style="display: none;">
            <div class="modal-buttons">
                <button class="btn btn-primary" id="selectPhotoBtn">Select Photo</button>
                <button class="btn btn-primary" id="confirmUpload">Upload</button>
            </div>
        </div>
    </div>
</div>

<?php include 'includes/footer.php'; ?>