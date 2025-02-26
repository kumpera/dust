import type {
  AgentMessageStatus,
  ConversationVisibility,
  MessageVisibility,
  ParticipantActionType,
} from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { AgentDustAppRunAction } from "@app/lib/models/assistant/actions/dust_app_run";
import { AgentProcessAction } from "@app/lib/models/assistant/actions/process";
import { AgentRetrievalAction } from "@app/lib/models/assistant/actions/retrieval";
import { AgentTablesQueryAction } from "@app/lib/models/assistant/actions/tables_query";
import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";

export class Conversation extends Model<
  InferAttributes<Conversation>,
  InferCreationAttributes<Conversation>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare title: string | null;
  declare visibility: CreationOptional<ConversationVisibility>;

  declare workspaceId: ForeignKey<Workspace["id"]>;
}

Conversation.init(
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
    title: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    visibility: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "unlisted",
    },
  },
  {
    modelName: "conversation",
    indexes: [
      {
        unique: true,
        fields: ["sId"],
      },
    ],
    sequelize: frontSequelize,
  }
);

Workspace.hasMany(Conversation, {
  foreignKey: { name: "workspaceId", allowNull: false },
  onDelete: "CASCADE",
});

Conversation.belongsTo(Workspace, {
  foreignKey: { name: "workspaceId", allowNull: false },
});

export class ConversationParticipant extends Model<
  InferAttributes<ConversationParticipant>,
  InferCreationAttributes<ConversationParticipant>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare action: ParticipantActionType;

  declare conversationId: ForeignKey<Conversation["id"]>;
  declare userId: ForeignKey<User["id"]>;

  declare conversation?: NonAttribute<Conversation>;
  declare user?: NonAttribute<User>;
}
ConversationParticipant.init(
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
    action: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "conversation_participant",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["userId"],
      },
      {
        fields: ["userId", "conversationId"],
        unique: true,
      },
    ],
  }
);
Conversation.hasMany(ConversationParticipant, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "CASCADE",
});
ConversationParticipant.belongsTo(Conversation, {
  foreignKey: { name: "conversationId", allowNull: false },
});
User.hasMany(ConversationParticipant, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "CASCADE",
});
ConversationParticipant.belongsTo(User, {
  foreignKey: { name: "userId", allowNull: false },
});

export class UserMessage extends Model<
  InferAttributes<UserMessage>,
  InferCreationAttributes<UserMessage>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare content: string;

  declare userContextUsername: string;
  declare userContextTimezone: string;
  declare userContextFullName: string | null;
  declare userContextEmail: string | null;
  declare userContextProfilePictureUrl: string | null;

  declare userId: ForeignKey<User["id"]> | null;
}

UserMessage.init(
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
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    userContextUsername: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userContextTimezone: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userContextFullName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userContextEmail: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userContextProfilePictureUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "user_message",
    sequelize: frontSequelize,
  }
);

User.hasMany(UserMessage, {
  foreignKey: { name: "userId", allowNull: true }, // null = message is not associated with a user
});
UserMessage.belongsTo(User, {
  foreignKey: { name: "userId", allowNull: true },
});

export class AgentMessage extends Model<
  InferAttributes<AgentMessage>,
  InferCreationAttributes<AgentMessage>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare status: CreationOptional<AgentMessageStatus>;

  declare content: string | null;
  declare errorCode: string | null;
  declare errorMessage: string | null;

  declare agentRetrievalActionId: ForeignKey<AgentRetrievalAction["id"]> | null;
  declare agentDustAppRunActionId: ForeignKey<
    AgentDustAppRunAction["id"]
  > | null;
  declare agentTablesQueryActionId: ForeignKey<
    AgentTablesQueryAction["id"]
  > | null;
  declare agentProcessActionId: ForeignKey<AgentTablesQueryAction["id"]> | null;

  // Not a relation as global agents are not in the DB
  // needs both sId and version to uniquely identify the agent configuration
  declare agentConfigurationId: string;
  declare agentConfigurationVersion: number;
}

AgentMessage.init(
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
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "created",
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    errorCode: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    agentConfigurationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    agentConfigurationVersion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    modelName: "agent_message",
    indexes: [
      {
        unique: true,
        fields: ["agentRetrievalActionId"],
      },
    ],
    sequelize: frontSequelize,
    hooks: {
      beforeValidate: (agentMessage: AgentMessage) => {
        const actionsTypes: (keyof AgentMessage)[] = [
          "agentRetrievalActionId",
          "agentDustAppRunActionId",
          "agentTablesQueryActionId",
          "agentProcessActionId",
        ];
        const nonNullActionTypes = actionsTypes.filter(
          (field) => agentMessage[field] != null
        );
        if (nonNullActionTypes.length > 1) {
          throw new Error(
            "Only one of agentRetrievalActionId, agentDustAppRunActionId or agentTablesQueryActionId can be set"
          );
        }
      },
    },
  }
);

AgentRetrievalAction.hasOne(AgentMessage, {
  foreignKey: { name: "agentRetrievalActionId", allowNull: true }, // null = no Retrieval action set for this Agent
  onDelete: "CASCADE",
});
AgentMessage.belongsTo(AgentRetrievalAction, {
  foreignKey: { name: "agentRetrievalActionId", allowNull: true }, // null = no Retrieval action set for this Agent
});

AgentDustAppRunAction.hasOne(AgentMessage, {
  foreignKey: { name: "agentDustAppRunActionId", allowNull: true }, // null = no DustAppRun action set for this Agent
  onDelete: "CASCADE",
});
AgentMessage.belongsTo(AgentDustAppRunAction, {
  foreignKey: { name: "agentDustAppRunActionId", allowNull: true }, // null = no DustAppRun action set for this Agent
});

