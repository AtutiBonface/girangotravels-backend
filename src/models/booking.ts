const { DataTypes, Model } = require('sequelize');

class Booking extends Model {
  declare id: string;
  declare userId: string;
  declare tourId: string;
  declare reservationCode: string;
  declare travelDate: string;
  declare travelers: number;
  declare specialRequests: string | null;
  declare status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  declare paymentStatus: 'unpaid' | 'partial' | 'paid';
  declare totalAmount: string;
  declare currency: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

function initBooking(sequelize: any) {
  Booking.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      reservationCode: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      travelDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      travelers: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1,
        },
      },
      specialRequests: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('pending', 'confirmed', 'cancelled', 'completed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      paymentStatus: {
        type: DataTypes.ENUM('unpaid', 'partial', 'paid'),
        allowNull: false,
        defaultValue: 'unpaid',
      },
      totalAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      currency: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'USD',
      },
    },
    {
      sequelize,
      tableName: 'bookings',
      modelName: 'Booking',
      underscored: true,
    }
  );

  return Booking;
}

module.exports = {
  Booking,
  initBooking,
};
