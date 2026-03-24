#!/usr/bin/env node

/**
 * Migration Runner for Girango Travels Backend
 * Usage: node migrate.js
 */

const path = require('path');
const fs = require('fs');
const { Sequelize } = require('sequelize');

// Load environment variables
require('dotenv').config();


async function runMigrations() {
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable not set');
    process.exit(1);
  }
  
  const sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    logging: console.log,
  });

  try {
    console.log('🔄 Starting database migrations...\n');

    // Verify database connection
    await sequelize.authenticate();
    console.log('✓ Database connection established\n');

    // Get list of migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js')).sort();

    if (files.length === 0) {
      console.log('✓ No migrations to run');
      await sequelize.close();
      return;
    }

    const queryInterface = sequelize.getQueryInterface();

    for (const file of files) {
      const migrationPath = path.join(migrationsDir, file);
      const migration = require(migrationPath);

      console.log(`📦 Running: ${file}`);
      
      try {
        await migration.up(queryInterface, Sequelize);
        console.log(`✓ ${file} completed\n`);
      } catch (error) {
        // Ignore duplicate enum value error (already exists)
        if (error.message.includes('duplicate') || error.message.includes('already exists')) {
          console.log(`✓ ${file} (already applied)\n`);
        } else {
          throw error;
        }
      }
    }

      runMigrations();
    console.log('✅ All migrations completed successfully');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    await sequelize.close();
    process.exit(1);
  }
}

runMigrations();
