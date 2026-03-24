const sequelize = require('../config/database');
const { User, initUser } = require('./user');
const { Tour, initTour } = require('./tour');
const { Booking, initBooking } = require('./booking');
const { Payment, initPayment } = require('./payment');
const { ContactMessage, initContactMessage } = require('./contactMessage');
const { Review, initReview } = require('./review');
const { AuditLog, initAuditLog } = require('./auditLog');
const { NotificationConfig, initNotificationConfig } = require('./notificationConfig');

initUser(sequelize);
initTour(sequelize);
initBooking(sequelize);
initPayment(sequelize);
initContactMessage(sequelize);
initReview(sequelize);
initAuditLog(sequelize);
initNotificationConfig(sequelize);

User.hasMany(Booking, { foreignKey: 'userId' });
Booking.belongsTo(User, { foreignKey: 'userId' });

Tour.hasMany(Booking, { foreignKey: 'tourId' });
Booking.belongsTo(Tour, { foreignKey: 'tourId' });

Booking.hasMany(Payment, { foreignKey: 'bookingId' });
Payment.belongsTo(Booking, { foreignKey: 'bookingId' });

User.hasMany(AuditLog, { foreignKey: 'actorUserId', as: 'auditLogs' });
AuditLog.belongsTo(User, { foreignKey: 'actorUserId', as: 'actor' });

module.exports = {
  sequelize,
  User,
  Tour,
  Booking,
  Payment,
  ContactMessage,
  Review,
  AuditLog,
  NotificationConfig,
};
