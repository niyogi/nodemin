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

    // Middleware to set baseUrl for each request
    router.use((req, res, next) => {
        res.locals.baseUrl = config.basePath || req.baseUrl || '';
        next();
    });

    // Get primary key for a table
    async function getPrimaryKey(tableName) {
        const result = await pool.query(`
            SELECT a.attname
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = $1::regclass
            AND i.indisprimary
        `, [tableName]);
        return result.rows[0]?.attname || 'id';
    }

    // HTML Template with DaisyUI and Modal Script
    const getHtmlTemplate = (content, baseUrl) => `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Nodemin</title>
            <link href="https://cdn.jsdelivr.net/npm/daisyui@4.7.2/dist/full.min.css" rel="stylesheet" type="text/css" />
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-base-100">
            <div class="container mx-auto p-4">
                <h1 class="text-3xl font-bold mb-4">Nodemin${config.isReadOnly ? ' <span class="text-error">(Read-Only)</span>' : ''}</h1>
                ${content}
            </div>
            <script>
                document.querySelectorAll('.structure-link').forEach(link => {
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        const modalId = link.getAttribute('data-modal');
                        document.getElementById(modalId).showModal();
                    });
                });
            </script>
        </body>
        </html>
    `;

    // Pagination component
    const getPagination = (tableName, currentPage, totalRows, searchQuery = '', baseUrl) => {
        const totalPages = Math.ceil(totalRows / config.rowsPerPage);
        const basePath = searchQuery ? `${baseUrl}/table/${tableName}/search?q=${encodeURIComponent(searchQuery)}` : `${baseUrl}/table/${tableName}`;
        
        let pagination = '<div class="join mt-4">';
        pagination += currentPage > 1 
            ? `<a href="${basePath}&page=${currentPage - 1}" class="join-item btn">«</a>`
            : '<button class="join-item btn" disabled>«</button>';

        pagination += `<button class="join-item btn">Page ${currentPage} of ${totalPages}</button>`;

        pagination += currentPage < totalPages 
            ? `<a href="${basePath}&page=${currentPage + 1}" class="join-item btn">»</a>`
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
                const columns = await pool.query(`
                    SELECT 
                        column_name, 
                        data_type, 
                        is_nullable, 
                        column_default
                    FROM information_schema.columns 
                    WHERE table_schema = 'public' AND table_name = $1
                    ORDER BY ordinal_position
                `, [tableName]);

                const pkResult = await pool.query(`
                    SELECT a.attname
                    FROM pg_index i
                    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                    WHERE i.indrelid = $1::regclass AND i.indisprimary
                `, [tableName]);
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
            res.send(getHtmlTemplate(`<div class="alert alert-error"><span>Error: ${err.message}</span></div>`, res.locals.baseUrl));
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
            
            const countResult = await pool.query(`SELECT COUNT(*) FROM ${tableName}`);
            const totalRows = parseInt(countResult.rows[0].count);

            const result = await pool.query(
                `SELECT * FROM ${tableName} ORDER BY ${pkColumn} LIMIT $1 OFFSET $2`,
                [config.rowsPerPage, offset]
            );

            const headers = Object.keys(result.rows[0] || {}).map(col => `<th>${col}</th>`).join('');
            const rows = result.rows.map(row => {
                const cells = Object.values(row).map(val => `<td>${val === null ? 'NULL' : val}</td>`).join('');
                return `<tr>${cells}${
                    !config.isReadOnly ? `<td><a href="${baseUrl}/table/${tableName}/edit/${row[pkColumn]}" class="btn btn-xs btn-primary">Edit</a></td>` : ''
                }</tr>`;
            }).join('');

            const content = `
                <h2 class="text-2xl mb-2">${tableName}</h2>
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
            `;
            
            res.send(getHtmlTemplate(content, baseUrl));
        } catch (err) {
            res.send(getHtmlTemplate(`<div class="alert alert-error"><span>Error: ${err.message}</span></div>`, res.locals.baseUrl));
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

            const countResult = await pool.query(`
                SELECT COUNT(*) FROM ${tableName} 
                WHERE to_tsvector(${Object.keys((await pool.query(`SELECT * FROM ${tableName} LIMIT 1`)).rows[0] || {})
                    .map(col => `COALESCE(${col}::text, '')`).join(' || ')}) 
                @@ to_tsquery($1)
            `, [searchQuery]);
            const totalRows = parseInt(countResult.rows[0].count);

            const result = await pool.query(`
                SELECT * FROM ${tableName} 
                WHERE to_tsvector(${Object.keys((await pool.query(`SELECT * FROM ${tableName} LIMIT 1`)).rows[0] || {})
                    .map(col => `COALESCE(${col}::text, '')`).join(' || ')}) 
                @@ to_tsquery($1)
                ORDER BY ${pkColumn}
                LIMIT $2 OFFSET $3
            `, [searchQuery, config.rowsPerPage, offset]);

            const headers = Object.keys(result.rows[0] || {}).map(col => `<th>${col}</th>`).join('');
            const rows = result.rows.map(row => {
                const cells = Object.values(row).map(val => `<td>${val === null ? 'NULL' : val}</td>`).join('');
                return `<tr>${cells}${
                    !config.isReadOnly ? `<td><a href="${baseUrl}/table/${tableName}/edit/${row[pkColumn]}" class="btn btn-xs btn-primary">Edit</a></td>` : ''
                }</tr>`;
            }).join('');

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
            res.send(getHtmlTemplate(`<div class="alert alert-error"><span>Error: ${err.message}</span></div>`, res.locals.baseUrl));
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
                    `SELECT * FROM ${tableName} WHERE ${pkColumn} = $1`,
                    [pkValue]
                );

                if (!result.rows[0]) {
                    return res.send(getHtmlTemplate('<div class="alert alert-warning"><span>Row not found</span></div>', baseUrl));
                }

                const row = result.rows[0];
                const formFields = Object.entries(row).map(([key, value]) => `
                    <div class="form-control">
                        <label class="label"><span class="label-text">${key}</span></label>
                        <input type="text" name="${key}" value="${value === null ? '' : value}" class="input input-bordered">
                    </div>
                `).join('');

                const content = `
                    <h2 class="text-2xl mb-2">Edit Row in ${tableName}</h2>
                    <form method="POST" action="${baseUrl}/table/${tableName}/edit/${pkValue}" class="space-y-4">
                        ${formFields}
                        <div class="flex gap-2">
                            <button type="submit" class="btn btn-primary">Save</button>
                            <a href="${baseUrl}/table/${tableName}" class="btn btn-ghost">Cancel</a>
                        </div>
                    </form>
                `;
                
                res.send(getHtmlTemplate(content, baseUrl));
            } catch (err) {
                res.send(getHtmlTemplate(`<div class="alert alert-error"><span>Error: ${err.message}</span></div>`, res.locals.baseUrl));
            }
        });

        router.post('/table/:tableName/edit/:pkValue', async (req, res) => {
            try {
                const baseUrl = res.locals.baseUrl;
                const { tableName, pkValue } = req.params;
                const pkColumn = await getPrimaryKey(tableName);
                const updates = req.body;
                
                const setClause = Object.keys(updates)
                    .map((key, i) => `${key} = $${i + 1}`)
                    .join(', ');
                const values = Object.values(updates);

                await pool.query(
                    `UPDATE ${tableName} SET ${setClause} WHERE ${pkColumn} = $${values.length + 1}`,
                    [...values, pkValue]
                );

                res.redirect(`${baseUrl}/table/${tableName}`);
            } catch (err) {
                res.send(getHtmlTemplate(`<div class="alert alert-error"><span>Error: ${err.message}</span></div>`, res.locals.baseUrl));
            }
        });
    }

    return router;
};

module.exports = nodemin;