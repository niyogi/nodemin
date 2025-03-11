// nodemin.js
const express = require('express');
const { Pool } = require('pg');
const basicAuth = require('express-basic-auth');
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

    // Get primary key for a table
    async function getPrimaryKey(tableName) {
        try {
            // Use a safer approach with explicit casting and error handling
            const result = await pool.query(`
                SELECT a.attname
                FROM pg_index i
                JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                WHERE i.indrelid = ('"' || '${tableName}' || '"')::regclass
                AND i.indisprimary
            `);
            
            return result.rows[0]?.attname || 'id';
        } catch (err) {
            console.error('Error getting primary key:', err);
            return 'id'; // Default to 'id' if we can't determine the primary key
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
    const getHtmlTemplate = (content, baseUrl) => `
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
            </div>
            <script>
                // CodeMirror editor instance
                let sqlEditor;
                
                // Load saved theme from localStorage or use default
                document.addEventListener('DOMContentLoaded', function() {
                    const savedTheme = localStorage.getItem('nodemin-theme');
                    if (savedTheme) {
                        document.documentElement.setAttribute('data-theme', savedTheme);
                    }
                    
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
                    });
                }
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

    // Home - List Tables with Structure Links
    router.get('', async (req, res) => {
        try {
            const baseUrl = res.locals.baseUrl;
            const result = await pool.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name
            `);
            
            let modals = '';
            const tables = await Promise.all(result.rows.map(async row => {
                const tableName = row.table_name;
                
                // Get row count for the table - using a safe approach to include table name
                const countResult = await pool.query(`SELECT COUNT(*) FROM "${tableName}"`);
                const rowCount = parseInt(countResult.rows[0].count);
                
                const columns = await pool.query(`
                    SELECT 
                        column_name, 
                        data_type, 
                        is_nullable, 
                        column_default
                    FROM information_schema.columns 
                    WHERE table_schema = 'public' AND table_name = '${tableName}'
                    ORDER BY ordinal_position
                `);

                const pkResult = await pool.query(`
                    SELECT a.attname
                    FROM pg_index i
                    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                    WHERE i.indrelid = ('"' || '${tableName}' || '"')::regclass AND i.indisprimary
                `);
                const primaryKeys = pkResult.rows.map(r => r.attname);

                const columnRows = columns.rows.map(col => `
                    <tr>
                        <td>${col.column_name}${primaryKeys.includes(col.column_name) ? ' <span class="badge badge-primary">PK</span>' : ''}</td>
                        <td>${col.data_type}</td>
                        <td>${col.is_nullable}</td>
                        <td>${col.column_default || 'NULL'}</td>
                    </tr>
                `).join('');

                modals += `
                    <dialog id="modal_${tableName}" class="modal">
                        <div class="modal-box">
                            <h3 class="font-bold text-lg">${tableName} Structure</h3>
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
                        <a href="${baseUrl}/table/${tableName}" class="link link-primary">${tableName}</a>
                        <span class="badge badge-sm badge-outline ml-2">${rowCount} rows</span>
                        <a href="#" class="link link-secondary text-sm ml-2 structure-link" data-modal="modal_${tableName}">[Structure]</a>
                    </li>
                `;
            }));

            const content = `
                <h2 class="text-2xl mb-2">Tables</h2>
                <ul class="list-disc pl-5">${tables.join('')}</ul>
                ${modals}
            `;
            
            res.send(getHtmlTemplate(content, baseUrl));
        } catch (err) {
            console.error('Database Error:', err);
            const errorMessage = err.message || 'Unable to connect to the database. Please check your connection string and ensure PostgreSQL is running.';
            res.send(getHtmlTemplate(`<div class="alert alert-error"><span>Error: ${errorMessage}</span></div>`, res.locals.baseUrl));
        }
    });

    // Table View
    router.get('/table/:tableName', async (req, res) => {
        try {
            const baseUrl = res.locals.baseUrl;
            const tableName = req.params.tableName;
            const page = parseInt(req.query.page) || 1;
            const offset = (page - 1) * config.rowsPerPage;
            const pkColumn = await getPrimaryKey(tableName);
            
            const countResult = await pool.query(`SELECT COUNT(*) FROM "${tableName}"`);
            const totalRows = parseInt(countResult.rows[0].count);

            // Get column information first to handle empty tables
            const columnListInfo = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = '${tableName}'
                ORDER BY ordinal_position
            `);
            
            const columnNames = columnListInfo.rows.map(row => row.column_name);
            
            // Now query the actual data - handle the case where there might not be a primary key
            let result;
            try {
                // Use a completely different approach to avoid parameter type issues
                // First get the primary key column name
                console.log('Table name:', tableName);
                console.log('Primary key column:', pkColumn);
                
                // Build the query without using parameters
                let query;
                if (pkColumn && pkColumn !== 'id') {
                    // If we have a valid primary key that's not the default 'id'
                    query = `SELECT * FROM "${tableName}" ORDER BY "${pkColumn}" LIMIT ${config.rowsPerPage} OFFSET ${offset}`;
                } else {
                    // If we don't have a valid primary key or it's the default 'id', try without ordering
                    query = `SELECT * FROM "${tableName}" LIMIT ${config.rowsPerPage} OFFSET ${offset}`;
                }
                
                console.log('Executing query:', query);
                result = await pool.query(query);
            } catch (err) {
                // If the query fails, try a simpler query without ordering
                console.error('Error executing query:', err);
                
                try {
                    const simpleQuery = `SELECT * FROM "${tableName}" LIMIT ${config.rowsPerPage} OFFSET ${offset}`;
                    console.log('Trying simple query:', simpleQuery);
                    result = await pool.query(simpleQuery);
                } catch (fallbackErr) {
                    console.error('Error with simple query:', fallbackErr);
                    throw fallbackErr; // Re-throw to be caught by the outer try/catch
                }
            }

            // Generate headers from column names, not from the first row (which might not exist)
            const headers = columnNames.map(col => `<th>${col}</th>`).join('');
            
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
                : `<tr><td colspan="${columnNames.length + (!config.isReadOnly ? 1 : 0)}" class="text-center">No data found</td></tr>`;

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
            
            const content = `
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl">${tableName}</h2>
                    ${!config.isReadOnly ? `<button class="btn btn-primary" onclick="document.getElementById('insert_modal_${tableName}').showModal()">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-1">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Insert
                    </button>` : ''}
                </div>
                <form class="mb-4 flex gap-2" method="GET" action="${baseUrl}/table/${tableName}/search">
                    <input type="text" name="q" placeholder="Search table..." class="input input-bordered w-full max-w-xs">
                    <button type="submit" class="btn btn-primary">Search</button>
                </form>
                <div class="overflow-x-auto">
                    <table class="table table-zebra w-full">
                        <thead><tr>${headers}${!config.isReadOnly ? '<th>Actions</th>' : ''}</tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <p class="mt-2 text-sm">Showing ${offset + 1} to ${Math.min(offset + config.rowsPerPage, totalRows)} of ${totalRows} rows</p>
                ${getPagination(tableName, page, totalRows, '', baseUrl)}
                ${insertModal}
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
                const pkColumn = await getPrimaryKey(tableName);
                
                await pool.query(
                    `DELETE FROM "${tableName}" WHERE "${pkColumn}" = '${pkValue}'`
                );
                
                res.redirect(`${baseUrl}/table/${tableName}`);
            } catch (err) {
                console.error('Database Error:', err);
                const errorMessage = err.message || 'Unable to delete the row. Please try again.';
                res.send(getHtmlTemplate(`<div class="alert alert-error"><span>Error: ${errorMessage}</span></div>`, res.locals.baseUrl));
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

    return router;
};

module.exports = nodemin;
