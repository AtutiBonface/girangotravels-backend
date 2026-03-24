#!/bin/bash
# Migration runner for Girango Travels Backend
# This script runs pending migrations

set -e

echo "Running database migrations..."

cd "$(dirname "$0")"

# Import environment variables
export $(cat .env | grep -v '#' | xargs)

# Run migrations using Node
node -e "
const { Sequelize } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: console.log,
  dialectOptions: {}
});

async function runMigrations() {
  try {
    // Get list of migration files
    const fs = require('fs');
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).sort();

    for (const file of files) {
      if (!file.endsWith('.js')) continue;
      
      const migrationPath = path.join(migrationsDir, file);
      const migration = require(migrationPath);
      
      console.log(\`Running migration: \${file}\`);
      await migration.up(sequelize.getQueryInterface(), Sequelize);
      console.log(\`✓ Migration \${file} completed\`);
    }

    console.log('✓ All migrations completed successfully');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    await sequelize.close();
    process.exit(1);
  }
}

runMigrations();
"
