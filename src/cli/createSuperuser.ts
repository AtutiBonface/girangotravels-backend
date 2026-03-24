(async () => {
  try {
    // Import prompts for interactive CLI
    const prompts = require('prompts') as typeof import('prompts');
    const bcrypt = require('bcryptjs') as typeof import('bcryptjs');
    const { User } = require('../models');
    const sequelize = require('../config/database');

    // Authenticate database connection
    await sequelize.authenticate();
    console.log('✓ Database connected\n');

    // Prompt for user input
    const response = await prompts([
      {
        type: 'text',
        name: 'fullName',
        message: 'Full Name:',
        validate: (value: string) => value.length >= 2 ? true : 'Name must be at least 2 characters',
      },
      {
        type: 'text',
        name: 'email',
        message: 'Email Address:',
        validate: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? true : 'Invalid email format',
      },
      {
        type: 'password',
        name: 'password',
        message: 'Password:',
        validate: (value: string) => value.length >= 8 ? true : 'Password must be at least 8 characters',
      },
      {
        type: 'password',
        name: 'confirmPassword',
        message: 'Confirm Password:',
        validate: (value: string) => value.length >= 8 ? true : 'Password must be at least 8 characters',
      },
      {
        type: 'text',
        name: 'phoneNumber',
        message: 'Phone Number (optional):',
        validate: (value: string) => !value || value.length >= 6 ? true : 'Phone number must be at least 6 characters',
      },
      {
        type: 'text',
        name: 'country',
        message: 'Country (optional):',
      },
    ]);

    // Validate passwords match
    if (response.password !== response.confirmPassword) {
      console.error('✗ Passwords do not match');
      process.exit(1);
    }

    const { fullName, email, password, phoneNumber, country } = response;

    // Check if user already exists
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      console.error(`✗ User with email "${email}" already exists`);
      process.exit(1);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create superuser
    const user = await User.create({
      fullName,
      email,
      passwordHash,
      phoneNumber: phoneNumber || null,
      country: country || null,
      role: 'admin',
    });

    console.log('\n✓ Superuser created successfully!');
    console.log(`
  Email: ${user.email}
  Full Name: ${user.fullName}
  Role: ${user.role}
  ID: ${user.id}
    `);

    process.exit(0);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`✗ Error: ${error.message}`);
    } else {
      console.error('✗ An unknown error occurred');
    }
    process.exit(1);
  }
})();
