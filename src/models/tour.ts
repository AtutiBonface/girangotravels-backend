const { DataTypes, Model } = require('sequelize');

class Tour extends Model {
  declare id: string;
  declare title: string;
  declare destination: string;
  declare duration: string;
  declare price: string;
  declare currency: string;
  declare description: string;
  declare includedServices: string[];
  declare excludedServices: string[];
  declare images: string[];
  declare isActive: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;
}

function initTour(sequelize: any) {
  Tour.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      destination: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      duration: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      price: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      currency: {
        type: DataTypes.STRING,
        defaultValue: 'USD',
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      includedServices: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      excludedServices: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      images: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      sequelize,
      tableName: 'tours',
      modelName: 'Tour',
      underscored: true,
    }
  );

  return Tour;
}

module.exports = {
  Tour,
  initTour,
};
