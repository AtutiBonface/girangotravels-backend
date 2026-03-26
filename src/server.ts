const app = require('./app');
const { port } = require('./config/env');
const { sequelize } = require('./models');

async function startServer() {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: false });

    app.listen(port, '0.0.0.0', () => {
      console.log(`Backend listening on port ${port}`);
    });
  } catch (error: unknown) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