AgentTablesQueryAction.hasOne(AgentMessage, {
  foreignKey: { name: "agentTablesQueryActionId", allowNull: true }, // null = no TablesQuery action set for this Agent
  onDelete: "CASCADE",
});
AgentMessage.belongsTo(AgentTablesQueryAction, {
  foreignKey: { name: "agentTablesQueryActionId", allowNull: true }, // null = no TablesQuery action set for this Agent
});

AgentProcessAction.hasOne(AgentMessage, {
  foreignKey: { name: "agentProcessActionId", allowNull: true }, // null = no Process action set for this Agent
  onDelete: "CASCADE",
});
AgentMessage.belongsTo(AgentProcessAction, {
  foreignKey: { name: "agentProcessActionId", allowNull: true }, // null = no Process action set for this Agent
});

export class Message extends Model<
  InferAttributes<Message>,
  InferCreationAttributes<Message>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;

  declare version: CreationOptional<number>;
  declare rank: number;
  declare visibility: CreationOptional<MessageVisibility>;

  declare conversationId: ForeignKey<Conversation["id"]>;

  declare parentId: ForeignKey<Message["id"]> | null;
  declare userMessageId: ForeignKey<UserMessage["id"]> | null;
  declare agentMessageId: ForeignKey<AgentMessage["id"]> | null;
  declare contentFragmentId: ForeignKey<ContentFragmentModel["id"]> | null;

  declare userMessage?: NonAttribute<UserMessage>;
  declare agentMessage?: NonAttribute<AgentMessage>;
  declare contentFragment?: NonAttribute<ContentFragmentModel>;
  declare reactions?: NonAttribute<MessageReaction[]>;
}

Message.init(
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
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    visibility: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "visible",
    },
    rank: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    modelName: "message",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        fields: ["sId"],
      },
      {
        unique: true,
        fields: ["conversationId", "rank", "version"],
      },
    ],
    hooks: {
      beforeValidate: (message) => {
        if (
          Number(!!message.userMessageId) +
            Number(!!message.agentMessageId) +
            Number(!!message.contentFragmentId) !==
          1
        ) {
          throw new Error(
            "Exactly one of userMessageId, agentMessageId, contentFragmentId must be non-null"
          );
        }
      },
    },
  }
);

Conversation.hasMany(Message, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "CASCADE",
});
Message.belongsTo(Conversation, {
  as: "conversation",
  foreignKey: { name: "conversationId", allowNull: false },
});

UserMessage.hasOne(Message, {
  as: "userMessage",
  foreignKey: { name: "userMessageId", allowNull: true },
});
Message.belongsTo(UserMessage, {
  as: "userMessage",
  foreignKey: { name: "userMessageId", allowNull: true },
});

AgentMessage.hasOne(Message, {
  as: "agentMessage",
  foreignKey: { name: "agentMessageId", allowNull: true },
});
Message.belongsTo(AgentMessage, {
  as: "agentMessage",
  foreignKey: { name: "agentMessageId", allowNull: true },
});

Message.belongsTo(Message, {
  foreignKey: { name: "parentId", allowNull: true },
});
ContentFragmentModel.hasOne(Message, {
  as: "contentFragment",
  foreignKey: { name: "contentFragmentId", allowNull: true },
});
Message.belongsTo(ContentFragmentModel, {
  as: "contentFragment",
  foreignKey: { name: "contentFragmentId", allowNull: true },
});

export class MessageReaction extends Model<
  InferAttributes<MessageReaction>,
  InferCreationAttributes<MessageReaction>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare messageId: ForeignKey<Message["id"]>;

  // User is nullable so that we can store reactions from a Slackbot message
  declare userId: ForeignKey<User["id"]> | null;
  declare userContextUsername: string;
  declare userContextFullName: string | null;

  declare reaction: string;
}

MessageReaction.init(
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
    userContextUsername: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userContextFullName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    reaction: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "message_reaction",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        fields: ["messageId", "reaction", "userContextUsername"], // Not perfect as that means that a user and slack user with the same username can't react with the same emoji, but that's an edge case.
      },
      { fields: ["messageId"] },
    ],
  }
);

Message.hasMany(MessageReaction, {
  as: "reactions",
  foreignKey: { name: "messageId", allowNull: false },
  onDelete: "CASCADE",
});
MessageReaction.belongsTo(Message, {
  foreignKey: { name: "messageId", allowNull: false },
});
User.hasMany(MessageReaction, {
  foreignKey: { name: "userId", allowNull: true }, // null = mention is from a user using a Slackbot
});
MessageReaction.belongsTo(User, {
  foreignKey: { name: "userId", allowNull: true }, // null = mention is not a user using a Slackbot
});

export class Mention extends Model<
  InferAttributes<Mention>,
  InferCreationAttributes<Mention>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare messageId: ForeignKey<Message["id"]>;
  declare userId: ForeignKey<User["id"]> | null;
  declare agentConfigurationId: string | null; // Not a relation as global agents are not in the DB

  declare message: NonAttribute<Message>;
  declare user?: NonAttribute<User>;
}

Mention.init(
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
    agentConfigurationId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "mention",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["messageId"],
      },
      {
        fields: ["agentConfigurationId", "createdAt"],
      },
    ],
  }
);

Message.hasMany(Mention, {
  foreignKey: { name: "messageId", allowNull: false },
  onDelete: "CASCADE",
});
Mention.belongsTo(Message, {
  foreignKey: { name: "messageId", allowNull: false },
});

User.hasMany(Mention, {
  foreignKey: { name: "userId", allowNull: true }, // null = mention is not a user mention
});
Mention.belongsTo(User, {
  foreignKey: { name: "userId", allowNull: true }, // null = mention is not a user mention
});
