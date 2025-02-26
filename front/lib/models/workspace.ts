import type { RoleType, WorkspaceSegmentationType } from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import type { Subscription } from "@app/lib/models/plan";
import { User } from "@app/lib/models/user";
import { frontSequelize } from "@app/lib/resources/storage";

export class Workspace extends Model<
  InferAttributes<Workspace>,
  InferCreationAttributes<Workspace>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare upgradedAt: Date | null;

  declare sId: string;
  declare name: string;
  declare description: string | null;
  declare segmentation: WorkspaceSegmentationType;
  declare ssoEnforced?: boolean;
  declare subscriptions: NonAttribute<Subscription[]>;
}
Workspace.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    upgradedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
    },
    segmentation: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ssoEnforced: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    modelName: "workspace",
    sequelize: frontSequelize,
    indexes: [{ unique: true, fields: ["sId"] }],
  }
);

export class WorkspaceHasDomain extends Model<
  InferAttributes<WorkspaceHasDomain>,
  InferCreationAttributes<WorkspaceHasDomain>
> {
  declare createdAt: CreationOptional<Date>;
  declare domain: string;
  declare domainAutoJoinEnabled: CreationOptional<boolean>;
  declare id: CreationOptional<number>;
  declare updatedAt: CreationOptional<Date>;

  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare workspace?: NonAttribute<Workspace>;
}
WorkspaceHasDomain.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    domainAutoJoinEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    domain: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "workspace_has_domains",
    sequelize: frontSequelize,
    indexes: [{ unique: true, fields: ["domain"] }],
  }
);
Workspace.hasMany(WorkspaceHasDomain, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
WorkspaceHasDomain.belongsTo(Workspace);

export class MembershipInvitation extends Model<
  InferAttributes<MembershipInvitation>,
  InferCreationAttributes<MembershipInvitation>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare inviteEmail: string;
  declare status: "pending" | "consumed" | "revoked";
  declare initialRole: Exclude<RoleType, "none">;

  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare invitedUserId: ForeignKey<User["id"]> | null;
}
MembershipInvitation.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    inviteEmail: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending",
    },
    initialRole: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "user",
    },
    invitedUserId: {
      type: DataTypes.INTEGER,
      references: {
        model: "users",
        key: "id",
      },
    },
  },
  {
    modelName: "membership_invitation",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId", "status"] },
      { unique: true, fields: ["sId"] },
    ],
  }
);
Workspace.hasMany(MembershipInvitation, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
User.hasMany(MembershipInvitation, {
  foreignKey: "invitedUserId",
});

export class Key extends Model<
  InferAttributes<Key>,
  InferCreationAttributes<Key>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare secret: string;
  declare status: "active" | "disabled";
  declare isSystem: boolean;

  declare userId: ForeignKey<User["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;

  declare user: NonAttribute<User>;
}
Key.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    secret: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    isSystem: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  },
  {
    modelName: "keys",
    sequelize: frontSequelize,
    indexes: [
      { unique: true, fields: ["secret"] },
      { fields: ["userId"] },
      { fields: ["workspaceId"] },
    ],
  }
);
Workspace.hasMany(Key, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
// We don't want to delete keys when a user gets deleted.
User.hasMany(Key, {
  foreignKey: { allowNull: true },
  onDelete: "SET NULL",
});
Key.belongsTo(User);
