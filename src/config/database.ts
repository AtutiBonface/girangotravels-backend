const { Sequelize } = require('sequelize');
const { databaseUrl, env } = require('./env');

if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(databaseUrl)) {
  throw new Error(
    'Invalid DATABASE_URL format. Expected a full URL like postgres://username:password@host:5432/database_name',
  );
}

const sequelizeOptions = {
  dialect: 'postgres',
  logging: env === 'development' ? console.log : false,
  dialectOptions: env === 'production' ? { ssl: { require: true, rejectUnauthorized: false } } : {},
};

const sequelize = new Sequelize(databaseUrl, sequelizeOptions);

module.exports = sequelize;
