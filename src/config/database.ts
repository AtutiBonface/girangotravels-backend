const { Sequelize } = require('sequelize');
const { databaseUrl, env } = require('./env');

const sequelizeOptions = {
  dialect: 'postgres',
  logging: env === 'development' ? console.log : false,
  dialectOptions: env === 'production' ? { ssl: { require: true, rejectUnauthorized: false } } : {},
};

const sequelize = new Sequelize(databaseUrl, sequelizeOptions);

module.exports = sequelize;
