const { DataTypes, Model } = require('sequelize');

class ReviewInvitation extends Model {
  declare id: string;
  declare tokenHash: string;
  declare bookingId: string;
  declare tourId: string;
  declare customerEmail: string;
  declare customerName: string;
  declare expiresAt: Date;
  declare sentAt: Date | null;
  declare usedAt: Date | null;
  declare submittedReviewId: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

function initReviewInvitation(sequelize: any) {
  ReviewInvitation.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      tokenHash: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      bookingId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      tourId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      customerEmail: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isEmail: true,
        },
      },
      customerName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      sentAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      usedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      submittedReviewId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'review_invitations',
      modelName: 'ReviewInvitation',
      underscored: true,
      indexes: [
        {
          fields: ['tour_id', 'customer_email'],
        },
      ],
    }
  );

  return ReviewInvitation;
}

module.exports = {
  ReviewInvitation,
  initReviewInvitation,
};
