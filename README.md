# Nodemin

A lightweight Node.js module for managing PostgreSQL databases through a web interface. Nodemin provides a simple alternative to tools like Adminer or phpPgAdmin, with features for database management and exploration.

## Features

- **Database Exploration**
  - List all tables in the `public` schema
  - View table structure with column details
  - Browse table data with pagination
  - Search across all columns using PostgreSQL full-text search
  
- **Data Management**
  - Insert new records with type-appropriate form fields
  - Edit existing rows with a simple interface
  - Execute custom SQL queries with syntax highlighting
  - View query results in an expandable modal
  
- **User Experience**
  - Modern UI with DaisyUI components
  - Multiple theme options
  - Responsive design
  - Home navigation and logout functionality
  
- **Security**
  - Basic authentication protection
  - Optional read-only mode
  - SQL injection prevention through parameterized queries or properly escaped direct queries
  
- **Advanced Data Handling**
  - Special handling for various PostgreSQL data types (date, timestamp, JSON, etc.)
  - Timezone support for timestamp fields
  - Automatic detection of primary keys
  - Auto-increment field detection

## Installation Guide

### Prerequisites

- Node.js (v14 or higher recommended)
- PostgreSQL database
- npm or yarn package manager

### Step 1: Create a New Project

```bash
# Create a new directory for your project
mkdir nodemin-app
cd nodemin-app

# Initialize a new Node.js project
npm init -y
```

### Step 2: Install Required Dependencies

```bash
npm install express pg express-basic-auth dotenv
```

These packages provide:
- `express`: Web framework for creating the server
- `pg`: PostgreSQL client for database connections
- `express-basic-auth`: Authentication middleware
- `dotenv`: Environment variable management

### Step 3: Set Up Project Files

Create the following files in your project directory:

1. **nodemin.js** - The main module file (copy from repository)
2. **server.js** - The Express server setup:

```javascript
const express = require('express');
const nodemin = require('./nodemin');

const app = express();

// Mount Nodemin at /admin path
app.use('/admin', nodemin());

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Nodemin server running on http://localhost:${PORT}/admin`);
});
```

### Step 4: Configure Environment Variables

Create a `.env` file in your project root:

```
# Database Connection
PG_CONNECTION_STRING=postgresql://username:password@localhost:5432/database_name

# Authentication
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password

# Configuration
PG_READ_ONLY=false
ROWS_PER_PAGE=25
BASE_PATH=/admin
```

For convenience, you can also create a `.env.example` file with the same structure but without sensitive values.

### Step 5: Start the Server

```bash
node server.js
```

Navigate to `http://localhost:3000/admin` in your browser and enter the credentials you specified in the `.env` file.

## Usage Guide

### Home Screen

The home screen displays all tables in your database's public schema. From here you can:

- Click on a table name to view its data
- Click on [Structure] to see the table's column definitions
- Use the theme selector to change the UI appearance
- Execute custom SQL queries
- Log out of the application

### Table View

When viewing a table, you can:

- Browse paginated data with next/previous controls
- Search across all columns using the search bar
- Click "Insert" to add a new record
- Click "Edit" on any row to modify its data (if not in read-only mode)
- Return to the home screen by clicking the Nodemin title

### Data Manipulation

#### Inserting Records

1. Click the "Insert" button above the table
2. Fill in the form fields (required fields are marked with *)
3. Click "Insert" to save the new record

#### Editing Records

1. Click "Edit" on the row you want to modify
2. Update the values in the form
3. Click "Save" to apply your changes

#### Executing SQL

1. Click "Execute SQL" in the top navigation
2. Enter your SQL query in the editor
3. Click "Execute" and confirm
4. View the results in the expandable results modal

### Logging Out

Click the "Logout" button in the top-right corner to end your session. For complete logout, you may need to close your browser due to how HTTP Basic Authentication works.

## Configuration Options

| Environment Variable    | Description                       | Default Value                                |
|-------------------------|-----------------------------------|---------------------------------------------|
| PG_CONNECTION_STRING    | PostgreSQL connection string      | postgresql://user:password@localhost:5432/dbname |
| PG_READ_ONLY            | Enable read-only mode (true/false)| false                                       |
| ADMIN_USERNAME          | Basic auth username               | admin                                       |
| ADMIN_PASSWORD          | Basic auth password               | password123                                 |
| ROWS_PER_PAGE           | Rows per page in table view       | 25                                          |
| BASE_PATH               | Base URL path                     | Derived from mount point                    |

## Troubleshooting

### Connection Issues

If you cannot connect to your database:

1. Verify your PostgreSQL server is running
2. Check the connection string in your `.env` file
3. Ensure the database user has appropriate permissions
4. Test the connection directly with `psql`

### Common Database Connection Errors

| Error Message | Possible Solution |
|---------------|-------------------|
| `ECONNREFUSED` | Ensure PostgreSQL is running and accepting connections |
| `role "user" does not exist` | Create the user or use an existing one in your connection string |
| `password authentication failed` | Verify the password in your connection string |
| `database "dbname" does not exist` | Create the database or use an existing one |
| `could not determine data type of parameter $1` | This can occur when PostgreSQL cannot infer the type of a parameter. You can modify the code to use direct string interpolation instead of parameterized queries (with proper escaping for security) |

### Application Issues

- **404 Errors**: Ensure the mount path in `server.js` matches your URL
- **Empty Tables List**: Verify the user has access to the public schema
- **Authentication Problems**: Check the credentials in your `.env` file

## Security Considerations

- Use HTTPS in production environments
- Change default credentials
- Consider implementing additional security measures like rate limiting
- Be cautious when using direct SQL execution in production
- When using direct string interpolation instead of parameterized queries:
  - Always properly escape single quotes in string values using `value.replace(/'/g, "''")` 
  - Handle NULL values appropriately
  - Consider the trade-offs: parameterized queries are generally safer but may have type inference issues with certain PostgreSQL data types

## License

MIT License - free to use, modify, and distribute.
