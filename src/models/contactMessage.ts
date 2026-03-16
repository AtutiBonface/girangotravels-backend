const { DataTypes, Model } = require('sequelize');

class ContactMessage extends Model {
  declare id: string;
  declare name: string;
  declare email: string;
  declare phone: string | null;
  declare message: string;
  declare status: 'new' | 'contacted' | 'resolved';
  declare adminReply: string | null;
  declare repliedAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

function initContactMessage(sequelize: any) {
  ContactMessage.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('new', 'contacted', 'resolved'),
        allowNull: false,
        defaultValue: 'new',
      },
      adminReply: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      repliedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'contact_messages',
      modelName: 'ContactMessage',
      underscored: true,
    }
  );

  return ContactMessage;
}

module.exports = {
  ContactMessage,
  initContactMessage,
};
