# Nodemin

A lightweight Node.js module for managing PostgreSQL databases through a web interface. Nodemin provides a simple alternative to tools like Adminer, with features for database management and exploration.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation Guide](#installation-guide)
  - [Step 1: Set Up Project](#step-1-set-up-project)
  - [Step 2: Install Dependencies](#step-2-install-dependencies)
  - [Step 3: Add Nodemin Module](#step-3-add-nodemin-module)
  - [Step 4: Create Express Server](#step-4-create-express-server)
  - [Step 5: Configure Environment Variables](#step-5-configure-environment-variables)
- [Running the Application](#running-the-application)
- [Usage Guide](#usage-guide)
- [Configuration Options](#configuration-options)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Features

- List all tables in the `public` schema
- View table data with pagination (default 25 rows per page)
- Search across all columns using PostgreSQL full-text search
- Edit rows (when not in read-only mode)
- View table structure in a modal
- Basic authentication
- Read-only mode support
- Configurable via environment variables

## Prerequisites

- Node.js (v14 or higher recommended)
- PostgreSQL database
- An existing Express application or willingness to create one

## Installation Guide

### Step 1: Set Up Project

Create a new project or use an existing one:

```bash
# Create a new project
mkdir my-nodemin-app
cd my-nodemin-app
npm init -y
```

### Step 2: Install Dependencies

Install the required dependencies:

```bash
npm install express pg express-basic-auth dotenv
```

These packages provide:
- `express`: Web framework
- `pg`: PostgreSQL client
- `express-basic-auth`: Basic authentication middleware
- `dotenv`: Loads environment variables from a .env file

### Step 3: Add Nodemin Module

Save the provided `nodemin.js` file into your project directory:

```bash
# Ensure the file is in the root of your project alongside package.json
```

### Step 4: Create Express Server

Create a `server.js` file in your project root with the following content:

```javascript
const express = require('express');
const nodemin = require('./nodemin');

const app = express();
app.use('/admin', nodemin()); // Mount Nodemin at /admin

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
```

### Step 5: Configure Environment Variables

Create a `.env` file in your project root:

```
PG_CONNECTION_STRING=postgresql://user:password@localhost:5432/dbname
PG_READ_ONLY=false
ADMIN_USERNAME=admin
ADMIN_PASSWORD=secretpassword
ROWS_PER_PAGE=25
BASE_PATH=/admin
```

Replace `user`, `password`, and `dbname` with your PostgreSQL credentials and database name.

> **Note**: If you omit the `.env` file, default values will be used.

## Running the Application

1. **Ensure PostgreSQL is running**:
   
   Start your PostgreSQL server and verify the database specified in `PG_CONNECTION_STRING` exists and is accessible.

   ```bash
   # Example (if using a local PostgreSQL):
   psql -U user -d dbname
   ```

   If you encounter connection issues, check your PostgreSQL configuration (e.g., `pg_hba.conf`).

2. **Start the Nodemin server**:

   From your project directory, run:

   ```bash
   node server.js
   ```

   You should see "Server running on port 3000" in the terminal.

3. **Access Nodemin in your browser**:

   Navigate to `http://localhost:3000/admin` (or the path you mounted it at).
   
   Enter the username and password (default: admin/password123 unless overridden in `.env`).

## Usage Guide

- **Home Page**: Displays all tables in the public schema with links to view data and "[Structure]" to see the schema in a modal.
- **Table View**: Shows paginated table data with a search bar.
- **Search**: Enter a query to search all columns; results are paginated.
- **Edit**: Click "Edit" on a row to modify it (available unless `PG_READ_ONLY=true`).
- **Structure**: Click "[Structure]" to view column details (name, type, nullability, default).

## Configuration Options

| Environment Variable    | Description                       | Default Value                                |
|-------------------------|-----------------------------------|---------------------------------------------|
| PG_CONNECTION_STRING    | PostgreSQL connection string      | postgresql://user:password@localhost:5432/dbname |
| PG_READ_ONLY            | Enable read-only mode (true/false)| false                                       |
| ADMIN_USERNAME          | Basic auth username               | admin                                       |
| ADMIN_PASSWORD          | Basic auth password               | password123                                 |
| ROWS_PER_PAGE           | Rows per page                     | 25                                          |
| BASE_PATH               | Override base URL (optional)      | Derived from mount point                    |

## Security Considerations

- Uses basic authentication; use HTTPS in production for security.
- SQL injection is prevented with parameterized queries.
- Add CSRF protection and rate limiting for production use.

## Troubleshooting

### 404 Errors After Clicking a Table
- Ensure `nodemin.js` is correctly required in `server.js` (require('./nodemin')).
- Verify the mount path in `app.use('/admin', nodemin())` matches your URL (e.g., `/admin`).

### Cannot Connect to Database
- Check `PG_CONNECTION_STRING` in `.env` or ensure the default matches your setup.
- Run `psql -U user -d dbname` to test connectivity.

### No Tables Listed
- Ensure the database user has access to the public schema and tables exist.
- Run `GRANT ALL ON SCHEMA public TO user;` in PostgreSQL if needed.

### Server Not Starting
- Check for syntax errors in `server.js` or `nodemin.js`.
- Verify all dependencies are installed (`npm install`).

## License

MIT License - free to use, modify, and distribute.
