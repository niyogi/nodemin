# Nodemin

Nodemin is a lightweight Node.js module for managing PostgreSQL databases through a web interface. It provides a simple alternative to tools like Adminer, with features like table listing, row viewing/editing, searching, pagination, and schema inspection.

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
- An existing Express application

## Installation
1. **Create a new project or use an existing one**:
   ```bash
   mkdir my-nodemin-app
   cd my-nodemin-app
   npm init -y