'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add 'resolved' to the booking status enum
    await queryInterface.sequelize.query(
      `ALTER TYPE enum_bookings_status ADD VALUE 'resolved' AFTER 'completed'`
    );
  },

  async down(queryInterface, Sequelize) {
    // NOTE: PostgreSQL doesn't support removing enum values
    // This migration cannot be rolled back without dropping and recreating the enum
    // To rollback, you would need to manually handle it
    console.log('WARNING: Rollback for enum migration is not supported in PostgreSQL');
  }
};
