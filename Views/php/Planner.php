<?php
require_once 'config/functions.php';

$pageTitle = 'Planner';
$currentUser = getCurrentUser();

if (!isLoggedIn()) {
    redirect('/login.php');
}

$extraStyles = '
    <style>
        /* Planner Specific Styles */
        .planner-container {
            display: flex;
            height: calc(100vh - 60px);
            padding: 20px;
            gap: 20px;
        }
        
        .sidebar {
            width: 300px;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        
        .main-content {
            flex: 1;
        }
        
        .right-sidebar {
            width: 300px;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        
        .goal-section {
            background: var(--card-bg);
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            border: 1px solid var(--border-color);
        }
        
        .goal-section h3 {
            margin-bottom: 15px;
            color: var(--light-color);
        }
        
        .goals-list {
            max-height: 200px;
            overflow-y: auto;
            margin-bottom: 10px;
        }
        
        .goal-item, .task-item, .stock-item, .recommendation-item {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            padding: 10px;
            margin-bottom: 10px;
            border: 1px solid var(--border-color);
            cursor: move;
        }
        
        .goal-header, .task-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 5px;
        }
        
        .goal-title, .task-title {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
        }
        
        .goal-title.completed span, .task-title.completed span {
            text-decoration: line-through;
            opacity: 0.7;
        }
        
        .goal-actions, .task-actions {
            display: flex;
            gap: 5px;
        }
        
        .icon-btn {
            background: none;
            border: none;
            color: var(--highlight-color);
            cursor: pointer;
            padding: 5px;
        }
        
        .icon-btn:hover {
            color: var(--light-color);
        }
        
        .goal-meta, .task-meta {
            display: flex;
            justify-content: space-between;
            margin-top: 5px;
            font-size: 0.8rem;
            color: var(--highlight-color);
        }
        
        .priority-high { color: var(--error-color); }
        .priority-medium { color: var(--warning-color); }
        .priority-low { color: var(--success-color); }
        
        .planner-board {
            background: var(--card-bg);
            border-radius: 12px;
            padding: 20px;
            height: 100%;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            border: 1px solid var(--border-color);
        }
        
        .columns-container {
            display: flex;
            gap: 20px;
            height: calc(100% - 50px);
            margin-top: 20px;
        }
        
        .board-column {
            flex: 1;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            padding: 15px;
            border: 1px solid var(--border-color);
        }
        
        .board-column h4 {
            margin-bottom: 15px;
            color: var(--light-color);
        }
        
        .tasks {
            height: calc(100% - 40px);
            overflow-y: auto;
        }
        
        .stock-widget {
            background: var(--card-bg);
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            border: 1px solid var(--border-color);
        }
        
        .stock-list {
            max-height: 200px;
            overflow-y: auto;
        }
        
        .stock-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
        }
        
        .stock-symbol {
            font-weight: bold;
        }
        
        .stock-price {
            color: var(--light-color);
        }
        
        .stock-change.positive { color: var(--success-color); }
        .stock-change.negative { color: var(--error-color); }
        
        .attachment-options {
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
        }
        
        .attachment-option {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 10px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .attachment-option:hover {
            background: rgba(255, 255, 255, 0.1);
            transform: translateY(-2px);
        }
        
        .attachment-option i {
            font-size: 24px;
            margin-bottom: 5px;
            color: var(--highlight-color);
        }
        
        .empty-goals, .empty-tasks {
            text-align: center;
            padding: 20px;
            color: var(--highlight-color);
        }
        
        /* Modal styles */
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(5px);
        }
        
        .modal-content {
            background-color: var(--card-bg);
            margin: 10% auto;
            padding: 25px;
            border-radius: 12px;
            width: 90%;
            max-width: 500px;
            position: relative;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
            border: 1px solid var(--border-color);
        }
        
        .close-btn {
            position: absolute;
            right: 20px;
            top: 15px;
            font-size: 1.5rem;
            cursor: pointer;
            color: var(--highlight-color);
        }
        
        .form-group {
            margin-bottom: 15px;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 5px;
            color: var(--light-color);
        }
        
        .form-input, .form-textarea, .form-select {
            width: 100%;
            padding: 10px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-color);
        }
        
        .form-input:focus, .form-textarea:focus, .form-select:focus {
            outline: none;
            border-color: var(--highlight-color);
        }
        
        .form-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 20px;
        }
        
        .btn-primary, .btn-secondary, .btn-small {
            padding: 8px 16px;
            border-radius: 6px;
            border: none;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s ease;
        }
        
        .btn-primary {
            background: var(--highlight-color);
            color: white;
        }
        
        .btn-secondary {
            background: transparent;
            border: 1px solid var(--border-color);
            color: var(--text-color);
        }
        
        .btn-small {
            padding: 4px 8px;
            font-size: 0.9rem;
        }
        
        .btn-primary:hover, .btn-secondary:hover, .btn-small:hover {
            transform: translateY(-2px);
        }
        
        /* Loading overlay */
        .loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 9999;
        }
        
        .spinner {
            width: 50px;
            height: 50px;
            border: 5px solid var(--border-color);
            border-top-color: var(--highlight-color);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        /* API Status Indicator */
        .api-status {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--card-bg);
            padding: 10px 15px;
            border-radius: 20px;
            font-size: 0.8rem;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 1000;
        }
        
        .api-status.connected {
            border-left: 3px solid var(--success-color);
        }
        
        .api-status.disconnected {
            border-left: 3px solid var(--error-color);
        }
        
        .status-indicator {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            display: inline-block;
        }
        
        .connected .status-indicator {
            background-color: var(--success-color);
            animation: pulse 2s infinite;
        }
        
        .disconnected .status-indicator {
            background-color: var(--error-color);
        }
        
        /* Alerts */
        .alert {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            display: none;
            z-index: 1001;
            animation: slideIn 0.3s ease;
        }
        
        .alert-error {
            background-color: rgba(239, 68, 68, 0.2);
            border-left: 4px solid var(--error-color);
            color: var(--text-color);
        }
        
        .alert-success {
            background-color: rgba(16, 185, 129, 0.2);
            border-left: 4px solid var(--success-color);
            color: var(--text-color);
        }
        
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    </style>
';

