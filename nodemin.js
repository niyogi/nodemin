// nodemin.js - SECURITY HARDENED VERSION
const express = require('express');
const { Pool } = require('pg');
const basicAuth = require('express-basic-auth');
const crypto = require('crypto');
require('dotenv').config();

const nodemin = () => {
    const router = express.Router();

    // Configuration
    const config = {
        connectionString: process.env.PG_CONNECTION_STRING || 'postgresql://user:password@localhost:5432/dbname',
        isReadOnly: process.env.PG_READ_ONLY === 'true' || false,
        authUsername: process.env.ADMIN_USERNAME || 'admin',
        authPassword: process.env.ADMIN_PASSWORD || 'password123',
        rowsPerPage: parseInt(process.env.ROWS_PER_PAGE) || 25,
        basePath: process.env.BASE_PATH || ''
    };

    // PostgreSQL Pool
    const pool = new Pool({
        connectionString: config.connectionString
    });

    // CSRF Token storage (in-memory, per-session)
    const csrfTokens = new Map();

    // Basic Authentication Middleware
    const auth = basicAuth({
        users: { [config.authUsername]: config.authPassword },
        challenge: true,
        unauthorizedResponse: 'Unauthorized Access'
    });

    router.use(auth);
    router.use(express.urlencoded({ extended: true }));
    router.use(express.json()); // Add JSON parser for API requests

    // Middleware to set baseUrl for each request
    router.use((req, res, next) => {
        res.locals.baseUrl = config.basePath || req.baseUrl || '';
        next();
    });

    // CSRF Token functions
    function generateCsrfToken(sessionId) {
        const token = crypto.randomBytes(32).toString('hex');
        csrfTokens.set(sessionId, token);
        return token;
    }

    function validateCsrfToken(sessionId, token) {
        return csrfTokens.get(sessionId) === token;
    }

    function getSessionId(req) {
        return req.headers.authorization || 'default';
    }

    // XSS Protection - HTML escape function
    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // SQL Injection Protection - Validate identifiers
    function validateIdentifier(name) {
        if (!name || typeof name !== 'string') return false;
        return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
    }

    // Get primary key for a table
    async function getPrimaryKey(tableName) {
        // Validate table name to prevent SQL injection
        if (!validateIdentifier(tableName)) {
            throw new Error('Invalid table name');
        }
        
        try {
            // Use parameterized query for table name
            const result = await pool.query(`
                SELECT a.attname
                FROM pg_index i
                JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                WHERE i.indrelid = $1::regclass
                AND i.indisprimary
            `, [`"${tableName}"`]);
            
            return result.rows[0]?.attname || 'id';
        } catch (err) {
            console.error('Error getting primary key:', err);
            return 'id';
        }
    }
    
    // Map PostgreSQL data types to HTML input types
    function getInputTypeForDataType(dataType) {
        const typeMap = {
            'integer': 'number',
            'bigint': 'number',
            'smallint': 'number',
            'decimal': 'number',
            'numeric': 'number',
            'real': 'number',
            'double precision': 'number',
            'boolean': 'checkbox',
            'date': 'date',
            'time': 'time',
            'timestamp': 'datetime-local',
            'timestamptz': 'datetime-local',
            'interval': 'text',
            'uuid': 'text',
            'json': 'textarea',
            'jsonb': 'textarea',
            'text': 'textarea'
        };
        
        // Check if the data type is in our map
        for (const [pgType, htmlType] of Object.entries(typeMap)) {
            if (dataType.startsWith(pgType)) {
                return htmlType;
            }
        }
        
        // Default to text for any other types
        return 'text';
    }

    // HTML Template with DaisyUI and Modal Script
    const getHtmlTemplate = (content, baseUrl, csrfToken = '') => `
        <!DOCTYPE html>
        <html data-theme="light">
        <head>
            <title>Nodemin</title>
            <link href="https://cdn.jsdelivr.net/npm/daisyui@4.7.2/dist/full.min.css" rel="stylesheet" type="text/css" />
            <script src="https://cdn.tailwindcss.com"></script>
            <!-- CodeMirror for SQL syntax highlighting -->
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/codemirror.min.css">
            <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/codemirror.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/mode/sql/sql.min.js"></script>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/theme/dracula.min.css">
            <style>
                .CodeMirror {
                    height: 150px;
                    border: 1px solid #ddd;
                    border-radius: 0.5rem;
                }
            </style>
        </head>
        <body class="bg-base-100">
            <div class="container mx-auto p-4">
                <div class="flex justify-between items-center mb-4">
                    <h1 class="text-3xl font-bold">
                        <a href="${baseUrl}" class="hover:underline">Nodemin${config.isReadOnly ? ' <span class="text-error">(Read-Only)</span>' : ''}</a>
                    </h1>
                    <div class="flex gap-2 items-center">
                        <div class="dropdown dropdown-end">
                            <div tabindex="0" role="button" class="btn btn-ghost">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" />
                                </svg>
                                Theme
                            </div>
                            <ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">
                                <li><a onclick="setTheme('light')">Light</a></li>
                                <li><a onclick="setTheme('dark')">Dark</a></li>
                                <li><a onclick="setTheme('cupcake')">Cupcake</a></li>
                                <li><a onclick="setTheme('cyberpunk')">Cyberpunk</a></li>
                                <li><a onclick="setTheme('synthwave')">Synthwave</a></li>
                                <li><a onclick="setTheme('retro')">Retro</a></li>
                                <li><a onclick="setTheme('forest')">Forest</a></li>
                                <li><a onclick="setTheme('aqua')">Aqua</a></li>
                                <li><a onclick="setTheme('dracula')">Dracula</a></li>
                            </ul>
                        </div>
                        <button class="btn btn-ghost" onclick="loadQueryHistory(); document.getElementById('history_modal').showModal()">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-1">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            History
                        </button>
                        <button class="btn btn-ghost" onclick="loadConnectionProfiles(); document.getElementById('profiles_modal').showModal()">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-1">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Profiles
                        </button>
                        <button class="btn btn-primary" onclick="document.getElementById('sql_modal').showModal()">Execute SQL</button>
                        <a href="${baseUrl}/logout" class="btn btn-outline btn-error">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-1">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                            </svg>
                            Logout
                        </a>
                    </div>
                </div>
                ${content}
                
                <dialog id="sql_modal" class="modal">
                    <div class="modal-box">
                        <h3 class="font-bold text-lg">Execute SQL Query</h3>
                        <form id="sql-form" class="py-4">
                            <div id="sql-editor"></div>
                            <div class="modal-action">
                                <button type="button" class="btn btn-primary" onclick="confirmSqlExecution()">Execute</button>
                                <button type="button" class="btn" onclick="document.getElementById('sql_modal').close()">Cancel</button>
                            </div>
                        </form>
                    </div>
                </dialog>
                
                <dialog id="sql_confirm_modal" class="modal">
                    <div class="modal-box">
                        <h3 class="font-bold text-lg text-warning">Confirm SQL Execution</h3>
                        <p class="py-4">Are you sure you want to run this query? Executing SQL directly can modify or delete data and may have unintended consequences.</p>
                        <div class="modal-action">
                            <button type="button" class="btn btn-warning" onclick="executeSql()">Yes, Execute</button>
                            <button type="button" class="btn" onclick="document.getElementById('sql_confirm_modal').close()">Cancel</button>
                        </div>
                    </div>
                </dialog>
                
                <dialog id="delete_confirm_modal" class="modal">
                    <div class="modal-box">
                        <h3 class="font-bold text-lg text-error">Confirm Deletion</h3>
                        <p class="py-4">Are you sure you want to delete this row? This action cannot be undone.</p>
                        <form id="delete-form" method="POST">
                            <input type="hidden" name="_csrf" value="${csrfToken}">
                            <div class="modal-action">
                                <button type="submit" class="btn btn-error">Yes, Delete</button>
                                <button type="button" class="btn" onclick="document.getElementById('delete_confirm_modal').close()">Cancel</button>
                            </div>
                        </form>
                    </div>
                </dialog>
                
                <dialog id="sql_result_modal" class="modal">
                    <div id="sql-result-container" class="modal-box max-w-4xl">
                        <div class="flex justify-between items-center">
                            <h3 class="font-bold text-lg">SQL Execution Result</h3>
                            <button type="button" class="btn btn-sm btn-circle" onclick="toggleFullscreen()">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                                </svg>
                            </button>
                        </div>
                        <div id="sql-result" class="py-4 overflow-x-auto"></div>
                        <div class="modal-action">
                            <button type="button" class="btn" onclick="document.getElementById('sql_result_modal').close()">Close</button>
                        </div>
                    </div>
                </dialog>
                
                <dialog id="history_modal" class="modal">
                    <div class="modal-box max-w-3xl">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="font-bold text-lg">Query History</h3>
                            <button type="button" class="btn btn-sm btn-error" onclick="clearQueryHistory()">Clear History</button>
                        </div>
                        <div id="query-history-list" class="space-y-2 max-h-96 overflow-y-auto">
                            <p class="text-gray-500">No queries yet...</p>
                        </div>
                        <div class="modal-action">
                            <button type="button" class="btn" onclick="document.getElementById('history_modal').close()">Close</button>
                        </div>
                    </div>
                </dialog>
                
                <dialog id="profiles_modal" class="modal">
                    <div class="modal-box max-w-2xl">
                        <h3 class="font-bold text-lg mb-4">Connection Profiles</h3>
                        <div id="profiles-list" class="space-y-2 mb-4 max-h-64 overflow-y-auto">
                            <p class="text-gray-500">No saved profiles...</p>
                        </div>
                        <div class="divider">Add New Profile</div>
                        <form id="profile-form" class="space-y-3">
                            <div class="grid grid-cols-2 gap-3">
                                <input type="text" name="name" placeholder="Profile Name" class="input input-bordered" required>
                                <input type="text" name="host" placeholder="Host (e.g., localhost)" class="input input-bordered" required>
                                <input type="number" name="port" placeholder="Port (5432)" class="input input-bordered" value="5432">
                                <input type="text" name="database" placeholder="Database Name" class="input input-bordered" required>
                                <input type="text" name="username" placeholder="Username" class="input input-bordered" required>
                                <input type="password" name="password" placeholder="Password" class="input input-bordered">
                            </div>
                            <label class="label cursor-pointer justify-start gap-2">
                                <input type="checkbox" name="ssl" class="checkbox">
                                <span class="label-text">Use SSL</span>
                            </label>
                        </form>
                        <div class="modal-action">
                            <button type="button" class="btn btn-primary" onclick="saveConnectionProfile()">Save Profile</button>
                            <button type="button" class="btn" onclick="document.getElementById('profiles_modal').close()">Close</button>
                        </div>
                    </div>
                </dialog>
            </div>
            <script>
                // CodeMirror editor instance
                let sqlEditor;
                
                // Load saved theme from localStorage or detect system preference
                document.addEventListener('DOMContentLoaded', function() {
                    const savedTheme = localStorage.getItem('nodemin-theme');
                    if (savedTheme) {
                        document.documentElement.setAttribute('data-theme', savedTheme);
                    } else {
                        // Detect system preference
                        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                        const defaultTheme = prefersDark ? 'dark' : 'light';
                        document.documentElement.setAttribute('data-theme', defaultTheme);
                        localStorage.setItem('nodemin-theme', defaultTheme);
                    }
                    
                    // Listen for system theme changes
                    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
                        const newTheme = e.matches ? 'dark' : 'light';
                        document.documentElement.setAttribute('data-theme', newTheme);
                        localStorage.setItem('nodemin-theme', newTheme);
                        document.dispatchEvent(new Event('themechange'));
                    });
                    
                    // Initialize CodeMirror
                    sqlEditor = CodeMirror(document.getElementById('sql-editor'), {
                        mode: 'text/x-sql',
                        theme: 'dracula',
                        lineNumbers: true,
                        indentWithTabs: true,
                        smartIndent: true,
                        lineWrapping: true,
                        matchBrackets: true,
                        autofocus: true,
                        placeholder: 'Enter your SQL query here...'
                    });
                    
                    // Update CodeMirror theme when app theme changes
                    document.addEventListener('themechange', function() {
                        const isDark = ['dark', 'dracula', 'synthwave', 'cyberpunk', 'forest'].includes(
                            document.documentElement.getAttribute('data-theme')
                        );
                        sqlEditor.setOption('theme', isDark ? 'dracula' : 'default');
                    });
                });
                
                // Theme switching function
                function setTheme(theme) {
                    document.documentElement.setAttribute('data-theme', theme);
                    localStorage.setItem('nodemin-theme', theme);
                    
                    // Dispatch theme change event
                    document.dispatchEvent(new Event('themechange'));
                }
                
                // Toggle fullscreen for SQL results
                function toggleFullscreen() {
                    const container = document.getElementById('sql-result-container');
                    if (container.classList.contains('max-w-4xl')) {
                        // Go fullscreen
                        container.classList.remove('max-w-4xl');
                        container.classList.add('max-w-full', 'h-screen', 'w-screen');
                    } else {
                        // Exit fullscreen
                        container.classList.add('max-w-4xl');
                        container.classList.remove('max-w-full', 'h-screen', 'w-screen');
                    }
                }
                
                document.querySelectorAll('.structure-link').forEach(link => {
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        const modalId = link.getAttribute('data-modal');
                        document.getElementById(modalId).showModal();
                    });
                });
                
                function confirmSqlExecution() {
                    const query = sqlEditor.getValue().trim();
                    if (!query) {
                        alert('Please enter a SQL query');
                        return;
                    }
                    document.getElementById('sql_modal').close();
                    document.getElementById('sql_confirm_modal').showModal();
                }
                
                function confirmDelete(tableName, pkValue) {
                    const deleteForm = document.getElementById('delete-form');
                    deleteForm.action = '${baseUrl}/table/' + tableName + '/delete/' + pkValue;
                    document.getElementById('delete_confirm_modal').showModal();
                }
                
                function executeSql() {
                    const query = sqlEditor.getValue().trim();
                    document.getElementById('sql_confirm_modal').close();
                    
                    fetch('${baseUrl}/execute-sql', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ query: query }),
                    })
                    .then(response => response.json())
                    .then(data => {
                        let resultHtml = '';
                        
                        if (data.error) {
                            resultHtml = '<div class="alert alert-error"><span>Error: ' + data.error + '</span></div>';
                        } else {
                            if (data.command) {
                                resultHtml = '<div class="alert alert-success"><span>Success: ' + data.command + ' executed. ' + (data.rowCount !== undefined ? data.rowCount + ' rows affected.' : '') + '</span></div>';
                            }
                            
                            if (data.rows && data.rows.length > 0) {
                                const headers = Object.keys(data.rows[0]).map(col => '<th>' + col + '</th>').join('');
                                const rows = data.rows.map(row => {
                                    const cells = Object.values(row).map(val => '<td>' + (val === null ? 'NULL' : val) + '</td>').join('');
                                    return '<tr>' + cells + '</tr>';
                                }).join('');
                                
                                resultHtml += 
                                    '<div class="overflow-x-auto mt-4">' +
                                    '<table class="table table-zebra w-full">' +
                                    '<thead><tr>' + headers + '</tr></thead>' +
                                    '<tbody>' + rows + '</tbody>' +
                                    '</table>' +
                                    '</div>';
                            }
                        }
                        
                        document.getElementById('sql-result').innerHTML = resultHtml;
                        document.getElementById('sql_result_modal').showModal();
                    })
                    .catch(error => {
                        document.getElementById('sql-result').innerHTML = '<div class="alert alert-error"><span>Error: ' + error.message + '</span></div>';
                        document.getElementById('sql_result_modal').showModal();
                }
                
                // Keyboard Shortcuts
                document.addEventListener('keydown', function(e) {
                    // Cmd/Ctrl+Enter to execute SQL
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        const sqlModal = document.getElementById('sql_modal');
                        if (sqlModal.open && sqlEditor) {
                            e.preventDefault();
                            confirmSqlExecution();
                        }
                    }
                    
                    // ESC to close modals
                    if (e.key === 'Escape') {
                        const modals = document.querySelectorAll('dialog.modal[open]');
                        if (modals.length > 0) {
                            // Close the last opened modal
                            modals[modals.length - 1].close();
                        }
                    }
                    
                    // Cmd/Ctrl+K for command palette (placeholder for future)
                    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                        e.preventDefault();
                        // Future: Show command palette
                        console.log('Command palette shortcut pressed');
                    }
                    
                    // Cmd/Ctrl+Shift+L to toggle theme
                    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'L') {
                        e.preventDefault();
                        const currentTheme = document.documentElement.getAttribute('data-theme');
                        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                        setTheme(newTheme);
                    }
                    
                    // ? to show keyboard shortcuts help
                    if (e.key === '?' && !e.target.matches('input, textarea, [contenteditable]')) {
                        e.preventDefault();
                        alert('Keyboard Shortcuts:\n' +
                              'Cmd/Ctrl+Enter - Execute SQL query\n' +
                              'Cmd/Ctrl+Shift+L - Toggle dark/light mode\n' +
                              'ESC - Close modals\n' +
                              '? - Show this help');
                    }
                });
                
                // Query History Functions
                function loadQueryHistory() {
                    fetch('${baseUrl}/query-history')
                        .then(response => response.json())
                        .then(history => {
                            const listEl = document.getElementById('query-history-list');
                            if (history.length === 0) {
                                listEl.innerHTML = '<p class="text-gray-500">No queries yet...</p>';
                                return;
                            }
                            listEl.innerHTML = history.map((item, index) => `
                                <div class="card bg-base-200 cursor-pointer hover:bg-base-300" onclick="loadQueryFromHistory(${index})">
                                    <div class="card-body p-3">
                                        <div class="flex justify-between items-start">
                                            <code class="text-sm break-all">${escapeHtml(item.query.substring(0, 100))}${item.query.length > 100 ? '...' : ''}</code>
                                            <span class="text-xs text-gray-500">${new Date(item.timestamp).toLocaleTimeString()}</span>
                                        </div>
                                        <div class="text-xs text-gray-500 mt-1">
                                            ${item.command} • ${item.rowCount} rows
                                        </div>
                                    </div>
                                </div>
                            `).join('');
                            // Store history for loading
                            window.queryHistoryData = history;
                        })
                        .catch(error => {
                            console.error('Error loading query history:', error);
                        });
                }
                
                function loadQueryFromHistory(index) {
                    if (window.queryHistoryData && window.queryHistoryData[index]) {
                        sqlEditor.setValue(window.queryHistoryData[index].query);
                        document.getElementById('history_modal').close();
                        document.getElementById('sql_modal').showModal();
                        sqlEditor.focus();
                    }
                }
                
                function clearQueryHistory() {
                    if (!confirm('Clear all query history?')) return;
                    fetch('${baseUrl}/clear-query-history', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': '${csrfToken}'
                        }
                    })
                    .then(() => {
                        document.getElementById('query-history-list').innerHTML = '<p class="text-gray-500">No queries yet...</p>';
                        window.queryHistoryData = [];
                    })
                    .catch(error => {
                        console.error('Error clearing history:', error);
                    });
                }
                
                // Connection Profiles Functions
                function loadConnectionProfiles() {
                    fetch('${baseUrl}/api/profiles')
                        .then(response => response.json())
                        .then(profiles => {
                            const listEl = document.getElementById('profiles-list');
                            if (profiles.length === 0) {
                                listEl.innerHTML = '<p class="text-gray-500">No saved profiles...</p>';
                                return;
                            }
                            listEl.innerHTML = profiles.map(profile => `
                                <div class="card bg-base-200">
                                    <div class="card-body p-3 flex justify-between items-center">
                                        <div>
                                            <h4 class="font-bold">${escapeHtml(profile.name)}</h4>
                                            <p class="text-sm text-gray-500">${escapeHtml(profile.host)}:${profile.port}/${escapeHtml(profile.database)}</p>
                                        </div>
                                        <button class="btn btn-sm btn-error" onclick="deleteConnectionProfile('${profile.id}')">Delete</button>
                                    </div>
                                </div>
                            `).join('');
                        })
                        .catch(error => {
                            console.error('Error loading profiles:', error);
                        });
                }
                
                function saveConnectionProfile() {
                    const form = document.getElementById('profile-form');
                    const formData = new FormData(form);
                    const data = {
                        name: formData.get('name'),
                        host: formData.get('host'),
                        port: formData.get('port'),
                        database: formData.get('database'),
                        username: formData.get('username'),
                        password: formData.get('password'),
                        ssl: formData.get('ssl') === 'on'
                    };
                    
                    fetch('${baseUrl}/api/profiles', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': '${csrfToken}'
                        },
                        body: JSON.stringify(data)
                    })
                    .then(response => response.json())
                    .then(result => {
                        if (result.success) {
                            form.reset();
                            loadConnectionProfiles();
                        } else {
                            alert('Error: ' + result.error);
                        }
                    })
                    .catch(error => {
                        console.error('Error saving profile:', error);
                    });
                }
                
                function deleteConnectionProfile(profileId) {
                    if (!confirm('Delete this profile?')) return;
                    fetch('${baseUrl}/api/profiles/' + profileId, {
                        method: 'DELETE',
                        headers: {
                            'X-CSRF-Token': '${csrfToken}'
                        }
                    })
                    .then(() => {
                        loadConnectionProfiles();
                    })
                    .catch(error => {
                        console.error('Error clearing history:', error);
                    });
                }
                
                // Bulk Operations Functions
                function toggleSelectAll() {
                    const selectAllCheckbox = document.getElementById('select-all');
                    const rowCheckboxes = document.querySelectorAll('.row-checkbox');
                    rowCheckboxes.forEach(cb => {
                        cb.checked = selectAllCheckbox.checked;
                    });
                    updateBulkActionsBar();
                }
                
                function updateBulkActionsBar() {
                    const checkedBoxes = document.querySelectorAll('.row-checkbox:checked');
                    const bulkBar = document.getElementById('bulk-actions-bar');
                    const countSpan = document.getElementById('selected-count');
                    
                    if (checkedBoxes.length > 0) {
                        bulkBar.classList.remove('hidden');
                        countSpan.textContent = checkedBoxes.length;
                    } else {
                        bulkBar.classList.add('hidden');
                    }
                }
                
                function clearSelection() {
                    const checkboxes = document.querySelectorAll('.row-checkbox, #select-all');
                    checkboxes.forEach(cb => cb.checked = false);
                    updateBulkActionsBar();
                }
                
                function confirmBulkDelete() {
                    const checkedBoxes = document.querySelectorAll('.row-checkbox:checked');
                    if (checkedBoxes.length === 0) return;
                    
                    const ids = Array.from(checkedBoxes).map(cb => cb.value);
                    document.getElementById('bulk-delete-count').textContent = ids.length;
                    document.getElementById('bulk-delete-ids').value = JSON.stringify(ids);
                    document.getElementById('bulk_delete_modal').showModal();
                }
                
                // Add event listeners to row checkboxes
                document.addEventListener('change', function(e) {
                    if (e.target.classList.contains('row-checkbox')) {
                        updateBulkActionsBar();
                    }
                });
            </script>
        </body>
        </html>
    `;

    // Pagination component
    const getPagination = (tableName, currentPage, totalRows, searchQuery = '', baseUrl) => {
        const totalPages = Math.ceil(totalRows / config.rowsPerPage);
        const basePath = searchQuery 
            ? `${baseUrl}/table/${tableName}/search?q=${encodeURIComponent(searchQuery)}`
            : `${baseUrl}/table/${tableName}`;
        
        // Properly handle URL parameters with ? and &
        const pageParam = basePath.includes('?') ? '&page=' : '?page=';
        
        let pagination = '<div class="join mt-4">';
        pagination += currentPage > 1 
            ? `<a href="${basePath}${pageParam}${currentPage - 1}" class="join-item btn">«</a>`
            : '<button class="join-item btn" disabled>«</button>';

        pagination += `<button class="join-item btn">Page ${currentPage} of ${totalPages || 1}</button>`;

        pagination += currentPage < totalPages 
            ? `<a href="${basePath}${pageParam}${currentPage + 1}" class="join-item btn">»</a>`
            : '<button class="join-item btn" disabled>»</button>';
        
        pagination += '</div>';
        return pagination;
    };

    // CSRF Protection Middleware for POST requests
    const csrfProtection = (req, res, next) => {
        if (req.method === 'POST') {
            const sessionId = getSessionId(req);
            const token = req.body._csrf || req.headers['x-csrf-token'];
            if (!token || !validateCsrfToken(sessionId, token)) {
                return res.status(403).send('<div class="alert alert-error"><span>Invalid CSRF token</span></div>');
            }
        }
        next();
    };

    // Apply CSRF protection to all POST routes
    router.post('*', csrfProtection);

    // Home - List Tables with Structure Links
    router.get('', async (req, res) => {
        try {
            const baseUrl = res.locals.baseUrl;
            const sessionId = getSessionId(req);
            const csrfToken = generateCsrfToken(sessionId);
            
            const result = await pool.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name
            `);
            
            let modals = '';
            const tables = await Promise.all(result.rows.map(async row => {
                const tableName = row.table_name;
                
                // Validate table name
                if (!validateIdentifier(tableName)) return '';
                
                // Get row count for the table
                const countResult = await pool.query(`SELECT COUNT(*) FROM "${tableName}"`);
                const rowCount = parseInt(countResult.rows[0].count);
                
                const columns = await pool.query(`
                    SELECT column_name, data_type, is_nullable, column_default
                    FROM information_schema.columns 
                    WHERE table_schema = 'public' AND table_name = $1
                    ORDER BY ordinal_position
                `, [tableName]);

                const pkResult = await pool.query(`
                    SELECT a.attname
                    FROM pg_index i
                    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                    WHERE i.indrelid = $1::regclass AND i.indisprimary
                `, [`"${tableName}"`]);
                const primaryKeys = pkResult.rows.map(r => r.attname);

                const columnRows = columns.rows.map(col => `
                    <tr>
                        <td>${escapeHtml(col.column_name)}${primaryKeys.includes(col.column_name) ? ' <span class="badge badge-primary">PK</span>' : ''}</td>
                        <td>${escapeHtml(col.data_type)}</td>
                        <td>${escapeHtml(col.is_nullable)}</td>
                        <td>${escapeHtml(col.column_default) || 'NULL'}</td>
                    </tr>
                `).join('');

                modals += `
                    <dialog id="modal_${escapeHtml(tableName)}" class="modal">
                        <div class="modal-box">
                            <h3 class="font-bold text-lg">${escapeHtml(tableName)} Structure</h3>
                            <div class="overflow-x-auto">
                                <table class="table table-zebra w-full">
                                    <thead>
                                        <tr>
                                            <th>Column</th>
                                            <th>Type</th>
                                            <th>Nullable</th>
                                            <th>Default</th>
                                        </tr>
                                    </thead>
                                    <tbody>${columnRows}</tbody>
                                </table>
                            </div>
                            <div class="modal-action">
                                <form method="dialog">
                                    <button class="btn">Close</button>
                                </form>
                            </div>
                        </div>
                    </dialog>
                `;

                return `
                    <li>
                        <a href="${escapeHtml(baseUrl)}/table/${escapeHtml(tableName)}" class="link link-primary">${escapeHtml(tableName)}</a>
                        <span class="badge badge-sm badge-outline ml-2">${rowCount} rows</span>
                        <a href="#" class="link link-secondary text-sm ml-2 structure-link" data-modal="modal_${escapeHtml(tableName)}">[Structure]</a>
                    </li>
                `;
            }));

            const content = `
                <h2 class="text-2xl mb-2">Tables</h2>
                <ul class="list-disc pl-5">${tables.join('')}</ul>
                ${modals}
            `;
            
            res.send(getHtmlTemplate(content, baseUrl, csrfToken));
        } catch (err) {
            console.error('Database Error:', err);
            res.send(getHtmlTemplate(`<div class="alert alert-error"><span>Error: ${escapeHtml(err.message)}</span></div>`, res.locals.baseUrl));
        }
    });

    // Table View
    router.get('/table/:tableName', async (req, res) => {
        try {
            const baseUrl = res.locals.baseUrl;
            const sessionId = getSessionId(req);
            const csrfToken = generateCsrfToken(sessionId);
            
            const tableName = req.params.tableName;
            
            // Validate table name
            if (!validateIdentifier(tableName)) {
                return res.send(getHtmlTemplate(`<div class="alert alert-error"><span>Invalid table name</span></div>`, baseUrl));
            }
            
            const page = parseInt(req.query.page) || 1;
            const offset = (page - 1) * config.rowsPerPage;
            const pkColumn = await getPrimaryKey(tableName);
            
            const countResult = await pool.query(`SELECT COUNT(*) FROM "${tableName}"`);
            const totalRows = parseInt(countResult.rows[0].count);

            // Get column information
            const columnListInfo = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = $1
                ORDER BY ordinal_position
            `, [tableName]);
            
            const columnNames = columnListInfo.rows.map(row => row.column_name);
            
            // Query with parameterized limit/offset
            let result;
            try {
                const query = pkColumn && pkColumn !== 'id'
                    ? `SELECT * FROM "${tableName}" ORDER BY "${pkColumn}" LIMIT $1 OFFSET $2`
                    : `SELECT * FROM "${tableName}" LIMIT $1 OFFSET $2`;
                result = await pool.query(query, [config.rowsPerPage, offset]);
            } catch (err) {
                result = await pool.query(`SELECT * FROM "${tableName}" LIMIT $1 OFFSET $2`, [config.rowsPerPage, offset]);
            }

            // Generate headers with XSS protection and bulk checkbox
            const headers = (columnNames.map(col => `<th>${escapeHtml(col)}</th>`).join('')) + 
                (!config.isReadOnly ? '<th class="w-10"><input type="checkbox" id="select-all" class="checkbox checkbox-sm" onclick="toggleSelectAll()"></th>' : '');
            
            // Generate rows with XSS protection and bulk checkboxes
            const rows = result.rows.length > 0 
                ? result.rows.map((row, index) => {
                    const cells = Object.values(row).map(val => `<td>${val === null ? 'NULL' : escapeHtml(val)}</td>`).join('');
                    const pkValue = escapeHtml(row[pkColumn]);
                    return `<tr data-pk="${pkValue}">${cells}${
                        !config.isReadOnly ? `<td class="flex gap-1 items-center">
                            <input type="checkbox" class="row-checkbox checkbox checkbox-sm" value="${pkValue}" data-pk="${pkValue}">
                            <a href="${escapeHtml(baseUrl)}/table/${escapeHtml(tableName)}/edit/${pkValue}" class="btn btn-xs btn-primary ml-2">Edit</a>
                            <button class="btn btn-xs btn-error" onclick="confirmDelete('${escapeHtml(tableName)}', '${pkValue}')">Delete</button>
                        </td>` : ''
                    }</tr>`;
                  }).join('')
                : `<tr><td colspan="${columnNames.length + (!config.isReadOnly ? 2 : 0)}" class="text-center">No data found</td></tr>`;

            // Get column information for insert form
            console.log('Getting column information for insert form:', tableName);
            const columnInfoQuery = `
                SELECT 
                    c.column_name, 
                    c.data_type, 
                    c.is_nullable,
                    c.column_default,
                    CASE 
                        WHEN c.column_default LIKE 'nextval%' THEN true 
                        ELSE false 
                    END as is_serial,
                    pg_catalog.col_description(format('%s.%s', 'public', '${tableName}')::regclass::oid, c.ordinal_position) as column_comment
                FROM information_schema.columns c
                WHERE c.table_schema = 'public' AND c.table_name = '${tableName}'
                ORDER BY c.ordinal_position
            `;
            const columnsInfo = await pool.query(columnInfoQuery);
            
            // Create insert form fields
            const insertFormFields = columnsInfo.rows
                .filter(col => !col.is_serial) // Skip auto-increment columns
                .map(col => {
                    const isNullable = col.is_nullable === 'YES';
                    const inputType = getInputTypeForDataType(col.data_type);
                    const dataType = col.data_type;
                    
                    // Special handling for timestamp with timezone fields
                    if (dataType === 'timestamp with time zone' || dataType === 'timestamptz') {
                        return `
                            <div class="form-control">
                                <label class="label">
                                    <span class="label-text">${col.column_name}${isNullable ? '' : ' *'}</span>
                                    <span class="label-text-alt text-xs opacity-70">${dataType}</span>
                                </label>
                                <div class="flex gap-2">
                                    <input type="datetime-local" name="${col.column_name}" 
                                        class="input input-bordered flex-grow" 
                                        ${isNullable ? '' : 'required'}>
                                    <select name="${col.column_name}_timezone" class="select select-bordered">
                                        <option value="UTC">UTC</option>
                                        <option value="America/New_York">America/New_York</option>
                                        <option value="America/Chicago">America/Chicago</option>
                                        <option value="America/Denver">America/Denver</option>
                                        <option value="America/Los_Angeles">America/Los_Angeles</option>
                                        <option value="Europe/London">Europe/London</option>
                                        <option value="Europe/Paris">Europe/Paris</option>
                                        <option value="Asia/Tokyo">Asia/Tokyo</option>
                                        <option value="Australia/Sydney">Australia/Sydney</option>
                                    </select>
                                </div>
                                ${col.column_comment ? `<label class="label"><span class="label-text-alt text-xs text-info">${col.column_comment}</span></label>` : ''}
                            </div>
                        `;
                    }
                    // Special handling for timestamp without timezone fields
                    else if (dataType === 'timestamp without time zone' || dataType === 'timestamp') {
                        return `
                            <div class="form-control">
                                <label class="label">
                                    <span class="label-text">${col.column_name}${isNullable ? '' : ' *'}</span>
                                    <span class="label-text-alt text-xs opacity-70">${dataType}</span>
                                </label>
                                <input type="datetime-local" name="${col.column_name}" 
                                    class="input input-bordered" 
                                    ${isNullable ? '' : 'required'}>
                                ${col.column_comment ? `<label class="label"><span class="label-text-alt text-xs text-info">${col.column_comment}</span></label>` : ''}
                            </div>
                        `;
                    }
                    // Default handling for other field types
                    else {
                        return `
                            <div class="form-control">
                                <label class="label">
                                    <span class="label-text">${col.column_name}${isNullable ? '' : ' *'}</span>
                                    <span class="label-text-alt text-xs opacity-70">${col.data_type}</span>
                                </label>
                                <input type="${inputType}" name="${col.column_name}" class="input input-bordered" ${isNullable ? '' : 'required'}>
                                ${col.column_comment ? `<label class="label"><span class="label-text-alt text-xs text-info">${col.column_comment}</span></label>` : ''}
                            </div>
                        `;
                    }
                }).join('');
            
            // Create insert modal
            const insertModal = !config.isReadOnly ? `
                <dialog id="insert_modal_${tableName}" class="modal">
                    <div class="modal-box">
                        <h3 class="font-bold text-lg">Insert New Row into ${tableName}</h3>
                        <form method="POST" action="${baseUrl}/table/${tableName}/insert" class="py-4 space-y-4">
                            ${insertFormFields}
                            <div class="modal-action">
                                <button type="submit" class="btn btn-primary">Insert</button>
                                <button type="button" class="btn" onclick="document.getElementById('insert_modal_${tableName}').close()">Cancel</button>
                            </div>
                        </form>
                    </div>
                </dialog>
            ` : '';
            
            // Bulk actions toolbar (hidden by default, shown when rows selected)
            const bulkActionsToolbar = !config.isReadOnly ? `
                <div id="bulk-actions-bar" class="hidden mb-4 p-3 bg-base-200 rounded-lg flex justify-between items-center">
                    <span class="text-sm"><span id="selected-count">0</span> rows selected</span>
                    <div class="flex gap-2">
                        <button class="btn btn-sm btn-error" onclick="confirmBulkDelete()">Delete Selected</button>
                        <button class="btn btn-sm btn-ghost" onclick="clearSelection()">Clear</button>
                    </div>
                </div>
            ` : '';
            
            const content = `
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl">${escapeHtml(tableName)}</h2>
                    <div class="flex gap-2">
                        <div class="dropdown dropdown-end">
                            <div tabindex="0" role="button" class="btn btn-outline">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-1">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                                Export
                            </div>
                            <ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">
                                <li><a href="${escapeHtml(baseUrl)}/table/${escapeHtml(tableName)}/export?format=csv">Export as CSV</a></li>
                                <li><a href="${escapeHtml(baseUrl)}/table/${escapeHtml(tableName)}/export?format=json">Export as JSON</a></li>
                                <li><a href="${escapeHtml(baseUrl)}/table/${escapeHtml(tableName)}/export?format=csv&all=true">Export All as CSV</a></li>
                                <li><a href="${escapeHtml(baseUrl)}/table/${escapeHtml(tableName)}/export?format=json&all=true">Export All as JSON</a></li>
                            </ul>
                        </div>
                        ${!config.isReadOnly ? `<button class="btn btn-primary" onclick="document.getElementById('insert_modal_${escapeHtml(tableName)}').showModal()">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-1">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            Insert
                        </button>` : ''}
                    </div>
                </div>
                <form class="mb-4 flex gap-2" method="GET" action="${baseUrl}/table/${tableName}/search">
                    <input type="text" name="q" placeholder="Search table..." class="input input-bordered w-full max-w-xs">
                    <button type="submit" class="btn btn-primary">Search</button>
                </form>
                ${bulkActionsToolbar}
                <div class="overflow-x-auto">
                    <table class="table table-zebra w-full" id="data-table">
                        <thead><tr>${headers}${!config.isReadOnly ? '<th>Actions</th>' : ''}</tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <p class="mt-2 text-sm">Showing ${offset + 1} to ${Math.min(offset + config.rowsPerPage, totalRows)} of ${totalRows} rows</p>
                ${getPagination(tableName, page, totalRows, '', baseUrl)}
                ${insertModal}
                
                ${!config.isReadOnly ? `
                <dialog id="bulk_delete_modal" class="modal">
                    <div class="modal-box">
                        <h3 class="font-bold text-lg text-error">Confirm Bulk Deletion</h3>
                        <p class="py-4">Are you sure you want to delete <span id="bulk-delete-count">0</span> selected rows? This action cannot be undone.</p>
                        <form id="bulk-delete-form" method="POST" action="${escapeHtml(baseUrl)}/table/${escapeHtml(tableName)}/bulk-delete">
                            <input type="hidden" name="_csrf" value="${csrfToken}">
                            <input type="hidden" name="ids" id="bulk-delete-ids">
                            <div class="modal-action">
                                <button type="submit" class="btn btn-error">Yes, Delete All</button>
                                <button type="button" class="btn" onclick="document.getElementById('bulk_delete_modal').close()">Cancel</button>
                            </div>
                        </form>
                    </div>
                </dialog>
                ` : ''}
            `;
            
            res.send(getHtmlTemplate(content, baseUrl));
        } catch (err) {
            console.error('Database Error:', err);
            const errorMessage = err.message || 'Unable to connect to the database. Please check your connection string and ensure PostgreSQL is running.';
            res.send(getHtmlTemplate(`<div class="alert alert-error"><span>Error: ${errorMessage}</span></div>`, res.locals.baseUrl));
        }
    });

    // Search Table
    router.get('/table/:tableName/search', async (req, res) => {
        try {
            const baseUrl = res.locals.baseUrl;
            const tableName = req.params.tableName;
            const searchQuery = req.query.q;
            const page = parseInt(req.query.page) || 1;
            const offset = (page - 1) * config.rowsPerPage;
            const pkColumn = await getPrimaryKey(tableName);

            // Get column information first to handle empty tables
            const columnListInfo = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = '${tableName}'
                ORDER BY ordinal_position
            `);
            
            const columns = columnListInfo.rows.map(row => row.column_name);
            
            // Build a WHERE clause with LIKE conditions for each column
            const searchPattern = searchQuery.replace(/'/g, "''"); // Escape single quotes
            const escapedSearchPattern = `%${searchPattern}%`;
            
            const whereClauses = columns.map(col => 
                `"${col}"::text ILIKE '${escapedSearchPattern}'`
            ).join(' OR ');
            
            const countResult = await pool.query(`
                SELECT COUNT(*) FROM "${tableName}" 
                WHERE ${whereClauses}
            `);
            const totalRows = parseInt(countResult.rows[0].count);

            // Handle the case where there might not be a primary key
            let result;
            try {
                // Use a simpler approach to avoid parameter type issues
                const query = `
                    SELECT * FROM "${tableName}" 
                    WHERE ${whereClauses}
                    ORDER BY "${pkColumn}"
                    LIMIT ${config.rowsPerPage} OFFSET ${offset}
                `;
                result = await pool.query(query);
            } catch (err) {
                // If ordering by primary key fails, try without ordering
                console.error('Error ordering by primary key in search, falling back to no ordering:', err);
                const query = `
                    SELECT * FROM "${tableName}" 
                    WHERE ${whereClauses}
                    LIMIT ${config.rowsPerPage} OFFSET ${offset}
                `;
                result = await pool.query(query);
            }

            // Generate headers from column names, not from the first row (which might not exist)
            const headers = columns.map(col => `<th>${col}</th>`).join('');
            // Generate rows, handling the case when there are no rows
            const rows = result.rows.length > 0 
                ? result.rows.map(row => {
                    const cells = Object.values(row).map(val => `<td>${val === null ? 'NULL' : val}</td>`).join('');
                    return `<tr>${cells}${
                        !config.isReadOnly ? `<td class="flex gap-1">
                            <a href="${baseUrl}/table/${tableName}/edit/${row[pkColumn]}" class="btn btn-xs btn-primary">Edit</a>
                            <button class="btn btn-xs btn-error" onclick="confirmDelete('${tableName}', '${row[pkColumn]}')">Delete</button>
                        </td>` : ''
                    }</tr>`;
                  }).join('')
                : `<tr><td colspan="${columns.length + (!config.isReadOnly ? 1 : 0)}" class="text-center">No data found</td></tr>`;

            const content = `
                <h2 class="text-2xl mb-2">${tableName} - Search Results for "${searchQuery}"</h2>
                <a href="${baseUrl}/table/${tableName}" class="btn btn-ghost mb-4">Back to Table</a>
                <div class="overflow-x-auto">
                    <table class="table table-zebra w-full">
                        <thead><tr>${headers}${!config.isReadOnly ? '<th>Actions</th>' : ''}</tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <p class="mt-2 text-sm">Showing ${offset + 1} to ${Math.min(offset + config.rowsPerPage, totalRows)} of ${totalRows} rows</p>
                ${getPagination(tableName, page, totalRows, searchQuery, baseUrl)}
            `;
            
            res.send(getHtmlTemplate(content, baseUrl));
        } catch (err) {
            console.error('Database Error:', err);
            const errorMessage = err.message || 'Unable to connect to the database. Please check your connection string and ensure PostgreSQL is running.';
            res.send(getHtmlTemplate(`<div class="alert alert-error"><span>Error: ${errorMessage}</span></div>`, res.locals.baseUrl));
        }
    });

    // Edit Row (only if not read-only)
    if (!config.isReadOnly) {
        router.get('/table/:tableName/edit/:pkValue', async (req, res) => {
            try {
                const baseUrl = res.locals.baseUrl;
                const { tableName, pkValue } = req.params;
                const pkColumn = await getPrimaryKey(tableName);
                const result = await pool.query(
                    `SELECT * FROM "${tableName}" WHERE "${pkColumn}" = '${pkValue}'`
                );

                if (!result.rows[0]) {
                    return res.send(getHtmlTemplate('<div class="alert alert-warning"><span>Row not found</span></div>', baseUrl));
                }

                const row = result.rows[0];
                // Get column information for the table
                const columnsInfo = await pool.query(`
                    SELECT 
                        c.column_name, 
                        c.data_type, 
                        c.is_nullable,
                        pg_catalog.col_description(format('%s.%s', 'public', '${tableName}')::regclass::oid, c.ordinal_position) as column_comment
                    FROM information_schema.columns c
                    WHERE c.table_schema = 'public' AND c.table_name = '${tableName}'
                    ORDER BY c.ordinal_position
                `);
                
                // Create maps of column names to their data types and comments
                const columnTypes = {};
                const columnComments = {};
                columnsInfo.rows.forEach(col => {
                    columnTypes[col.column_name] = col.data_type;
                    columnComments[col.column_name] = col.column_comment;
                });
                
                const formFields = Object.entries(row).map(([key, value]) => {
                    const dataType = columnTypes[key] || 'text';
                    const inputType = getInputTypeForDataType(dataType);
                    
                    // Special handling for date fields
                    if (dataType === 'date') {
                        return `
                            <div class="form-control">
                                <label class="label">
                                    <span class="label-text">${key}</span>
                                    <span class="label-text-alt text-xs opacity-70">${dataType}</span>
                                </label>
                                <input type="date" name="${key}" value="${value === null ? '' : value}" 
                                    class="input input-bordered" 
                                    onchange="formatDateForSQL(this)">
                                ${columnComments[key] ? `<label class="label"><span class="label-text-alt text-xs text-info">${columnComments[key]}</span></label>` : ''}
                            </div>
                        `;
                    }
                    // Special handling for timestamp with timezone fields
                    else if (dataType === 'timestamp with time zone' || dataType === 'timestamptz') {
                        // Format the timestamp value for datetime-local input
                        let formattedValue = '';
                        if (value !== null) {
                            // Convert to a proper ISO string if it's not already
                            const date = new Date(value);
                            if (!isNaN(date.getTime())) {
                                // Format as YYYY-MM-DDThh:mm:ss
                                formattedValue = date.toISOString().slice(0, 19);
                            } else {
                                console.log('Invalid date value:', value);
                            }
                        }
                        
                        return `
                            <div class="form-control">
                                <label class="label">
                                    <span class="label-text">${key}</span>
                                    <span class="label-text-alt text-xs opacity-70">${dataType}</span>
                                </label>
                                <div class="flex gap-2">
                                    <input type="datetime-local" name="${key}" value="${formattedValue}" 
                                        class="input input-bordered flex-grow" 
                                        onchange="formatTimestampForSQL(this)">
                                    <select name="${key}_timezone" class="select select-bordered" onchange="updateTimezone('${key}')">
                                        <option value="UTC">UTC</option>
                                        <option value="America/New_York">America/New_York</option>
                                        <option value="America/Chicago">America/Chicago</option>
                                        <option value="America/Denver">America/Denver</option>
                                        <option value="America/Los_Angeles">America/Los_Angeles</option>
                                        <option value="Europe/London">Europe/London</option>
                                        <option value="Europe/Paris">Europe/Paris</option>
                                        <option value="Asia/Tokyo">Asia/Tokyo</option>
                                        <option value="Australia/Sydney">Australia/Sydney</option>
                                    </select>
                                </div>
                                ${columnComments[key] ? `<label class="label"><span class="label-text-alt text-xs text-info">${columnComments[key]}</span></label>` : ''}
                            </div>
                        `;
                    }
                    // Special handling for timestamp without timezone fields
                    else if (dataType === 'timestamp without time zone' || dataType === 'timestamp') {
                        // Format the timestamp value for datetime-local input
                        let formattedValue = '';
                        if (value !== null) {
                            // Convert to a proper ISO string if it's not already
                            const date = new Date(value);
                            if (!isNaN(date.getTime())) {
                                // Format as YYYY-MM-DDThh:mm:ss
                                formattedValue = date.toISOString().slice(0, 19);
                            } else {
                                console.log('Invalid date value:', value);
                            }
                        }
                        
                        return `
                            <div class="form-control">
                                <label class="label">
                                    <span class="label-text">${key}</span>
                                    <span class="label-text-alt text-xs opacity-70">${dataType}</span>
                                </label>
                                <input type="datetime-local" name="${key}" value="${formattedValue}" 
                                    class="input input-bordered" 
                                    onchange="formatTimestampForSQL(this)">
                                ${columnComments[key] ? `<label class="label"><span class="label-text-alt text-xs text-info">${columnComments[key]}</span></label>` : ''}
                            </div>
                        `;
                    }
                    // Default handling for other field types
                    else {
                        return `
                            <div class="form-control">
                                <label class="label">
                                    <span class="label-text">${key}</span>
                                    <span class="label-text-alt text-xs opacity-70">${dataType}</span>
                                </label>
                                <input type="${inputType}" name="${key}" value="${value === null ? '' : value}" class="input input-bordered">
                                ${columnComments[key] ? `<label class="label"><span class="label-text-alt text-xs text-info">${columnComments[key]}</span></label>` : ''}
                            </div>
                        `;
                    }
                }).join('');

                const content = `
                    <h2 class="text-2xl mb-2">Edit Row in <a href="${baseUrl}/table/${tableName}" class="link link-primary">${tableName}</a></h2>
                    <form method="POST" action="${baseUrl}/table/${tableName}/edit/${pkValue}" class="space-y-4">
                        <script>
                            // Function to format date values for SQL
                            function formatDateForSQL(input) {
                                // Date inputs already return YYYY-MM-DD format which is SQL compatible
                                // This function exists for potential future formatting needs
                                console.log('Date formatted for SQL:', input.value);
                            }
                            
                            // Function to format timestamp values for SQL
                            function formatTimestampForSQL(input) {
                                // Ensure the timestamp has the correct format for SQL
                                console.log('Timestamp formatted for SQL:', input.value);
                            }
                            
                            // Function to update timestamp with timezone
                            function updateTimezone(fieldName) {
                                const datetimeInput = document.querySelector('input[name="' + fieldName + '"]');
                                const timezoneSelect = document.querySelector('select[name="' + fieldName + '_timezone"]');
                                console.log('Updating timezone for', fieldName, 'to', timezoneSelect.value);
                                // In a real implementation, this would modify the datetime value
                                // based on the selected timezone
                            }
                        </script>
                        ${formFields}
                        <div class="flex gap-2">
                            <button type="submit" class="btn btn-primary">Save</button>
                            <a href="${baseUrl}/table/${tableName}" class="btn btn-ghost">Cancel</a>
                        </div>
                    </form>
                `;
                
                res.send(getHtmlTemplate(content, baseUrl));
            } catch (err) {
                console.error('Database Error:', err);
                const errorMessage = err.message || 'Unable to connect to the database. Please check your connection string and ensure PostgreSQL is running.';
                res.send(getHtmlTemplate(`<div class="alert alert-error"><span>Error: ${errorMessage}</span></div>`, res.locals.baseUrl));
            }
        });

        router.post('/table/:tableName/edit/:pkValue', async (req, res) => {
            try {
                const baseUrl = res.locals.baseUrl;
                const { tableName, pkValue } = req.params;
                const pkColumn = await getPrimaryKey(tableName);
                const updates = req.body;
                
                // Build the SET clause with values directly in the query
                const setClause = Object.entries(updates)
                    .map(([key, value]) => {
                        // Handle different value types
                        if (value === null) {
                            return `"${key}" = NULL`;
                        } else if (typeof value === 'number') {
                            return `"${key}" = ${value}`;
                        } else {
                            // Escape single quotes in string values
                            const escapedValue = value.toString().replace(/'/g, "''");
                            return `"${key}" = '${escapedValue}'`;
                        }
                    })
                    .join(', ');

                await pool.query(
                    `UPDATE "${tableName}" SET ${setClause} WHERE "${pkColumn}" = '${pkValue}'`
                );

                res.redirect(`${baseUrl}/table/${tableName}`);
            } catch (err) {
                console.error('Database Error:', err);
                const errorMessage = err.message || 'Unable to connect to the database. Please check your connection string and ensure PostgreSQL is running.';
                res.send(getHtmlTemplate(`<div class="alert alert-error"><span>Error: ${errorMessage}</span></div>`, res.locals.baseUrl));
            }
        });
        
        // Delete Row
        router.post('/table/:tableName/delete/:pkValue', async (req, res) => {
            try {
                const baseUrl = res.locals.baseUrl;
                const { tableName, pkValue } = req.params;
                
                // Validate table name
                if (!validateIdentifier(tableName)) {
                    return res.status(400).send('Invalid table name');
                }
                
                const pkColumn = await getPrimaryKey(tableName);
                
                // Use parameterized query for security
                await pool.query(
                    `DELETE FROM "${tableName}" WHERE "${pkColumn}" = $1`,
                    [pkValue]
                );
                
                res.redirect(`${baseUrl}/table/${tableName}`);
            } catch (err) {
                console.error('Database Error:', err);
                const errorMessage = err.message || 'Unable to delete the row. Please try again.';
                res.send(getHtmlTemplate(`<div class="alert alert-error"><span>Error: ${escapeHtml(errorMessage)}</span></div>`, res.locals.baseUrl));
            }
        });
        
        // Bulk Delete Rows
        router.post('/table/:tableName/bulk-delete', async (req, res) => {
            try {
                const baseUrl = res.locals.baseUrl;
                const { tableName } = req.params;
                const { ids } = req.body;
                
                // Validate table name
                if (!validateIdentifier(tableName)) {
                    return res.status(400).send('Invalid table name');
                }
                
                // Parse and validate IDs
                let idArray;
                try {
                    idArray = JSON.parse(ids);
                    if (!Array.isArray(idArray) || idArray.length === 0) {
                        throw new Error('Invalid IDs');
                    }
                } catch (e) {
                    return res.status(400).send('Invalid IDs provided');
                }
                
                const pkColumn = await getPrimaryKey(tableName);
                
                // Use parameterized query with IN clause for security
                const placeholders = idArray.map((_, i) => `$${i + 1}`).join(',');
                await pool.query(
                    `DELETE FROM "${tableName}" WHERE "${pkColumn}" IN (${placeholders})`,
                    idArray
                );
                
                res.redirect(`${baseUrl}/table/${tableName}`);
            } catch (err) {
                console.error('Bulk Delete Error:', err);
                const errorMessage = err.message || 'Unable to delete rows. Please try again.';
                res.send(getHtmlTemplate(`<div class="alert alert-error"><span>Error: ${escapeHtml(errorMessage)}</span></div>`, res.locals.baseUrl));
            }
        });
        
        // Insert Row
        router.post('/table/:tableName/insert', async (req, res) => {
            try {
                const baseUrl = res.locals.baseUrl;
                const { tableName } = req.params;
                const data = req.body;
                
                // Filter out empty values for nullable columns
                const filteredData = Object.fromEntries(
                    Object.entries(data).filter(([_, value]) => value !== '')
                );
                
                if (Object.keys(filteredData).length === 0) {
                    return res.send(getHtmlTemplate('<div class="alert alert-error"><span>Error: No data provided for insert</span></div>', baseUrl));
                }
                
                const columns = Object.keys(filteredData);
                const values = Object.values(filteredData).map(value => {
                    if (value === null) {
                        return 'NULL';
                    } else if (typeof value === 'number') {
                        return value;
                    } else {
                        // Escape single quotes in string values
                        const escapedValue = value.toString().replace(/'/g, "''");
                        return `'${escapedValue}'`;
                    }
                });
                
                const query = `INSERT INTO "${tableName}" (${columns.map(col => `"${col}"`).join(', ')}) VALUES (${values.join(', ')})`;
                
                await pool.query(query);
                
                res.redirect(`${baseUrl}/table/${tableName}`);
            } catch (err) {
                console.error('Database Error:', err);
                const errorMessage = err.message || 'Unable to insert data. Please check your input and try again.';
                res.send(getHtmlTemplate(`<div class="alert alert-error"><span>Error: ${errorMessage}</span></div>`, res.locals.baseUrl));
            }
        });
    }

    // Export table data to CSV or JSON
    router.get('/table/:tableName/export', async (req, res) => {
        try {
            const tableName = req.params.tableName;
            const format = req.query.format || 'csv';
            const exportAll = req.query.all === 'true';
            
            // Validate table name
            if (!validateIdentifier(tableName)) {
                return res.status(400).send('Invalid table name');
            }
            
            // Validate format
            if (!['csv', 'json'].includes(format)) {
                return res.status(400).send('Invalid format. Use csv or json');
            }
            
            // Get column information
            const columnInfo = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = $1
                ORDER BY ordinal_position
            `, [tableName]);
            
            const columns = columnInfo.rows.map(row => row.column_name);
            
            // Fetch data
            let query;
            if (exportAll) {
                query = `SELECT * FROM "${tableName}"`;
            } else {
                query = `SELECT * FROM "${tableName}" LIMIT $1`;
            }
            
            const result = exportAll 
                ? await pool.query(query)
                : await pool.query(query, [config.rowsPerPage]);
            
            // Sanitize filename
            const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${safeTableName}_${timestamp}.${format}`;
            
            if (format === 'json') {
                // JSON export
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                res.json(result.rows);
            } else {
                // CSV export with security sanitization
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                
                // CSV header
                const csvHeader = columns.map(col => `"${col.replace(/"/g, '""')}"`).join(',');
                
                // CSV rows with proper escaping to prevent CSV injection
                const csvRows = result.rows.map(row => {
                    return columns.map(col => {
                        const val = row[col];
                        if (val === null) return '';
                        const str = String(val);
                        // Escape quotes and wrap in quotes if contains special chars
                        const needsQuotes = str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r');
                        const escaped = str.replace(/"/g, '""');
                        // Prevent formula injection by prefixing with single quote if starts with =, +, -, @
                        const sanitized = /^[=+\-@]/.test(escaped) ? "'" + escaped : escaped;
                        return needsQuotes ? `"${sanitized}"` : sanitized;
                    }).join(',');
                });
                
                res.send([csvHeader, ...csvRows].join('\n'));
            }
        } catch (err) {
            console.error('Export Error:', err);
            res.status(500).send(`Error: ${escapeHtml(err.message)}`);
        }
    });

    // Logout route
    router.get('/logout', (req, res) => {
        // For Basic Auth, we need to send a 401 with a different realm to force re-authentication
        res.set('WWW-Authenticate', 'Basic realm="NodeminLogout-' + Date.now() + '"');
        
        // Send a response with instructions
        res.status(401).send(`
            <html>
            <head>
                <title>Logged Out</title>
                <link href="https://cdn.jsdelivr.net/npm/daisyui@4.7.2/dist/full.min.css" rel="stylesheet" type="text/css" />
                <script src="https://cdn.tailwindcss.com"></script>
            </head>
            <body class="bg-base-100 flex items-center justify-center min-h-screen">
                <div class="card w-96 bg-base-100 shadow-xl">
                    <div class="card-body">
                        <h2 class="card-title text-success">Logged Out Successfully</h2>
                        <p class="py-4">You have been logged out of Nodemin.</p>
                        <p class="text-sm text-warning mb-4">Note: Due to how browsers handle Basic Authentication, you may need to close your browser to complete the logout process.</p>
                        <div class="card-actions justify-end">
                            <a href="${res.locals.baseUrl}" class="btn btn-primary">Log In Again</a>
                        </div>
                    </div>
                </div>
                <script>
                    // Clear any cached credentials by making a request with invalid credentials
                    fetch('${res.locals.baseUrl}', {
                        headers: {
                            'Authorization': 'Basic invalid'
                        }
                    }).then(() => {
                        console.log('Credentials cleared');
                    });
                </script>
            </body>
            </html>
        `);
    });
    
    // Query History storage (in-memory, per-session)
    const queryHistory = new Map();
    const MAX_HISTORY_ITEMS = 50;

    // Execute SQL Query
    router.post('/execute-sql', async (req, res) => {
        try {
            // Check if read-only mode is enabled
            if (config.isReadOnly) {
                return res.json({
                    error: 'SQL execution is disabled in read-only mode'
                });
            }

            const { query } = req.body;
            
            if (!query || typeof query !== 'string') {
                return res.json({
                    error: 'Invalid query. Please provide a valid SQL query.'
                });
            }

            // Execute the query
            const result = await pool.query(query);
            
            // Save to query history
            const sessionId = getSessionId(req);
            if (!queryHistory.has(sessionId)) {
                queryHistory.set(sessionId, []);
            }
            const history = queryHistory.get(sessionId);
            history.unshift({
                query: query.substring(0, 1000), // Limit query length
                timestamp: new Date().toISOString(),
                command: result.command,
                rowCount: result.rowCount
            });
            // Keep only last N items
            if (history.length > MAX_HISTORY_ITEMS) {
                history.pop();
            }
            
            // Return the result
            res.json({
                command: result.command,
                rowCount: result.rowCount,
                rows: result.rows || []
            });
        } catch (err) {
            console.error('SQL Execution Error:', err);
            const errorMessage = err.message || 'An error occurred while executing the SQL query';
            res.json({
                error: errorMessage
            });
        }
    });

    // Get Query History
    router.get('/query-history', (req, res) => {
        const sessionId = getSessionId(req);
        const history = queryHistory.get(sessionId) || [];
        res.json(history);
    });

    // Clear Query History
    router.post('/clear-query-history', (req, res) => {
        const sessionId = getSessionId(req);
        queryHistory.delete(sessionId);
        res.json({ success: true });
    });

    // Connection Profiles API
    // Store profiles in memory (could be extended to use a config file)
    const connectionProfiles = new Map();
    
    router.get('/api/profiles', (req, res) => {
        const sessionId = getSessionId(req);
        const profiles = connectionProfiles.get(sessionId) || [];
        // Don't send passwords back
        const safeProfiles = profiles.map(p => ({
            id: p.id,
            name: p.name,
            host: p.host,
            database: p.database,
            username: p.username,
            // Don't include password
        }));
        res.json(safeProfiles);
    });
    
    router.post('/api/profiles', (req, res) => {
        try {
            const sessionId = getSessionId(req);
            const { name, host, port, database, username, password, ssl } = req.body;
            
            // Validate inputs
            if (!name || !host || !database || !username) {
                return res.status(400).json({ error: 'Missing required fields' });
            }
            
            if (!connectionProfiles.has(sessionId)) {
                connectionProfiles.set(sessionId, []);
            }
            
            const profiles = connectionProfiles.get(sessionId);
            const profile = {
                id: crypto.randomUUID(),
                name: name.substring(0, 50),
                host: host.substring(0, 100),
                port: parseInt(port) || 5432,
                database: database.substring(0, 100),
                username: username.substring(0, 100),
                password: password, // In production, encrypt this
                ssl: ssl || false,
                createdAt: new Date().toISOString()
            };
            
            profiles.push(profile);
            res.json({ success: true, profile: { id: profile.id, name: profile.name } });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    
    router.delete('/api/profiles/:id', (req, res) => {
        const sessionId = getSessionId(req);
        const profileId = req.params.id;
        
        if (!connectionProfiles.has(sessionId)) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        
        const profiles = connectionProfiles.get(sessionId);
        const index = profiles.findIndex(p => p.id === profileId);
        
        if (index === -1) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        
        profiles.splice(index, 1);
        res.json({ success: true });
    });

    return router;
};

module.exports = nodemin;
