    </main>
    
    <!-- Loading Overlay -->
    <div class="loading-overlay" id="loading-overlay">
        <div class="spinner"></div>
        <div style="margin-top: 20px;">Loading...</div>
    </div>

    <!-- API Status Indicator -->
    <div class="api-status connected" id="api-status">
        <span class="status-indicator"></span>
        <span id="api-status-text">Connected to API</span>
    </div>

    <script>
        // Global logout function
        function logout() {
            if (confirm('Are you sure you want to logout?')) {
                window.location.href = '/logout.php';
            }
        }

        // API Configuration
        const API_CONFIG = {
            BASE_URL: '<?php echo API_BASE_URL; ?>',
            ENDPOINTS: {
                AUTH: '/auth/verify',
                LOGOUT: '/auth/logout',
                POSTS: '/posts',
                FEED: '/posts/feed',
                TRENDING: '/trending',
                SUGGESTIONS: '/users/suggestions',
                USER_PROFILE: '/users/profile',
                FOLLOW: '/users/follow',
                BOOKMARKS: '/bookmarks',
                DISCOVER: '/discover',
                SEARCH: '/search'
            },
            TIMEOUT: 10000
        };
    </script>
    
    <?php echo $extraScripts ?? ''; ?>
</body>
</html>