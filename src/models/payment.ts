const { DataTypes, Model } = require('sequelize');

class Payment extends Model {
  declare id: string;
  declare bookingId: string;
  declare provider: 'mpesa' | 'visa' | 'mastercard' | 'paystack';
  declare amount: string;
  declare currency: string;
  declare status: 'initiated' | 'successful' | 'failed';
  declare transactionRef: string | null;
  declare metadata: Record<string, unknown>;
  declare createdAt: Date;
  declare updatedAt: Date;
  declare Booking?: any;
}

function initPayment(sequelize: any) {
  Payment.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      provider: {
        type: DataTypes.ENUM('mpesa', 'visa', 'mastercard', 'paystack'),
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      currency: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'KES',
      },
      status: {
        type: DataTypes.ENUM('initiated', 'successful', 'failed'),
        allowNull: false,
        defaultValue: 'initiated',
      },
      transactionRef: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
    },
    {
      sequelize,
      tableName: 'payments',
      modelName: 'Payment',
      underscored: true,
    }
  );

  return Payment;
}

module.exports = {
  Payment,
  initPayment,
};
