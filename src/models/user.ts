const { DataTypes, Model } = require('sequelize');

class User extends Model {
  declare id: string;
  declare fullName: string;
  declare email: string;
  declare passwordHash: string;
  declare phoneNumber: string | null;
  declare country: string | null;
  declare role: 'customer' | 'admin';
  declare createdAt: Date;
  declare updatedAt: Date;
}

function initUser(sequelize: any) {
  User.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      fullName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
      },
      passwordHash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      phoneNumber: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      country: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      role: {
        type: DataTypes.ENUM('customer', 'admin'),
        allowNull: false,
        defaultValue: 'customer',
      },
    },
    {
      sequelize,
      tableName: 'users',
      modelName: 'User',
      underscored: true,
    }
  );

  return User;
}

module.exports = {
  User,
  initUser,
};