$extraScripts = '
    <script src="/assets/js/planner.js"></script>
';
?>
<?php include 'includes/header.php'; ?>

<div class="planner-container">
    <!-- Left Sidebar -->
    <div class="sidebar">
        <div class="goal-section">
            <h3>Long Term Goals</h3>
            <div id="long-term-goals" class="goals-list"></div>
            <button class="add-btn" onclick="addGoal('long')">+ Add Goal</button>
        </div>

        <div class="goal-section">
            <h3>Short Term Goals</h3>
            <div id="short-term-goals" class="goals-list"></div>
            <button class="add-btn" onclick="addGoal('short')">+ Add Goal</button>
        </div>

        <div class="goal-section">
            <h3>Next Moves</h3>
            <div id="next-moves" class="goals-list"></div>
            <button class="add-btn" onclick="addGoal('next')">+ Add Action</button>
        </div>
    </div>

    <!-- Main Content -->
    <div class="main-content">
        <div class="planner-board">
            <h2>Wise Raven Planner</h2>
            <div class="columns-container">
                <div class="board-column" id="day-column">
                    <h4>Today</h4>
                    <div class="tasks" ondrop="drop(event)" ondragover="allowDrop(event)"></div>
                </div>
                <div class="board-column" id="week-column">
                    <h4>This Week</h4>
                    <div class="tasks" ondrop="drop(event)" ondragover="allowDrop(event)"></div>
                </div>
                <div class="board-column" id="month-column">
                    <h4>This Month</h4>
                    <div class="tasks" ondrop="drop(event)" ondragover="allowDrop(event)"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- Right Sidebar -->
    <div class="right-sidebar">
        <div class="stock-widget">
            <h3>Market Watch</h3>
            <div id="stock-data" class="stock-list"></div>
        </div>
        <div class="goal-section">
            <h3>Recommendations</h3>
            <div id="recommendations" class="recommendations-list"></div>
        </div>
        <div class="goal-section">
            <h3>File Attachments</h3>
            <div class="attachment-options">
                <div class="attachment-option" onclick="attachFile('document')">
                    <i class="fas fa-file"></i>
                    <span>Document</span>
                </div>
                <div class="attachment-option" onclick="attachFile('image')">
                    <i class="fas fa-image"></i>
                    <span>Image</span>
                </div>
                <div class="attachment-option" onclick="attachFile('audio')">
                    <i class="fas fa-music"></i>
                    <span>Audio</span>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Goal Modal -->
<div id="goal-modal" class="modal">
    <div class="modal-content">
        <span class="close-btn" onclick="closeModal()">&times;</span>
        <h3 id="modal-title">Add New Goal</h3>
        <form id="goal-form">
            <input type="hidden" id="goal-type">
            <input type="hidden" id="goal-id">
            <input type="hidden" name="csrf_token" value="<?php echo generateCSRFToken(); ?>">
            <div class="form-group">
                <label for="goal-title">Title</label>
                <input type="text" id="goal-title" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="goal-description">Description</label>
                <textarea id="goal-description" class="form-textarea" rows="3"></textarea>
            </div>
            <div class="form-group">
                <label for="goal-due-date">Due Date</label>
                <input type="date" id="goal-due-date" class="form-input">
            </div>
            <div class="form-group">
                <label for="goal-priority">Priority</label>
                <select id="goal-priority" class="form-select">
                    <option value="low">Low</option>
                    <option value="medium" selected>Medium</option>
                    <option value="high">High</option>
                </select>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" id="goal-completed"> Completed
                </label>
            </div>
            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn-primary">Save</button>
            </div>
        </form>
    </div>
</div>

<?php include 'includes/footer.php'; ?>