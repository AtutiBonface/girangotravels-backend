const { DataTypes, Model } = require('sequelize');

class AuditLog extends Model {
  declare id: string;
  declare action: string;
  declare entityType: string;
  declare entityId: string | null;
  declare actorUserId: string | null;
  declare actorName: string | null;
  declare actorEmail: string | null;
  declare actorRole: 'customer' | 'admin' | null;
  declare ipAddress: string | null;
  declare userAgent: string | null;
  declare details: Record<string, unknown>;
  declare createdAt: Date;
  declare updatedAt: Date;
}

function initAuditLog(sequelize: any) {
  AuditLog.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      action: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      entityType: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      entityId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      actorUserId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      actorName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      actorEmail: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      actorRole: {
        type: DataTypes.ENUM('customer', 'admin'),
        allowNull: true,
      },
      ipAddress: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      userAgent: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      details: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
    },
    {
      sequelize,
      tableName: 'audit_logs',
      modelName: 'AuditLog',
      underscored: true,
    }
  );

  return AuditLog;
}

module.exports = {
  AuditLog,
  initAuditLog,
};
