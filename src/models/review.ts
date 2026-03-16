const { DataTypes, Model } = require('sequelize');

class Review extends Model {
  declare id: string;
  declare customerName: string;
  declare customerEmail: string | null;
  declare rating: number;
  declare comment: string;
  declare status: 'pending' | 'approved' | 'rejected';
  declare approvedAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

function initReview(sequelize: any) {
  Review.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      customerName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      customerEmail: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isEmail: true,
        },
      },
      rating: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1,
          max: 5,
        },
      },
      comment: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
      },
      approvedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'reviews',
      modelName: 'Review',
      underscored: true,
    }
  );

  return Review;
}

module.exports = {
  Review,
  initReview,
};
