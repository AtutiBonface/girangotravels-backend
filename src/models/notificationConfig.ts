const { DataTypes, Model } = require('sequelize');

class NotificationConfig extends Model {
  declare id: string;
  declare notificationType: 'booking' | 'contact' | 'payment';
  declare recipientEmails: string[];
  declare ccEmails: string[];
  declare bccEmails: string[];
  declare recipientPhones: string[];
  declare enableEmail: boolean;
  declare enableSMS: boolean;
  declare enableWhatsapp: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;
}

function initNotificationConfig(sequelize: any) {
  NotificationConfig.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      notificationType: {
        type: DataTypes.ENUM('booking', 'contact', 'payment'),
        allowNull: false,
      },
      recipientEmails: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
        defaultValue: [],
      },
      ccEmails: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
        defaultValue: [],
      },
      bccEmails: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
        defaultValue: [],
      },
      recipientPhones: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
        defaultValue: [],
        comment: 'Phone numbers for SMS/WhatsApp in E.164 format (e.g., +254700000000)',
      },
      enableEmail: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      enableSMS: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      enableWhatsapp: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      sequelize,
      tableName: 'notification_configs',
      modelName: 'NotificationConfig',
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['notification_type'],
        },
      ],
    }
  );

  return NotificationConfig;
}

module.exports = {
  NotificationConfig,
  initNotificationConfig,
};
