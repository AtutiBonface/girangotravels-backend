#!/usr/bin/env node

const { Client } = require('pg');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ DATABASE_URL environment variable not set');
  process.exit(1);
}

async function migrate() {
  const client = new Client({ connectionString: databaseUrl });
  
  try {
    console.log('🔄 Connecting to database...');
    await client.connect();
    console.log('✓ Connected\n');

    // Add 'resolved' to booking status enum
    console.log('📦 Adding "resolved" to booking status enum...');
    try {
      await client.query(
        `ALTER TYPE enum_bookings_status ADD VALUE 'resolved' AFTER 'completed'`
      );
      console.log('✓ Added "resolved" to enum_bookings_status\n');
    } catch (error) {
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        console.log('✓ Value "resolved" already exists in enum\n');
      } else {
        throw error;
      }
    }

    console.log('✅ Migration completed successfully');
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.detail || '');
    await client.end();
    process.exit(1);
  }
}

migrate();
